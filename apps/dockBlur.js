// SPDX-License-Identifier: GPL-3.0-or-later
// Adds a blur effect behind Dash-to-Dock / Ubuntu Dock background.
// Approach based on blur-my-shell: insert blur inside the dock's own actor tree,
// sized to the dash-background pill, with event-driven repaints.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import { Glass } from '../lib/glass.js';
import { dashOf, dockContainers } from './dockUtils.js';

// The blur itself (effect, repaint workarounds, Liquid Glass tiers, legacy dock-blur
// key) is lib/glass.js. This module finds the dash background and keeps the glass
// rectangle matched to it.

let enabled = false;
let dockSearchId = null;
const dashes = []; // array of per-dash state objects

function _hasValidAllocation(actor) {
    return actor.has_allocation() && actor.width > 0 && actor.height > 0;
}

function _tryBlurDock(dockContainer) {
    const dash = dashOf(dockContainer);
    if (!dash) return;
    const dashBox = dash.get_parent();

    // Already blurred this dash?
    if (dashes.some(info => info.dash === dash))
        return;

    // Find the dash-background (the translucent pill)
    const dashBackground = dash.get_children().find(c =>
        c.get_style_class_name()?.includes('dash-background')
    );
    if (!dashBackground) return;

    // layers: 'blur' - Dash to Dock keeps painting the tint. The geometry is ours.
    const handle = Glass.attach(dashBackground, {
        surface: 'dock',
        parent: dashBox,
        layers: 'blur',
        follow: false,
        name: 'kiwi-dock-blur',
    });

    // Size and position the blur widget to match the dash-background
    let lastRect = null;
    const updateSize = () => {
        // Before an actor is allocated, width/height report the *natural* size
        // instead of the allocation — for the dash-background that is a few
        // pixels tall, which is where the slim blur strip came from. Wait for a
        // real allocation instead of baking in the wrong geometry.
        if (!_hasValidAllocation(dash) || !_hasValidAllocation(dashBackground)) {
            retryUpdateSize();
            return;
        }
        const w = dashBackground.width;
        const h = dashBackground.height;
        const x = dashBackground.x;
        const y = dashBackground.y + dash.y;
        retryAttempts = 0;

        // The dock notifies through a dozen signals and re-emits them for every
        // frame it slides or zooms; re-rendering the blur is only worth it when
        // the geometry it is cut to actually moved
        if (lastRect && lastRect.x === x && lastRect.y === y &&
            lastRect.w === w && lastRect.h === h)
            return;
        lastRect = { x, y, w, h };

        handle.setRect(x, y, w, h);
    };

    // Resizing our widgets straight from a layout notification re-enters the
    // layout phase and makes the shell warn about actors needing an
    // allocation. Defer with a compositor later: a GLib idle has a higher
    // priority than the relayout, so it would run before the allocation it is
    // waiting for.
    let updateLaterId = 0;
    const queueUpdateSize = () => {
        if (updateLaterId) return;
        updateLaterId = global.compositor.get_laters().add(Meta.LaterType.IDLE, () => {
            updateLaterId = 0;
            updateSize();
            return GLib.SOURCE_REMOVE;
        });
    };

    // A relayout that ends up with the same allocation emits no notify, so a
    // read taken too early would never be corrected — retry until allocated.
    let retryId = 0;
    let retryAttempts = 0;
    const retryUpdateSize = () => {
        if (retryId || retryAttempts >= 25) return;
        retryAttempts++;
        retryId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
            retryId = 0;
            queueUpdateSize();
            return GLib.SOURCE_REMOVE;
        });
    };
    queueUpdateSize();

    // Allocation signals catch geometry settling that the x/y/width/height
    // notifications can miss (dock created mid-layout, resume from sleep).
    const watched = [
        [dash, ['allocation', 'width', 'height', 'x', 'y']],
        [dashBackground, ['allocation', 'width', 'height', 'x', 'y']],
        [dockContainer, ['width', 'height']],
    ];
    const signals = [];
    for (const [actor, properties] of watched) {
        for (const property of properties)
            signals.push({ actor, id: actor.connect(`notify::${property}`, queueUpdateSize) });
    }

    const info = {
        dash,
        handle,
        signals,
        destroyId: null,
        cancelUpdate: () => {
            if (updateLaterId) {
                global.compositor.get_laters().remove(updateLaterId);
                updateLaterId = 0;
            }
            if (retryId) {
                GLib.Source.remove(retryId);
                retryId = 0;
            }
        },
    };

    // Auto-cleanup if the dash is destroyed (user disables dock extension)
    info.destroyId = dash.connect('destroy', () => _removeDashBlur(info, false));

    dashes.push(info);
}

function _removeDashBlur(info, disconnectDestroy = true) {
    info.cancelUpdate();

    // Disconnect size signals
    for (const { actor, id } of info.signals)
        actor.disconnect(id);

    if (disconnectDestroy)
        info.dash.disconnect(info.destroyId);

    // Remove the glass layer from the dock tree
    info.handle.destroy();

    // Remove from dashes array
    const idx = dashes.indexOf(info);
    if (idx >= 0) dashes.splice(idx, 1);
}

function _blurExistingDocks() {
    dockContainers().forEach(container => _tryBlurDock(container));
}

function _removeAllBlurs() {
    // Copy array since _removeDashBlur mutates it
    [...dashes].forEach(info => _removeDashBlur(info));
}

let childAddedId = null;
let startupCompleteId = null;

export function enable() {
    // Every settings change re-runs this; a second pass would connect another
    // child-added handler over the one we hold and leave it connected for good
    if (enabled)
        return;
    enabled = true;

    // During shell startup the dock geometry is unreliable (startup animation,
    // layout not settled) — blurring then yields a mis-sized blur bar.
    // Defer until startup completes, like blur-my-shell does.
    if (Main.layoutManager._startingUp) {
        startupCompleteId = Main.layoutManager.connect('startup-complete', () => {
            Main.layoutManager.disconnect(startupCompleteId);
            startupCompleteId = null;
            _enable();
        });
        return;
    }
    _enable();
}

function _enable() {
    // Watch for new dock containers being added (e.g., dock enabled after us)
    childAddedId = Main.uiGroup.connect('child-added', (_group, actor) => {
        if (actor.name === 'dashtodockContainer')
            _tryBlurDock(actor);
    });

    // Blur any already-existing docks
    _blurExistingDocks();

    // If no docks found yet, retry a few times (dock may load after us)
    if (dashes.length === 0) {
        let attempts = 0;
        dockSearchId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            attempts++;
            _blurExistingDocks();
            if (dashes.length > 0 || attempts >= 10) {
                dockSearchId = null;
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }
}

export function disable() {
    enabled = false;

    if (startupCompleteId) {
        Main.layoutManager.disconnect(startupCompleteId);
        startupCompleteId = null;
    }

    if (dockSearchId) {
        GLib.Source.remove(dockSearchId);
        dockSearchId = null;
    }

    if (childAddedId) {
        Main.uiGroup.disconnect(childAddedId);
        childAddedId = null;
    }

    _removeAllBlurs();
}
