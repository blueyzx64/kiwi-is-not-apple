// SPDX-License-Identifier: GPL-3.0-or-later
// The accessibility bus without libatspi: async GDBus calls with a timeout and a cancellable,
// so a slow or hung app never blocks the compositor (libatspi's calls are synchronous).
// Users: core/appMenus/atspi.js (menus read from the a11y tree), features/hoverText.
//
//   const conn = await openA11yBus(cancellable);   // a private connection; close it when done
//   const reply = await call(conn, name, path, IFACE.TEXT, 'GetText', new GLib.Variant('(ii)', [0, -1]), '(s)', c);
//
// The bus is D-Bus activated (org.a11y.Bus GetAddress): GNOME has it running already, and
// asking for its address starts it elsewhere. Without a session service (a bare test bus) the
// call fails and callers stay quiet.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export const TIMEOUT_MS = 1500;
export const ROOT = '/org/a11y/atspi/accessible/root';
export const REGISTRY = 'org.a11y.atspi.Registry';
export const IFACE = Object.freeze({
    ACCESSIBLE: 'org.a11y.atspi.Accessible',
    ACTION: 'org.a11y.atspi.Action',
    COMPONENT: 'org.a11y.atspi.Component',
    TEXT: 'org.a11y.atspi.Text',
    REGISTRY: 'org.a11y.atspi.Registry',
    EVENT_OBJECT: 'org.a11y.atspi.Event.Object',
});

/**
 * One async D-Bus call. Resolves to the reply GLib.Variant, rejects on error or timeout.
 *
 * @returns {Promise<GLib.Variant>}
 */
export function call(conn, dest, path, iface, method, params, replyType, cancellable,
    flags = Gio.DBusCallFlags.NO_AUTO_START, timeout = TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        conn.call(dest, path, iface, method, params,
            replyType ? new GLib.VariantType(replyType) : null,
            flags, timeout, cancellable, (c, res) => {
                try {
                    resolve(c.call_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

/**
 * A property of an accessible object, unpacked (null on any error).
 *
 * @returns {Promise<*>}
 */
export function getProperty(conn, dest, path, iface, prop, cancellable) {
    return call(conn, dest, path, 'org.freedesktop.DBus.Properties', 'Get',
        new GLib.Variant('(ss)', [iface, prop]), '(v)', cancellable)
        .then(r => r.recursiveUnpack()[0], () => null);
}

/**
 * A private connection to the accessibility bus.
 *
 * @param {?Gio.Cancellable} cancellable
 * @returns {Promise<Gio.DBusConnection>}
 */
export async function openA11yBus(cancellable) {
    const reply = await call(Gio.DBus.session, 'org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Bus',
        'GetAddress', null, '(s)', cancellable, Gio.DBusCallFlags.NONE);
    const [address] = reply.deepUnpack();
    return new Promise((resolve, reject) => {
        Gio.DBusConnection.new_for_address(address,
            Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
            null, cancellable, (_o, res) => {
                try {
                    resolve(Gio.DBusConnection.new_for_address_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

/**
 * The bus name of the registered application that belongs to a process, or null.
 *
 * @returns {Promise<?{name: string, path: string}>}
 */
export async function appForPid(conn, pid, cancellable) {
    const reply = await call(conn, REGISTRY, ROOT, IFACE.ACCESSIBLE, 'GetChildren', null, '(a(so))', cancellable,
        Gio.DBusCallFlags.NONE);
    const [apps] = reply.deepUnpack();
    const pids = await Promise.all(apps.map(([name]) =>
        call(conn, 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
            'GetConnectionUnixProcessID', new GLib.Variant('(s)', [name]), '(u)', cancellable)
            .then(r => r.deepUnpack()[0], () => 0)));
    const i = pids.indexOf(pid);
    return i >= 0 ? { name: apps[i][0], path: apps[i][1] } : null;
}

/** The process of a bus name on the a11y bus (0 when unknown). @returns {Promise<number>} */
export function pidOf(conn, name, cancellable) {
    return call(conn, 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
        'GetConnectionUnixProcessID', new GLib.Variant('(s)', [name]), '(u)', cancellable)
        .then(r => r.deepUnpack()[0], () => 0);
}
