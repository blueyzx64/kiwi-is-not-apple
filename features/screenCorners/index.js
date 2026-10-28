// SPDX-License-Identifier: GPL-3.0-or-later
// Screen corners (features.js id 'screen-corners', key `screen-corners`): the MacBook display's
// rounded corners, in software. A black cap in the top corners of every monitor (or all four,
// `screen-corners-which`), radius `screen-corners-radius`; see model.js for the geometry.
//
// The caps are hardware, not UI: they sit on the stage itself, above Main.layoutManager.uiGroup,
// so the top bar, menus, the notch, modal dialogs and full-screen windows all pass under them,
// and they take no input (not reactive: clicks reach whatever is under them). They follow
// monitors-changed and their settings. Disable destroys every cap and disconnects everything.
//
// Shell API: global.stage, Main.layoutManager (monitors, uiGroup, monitors-changed),
// St.DrawingArea (repaint, get_context, get_surface_size).

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { KiwiSettings } from '../../lib/settings.js';
import { CleanupRegistry } from '../../lib/disposables.js';
import { clampRadius, cornerCaps } from './model.js';

const KEYS = ['screen-corners-radius', 'screen-corners-which'];

export class ScreenCorners {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._caps = null;       // CleanupRegistry of the current caps
    }

    enable() {
        const ks = new KiwiSettings(this._ctx.settings);
        ks.attach(this._cleanup);
        this._ks = ks;
        ks.watch(KEYS, () => this._build());
        this._cleanup.connect(Main.layoutManager, 'monitors-changed', () => this._build());
        this._cleanup.add(() => {
            this._caps?.dispose();
            this._caps = null;
        });
        this._build();
    }

    disable() {
        // Everything is in the cleanup registry, disposed right after this
    }

    _build() {
        this._caps?.dispose();
        const caps = this._caps = new CleanupRegistry();
        const radius = clampRadius(this._ks.int('screen-corners-radius'));
        const which = this._ks.string('screen-corners-which');
        for (const monitor of Main.layoutManager.monitors) {
            for (const cap of cornerCaps(monitor, radius, which)) {
                const area = caps.actor(new St.DrawingArea({
                    name: `kiwi-screen-corner-${cap.corner}`,
                    reactive: false,
                    x: cap.x, y: cap.y, width: cap.size, height: cap.size,
                }));
                area.connect('repaint', () => paint(area, cap));
                global.stage.add_child(area);
                global.stage.set_child_above_sibling(area, null);
            }
        }
    }
}

/**
 * The area of the square outside the quarter circle, in black. Drawn for the top-left corner
 * and mirrored into the others.
 */
function paint(area, cap) {
    const cr = area.get_context();
    const [w, h] = area.get_surface_size();
    if (cap.flipX) {
        cr.translate(w, 0);
        cr.scale(-1, 1);
    }
    if (cap.flipY) {
        cr.translate(0, h);
        cr.scale(1, -1);
    }
    cr.setSourceRGBA(0, 0, 0, 1);
    cr.moveTo(0, 0);
    cr.lineTo(w, 0);
    // From the top edge round to the left edge, the arc bulging into the corner
    cr.arcNegative(w, h, w, -Math.PI / 2, -Math.PI);
    cr.closePath();
    cr.fill();
    cr.$dispose();
}
