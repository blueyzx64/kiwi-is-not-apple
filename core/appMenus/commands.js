// SPDX-License-Identifier: GPL-3.0-or-later
// The generic app-menu commands (the 'generic' provider): what the Shell can do for any app
// or window, whatever toolkit it uses.
//
//   const commands = new GenericCommands({ events, desktop, layout });
//   commands.run('quit', target);
//   commands.stop();       // forgets the windows its Hide fallback minimized
//
// Hide, Hide Others and Show All belong to the window manager: they are asked for with the
// 'app-hide-requested' event, and the owner of hidden windows (the windows feature) answers.
// Tile Left/Right go the same way through 'window-tile-requested' (the tiling engine). When
// nothing listens, a plain fallback runs here: Hide minimizes the app's windows without
// asking Stage Manager (the window is minimized, not staged), Show All restores exactly the
// windows that fallback minimized, and Tile puts the window on half of Kiwi's work area.
//
// App profiles (core/appMenus/profiles.js) add: 'open-location' (a place opened by the app,
// through its .desktop entry: Nautilus is D-Bus activatable, so this is
// org.freedesktop.Application.Open), 'launch-search' (org.gnome.Shell.SearchProvider2
// LaunchSearch of the app's search provider) and 'launchpad' (core/desktopActions).
//
// Shell API: Shell.AppSystem, Shell.App (request_quit, open_new_window, activate_window),
// Meta.Window, global.workspace_manager, Main.activateWindow.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { DesktopAppInfo, isMaximized, maximizeWindow, unmaximizeWindow } from '../../lib/compat.js';
import { WindowState } from '../windowState.js';
import { isUserFacing } from '../desktopModel.js';
import { DesktopActions } from '../desktopActions.js';

const now = () => global.get_current_time();

export class GenericCommands {
    /**
     * @param {{events, desktop, layout}} core the core services (ctx.events, ctx.desktop,
     *   ctx.layout); desktop and layout must be acquired by the caller
     */
    constructor({ events, desktop, layout }) {
        this._events = events;
        this._desktop = desktop;
        this._layout = layout;
        this._hidden = new Set(); // Meta.Window minimized by the Hide fallback
    }

    stop() {
        this._hidden.clear();
    }

    /** True for a window this object's Hide fallback minimized (and has not shown again). */
    isHidden(win) {
        return this._hidden.has(win);
    }

    /** Show one window the Hide fallback minimized (the app switcher activates a hidden app). */
    unhide(win) {
        this._hidden.delete(win);
        if (win.get_compositor_private())
            win.unminimize();
    }

    /**
     * @param {string} name a generic command name (core/appMenus/model.js)
     * @param {{appId: ?string, windowId: ?number}} target
     * @param {*} [arg] the command's target value (workspace index, window id)
     * @returns {boolean} false when the command could not run
     */
    run(name, target, arg) {
        const app = target.appId ? Shell.AppSystem.get_default().lookup_app(target.appId) : null;
        const win = target.windowId !== null && target.windowId !== undefined
            ? this._desktop.metaWindow(target.windowId) : null;
        switch (name) {
        case 'about':
            return this._about(target.appId);
        case 'quit':
            app?.request_quit();
            return !!app;
        case 'force-quit':
            // Option-Quit: the app's clients are killed (Meta.Window.kill, as Force Quit… does)
            for (const w of app?.get_windows() ?? [])
                w.kill();
            return !!app?.get_windows().length;
        case 'close-all':
        case 'minimize-all': {
            // The app's user-facing windows (desktop model), on every workspace, as macOS does
            const ids = new Set((app?.get_windows() ?? []).map(w => w.get_stable_sequence()));
            const windows = this._desktop.model.windows({ minimized: false })
                .filter(info => ids.has(info.id) && isUserFacing(info))
                .map(info => this._desktop.metaWindow(info.id))
                .filter(Boolean);
            for (const w of windows) {
                if (name === 'close-all')
                    w.delete(now());
                else if (w.can_minimize() && !WindowState.interceptMinimize(w))
                    w.minimize();
            }
            return windows.length > 0;
        }
        case 'new-window':
            if (!app?.can_open_new_window())
                return false;
            app.open_new_window(-1);
            return true;
        case 'hide':
        case 'hide-others':
        case 'show-all':
            return this._hide(name, target.appId);
        case 'activate-window': {
            const w = this._desktop.metaWindow(arg);
            if (w)
                Main.activateWindow(w);
            return !!w;
        }
        case 'open-location':
            return this._openLocation(arg);
        case 'launch-search':
            return this._launchSearch(arg);
        case 'launchpad':
            return new DesktopActions({ events: this._events, desktop: this._desktop })
                .run('launchpad', { source: 'menu' });
        case 'bring-all-to-front':
            if (!app)
                return false;
            app.activate_window(win, now());
            return true;
        }
        if (!win)
            return false;
        switch (name) {
        case 'close-window':
            win.delete(now());
            return true;
        case 'minimize':
            if (!WindowState.interceptMinimize(win))
                win.minimize();
            return true;
        case 'zoom':
            if (isMaximized(win))
                unmaximizeWindow(win);
            else
                maximizeWindow(win);
            return true;
        case 'fullscreen':
            if (win.is_fullscreen())
                win.unmake_fullscreen();
            else
                win.make_fullscreen();
            return true;
        case 'always-on-top':
            if (win.is_above())
                win.unmake_above();
            else
                win.make_above();
            return true;
        case 'tile-left':
        case 'tile-right':
            return this._tile(win, name === 'tile-left' ? 'left' : 'right');
        case 'move-to-workspace':
            return this._moveToWorkspace(win, arg);
        }
        return false;
    }

    _about(appId) {
        // Without app.about, the app's page in GNOME Software is the closest thing
        if (!appId || !DesktopAppInfo.new('org.gnome.Software.desktop'))
            return false;
        const id = appId.replace(/\.desktop$/, '');
        Gio.AppInfo.launch_default_for_uri_async(`appstream://${id}`, null, null, (_o, res) => {
            try {
                Gio.AppInfo.launch_default_for_uri_finish(res);
            } catch (e) {
                console.warn(`[Kiwi] app menus: cannot open ${id} in Software: ${e.message}`);
            }
        });
        return true;
    }

    // A place for the app to open: a URI, '~' (home) or 'xdg:<NAME>' (a GLib.UserDirectory)
    _openLocation({ appId, location } = {}) {
        const info = appId ? DesktopAppInfo.new(appId) : null;
        const uri = resolveLocation(location);
        if (!info || !uri)
            return false;
        try {
            info.launch_uris([uri], global.create_app_launch_context(now(), -1));
            return true;
        } catch (e) {
            console.warn(`[Kiwi] app menus: cannot open ${uri}: ${e.message}`);
            return false;
        }
    }

    // A search window of the app: its Shell search provider's LaunchSearch with no terms
    _launchSearch({ busName, path } = {}) {
        if (!busName || !path)
            return false;
        Gio.DBus.session.call(busName, path, 'org.gnome.Shell.SearchProvider2', 'LaunchSearch',
            new GLib.Variant('(asu)', [[''], now()]), null, Gio.DBusCallFlags.NONE, 5000, null,
            (conn, res) => {
                try {
                    conn.call_finish(res);
                } catch (e) {
                    console.warn(`[Kiwi] app menus: search of ${busName} failed: ${e.message}`);
                }
            });
        return true;
    }

    _hide(mode, appId) {
        const event = { 'hide': 'hide', 'hide-others': 'others', 'show-all': 'all' }[mode];
        if (this._events.listenerCount('app-hide-requested') > 0) {
            this._events.emit('app-hide-requested', { appId, mode: event });
            return true;
        }
        const model = this._desktop.model;
        const active = model.workspaces.active;
        if (event === 'all') {
            for (const w of this._hidden) {
                if (w.get_compositor_private())
                    w.unminimize();
            }
            this._hidden.clear();
            return true;
        }
        for (const info of model.windows({ workspace: active, minimized: false })) {
            if (!isUserFacing(info))
                continue;
            const mine = info.appId === appId;
            if (mine !== (event === 'hide'))
                continue;
            const w = this._desktop.metaWindow(info.id);
            if (w?.can_minimize()) {
                w.minimize();
                this._hidden.add(w);
            }
        }
        return true;
    }

    _tile(win, side) {
        if (this._events.listenerCount('window-tile-requested') > 0) {
            this._events.emit('window-tile-requested', { window: win, mode: side });
            return true;
        }
        const area = this._layout.workArea(win.get_monitor());
        if (!area)
            return false;
        if (isMaximized(win))
            unmaximizeWindow(win);
        if (win.is_fullscreen())
            win.unmake_fullscreen();
        const half = Math.floor(area.width / 2);
        const x = side === 'left' ? area.x : area.x + area.width - half;
        win.move_resize_frame(true, x, area.y, half, area.height);
        return true;
    }

    _moveToWorkspace(win, index) {
        const wm = global.workspace_manager;
        if (index >= wm.get_n_workspaces())
            wm.append_new_workspace(false, now());
        if (index >= wm.get_n_workspaces())
            return false;
        win.change_workspace_by_index(index, false);
        return true;
    }
}

const USER_DIRS = Object.freeze({
    DESKTOP: GLib.UserDirectory.DIRECTORY_DESKTOP,
    DOCUMENTS: GLib.UserDirectory.DIRECTORY_DOCUMENTS,
    DOWNLOAD: GLib.UserDirectory.DIRECTORY_DOWNLOAD,
    MUSIC: GLib.UserDirectory.DIRECTORY_MUSIC,
    PICTURES: GLib.UserDirectory.DIRECTORY_PICTURES,
    VIDEOS: GLib.UserDirectory.DIRECTORY_VIDEOS,
});

/** @returns {?string} the URI of a profile location (core/appMenus/profiles.js) */
function resolveLocation(location) {
    if (!location)
        return null;
    if (location === '~')
        return Gio.File.new_for_path(GLib.get_home_dir()).get_uri();
    if (location.startsWith('xdg:')) {
        const dir = USER_DIRS[location.slice(4)];
        const path = dir === undefined ? null : GLib.get_user_special_dir(dir);
        // An unset XDG folder (or one set to home) falls back to home, as Nautilus does
        return Gio.File.new_for_path(path || GLib.get_home_dir()).get_uri();
    }
    return location;
}
