// SPDX-License-Identifier: GPL-3.0-or-later
// The Spaces bar: GNOME's own workspace thumbnails (ThumbnailsBox) along the top of the
// overview, dressed as macOS Mission Control's bar. Kiwi adds, as children of the thumbnails (so
// they stack, slide and fade with them, under the windows the overview animates):
//   - a label for each Space ("Desktop 1", or the app of a full-screen Space);
//   - a × on the hovered Space that removes it (its windows go to the neighbour, Mutter's rule);
//   - dragging a label along the bar reorders the Spaces.
// As on macOS the bar opens collapsed, a row of names with the current Space's in a soft
// pill. It expands into thumbnails (wallpaper and windows, the current one softly framed)
// while the pointer is at the top of the screen, a name has the keyboard focus or something is
// dragged, and collapses again shortly after. The overview keeps its grab on the stage, so the
// pointer is followed with the stage's captured events, only while Mission Control is open.
// The + that adds a Space sits at the right end of the screen and shows only expanded.
// The thumbnails themselves (live windows, dropping a window on a Space) stay the stock ones.
// The bar always shows, also with one Space (macOS), and hides in App Exposé.
//
// Shell API (GNOME 50, js/ui/workspaceThumbnail.js): ThumbnailsBox._thumbnails, ._shouldShow,
// ._updateShouldShow(), addThumbnails/removeThumbnails, ._maxThumbnailScale, ThumbnailState;
// ThumbnailsBox.handleDragOver/acceptDrop, WorkspaceThumbnail.metaWorkspace, .state, ._viewport,
// .collapseFraction; js/ui/dnd.js makeDraggable;
// Meta.WorkspaceManager append_new_workspace / remove_workspace / reorder_workspace.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import { ThumbnailsBox, ThumbnailState } from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';

import { CleanupRegistry } from '../../lib/disposables.js';
import { barExpanded, canRemoveSpace, centringShift, plusPlace, reorderIndex, spaceLabels } from './model.js';

// macOS's expanded bar is about twice GNOME's 5 % thumbnails
const THUMBNAIL_SCALE = 0.15;
const LABEL_GAP = 6;
const LABEL_SPILL = 18;
const CLOSE_INSET = 8;
const PLUS_MARGIN = 24;
const COLLAPSE_DELAY_MS = 300;   // leaving the top of the screen, the bar waits this long

/**
 * Whether an actor has been laid out at a real size. Not has_allocation(): read from inside a
 * notify::allocation handler (the box allocating its thumbnails) it says false while the
 * new box is already set, and on a touchpad swipe into Mission Control those are the only
 * allocations the thumbnails get, so the + stayed hidden.
 */
const laidOut = actor => !!actor?.get_parent() && actor.get_allocation_box().get_width() > 0;

export class SpacesBar {
    /**
     * @param {object} host the MissionControl adapter: spacesBarWanted(), spaces(), _
     * @param {ThumbnailsBox} box the overview's thumbnails box
     * @param {CleanupRegistry} cleanup
     * @param {object} motion ctx.motion (core/motion.js)
     */
    constructor(host, box, cleanup, motion) {
        this._host = host;
        this._box = box;
        this._cleanup = cleanup;
        this._motion = motion;
        this._decor = new Map(); // WorkspaceThumbnail -> {label, close, cleanup}
        this._plus = null;
        this._hovered = null;
        this._dragging = false;      // a Space label along the bar
        this._windowDrag = false;    // a window or an app (onto a Space)
        this._focus = false;         // a Space label has the keyboard focus
        this._pointerIn = false;     // the pointer is at the top of the screen
        this._expanded = false;
        this._zone = null;           // the stage area that expands the bar
        this._watch = 0;             // the stage's captured-event, while Mission Control is open
        this._collapseToken = 0;
        this._leaving = false;       // Mission Control is closing: nothing expands it again
    }

    enable() {
        const c = this._cleanup;
        const box = this._box;
        const self = this;

        // Bigger thumbnails (an own property over the stock constant)
        const hadScale = Object.prototype.hasOwnProperty.call(box, '_maxThumbnailScale');
        const oldScale = box._maxThumbnailScale;
        c.add(() => {
            if (hadScale)
                box._maxThumbnailScale = oldScale;
            else
                delete box._maxThumbnailScale;
            box.queue_relayout();
        });
        box._maxThumbnailScale = THUMBNAIL_SCALE;
        box.add_style_class_name('kiwi-mc-spaces-box');
        box.add_style_class_name('kiwi-mc-collapsed');
        c.add(() => {
            box.remove_style_class_name('kiwi-mc-spaces-box');
            box.remove_style_class_name('kiwi-mc-collapsed');
        });
        c.add(() => {
            box.translation_x = 0;
            box._indicator?.remove_all_transitions();
            if (box._indicator)
                box._indicator.opacity = 255;
        });

        // Always shown in Mission Control, hidden in App Exposé. Registered before the
        // injection so the stock rule runs again after it is gone.
        c.add(() => box._updateShouldShow?.());
        c.inject(ThumbnailsBox.prototype, '_updateShouldShow', function (orig, ...args) {
            if (this !== box)
                return orig.apply(this, args);
            const want = self._host.spacesBarWanted();
            if (this._shouldShow === want)
                return undefined;
            this._shouldShow = want;
            this.notify('should-show');
            return undefined;
        });
        for (const name of ['addThumbnails', 'removeThumbnails']) {
            c.inject(ThumbnailsBox.prototype, name, function (orig, ...args) {
                const r = orig.apply(this, args);
                if (this === box)
                    self._refresh();
                return r;
            });
        }
        // A Space label dropped on the bar reorders the Spaces (the bar is the drop target
        // for windows already; any other source is left to the stock rules)
        c.inject(ThumbnailsBox.prototype, 'handleDragOver', function (orig, source, ...args) {
            if (this === box && source?.kiwiSpace)
                return DND.DragMotionResult.MOVE_DROP;
            return orig.call(this, source, ...args);
        });
        c.inject(ThumbnailsBox.prototype, 'acceptDrop', function (orig, source, actor, x, ...args) {
            if (this === box && source?.kiwiSpace)
                return self._dropSpace(source, x);
            return orig.call(this, source, actor, x, ...args);
        });
        box._updateShouldShow();

        c.connect(box, 'motion-event', (_a, event) => {
            this._setHovered(this._thumbnailAt(event.get_coords()[0]));
            return Clutter.EVENT_PROPAGATE;
        });
        c.connect(box, 'leave-event', (_a, event) => {
            // Moving onto a Space's × (or label) keeps that Space hovered
            const to = event.get_related?.();
            if (!to || !box.contains(to))
                this._setHovered(null);
            return Clutter.EVENT_PROPAGATE;
        });
        c.connect(global.workspace_manager, 'workspaces-reordered', () => this._refresh());
        c.connect(global.workspace_manager, 'notify::n-workspaces', () => this._refresh());
        c.connect(global.workspace_manager, 'active-workspace-changed', () => this._syncActive());

        // The + at the right end of the screen, above the overview (it shows only expanded)
        this._plus = c.actor(new St.Button({
            style_class: 'kiwi-mc-space-add',
            accessible_name: this._host._('Add Desktop'),
            child: new St.Icon({ icon_name: 'list-add-symbolic', icon_size: 14 }),
            can_focus: true,
            track_hover: true,
            visible: false,
            opacity: 0,
        }));
        c.connect(this._plus, 'clicked', () => this._addSpace());
        c.connect(this._plus, 'notify::hover', () => this._syncExpanded());
        c.connect(this._plus, 'key-focus-in', () => this._setFocus(true));
        c.connect(this._plus, 'key-focus-out', () => this._setFocus(false));
        Main.layoutManager.overviewGroup.add_child(this._plus);

        // Every opening starts collapsed, as on macOS
        c.connect(Main.overview, 'showing', () => {
            this._leaving = false;
            this._zone = null;
            this._pointerIn = false;
            this._windowDrag = false;
            this._focus = false;
            this._setExpanded(false, false);
            this._watchPointer(this._host.spacesBarWanted());
        });
        // Leaving: the + and the thumbnails go with the rest of Mission Control
        c.connect(Main.overview, 'hiding', () => {
            this._leaving = true;
            this._watchPointer(false);
            this._cancelCollapse();
            this._setExpanded(false, true);
        });
        c.connect(Main.overview, 'hidden', () => {
            this._watchPointer(false);
            this._cancelCollapse();
            this._undecorateAll();
        });
        // Once Mission Control is fully in: place everything again, whatever the order of
        // the allocations on the way in (keyboard and swipe differ), and expand at once when
        // the pointer is already at the top
        c.connect(Main.overview, 'shown', () => {
            this._placeAll();
            this._zone = this._measureZone();
            const [x, y] = global.get_pointer();
            this._pointerIn = this._inZone(x, y);
            this._syncExpanded();
        });
        for (const [signal, on] of [['window-drag-begin', true], ['window-drag-end', false],
            ['window-drag-cancelled', false], ['item-drag-begin', true], ['item-drag-end', false],
            ['item-drag-cancelled', false]]) {
            c.connect(Main.overview, signal, () => {
                this._windowDrag = on;
                this._syncExpanded();
            });
        }
        c.connect(box, 'notify::allocation', () => {
            this._zone = null;
        });
        c.add(() => {
            this._watchPointer(false);
            this._cancelCollapse();
        });
        c.add(() => this._undecorateAll());
        this._refresh();
    }

    /** The live thumbnails (not sliding out), in workspace order. */
    _thumbnails() {
        return (this._box._thumbnails ?? []).filter(t => t.state <= ThumbnailState.NORMAL);
    }

    /**
     * Dress the live Spaces: decorations for new ones, none for those gone, the labels, the
     * × and the +. The chrome are children of the thumbnails, so they slide, fade and scale
     * with them (the overview's own transition, a Space coming or going) and need no
     * per-frame follow-up; only positions that depend on a thumbnail's size are set, as that
     * thumbnail is allocated (see _place), so they are never a frame behind.
     */
    _refresh() {
        const thumbs = this._thumbnails();
        for (const t of [...this._decor.keys()]) {
            if (!thumbs.includes(t))
                this._undecorate(t);
        }
        if (!thumbs.length)
            return;
        const labels = spaceLabels(this._host.spaces(thumbs.map(t => t.metaWorkspace)),
            n => this._host._('Desktop %d').format(n));
        const removable = canRemoveSpace(thumbs.length) && this._host.staticSpaces();
        thumbs.forEach((t, i) => {
            const d = this._decor.get(t) ?? this._decorate(t);
            d.label.text = labels[i].label;
            d.label.accessible_name = labels[i].label;
            d.close.accessible_name = this._host._('Remove %s').replace('%s', labels[i].label);
            d.removable = removable;
        });
        // The current name is bold: measured once it has its pseudo class
        this._syncActive();
        this._syncClose();
        this._placePlus();
        this._centre();
    }

    _placeAll() {
        for (const t of this._decor.keys())
            this._place(t);
        this._placePlus();
        this._centre();
    }

    /**
     * The stock box centres its thumbnails as if every Space, one still collapsing in or out
     * included, had its full width, and as if the box got the width it asks for: the group
     * jumps aside when a Space is added or removed and glides back as it expands, and with
     * many Spaces it sits off the screen's centre. The bar is shifted by the difference, on
     * every frame of that animation (a transform, so no relayout).
     */
    _centre() {
        const box = this._box;
        const first = box._thumbnails?.[0];
        box.translation_x = laidOut(first) ? Math.round(centringShift({
            maxWidth: box._maxThumbnailScale * box._porthole.width,
            thumbnailWidth: first.get_allocation_box().get_width(),
            spacing: box.get_theme_node().get_length('spacing'),
            available: box.get_parent().get_allocation_box().get_width(),
            collapse: box._thumbnails.map(t => t.collapseFraction),
        })) : 0;
    }

    /**
     * Position what depends on a thumbnail's size. Translations only (no relayout), set
     * while the box allocates the thumbnail, so the chrome is on the frame that paints it.
     */
    _place(t) {
        const d = this._decor.get(t);
        if (!d || !laidOut(t))
            return;
        // The allocation, not width and height: those read the preferred size while the
        // thumbnail waits for a layout, which this very pass is
        const w = t.get_allocation_box().get_width();
        const width = Math.min(d.labelWidth, w + LABEL_SPILL);
        if (d.label.width !== width)
            d.label.set_width(width);
        d.label.translation_x = Math.round((w - width) / 2);
        // Not while the bar expands or collapses: that animation moves it
        if (!d.label.get_transition('translation-y'))
            d.label.translation_y = this._labelY(t);
    }

    /** Collapsed: the names in a row at the top. Expanded: under the thumbnails. */
    _labelY(t) {
        return this._expanded ? Math.round(t.get_allocation_box().get_height() + LABEL_GAP) : 0;
    }

    /** The + at the right end of the screen, on the thumbnails' vertical centre. */
    _placePlus() {
        const plus = this._plus;
        const first = this._thumbnails()[0];
        const m = Main.layoutManager.monitors[this._box._monitorIndex ?? Main.layoutManager.primaryIndex];
        if (!plus || !m || !laidOut(first) || !Main.overview.visible)
            return;
        const [, ty] = first.get_transformed_position();
        const [, th] = first.get_transformed_size();
        const [, pw] = plus.get_preferred_width(-1);
        const [, ph] = plus.get_preferred_height(-1);
        const p = plusPlace({ stripWidth: m.width, plusWidth: pw, plusHeight: ph, centreY: ty + th / 2 - m.y, margin: PLUS_MARGIN });
        plus.set_position(m.x + p.x, m.y + p.y);
        const og = Main.layoutManager.overviewGroup;
        if (plus.get_parent() === og)
            og.set_child_above_sibling(plus, null);
    }

    // ---- collapsed and expanded ----------------------------------------------------------

    /** The top of the screen, down to the bar's bottom edge (labels included). */
    _measureZone() {
        const box = this._box;
        const m = Main.layoutManager.monitors[box._monitorIndex ?? Main.layoutManager.primaryIndex];
        if (!m || !laidOut(box) || !Main.overview.visible)
            return null;
        const [, by] = box.get_transformed_position();
        const [, bh] = box.get_transformed_size();
        return { x1: m.x, x2: m.x + m.width, y1: m.y, y2: by + bh };
    }

    _inZone(x, y) {
        const z = this._zone ?? (this._zone = this._measureZone());
        return !!z && x >= z.x1 && x < z.x2 && y >= z.y1 && y < z.y2;
    }

    _watchPointer(on) {
        if (!on) {
            if (this._watch)
                this._cleanup.release(this._watch);
            this._watch = 0;
            return;
        }
        if (this._watch)
            return;
        this._watch = this._cleanup.connect(global.stage, 'captured-event', (_s, event) => {
            const type = event.type();
            if (type !== Clutter.EventType.MOTION && type !== Clutter.EventType.ENTER &&
                type !== Clutter.EventType.LEAVE)
                return Clutter.EVENT_PROPAGATE;
            const [x, y] = event.get_coords();
            const inside = this._inZone(x, y);
            if (inside !== this._pointerIn) {
                this._pointerIn = inside;
                this._syncExpanded();
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _setFocus(on) {
        this._focus = on;
        this._syncExpanded();
    }

    /** Expand at once; collapse a moment later, unless something wants it open again. */
    _syncExpanded() {
        const want = this._host.spacesBarWanted() && Main.overview.visible && !this._leaving && barExpanded({
            hover: this._pointerIn || !!this._plus?.hover,
            focus: this._focus,
            dragging: this._dragging || this._windowDrag,
        });
        if (want) {
            this._cancelCollapse();
            this._setExpanded(true, true);
            return;
        }
        if (!this._expanded || this._collapseToken)
            return;
        this._collapseToken = this._cleanup.timeout(COLLAPSE_DELAY_MS, () => {
            this._collapseToken = 0;
            this._setExpanded(false, true);
            return GLib.SOURCE_REMOVE;
        }, { name: 'kiwi-mc-spaces-collapse' });
    }

    _cancelCollapse() {
        if (this._collapseToken)
            this._cleanup.release(this._collapseToken);
        this._collapseToken = 0;
    }

    _setExpanded(on, animate) {
        if (on === this._expanded && animate)
            return;
        this._expanded = on;
        const box = this._box;
        if (on)
            box.remove_style_class_name('kiwi-mc-collapsed');
        else
            box.add_style_class_name('kiwi-mc-collapsed');
        for (const t of this._decor.keys())
            this._dressThumbnail(t, animate);
        this._to(box._indicator, { opacity: on ? 255 : 0 }, animate);

        const plus = this._plus;
        if (plus) {
            if (on) {
                this._placePlus();
                plus.visible = true;
            }
            this._to(plus, { opacity: on ? 255 : 0 }, animate, () => {
                if (!this._expanded)
                    plus.visible = false;
            });
        }
        this._syncClose();
    }

    /** A thumbnail's wallpaper and windows show only expanded; its name moves under it. */
    _dressThumbnail(t, animate) {
        const d = this._decor.get(t);
        if (!d)
            return;
        this._to(t._viewport, { opacity: this._expanded ? 255 : 0 }, animate);
        if (laidOut(t))
            this._to(d.label, { translation_y: this._labelY(t) }, animate);
    }

    /** Ease (or set) properties; onDone runs when it gets there. */
    _to(actor, props, animate, onDone = null) {
        if (!actor)
            return;
        if (animate) {
            this._motion.ease(actor, props, {
                duration: 'short', curve: 'standard', onDone: finished => finished && onDone?.(),
            }, this._cleanup);
            return;
        }
        for (const [k, v] of Object.entries(props)) {
            actor.remove_transition(k.replace(/_/g, '-'));
            actor[k] = v;
        }
        onDone?.();
    }

    /** The current Space's name is bold, and has the pill while collapsed; each name is measured again. */
    _syncActive() {
        const active = global.workspace_manager.get_active_workspace();
        for (const [t, d] of this._decor) {
            if (t.metaWorkspace === active)
                d.label.add_style_pseudo_class('checked');
            else
                d.label.remove_style_pseudo_class('checked');
            // At its natural width: a width set earlier would be read back as that width, and
            // a label narrowed while its Space slid would stay narrow
            d.label.set_width(-1);
            [, d.labelWidth] = d.label.get_preferred_width(-1);
            this._place(t);
        }
    }

    _decorate(t) {
        const cleanup = new CleanupRegistry();
        const label = cleanup.actor(new St.Label({ style_class: 'kiwi-mc-space-label kiwi-text-caption', reactive: true, track_hover: true, can_focus: true }));
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const close = cleanup.actor(new St.Button({
            style_class: 'kiwi-mc-space-close kiwi-toolbar-button',
            accessible_name: this._host._('Remove Desktop'),
            child: new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 10 }),
            track_hover: true,
            visible: false,
        }));
        // Children of the thumbnail, outside its edge: it no longer clips (its viewport does)
        t.clip_to_allocation = false;
        t._viewport.clip_to_allocation = true;
        cleanup.add(() => {
            t._viewport.clip_to_allocation = false;
            t.clip_to_allocation = true;
        });
        close.set_position(-CLOSE_INSET, -CLOSE_INSET);
        t.add_child(label);
        t.add_child(close);
        // The wallpaper behind the windows, as in macOS (the stock thumbnail is a grey plate).
        // Only the wallpaper and the windows: no desktop icons or widgets in the bar.
        const wallpaper = new Background.BackgroundManager({
            container: t._contents, monitorIndex: t.monitorIndex, vignette: false,
        });
        wallpaper.backgroundActor.content.brightness = 1;
        cleanup.add(() => wallpaper.destroy());
        cleanup.add(() => {
            t._viewport.remove_transition('opacity');
            t._viewport.opacity = 255;
        });
        const d = { label, close, cleanup, removable: false, labelWidth: 0 };
        cleanup.connect(close, 'clicked', () => this._removeSpace(t.metaWorkspace));
        cleanup.connect(close, 'notify::hover', () => this._syncClose());
        cleanup.connect(label, 'notify::hover', () => this._setHovered(label.hover ? t : this._hovered));
        // Keyboard: a focused label stands for its Space (the pointer's hover), and Delete removes it
        cleanup.connect(label, 'key-focus-in', () => {
            this._setHovered(t);
            this._setFocus(true);
        });
        cleanup.connect(label, 'key-focus-out', () => {
            this._setHovered(null);
            this._setFocus(false);
        });
        cleanup.connect(label, 'key-press-event', (_a, event) => {
            const sym = event.get_key_symbol();
            if ((sym !== Clutter.KEY_Delete && sym !== Clutter.KEY_BackSpace) || !d.removable)
                return Clutter.EVENT_PROPAGATE;
            this._removeSpace(t.metaWorkspace);
            return Clutter.EVENT_STOP;
        });
        // The box allocates a thumbnail as it slides, collapses and rescales
        cleanup.connect(t, 'notify::allocation', () => this._place(t));
        cleanup.connect(t, 'notify::collapse-fraction', () => this._centre());
        cleanup.connect(t, 'destroy', () => this._undecorate(t));

        // Drag the label along the bar to reorder
        label._delegate = {
            kiwiSpace: t.metaWorkspace,
            getDragActor: () => new Clutter.Clone({
                source: t._viewport, width: t._viewport.width, height: t._viewport.height,
                scale_x: t._viewport.scale_x, scale_y: t._viewport.scale_y, opacity: 220,
            }),
            getDragActorSource: () => t,
        };
        const draggable = DND.makeDraggable(label, { restoreOnSuccess: false });
        cleanup.connect(draggable, 'drag-begin', () => this._setDragging(true));
        cleanup.connect(draggable, 'drag-end', () => this._setDragging(false));
        cleanup.connect(draggable, 'drag-cancelled', () => this._setDragging(false));
        this._decor.set(t, d);
        // A Space added while the bar is open (the +) comes in in the bar's current state
        t._viewport.opacity = this._expanded ? 255 : 0;
        return d;
    }

    _undecorate(t) {
        const d = this._decor.get(t);
        if (!d)
            return;
        this._decor.delete(t);
        if (this._hovered === t)
            this._hovered = null;
        d.cleanup.dispose();
    }

    _undecorateAll() {
        for (const t of [...this._decor.keys()])
            this._undecorate(t);
        this._setDragging(false);
    }

    _thumbnailAt(stageX) {
        return this._thumbnails().find(t => {
            const [x] = t.get_transformed_position();
            const [w] = t.get_transformed_size();
            return stageX >= x && stageX <= x + w;
        }) ?? null;
    }

    _setHovered(t) {
        if (this._hovered === t)
            return;
        this._hovered = t;
        this._syncClose();
    }

    _syncClose() {
        for (const [t, d] of this._decor)
            d.close.visible = this._expanded && d.removable && !this._dragging && (t === this._hovered || d.close.hover);
    }

    _setDragging(on) {
        this._dragging = on;
        this._syncClose();
        this._syncExpanded();
    }

    _addSpace() {
        this._host.holdStaticSpaces();
        global.workspace_manager.append_new_workspace(false, global.get_current_time());
    }

    _removeSpace(ws) {
        const wm = global.workspace_manager;
        if (!ws || !canRemoveSpace(wm.n_workspaces) || ws.index() < 0)
            return;
        this._hovered = null;
        wm.remove_workspace(ws, global.get_current_time());
    }

    _dropSpace(source, x) {
        const ws = source?.kiwiSpace;
        if (!ws || ws.index() < 0)
            return false;
        // x is in the bar's own coordinates, as are the thumbnails' allocations
        const centres = this._thumbnails().map(t => {
            const b = t.get_allocation_box();
            return (b.x1 + b.x2) / 2;
        });
        const target = reorderIndex(centres, x);
        if (target !== ws.index())
            global.workspace_manager.reorder_workspace(ws, target);
        return true;
    }
}
