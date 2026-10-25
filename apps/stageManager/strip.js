// SPDX-License-Identifier: GPL-3.0-or-later
// Stage Manager strip: one rounded translucent "floor" at the screen edge, and the parked windows
// lying on it, one entry per stage, turned in perspective to face the stage (macOS look).
// Each entry is a stack of live Clutter.Clone thumbnails (never screenshots) of its windows with
// the app icon badged, unrotated, at the lead window's bottom right.
//
// Sharpness: clones are drawn straight from the window texture (mutter mipmaps it when scaled
// down), never through an offscreen buffer. They are not clipped to the frame, so the window's
// own soft shadow is the edge of the tilted quad: it fades to transparent and shows no jaggies.
//
// The view knows nothing about windows beyond what update() hands it. All maths is in
// model.js; the window list comes from shellAdapter.js; index.js wires them together.
//
// Actor tree (all positions are absolute stage coordinates, the root is a chrome actor):
//   root            St.Widget .kiwi-stage-strip: the floor, sized to the entries; takes the input.
//                   It eases to a new height when entries come and go (cards counter-move).
//     cards         Clutter.Actor, one St.Button .kiwi-stage-card per stage (transparent, a hit box)
//       holder        Clutter.Actor: back layers first, the lead window on top
//         clone         Clutter.Clone, pivot on the frame centre, scaled and tilted (rotation-y)
//         ring          St.Widget .kiwi-stage-focus, same pose as the lead clone, on key focus
//         badge         St.Bin .kiwi-stage-badge with the app icon (icon-shadow), never tilted
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
    DEFAULTS, cardTilt, clonePose, edgeBarrier, fitCount, overlaps, stackLayers, stripLayout, stripShown,
} from './model.js';

const PILL_PAD = 14;
// A clone of a minimized (unmapped) window actor still paints its last buffer on mutter 18
const CLONE_MINIMIZED = true;
const HOVER_SCALE = 1.06;
const HOVER_TILT = 0.4;          // share of the tilt left on hover: the window turns to you
const HOVER_MS = 160;
const FLOOR_MS = 260;
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
        return {
            ...t.rect,
            x: t.rect.x + this._root.translation_x,
            y: t.rect.y + this._cards.y,
            angle: t.angle,
        };
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
        const old = this._pill;
        this._pill = pill;
        this._strip = layout.strip;
        this._placeFloor(old, pill);

        this._syncBarrier();

        for (let i = 0; i < count; i++)
            this._cards.add_child(this._makeCard(cards[i], rects[i], pill, layout.scale));

        this._shown = null;     // force the next _syncShown to apply
        this._syncShown();
    }

    /**
     * Move the floor to the new pill. A visible floor eases its top and height; the cards inside
     * counter-move by the same amount on the same curve, so they stay put on screen.
     */
    _placeFloor(old, pill) {
        const root = this._root;
        const cards = this._cards;
        root.remove_transition('y');
        root.remove_transition('height');
        cards.remove_transition('y');
        cards.set_size(pill.width, pill.height);
        const animate = old && this._shown && root.visible && this._motion() &&
            old.x === pill.x && (old.y !== pill.y || old.height !== pill.height);
        if (!animate) {
            root.set_position(pill.x, pill.y);
            root.set_size(pill.width, pill.height);
            cards.y = 0;
            return;
        }
        const from = { y: root.y, height: root.height };
        root.set_position(pill.x, from.y);
        root.set_size(pill.width, from.height);
        cards.y = pill.y - from.y;
        const ease = { duration: FLOOR_MS, mode: Clutter.AnimationMode.EASE_OUT_CUBIC };
        root.ease({ y: pill.y, height: pill.height, ...ease });
        cards.ease({ y: 0, ...ease });
    }

    _makeCard(card, rect, pill, scale) {
        const { side } = this._state;
        const angle = cardTilt(side);
        const button = new St.Button({
            style_class: 'kiwi-stage-card',
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: card.app?.get_name?.() ?? '',
        });
        button.set_position(rect.x - pill.x, rect.y - pill.y);
        button.set_size(rect.width, rect.height);
        button.connect('clicked', () => this._onActivate(card.id));

        const holder = new Clutter.Actor({ reactive: false });
        holder.set_size(rect.width, rect.height);
        button.set_child(holder);

        // Room on the sides for the tilt's near edge and the window shadow, so windows stay on the floor
        const padX = Math.max(6, Math.round(DEFAULTS.cardPad * 1.7 * scale));
        const padY = Math.max(4, Math.round(DEFAULTS.cardPad * 0.7 * scale));
        const box = { x: padX, y: padY, width: rect.width - 2 * padX, height: rect.height - 2 * padY };
        const layers = stackLayers(card.windows.length, side);
        let front = null;
        // Back to front so the lead window paints on top
        for (const layer of [...layers].reverse()) {
            const win = card.windows[layer.index];
            const t = this._makeThumb(win, box, layer, scale, angle) ??
                this._makeIconThumb(card.app, win, box, layer, scale, angle);
            t.actor.opacity = this._flying.has(win) ? 0 : layer.opacity;
            holder.add_child(t.actor);
            if (win) {
                const r = t.rect;
                this._thumbs.set(win, {
                    layer: t.actor,
                    opacity: layer.opacity,
                    angle,
                    rect: { x: rect.x + r.x, y: rect.y + r.y, width: r.width, height: r.height },
                });
            }
            if (layer.index === 0)
                front = { ...t, win };
        }
        if (!front)
            return button;

        // Focus ring: a rounded outline in the lead window's pose
        const ring = new St.Widget({ style_class: 'kiwi-stage-focus', reactive: false, visible: false });
        ring.set_position(Math.round(front.rect.x), Math.round(front.rect.y));
        ring.set_size(Math.round(front.rect.width), Math.round(front.rect.height));
        ring.set_pivot_point(0.5, 0.5);
        ring.rotation_angle_y = angle;
        holder.add_child(ring);
        button.connect('key-focus-in', () => {
            ring.visible = true;
        });
        button.connect('key-focus-out', () => {
            ring.visible = false;
        });

        // Hover: the lead window lifts and turns toward the viewer (the ring follows it)
        const rest = front.scale;
        button.connect('notify::hover', () => {
            const k = button.hover ? HOVER_SCALE : 1;
            const tilt = button.hover ? angle * HOVER_TILT : angle;
            this._pose(front.actor, { scale_x: rest * k, scale_y: rest * k, scale_z: rest * k, rotation_angle_y: tilt });
            this._pose(ring, { scale_x: k, scale_y: k, rotation_angle_y: tilt });
        });

        if (card.app) {
            try {
                const size = Math.round(DEFAULTS.badge * scale);
                const icon = card.app.create_icon_texture(size);
                icon.add_style_class_name('kiwi-stage-badge-icon');
                const badge = new St.Bin({ style_class: 'kiwi-stage-badge', child: icon, reactive: false });
                // Bottom right of the tilted window (its projected right edge, roughly)
                const r = front.rect;
                const halfW = r.width / 2 * Math.cos(angle * Math.PI / 180);
                const overhang = Math.round(size * 0.35);
                badge.set_position(
                    Math.round(r.x + r.width / 2 + halfW - size + overhang),
                    Math.round(r.y + r.height - size + overhang));
                holder.add_child(badge);
                // The badge rides with the lead window: hidden while that window is in the air
                const t = this._thumbs.get(front.win);
                if (t)
                    t.badge = badge;
                if (this._flying.has(front.win))
                    badge.opacity = 0;
            } catch (e) {
                console.error(`[Kiwi] stage badge: ${e.message}`);
            }
        }
        return button;
    }

    _pose(actor, props) {
        actor.remove_all_transitions();
        if (this._motion())
            actor.ease({ ...props, duration: HOVER_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        else
            actor.set(props);
    }

    /**
     * Where a stack layer draws its window's frame inside the card: the box, aspect kept, then
     * the layer's shrink and offset (back layers peek out toward the screen edge).
     */
    _layerRect(frame, box, layer, scale) {
        const k = Math.min(box.width / frame.width, box.height / frame.height) * layer.scale;
        const width = frame.width * k;
        const height = frame.height * k;
        return {
            x: box.x + (box.width - width) / 2 + layer.dx * scale,
            y: box.y + (box.height - height) / 2 + layer.dy * scale,
            width, height,
        };
    }

    /**
     * One window: its live clone (the whole buffer, shadow included) posed so the frame fills
     * its layer rect, turned by `angle` about the frame centre.
     * @returns {?{actor: Clutter.Clone, rect: rect, scale: number}} rect: the frame area in the card
     */
    _makeThumb(win, box, layer, scale, angle) {
        const actor = win?.get_compositor_private?.();
        if (!actor || (win.minimized && !CLONE_MINIMIZED))
            return null;
        const frame = win.get_frame_rect();
        const buffer = win.get_buffer_rect();
        if (!(frame.width > 0) || !(frame.height > 0))
            return null;
        const rect = this._layerRect(frame, box, layer, scale);
        const pose = clonePose(frame, buffer, rect);
        if (!pose)
            return null;
        const clone = new Clutter.Clone({ source: actor, reactive: false });
        clone.set_size(buffer.width, buffer.height);
        clone.set_pivot_point(pose.pivotX, pose.pivotY);
        clone.set_position(Math.round(pose.x), Math.round(pose.y));
        // scale_z too: Clutter scales after rotating, so an unscaled depth would exaggerate the
        // perspective of a shrunken window
        clone.set_scale(pose.scale, pose.scale);
        clone.scale_z = pose.scale;
        clone.rotation_angle_y = angle;
        // Exact place after rounding, for flights to land on
        const dx = Math.round(pose.x) - pose.x;
        const dy = Math.round(pose.y) - pose.y;
        return { actor: clone, rect: { ...rect, x: rect.x + dx, y: rect.y + dy }, scale: pose.scale };
    }

    /** A window that cannot be cloned (no actor): its app icon on a rounded tile, same pose. */
    _makeIconThumb(app, win, box, layer, scale, angle) {
        const f = win?.get_frame_rect?.();
        const frame = f?.width > 0 && f?.height > 0 ? f : { width: 16, height: 10 };
        const rect = this._layerRect(frame, box, layer, scale);
        const tile = new St.Widget({
            style_class: 'kiwi-stage-icon-tile',
            layout_manager: new Clutter.BinLayout(),
            reactive: false,
        });
        tile.set_position(Math.round(rect.x), Math.round(rect.y));
        tile.set_size(Math.round(rect.width), Math.round(rect.height));
        tile.set_pivot_point(0.5, 0.5);
        tile.rotation_angle_y = angle;
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
        tile.add_child(icon);
        return { actor: tile, rect: { x: tile.x, y: tile.y, width: tile.width, height: tile.height }, scale: 1 };
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
