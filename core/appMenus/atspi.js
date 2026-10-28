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

import { IFACE, appForPid, call, openA11yBus } from '../../lib/atspiBus.js';
import {
    ROLE, STATE, ITEM_ROLES, atspiPopoverItems, atspiToMenus, findPrimaryMenuButton, findRole, hasState, labelTarget,
} from './nativeModel.js';

const ACCESSIBLE = IFACE.ACCESSIBLE;
const ACTION = IFACE.ACTION;
const NODE_BUDGET = 1500;
const MAX_DEPTH = 48; // GTK 4 nests a popover item about 30 levels deep
const OPEN_POLLS = 10;
const OPEN_POLL_MS = 150;
const CLOSE_WAIT_MS = 200;
const POPUP_WAIT_MS = 1500; // fail-safe only: the read waits for the popup's first frame
const POPUP_TYPES = new Set([Meta.WindowType.DROPDOWN_MENU, Meta.WindowType.POPUP_MENU, Meta.WindowType.MENU]);

function sleep(ms) {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
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
            // The bus is D-Bus activated (lib/atspiBus.js)
            this._bus = openA11yBus(this._cancellable);
            this._bus.catch(() => {
                this._bus = null; // try again next time (the bus may start later)
            });
        }
        return this._bus;
    }

    // The registered application whose bus name belongs to the window's process
    _appFor(conn, pid, cancellable) {
        return appForPid(conn, pid, cancellable);
    }

    // The window's frame: the app's top-level whose name is the window title, else the active
    // one; then the whole frame, walked within the node budget
    async _frame(conn, app, title, cancellable, items = false) {
        const top = await this._walk(conn, app.name, app.path, cancellable, 1);
        const frames = (top?.children ?? []).filter(n => n.role === ROLE.FRAME || n.role === ROLE.WINDOW);
        const frame = frames.find(f => f.name === title) ??
            frames.find(f => hasState(f.states, STATE.ACTIVE)) ?? frames[0] ?? null;
        return frame ? this._walk(conn, app.name, frame.ref, cancellable, MAX_DEPTH, items) : null;
    }

    // Walk from a node: role, name, states and children of every node, in parallel per level,
    // within a node budget
    async _walk(conn, name, path, cancellable, maxDepth = MAX_DEPTH, items = false) {
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
            const node = { ref: p, role, name: label, states, children: kids.filter(Boolean) };
            // GTK 4 menu items have no name: their label is a separate node (relation
            // labelled-by) and the shortcut is the Action's key binding
            if (items && ITEM_ROLES.has(role)) {
                const [text, binding] = await Promise.all([
                    this._labelText(conn, name, p, cancellable), this._keyBinding(conn, name, p, cancellable)]);
                node.label = text;
                node.keyBinding = binding;
            }
            return node;
        };
        return visit(path, 0);
    }

    async _labelText(conn, name, path, cancellable) {
        try {
            const reply = await call(conn, name, path, ACCESSIBLE, 'GetRelationSet', null, '(a(ua(so)))', cancellable);
            const [rels] = reply.recursiveUnpack();
            const target = labelTarget(rels);
            if (!target)
                return null;
            const text = await call(conn, target[0], target[1], 'org.a11y.atspi.Text', 'GetText',
                new GLib.Variant('(ii)', [0, -1]), '(s)', cancellable);
            return text.deepUnpack()[0] || null;
        } catch (e) {
            return null;
        }
    }

    async _keyBinding(conn, name, path, cancellable) {
        try {
            const reply = await call(conn, name, path, ACTION, 'GetKeyBinding', new GLib.Variant('(i)', [0]), '(s)',
                cancellable);
            return reply.deepUnpack()[0] || null;
        } catch (e) {
            return null;
        }
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
                // The items are built a moment after the popover maps: poll (bounded)
                // until the menu has labelled items
                let menu = null;
                for (let i = 0; i < OPEN_POLLS && !menu; i++) {
                    // GTK 4 parents the popover to the GtkMenuButton, the toggle's parent: read the frame
                    const all = await this._frame(conn, app, target.title, this._cancellable, true);
                    const found = findShowingMenu(all);
                    if (found && atspiPopoverItems(found).length)
                        menu = found;
                    else
                        await sleep(OPEN_POLL_MS);
                }
                const result = menu ? await read(menu) : null;
                if (closeAfter || !result)
                    await this._close(conn, app, button);
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

    // Close the popover through the button's action and confirm by its pressed state
    async _close(conn, app, button) {
        for (let i = 0; i < 3; i++) {
            await this._doAction(conn, app.name, button.ref).catch(() => {});
            await sleep(CLOSE_WAIT_MS);
            const reply = await call(conn, app.name, button.ref, ACCESSIBLE, 'GetState', null, '(au)', this._cancellable)
                .catch(() => null);
            const states = reply?.deepUnpack()[0];
            if (!states || !hasState(states, STATE.PRESSED))
                return;
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
            actor.connect('destroy', () => hidden.delete(actor));
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
                for (const actor of hidden)
                    actor.opacity = 255;
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
                if ((c.label || c.name || '').trim() === label)
                    hit = c;
                else if (!c.name && !c.label)
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
