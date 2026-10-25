// Run: gjs -m tests/migrations.test.js
// Runs every Kiwi migration against the real schema, in a memory settings backend.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { ALL_MIGRATIONS, runAllMigrations } from '../lib/migrations.js';
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

test('panel-hover-fullscreen=false lands in panel-autohide before features start', () => {
    const gs = fresh();
    gs.set_boolean('panel-hover-fullscreen', false);
    runAllMigrations(gs);
    eq(gs.get_boolean('panel-autohide'), false);
    eq(userSet(gs, 'panel-autohide'), true);
});

test('panel-hover-fullscreen=true keeps the fullscreen-only behaviour', () => {
    const gs = fresh();
    gs.set_boolean('panel-hover-fullscreen', true);
    runAllMigrations(gs);
    eq(gs.get_boolean('panel-autohide'), true);
    eq(gs.get_boolean('panel-autohide-fullscreen-only'), true);
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
    gs.set_boolean('panel-hover-fullscreen', false);
    runAllMigrations(gs);
    gs.reset('panel-autohide');
    eq(runAllMigrations(gs), []);
    eq(userSet(gs, 'panel-autohide'), false);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
