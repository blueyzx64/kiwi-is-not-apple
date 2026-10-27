// Run: gjs -m tests/installerModel.test.js
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {
    INSTALLER1_XML, ProgressBook, availability, isSupportedVersion, isUsable, parseApps, parseOutcome,
    parseProgress,
} from '../core/installerModel.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const root = GLib.build_filenamev([GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]), '..']);
const read = rel => new TextDecoder().decode(Gio.File.new_for_path(`${root}/${rel}`).load_contents(null)[1]);

test('the contract page embeds exactly INSTALLER1_XML', () => {
    const doc = read('docs/architecture/installer-dbus-contract.md');
    const m = doc.match(/```xml\n([\s\S]*?)\n```/);
    eq(m?.[1], INSTALLER1_XML);
});
test('the XML is valid D-Bus introspection with the v1 members', () => {
    const info = Gio.DBusNodeInfo.new_for_xml(INSTALLER1_XML).lookup_interface('io.github.blueyzx64.Installer1');
    eq(info.methods.map(m => m.name).sort(), ['ListManagedApps', 'Open', 'OwnsDesktopId', 'Uninstall']);
    eq(info.signals.map(s => s.name).sort(), ['AppsChanged', 'Progress', 'UninstallFinished']);
    eq(info.properties.map(p => [p.name, p.signature]), [['Version', 'u']]);
    // No way to skip the installer's confirmation: Uninstall takes the id and a parent only
    eq(info.lookup_method('Uninstall').in_args.map(a => a.signature), ['s', 's']);
});
test('parseApps keeps good rows, maps unknown sources, drops broken ones', () => {
    eq(parseApps([
        ['lumen', 'lumen.desktop', 'appImage', true],
        ['tool', '', 'systemPackage', false],
        ['x', 'x.desktop', 'snap', 1],
        ['', 'y.desktop', 'appImage', true],
        ['short'],
        'nope',
    ]), [
        { appId: 'lumen', desktopId: 'lumen.desktop', source: 'appImage', canUninstall: true },
        { appId: 'tool', desktopId: '', source: 'systemPackage', canUninstall: false },
        { appId: 'x', desktopId: 'x.desktop', source: 'other', canUninstall: false },
    ]);
    eq(parseApps(null), []);
});
test('parseOutcome never reads a wrong word as success', () => {
    eq(parseOutcome('removed'), { kind: 'removed', code: '' });
    eq(parseOutcome('cancelled'), { kind: 'cancelled', code: '' });
    eq(parseOutcome('failed:in-use'), { kind: 'failed', code: 'in-use' });
    eq(parseOutcome('failed:'), { kind: 'failed', code: 'unknown' });
    eq(parseOutcome('Removed'), { kind: 'failed', code: 'unknown' });
    eq(parseOutcome(undefined), { kind: 'failed', code: 'unknown' });
});
test('parseProgress: -1 is indeterminate, clamps, unknown phases stay busy', () => {
    eq(parseProgress('op', 'Lumen', 'installing', 40), { operationId: 'op', title: 'Lumen', phase: 'installing', percent: 40 });
    eq(parseProgress('op', 'Lumen', 'authorizing', -1).percent, null);
    eq(parseProgress('op', 'Lumen', 'installing', 140).percent, 100);
    eq(parseProgress('op', 'Lumen', 'downloading', 5).phase, 'installing');
    eq(parseProgress('op', 'Lumen', 'done', 3).percent, 100);
    eq(parseProgress('', 'x', 'installing', 1), null);
});
test('availability and version', () => {
    eq(availability({ owned: true, activatable: false }), 'running');
    eq(availability({ owned: true, activatable: true, version: 0 }), 'incompatible');
    eq(availability({ owned: true, activatable: true, version: 3 }), 'running');
    eq(availability({ owned: false, activatable: true }), 'activatable');
    eq(availability({ owned: false, activatable: false }), 'absent');
    eq([isUsable('running'), isUsable('activatable'), isUsable('incompatible'), isUsable('absent')], [true, true, false, false]);
    eq([isSupportedVersion(1), isSupportedVersion(2), isSupportedVersion(0), isSupportedVersion(1.5)], [true, true, false, false]);
});
test('ProgressBook: mean of determinate ops, ends drop, no-op updates report no change', () => {
    const book = new ProgressBook();
    eq(book.fraction, null);
    eq(book.apply(parseProgress('a', 'A', 'authorizing', -1)), true);
    eq([book.busy, book.fraction], [true, null]);
    eq(book.apply(parseProgress('b', 'B', 'installing', 40)), true);
    eq(book.apply(parseProgress('b', 'B', 'installing', 40)), false);
    eq(book.fraction, 0.4);
    book.apply(parseProgress('a', 'A', 'installing', 80));
    eq(book.fraction, 0.6);
    eq(book.summary, { title: 'A', phase: 'installing', percent: 80, count: 2 });
    eq(book.apply(parseProgress('a', 'A', 'done', 100)), true);
    eq(book.apply(parseProgress('b', 'B', 'failed', -1)), true);
    eq(book.apply(parseProgress('b', 'B', 'failed', -1)), false);
    eq([book.busy, book.fraction, book.summary], [false, null, null]);
    eq(book.apply(null), false);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
