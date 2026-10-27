// SPDX-License-Identifier: GPL-3.0-or-later
// UninstallService: may this app be deleted, and do it through its owner (rules in
// uninstallModel.js). For Launchpad's jiggle mode (P3) and the dock Trash.
//
//   const uninstall = ctx.uninstall.acquire(cleanup);
//   const decision = await uninstall.decide(app.get_app_info());   // {removable, backend, ...}
//   const result = await uninstall.run(decision, { name, confirm });
//   // result.kind: 'removed' | 'cancelled' | 'failed' | 'handed-off'
//
// Backends:
//   installer    Installer1.Uninstall (core/installer.js); the installer confirms; 'removed'
//                arrives with UninstallFinished, so the caller can play the poof then.
//   software     GNOME Software's `details` action on its page for the app, where its own
//                Uninstall button and confirmation are: 'handed-off'. The removal shows up as
//                Shell.AppSystem installed-changed.
//   flatpak-cli  `flatpak uninstall --noninteractive` only after `confirm()` (Kiwi's alert,
//                supplied by the caller's UI) resolved true. No confirm callback: no removal.
// Nothing else is ever removed (RPMs not from the installer: never).
//
// Async everywhere: a decide() makes at most one D-Bus call (the installer's list is cached and
// refreshed on AppsChanged); nothing runs until a feature acquires the service.
//
// Shell API: none (Gio D-Bus, Gio.Subprocess).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { CleanupRegistry } from '../lib/disposables.js';
import { decide, flatpakArgv, flatpakOutcome } from './uninstallModel.js';

Gio._promisify(Gio.DBusConnection.prototype, 'call', 'call_finish');
Gio._promisify(Gio.Subprocess.prototype, 'wait_async', 'wait_finish');

const SOFTWARE_BUS_NAME = 'org.gnome.Software';
const SOFTWARE_PATH = '/org/gnome/Software';
const SOFTWARE_TIMEOUT_MS = 8000;
const cancelled = e => e?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);

export class UninstallService {
    /**
     * @param {{installer: import('./installer.js').InstallerClient, events: object}} deps
     */
    constructor({ installer, events }) {
        this._installerService = installer;
        this._events = events;
        this._refs = 0;
        this._cleanup = null;
        this._managed = null;       // Promise<Map desktopId -> ManagedApp> | null
        this._software = null;      // Promise<boolean> | null
        this._flatpakCli = null;    // boolean | null
    }

    /**
     * @param {{add: Function}} owner
     * @returns {UninstallService}
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
                this._stopService();
        });
        return this;
    }

    stop() {
        this._refs = 0;
        this._stopService();
    }

    _start() {
        const cleanup = this._cleanup = new CleanupRegistry();
        this._cancellable = new Gio.Cancellable();
        cleanup.add(() => this._cancellable.cancel());
        this._installer = this._installerService.acquire(cleanup);
        const forget = () => (this._managed = null);
        this._events.on('installer-apps-changed', forget, cleanup);
        this._events.on('installer-availability-changed', forget, cleanup);
    }

    _stopService() {
        this._cleanup?.dispose();
        this._cleanup = null;
        this._installer = null;
        this._managed = this._software = this._flatpakCli = null;
    }

    /**
     * @param {Gio.DesktopAppInfo} info the app (Shell.App get_app_info())
     * @returns {Promise<import('./uninstallModel.js').Decision>}
     */
    async decide(info) {
        if (!this._cleanup || !info)
            return decide(null, {});
        const desktopId = info.get_id() ?? '';
        const [managed, software] = await Promise.all([this._managedApps(), this._softwareAvailable()]);
        const record = managed.get(desktopId) ?? null;
        return decide({
            desktopId,
            path: info.get_filename?.() ?? null,
            installerManagedKey: info.get_string?.('X-Installer-Managed') ?? null,
            flatpakKey: info.get_string?.('X-Flatpak') ?? null,
            managed: record ? { appId: record.appId, canUninstall: record.canUninstall } : null,
            userDataDir: GLib.get_user_data_dir(),
        }, {
            installer: !!this._installer?.available,
            software,
            flatpakCli: this._hasFlatpakCli(),
        });
    }

    /**
     * Remove through the decided backend.
     *
     * @param {import('./uninstallModel.js').Decision} decision from decide()
     * @param {{confirm?: () => Promise<boolean>}} [ui] Kiwi's confirmation, needed by the
     *   flatpak command only
     * @returns {Promise<{kind: 'removed'|'cancelled'|'failed'|'handed-off', code: string}>}
     */
    async run(decision, { confirm = null } = {}) {
        if (!this._cleanup || !decision?.removable)
            return { kind: 'failed', code: 'not-removable' };
        try {
            switch (decision.backend) {
            case 'installer':
                return await this._installer.uninstall(decision.target);
            case 'software':
                await this._softwareDetails(decision.target);
                return { kind: 'handed-off', code: '' };
            case 'flatpak-cli':
                if (!confirm || !await confirm())
                    return { kind: 'cancelled', code: '' };
                return await this._flatpakUninstall(decision);
            default:
                return { kind: 'failed', code: 'no-backend' };
            }
        } catch (e) {
            if (!cancelled(e))
                console.error(`[Kiwi] uninstall of ${decision.target} failed:`, e.message);
            return { kind: 'failed', code: cancelled(e) ? 'shutdown' : 'error' };
        }
    }

    // ---- backends ------------------------------------------------------------------------------

    _managedApps() {
        if (!this._managed) {
            this._managed = (this._installer?.available ? this._installer.listApps() : Promise.resolve([]))
                .then(apps => new Map(apps.filter(a => a.desktopId).map(a => [a.desktopId, a])))
                .catch(e => {
                    console.warn('[Kiwi] uninstall: the installer did not list its apps:', e.message);
                    this._managed = null;
                    return new Map();
                });
        }
        return this._managed;
    }

    _softwareAvailable() {
        if (!this._software) {
            const bus = Gio.DBus.session;
            const ask = (method, params, type) => bus.call('org.freedesktop.DBus', '/org/freedesktop/DBus',
                'org.freedesktop.DBus', method, params, new GLib.VariantType(type),
                Gio.DBusCallFlags.NO_AUTO_START, 2000, this._cancellable).then(r => r.deepUnpack()[0]);
            this._software = Promise.all([
                ask('NameHasOwner', new GLib.Variant('(s)', [SOFTWARE_BUS_NAME]), '(b)'),
                ask('ListActivatableNames', null, '(as)').then(names => names.includes(SOFTWARE_BUS_NAME)),
            ]).then(([owned, activatable]) => owned || activatable).catch(() => false);
        }
        return this._software;
    }

    // Looked up when someone first asks (a user action, never during enable): PATH lookups only
    _hasFlatpakCli() {
        if (this._flatpakCli === null)
            this._flatpakCli = GLib.find_program_in_path('flatpak') !== null;
        return this._flatpakCli;
    }

    // org.freedesktop.Application.ActivateAction('details', [(id, search)], {}): GNOME
    // Software's page for the app, with its own Uninstall button and confirmation
    async _softwareDetails(flatpakId) {
        await Gio.DBus.session.call(SOFTWARE_BUS_NAME, SOFTWARE_PATH, 'org.freedesktop.Application',
            'ActivateAction', new GLib.Variant('(sava{sv})', ['details',
                [new GLib.Variant('(ss)', [flatpakId, ''])], {}]),
            null, Gio.DBusCallFlags.NONE, SOFTWARE_TIMEOUT_MS, this._cancellable);
    }

    async _flatpakUninstall(decision) {
        const proc = Gio.Subprocess.new(flatpakArgv(decision),
            Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
        await proc.wait_async(this._cancellable);
        return flatpakOutcome(proc.get_if_exited() ? proc.get_exit_status() : -1);
    }
}
