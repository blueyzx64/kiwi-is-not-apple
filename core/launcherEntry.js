// SPDX-License-Identifier: GPL-3.0-or-later
// LauncherEntryService: one listener for com.canonical.Unity.LauncherEntry Update signals on
// the session bus, so every dock-like surface reads the same per-app progress and counts
// (pure part: launcherEntryModel.js). The owner's installer mirrors its install progress here
// (docs/architecture/installer-dbus-contract.md), so the dock needs no installer-specific code.
//
//   const entries = ctx.launcherEntry.acquire(cleanup);  // listening starts with the first user
//   entries.entry('org.gnome.Nautilus.desktop')          // LauncherEntry or null
//   ctx.events.on('launcher-entry-changed', ({ appId, entry }) => ...)
//
// An app's entry is forgotten when its sender leaves the bus. Idle cost: one signal match.
//
// Shell API: none (Gio D-Bus).

import Gio from 'gi://Gio';

import { LauncherEntryBook } from './launcherEntryModel.js';

const IFACE = 'com.canonical.Unity.LauncherEntry';

export class LauncherEntryService {
    /** @param {import('./events.js').EventHub} events */
    constructor(events) {
        this._events = events;
        this._book = new LauncherEntryBook();
        this._refs = 0;
        this._subscriptionId = 0;
        this._watches = new Map(); // sender -> watch id
    }

    /** @returns {?import('./launcherEntryModel.js').LauncherEntry} */
    entry(appId) {
        return this._book.entry(appId);
    }

    /**
     * @param {{add: Function}} owner a CleanupRegistry; the use ends when it is disposed
     * @returns {LauncherEntryService}
     */
    acquire(owner) {
        this._refs++;
        if (this._refs === 1)
            this._start();
        let released = false;
        owner.add(() => {
            if (released)
                return;
            released = true;
            this._refs--;
            if (this._refs === 0)
                this._stopListening();
        });
        return this;
    }

    stop() {
        this._refs = 0;
        this._stopListening();
    }

    _start() {
        this._subscriptionId = Gio.DBus.session.signal_subscribe(null, IFACE, 'Update', null, null,
            Gio.DBusSignalFlags.NONE, (_c, sender, _path, _iface, _signal, params) => {
                const [uri, props] = params.recursiveUnpack();
                const appId = this._book.update(sender, uri, props);
                this._watch(sender);
                if (appId)
                    this._events.emit('launcher-entry-changed', { appId, entry: this._book.entry(appId) });
            });
    }

    _stopListening() {
        if (this._subscriptionId) {
            Gio.DBus.session.signal_unsubscribe(this._subscriptionId);
            this._subscriptionId = 0;
        }
        for (const id of this._watches.values())
            Gio.bus_unwatch_name(id);
        this._watches.clear();
        this._book.clear();
    }

    // Forget a sender's entries when it leaves the bus (one watch per sender with entries)
    _watch(sender) {
        if (this._watches.has(sender) || !this._book.senders().includes(sender))
            return;
        const id = Gio.bus_watch_name(Gio.BusType.SESSION, sender, Gio.BusNameWatcherFlags.NONE, null, () => {
            Gio.bus_unwatch_name(id);
            this._watches.delete(sender);
            for (const appId of this._book.dropSender(sender))
                this._events.emit('launcher-entry-changed', { appId, entry: null });
        });
        this._watches.set(sender, id);
    }
}
