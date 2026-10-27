// SPDX-License-Identifier: GPL-3.0-or-later
// InstallerClient: Kiwi's side of the owner's installer API, io.github.blueyzx64.Installer1
// (docs/architecture/installer-dbus-contract.md; pure parts in installerModel.js).
//
//   const installer = ctx.installer.acquire(cleanup);   // starts watching with the first user
//   installer.available                                  // false until the installer exists
//   await installer.uninstall('lumen-notes')             // {kind: 'removed'|'cancelled'|'failed', code}
//   installer.progress.fraction                          // 0..1 while it installs, else null
//
// The installer is optional: Kiwi never depends on it, so every call is async with a timeout,
// nothing runs in the Shell until a feature acquires the client, and a missing or older
// installer just reads as "not available". The confirmation for an uninstall always happens in
// the installer's own window; Kiwi never removes anything itself and never reads its ledger.
//
// Events on ctx.events: installer-availability-changed, installer-progress,
// installer-apps-changed, installer-uninstall-finished.
//
// Shell API: none (Gio D-Bus on the session bus only).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
    CALL_TIMEOUT_MS, INSTALLER_BUS_NAME, INSTALLER_INTERFACE, INSTALLER_OBJECT_PATH, ProgressBook,
    availability, isUsable, parseApps, parseOutcome, parseProgress,
} from './installerModel.js';

Gio._promisify(Gio.DBusConnection.prototype, 'call', 'call_finish');

const cancelled = e => e?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);

export class InstallerClient {
    /** @param {import('./events.js').EventHub} events */
    constructor(events) {
        this._events = events;
        this._refs = 0;
        this._cancellable = null;
        this._state = { owned: false, activatable: false, version: null };
        this._availability = 'absent';
        this._progress = new ProgressBook();
        this._pending = new Map();   // appId -> {promise, resolve}
        this._watchId = 0;
        this._subscriptionId = 0;
    }

    /** 'running' | 'activatable' | 'incompatible' | 'absent' */
    get availability() {
        return this._availability;
    }

    /** True when calls can be made (the installer runs, or a service file can start it). */
    get available() {
        return isUsable(this._availability);
    }

    /** @returns {ProgressBook} the installs in flight (empty while the installer is idle) */
    get progress() {
        return this._progress;
    }

    /**
     * Use the client; watching starts with the first user and ends with the last.
     *
     * @param {{add: Function}} owner a CleanupRegistry; the use ends when it is disposed
     * @returns {InstallerClient}
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
                this._stopWatching();
        });
        return this;
    }

    /** End for good (extension disable), whatever the use count. */
    stop() {
        this._refs = 0;
        this._stopWatching();
    }

    // ---- calls ---------------------------------------------------------------------------------

    /** @returns {Promise<import('./installerModel.js').ManagedApp[]>} [] when unavailable */
    async listApps() {
        const reply = await this._call('ListManagedApps', null, '(a(sssb))', CALL_TIMEOUT_MS.list);
        return reply ? parseApps(reply.recursiveUnpack()[0]) : [];
    }

    /** @returns {Promise<{owned: boolean, appId: string}>} */
    async ownsDesktopId(desktopId) {
        const reply = await this._call('OwnsDesktopId', new GLib.Variant('(s)', [desktopId]), '(bs)', CALL_TIMEOUT_MS.owns);
        if (!reply)
            return { owned: false, appId: '' };
        const [owned, appId] = reply.recursiveUnpack();
        return { owned, appId };
    }

    /** Show the installer's window for a package file (the same as opening it). */
    async open(path) {
        await this._call('Open', new GLib.Variant('(ss)', [path, '']), '()', CALL_TIMEOUT_MS.open);
    }

    /**
     * Ask the installer to remove an app. The installer shows its own confirmation; the
     * promise resolves when it reports UninstallFinished. A second call for the same app joins
     * the first.
     *
     * @param {string} appId the installer's id (ManagedApp.appId)
     * @returns {Promise<{kind: 'removed'|'cancelled'|'failed', code: string}>}
     */
    uninstall(appId) {
        const known = this._pending.get(appId);
        if (known)
            return known.promise;
        let resolve;
        const promise = new Promise(r => (resolve = r));
        this._pending.set(appId, { promise, resolve });
        // Subscribed since start(), so the signal cannot slip by while the call is out
        this._call('Uninstall', new GLib.Variant('(ss)', [appId, '']), '()', CALL_TIMEOUT_MS.uninstall)
            .then(reply => {
                if (!reply)
                    this._settle(appId, { kind: 'failed', code: 'unavailable' });
            })
            .catch(e => this._settle(appId, { kind: 'failed', code: cancelled(e) ? 'shutdown' : 'call-failed' }));
        return promise;
    }

    // ---- watching ------------------------------------------------------------------------------

    _start() {
        const cancellable = this._cancellable = new Gio.Cancellable();
        const bus = Gio.DBus.session;
        this._subscriptionId = bus.signal_subscribe(INSTALLER_BUS_NAME, INSTALLER_INTERFACE, null,
            INSTALLER_OBJECT_PATH, null, Gio.DBusSignalFlags.NONE,
            (_c, _sender, _path, _iface, signal, params) => this._onSignal(signal, params));
        this._watchId = Gio.bus_watch_name(Gio.BusType.SESSION, INSTALLER_BUS_NAME, Gio.BusNameWatcherFlags.NONE,
            () => this._setState({ owned: true }), () => this._vanished());
        this._probeActivatable(cancellable);
    }

    _stopWatching() {
        this._cancellable?.cancel();
        this._cancellable = null;
        if (this._subscriptionId) {
            Gio.DBus.session.signal_unsubscribe(this._subscriptionId);
            this._subscriptionId = 0;
        }
        if (this._watchId) {
            Gio.bus_unwatch_name(this._watchId);
            this._watchId = 0;
        }
        for (const appId of [...this._pending.keys()])
            this._settle(appId, { kind: 'failed', code: 'shutdown' });
        this._progress.clear();
        this._state = { owned: false, activatable: false, version: null };
        this._availability = 'absent';
    }

    async _probeActivatable(cancellable) {
        try {
            const reply = await Gio.DBus.session.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
                'org.freedesktop.DBus', 'ListActivatableNames', null, new GLib.VariantType('(as)'),
                Gio.DBusCallFlags.NO_AUTO_START, 2000, cancellable);
            const [names] = reply.deepUnpack();
            this._setState({ activatable: names.includes(INSTALLER_BUS_NAME) });
        } catch (e) {
            if (!cancelled(e))
                console.debug(`[Kiwi] installer: cannot list activatable names (${e.message})`);
        }
    }

    async _readVersion() {
        const cancellable = this._cancellable;
        try {
            const reply = await Gio.DBus.session.call(INSTALLER_BUS_NAME, INSTALLER_OBJECT_PATH,
                'org.freedesktop.DBus.Properties', 'Get',
                new GLib.Variant('(ss)', [INSTALLER_INTERFACE, 'Version']), new GLib.VariantType('(v)'),
                Gio.DBusCallFlags.NO_AUTO_START, CALL_TIMEOUT_MS.owns, cancellable);
            const [version] = reply.recursiveUnpack();
            this._setState({ version });
        } catch (e) {
            if (!cancelled(e))
                console.debug(`[Kiwi] installer: no Installer1 on the bus name (${e.message})`);
        }
    }

    _vanished() {
        this._progress.clear();
        for (const appId of [...this._pending.keys()])
            this._settle(appId, { kind: 'failed', code: 'installer-gone' });
        this._setState({ owned: false, version: null });
    }

    _setState(patch) {
        const wasOwned = this._state.owned;
        this._state = { ...this._state, ...patch };
        const next = availability(this._state);
        if (next !== this._availability) {
            this._availability = next;
            this._events.emit('installer-availability-changed', { availability: next });
        }
        if (this._state.owned && !wasOwned)
            this._readVersion();
    }

    _onSignal(signal, params) {
        switch (signal) {
        case 'AppsChanged':
            this._events.emit('installer-apps-changed', {});
            break;
        case 'UninstallFinished': {
            const [appId, outcome] = params.recursiveUnpack();
            this._settle(appId, parseOutcome(outcome));
            break;
        }
        case 'Progress': {
            const progress = parseProgress(...params.recursiveUnpack());
            if (this._progress.apply(progress)) {
                this._events.emit('installer-progress', {
                    operations: this._progress.operations, fraction: this._progress.fraction,
                });
            }
            break;
        }
        }
    }

    _settle(appId, outcome) {
        const entry = this._pending.get(appId);
        if (entry) {
            this._pending.delete(appId);
            entry.resolve(outcome);
        }
        this._events.emit('installer-uninstall-finished', { appId, outcome: outcome.kind, code: outcome.code });
    }

    // The reply of a call, or null when the installer cannot be used (nothing is started for a
    // 'absent' one). Errors of the call itself reject.
    async _call(method, params, replyType, timeout) {
        if (!this._cancellable || !this.available)
            return null;
        return Gio.DBus.session.call(INSTALLER_BUS_NAME, INSTALLER_OBJECT_PATH, INSTALLER_INTERFACE,
            method, params, new GLib.VariantType(replyType), Gio.DBusCallFlags.NONE, timeout, this._cancellable);
    }
}
