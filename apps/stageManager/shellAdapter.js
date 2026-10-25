// SPDX-License-Identifier: GPL-3.0-or-later
// Stage Manager shell adapter: turns Meta.Window / Shell objects into the plain descriptions
// model.js works on, and reports changes. Everything here touches the Shell; model.js does not.
//
// Public Meta/Shell API only (Meta.Display, Meta.Window, Shell.WindowTracker), same in 48-51.
// Main.layoutManager.primaryIndex for the monitor rule.
// Callbacks are coalesced in an idle, so a burst of window signals gives one callback.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { focusRoot, isExempt } from './model.js';

export class WindowSource {
    /**
     * @param {import('../../lib/disposables.js').CleanupRegistry} cleanup
     * @param {{onChange: Function, onGeometry: Function, onMinimized?: Function}} handlers
     *   onChange: the window list, focus or workspace changed. onGeometry: a window moved or resized.
     *   onMinimized(win): called synchronously on notify::minimized, before mutter runs its effect.
     */
    constructor(cleanup, { onChange, onGeometry, onMinimized = () => {} }) {
        this._cleanup = cleanup;
        this._onChange = onChange;
        this._onGeometry = onGeometry;
        this._onMinimized = onMinimized;
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
        cleanup.connect(display, 'window-entered-monitor', () => this._queueChange());
        cleanup.connect(display, 'window-left-monitor', () => this._queueChange());
        cleanup.add(() => this._untrackAll());
        for (const win of display.list_all_windows())
            this._track(win);
    }

    /**
     * Can Stage Manager manage this window at all (any workspace)? Normal, in the taskbar, on
     * the primary monitor, not always-on-top, sticky or picture-in-picture, with an actor.
     */
    eligible(win) {
        if (!win || win.get_window_type() !== Meta.WindowType.NORMAL || win.skip_taskbar)
            return false;
        if (!win.get_compositor_private())
            return false;
        return !isExempt({
            above: win.is_above(),
            sticky: win.is_on_all_workspaces(),
            title: win.get_title(),
            monitor: win.get_monitor(),
            primary: Main.layoutManager.primaryIndex,
        });
    }

    /**
     * Windows that belong on a stage of this workspace (default: the active one).
     * Minimized ones are listed too.
     */
    windows(ws = global.workspace_manager.get_active_workspace()) {
        const out = [];
        for (const win of this._tracked.keys()) {
            if (!win.located_on_workspace(ws) || !this.eligible(win))
                continue;
            const app = this._tracker.get_window_app(win);
            out.push({ id: win.get_stable_sequence(), appId: app?.get_id() ?? null, app, win, minimized: win.minimized });
        }
        out.sort((a, b) => a.id - b.id);
        return out;
    }

    /**
     * What the focus means for the stage: the listed window that owns the focused one (a dialog
     * maps to its parent through transient-for), or the app of an orphan dialog.
     * @param {Set<Meta.Window>} listed windows() of the active workspace
     * @returns {{win: ?Meta.Window, appId: ?string}}
     */
    focusTarget(listed) {
        const focus = global.display.focus_window;
        if (!focus)
            return { win: null, appId: null };
        const root = focusRoot(focus, w => w.get_transient_for(), w => listed.has(w));
        if (root)
            return { win: root, appId: null };
        const app = this._tracker.get_window_app(focus);
        return { win: null, appId: app?.get_id() ?? null };
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
            c.connect(win, 'notify::minimized', () => {
                try {
                    this._onMinimized(win);
                } catch (e) {
                    console.error(`[Kiwi] stage minimize: ${e.message}`);
                }
                this._queueChange();
            }),
            c.connect(win, 'notify::skip-taskbar', () => this._queueChange()),
            c.connect(win, 'notify::above', () => this._queueChange()),
            c.connect(win, 'notify::on-all-workspaces', () => this._queueChange()),
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
