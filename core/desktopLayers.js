// SPDX-License-Identifier: GPL-3.0-or-later
// DesktopLayers: how the things Kiwi draws on the desktop share it. Desktop icons and desktop
// widgets both live in global.window_group above the wallpaper and below every window.
//
//   const layers = DesktopLayers.acquire(cleanup);
//   layers.stack(cleanup, { id: 'icons', rank: 10, actor });   // kept above the wallpaper, in rank order
//   const reserve = layers.reserve(cleanup, 'widgets');
//   reserve.set(rects);                                        // stage rectangles others flow around
//   layers.onReserved(cleanup, () => ...);                     // somebody else's rectangles changed
//   layers.reserved('icons');                                  // everyone's rectangles but 'icons'
//
// A layer sits right above the Shell's background group, or above the desktop-icons window of
// an extension that draws its own (DING), and is put back there whenever Mutter restacks.
// Ranks: icons 10, widgets 20 (a widget covers an icon, as on macOS).
//
// The overview shows the desktop (Kiwi's Mission Control fades the mirror out as it opens,
// features/missionControl/backdrop.js). The overview hides global.window_group, layers included,
// so while any layer is stacked every workspace background of the overview gets a mirror: a
// non-reactive container of Clutter.Clones of the layers on its monitor, on top of the
// wallpaper and below the window previews. The mirror scales with the wallpaper through the
// whole show and hide animation, so at both ends it sits exactly where the real layers are.
// Clones take no input: clicks go to Mission Control. `mirror(monitor)` hands out the same
// container for other places (the Spaces bar thumbnails). Every mirror goes with the last layer.
//
// Shell API (private, checked on 50.6): Main.layoutManager._backgroundGroup, overviewGroup;
// js/ui/workspace.js Workspace._background, WorkspaceBackground._backgroundGroup (covers the
// whole monitor, scaled so the work area fills the card) and monitor_index;
// js/ui/workspacesView.js WorkspacesView.prototype._updateWorkspaces and ._workspaces (a
// Space added while the overview is open).

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as WorkspacesView from 'resource:///org/gnome/shell/ui/workspacesView.js';

import { CleanupRegistry } from '../lib/disposables.js';
import { ReserveStore, mirrorRect, overlapsMonitor, stackOrder } from './desktopLayersModel.js';

export const RANKS = Object.freeze({ icons: 10, widgets: 20 });

/**
 * Lays a mirror's clones out at their layers' places on the monitor, scaled to the mirror's
 * size (the overview animates it from the whole monitor to the card and back). One reused
 * box: this runs on every frame of that animation.
 */
const MirrorLayout = GObject.registerClass(
class KiwiDesktopMirrorLayout extends Clutter.LayoutManager {
    _init(monitor) {
        super._init();
        this._monitor = monitor;
        this._box = new Clutter.ActorBox();
    }

    // No size of its own: it fills what it is given, and must not make the overview's
    // workspace (whose preferred size includes its background) any larger
    vfunc_get_preferred_width(_container, _forHeight) {
        return [0, 0];
    }

    vfunc_get_preferred_height(_container, _forWidth) {
        return [0, 0];
    }

    vfunc_allocate(container, box) {
        const m = this._monitor;
        const sx = box.get_width() / m.width;
        const sy = box.get_height() / m.height;
        const b = this._box;
        for (let child = container.get_first_child(); child; child = child.get_next_sibling()) {
            const src = child.source;
            if (src) {
                const r = mirrorRect(src, m, sx, sy);
                b.set_origin(r.x, r.y);
                b.set_size(r.width, r.height);
            } else {
                b.set_origin(0, 0);
                b.set_size(0, 0);
            }
            child.allocate(b);
        }
    }
});

class DesktopLayerService {
    constructor() {
        this._layers = [];            // {id, rank, actor, cleanup}
        this._reserve = new ReserveStore();
        this._listeners = new Set();
        this._restackId = 0;
        this._mirrors = new Set();    // {actor, monitor}
        this._overview = null;        // CleanupRegistry of the overview hooks, while layers exist
    }

    /**
     * Keep an actor in the desktop stack until `cleanup` is disposed. The caller adds the actor
     * to global.window_group (or not: it is added here when it has no parent).
     */
    stack(cleanup, layer) {
        const entry = { id: layer.id, rank: layer.rank, actor: layer.actor };
        this._layers.push(entry);
        if (!layer.actor.get_parent())
            global.window_group.add_child(layer.actor);
        if (!this._restackId)
            this._restackId = global.display.connect('restacked', () => this.restack());
        this.restack();
        this._hookOverview();
        this._refillMirrors();
        cleanup.add(() => {
            this._layers = this._layers.filter(l => l !== entry);
            if (!this._layers.length && this._restackId) {
                global.display.disconnect(this._restackId);
                this._restackId = 0;
            }
            if (this._layers.length)
                this._refillMirrors();
            else
                this._unhookOverview();
        });
    }

    // ---- mirrors (Mission Control) ------------------------------------------------------------

    /**
     * A new non-reactive container showing the layers on a monitor, laid out for the
     * monitor's size and scaled to whatever size it gets (it asks for none: fill it, or
     * set_size it). The caller places it and may destroy it; it also goes with the last
     * layer. Null while no layer is stacked.
     *
     * @param {number} monitorIndex
     * @returns {?Clutter.Actor}
     */
    mirror(monitorIndex) {
        const m = Main.layoutManager.monitors[monitorIndex];
        if (!m || !this._layers.length)
            return null;
        const monitor = { x: m.x, y: m.y, width: m.width, height: m.height };
        const actor = new Clutter.Actor({
            name: 'kiwi-desktop-mirror',
            reactive: false,
            clip_to_allocation: true,
            layout_manager: new MirrorLayout(monitor),
        });
        const rec = { actor, monitor };
        this._mirrors.add(rec);
        actor.connect('destroy', () => this._mirrors.delete(rec));
        this._fill(rec);
        return actor;
    }

    _fill(rec) {
        rec.actor.destroy_all_children();
        for (const { actor } of stackOrder(this._layers)) {
            if (overlapsMonitor(actor, rec.monitor))
                rec.actor.add_child(new Clutter.Clone({ source: actor, reactive: false }));
        }
    }

    _refillMirrors() {
        for (const rec of this._mirrors)
            this._fill(rec);
    }

    _hookOverview() {
        if (this._overview)
            return;
        const c = this._overview = new CleanupRegistry();
        // The workspaces are rebuilt as the overview starts to show: prepareToEnterOverview
        // runs before 'showing', for the keyboard and the swipe alike
        c.connect(Main.overview, 'showing', () => this._mirrorOverview());
        const self = this;
        const proto = WorkspacesView.WorkspacesView?.prototype;
        if (typeof proto?._updateWorkspaces === 'function') {
            c.inject(proto, '_updateWorkspaces', function (orig, ...args) {
                const r = orig.apply(this, args);
                for (const ws of this._workspaces ?? [])
                    self._mirrorWorkspace(ws);
                return r;
            });
        }
        c.add(() => {
            for (const rec of [...this._mirrors])
                rec.actor.destroy();
            this._mirrors.clear();
        });
        if (Main.overview.visible)
            this._mirrorOverview();
    }

    _unhookOverview() {
        this._overview?.dispose();
        this._overview = null;
    }

    /** Every workspace of the overview, on every monitor, gets its mirror. */
    _mirrorOverview() {
        const walk = actor => {
            for (let child = actor.get_first_child(); child; child = child.get_next_sibling()) {
                if (child instanceof Workspace.Workspace)
                    this._mirrorWorkspace(child);
                else
                    walk(child);
            }
        };
        walk(Main.layoutManager.overviewGroup);
    }

    _mirrorWorkspace(ws) {
        const bg = ws?._background;
        const group = bg?._backgroundGroup;
        if (!group || !(bg instanceof Workspace.WorkspaceBackground))
            return;
        for (const rec of this._mirrors) {
            if (rec.actor.get_parent() === group)
                return;
        }
        const mirror = this.mirror(bg.monitor_index ?? bg._monitorIndex ?? ws.monitorIndex);
        if (!mirror)
            return;
        // The group's BinLayout gives it the whole monitor, scaled like the wallpaper
        mirror.set({
            x_expand: true, y_expand: true,
            x_align: Clutter.ActorAlign.FILL, y_align: Clutter.ActorAlign.FILL,
        });
        group.add_child(mirror);
        // A new wallpaper is added on top of the old one (js/ui/background.js): stay above it
        const id = group.connect('child-added', (_g, child) => {
            if (child !== mirror)
                group.set_child_above_sibling(mirror, null);
        });
        mirror.connect('destroy', () => {
            if (GObject.signal_handler_is_connected(group, id))
                group.disconnect(id);
        });
    }

    /** Put every layer back above the wallpaper, in rank order. */
    restack() {
        const wg = global.window_group;
        let below = Main.layoutManager._backgroundGroup ?? null;
        for (const a of global.get_window_actors()) {
            if (a.meta_window?.get_window_type() === Meta.WindowType.DESKTOP && a.get_parent() === wg)
                below = a;
        }
        for (const { actor } of stackOrder(this._layers)) {
            if (actor.get_parent() !== wg)
                continue;
            if (below && below.get_parent() === wg) {
                if (actor.get_previous_sibling() !== below)
                    wg.set_child_above_sibling(actor, below);
                below = actor;
            } else if (wg.get_child_at_index(1) !== actor) {
                wg.set_child_at_index(actor, 1);
            }
        }
    }

    /** A handle to publish rectangles under an owner id; cleared when `cleanup` is disposed. */
    reserve(cleanup, owner) {
        cleanup.add(() => this._publish(owner, []));
        return { set: rects => this._publish(owner, rects) };
    }

    _publish(owner, rects) {
        if (!this._reserve.set(owner, rects))
            return;
        for (const fn of [...this._listeners]) {
            try {
                fn(owner);
            } catch (e) {
                console.error('[Kiwi] desktop layers listener failed:', e);
            }
        }
    }

    /** Stage rectangles other layers keep clear of (all owners but `except`). */
    reserved(except = null) {
        return this._reserve.all(except);
    }

    /** Called with the owner id whenever somebody's rectangles change. */
    onReserved(cleanup, fn) {
        this._listeners.add(fn);
        cleanup.add(() => this._listeners.delete(fn));
    }
}

let service = null;
let refs = 0;

export const DesktopLayers = {
    /** Use the service; the last release drops it. */
    acquire(cleanup) {
        service ??= new DesktopLayerService();
        refs++;
        const mine = service;
        let released = false;
        cleanup.add(() => {
            if (released)
                return;
            released = true;
            if (--refs === 0 && service === mine) {
                mine._unhookOverview();
                service = null;
            }
        });
        return mine;
    },

    /** The running service, or null while no feature uses it (this does not start it). */
    get current() {
        return service;
    },
};
