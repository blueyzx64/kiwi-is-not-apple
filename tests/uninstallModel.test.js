// Run: gjs -m tests/uninstallModel.test.js
import { confirmText, decide, flatpakArgv, flatpakOf, flatpakOutcome } from '../core/uninstallModel.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const HOME = '/home/u/.local/share';
const ALL = { installer: true, software: true, flatpakCli: true };
const NONE = { installer: false, software: false, flatpakCli: false };
const app = fields => ({
    desktopId: 'x.desktop', path: '/usr/share/applications/x.desktop', installerManagedKey: null,
    flatpakKey: null, managed: null, userDataDir: HOME, ...fields,
});
const lumen = app({
    desktopId: 'lumen.desktop', path: `${HOME}/applications/lumen.desktop`,
    installerManagedKey: 'true', managed: { appId: 'lumen', canUninstall: true },
});
const calc = app({
    desktopId: 'org.gnome.Calculator.desktop',
    path: '/var/lib/flatpak/exports/share/applications/org.gnome.Calculator.desktop',
    flatpakKey: 'org.gnome.Calculator',
});
const userFlatpak = app({
    desktopId: 'com.example.Tool.desktop',
    path: `${HOME}/flatpak/exports/share/applications/com.example.Tool.desktop`,
});

test('installer-owned apps go to Installer1, which confirms', () => {
    eq(decide(lumen, ALL), {
        removable: true, backend: 'installer', reason: 'installer-owned', target: 'lumen', scope: null, confirmBy: 'installer',
    });
});
test('an RPM the installer manages (ledger only, no key) is still the installer\'s', () => {
    const rpm = app({ desktopId: 'tool.desktop', managed: { appId: 'tool', canUninstall: true } });
    eq(decide(rpm, ALL).backend, 'installer');
});
test('installer apps without a usable installer, or refused, get no ⓧ', () => {
    eq(decide(lumen, { ...ALL, installer: false }).reason, 'installer-unavailable');
    eq(decide({ ...lumen, managed: { appId: 'lumen', canUninstall: false } }, ALL).reason, 'installer-refuses');
    eq(decide({ ...lumen, managed: null }, ALL).reason, 'installer-unknown-app');
    // never falls through to another backend
    eq(decide({ ...lumen, flatpakKey: 'a.b.C' }, { ...ALL, installer: false }).removable, false);
});
test('Flatpaks: GNOME Software first, then the flatpak command (Kiwi confirms)', () => {
    eq(decide(calc, ALL), {
        removable: true, backend: 'software', reason: 'flatpak', target: 'org.gnome.Calculator', scope: 'system', confirmBy: 'software',
    });
    const cli = decide(calc, { ...ALL, software: false });
    eq([cli.backend, cli.confirmBy], ['flatpak-cli', 'kiwi']);
    eq(decide(calc, NONE).reason, 'no-flatpak-backend');
});
test('Flatpak id and installation come from the export path', () => {
    eq(flatpakOf(userFlatpak), { id: 'com.example.Tool', scope: 'user' });
    eq(flatpakOf(calc), { id: 'org.gnome.Calculator', scope: 'system' });
    eq(flatpakOf(app({})), null);
    eq(flatpakOf(app({ flatpakKey: 'bad id; rm -rf' })), null);
});
test('RPMs and system apps: never', () => {
    eq(decide(app({ desktopId: 'org.gnome.Nautilus.desktop' }), ALL), {
        removable: false, backend: null, reason: 'system-package', target: '', scope: null, confirmBy: null,
    });
    eq(decide(app({ desktopId: 'firefox.desktop', installerManagedKey: 'false' }), ALL).reason, 'system-package');
});
test('the installer itself and unknown apps are protected', () => {
    eq(decide(app({ desktopId: 'io.github.blueyzx64.Installer.desktop', managed: { appId: 'i', canUninstall: true } }), ALL).reason, 'protected');
    eq(decide(null, ALL).reason, 'unknown-app');
    eq(decide(app({ desktopId: '' }), ALL).reason, 'unknown-app');
});
test('flatpak argv and outcomes', () => {
    eq(flatpakArgv({ target: 'com.example.Tool', scope: 'user' }), ['flatpak', 'uninstall', '--noninteractive', '--user', 'com.example.Tool']);
    eq(flatpakArgv({ target: 'org.gnome.Calculator', scope: 'system' })[3], '--system');
    eq(flatpakOutcome(0), { kind: 'removed', code: '' });
    eq(flatpakOutcome(1), { kind: 'failed', code: 'exit-1' });
});
test('Kiwi\'s confirmation reads like macOS Launchpad', () => {
    const t = confirmText('Tool', s => s);
    eq([t.title, t.accept], ['Delete “Tool”?', 'Delete']);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
