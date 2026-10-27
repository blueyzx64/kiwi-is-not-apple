// SPDX-License-Identifier: GPL-3.0-or-later
// A mock of the owner's installer API (docs/architecture/installer-dbus-contract.md), for the
// real-Shell harness and for the installer repo as a reference: it owns
// io.github.blueyzx64.Installer on the session bus and implements Installer1 with a two-app
// ledger. Open(path) runs a fake install: Progress 0 -> 100 % in ten steps, mirrored into
// com.canonical.Unity.LauncherEntry for the installer's desktop id, then AppsChanged.
// Uninstall(id) answers UninstallFinished: 'removed', or 'cancelled' for the id 'cancel-me'.
//
// Run: gjs -m tools/smoke/mock-installer.js <path to core/installerModel.js> [step ms]

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const [modelPath, stepArg] = globalThis.ARGV;
const { INSTALLER1_XML, INSTALLER_BUS_NAME, INSTALLER_DESKTOP_ID, INSTALLER_INTERFACE, INSTALLER_OBJECT_PATH } =
    await import(`file://${modelPath}`);
const STEP_MS = Number(stepArg) || 400;

const ledger = [
    ['lumen-notes', 'lumen-notes.desktop', 'appImage', true],
    ['cancel-me', 'cancel-me.desktop', 'appImage', true],
    ['tool', 'tool.desktop', 'systemPackage', true],
];
const log = msg => print(`[mock-installer] ${msg}`);
const loop = new GLib.MainLoop(null, false);
let exported = null;
let op = 0;

function launcherEntry(props) {
    exported.get_connection().emit_signal(null, '/io/github/blueyzx64/Installer/LauncherEntry',
        'com.canonical.Unity.LauncherEntry', 'Update',
        new GLib.Variant('(sa{sv})', [`application://${INSTALLER_DESKTOP_ID}`, props]));
}

function progress(id, title, phase, percent) {
    exported.emit_signal('Progress', new GLib.Variant('(sssi)', [id, title, phase, percent]));
}

function fakeInstall(path) {
    const id = `op-${++op}`;
    const title = GLib.path_get_basename(path).replace(/\.[^.]*$/, '');
    let step = 0;
    progress(id, title, 'authorizing', -1);
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, STEP_MS, () => {
        step++;
        const percent = step * 10;
        if (percent < 100) {
            progress(id, title, 'installing', percent);
            launcherEntry({ 'progress': new GLib.Variant('d', percent / 100), 'progress-visible': new GLib.Variant('b', true) });
            return GLib.SOURCE_CONTINUE;
        }
        progress(id, title, 'done', 100);
        launcherEntry({ 'progress-visible': new GLib.Variant('b', false) });
        ledger.push([title.toLowerCase(), `${title.toLowerCase()}.desktop`, 'appImage', true]);
        exported.emit_signal('AppsChanged', null);
        log(`installed ${title}`);
        return GLib.SOURCE_REMOVE;
    });
}

const impl = {
    Open(path, _parent) {
        log(`Open ${path}`);
        fakeInstall(path);
    },
    ListManagedApps() {
        return new GLib.Variant('(a(sssb))', [ledger]);
    },
    OwnsDesktopId(desktopId) {
        const row = ledger.find(r => r[1] === desktopId);
        return new GLib.Variant('(bs)', [!!row, row?.[0] ?? '']);
    },
    Uninstall(appId, _parent) {
        log(`Uninstall ${appId}`);
        const i = ledger.findIndex(r => r[0] === appId);
        if (i < 0)
            throw new GLib.Error(Gio.DBusError, Gio.DBusError.INVALID_ARGS, `NotManaged: ${appId}`);
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
            const outcome = appId === 'cancel-me' ? 'cancelled' : 'removed';
            if (outcome === 'removed') {
                ledger.splice(ledger.findIndex(r => r[0] === appId), 1);
                exported.emit_signal('AppsChanged', null);
            }
            exported.emit_signal('UninstallFinished', new GLib.Variant('(ss)', [appId, outcome]));
            return GLib.SOURCE_REMOVE;
        });
    },
    get Version() {
        return 1;
    },
};

exported = Gio.DBusExportedObject.wrapJSObject(INSTALLER1_XML, impl);
Gio.bus_own_name(Gio.BusType.SESSION, INSTALLER_BUS_NAME, Gio.BusNameOwnerFlags.NONE,
    conn => {
        exported.export(conn, INSTALLER_OBJECT_PATH);
        log(`exported ${INSTALLER_INTERFACE}`);
    }, null, () => {
        log('lost the name');
        loop.quit();
    });
loop.run();
