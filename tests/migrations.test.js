// Run: gjs -m tests/migrations.test.js
// Runs every Kiwi migration against the real schema, in a memory settings backend.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { ALL_MIGRATIONS, restoreLegacyButtonLayout, runAllMigrations } from '../lib/migrations.js';
import { migrationId } from '../lib/settings.js';

let failed = 0;
function test(name, fn) {
    try {
        fn();
        print(`ok   ${name}`);
    } catch (e) {
        failed++;
        print(`FAIL ${name}: ${e.message}`);
    }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const schemaSrc = GLib.build_filenamev([here, '..', 'schemas']);
const dir = GLib.dir_make_tmp('kiwi-migr-XXXXXX');
const [ok, , err] = GLib.spawn_command_line_sync(
    `glib-compile-schemas --targetdir=${GLib.shell_quote(dir)} ${GLib.shell_quote(schemaSrc)}`);
if (!ok)
    throw new Error(`glib-compile-schemas failed: ${err}`);
const source = Gio.SettingsSchemaSource.new_from_directory(dir, null, false);
const schema = source.lookup('org.gnome.shell.extensions.kiwi', false);

function fresh() {
    return new Gio.Settings({ settings_schema: schema, backend: Gio.memory_settings_backend_new() });
}
const userSet = (gs, k) => gs.get_user_value(k) !== null;

test('every migration names keys that exist; ids are unique', () => {
    const ids = ALL_MIGRATIONS.map(migrationId);
    eq(new Set(ids).size, ids.length, 'duplicate ids');
    for (const m of ALL_MIGRATIONS) {
        if (!schema.has_key(m.from) || !schema.has_key(m.to))
            throw new Error(`missing key in ${migrationId(m)}`);
    }
    if (!schema.has_key('migrations-done'))
        throw new Error('migrations-done missing');
});

test('fresh profile: nothing copied, all ids recorded', () => {
    const gs = fresh();
    eq(runAllMigrations(gs), []);
    eq(gs.get_strv('migrations-done').length, ALL_MIGRATIONS.length);
});

test('auto-hide was removed: its old keys no longer migrate anywhere', () => {
    const gs = fresh();
    gs.set_boolean('panel-hover-fullscreen', true);
    eq(runAllMigrations(gs), []);
    eq(userSet(gs, 'panel-autohide'), false);
    eq(ALL_MIGRATIONS.some(m => m.to.startsWith('panel-autohide')), false);
});

test('glass: panel-blur off, dock-blur on -> surfaces from both, written once', () => {
    const gs = fresh();
    gs.set_boolean('panel-blur', false);
    gs.set_boolean('dock-blur', true);
    const written = runAllMigrations(gs);
    eq(written.filter(k => k === 'liquid-glass-surfaces').length, 1);
    const surfaces = gs.get_strv('liquid-glass-surfaces');
    eq(surfaces.includes('dock'), true);
    eq(surfaces.includes('panel'), false);
});

test('glass: the old style and tint become the Clear <-> Tinted slider', () => {
    const clear = fresh();
    clear.set_string('liquid-glass-style', 'clear');
    runAllMigrations(clear);
    eq(clear.get_int('glass-tint'), 0);
    eq(userSet(clear, 'glass-tint'), true);

    const tinted = fresh();
    tinted.set_int('liquid-glass-tint', 80);
    eq(runAllMigrations(tinted).filter(k => k === 'glass-tint').length, 1);
    eq(tinted.get_int('glass-tint'), 80);

    const untouched = fresh();
    runAllMigrations(untouched);
    eq(userSet(untouched, 'glass-tint'), false);
});

test('window controls and control center keys migrate', () => {
    const gs = fresh();
    gs.set_boolean('show-window-controls-fullscreen-only', true);
    gs.set_boolean('add-username-to-quick-menu', false);
    runAllMigrations(gs);
    eq(gs.get_string('window-controls-scope'), 'fullscreen');
    eq(gs.get_boolean('control-center-user-row'), false);
});

test('second run is a no-op even after the user resets a new key', () => {
    const gs = fresh();
    gs.set_boolean('add-username-to-quick-menu', false);
    runAllMigrations(gs);
    gs.reset('control-center-user-row');
    eq(runAllMigrations(gs), []);
    eq(userSet(gs, 'control-center-user-row'), false);
});

test('v3: hide-activities-button becomes menubar-show-activities, the other way round', () => {
    const gs = fresh();
    gs.set_boolean('hide-activities-button', false);
    runAllMigrations(gs);
    eq(gs.get_boolean('menubar-show-activities'), true);
    const gs2 = fresh();
    eq(gs2.get_boolean('menubar-show-activities'), false, 'macOS default: no Activities button');
});

test('v3 defaults follow macOS (overhaul plan §12)', () => {
    const gs = fresh();
    eq(gs.get_boolean('stage-manager'), false);
    eq(gs.get_string('app-buttons-style'), 'macos');
    eq(gs.get_boolean('move-window-to-new-workspace'), true);
    // the owner's explicit choices stay
    eq(gs.get_boolean('show-window-controls'), true);
    eq(gs.get_boolean('spotlight-on-super'), true);
    eq(gs.get_boolean('overview-gestures-workspace-only'), true);
    eq(gs.get_boolean('disable-hot-corner'), true);
    eq(gs.get_string('rounded-corners-which'), 'top');
});

test('a 2.x saved button layout is written back once', () => {
    const gs = fresh();
    gs.set_string('saved-button-layout', 'appmenu:close');
    const values = { 'button-layout': 'appmenu:' };
    const wm = { get_string: k => values[k], set_string: (k, v) => (values[k] = v) };
    eq(restoreLegacyButtonLayout(gs, wm), true);
    eq(values['button-layout'], 'appmenu:close');
    eq(gs.get_string('saved-button-layout'), '');
    eq(restoreLegacyButtonLayout(gs, wm), false);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
