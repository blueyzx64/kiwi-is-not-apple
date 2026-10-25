// Run: gjs -m tests/settings.test.js
import { KiwiSettings, runMigrations } from '../lib/settings.js';
import { CleanupRegistry } from '../lib/disposables.js';

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

// Minimal Gio.Settings stand-in. types: key -> type string; user: key -> value (user-set).
function fakeSettings(types, user = {}, defaults = {}) {
    const handlers = new Map();
    let nextId = 1;
    const gs = {
        user: { ...user },
        settings_schema: { has_key: k => k in types },
        get_user_value: k => (k in gs.user ? { v: gs.user[k] } : null),
        get_value: k => ({ get_type_string: () => types[k] }),
        _get: k => (k in gs.user ? gs.user[k] : defaults[k]),
        connect(sig, fn) { const id = nextId++; handlers.set(id, fn); return id; },
        disconnect(id) { handlers.delete(id); },
        emit(key) { for (const fn of handlers.values()) fn(gs, key); },
        handlerCount: () => handlers.size,
    };
    for (const name of ['boolean', 'int', 'double', 'string', 'uint']) {
        gs[`get_${name}`] = k => gs._get(k);
        gs[`set_${name}`] = (k, v) => { gs.user[k] = v; };
    }
    gs.get_strv = k => gs._get(k);
    gs.set_strv = (k, v) => { gs.user[k] = v; };
    return gs;
}

test('typed getters pass through', () => {
    const gs = fakeSettings({ a: 'b' }, { a: true });
    const s = new KiwiSettings(gs);
    eq(s.bool('a'), true);
    eq(s.has('a'), true);
    eq(s.has('zzz'), false);
});

test('watch dispatches only to the changed key and wildcard', () => {
    const gs = fakeSettings({});
    const s = new KiwiSettings(gs);
    const reg = new CleanupRegistry();
    s.attach(reg);
    const seen = [];
    s.watch('x', k => seen.push(`x:${k}`));
    s.watch(['y', 'z'], k => seen.push(`yz:${k}`));
    s.watch('*', k => seen.push(`*:${k}`));
    gs.emit('y');
    gs.emit('q');
    eq(seen, ['yz:y', '*:y', '*:q']);
});

test('unwatch stops callbacks; dispose disconnects once', () => {
    const gs = fakeSettings({});
    const s = new KiwiSettings(gs);
    const reg = new CleanupRegistry();
    s.attach(reg);
    s.attach(reg);
    eq(gs.handlerCount(), 1);
    let n = 0;
    const off = s.watch('x', () => n++);
    gs.emit('x');
    off();
    gs.emit('x');
    eq(n, 1);
    reg.dispose();
    eq(gs.handlerCount(), 0);
});

test('a throwing watcher does not block the others', () => {
    const gs = fakeSettings({});
    const s = new KiwiSettings(gs);
    s.attach(new CleanupRegistry());
    let ok = false;
    s.watch('x', () => { throw new Error('boom'); });
    s.watch('x', () => { ok = true; });
    gs.emit('x');
    eq(ok, true);
});

test('migration copies user value, leaves old key, is idempotent', () => {
    const gs = fakeSettings({ old: 'b', new: 'b' }, { old: true });
    eq(runMigrations(gs, [{ from: 'old', to: 'new' }]), ['new']);
    eq(gs.user, { old: true, new: true });
    eq(runMigrations(gs, [{ from: 'old', to: 'new' }]), []);
});

test('migration skips when old key never set or new key already set', () => {
    const a = fakeSettings({ old: 'b', new: 'b' });
    eq(runMigrations(a, [{ from: 'old', to: 'new' }]), []);
    const b = fakeSettings({ old: 'b', new: 'b' }, { old: true, new: false });
    eq(runMigrations(b, [{ from: 'old', to: 'new' }]), []);
    eq(b.user.new, false);
});

test('migration with map converts type (bool -> string)', () => {
    const gs = fakeSettings({ old: 'b', new: 's' }, { old: true });
    runMigrations(gs, [{ from: 'old', to: 'new', map: v => (v ? 'fullscreen' : 'always') }]);
    eq(gs.user.new, 'fullscreen');
});

test('migration skips keys missing from the schema', () => {
    const gs = fakeSettings({ old: 'b' }, { old: true });
    eq(runMigrations(gs, [{ from: 'old', to: 'gone' }]), []);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
