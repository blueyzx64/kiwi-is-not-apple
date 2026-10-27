// SPDX-License-Identifier: GPL-3.0-or-later
// Stage Manager strip view: one rounded glass floor at the screen edge with the strip
// entries lying on it, each a stack of live, tilted window clones with the app icon badge.
// It also owns the drop target over the stage (while an entry is dragged) and the layer the
// flights fly in, so the whole feature draws inside one container, destroyed on disable.
//
// The view knows only what update() hands it: entries of Meta.Windows and their apps. All
// maths is in geometry.js; the state is in model.js; index.js wires them.
//
// Actor tree (absolute stage coordinates; the container is the 'stage-strip' layout claim's
// chrome actor, hidden over full-screen windows by the layout manager):
//   container      Clutter.Actor 1x1 at 0,0
//     drop         St.Widget .kiwi-stage-drop over the stage, a DND target, while an entry is dragged
//     strip        Clutter.Actor: slides off the edge when the strip steps aside
//       shadow     St.Widget .kiwi-stage-shadow, the glass floor's drop-shadow host
//       floor      St.Widget .kiwi-stage-strip (Kiwi glass), track_hover
//         card     St.Button .kiwi-stage-card per entry: hit box, DND source
//           holder   Clutter.Actor: clones back to front, the focus ring, the label, the badge
//     flights      Clutter.Actor: the windows flying to and from the strip, above everything
//   barrier        Meta.Barrier + Layout.PressureBarrier on the edge: a push reveals the strip
//
// Sharpness: clones draw straight from the window texture (no offscreen), unclipped, so the
// window's own soft shadow is the edge of the tilted quad and shows no jaggies. scale_z is
// scaled with x and y so the perspective of a small window is not exaggerated.
//
// Private API: none. Main.layoutManager (public), ui/dnd.js and Layout.PressureBarrier (public
// classes, same in 48-51). Checked on GNOME Shell 50.6: a clone of an opacity-0 actor paints.

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Glass } from '../../lib/glass.js';
import {
    METRICS, clonePose, edgeBarrier, fitCount, layerRect, slotBox, slotAt, stackLayers, stripLayout,
    stripVisible, tiltAngle,
} from './geometry.js';

const HOVER_SCALE = 1.1;
const HOVER_TILT = 0.4;          // share of the tilt left on hover: the window turns to you
const DRAG_OPACITY = 90;         // an entry left behind while its clone is dragged
const PRESSURE_THRESHOLD = 40;   // px pushed against the edge, as the auto-hide top bar
const PRESSURE_TIMEOUT = 600;

export class StripView {
    /**
     * @param {import('../../lib/disposables.js').CleanupRegistry} cleanup
     * @param {object} env
     * @param {import('../../core/motion.js').Motion} env.motion
     * @param {() => number} env.ms a duration (ms) under the animation speed setting
     * @param {(entryId: string, mods: {add: boolean}) => void} env.onActivate a click
     * @param {(entryId: string) => void} env.onDrop an entry dropped on the stage
     * @param {() => void} env.onLayout the strip moved, grew, showed or hid
     * @param {(text: string) => string} env.gettext
     */
    constructor(cleanup, env) {
        this._cleanup = cleanup;
        this._env = env;
        this._state = {
            side: 'left', workArea: null, entries: [], tilt: METRICS.tilt, recentCount: 6,
            showRecent: true, autohide: true, overlapped: false, suppressed: false,
        };
        this._thumbs = new Map();     // Meta.Window -> {actor, rect (absolute, unslid), angle, badge}
        this._slots = [];             // [{entryId, rect}] absolute, unslid
        this._flying = new Set();     // windows a flight stands in for
        this._floorRect = null;
        this._shown = null;           // last applied visibility (null: never)
        this._edge = false;           // the pointer just pushed the edge
        this._dragging = null;        // entry id while an entry is dragged
        this._pending = false;        // an update came during the drag
        this._dropHint = null;        // null | 'near' | 'over': a stage window dragged to the strip
        this._anims = new Set();      // running animation handles
        this._dead = false;

        this.container = new Clutter.Actor({ name: 'kiwi-stage-manager', reactive: false, width: 1, height: 1 });
        cleanup.actor(this.container);
        this.container.connect('destroy', () => {
            this._dead = true;
            this._thumbs.clear();
        });

        this._drop = new St.Widget({ style_class: 'kiwi-stage-drop', visible: false, reactive: false });
        this._dropLabel = new St.Label({ style_class: 'kiwi-stage-drop-label', text: env.gettext('Add to Stage') });
        this._drop.layout_manager = new Clutter.BinLayout();
        this._dropLabel.x_align = Clutter.ActorAlign.CENTER;
        this._dropLabel.y_align = Clutter.ActorAlign.CENTER;
        this._drop.add_child(this._dropLabel);
        this._drop._delegate = {
            handleDragOver: source => (source?.kiwiStageEntry
                ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.CONTINUE),
            acceptDrop: source => {
                if (!source?.kiwiStageEntry)
                    return false;
                const id = source.kiwiStageEntry;
                // After DND finishes its own bookkeeping
                this._cleanup.idle(() => this._env.onDrop(id), { name: 'stage-manager-drop' });
                return true;
            },
        };
        this.container.add_child(this._drop);

        this._strip = new Clutter.Actor({ reactive: false, visible: false });
        this.container.add_child(this._strip);
        this._shadow = new St.Widget({ style_class: 'kiwi-stage-shadow', reactive: false });
        this._strip.add_child(this._shadow);
        this._floor = new St.Widget({ style_class: 'kiwi-stage-strip', reactive: true, track_hover: true });
        this._strip.add_child(this._floor);
        this._shadow.add_constraint(new Clutter.BindConstraint({
            source: this._floor, coordinate: Clutter.BindCoordinate.ALL,
        }));
        const glass = Glass.attach(this._floor, { surface: 'overlays', role: 'bar', shadow: this._shadow });
        cleanup.add(() => glass.destroy());
        this._floor.connect('notify::hover', () => this._syncShown());

        this._flights = new Clutter.Actor({ reactive: false });
        this.container.add_child(this._flights);

        this._barrier = null;
        this._barrierKey = '';
        this._edgeToken = 0;
        this._pressure = new Layout.PressureBarrier(PRESSURE_THRESHOLD, PRESSURE_TIMEOUT, Shell.ActionMode.NORMAL);
        // A held button is a window drag (to an edge to tile): not a reveal
        this._pressure.setEventFilter(() => {
            const [, , mods] = global.get_pointer();
            return (mods & Clutter.ModifierType.BUTTON1_MASK) !== 0;
        });
        this._pressure.connect('trigger', () => this._edgePushed());
        cleanup.add(() => {
            this._dropBarrier();
            this._pressure.destroy();
        });
        cleanup.add(() => this._cancelAnims());
    }

    /** The layer flights fly in. */
    get flightLayer() {
        return this._flights;
    }

    /**
     * Set what the strip shows; any of: side, workArea, entries [{id, windows: Meta.Window[]
     * (lead first), app: ?Shell.App, names: string[], set}], tilt, recentCount, slide (-1, 0, 1).
     */
    update(next) {
        if (this._dead)
            return;
        const { slide = 0, ...rest } = next;
        Object.assign(this._state, rest);
        if (this._dragging) {
            this._pending = true;
            return;
        }
        this._rebuild(slide);
    }

    /** Cheap: only whether the strip is shown (stage windows moved, overview, full screen). */
    setConditions({ showRecent, autohide, overlapped, suppressed }) {
        if (this._dead)
            return;
        Object.assign(this._state, Object.fromEntries(Object.entries({ showRecent, autohide, overlapped, suppressed })
            .filter(([, v]) => v !== undefined)));
        this._syncBarrier();
        this._syncShown();
    }

    /** The floor's rect (absolute, unslid), or null when there are no entries. */
    floorRect() {
        return this._dead || !this._floorRect ? null : { ...this._floorRect };
    }

    /** Is the strip on screen now? */
    get shown() {
        return !!this._shown;
    }

    /**
     * Where a window's clone lies in the strip now (absolute, the slide included), with its
     * tilt `angle`; null when it has none (its entry is past the shown count).
     */
    thumbRect(win) {
        const t = this._dead ? null : this._thumbs.get(win);
        if (!t)
            return null;
        return { ...t.rect, x: t.rect.x + this._strip.translation_x, angle: t.angle };
    }

    /** Where an entry's slot is now (absolute, slid), or null. */
    slotRect(entryId) {
        const s = this._dead ? null : this._slots.find(x => x.entryId === entryId);
        return s ? { ...s.rect, x: s.rect.x + this._strip.translation_x } : null;
    }

    /** The entry whose slot is under an absolute point, or null. */
    entryAt(x, y) {
        if (this._dead || !this._shown)
            return null;
        const i = slotAt(this._slots.map(s => s.rect), { x, y });
        return i < 0 ? null : this._slots[i].entryId;
    }

    /** A flight stands in for this window's clone: hide the clone (and badge) until it lands. */
    setFlying(win, flying) {
        if (this._dead)
            return;
        if (flying)
            this._flying.add(win);
        else
            this._flying.delete(win);
        const t = this._thumbs.get(win);
        if (!t)
            return;
        t.actor.opacity = flying ? 0 : t.opacity;
        if (t.badge) {
            t.badge.remove_all_transitions();
            if (flying)
                t.badge.opacity = 0;
            else
                this._ease(t.badge, { opacity: 255 }, { duration: this._env.ms(120), curve: 'enter' });
        }
    }

    /**
     * A stage window is dragged toward the strip: keep the strip out ('near'), light it up
     * while the pointer is over it ('over'); null ends it.
     */
    setDropHint(hint) {
        if (this._dead || hint === this._dropHint)
            return;
        this._dropHint = hint;
        if (hint === 'over')
            this._floor.add_style_pseudo_class('drop');
        else
            this._floor.remove_style_pseudo_class('drop');
        this._syncShown();
    }

    // ---- build -------------------------------------------------------------------------------

    _ease(actor, props, request) {
        let anim = null;
        anim = this._env.motion.ease(actor, props, {
            ...request,
            onDone: finished => {
                if (anim)
                    this._anims.delete(anim);
                request.onDone?.(finished);
            },
        });
        if (anim.running)
            this._anims.add(anim);
        return anim;
    }

    _cancelAnims() {
        for (const a of [...this._anims])
            a.cancel();
        this._anims.clear();
    }

    _clearCards() {
        this._thumbs.clear();
        this._slots = [];
        for (const child of this._floor.get_children())
            child.destroy();
    }

    _rebuild(slide) {
        const { side, workArea, entries, recentCount } = this._state;
        this._clearCards();
        const wanted = Math.min(entries.length, recentCount);
        const count = workArea ? fitCount(workArea.height, wanted) : 0;
        if (!workArea || count === 0) {
            this._floorRect = null;
            this._syncBarrier();
            this._syncShown();
            return;
        }
        const layout = stripLayout({ workArea, side, count });
        const old = this._floorRect;
        const floor = layout.floor;
        this._floorRect = floor;
        this._placeFloor(old, floor);
        for (let i = 0; i < count; i++) {
            const rect = layout.slots[i];
            this._slots.push({ entryId: entries[i].id, rect });
            this._floor.add_child(this._makeCard(entries[i], rect, floor, layout.scale));
        }
        this._syncBarrier();
        this._syncShown();
        // Workspace switch: the other workspace's entries slide in from the way it came
        const cards = this._floor;
        if (slide && old && this._shown) {
            cards.translation_y = slide * 48;
            cards.opacity = 0;
            this._ease(cards, { translation_y: 0, opacity: 255 }, { duration: this._env.ms(300), curve: 'emphasized' });
        }
    }

    // The floor eases to its new size when entries come and go
    _placeFloor(old, floor) {
        const f = this._floor;
        const animate = !!old && this._shown && old.x === floor.x && (old.y !== floor.y || old.height !== floor.height);
        if (!animate) {
            f.remove_all_transitions();
            f.set_position(floor.x, floor.y);
            f.set_size(floor.width, floor.height);
            return;
        }
        f.set_position(floor.x, old.y);
        f.set_size(floor.width, old.height);
        this._ease(f, { y: floor.y, height: floor.height }, { duration: this._env.ms(260), curve: 'standard' });
    }

    _makeCard(entry, rect, floor, scale) {
        const { side, tilt } = this._state;
        const angle = tiltAngle(side, tilt);
        const names = entry.names.filter(Boolean);
        const button = new St.Button({
            style_class: 'kiwi-stage-card', reactive: true, can_focus: true, track_hover: true,
            accessible_name: names.join(', ') || this._env.gettext('Window'),
        });
        // Cards live in the floor, which eases its y: keep them where the slots are on screen
        button.set_position(rect.x - floor.x, rect.y - floor.y);
        button.set_size(rect.width, rect.height);
        button.connect('clicked', () => {
            const [, , mods] = global.get_pointer();
            this._env.onActivate(entry.id, { add: (mods & Clutter.ModifierType.SHIFT_MASK) !== 0 });
        });

        const holder = new Clutter.Actor({ reactive: false });
        holder.set_size(rect.width, rect.height);
        button.set_child(holder);
        this._makeDraggable(button, holder, entry.id);

        const box = slotBox(rect, scale);
        const layers = stackLayers(entry.windows.length, side, { set: entry.set });
        let front = null;
        for (const layer of [...layers].reverse()) {
            const win = entry.windows[layer.index];
            const t = this._makeThumb(win, box, layer, scale, angle + layer.tilt) ??
                this._makeIconThumb(entry.app, win, box, layer, scale, angle + layer.tilt);
            t.actor.opacity = this._flying.has(win) ? 0 : layer.opacity;
            holder.add_child(t.actor);
            if (win) {
                this._thumbs.set(win, {
                    actor: t.actor, opacity: layer.opacity, angle: angle + layer.tilt, badge: null,
                    rect: { x: rect.x + t.rect.x, y: rect.y + t.rect.y, width: t.rect.width, height: t.rect.height },
                });
            }
            if (layer.index === 0)
                front = { ...t, win };
        }
        if (!front)
            return button;

        // Keyboard focus ring in the lead window's pose
        const ring = new St.Widget({ style_class: 'kiwi-stage-focus', reactive: false, visible: false });
        ring.set_position(Math.round(front.rect.x), Math.round(front.rect.y));
        ring.set_size(Math.round(front.rect.width), Math.round(front.rect.height));
        ring.set_pivot_point(0.5, 0.5);
        ring.rotation_angle_y = angle;
        holder.add_child(ring);
        button.connect('key-focus-in', () => (ring.visible = true));
        button.connect('key-focus-out', () => (ring.visible = false));

        const label = this._makeLabel(names, front.rect, rect);
        if (label)
            holder.add_child(label);
        // Hover: the lead window lifts, grows a little and turns toward you; the names fade in
        const rest = front.scale;
        button.connect('notify::hover', () => {
            const on = button.hover && !this._dragging;
            const k = on ? HOVER_SCALE : 1;
            const a = on ? angle * HOVER_TILT : angle;
            if (on)
                this._floor.set_child_above_sibling(button, null);
            const req = { duration: this._env.ms(200), curve: 'standard' };
            front.actor.remove_all_transitions();
            ring.remove_all_transitions();
            this._ease(front.actor, { scale_x: rest * k, scale_y: rest * k, scale_z: rest * k, rotation_angle_y: a }, req);
            this._ease(ring, { scale_x: k, scale_y: k, rotation_angle_y: a }, req);
            if (label) {
                label.remove_all_transitions();
                this._ease(label, { opacity: on ? 255 : 0, translation_y: on ? 0 : -4 },
                    { duration: this._env.ms(180), curve: 'enter' });
            }
        });

        if (entry.app) {
            const size = Math.round(METRICS.badge * scale);
            const icon = entry.app.create_icon_texture(size);
            icon.add_style_class_name('kiwi-stage-badge-icon');
            const badge = new St.Bin({ style_class: 'kiwi-stage-badge', child: icon, reactive: false });
            // Bottom right of the tilted lead window (its projected near edge)
            const r = front.rect;
            const halfW = r.width / 2 * Math.cos(angle * Math.PI / 180);
            const overhang = Math.round(size * 0.35);
            badge.set_position(Math.round(r.x + r.width / 2 + halfW - size + overhang),
                Math.round(r.y + r.height - size + overhang));
            holder.add_child(badge);
            const t = this._thumbs.get(front.win);
            if (t)
                t.badge = badge;
            if (this._flying.has(front.win))
                badge.opacity = 0;
        }
        return button;
    }

    _makeLabel(names, front, rect) {
        if (names.length === 0)
            return null;
        const text = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
        const label = new St.Label({ text, style_class: 'kiwi-stage-label-text' });
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const width = Math.round(rect.width + 24);
        const bin = new St.Bin({
            style_class: 'kiwi-stage-label', reactive: false, opacity: 0, translation_y: -4,
            x_align: Clutter.ActorAlign.CENTER, child: new St.Bin({ child: label }),
        });
        bin.set_position(Math.round(rect.width / 2 - width / 2), Math.round(front.y + front.height + 6));
        bin.set_width(width);
        return bin;
    }

    // Drag an entry: a clone of its stack follows the pointer; dropped on the stage it joins the set
    _makeDraggable(button, holder, entryId) {
        button._delegate = {
            kiwiStageEntry: entryId,
            getDragActor: () => {
                const clone = new Clutter.Clone({ source: holder, reactive: false });
                clone.set_size(holder.width, holder.height);
                return clone;
            },
            getDragActorSource: () => holder,
        };
        const draggable = DND.makeDraggable(button, { restoreOnSuccess: false });
        draggable.connect('drag-begin', () => {
            this._dragging = entryId;
            holder.opacity = DRAG_OPACITY;
            this._showDropTarget(true);
            this._syncShown();
        });
        draggable.connect('drag-end', () => {
            if (this._dragging !== entryId)
                return;
            this._dragging = null;
            this._showDropTarget(false);
            if (!this._dead && holder.get_stage())
                holder.opacity = 255;
            if (this._pending) {
                this._pending = false;
                this._rebuild(0);
            } else {
                this._syncShown();
            }
        });
    }

    _showDropTarget(on) {
        const wa = this._state.workArea;
        if (!on || !wa || !this._floorRect) {
            this._drop.visible = false;
            return;
        }
        // The stage: the work area beside the strip band
        const left = this._state.side === 'left';
        const x = left ? this._floorRect.x + this._floorRect.width + 12 : wa.x + 12;
        const right = left ? wa.x + wa.width - 12 : this._floorRect.x - 12;
        this._drop.set_position(x, wa.y + 12);
        this._drop.set_size(Math.max(1, right - x), Math.max(1, wa.height - 24));
        this._drop.visible = true;
    }

    // One window: its live clone (the whole buffer, shadow included) posed so the frame fills
    // its layer rect, turned by `angle` about the frame centre.
    _makeThumb(win, box, layer, scale, angle) {
        const actor = win?.get_compositor_private?.();
        if (!actor)
            return null;
        const frame = win.get_frame_rect();
        const buffer = win.get_buffer_rect();
        if (!(frame.width > 0) || !(frame.height > 0))
            return null;
        const rect = layerRect(frame, box, layer, scale);
        const pose = clonePose(frame, buffer, rect);
        if (!pose)
            return null;
        const clone = new Clutter.Clone({ source: actor, reactive: false });
        clone.set_size(buffer.width, buffer.height);
        clone.set_pivot_point(pose.pivotX, pose.pivotY);
        clone.set_position(Math.round(pose.x), Math.round(pose.y));
        clone.set_scale(pose.scale, pose.scale);
        clone.scale_z = pose.scale;
        clone.rotation_angle_y = angle;
        const dx = Math.round(pose.x) - pose.x;
        const dy = Math.round(pose.y) - pose.y;
        return { actor: clone, rect: { ...rect, x: rect.x + dx, y: rect.y + dy }, scale: pose.scale };
    }

    // A window with no actor yet: its app icon on a rounded tile, same pose
    _makeIconThumb(app, win, box, layer, scale, angle) {
        const f = win?.get_frame_rect?.();
        const frame = f?.width > 0 && f?.height > 0 ? f : { width: 16, height: 10 };
        const rect = layerRect(frame, box, layer, scale);
        const tile = new St.Widget({ style_class: 'kiwi-stage-icon-tile', layout_manager: new Clutter.BinLayout(), reactive: false });
        tile.set_position(Math.round(rect.x), Math.round(rect.y));
        tile.set_size(Math.round(rect.width), Math.round(rect.height));
        tile.set_pivot_point(0.5, 0.5);
        tile.rotation_angle_y = angle;
        const size = Math.round(48 * scale);
        const icon = app?.create_icon_texture(size) ??
            new St.Icon({ icon_name: 'application-x-executable-symbolic', icon_size: size });
        icon.x_align = Clutter.ActorAlign.CENTER;
        icon.y_align = Clutter.ActorAlign.CENTER;
        tile.add_child(icon);
        return { actor: tile, rect: { x: tile.x, y: tile.y, width: tile.width, height: tile.height }, scale: 1 };
    }

    // ---- edge reveal ---------------------------------------------------------------------------

    _dropBarrier() {
        if (!this._barrier)
            return;
        this._pressure.removeBarrier(this._barrier);
        this._barrier.destroy();
        this._barrier = null;
    }

    // A barrier on the strip's edge while the strip can be hidden and has entries
    _syncBarrier() {
        if (this._dead)
            return;
        const { side, workArea, showRecent, autohide, suppressed } = this._state;
        const lm = Main.layoutManager;
        const monitor = lm.primaryMonitor;
        const want = (!showRecent || autohide) && !suppressed && workArea && this._floorRect && monitor
            ? edgeBarrier(workArea, monitor, lm.monitors.filter(m => m !== monitor), side)
            : null;
        const key = want ? `${want.x1},${want.y1},${want.y2},${want.direction}` : '';
        if (key === this._barrierKey)
            return;
        this._barrierKey = key;
        this._dropBarrier();
        if (!want)
            return;
        this._barrier = new Meta.Barrier({
            backend: global.backend,
            x1: want.x1, x2: want.x2, y1: want.y1, y2: want.y2,
            directions: want.direction === 'negative' ? Meta.BarrierDirection.NEGATIVE_X : Meta.BarrierDirection.POSITIVE_X,
        });
        this._pressure.addBarrier(this._barrier);
    }

    _edgePushed() {
        this._edge = true;
        this._syncShown();
        // A push is a moment: it lasts until the pointer leaves the floor, or this hold ends
        this._cleanup.release(this._edgeToken);
        this._edgeToken = this._cleanup.timeout(1200, () => {
            this._edgeToken = 0;
            this._edge = false;
            this._syncShown();
            return false;
        }, { name: 'stage-strip-edge' });
    }

    _syncShown() {
        if (this._dead)
            return;
        const s = this._state;
        const show = !!this._floorRect && stripVisible({
            showRecent: s.showRecent, autohide: s.autohide, overlapped: s.overlapped,
            suppressed: s.suppressed,
            revealed: this._edge || this._floor.hover || !!this._dragging || !!this._dropHint,
        });
        if (show === this._shown)
            return;
        const first = this._shown === null || !this._floorRect;
        this._shown = show;
        this._env.onLayout?.();
        const strip = this._strip;
        strip.remove_all_transitions();
        const away = this._awayX();
        if (show) {
            strip.visible = true;
            if (first) {
                strip.translation_x = 0;
                strip.opacity = 255;
                return;
            }
            this._ease(strip, { translation_x: 0, opacity: 255 }, { duration: this._env.ms(300), curve: 'emphasized' });
            return;
        }
        if (first || !this._floorRect) {
            strip.translation_x = away;
            strip.opacity = 0;
            strip.visible = false;
            return;
        }
        this._ease(strip, { translation_x: away, opacity: 0 }, {
            duration: this._env.ms(260), curve: 'exit',
            onDone: finished => {
                if (finished && !this._dead && this._shown === false)
                    strip.visible = false;
            },
        });
    }

    // How far the strip slides to leave the screen
    _awayX() {
        const wa = this._state.workArea;
        const f = this._floorRect;
        if (!wa || !f)
            return 0;
        return this._state.side === 'right' ? wa.x + wa.width - f.x + 16 : -(f.x - wa.x + f.width + 16);
    }
}
