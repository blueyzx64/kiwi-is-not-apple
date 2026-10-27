// SPDX-License-Identifier: GPL-3.0-or-later
// GTK actions provider: the app.* and win.* actions a GtkApplication exports on the session
// bus (org.gtk.Actions), found from the window's GTK D-Bus properties.
//
//   Meta.Window get_gtk_unique_bus_name()          ':1.53'
//               get_gtk_application_object_path()  '/org/gnome/TextEditor'       -> app.*
//               get_gtk_window_object_path()       '/org/gnome/TextEditor/window/1' -> win.*
//
// GTK 3 and 4 set them on Wayland through gtk_shell1 for every GtkApplicationWindow. Apps that
// install their actions on widgets (gtk_widget_class_install_action) export nothing for the
// window, so libadwaita apps often have app.* only.
//
// Provider interface (core/appMenus/service.js): {id, supports(target), fetch(target,
// cancellable) -> Promise<{actions}>, activate(target, command) -> Promise}.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { parseDescribeAll } from './model.js';

const IFACE = 'org.gtk.Actions';
const TIMEOUT_MS = 2000;

function call(busName, path, method, params, replyType, cancellable) {
    return new Promise((resolve, reject) => {
        Gio.DBus.session.call(busName, path, IFACE, method, params,
            replyType ? new GLib.VariantType(replyType) : null,
            Gio.DBusCallFlags.NO_AUTO_START, TIMEOUT_MS, cancellable, (conn, res) => {
                try {
                    resolve(conn.call_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

async function describe(busName, path, group, cancellable) {
    if (!path)
        return [];
    try {
        const reply = await call(busName, path, 'DescribeAll', null, '(a{s(bgav)})', cancellable);
        // a{s(bgav)}: unpack the dict and each tuple, keep the state variants for later
        const [dict] = reply.deepUnpack();
        const plain = {};
        for (const [name, tuple] of Object.entries(dict)) {
            const [enabled, paramType, state] = tuple;
            plain[name] = [enabled, paramType, state.map(v => v.recursiveUnpack())];
        }
        return parseDescribeAll(plain, group);
    } catch (e) {
        if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
            console.debug(`[Kiwi] app menus: ${busName}${path} has no actions (${e.message})`);
        return [];
    }
}

export const GtkActionsProvider = Object.freeze({
    id: 'gtk',

    supports(target) {
        return !!target?.gtk?.busName && !!(target.gtk.appPath || target.gtk.windowPath);
    },

    /** @returns {Promise<{actions: object[]}>} */
    async fetch(target, cancellable) {
        const { busName, appPath, windowPath } = target.gtk;
        const [app, win] = await Promise.all([
            describe(busName, appPath, 'app', cancellable),
            describe(busName, windowPath, 'win', cancellable),
        ]);
        return { actions: [...app, ...win] };
    },

    /** Activate one action: org.gtk.Actions.Activate(s name, av parameter, a{sv} platform data). */
    activate(target, { group, name }) {
        const path = group === 'win' ? target.gtk?.windowPath : target.gtk?.appPath;
        if (!target.gtk?.busName || !path)
            return Promise.resolve(false);
        const params = new GLib.Variant('(sava{sv})', [name, [], {}]);
        return call(target.gtk.busName, path, 'Activate', params, null, null)
            .then(() => true, e => {
                console.warn(`[Kiwi] app menus: ${group}.${name} failed: ${e.message}`);
                return false;
            });
    },
});
