// SPDX-License-Identifier: GPL-3.0-or-later
// LayoutService: edge ownership for the whole extension (Shell side of core/layoutModel.js).
//
//   const layout = ctx.layout.acquire(cleanup);
//   const dock = layout.claim(cleanup, { id: 'dock', edge: 'bottom', size: 72, reserve: 'strut',
//       actor: dockActor });           // added as chrome that affects struts, removed on release
//   dock.rect();                       // where the dock goes on the primary monitor
//   dock.update({ size: 64 });
//   layout.workArea(monitorIndex);     // what is left for windows, for every Kiwi placement
//   ctx.events.on('work-area-changed', ({ monitor }) => ..., cleanup);
//
// The top bar is claimed by the service itself as 'menu-bar' (top, reserve 'strut', the
// height of Main.layoutManager.panelBox), so every claim on the top edge stacks under it.
// workArea() starts from Mutter's own work area (which already holds every strut, Kiwi's and
// other clients') and takes off the 'soft' claims only Kiwi knows about.
//
// Shell API: Main.layoutManager (monitors, primaryIndex, panelBox, getWorkAreaForMonitor,
// addChrome/removeChrome, monitors-changed), global.display workareas-changed.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { CleanupRegistry } from '../lib/disposables.js';
import { LayoutModel } from './layoutModel.js';

export const MENU_BAR_CLAIM = 'menu-bar';

export class LayoutService {
    /** @param {import('./events.js').EventHub} events */
    constructor(events) {
        this._events = events;
        this._model = new LayoutModel();
        this._refs = 0;
        this._cleanup = null;
        this._actors = new Map(); // claim id -> actor added as chrome
    }

    /** @returns {LayoutModel} the pure model (read-only use) */
    get model() {
        return this._model;
    }

    /**
     * Use the service; the menu-bar claim and the Shell signals start with the first user.
     *
     * @param {{add: Function}} owner a CleanupRegistry
     * @returns {LayoutService}
     */
    acquire(owner) {
        this._refs++;
        if (this._refs === 1)
            this._start();
        let released = false;
        owner.add(() => {
            if (released)
                return;
            released = true;
            if (--this._refs === 0)
                this._stopTracking();
        });
        return this;
    }

    /** End for good (extension disable). */
    stop() {
        this._refs = 0;
        this._stopTracking();
    }

    /**
     * Claim an edge. See layoutModel.js for the spec; `actor` (optional, with reserve 'strut')
     * is added to the Shell chrome with affectsStruts, so Mutter keeps windows off it.
     *
     * @param {{add: Function}} owner released when it is disposed
     * @param {object} spec
     * @returns {{rect: Function, update: Function, release: Function, id: string}}
     */
    claim(owner, spec) {
        if (!this._cleanup)
            throw new Error('LayoutService: acquire() before claim()');
        const { actor = null, ...rest } = spec;
        this._model.claim(rest);
        if (actor && rest.reserve === 'strut' && !this._actors.has(rest.id)) {
            Main.layoutManager.addChrome(actor, { affectsStruts: true, trackFullscreen: true });
            this._actors.set(rest.id, actor);
            // Destroyed by its owner first: the Shell untracks it itself, so forget it here
            this._cleanup.connect(actor, 'destroy', () => {
                if (this._actors.get(rest.id) === actor)
                    this._actors.delete(rest.id);
            });
        }
        this._changed();
        let released = false;
        const handle = {
            id: rest.id,
            rect: (monitor = this.primaryIndex) => this.rect(rest.id, monitor),
            update: fields => {
                if (!released && this._model.update(rest.id, fields))
                    this._changed();
            },
            release: () => {
                if (released)
                    return;
                released = true;
                this._releaseClaim(rest.id);
            },
        };
        owner.add(handle.release);
        return handle;
    }

    get primaryIndex() {
        return Main.layoutManager.primaryIndex ?? 0;
    }

    /** @returns {?{x,y,width,height}} the rect of one claim on one monitor */
    rect(id, monitor = this.primaryIndex) {
        return this._compute(monitor)?.rects.get(id) ?? null;
    }

    /** @returns {?{x,y,width,height}} the area Kiwi places windows in on one monitor */
    workArea(monitor = this.primaryIndex) {
        return this._compute(monitor)?.workArea ?? null;
    }

    // ---- internals ----------------------------------------------------------------------

    _compute(index) {
        const lm = Main.layoutManager;
        const monitor = lm.monitors?.[index];
        if (!monitor)
            return null;
        const base = lm.getWorkAreaForMonitor(index);
        return this._model.compute(index, monitor, {
            base: { x: base.x, y: base.y, width: base.width, height: base.height },
            primary: this.primaryIndex,
        });
    }

    _start() {
        const cleanup = new CleanupRegistry();
        this._cleanup = cleanup;
        const panelBox = Main.layoutManager.panelBox;
        const syncMenuBar = () => {
            this._model.claim({
                id: MENU_BAR_CLAIM, edge: 'top', reserve: 'strut', order: -100,
                size: panelBox?.visible ? panelBox.height : 0,
            });
            this._changed();
        };
        syncMenuBar();
        if (panelBox) {
            cleanup.connect(panelBox, 'notify::height', syncMenuBar);
            cleanup.connect(panelBox, 'notify::visible', syncMenuBar);
        }
        cleanup.connect(Main.layoutManager, 'monitors-changed', () => this._changed());
        cleanup.connect(global.display, 'workareas-changed', () => this._changed());
    }

    _stopTracking() {
        if (!this._cleanup)
            return;
        for (const id of [...this._actors.keys()])
            this._releaseClaim(id, false);
        this._cleanup.dispose();
        this._cleanup = null;
        this._model = new LayoutModel();
    }

    _releaseClaim(id, notify = true) {
        const actor = this._actors.get(id);
        if (actor) {
            this._actors.delete(id);
            Main.layoutManager.removeChrome(actor);
        }
        if (this._model.release(id) && notify && this._cleanup)
            this._changed();
    }

    _changed() {
        const count = Main.layoutManager.monitors?.length ?? 0;
        for (let monitor = 0; monitor < count; monitor++)
            this._events.emit('work-area-changed', { monitor });
    }
}
