// SPDX-License-Identifier: GPL-3.0-or-later
// What Hover Text reads from apps, over the accessibility bus (lib/atspiBus.js: async GDBus with
// timeouts and one cancellable, never libatspi, so a hung app cannot stall the compositor).
//
//   textAt(win, point)      the element under a stage point in a window: its text near the
//                           point (Text.GetStringAtOffset, a sentence), else its name; and its
//                           rect. Descends with Component.GetAccessibleAtPoint.
//   describe(name, path)    role, rect and (for Hover Typing) the text and caret of an object
//   listen(onEvent)         focus, text and caret events of every app (Registry.RegisterEvent;
//                           apps emit only while someone listens)
//
// Coordinates under Wayland: apps cannot know where their window is, so screen coordinates
// are meaningless and Kiwi asks for window coordinates (COORD.WINDOW) and adds the window's
// origin. GTK 4 counts from the window's visible frame (the GtkWindow widget, inside the
// client-side shadow); GTK 3 counts from the toplevel surface (shadow included): the buffer
// rect. Other toolkits (Firefox, Chromium, Qt) are treated like GTK 4; they expose a tree only
// when toolkit-accessibility or a screen reader is on.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { IFACE, appForPid, call, getProperty, openA11yBus, pidOf } from '../../lib/atspiBus.js';
import { COORD, GRANULARITY, isSecret, toStage, toWindow } from './model.js';

const NULL_PATH = '/org/a11y/atspi/null';
const MAX_DEPTH = 40;
const TEXT_LIMIT = 4000;
const STATE_ACTIVE = 1;     // ATSPI_STATE_ACTIVE: bit 1 of the first word
const EVENTS = ['object:state-changed:focused', 'object:text-changed', 'object:text-caret-moved'];
const MEMBERS = ['StateChanged', 'TextChanged', 'TextCaretMoved'];

export class AtspiSource {
    constructor() {
        this._cancellable = null;
        this._bus = null;              // Promise<Gio.DBusConnection>
        this._apps = new Map();        // pid -> {name, path, gtk3}
        this._subs = [];
        this._registered = false;
        this._onEvent = null;
    }

    start() {
        this._cancellable = new Gio.Cancellable();
    }

    stop() {
        this._cancellable?.cancel();
        this._cancellable = null;
        const bus = this._bus;
        this._bus = null;
        const subs = this._subs;
        this._subs = [];
        const registered = this._registered;
        this._registered = false;
        this._onEvent = null;
        bus?.then(conn => {
            for (const id of subs)
                conn.signal_unsubscribe(id);
            if (registered) {
                for (const ev of EVENTS) {
                    call(conn, IFACE.REGISTRY, '/org/a11y/atspi/registry', IFACE.REGISTRY, 'DeregisterEvent',
                        new GLib.Variant('(s)', [ev]), null, null).catch(() => {});
                }
            }
            conn.close(null, null);
        }, () => {});
        this._apps.clear();
    }

    get running() {
        return !!this._cancellable;
    }

    _connection() {
        if (!this._cancellable)
            return Promise.reject(new Error('stopped'));
        if (!this._bus) {
            this._bus = openA11yBus(this._cancellable);
            this._bus.catch(() => {
                this._bus = null; // try again next time (the bus may start later)
            });
        }
        return this._bus;
    }

    /** Whether the accessibility bus answers (false on a bare session). */
    async available() {
        try {
            await this._connection();
            return true;
        } catch (e) {
            return false;
        }
    }

    async _app(conn, pid) {
        let app = this._apps.get(pid);
        if (app)
            return app;
        const found = await appForPid(conn, pid, this._cancellable);
        if (!found)
            return null;
        const version = await getProperty(conn, found.name, found.path, 'org.a11y.atspi.Application', 'Version',
            this._cancellable);
        app = { ...found, gtk3: /^3\./.test(String(version ?? '')) };
        this._apps.set(pid, app);
        return app;
    }

    /** The window's origin for window coordinates of this app (see the header). */
    _origin(win, app) {
        return app?.gtk3 ? win.get_buffer_rect() : win.get_frame_rect();
    }

    // The app's top-level for the window: same name as the title, else the active one
    async _frameOf(conn, app, title) {
        const c = this._cancellable;
        const reply = await call(conn, app.name, app.path, IFACE.ACCESSIBLE, 'GetChildren', null, '(a(so))', c);
        const [children] = reply.deepUnpack();
        const tops = await Promise.all(children.filter(([n]) => n === app.name).map(async ([, path]) => {
            const [name, states] = await Promise.all([
                getProperty(conn, app.name, path, IFACE.ACCESSIBLE, 'Name', c),
                call(conn, app.name, path, IFACE.ACCESSIBLE, 'GetState', null, '(au)', c)
                    .then(r => r.deepUnpack()[0], () => [0, 0]),
            ]);
            return { path, name, active: !!(states[0] & (1 << STATE_ACTIVE)) };
        }));
        return (tops.find(t => t.name === title) ?? tops.find(t => t.active) ?? tops[0])?.path ?? null;
    }

    /**
     * The element under a stage point in `win`, with its text.
     *
     * @param {Meta.Window} win
     * @param {{x: number, y: number}} point stage coordinates
     * @returns {Promise<?{text: string, offset: number, rect: ?object, role: number}>}
     */
    async textAt(win, point) {
        const conn = await this._connection();
        const c = this._cancellable;
        const app = await this._app(conn, win.get_pid());
        if (!app)
            return null;
        const origin = this._origin(win, app);
        const wp = toWindow(point, origin);
        let node = await this._frameOf(conn, app, win.get_title());
        if (!node)
            return null;
        const frame = node;
        for (let depth = 0; depth < MAX_DEPTH; depth++) {
            const child = await call(conn, app.name, node, IFACE.COMPONENT, 'GetAccessibleAtPoint',
                new GLib.Variant('(iiu)', [wp.x, wp.y, COORD.WINDOW]), '((so))', c)
                .then(r => r.deepUnpack()[0], () => null);
            if (!child || child[1] === NULL_PATH || child[1] === node || child[0] !== app.name)
                break;
            node = child[1];
        }
        if (node === frame)
            return null;
        const info = await this._info(conn, app.name, node);
        if (!info || isSecret(info.role))
            return null;
        let text = '';
        let offset = -1;
        if (info.interfaces.includes(IFACE.TEXT)) {
            offset = await call(conn, app.name, node, IFACE.TEXT, 'GetOffsetAtPoint',
                new GLib.Variant('(iiu)', [wp.x, wp.y, COORD.WINDOW]), '(i)', c)
                .then(r => r.deepUnpack()[0], () => -1);
            if (offset >= 0) {
                text = await call(conn, app.name, node, IFACE.TEXT, 'GetStringAtOffset',
                    new GLib.Variant('(iu)', [offset, GRANULARITY.SENTENCE]), '(sii)', c)
                    .then(r => r.deepUnpack()[0], () => '');
            }
            if (!text.trim()) {
                text = await call(conn, app.name, node, IFACE.TEXT, 'GetText',
                    new GLib.Variant('(ii)', [0, TEXT_LIMIT]), '(s)', c)
                    .then(r => r.deepUnpack()[0], () => '');
                offset = Math.max(0, offset);
            } else {
                offset = -1;
            }
        }
        if (!text.trim())
            text = info.name ?? '';
        return { text, offset, role: info.role, rect: toStage(info.extents, origin) };
    }

    // Role, name, interfaces and window-coordinate extents of one object
    async _info(conn, name, path) {
        const c = this._cancellable;
        const [role, accName, interfaces, extents] = await Promise.all([
            call(conn, name, path, IFACE.ACCESSIBLE, 'GetRole', null, '(u)', c).then(r => r.deepUnpack()[0], () => null),
            getProperty(conn, name, path, IFACE.ACCESSIBLE, 'Name', c),
            call(conn, name, path, IFACE.ACCESSIBLE, 'GetInterfaces', null, '(as)', c)
                .then(r => r.deepUnpack()[0], () => []),
            call(conn, name, path, IFACE.COMPONENT, 'GetExtents', new GLib.Variant('(u)', [COORD.WINDOW]), '((iiii))', c)
                .then(r => {
                    const [[x, y, width, height]] = r.deepUnpack();
                    return { x, y, width, height };
                }, () => null),
        ]);
        if (role === null)
            return null;
        return { role, name: accName, interfaces, extents };
    }

    /**
     * An object that sent an event: its role, its rect in stage coordinates (through `win`, or
     * the focused window of the same process) and, with `withText`, its text and caret.
     *
     * @returns {Promise<?{role: number, rect: ?object, text?: string, caret?: number, pid: number}>}
     */
    async describe(name, path, { withText = false, windowFor = null } = {}) {
        const conn = await this._connection();
        const c = this._cancellable;
        const [info, pid] = await Promise.all([this._info(conn, name, path), pidOf(conn, name, c)]);
        if (!info)
            return null;
        const win = windowFor?.(pid) ?? null;
        const app = win ? await this._app(conn, pid) : null;
        const rect = win ? toStage(info.extents, this._origin(win, app)) : null;
        const out = { role: info.role, rect, pid, interfaces: info.interfaces };
        if (withText && info.interfaces.includes(IFACE.TEXT) && !isSecret(info.role)) {
            const [text, caret] = await Promise.all([
                call(conn, name, path, IFACE.TEXT, 'GetText', new GLib.Variant('(ii)', [0, TEXT_LIMIT]), '(s)', c)
                    .then(r => r.deepUnpack()[0], () => ''),
                getProperty(conn, name, path, IFACE.TEXT, 'CaretOffset', c),
            ]);
            out.text = text;
            out.caret = Number.isFinite(caret) ? caret : text.length;
        }
        return out;
    }

    /**
     * Listen to focus, text and caret events of every app.
     *
     * @param {(e: {kind: 'focus'|'text'|'caret', name: string, path: string, detail: string,
     *   detail1: number}) => void} onEvent
     */
    async listen(onEvent) {
        this._onEvent = onEvent;
        if (this._subs.length)
            return;
        const conn = await this._connection();
        if (!this._cancellable || this._subs.length)
            return;
        for (const member of MEMBERS) {
            this._subs.push(conn.signal_subscribe(null, IFACE.EVENT_OBJECT, member, null, null,
                Gio.DBusSignalFlags.NONE, (_c, sender, path, _i, signal, params) => {
                    const [detail, detail1] = params.deepUnpack();
                    const kind = signal === 'StateChanged' ? 'focus' : signal === 'TextChanged' ? 'text' : 'caret';
                    this._onEvent?.({ kind, name: sender, path, detail, detail1 });
                }));
        }
        // Apps emit events only when the registry knows someone wants them
        this._registered = true;
        await Promise.all(EVENTS.map(ev => call(conn, IFACE.REGISTRY, '/org/a11y/atspi/registry', IFACE.REGISTRY,
            'RegisterEvent', new GLib.Variant('(s)', [ev]), null, this._cancellable).catch(() => {})));
    }
}
