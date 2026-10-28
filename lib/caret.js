// SPDX-License-Identifier: GPL-3.0-or-later
// Caret: where the focused app's text cursor is, for badges and popovers at the caret
// (text-cursor indicators, Emoji & Symbols).
//
//   const caret = Caret.acquire(cleanup);   // tracks while any feature holds it
//   caret.rect                              // {x, y, width, height} in stage coordinates, or null
//   caret.watch(cleanup, rect => ...)       // after every report and focus change
//   caret.onMoved(cleanup, fn)              // fn(rect) each time the caret moves (typing,
//                                           // arrow keys); not for the first report after a focus
//
// Source: misc/ibusManager.js getIBusManager() 'set-cursor-location' (the IBus panel service:
// Wayland text-input clients and X11 apps through IBus; Shell 45-51). A focus change forgets
// the rect, so a caret is never used for another window. Without IBus there is no caret.

import { getIBusManager } from 'resource:///org/gnome/shell/misc/ibusManager.js';

import { CleanupRegistry } from './disposables.js';
import { CaretTracker } from './caretModel.js';

class CaretService {
    constructor() {
        this._holders = 0;
        this._registry = null;
        this._tracker = new CaretTracker();
        this._listeners = new Set();
        this._moved = new Set();
    }

    /** @param {object} cleanup released with it @returns {CaretService} */
    acquire(cleanup) {
        if (this._holders++ === 0)
            this._start();
        let held = true;
        cleanup.add(() => {
            if (!held)
                return;
            held = false;
            if (--this._holders === 0)
                this._stop();
        });
        return this;
    }

    get rect() {
        return this._holders ? this._tracker.rect : null;
    }

    /**
     * Call `fn(rect)` after every caret report and focus change (rect may be null), until
     * `cleanup` is disposed. For a badge that follows the caret.
     */
    watch(cleanup, fn) {
        this._listeners.add(fn);
        cleanup.add(() => this._listeners.delete(fn));
    }

    /** Call fn(rect) when the caret moves, until `cleanup` is disposed. Hold the service first. */
    onMoved(cleanup, fn) {
        this._moved.add(fn);
        cleanup.add(() => this._moved.delete(fn));
    }

    _start() {
        const reg = new CleanupRegistry();
        this._tracker = new CaretTracker();
        reg.connect(getIBusManager(), 'set-cursor-location', (_m, rect) => this._onReport(rect));
        reg.connect(global.display, 'notify::focus-window', () => {
            this._tracker.focusChanged();
            this._notify();
        });
        this._registry = reg;
    }

    _onReport(rect) {
        const moved = this._tracker.report(rect);
        this._notify(this._listeners);
        if (moved)
            this._notify(this._moved);
    }

    _notify(listeners = this._listeners) {
        const rect = this._tracker.rect;
        for (const fn of listeners) {
            try {
                fn(rect);
            } catch (e) {
                console.error('[Kiwi] caret listener failed:', e);
            }
        }
    }

    _stop() {
        this._registry?.dispose();
        this._registry = null;
        this._tracker.focusChanged();
    }
}

export const Caret = new CaretService();
