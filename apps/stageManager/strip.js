// SPDX-License-Identifier: GPL-3.0-or-later
// Stage Manager strip: a column of cards at the screen edge, one per stage, with no slab behind.
// Each card is a fixed-size rounded translucent card with a soft shadow (so all cards line up),
// holding a stack of live Clutter.Clone thumbnails (never screenshots) of its windows, centred
// with padding and keeping their aspect ratio, and the app icon badged on its bottom-right corner.
// Clones are never rotated or rendered offscreen: they are drawn straight from the window
// texture (mutter mipmaps it when scaled down), so they stay sharp.
//
// The view knows nothing about windows beyond what update() hands it. All maths is in
// model.js; the window list comes from shellAdapter.js; index.js wires them together.
//
// Actor tree (all positions are absolute stage coordinates, the root is a chrome actor):
//   root            Clutter.Actor .kiwi-stage-strip, sized to the column, the only thing that takes input
//     cards         Clutter.Actor, one St.Button .kiwi-stage-card per stage (the rounded card)
//       holder        Clutter.Actor: back layers first, the lead window's layer on top
//         layer         Clutter.Actor clipped to the window frame, the clone inside
//         badge         St.Bin .kiwi-stage-badge with the app icon (icon-shadow)
//   barrier         Meta.Barrier + Layout.PressureBarrier on the screen edge: a push reveals an
//                   auto-hidden strip (no reactive actor over the windows)
//
// Private API: none. Main.layoutManager.addChrome without affectsInputRegion (removed in 50).
// Checked on GNOME Shell 50.6: clones paint opacity-0 actors.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    DEFAULTS, cardTilt, cropThumb, edgeBarrier, fitCount, overlaps, stackLayers, stripLayout, stripShown,
} from './model.js';

const PILL_PAD = 14;
// A clone of a minimized (unmapped) window actor still paints its last buffer on mutter 18
const CLONE_MINIMIZED = true;
const HOVER_SCALE = 1.04;
const HOVER_MS = 140;
const LAND_MS = 120;
const SLIDE_MS = 250;
const HIDE_DELAY_MS = 450;
const EDGE_HOLD_MS = 1200;       // after a push on the edge, time to reach the strip
const PRESSURE_THRESHOLD = 40;  // px of push against the edge (as the auto-hide top bar)
const PRESSURE_TIMEOUT = 600;

export class StageStrip {
    /**
     * @param {import('../../lib/disposables.js').CleanupRegistry} cleanup
     * @param {{onActivate: (stageId: string) => void, motion: () => boolean}} handlers
     */
    constructor(cleanup, { onActivate, motion }) {
        this._cleanup = cleanup;
        this._onActivate = onActivate;
        this._motion = motion;
        this._thumbs = new Map();    // Meta.Window -> {layer, rect}: rect is absolute, without slide
        this._flying = new Set();    // windows whose thumbnail a flight stands in for
        this._state = {
            side: 'left', autohide: true, overview: false,
            cards: [], workArea: null, stageRects: [],
        };
        this._shown = null;          // last applied visibility (null = never applied)
        this._pointerAtEdge = false;
        this._pointerOnStrip = false;
        this._hideToken = 0;
        this._pill = null;           // last pill rect

        this._root = cleanup.actor(new St.Widget({
            style_class: 'kiwi-stage-strip', reactive: true, visible: false,
        }));
        this._root.connect('enter-event', () => this._setPointer({ onStrip: true }));
        this._root.connect('leave-event', () => this._setPointer({ onStrip: false }));
        this._cards = new Clutter.Actor({ reactive: false });
        this._root.add_child(this._cards);

        this._barrier = null;
        this._barrierKey = '';
        this._edgeToken = 0;
        this._pressure = new Layout.PressureBarrier(PRESSURE_THRESHOLD, PRESSURE_TIMEOUT,
            Shell.ActionMode.NORMAL);
        // A held button is a drag (a window to the edge to tile): not a reveal
        this._pressure.setEventFilter(() => {
            const [, , mods] = global.get_pointer();
            return (mods & Clutter.ModifierType.BUTTON1_MASK) !== 0;
        });
        this._pressure.connect('trigger', () => this._edgePushed());
        cleanup.add(() => {
            this._dropBarrier();
            this._pressure.destroy();
        });

        Main.layoutManager.addChrome(this._root, { trackFullscreen: true });
        cleanup.add(() => Main.layoutManager.removeChrome(this._root));
        cleanup.add(() => this._clearCards());
    }

    /**
     * Set what the strip shows.
     * @param {object} next any of: side, autohide, overview, workArea, stageRects,
     *   cards: [{id, app (Shell.App|null), windows: Meta.Window[] (lead first)}]
     */
    update(next) {
        Object.assign(this._state, next);
        this._rebuild();
    }

    /** Where windows shrink toward: the middle of the pill, or null when there is none. */
    anchor() {
        const p = this._pill;
        return p ? { x: p.x + p.width / 2, y: p.y + p.height / 2 } : null;
    }

    /**
     * Where a window's thumbnail is drawn now (absolute, frame area, slide included), or null
     * when the window has no card.
     */
    thumbRect(win) {
        const t = this._thumbs.get(win);
        if (!t)
            return null;
        return { ...t.rect, x: t.rect.x + this._root.translation_x };
    }

    /** A flight stands in for this window's thumbnail: hide it until the flight lands. */
    setFlying(win, flying) {
        if (flying)
            this._flying.add(win);
        else
            this._flying.delete(win);
        const t = this._thumbs.get(win);
        if (!t)
            return;
        // The thumbnail takes over from the clone at once (no dip); the badge settles in after
        t.layer.opacity = flying ? 0 : t.opacity;
        if (!t.badge)
            return;
        t.badge.remove_transition('opacity');
        if (flying || !this._motion())
            t.badge.opacity = flying ? 0 : 255;
        else
            t.badge.ease({ opacity: 255, duration: LAND_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
    }

    /** Cheap path for window moves: only re-decide whether the strip is shown. */
    setStageRects(rects) {
        this._state.stageRects = rects;
        this._syncShown();
    }

    // ---- build -----------------------------------------------------------------------

    _clearCards() {
        this._thumbs.clear();
        for (const child of this._cards.get_children())
            child.destroy();
    }

    _rebuild() {
        const { side, workArea, cards } = this._state;
        this._clearCards();
        if (!workArea || cards.length === 0) {
            this._pill = null;
            this._root.visible = false;
            this._shown = null;
            this._syncBarrier();
            return;
        }

        const count = Math.min(cards.length, fitCount(workArea.height, cards.length));
        const layout = stripLayout({ workArea, side, count });
        const rects = layout.cards;
        if (rects.length === 0) {
            this._root.visible = false;
            return;
        }
        const top = rects[0].y - PILL_PAD;
        const bottom = rects[rects.length - 1].y + rects[rects.length - 1].height + PILL_PAD;
        const inset = (layout.strip.width - rects[0].width) / 2;
        const pill = {
            x: layout.strip.x + inset - PILL_PAD / 2,
            y: top,
            width: rects[0].width + PILL_PAD,
            height: bottom - top,
        };
        this._pill = pill;
        this._strip = layout.strip;
        this._root.set_position(pill.x, pill.y);
        this._root.set_size(pill.width, pill.height);
        this._cards.set_size(pill.width, pill.height);

        this._syncBarrier();

        for (let i = 0; i < count; i++)
            this._cards.add_child(this._makeCard(cards[i], rects[i], pill, layout.scale));

        this._shown = null;     // force the next _syncShown to apply
        this._syncShown();
    }

    _makeCard(card, rect, pill, scale) {
        const { side } = this._state;
        const button = new St.Button({
            style_class: 'kiwi-stage-card',
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: card.app?.get_name?.() ?? '',
        });
        button.set_position(rect.x - pill.x, rect.y - pill.y);
        button.set_size(rect.width, rect.height);
        button.set_pivot_point(0.5, 0.5);
        button.rotation_angle_y = cardTilt(side);
        button.connect('clicked', () => this._onActivate(card.id));
        button.connect('notify::hover', () => {
            const s = button.hover ? HOVER_SCALE : 1;
            if (this._motion())
                button.ease({ scale_x: s, scale_y: s, duration: HOVER_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            else
                button.set_scale(s, s);
        });

        const holder = new Clutter.Actor({ reactive: false });
        holder.set_size(rect.width, rect.height);
        button.set_child(holder);

        const pad = Math.max(4, Math.round(DEFAULTS.cardPad * scale));
        const layers = stackLayers(card.windows.length, side);
        let front = null;
        // Back to front so the lead window paints on top
        for (const layer of [...layers].reverse()) {
            const win = card.windows[layer.index];
            const thumb = this._makeThumb(win, rect.width, rect.height, pad) ??
                this._makeIconThumb(card.app, win, rect.width, rect.height, pad, scale);
            const mat = thumb.mat;
            mat.set_pivot_point(0.5, 0.5);
            mat.translation_x = layer.dx * scale;
            mat.translation_y = layer.dy * scale;
            mat.set_scale(layer.scale, layer.scale);
            mat.opacity = this._flying.has(win) ? 0 : layer.opacity;
            holder.add_child(mat);
            if (win) {
                const r = thumb.inner;
                this._thumbs.set(win, {
                    layer: mat,
                    opacity: layer.opacity,
                    rect: { x: rect.x + r.x, y: rect.y + r.y, width: r.width, height: r.height },
                });
            }
            if (layer.index === 0)
                front = { mat, win };
        }

        if (card.app && front) {
            const { win: frontWin } = front;
            try {
                const size = Math.round(DEFAULTS.badge * scale);
                const icon = card.app.create_icon_texture(size);
                icon.add_style_class_name('kiwi-stage-badge-icon');
                const badge = new St.Bin({ style_class: 'kiwi-stage-badge', child: icon, reactive: false });
                const overhang = Math.round(size * 0.3);
                badge.set_position(
                    rect.width - size + overhang, rect.height - size + overhang);
                holder.add_child(badge);
                // The badge rides with the lead window: hidden while that window is in the air
                const t = this._thumbs.get(frontWin);
                if (t)
                    t.badge = badge;
                if (this._flying.has(frontWin))
                    badge.opacity = 0;
            } catch (e) {
                console.error(`[Kiwi] stage badge: ${e.message}`);
            }
        }
        return button;
    }

    /**
     * A window that cannot be cloned (no actor): its app icon on a rounded tile inside the card.
     * @returns {{mat: St.Widget, inner: rect}}
     */
    _makeIconThumb(app, win, boxW, boxH, pad, scale) {
        const innerW = boxW - 2 * pad;
        const innerH = boxH - 2 * pad;
        let w = innerW;
        let h = innerH;
        const frame = win?.get_frame_rect?.();
        if (frame?.width > 0 && frame?.height > 0) {
            const k = Math.min(innerW / frame.width, innerH / frame.height);
            w = frame.width * k;
            h = frame.height * k;
        }
        const mat = new St.Widget({
            style_class: 'kiwi-stage-icon-tile',
            layout_manager: new Clutter.BinLayout(),
            reactive: false,
        });
        mat.set_position(Math.round(pad + (innerW - w) / 2), Math.round(pad + (innerH - h) / 2));
        mat.set_size(Math.round(w), Math.round(h));
        const size = Math.round(48 * scale);
        let icon = null;
        try {
            icon = app?.create_icon_texture(size) ?? null;
        } catch (_e) {
            icon = null;
        }
        icon ??= new St.Icon({ icon_name: 'application-x-executable-symbolic', icon_size: size });
        icon.x_align = Clutter.ActorAlign.CENTER;
        icon.y_align = Clutter.ActorAlign.CENTER;
        mat.add_child(icon);
        return { mat, inner: { x: mat.x, y: mat.y, width: mat.width, height: mat.height } };
    }

    /**
     * One thumbnail: the live clone centred in the card inside `pad`, keeping its aspect ratio,
     * clipped to the window frame (client shadows are cut off; the window's own rounded corners
     * show through). Pixel-aligned so no edge is resampled.
     * @returns {?{mat: Clutter.Actor, inner: rect}} inner: the frame area inside the card
     */
    _makeThumb(win, boxW, boxH, pad) {
        const actor = win?.get_compositor_private?.();
        if (!actor || (win.minimized && !CLONE_MINIMIZED))
            return null;
        const t = cropThumb(win.get_frame_rect(), win.get_buffer_rect(), boxW - 2 * pad, boxH - 2 * pad);
        if (t.scale === 0)
            return null;
        const x = Math.round(pad + t.x);
        const y = Math.round(pad + t.y);
        const w = Math.round(t.width);
        const h = Math.round(t.height);
        const clip = new Clutter.Actor({ clip_to_allocation: true, reactive: false });
        clip.set_position(x, y);
        clip.set_size(w, h);
        const clone = new Clutter.Clone({ source: actor, reactive: false });
        clone.set_position(t.cloneX, t.cloneY);
        clone.set_size(t.cloneW, t.cloneH);
        clip.add_child(clone);
        return { mat: clip, inner: { x, y, width: w, height: h } };
    }

    // ---- edge barrier ---------------------------------------------------------------------

    _dropBarrier() {
        if (!this._barrier)
            return;
        this._pressure.removeBarrier(this._barrier);
        this._barrier.destroy();
        this._barrier = null;
    }

    /** One barrier on the strip's edge while auto-hide is on and there are cards. */
    _syncBarrier() {
        const { side, workArea, autohide, cards } = this._state;
        const lm = Main.layoutManager;
        const monitor = lm.primaryMonitor;
        const want = autohide && workArea && cards.length > 0 && monitor
            ? edgeBarrier(workArea, monitor, lm.monitors.filter(m => m !== monitor), side)
            : null;
        const key = want ? JSON.stringify(want) : '';
        if (key === this._barrierKey)
            return;
        this._barrierKey = key;
        this._dropBarrier();
        if (!want)
            return;
        this._barrier = new Meta.Barrier({
            backend: global.backend,
            x1: want.x1, x2: want.x2, y1: want.y1, y2: want.y2,
            directions: want.direction === 'negative'
                ? Meta.BarrierDirection.NEGATIVE_X : Meta.BarrierDirection.POSITIVE_X,
        });
        this._pressure.addBarrier(this._barrier);
    }

    _edgePushed() {
        this._setPointer({ atEdge: true });
        // The push is a moment, not a place: let go of it unless the pointer reaches the strip
        this._cleanup.release(this._edgeToken);
        this._edgeToken = this._cleanup.timeout(EDGE_HOLD_MS, () => {
            this._edgeToken = 0;
            this._setPointer({ atEdge: false });
            return GLib.SOURCE_REMOVE;
        }, { name: 'stage-strip-edge' });
    }

    // ---- show / hide ----------------------------------------------------------------------

    _setPointer({ atEdge, onStrip }) {
        if (atEdge !== undefined)
            this._pointerAtEdge = atEdge;
        if (onStrip !== undefined)
            this._pointerOnStrip = onStrip;
        if (this._pointerAtEdge || this._pointerOnStrip) {
            this._cleanup.release(this._hideToken);
            this._hideToken = 0;
            this._syncShown();
            return;
        }
        // Left both: wait a moment so a slip of the pointer does not close the strip
        this._cleanup.release(this._hideToken);
        this._hideToken = this._cleanup.timeout(HIDE_DELAY_MS, () => {
            this._hideToken = 0;
            this._syncShown();
            return GLib.SOURCE_REMOVE;
        }, { name: 'stage-strip-hide' });
    }

    _wantShown() {
        const { autohide, overview, stageRects } = this._state;
        const stripRect = this._strip;
        return stripShown({
            autohide,
            overview,
            stageOverlapsStrip: !!stripRect && stageRects.some(r => overlaps(r, stripRect)),
            pointerAtEdge: this._pointerAtEdge,
            pointerOnStrip: this._pointerOnStrip,
        });
    }

    _syncShown() {
        if (!this._pill)
            return;
        const show = this._wantShown();
        if (show === this._shown)
            return;
        const first = this._shown === null;
        this._shown = show;

        const { side, workArea } = this._state;
        const away = side === 'right'
            ? workArea.x + workArea.width - this._pill.x + 12
            : -(this._pill.x - workArea.x + this._pill.width + 12);
        const animate = this._motion() && !first;
        this._root.remove_all_transitions();

        if (show) {
            this._root.visible = true;
            if (first)
                this._root.translation_x = 0;
            if (animate) {
                this._root.ease({
                    translation_x: 0, opacity: 255, duration: SLIDE_MS,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            } else {
                this._root.translation_x = 0;
                this._root.opacity = 255;
            }
        } else if (animate) {
            this._root.ease({
                translation_x: away, opacity: 0, duration: SLIDE_MS,
                mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    if (this._shown === false)
                        this._root.visible = false;
                },
            });
        } else {
            this._root.translation_x = away;
            this._root.opacity = 0;
            this._root.visible = false;
        }
    }
}
