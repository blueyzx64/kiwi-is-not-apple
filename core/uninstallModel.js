// SPDX-License-Identifier: GPL-3.0-or-later
// Who may remove an app, and how (overhaul plan §9 "Launchpad delete rules", research
// installer-and-app-lifecycle.md §4.3). macOS shows the ⓧ only on App Store apps; Kiwi shows it
// only where an owner can remove the app with its own confirmation:
//
//   1. apps the owner's installer manages (its ListManagedApps, OwnsDesktopId, or the
//      X-Installer-Managed=true key it writes)  -> Installer1.Uninstall (installer confirms)
//   2. Flatpak apps                               -> GNOME Software (it confirms), else the
//                                                    flatpak command after Kiwi's confirmation
//   3. anything else (RPMs not from the installer, system apps)  -> never
//
// Launchpad (P3) and the dock Trash ask core/uninstall.js, which feeds this model.
//
// Pure JS (no gi imports): runs under `gjs -m` in tests.

/** Path part that marks an exported Flatpak desktop file (user or system installation). */
const FLATPAK_EXPORTS = '/flatpak/exports/share/applications/';
/** The installer itself is never offered for removal through itself. */
const INSTALLER_DESKTOP_ID = 'io.github.blueyzx64.Installer.desktop';

/**
 * @typedef {object} AppFacts  what the adapter read about one app (plain values)
 * @property {string} desktopId e.g. 'org.gnome.Calculator.desktop'
 * @property {?string} path its desktop file
 * @property {?string} installerManagedKey the X-Installer-Managed value, or null
 * @property {?string} flatpakKey the X-Flatpak value (Flatpak exports carry it), or null
 * @property {?{appId: string, canUninstall: boolean}} managed the installer's record (from
 *   ListManagedApps or OwnsDesktopId), or null
 * @property {string} userDataDir XDG data home (tells a user Flatpak from a system one)
 */

/**
 * @typedef {object} Backends  what can act right now
 * @property {boolean} installer Installer1 is usable (running or activatable)
 * @property {boolean} software GNOME Software is on the bus or activatable
 * @property {boolean} flatpakCli the flatpak command exists
 */

/**
 * @typedef {object} Decision
 * @property {boolean} removable show the ⓧ (and accept a drop on the Trash)
 * @property {?string} backend 'installer' | 'software' | 'flatpak-cli' | null
 * @property {string} reason why (stable words, for tests and logs)
 * @property {string} target the installer app id or the Flatpak id ('' when not removable)
 * @property {?string} scope 'user' | 'system' (Flatpak only)
 * @property {?string} confirmBy who shows the confirmation: 'installer' | 'software' | 'kiwi'
 */

const no = reason => ({ removable: false, backend: null, reason, target: '', scope: null, confirmBy: null });

/** The Flatpak id and installation of an app, or null when it is not a Flatpak. */
export function flatpakOf({ desktopId, path, flatpakKey, userDataDir }) {
    const exported = typeof path === 'string' && path.includes(FLATPAK_EXPORTS);
    if (!exported && !flatpakKey)
        return null;
    const id = flatpakKey || desktopId.replace(/\.desktop$/, '');
    if (!/^[A-Za-z_][\w-]*(\.[A-Za-z_][\w-]*)+$/.test(id))
        return null;
    const userPrefix = `${String(userDataDir).replace(/\/$/, '')}/flatpak/`;
    const scope = typeof path === 'string' && path.startsWith(userPrefix) ? 'user' : 'system';
    return { id, scope };
}

/** True when the installer says (or its desktop key says) it manages this app. */
export function isInstallerManaged(facts) {
    return !!facts.managed || facts.installerManagedKey === 'true';
}

/**
 * @param {AppFacts} facts
 * @param {Backends} backends
 * @returns {Decision}
 */
export function decide(facts, backends) {
    if (!facts?.desktopId)
        return no('unknown-app');
    if (facts.desktopId === INSTALLER_DESKTOP_ID)
        return no('protected');

    if (isInstallerManaged(facts)) {
        if (!backends.installer)
            return no('installer-unavailable');
        if (!facts.managed)
            return no('installer-unknown-app');   // the key says so, the ledger does not
        if (!facts.managed.canUninstall)
            return no('installer-refuses');
        return {
            removable: true, backend: 'installer', reason: 'installer-owned',
            target: facts.managed.appId, scope: null, confirmBy: 'installer',
        };
    }

    const flatpak = flatpakOf(facts);
    if (flatpak) {
        if (backends.software)
            return { removable: true, backend: 'software', reason: 'flatpak', target: flatpak.id, scope: flatpak.scope, confirmBy: 'software' };
        if (backends.flatpakCli)
            return { removable: true, backend: 'flatpak-cli', reason: 'flatpak', target: flatpak.id, scope: flatpak.scope, confirmBy: 'kiwi' };
        return no('no-flatpak-backend');
    }

    // RPMs and every other system app: macOS shows no ⓧ for apps outside the App Store
    return no('system-package');
}

/** The flatpak command line for a confirmed removal (argv, no shell). */
export function flatpakArgv({ target, scope }) {
    return ['flatpak', 'uninstall', '--noninteractive', scope === 'user' ? '--user' : '--system', target];
}

/** What a finished flatpak command means. */
export function flatpakOutcome(exitStatus) {
    return exitStatus === 0 ? { kind: 'removed', code: '' } : { kind: 'failed', code: `exit-${exitStatus}` };
}

/**
 * The text of Kiwi's own confirmation (only for the flatpak command; the installer and GNOME
 * Software confirm themselves). Same words as macOS Launchpad.
 *
 * @param {string} name the app's name
 * @param {Function} _ gettext
 */
export function confirmText(name, _) {
    return {
        title: _('Delete “%s”?').replace('%s', name),
        body: _('This app will be deleted immediately. You can’t undo this action.'),
        accept: _('Delete'),
        cancel: _('Cancel'),
    };
}
