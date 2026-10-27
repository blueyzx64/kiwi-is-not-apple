// SPDX-License-Identifier: GPL-3.0-or-later
// AT-SPI provider (experimental, setting off by default): menus read from the focused app's
// accessibility tree (plan §5.1, provider 5).
//
//   menu bar  a MENU_BAR node in the focused window (Firefox, LibreOffice under Wayland, GTK 3
//             menu bars, Java): mirrored, items invoked through org.a11y.atspi.Action.
//   popover   (its own setting) a libadwaita window has no menu bar, only a primary menu
//             button. Its popover is built only when it opens, so the provider opens it with
//             DoAction while the popup window is kept transparent (the window actor's opacity,
//             set the moment Mutter creates it), reads its items, and closes it. The items join
//             Kiwi's App menu and are cached per app; choosing one opens the popover the same
//             way and invokes the item. Limits: the app sees a real open and close (focus
//             inside the app moves to the popover and back); a menu that needs a scroll or a
//             submenu page that is not built yet is not read; non-GTK toolkits differ.
//
// Why in the Shell and not a helper process: every call is async GDBus on a private connection
// to the accessibility bus (org.a11y.Bus GetAddress), with a timeout, a node budget and a
// cancellable, so a slow or hung app never blocks the compositor. libatspi is not used: its
// calls are synchronous. A helper process would add a second runtime, a protocol and its
// lifetime for no gain over async calls.
//
// Apps must expose accessibility: GTK 3/4 do whenever the accessibility bus runs (GNOME starts
// it). Firefox, Chromium and Qt expose their tree only when accessibility is turned on
// (org.gnome.desktop.interface toolkit-accessibility, or a screen reader); Kiwi does not
// change that setting.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';

import {
    ROLE, STATE, atspiPopoverItems, atspiToMenus, findPrimaryMenuButton, findRole, hasState,
} from './nativeModel.js';

const ACCESSIBLE = 'org.a11y.atspi.Accessible';
const ACTION = 'org.a11y.atspi.Action';
const REGISTRY = 'org.a11y.atspi.Registry';
const ROOT = '/org/a11y/atspi/accessible/root';
const TIMEOUT_MS = 1500;
const NODE_BUDGET = 1500;
const MAX_DEPTH = 24;
const POPUP_WAIT_MS = 1500; // fail-safe only: the read waits for the popup's first frame
const POPUP_TYPES = new Set([Meta.WindowType.DROPDOWN_MENU, Meta.WindowType.POPUP_MENU, Meta.WindowType.MENU]);

function call(conn, dest, path, iface, method, params, replyType, cancellable, flags = Gio.DBusCallFlags.NO_AUTO_START) {
    return new Promise((resolve, reject) => {
        conn.call(dest, path, iface, method, params,
            replyType ? new GLib.VariantType(replyType) : null,
            flags, TIMEOUT_MS, cancellable, (c, res) => {
                try {
                    resolve(c.call_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

export class AtspiProvider {
    /**
     * @param {{popovers: boolean}} opts read libadwaita primary menus too
     */
    constructor({ popovers = false } = {}) {
        this.id = 'atspi';
        this.menubar = true;
        this._popovers = popovers;
        this._bus = null; // Promise<Gio.DBusConnection>
        this._cancellable = null;
        this._popoverCache = new Map(); // appId -> items
        this._busy = null; // the running popover read, one at a time
    }

    start() {
        this._cancellable = new Gio.Cancellable();
    }

    stop() {
        this._cancellable?.cancel();
        this._cancellable = null;
        const bus = this._bus;
        this._bus = null;
        bus?.then(conn => conn.close(null, null), () => {});
        this._popoverCache.clear();
    }

    supports(target) {
        return !!this._cancellable && !!target?.pid && target.windowId !== null;
    }

    async fetch(target, cancellable) {
        const conn = await this._connection();
        const app = await this._appFor(conn, target.pid, cancellable);
        if (!app)
            return { menubar: [] };
        const frame = await this._frame(conn, app, target.title, cancellable);
        if (!frame)
            return { menubar: [] };
        const bar = findRole(frame, ROLE.MENU_BAR);
        if (bar)
            return { menubar: atspiToMenus(bar, { provider: this.id }) };
        if (!this._popovers)
            return { menubar: [] };
        let items = this._popoverCache.get(target.appId);
        if (!items) {
            items = await this._withPopover(conn, app, frame, target, menu =>
                atspiPopoverItems(menu, { provider: this.id }));
            if (items?.length)
                this._popoverCache.set(target.appId, items);
        }
        const flagged = (items ?? []).map(it => mark(it));
        return { menubar: [], menus: flagged.length ? [{ id: 'app', title: '', items: flagged }] : [] };
    }

    async activate(target, { path, ref, popover }) {
        try {
            const conn = await this._connection();
            const app = await this._appFor(conn, target.pid, this._cancellable);
            if (!app)
                return false;
            if (!popover) {
                await this._doAction(conn, app.name, ref);
                return true;
            }
            const frame = await this._frame(conn, app, target.title, this._cancellable);
            const done = await this._withPopover(conn, app, frame, target, async menu => {
                const node = findByPath(menu, path);
                if (!node)
                    return false;
                await this._doAction(conn, app.name, node.ref);
                return true;
            }, { closeAfter: false });
            return !!done;
        } catch (e) {
            console.warn(`[Kiwi] app menus: AT-SPI item ${path?.join(' > ')} failed: ${e.message}`);
            return false;
        }
    }

    // ---- the accessibility bus ----------------------------------------------------------

    _connection() {
        if (!this._bus) {
            this._bus = (async () => {
                // The accessibility bus is D-Bus activated: GNOME has it running already, and
                // asking for its address starts it elsewhere
                const reply = await call(Gio.DBus.session, 'org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Bus',
                    'GetAddress', null, '(s)', this._cancellable, Gio.DBusCallFlags.NONE);
                const [address] = reply.deepUnpack();
                return new Promise((resolve, reject) => {
                    Gio.DBusConnection.new_for_address(address,
                        Gio.DBusConnectionFlags.AUTHENTICATION_CLIENT | Gio.DBusConnectionFlags.MESSAGE_BUS_CONNECTION,
                        null, this._cancellable, (_o, res) => {
                            try {
                                resolve(Gio.DBusConnection.new_for_address_finish(res));
                            } catch (e) {
                                reject(e);
                            }
                        });
                });
            })();
            this._bus.catch(() => {
                this._bus = null; // try again next time (the bus may start later)
            });
        }
        return this._bus;
    }

    // The registered application whose bus name belongs to the window's process
    async _appFor(conn, pid, cancellable) {
        const reply = await call(conn, REGISTRY, ROOT, ACCESSIBLE, 'GetChildren', null, '(a(so))', cancellable,
            Gio.DBusCallFlags.NONE);
        const [apps] = reply.deepUnpack();
        const pids = await Promise.all(apps.map(([name]) =>
            call(conn, 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus',
                'GetConnectionUnixProcessID', new GLib.Variant('(s)', [name]), '(u)', cancellable)
                .then(r => r.deepUnpack()[0], () => 0)));
        const i = pids.indexOf(pid);
        return i >= 0 ? { name: apps[i][0], path: apps[i][1] } : null;
    }

    // The window's frame: the app's top-level whose name is the window title, else the active
    // one; then the whole frame, walked within the node budget
    async _frame(conn, app, title, cancellable) {
        const top = await this._walk(conn, app.name, app.path, cancellable, 1);
        const frames = (top?.children ?? []).filter(n => n.role === ROLE.FRAME || n.role === ROLE.WINDOW);
        const frame = frames.find(f => f.name === title) ??
            frames.find(f => hasState(f.states, STATE.ACTIVE)) ?? frames[0] ?? null;
        return frame ? this._walk(conn, app.name, frame.ref, cancellable) : null;
    }

    // Walk from a node: role, name, states and children of every node, in parallel per level,
    // within a node budget
    async _walk(conn, name, path, cancellable, maxDepth = MAX_DEPTH) {
        let budget = NODE_BUDGET;
        const visit = async (p, depth) => {
            if (budget-- <= 0 || depth > maxDepth)
                return null;
            const ask = (method, type) => call(conn, name, p, ACCESSIBLE, method, null, type, cancellable)
                .then(r => r.deepUnpack()[0], () => null);
            const [role, states, children, label] = await Promise.all([
                ask('GetRole', '(u)'), ask('GetState', '(au)'), ask('GetChildren', '(a(so))'),
                call(conn, name, p, 'org.freedesktop.DBus.Properties', 'Get',
                    new GLib.Variant('(ss)', [ACCESSIBLE, 'Name']), '(v)', cancellable)
                    .then(r => r.recursiveUnpack()[0], () => ''),
            ]);
            const kids = await Promise.all((children ?? [])
                .filter(([n]) => n === name)
                .map(([, cp]) => visit(cp, depth + 1)));
            return { ref: p, role, name: label, states, children: kids.filter(Boolean) };
        };
        return visit(path, 0);
    }

    _doAction(conn, name, path) {
        return call(conn, name, path, ACTION, 'DoAction', new GLib.Variant('(i)', [0]), '(b)', this._cancellable);
    }

    // ---- the primary menu popover -------------------------------------------------------

    // Open the window's primary menu with its popup kept transparent, run `read(menuNode)`,
    // then close it (unless the read activated an item, which closes it). One at a time.
    async _withPopover(conn, app, frame, target, read, { closeAfter = true } = {}) {
        const button = findPrimaryMenuButton(frame);
        if (!button)
            return null;
        while (this._busy)
            await this._busy.catch(() => {});
        const run = (async () => {
            const popup = this._hidePopupsOf(target.pid);
            try {
                await this._doAction(conn, app.name, button.ref);
                await popup.shown;
                const sub = await this._walk(conn, app.name, button.ref, this._cancellable);
                let menu = findRole(sub, ROLE.MENU) ?? findRole(sub, ROLE.POPUP_MENU);
                if (!menu) {
                    // Some toolkits parent the popover to the window, not to its button
                    const all = await this._frame(conn, app, target.title, this._cancellable);
                    menu = findShowingMenu(all);
                }
                const result = menu ? await read(menu) : null;
                if (closeAfter || !result)
                    await this._doAction(conn, app.name, button.ref).catch(() => {});
                return result;
            } finally {
                popup.release();
            }
        })();
        this._busy = run;
        try {
            return await run;
        } finally {
            if (this._busy === run)
                this._busy = null;
        }
    }

    // Keep the app's popup windows transparent until release(); `shown` resolves at the popup's
    // first frame (or after a fail-safe bound when no popup comes)
    _hidePopupsOf(pid) {
        const hidden = new Set();
        let resolveShown;
        const shown = new Promise(r => {
            resolveShown = r;
        });
        let failSafeId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, POPUP_WAIT_MS, () => {
            failSafeId = 0;
            resolveShown();
            return GLib.SOURCE_REMOVE;
        });
        const createdId = global.display.connect('window-created', (_d, win) => {
            if (win.get_pid() !== pid || !POPUP_TYPES.has(win.get_window_type()))
                return;
            const actor = win.get_compositor_private();
            if (!actor)
                return;
            actor.opacity = 0;
            hidden.add(actor);
            const id = actor.connect('first-frame', () => {
                actor.disconnect(id);
                resolveShown();
            });
        });
        return {
            shown,
            release: () => {
                global.display.disconnect(createdId);
                if (failSafeId)
                    GLib.source_remove(failSafeId);
                failSafeId = 0;
                resolveShown();
                // Popups that are still there (an item opened a submenu) show again
                for (const actor of hidden) {
                    if (!actor.is_destroyed?.())
                        actor.opacity = 255;
                }
            },
        };
    }
}

// Popover items carry the flag that sends activation through the popover again
function mark(item) {
    if (item.kind === 'submenu')
        return { ...item, items: item.items.map(mark) };
    if (item.kind === 'item' && item.command)
        return { ...item, command: { ...item.command, popover: true, ref: null } };
    return item;
}

function findByPath(menu, path) {
    let level = menu;
    for (const label of path ?? []) {
        let hit = null;
        const look = n => {
            for (const c of n.children ?? []) {
                if (hit)
                    return;
                if ((c.name ?? '').trim() === label)
                    hit = c;
                else if (!c.name)
                    look(c);
            }
        };
        look(level);
        if (!hit)
            return null;
        level = hit;
    }
    return level === menu ? null : level;
}

function findShowingMenu(node) {
    if (!node)
        return null;
    if ((node.role === ROLE.MENU || node.role === ROLE.POPUP_MENU) && hasState(node.states, STATE.SHOWING))
        return node;
    for (const c of node.children ?? []) {
        const hit = findShowingMenu(c);
        if (hit)
            return hit;
    }
    return null;
}
