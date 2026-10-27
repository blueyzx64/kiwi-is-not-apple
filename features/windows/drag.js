// SPDX-License-Identifier: GPL-3.0-or-later
// Drag tiling (macOS 15): while a window is dragged by its title bar, the zone under the
// pointer (model.js hitZone: edges, corners, the menu bar, or anywhere near a side while Alt is
// held) shows a translucent faux-glass outline of the tile, behind the dragged window.
// Releasing over it tiles the window. Dragging a tiled window away gives it back its
// pre-tile size first.
//
// At an edge the outline waits a beat (DWELL_MS) against accidental tiling, as on macOS; with
// the modifier it shows at once. Pointer tracking only runs while a move grab is active: the
// dragged window's position-changed (once per move), nothing per frame.
//
// Shell API: global.display grab-op-begin / grab-op-end (Meta.GrabOp), global.get_pointer(),
// global.display.get_current_monitor(), global.window_group (the preview sits just below the
// dragged window's actor), Main.layoutManager.monitors.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { CleanupRegistry } from '../../lib/disposables.js';
import { EDGE_PX, hitZone } from './model.js';

// How long the pointer rests against an edge before the outline shows (no modifier)
const DWELL_MS = 150;

const MOVE_OPS = new Set([Meta.GrabOp.MOVING, Meta.GrabOp.MOVING_UNCONSTRAINED]);

export class TileDrag {
    /**
     * @param {object} ctx
     * @param {CleanupRegistry} cleanup the tiling feature's registry
     * @param {import('../../lib/settings.js').KiwiSettings} ks
     * @param {object} layout core/layout.js LayoutService (acquired)
     * @param {import('./index.js').WindowTiling} engine
     */
    constructor(ctx, cleanup, ks, layout, engine) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._ks = ks;
        this._layout = layout;
        this._engine = engine;
        this._grab = null;     // CleanupRegistry of the drag in progress
        this._win = null;
        this._zone = null;     // zone under the pointer
        this._shown = null;    // zone the outline shows (after the dwell)
        this._dwell = 0;
        this._anim = null;
        this._untilePending = false;
        this._preview = null;
    }

    enable() {
        const cleanup = this._cleanup;
        this._preview = cleanup.actor(new St.Widget({
            style_class: 'kiwi-tile-preview', visible: false, reactive: false, opacity: 0,
        }));
        cleanup.connect(global.display, 'grab-op-begin', (_d, win, op) => this._begin(win, op));
        cleanup.connect(global.display, 'grab-op-end', (_d, win) => this._end(win));
        cleanup.add(() => this._stop());
    }

    _wanted() {
        const ks = this._ks;
        return ks.bool('windows-tile-drag-edges') || ks.bool('windows-tile-drag-menubar') ||
            ks.bool('windows-tile-drag-modifier');
    }

    _begin(win, op) {
        if (!win)
            return;
        this._engine.cancelSettle(win);
        if (!MOVE_OPS.has(op) || win.get_window_type() !== Meta.WindowType.NORMAL || !this._wanted())
            return;
        this._stop();
        this._win = win;
        this._untilePending = this._engine.isTiled(win);
        this._grab = new CleanupRegistry();
        this._grab.connect(win, 'position-changed', () => this._onMove());
        this._grab.connect(win, 'unmanaged', () => this._stop());
    }

    _end(win) {
        if (!this._win || win !== this._win)
            return;
        const zone = this._shown;
        const monitor = this._monitor;
        this._stop();
        if (zone)
            this._engine.tile(win, zone, monitor);
    }

    // Drag over: drop the tracking and fade the outline out
    _stop() {
        this._grab?.dispose();
        this._grab = null;
        this._win = null;
        this._zone = null;
        this._cancelDwell();
        this._hidePreview();
    }

    _onMove() {
        const [x, y, mods] = global.get_pointer();
        const win = this._win;
        if (this._untilePending) {
            this._untilePending = false;
            this._engine.untileForDrag(win, { x, y });
        }
        const monitor = global.display.get_current_monitor();
        const mon = Main.layoutManager.monitors[monitor];
        if (!mon)
            return;
        const bar = this._layout.rect('menu-bar', monitor);
        const ks = this._ks;
        const modifier = (mods & Clutter.ModifierType.MOD1_MASK) !== 0 && ks.bool('windows-tile-drag-modifier');
        const zone = hitZone({ x, y }, mon, {
            topEdge: bar && bar.height > 0 ? bar.y + bar.height : mon.y + EDGE_PX,
            edges: ks.bool('windows-tile-drag-edges'),
            menuBar: ks.bool('windows-tile-drag-menubar'),
            modifier,
        });
        if (zone === this._zone && monitor === this._monitor)
            return;
        this._zone = zone;
        this._monitor = monitor;
        this._cancelDwell();
        if (!zone) {
            this._hidePreview();
            return;
        }
        if (modifier || this._shown) {
            // Moving between zones, or Alt: no second wait
            this._showPreview(zone, monitor);
            return;
        }
        this._dwell = this._cleanup.timeout(DWELL_MS, () => {
            this._dwell = 0;
            if (this._zone === zone)
                this._showPreview(zone, monitor);
            return GLib.SOURCE_REMOVE;
        }, { name: 'kiwi tile dwell' });
    }

    _cancelDwell() {
        if (this._dwell) {
            this._cleanup.release(this._dwell);
            this._dwell = 0;
        }
    }

    _showPreview(zone, monitor) {
        const rect = this._engine.zoneRectOn(zone, monitor);
        const actor = this._win?.get_compositor_private();
        if (!rect || !actor)
            return;
        const preview = this._preview;
        this._anim?.cancel();
        if (!this._shown) {
            // Grow out of the window's own frame, behind it
            const parent = actor.get_parent();
            if (preview.get_parent() !== parent) {
                preview.get_parent()?.remove_child(preview);
                parent.add_child(preview);
            }
            parent.set_child_below_sibling(preview, actor);
            const f = this._win.get_frame_rect();
            preview.set_position(f.x, f.y);
            preview.set_size(f.width, f.height);
            preview.opacity = 0;
            preview.show();
        }
        this._shown = zone;
        this._anim = this._ctx.motion.ease(preview, {
            x: rect.x, y: rect.y, width: rect.width, height: rect.height, opacity: 255,
        }, { duration: 'short', curve: 'standard' }, this._cleanup);
    }

    _hidePreview() {
        if (!this._shown)
            return;
        this._shown = null;
        this._anim?.cancel();
        const preview = this._preview;
        this._anim = this._ctx.motion.ease(preview, { opacity: 0 }, {
            duration: 'micro', curve: 'exit',
            onDone: () => {
                if (!this._shown)
                    preview.hide();
            },
        }, this._cleanup);
    }
}
