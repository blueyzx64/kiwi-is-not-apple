// SPDX-License-Identifier: GPL-3.0-or-later
// Stage Manager shell adapter: turns Meta.Window / Shell objects into the plain descriptions
// model.js works on, and reports changes. Everything here touches the Shell; model.js does not.
//
// Public Meta/Shell API only (Meta.Display, Meta.Window, Shell.WindowTracker), same in 48-51.
// Callbacks are coalesced in an idle, so a burst of window signals gives one callback.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

export class WindowSource {
    /**
     * @param {import('../../lib/disposables.js').CleanupRegistry} cleanup
     * @param {{onChange: Function, onGeometry: Function}} handlers
     *   onChange: the window list, focus or workspace changed. onGeometry: a window moved or resized.
     */
    constructor(cleanup, { onChange, onGeometry }) {
        this._cleanup = cleanup;
        this._onChange = onChange;
        this._onGeometry = onGeometry;
        this._tracked = new Map();   // Meta.Window -> tokens[]
        this._changeIdle = 0;
        this._geometryIdle = 0;
        this._tracker = Shell.WindowTracker.get_default();
    }

    start() {
        const cleanup = this._cleanup;
        const display = global.display;
        cleanup.connect(display, 'window-created', (_d, win) => {
            this._track(win);
            this._queueChange();
        });
        cleanup.connect(display, 'notify::focus-window', () => this._queueChange());
        // window-created fires before the actor exists; 'map' fires when it can be cloned
        cleanup.connect(global.window_manager, 'map', () => this._queueChange());
        cleanup.connect(global.workspace_manager, 'active-workspace-changed', () => this._queueChange());
        cleanup.add(() => this._untrackAll());
        for (const win of display.list_all_windows())
            this._track(win);
    }

    /** Windows that belong on a stage: normal, on the active workspace. Minimized ones are listed too. */
    windows() {
        const ws = global.workspace_manager.get_active_workspace();
        const out = [];
        for (const win of this._tracked.keys()) {
            if (win.get_window_type() !== Meta.WindowType.NORMAL || win.skip_taskbar)
                continue;
            if (!win.located_on_workspace(ws) || !win.get_compositor_private())
                continue;
            const app = this._tracker.get_window_app(win);
            out.push({ id: win.get_stable_sequence(), appId: app?.get_id() ?? null, app, win, minimized: win.minimized });
        }
        out.sort((a, b) => a.id - b.id);
        return out;
    }

    focusedId() {
        const win = global.display.focus_window;
        return win && this._tracked.has(win) ? win.get_stable_sequence() : null;
    }

    // ---- internals -----------------------------------------------------------------------

    _track(win) {
        if (this._tracked.has(win))
            return;
        const c = this._cleanup;
        const tokens = [
            c.connect(win, 'unmanaged', () => {
                this._untrack(win);
                this._queueChange();
            }),
            c.connect(win, 'workspace-changed', () => this._queueChange()),
            c.connect(win, 'notify::minimized', () => this._queueChange()),
            c.connect(win, 'notify::skip-taskbar', () => this._queueChange()),
            c.connect(win, 'position-changed', () => this._queueGeometry()),
            c.connect(win, 'size-changed', () => this._queueGeometry()),
        ];
        this._tracked.set(win, tokens);
    }

    _untrack(win) {
        const tokens = this._tracked.get(win);
        if (!tokens)
            return;
        this._tracked.delete(win);
        for (const t of tokens)
            this._cleanup.release(t);
    }

    _untrackAll() {
        for (const win of [...this._tracked.keys()])
            this._untrack(win);
    }

    _queueChange() {
        if (this._changeIdle)
            return;
        this._changeIdle = this._cleanup.idle(() => {
            this._changeIdle = 0;
            this._onChange();
        }, { name: 'stage-manager-change' });
    }

    _queueGeometry() {
        if (this._geometryIdle)
            return;
        this._geometryIdle = this._cleanup.idle(() => {
            this._geometryIdle = 0;
            this._onGeometry();
        }, { name: 'stage-manager-geometry' });
    }
}
