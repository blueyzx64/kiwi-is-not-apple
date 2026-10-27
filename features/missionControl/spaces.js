// SPDX-License-Identifier: GPL-3.0-or-later
// The Spaces bar: GNOME's own workspace thumbnails (ThumbnailsBox) along the top of the
// overview, dressed as macOS Mission Control's bar. Kiwi adds, in one chrome layer above it:
//   - a label under each Space ("Desktop 1", or the app of a full-screen Space);
//   - a × on the hovered Space that removes it (its windows go to the neighbour, Mutter's rule);
//   - a + after the last Space that adds one;
//   - dragging a label along the bar reorders the Spaces.
// The thumbnails themselves (live windows, dropping a window on a Space, the active frame)
// stay the stock ones. The bar always shows, also with one Space (macOS), and hides in App
// Exposé.
//
// Shell API (GNOME 50, js/ui/workspaceThumbnail.js): ThumbnailsBox._thumbnails, ._shouldShow,
// ._updateShouldShow(), addThumbnails/removeThumbnails, ._maxThumbnailScale, ThumbnailState;
// WorkspaceThumbnail.metaWorkspace, .state; js/ui/dnd.js makeDraggable;
// Meta.WorkspaceManager append_new_workspace / remove_workspace / reorder_workspace.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import { ThumbnailsBox, ThumbnailState } from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';

import { CleanupRegistry } from '../../lib/disposables.js';
import { canRemoveSpace, reorderIndex, spaceLabels } from './model.js';

// macOS's bar is about twice GNOME's 5 % thumbnails
const THUMBNAIL_SCALE = 0.15;
const LABEL_GAP = 6;
const LABEL_SPILL = 18;
const CLOSE_INSET = 8;
const PLUS_GAP = 16;

export class SpacesBar {
    /**
     * @param {object} host the MissionControl adapter: spacesBarWanted(), spaces(), _
     * @param {ThumbnailsBox} box the overview's thumbnails box
     * @param {CleanupRegistry} cleanup
     */
    constructor(host, box, cleanup) {
        this._host = host;
        this._box = box;
        this._cleanup = cleanup;
        this._decor = new Map(); // WorkspaceThumbnail -> {label, close, cleanup}
        this._hovered = null;
        this._laterId = 0;
        this._dragging = false;
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
        c.add(() => box.remove_style_class_name('kiwi-mc-spaces-box'));

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
                    self.queueSync();
                return r;
            });
        }
        box._updateShouldShow();

        // The chrome layer, in stage coordinates (overviewGroup covers the stage)
        this._layer = c.actor(new St.Widget({ name: 'kiwi-mc-spaces', style_class: 'kiwi-mc-spaces' }));
        Main.layoutManager.overviewGroup.add_child(this._layer);
        const opacity = box.bind_property('opacity', this._layer, 'opacity', GObject.BindingFlags.SYNC_CREATE);
        c.add(() => opacity.unbind());

        // A drop zone over the bar, reactive only while a Space label is dragged
        this._dropZone = new St.Widget({ reactive: false });
        this._dropZone._delegate = {
            handleDragOver: source => (source?.kiwiSpace ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.CONTINUE),
            acceptDrop: (source, _actor, x) => this._dropSpace(source, x),
        };
        this._layer.add_child(this._dropZone);

        const _ = this._host._;
        this._plus = new St.Button({
            style_class: 'kiwi-mc-space-add',
            accessible_name: _('Add Desktop'),
            child: new St.Icon({ icon_name: 'list-add-symbolic', icon_size: 16 }),
            can_focus: true,
        });
        c.connect(this._plus, 'clicked', () => this._addSpace());
        this._layer.add_child(this._plus);

        c.connect(box, 'notify::visible', () => this.queueSync());
        c.connect(box, 'notify::allocation', () => this.queueSync());
        c.connect(box, 'motion-event', (_a, event) => {
            this._setHovered(this._thumbnailAt(event.get_coords()[0]));
            return Clutter.EVENT_PROPAGATE;
        });
        c.connect(box, 'leave-event', (_a, event) => {
            // Moving onto a Space's × (or label) keeps that Space hovered
            const to = event.get_related?.();
            if (!to || !this._layer.contains(to))
                this._setHovered(null);
            return Clutter.EVENT_PROPAGATE;
        });
        c.connect(global.workspace_manager, 'workspaces-reordered', () => this.queueSync());
        c.connect(global.workspace_manager, 'notify::n-workspaces', () => this.queueSync());
        c.connect(Main.overview, 'hidden', () => this._undecorateAll());
        c.add(() => this._undecorateAll());
        c.add(() => this._cancelLater());
        this.queueSync();
    }

    /**
     * Re-place the chrome before the next frame (one pass per frame at most), when the
     * thumbnails' sizes and positions are those of the last layout. A change laid out in the
     * frame that asked leaves no frame behind to run it, so one is requested.
     */
    queueSync() {
        if (this._laterId)
            return;
        const laters = global.compositor.get_laters();
        this._laterId = laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._laterId = 0;
            this._sync();
            return false;
        });
        global.stage.queue_redraw();
    }

    _cancelLater() {
        if (this._laterId)
            global.compositor.get_laters().remove(this._laterId);
        this._laterId = 0;
    }

    /** The live thumbnails (not sliding out), in workspace order. */
    _thumbnails() {
        return (this._box._thumbnails ?? []).filter(t => t.state <= ThumbnailState.NORMAL);
    }

    _sync() {
        const box = this._box;
        const thumbs = this._thumbnails();
        const shown = box.visible && box.mapped && this._host.spacesBarWanted() && thumbs.length > 0;
        this._layer.visible = shown;
        if (!shown)
            return;

        // Drop decorations of thumbnails that are gone or sliding out
        for (const t of [...this._decor.keys()]) {
            if (!thumbs.includes(t))
                this._undecorate(t);
        }
        const labels = spaceLabels(this._host.spaces(thumbs.map(t => t.metaWorkspace)),
            n => this._host._('Desktop %d').format(n));
        const removable = canRemoveSpace(thumbs.length) && this._host.staticSpaces();
        let right = 0, top = Infinity, bottom = 0, laidOut = true;
        thumbs.forEach((t, i) => {
            // A new Space has no size until the box allocates it (its natural size is the
            // whole screen): it is placed on a later frame
            if (!t.has_allocation()) {
                laidOut = false;
                return;
            }
            const d = this._decor.get(t) ?? this._decorate(t);
            const [x, y] = t.get_transformed_position();
            const [w, h] = t.get_transformed_size();
            d.label.text = labels[i].label;
            d.label.accessible_name = labels[i].label;
            d.close.accessible_name = this._host._('Remove %s').replace('%s', labels[i].label);
            // Measured at its natural width: a width set earlier would be read back as that
            // width, and a label narrowed while its Space slid would stay narrow
            d.label.set_width(-1);
            const [, lw] = d.label.get_preferred_width(-1);
            // A label may be wider than its Space, up to the gap to the next one
            const width = Math.min(lw, w + LABEL_SPILL);
            d.label.set_size(width, -1);
            d.label.set_position(Math.round(x + (w - width) / 2), Math.round(y + h + LABEL_GAP));
            d.close.set_position(Math.round(x - CLOSE_INSET), Math.round(y - CLOSE_INSET));
            d.removable = removable;
            right = Math.max(right, x + w);
            top = Math.min(top, y);
            bottom = Math.max(bottom, y + h);
        });
        // The overview's own slide and zoom move the bar without reallocating a thumbnail, so
        // the chrome follows every frame until it is still
        if (!laidOut || Main.overview.animationInProgress)
            this.queueSync();
        if (top === Infinity)
            return;
        this._syncClose();
        const [, pw] = this._plus.get_preferred_width(-1);
        const [, ph] = this._plus.get_preferred_height(-1);
        this._plus.visible = this._host.staticSpaces();
        this._plus.set_position(Math.round(right + PLUS_GAP), Math.round(top + (bottom - top - ph) / 2));
        this._plus.set_size(pw, ph);
        const [bx, by] = box.get_transformed_position();
        const [bw] = box.get_transformed_size();
        this._dropZone.set_position(bx, by);
        this._dropZone.set_size(bw, Math.max(1, bottom - by + 40));
    }

    _decorate(t) {
        const cleanup = new CleanupRegistry();
        const label = cleanup.actor(new St.Label({ style_class: 'kiwi-mc-space-label', reactive: true, track_hover: true, can_focus: true }));
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const close = cleanup.actor(new St.Button({
            style_class: 'kiwi-mc-space-close',
            accessible_name: this._host._('Remove Desktop'),
            child: new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 10 }),
            track_hover: true,
            visible: false,
        }));
        this._layer.add_child(label);
        this._layer.add_child(close);
        // The wallpaper behind the windows, as in macOS (the stock thumbnail is a grey plate)
        const wallpaper = new Background.BackgroundManager({
            container: t._contents, monitorIndex: t.monitorIndex, vignette: false,
        });
        wallpaper.backgroundActor.content.brightness = 1;
        cleanup.add(() => wallpaper.destroy());
        const d = { label, close, cleanup, removable: false };
        cleanup.connect(close, 'clicked', () => this._removeSpace(t.metaWorkspace));
        cleanup.connect(close, 'notify::hover', () => this._syncClose());
        cleanup.connect(label, 'notify::hover', () => this._setHovered(label.hover ? t : this._hovered));
        // Keyboard: a focused label stands for its Space (the pointer's hover), and Delete removes it
        cleanup.connect(label, 'key-focus-in', () => this._setHovered(t));
        cleanup.connect(label, 'key-focus-out', () => this._setHovered(null));
        cleanup.connect(label, 'key-press-event', (_a, event) => {
            const sym = event.get_key_symbol();
            if ((sym !== Clutter.KEY_Delete && sym !== Clutter.KEY_BackSpace) || !d.removable)
                return Clutter.EVENT_PROPAGATE;
            this._removeSpace(t.metaWorkspace);
            return Clutter.EVENT_STOP;
        });
        // Watch this thumbnail (it slides and collapses when Spaces come and go)
        cleanup.connect(t, 'notify::allocation', () => this.queueSync());
        // The slide-in and slide-out scale the thumbnail without reallocating it
        cleanup.connect(t, 'notify::slide-position', () => this.queueSync());
        cleanup.connect(t, 'destroy', () => this._undecorate(t));

        // Drag the label along the bar to reorder
        label._delegate = {
            kiwiSpace: t.metaWorkspace,
            getDragActor: () => new Clutter.Clone({ source: t, width: t.width, height: t.height, opacity: 220 }),
            getDragActorSource: () => t,
        };
        const draggable = DND.makeDraggable(label, { restoreOnSuccess: false });
        cleanup.connect(draggable, 'drag-begin', () => this._setDragging(true));
        cleanup.connect(draggable, 'drag-end', () => this._setDragging(false));
        cleanup.connect(draggable, 'drag-cancelled', () => this._setDragging(false));
        this._decor.set(t, d);
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
            d.close.visible = d.removable && !this._dragging && (t === this._hovered || d.close.hover);
    }

    _setDragging(on) {
        this._dragging = on;
        if (this._dropZone)
            this._dropZone.reactive = on;
        this._syncClose();
    }

    _addSpace() {
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
        const [zx] = this._dropZone.get_transformed_position();
        const centres = this._thumbnails().map(t => {
            const [tx] = t.get_transformed_position();
            const [tw] = t.get_transformed_size();
            return tx + tw / 2;
        });
        const target = reorderIndex(centres, zx + x);
        if (target !== ws.index())
            global.workspace_manager.reorder_workspace(ws, target);
        return true;
    }
}
