// SPDX-License-Identifier: GPL-3.0-or-later
// The unsaved-changes dot in the red close button (macOS): a small dark dot over the close
// traffic light of a window whose title marks unsaved changes (model.js isModifiedTitle).
//
// The traffic lights are the apps' own (GTK CSS, gtk/titlebuttons*.css), and GTK has no
// "document edited" state the Shell can read, so the dot is a Shell actor added to the
// window's actor (it moves, stacks, hides and goes with the window), placed from the frame
// rect and the button side (model.js closeDotCenter). Limits: only the title is seen (apps
// that mark changes elsewhere get no dot); one button geometry for GTK 3 and 4; the dot stays
// while the pointer is over the button (macOS shows × there instead).
//
// Shell API: Meta.Window (title, get_frame_rect, get_buffer_rect, is_client_decorated,
// window_type, fullscreen), Meta.WindowActor (a Clutter.Actor container), global.display
// 'window-created', global.get_window_actors().

import Meta from 'gi://Meta';
import St from 'gi://St';

import { closeDotCenter, isModifiedTitle } from './model.js';

const DOT = 6;

export class UnsavedDots {
    /**
     * @param {CleanupRegistry} cleanup
     * @param {{side: () => string, size: () => string}} opts where the buttons are
     */
    constructor(cleanup, { side, size }) {
        this._cleanup = cleanup;
        this._side = side;
        this._size = size;
        this._windows = new Map(); // Meta.Window -> {dot, ids}
    }

    /** Windows that show the dot now (tests, the harness). */
    get marked() {
        return [...this._windows].filter(([, w]) => w.dot?.visible).map(([win]) => win);
    }

    start() {
        this._cleanup.connect(global.display, 'window-created', (_d, win) => this._track(win));
        for (const actor of global.get_window_actors())
            this._track(actor.meta_window);
        this._cleanup.add(() => {
            for (const win of [...this._windows.keys()])
                this._untrack(win);
        });
    }

    /** Place every dot again (the side or the size changed). */
    refresh() {
        for (const win of this._windows.keys())
            this._sync(win);
    }

    _track(win) {
        if (!win || this._windows.has(win) || win.get_window_type() !== Meta.WindowType.NORMAL)
            return;
        const entry = { dot: null, ids: [] };
        this._windows.set(win, entry);
        const sync = () => this._sync(win);
        for (const signal of ['notify::title', 'size-changed', 'notify::fullscreen', 'shown'])
            entry.ids.push([win, win.connect(signal, sync)]);
        entry.ids.push([win, win.connect('unmanaged', () => this._untrack(win))]);
        this._sync(win);
    }

    _untrack(win) {
        const entry = this._windows.get(win);
        if (!entry)
            return;
        this._windows.delete(win);
        for (const [obj, id] of entry.ids)
            obj.disconnect(id);
        entry.dot?.destroy();
    }

    _sync(win) {
        const entry = this._windows.get(win);
        const actor = win.get_compositor_private();
        if (!entry || !actor)
            return;
        const csd = win.is_client_decorated?.() ?? true;
        const want = csd && !win.fullscreen && isModifiedTitle(win.title);
        if (!want) {
            if (entry.dot)
                entry.dot.visible = false;
            return;
        }
        if (!entry.dot) {
            entry.dot = new St.Widget({ style_class: 'kiwi-unsaved-dot', reactive: false, width: DOT, height: DOT });
            entry.dot.connect('destroy', () => {
                if (this._windows.get(win) === entry)
                    entry.dot = null;
            });
            actor.add_child(entry.dot);
        }
        const c = closeDotCenter({
            frame: win.get_frame_rect(), buffer: win.get_buffer_rect(),
            side: this._side(), size: this._size(),
        });
        entry.dot.set_position(c.x - DOT / 2, c.y - DOT / 2);
        entry.dot.visible = true;
        actor.set_child_above_sibling(entry.dot, null);
    }
}
