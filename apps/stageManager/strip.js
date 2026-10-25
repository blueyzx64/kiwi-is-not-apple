// SPDX-License-Identifier: GPL-3.0-or-later
// Stage Manager strip: a floating glass pill at the screen edge with one card per stage.
// Each card is a stack of live Clutter.Clone thumbnails (never screenshots) of its windows.
//
// The view knows nothing about windows beyond what update() hands it. All maths is in
// model.js; the window list comes from shellAdapter.js; index.js wires them together.
//
// Actor tree (all positions are absolute stage coordinates, the root is a chrome actor):
//   root            Clutter.Actor, sized to the pill, the only thing that takes input
//     [glass layer] inserted by Glass.attach at index 0
//     bg            St.Widget .kiwi-stage-strip (glass target; holds no content)
//     cards         Clutter.Actor above the glass, one St.Button .kiwi-stage-card per stage
//   barrier         Meta.Barrier + Layout.PressureBarrier on the screen edge: a push reveals an
//                   auto-hidden strip (no reactive actor over the windows)
//
// Private API: none. Main.layoutManager.addChrome without affectsInputRegion (removed in 50).
// Card tilt sign and the clone clipping are unverified on a real shell (no shell in the cloud).

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Glass } from '../../lib/glass.js';
import {
    DEFAULTS, cardTilt, cropThumb, edgeBarrier, fitCount, overlaps, stackLayers, stripLayout, stripShown,
} from './model.js';

const PILL_PAD = 14;
const PILL_RADIUS = 22;
const SLIDE_MS = 250;
const HIDE_DELAY_MS = 450;
const EDGE_HOLD_MS = 1200;       // after a push on the edge, time to reach the strip
const PRESSURE_THRESHOLD = 40;  // px of push against the edge (as the auto-hide top bar)
const PRESSURE_TIMEOUT = 600;

export class StageStrip {
    /**
     * @param {import('../../lib/disposables.js').CleanupRegistry} cleanup
     * @param {{onActivate: (stageId: string) => void}} handlers
     */
    constructor(cleanup, { onActivate }) {
        this._cleanup = cleanup;
        this._onActivate = onActivate;
        this._state = {
            side: 'left', autohide: true, overview: false,
            cards: [], workArea: null, stageRects: [],
        };
        this._shown = null;          // last applied visibility (null = never applied)
        this._pointerAtEdge = false;
        this._pointerOnStrip = false;
        this._hideToken = 0;
        this._pill = null;           // last pill rect

        this._root = cleanup.actor(new Clutter.Actor({ reactive: true, visible: false }));
        this._root.connect('enter-event', () => this._setPointer({ onStrip: true }));
        this._root.connect('leave-event', () => this._setPointer({ onStrip: false }));
        this._bg = new St.Widget({ style_class: 'kiwi-stage-strip', reactive: false });
        this._cards = new Clutter.Actor({ reactive: false });
        this._root.add_child(this._bg);
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

        // Glass last in, first out: the layer goes before the actors it sits in
        this._glass = Glass.attach(this._bg, {
            surface: 'overlays',
            parent: this._root,
            radius: PILL_RADIUS,
            role: 'large',
            name: 'stage-strip',
        });
        cleanup.add(() => this._glass?.destroy());
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

    /** Cheap path for window moves: only re-decide whether the strip is shown. */
    setStageRects(rects) {
        this._state.stageRects = rects;
        this._syncShown();
    }

    // ---- build -----------------------------------------------------------------------

    _clearCards() {
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
        this._bg.set_position(0, 0);
        this._bg.set_size(pill.width, pill.height);
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
        });
        button.set_position(rect.x - pill.x, rect.y - pill.y);
        button.set_size(rect.width, rect.height);
        button.set_pivot_point(0.5, 0.5);
        button.rotation_angle_y = cardTilt(side);
        button.connect('clicked', () => this._onActivate(card.id));

        const holder = new Clutter.Actor();
        button.set_child(holder);

        const layers = stackLayers(card.windows.length, side);
        // Back to front so the lead window paints on top
        for (const layer of [...layers].reverse()) {
            const win = card.windows[layer.index];
            const holderLayer = win?.minimized
                ? this._makeIconThumb(card.app, rect.width, rect.height, scale)
                : this._makeThumb(win, rect.width, rect.height);
            if (!holderLayer)
                continue;
            holderLayer.set_pivot_point(0.5, 0.5);
            holderLayer.translation_x = layer.dx * scale;
            holderLayer.translation_y = layer.dy * scale;
            holderLayer.set_scale(layer.scale, layer.scale);
            holderLayer.opacity = layer.opacity;
            holder.add_child(holderLayer);
        }

        if (card.app) {
            try {
                const size = Math.round(DEFAULTS.badge * scale);
                const icon = card.app.create_icon_texture(size);
                const badge = new St.Bin({ style_class: 'kiwi-stage-badge', child: icon, reactive: false });
                badge.set_position(side === 'right' ? 4 : rect.width - size - 8, rect.height - size - 8);
                holder.add_child(badge);
            } catch (e) {
                console.error(`[Kiwi] stage badge: ${e.message}`);
            }
        }
        return button;
    }

    /**
     * A minimized window's actor is unmapped and its clone paints nothing, so it shows as its
     * app icon on a tile instead.
     */
    _makeIconThumb(app, boxW, boxH, scale) {
        const tile = new St.Widget({
            style_class: 'kiwi-stage-icon-tile',
            layout_manager: new Clutter.BinLayout(),
            reactive: false,
        });
        tile.set_size(boxW, boxH);
        const size = Math.round(64 * scale);
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
        return tile;
    }

    /** One thumbnail: a clipping holder with a live clone inside, or null if the window has no actor. */
    _makeThumb(win, boxW, boxH) {
        const actor = win?.get_compositor_private?.();
        if (!actor)
            return null;
        const t = cropThumb(win.get_frame_rect(), win.get_buffer_rect(), boxW, boxH);
        if (t.scale === 0)
            return null;
        const holder = new Clutter.Actor({ clip_to_allocation: true, reactive: false });
        holder.set_position(t.x, t.y);
        holder.set_size(t.width, t.height);
        const clone = new Clutter.Clone({ source: actor, reactive: false });
        clone.set_position(t.cloneX, t.cloneY);
        clone.set_size(t.cloneW, t.cloneH);
        holder.add_child(clone);
        return holder;
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
        const animate = Glass.motion && !first;
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
        this._glass?.refresh();
    }
}
