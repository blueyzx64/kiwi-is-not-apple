// SPDX-License-Identifier: GPL-3.0-or-later
// Drag tiling (macOS 15): while a window is dragged by its title bar, the zone under the
// pointer (model.js hitZone: edges, corners, the menu bar, or anywhere near a side while Alt is
// held) shows a filled preview of the tile behind the dragged window: a translucent rounded
// rect tinted with the accent colour, with a clear border and a soft shadow. It grows out of
// the window's own frame and springs from zone to zone (by transform: model.js
// previewTransform). Its look follows the colour scheme, Increase Contrast and Reduce
// Transparency (lib/glass.js watch); under reduced motion it only fades. Releasing over it
// tiles the window. Dragging a tiled window away gives it back its pre-tile size first.
//
// Near the top centre the snap bar (snapBar.js, Windows 11 Snap Layouts) takes over: a handle,
// then a row of layouts; the zone under the pointer is previewed like an edge zone, and
// releasing over one tiles there (elsewhere on the bar: nothing).
//
// At an edge the outline waits a beat (DWELL_MS) against accidental tiling, as on macOS; with
// the modifier it shows at once. Pointer tracking only runs while a move grab is active: the
// dragged window's position-changed (once per move), nothing per frame.
//
// Shell API: global.display grab-op-begin / grab-op-end (Meta.GrabOp), global.get_pointer(),
// global.display.get_current_monitor(), global.window_group (the preview sits just below the
// dragged window's actor), Main.layoutManager.monitors.

import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { getPointerWatcher } from 'resource:///org/gnome/shell/ui/pointerWatcher.js';

import { CleanupRegistry } from '../../lib/disposables.js';
import { Glass } from '../../lib/glass.js';
import { ZONES } from '../../core/tileActions.js';
import {
    EDGE_PX, dropZone, hitZone, needsDwell, previewClasses, previewTransform, previewVisualRect,
} from './model.js';
import { SnapBar } from './snapBar.js';

// How long the pointer rests against an edge before the outline shows (no modifier)
const DWELL_MS = 150;
// The pointer is read once per frame (60 Hz) while a window is dragged. Mutter clamps a dragged
// window below the bar, so the window's own position-changed stops once the pointer is past
// that: it cannot be what tells Kiwi the pointer reached the top edge.
const POINTER_POLL_MS = 16;

// The preview's flight: quick and critically damped, as Sequoia's (about 0.25 s)
const PREVIEW_SPRING = Object.freeze({ response: 0.24, damping: 1 });
const PREVIEW_CLASSES = ['kiwi-tile-preview-light', 'kiwi-tile-preview-dark',
    'kiwi-tile-preview-contrast', 'kiwi-tile-preview-opaque'];

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
        this._watch = null;    // the pointer watch of the drag
        this._win = null;
        this._zone = null;     // zone under the pointer
        this._shown = null;    // zone the outline shows (after the dwell)
        this._snapZone = null; // zone of the snap bar under the pointer
        this._monitor = -1;
        this._dwell = 0;
        this._anim = null;     // the preview's rect spring
        this._fade = null;     // the preview's opacity spring
        this._untilePending = false;
        this._preview = null;
        this._snap = null;
    }

    enable() {
        const cleanup = this._cleanup;
        this._preview = cleanup.actor(new St.Widget({
            style_class: 'kiwi-tile-preview', visible: false, reactive: false, opacity: 0,
            pivot_point: new Graphene.Point({ x: 0, y: 0 }),
        }));
        // Light/dark, Increase Contrast and Reduce Transparency, as every Kiwi surface follows
        // them (the look itself is style.css: an accent fill, not the neutral glass tint)
        Glass.watch(cleanup, ({ env }) => {
            const want = previewClasses(env);
            for (const c of PREVIEW_CLASSES) {
                if (want.includes(c))
                    this._preview.add_style_class_name(c);
                else
                    this._preview.remove_style_class_name(c);
            }
        });
        this._snap = new SnapBar(this._ctx, cleanup);
        cleanup.connect(global.display, 'grab-op-begin', (_d, win, op) => this._begin(win, op));
        cleanup.connect(global.display, 'grab-op-end', (_d, win) => this._end(win));
        cleanup.add(() => this._stop());
    }

    _wanted() {
        const ks = this._ks;
        return ks.bool('windows-tile-drag-edges') || ks.bool('windows-tile-drag-menubar') ||
            ks.bool('windows-tile-drag-modifier') || ks.bool('windows-tile-drag-picker');
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
        this._grab.connect(win, 'unmanaged', () => this._stop());
        this._watch = getPointerWatcher().addWatch(POINTER_POLL_MS, () => this._onMove());
        this._grab.add(() => {
            this._watch?.remove();
            this._watch = null;
        });
    }

    _end(win) {
        if (!this._win || win !== this._win)
            return;
        const monitor = this._monitor;
        // Esc cancels the grab with the button still down: the window goes back, nothing tiles
        const [x, y, mods] = global.get_pointer();
        const buttonDown = (mods & Clutter.ModifierType.BUTTON1_MASK) !== 0;
        // On the snap bar only a zone counts, whatever the edges say
        const action = this._snap.visible
            ? !buttonDown && this._snapZone
            : dropZone({ live: this._zoneAt(x, y, mods)?.zone ?? null, shown: this._shown, buttonDown });
        this._stop();
        if (action in ZONES)
            this._engine.tile(win, action, monitor);
        else if (action)
            this._engine.perform(win, action);
    }

    // Drag over: drop the tracking and fade the outline and the picker out
    _stop() {
        this._grab?.dispose();
        this._grab = null;
        this._win = null;
        this._zone = null;
        this._snapZone = null;
        this._cancelDwell();
        this._snap?.close();
        this._hidePreview();
    }

    // The zone under the pointer, or null (also: the monitor it is on)
    _zoneAt(x, y, mods) {
        const monitor = global.display.get_current_monitor();
        const mon = Main.layoutManager.monitors[monitor];
        if (!mon)
            return null;
        const bar = this._layout.rect('menu-bar', monitor);
        const ks = this._ks;
        const modifier = (mods & Clutter.ModifierType.MOD1_MASK) !== 0 && ks.bool('windows-tile-drag-modifier');
        const barBottom = bar && bar.height > 0 ? bar.y + bar.height : mon.y + EDGE_PX;
        const zone = hitZone({ x, y }, mon, {
            topEdge: barBottom,
            edges: ks.bool('windows-tile-drag-edges'),
            menuBar: ks.bool('windows-tile-drag-menubar'),
            modifier,
        });
        return { zone, monitor, mon, barBottom };
    }

    _onMove() {
        const [x, y, mods] = global.get_pointer();
        const win = this._win;
        if (!win)
            return;
        if (this._untilePending) {
            this._untilePending = false;
            this._engine.untileForDrag(win, { x, y });
        }
        const at = this._zoneAt(x, y, mods);
        if (!at)
            return;
        const { zone, monitor } = at;
        if (this._followSnap(at, x, y)) {
            this._zone = null;
            return;
        }
        if (zone === this._zone && monitor === this._monitor)
            return;
        this._zone = zone;
        this._monitor = monitor;
        this._cancelDwell();
        if (!zone) {
            this._hidePreview();
            return;
        }
        const modifier = (mods & Clutter.ModifierType.MOD1_MASK) !== 0 && this._ks.bool('windows-tile-drag-modifier');
        if (modifier || this._shown || !needsDwell(zone)) {
            // The top bar, moving between zones, or Alt: no wait
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

    // The snap bar follows the pointer; while it is up it owns the preview (the zone it lights).
    // Returns true while the pointer is on it.
    _followSnap({ monitor, mon, barBottom }, x, y) {
        if (!this._ks.bool('windows-tile-drag-picker'))
            return false;
        const snap = this._snap;
        const zone = snap.update({ x, y }, mon, barBottom);
        if (!snap.visible) {
            this._snapZone = null;
            return false;
        }
        this._cancelDwell();
        this._monitor = monitor;
        if (zone !== this._snapZone) {
            this._snapZone = zone;
            if (zone)
                this._showPreview(zone, monitor);
            else
                this._hidePreview();
        }
        return true;
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
        this._anim = null;
        // Behind the dragged window, in its parent
        const parent = actor.get_parent();
        if (preview.get_parent() !== parent) {
            preview.get_parent()?.remove_child(preview);
            parent.add_child(preview);
        }
        parent.set_child_below_sibling(preview, actor);
        let from;
        if (preview.visible) {
            // Between zones, or back while fading out: from wherever it is drawn now
            from = previewVisualRect(
                { x: preview.x, y: preview.y, width: preview.width, height: preview.height },
                preview);
        } else {
            // Grow out of the window's own frame
            from = this._win.get_frame_rect();
            preview.opacity = 0;
            preview.show();
        }
        this._shown = zone;
        preview.set_position(rect.x, rect.y);
        preview.set_size(rect.width, rect.height);
        if (this._ctx.motion.env.reducedMotion) {
            // No movement or scaling: it appears in place, with the fade below
            Object.assign(preview, { translation_x: 0, translation_y: 0, scale_x: 1, scale_y: 1 });
        } else {
            Object.assign(preview, previewTransform(from, rect));
            this._anim = this._ctx.motion.springs(preview, {
                translation_x: 0, translation_y: 0, scale_x: 1, scale_y: 1,
            }, { spring: PREVIEW_SPRING }, this._cleanup);
        }
        this._fade?.cancel();
        this._fade = this._ctx.motion.spring(preview, 'opacity', 255, { spring: 'quick' }, this._cleanup);
    }

    _hidePreview() {
        if (!this._shown)
            return;
        this._shown = null;
        this._fade?.cancel();
        const preview = this._preview;
        this._fade = this._ctx.motion.spring(preview, 'opacity', 0, {
            spring: 'quick',
            onDone: finished => {
                if (finished && !this._shown) {
                    this._anim?.cancel();
                    this._anim = null;
                    preview.hide();
                }
            },
        }, this._cleanup);
    }
}
