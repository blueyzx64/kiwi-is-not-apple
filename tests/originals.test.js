// Run: gjs -m tests/originals.test.js
// core/originals.js: the user's own value of every GNOME key Kiwi takes over, crash-safe.
import { OriginalsStore, SettingOwner, STORE_KEY, originalId, parseOriginalId, restoreStale } from '../core/originals.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
// A Gio.Settings stand-in with typed getters/setters and changed:: signals
function fake(schemaId, values) {
    const handlers = new Map();
    let next = 1;
    const emit = k => [...handlers.values()].filter(h => h.sig === `changed::${k}`).forEach(h => h.fn());
    const set = (k, v) => { values[k] = v; emit(k); };
    return {
        schema_id: schemaId, values,
        get_string: k => values[k] ?? '', set_string: set,
        get_boolean: k => !!values[k], set_boolean: set,
        get_int: k => values[k] ?? 0, set_int: set,
        get_strv: k => values[k] ?? [], set_strv: set,
        connect(sig, fn) { handlers.set(next, { sig, fn }); return next++; },
        disconnect: id => handlers.delete(id),
        get nHandlers() { return handlers.size; },
    };
}
const kiwi = () => fake('org.gnome.shell.extensions.kiwi', { [STORE_KEY]: '' });

test('ids round trip', () => {
    eq(parseOriginalId(originalId('org.gnome.mutter', 'edge-tiling')), { schemaId: 'org.gnome.mutter', key: 'edge-tiling' });
    eq(parseOriginalId('nonsense'), null);
});
test('take saves the original first, release writes it back and forgets it', () => {
    const k = kiwi();
    const mutter = fake('org.gnome.mutter', { 'edge-tiling': true });
    const store = new OriginalsStore(k);
    const owner = new SettingOwner(store, mutter, 'edge-tiling', { type: 'b', value: false });
    owner.sync(true);
    eq(mutter.values['edge-tiling'], false);
    eq(store.get('org.gnome.mutter::edge-tiling'), { type: 'b', value: true });
    owner.sync(false);
    eq(mutter.values['edge-tiling'], true);
    eq(k.values[STORE_KEY], '', 'an empty store is an empty key');
    eq(mutter.nHandlers, 0);
});
test('a user change while owned becomes the new original', () => {
    const store = new OriginalsStore(kiwi());
    const wm = fake('org.gnome.desktop.wm.preferences', { 'num-workspaces': 4 });
    let told = 0;
    const owner = new SettingOwner(store, wm, 'num-workspaces', { type: 'i', transform: n => n + 1, onOriginalChanged: () => told++ });
    owner.sync(true);
    eq(wm.values['num-workspaces'], 5);
    wm.set_int('num-workspaces', 9);
    eq(wm.values['num-workspaces'], 10, "Kiwi's value applied to the new original");
    eq(owner.original, 9);
    eq(told, 1);
    owner.release();
    eq(wm.values['num-workspaces'], 9);
});
test('two owners of different keys keep each other\'s entries', () => {
    const store = new OriginalsStore(kiwi());
    const a = fake('s.a', { k: 'one' });
    const b = fake('s.b', { k: ['x'] });
    const oa = new SettingOwner(store, a, 'k', { type: 's', value: 'kiwi' });
    const ob = new SettingOwner(store, b, 'k', { type: 'as', value: [] });
    oa.sync(true);
    ob.sync(true);
    eq(store.ids().sort(), ['s.a::k', 's.b::k']);
    oa.release();
    eq(store.ids(), ['s.b::k']);
    ob.release();
    eq(b.values.k, ['x']);
});
test('crash: a stored value is restored at the next start, never overwritten by Kiwi\'s', () => {
    const k = kiwi();
    const wm = fake('org.gnome.desktop.wm.preferences', { 'button-layout': 'appmenu:close' });
    new SettingOwner(new OriginalsStore(k), wm, 'button-layout', { type: 's', value: 'appmenu:' }).sync(true);
    // The session dies here: no release. A new owner (next session) must keep the real value
    const again = new SettingOwner(new OriginalsStore(k), wm, 'button-layout', { type: 's', value: 'appmenu:' });
    again.sync(true);
    eq(again.original, 'appmenu:close');
});
test('crash: the next start restores a stored value before any feature runs', () => {
    const k = kiwi();
    const wm = fake('org.gnome.desktop.wm.preferences', { 'button-layout': 'appmenu:close' });
    // A session that took the key and died without releasing it (its handler died with it)
    const store = new OriginalsStore(k);
    store.set('org.gnome.desktop.wm.preferences::button-layout', 's', 'appmenu:close');
    wm.values['button-layout'] = 'appmenu:';
    const restored = restoreStale(new OriginalsStore(k), id => (id === wm.schema_id ? wm : null));
    eq(restored, ['org.gnome.desktop.wm.preferences::button-layout']);
    eq(wm.values['button-layout'], 'appmenu:close');
    eq(new OriginalsStore(k).ids(), []);
});
test('restoreStale drops entries for schemas that are gone, and damaged JSON', () => {
    const k = fake('kiwi', { [STORE_KEY]: JSON.stringify({ 'gone.schema::x': { type: 's', value: 'v' } }) });
    eq(restoreStale(new OriginalsStore(k), () => null), []);
    eq(k.values[STORE_KEY], '');
    const bad = fake('kiwi', { [STORE_KEY]: '{oops' });
    eq(new OriginalsStore(bad).ids(), []);
});
test('unsupported types are refused', () => {
    let threw = false;
    try { new SettingOwner(new OriginalsStore(kiwi()), fake('s', {}), 'k', { type: 'a{sv}' }); } catch (_e) { threw = true; }
    eq(threw, true);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
