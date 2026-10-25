// SPDX-License-Identifier: GPL-3.0-or-later
// Adds a blur effect behind Dash-to-Dock / Ubuntu Dock background.
// Approach based on blur-my-shell: insert blur inside the dock's own actor tree,
// sized to the dash-background pill, with event-driven repaints.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import { Glass } from '../lib/glass.js';
import { boundedRetry } from './dockRetry.js';
import { dashOf, disconnectAll, glibTimers, watchDocks } from './dockUtils.js';

// The blur itself (effect, repaint workarounds, Liquid Glass tiers, legacy dock-blur
// key) is lib/glass.js. This module finds the dash background and keeps the glass
// rectangle matched to it.

let enabled = false;
const dashes = []; // array of per-dash state objects
let globalSignals = []; // [object, id], for disconnectAll
const sources = { dockSearch: 0 };

// Waiting for the dash and its background to be allocated
const ALLOCATION_RETRY_INTERVAL = 200; // ms
const ALLOCATION_RETRY_TRIES = 25;     // ~5 s

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
            retry.start();
            return;
        }
        const w = dashBackground.width;
        const h = dashBackground.height;
        const x = dashBackground.x;
        const y = dashBackground.y + dash.y;
        retry.stop();

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
    // read taken too early would never be corrected - retry until allocated.
    const retry = boundedRetry({
        interval: ALLOCATION_RETRY_INTERVAL,
        tries: ALLOCATION_RETRY_TRIES,
        timers: glibTimers(),
        step: () => {
            queueUpdateSize();
            return _hasValidAllocation(dash) && _hasValidAllocation(dashBackground);
        },
    });
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
            retry.stop();
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

function _removeAllBlurs() {
    // Copy array since _removeDashBlur mutates it
    [...dashes].forEach(info => _removeDashBlur(info));
}

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
    // Blur every dock there is and every one that turns up later (the dock may
    // load after us), retrying for a while
    watchDocks({ attach: _tryBlurDock, count: () => dashes.length, globalSignals, sources });
}

export function disable() {
    enabled = false;

    if (startupCompleteId) {
        Main.layoutManager.disconnect(startupCompleteId);
        startupCompleteId = null;
    }

    if (sources.dockSearch) {
        GLib.Source.remove(sources.dockSearch);
        sources.dockSearch = 0;
    }

    disconnectAll(globalSignals);
    globalSignals = [];

    _removeAllBlurs();
}
