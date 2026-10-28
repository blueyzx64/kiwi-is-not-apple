// SPDX-License-Identifier: GPL-3.0-or-later
// Reminders data: the open tasks of every enabled task list in Evolution Data Server (the
// lists GNOME's Endeavour and Evolution show, "Personal" on a new account), and ticking one
// done from the widget.
//
// Why D-Bus and not libecal: the Shell keeps EDS out of its process (its calendar data comes
// from the separate gnome-shell-calendar-server, which reads events only, no tasks). Loading
// libecal into the compositor would bring EDS's threads and sync calls with it. EDS speaks
// D-Bus, so Kiwi asks it directly, asynchronously, and parses the iCalendar text in data.js:
//
//   org.gnome.evolution.dataserver.Sources5  /org/gnome/evolution/dataserver/SourceManager
//     ObjectManager.GetManagedObjects -> Source {UID, Data (a key file: [Task List])}
//   org.gnome.evolution.dataserver.Calendar8 /org/gnome/evolution/dataserver/CalendarFactory
//     CalendarFactory.OpenTaskList(uid) -> (object path, bus name of the backend)
//   that backend's Calendar: Open(), GetObjectList(sexp) -> as (VTODO texts),
//     ModifyObjects(as, mod, opflags), Close(); its Revision property changes on every edit,
//     which is when the list is read again.
//
// Checked against evolution-data-server 3.60 (Fedora 44). Nothing runs while no Reminders
// widget is visible: stop() closes every list it opened.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { completeTodo, parseTodo, sortReminders, taskListOf } from '../data.js';
import { Provider } from './base.js';

const SOURCES_BUS = 'org.gnome.evolution.dataserver.Sources5';
const SOURCES_PATH = '/org/gnome/evolution/dataserver/SourceManager';
const SOURCE_IFACE = 'org.gnome.evolution.dataserver.Source';
const CAL_BUS = 'org.gnome.evolution.dataserver.Calendar8';
const FACTORY_PATH = '/org/gnome/evolution/dataserver/CalendarFactory';
const FACTORY_IFACE = 'org.gnome.evolution.dataserver.CalendarFactory';
const CAL_IFACE = 'org.gnome.evolution.dataserver.Calendar';
const OPEN_ONLY = '(not (is-completed?))';
const TIMEOUT_MS = 20000;
const SETTLE_MS = 300;

function call(bus, path, iface, method, params, replyType, cancel) {
    return new Promise((resolve, reject) => {
        Gio.DBus.session.call(bus, path, iface, method, params, replyType ? new GLib.VariantType(replyType) : null,
            Gio.DBusCallFlags.NONE, TIMEOUT_MS, cancel, (conn, res) => {
                try {
                    resolve(conn.call_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

const cancelled = e => e?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);

export class RemindersProvider extends Provider {
    initial() {
        return { state: 'loading', lists: [], items: [] };
    }

    run(cleanup) {
        const cancel = new Gio.Cancellable();
        this._cancel = cancel;
        this._lists = new Map(); // source uid -> {uid, name, color, bus, path, sub, objects: Map(uid -> ics)}
        this._pending = new Set(); // "list uid" ticked, waiting for EDS
        this._settle = 0;
        this._cleanup = cleanup;
        cleanup.add(() => {
            cancel.cancel();
            for (const list of this._lists.values())
                this._close(list);
            this._lists.clear();
            this._pending.clear();
        });
        this._open(cancel).catch(e => {
            if (cancelled(e))
                return;
            console.warn('[Kiwi] reminders: Evolution Data Server is not available:', e.message);
            this.publish({ state: 'unavailable', lists: [], items: [] });
        });
    }

    async _open(cancel) {
        const [objects] = (await call(SOURCES_BUS, SOURCES_PATH, 'org.freedesktop.DBus.ObjectManager',
            'GetManagedObjects', null, '(a{oa{sa{sv}}})', cancel)).deepUnpack();
        const sources = [];
        for (const ifaces of Object.values(objects)) {
            const props = ifaces[SOURCE_IFACE];
            if (!props)
                continue;
            const uid = props.UID?.deepUnpack();
            const list = taskListOf(props.Data?.deepUnpack());
            if (uid && list?.enabled)
                sources.push({ uid, ...list });
        }
        if (!sources.length) {
            this.publish({ state: 'no-lists', lists: [], items: [] });
            return;
        }
        await Promise.all(sources.map(s => this._openList(s, cancel).catch(e => {
            if (!cancelled(e))
                console.warn(`[Kiwi] reminders: could not open the list ${s.name}:`, e.message);
        })));
        if (!cancel.is_cancelled())
            this._publish();
    }

    async _openList(source, cancel) {
        const [path, bus] = (await call(CAL_BUS, FACTORY_PATH, FACTORY_IFACE, 'OpenTaskList',
            new GLib.Variant('(s)', [source.uid]), '(ss)', cancel)).deepUnpack();
        if (cancel.is_cancelled())
            return;
        const list = { ...source, bus, path, sub: 0, objects: new Map() };
        this._lists.set(source.uid, list);
        // Any change to the list bumps its Revision property
        list.sub = Gio.DBus.session.signal_subscribe(bus, 'org.freedesktop.DBus.Properties', 'PropertiesChanged', path,
            null, Gio.DBusSignalFlags.NONE, () => this._queue());
        await call(bus, path, CAL_IFACE, 'Open', null, null, cancel);
        await this._fetch(list, cancel);
    }

    async _fetch(list, cancel) {
        const [texts] = (await call(list.bus, list.path, CAL_IFACE, 'GetObjectList',
            new GLib.Variant('(s)', [OPEN_ONLY]), '(as)', cancel)).deepUnpack();
        const objects = new Map();
        for (const ics of texts) {
            const todo = parseTodo(ics);
            if (todo && !objects.has(todo.uid))
                objects.set(todo.uid, { ics, todo });
        }
        list.objects = objects;
    }

    // Many property changes come at once: read the lists again once they settle
    _queue() {
        if (!this.running || this._settle)
            return;
        this._settle = this._cleanup.timeout(SETTLE_MS, () => {
            this._settle = 0;
            const cancel = this._cancel;
            Promise.all([...this._lists.values()].map(l => this._fetch(l, cancel).catch(e => {
                if (!cancelled(e))
                    console.warn(`[Kiwi] reminders: could not read ${l.name}:`, e.message);
            }))).then(() => {
                if (!cancel.is_cancelled())
                    this._publish();
            });
        }, { name: 'kiwi-widgets-reminders-settle' });
    }

    _close(list) {
        if (list.sub)
            Gio.DBus.session.signal_unsubscribe(list.sub);
        list.sub = 0;
        // Tell the backend Kiwi is done with the list (fire and forget: it may be gone)
        Gio.DBus.session.call(list.bus, list.path, CAL_IFACE, 'Close', null, null, Gio.DBusCallFlags.NONE, 5000,
            null, (conn, res) => {
                try {
                    conn.call_finish(res);
                } catch (_e) {
                    // the backend went away first
                }
            });
    }

    _publish() {
        const items = [];
        for (const list of this._lists.values()) {
            for (const { todo } of list.objects.values())
                items.push({ ...todo, list: list.uid, listName: list.name, color: list.color });
        }
        // A ticked reminder leaves the list right away; EDS confirms it a moment later
        const open = sortReminders(items).filter(r => !this._pending.has(`${r.list} ${r.uid}`));
        this.publish({
            state: 'ready',
            lists: [...this._lists.values()].map(l => ({ uid: l.uid, name: l.name, color: l.color })),
            items: open,
        });
    }

    /**
     * Mark a reminder done (the widget's circle). Recurring reminders are left to the app, as
     * EDS would complete the whole series.
     *
     * @returns {boolean} false when it cannot be ticked here
     */
    complete(listUid, uid) {
        const list = this._lists?.get(listUid);
        const entry = list?.objects.get(uid);
        if (!entry || entry.todo.recurring || !this.running)
            return false;
        const key = `${listUid} ${uid}`;
        this._pending.add(key);
        this._publish();
        const cancel = this._cancel;
        call(list.bus, list.path, CAL_IFACE, 'ModifyObjects',
            new GLib.Variant('(assu)', [[completeTodo(entry.ics, new Date())], 'this', 0]), null, cancel)
            .catch(e => {
                if (cancelled(e))
                    return;
                console.warn('[Kiwi] reminders: could not complete a reminder:', e.message);
                this._pending.delete(key);
                this._publish();
            })
            .finally(() => {
                // The list is read again on its Revision change; drop the mark after that
                if (this.running)
                    this._cleanup.timeout(5000, () => this._pending.delete(key), { name: 'kiwi-widgets-reminders-pending' });
            });
        return true;
    }
}
