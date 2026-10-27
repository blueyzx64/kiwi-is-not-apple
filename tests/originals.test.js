// Run: gjs -m tests/originals.test.js
// core/originals.js: the user's own value of every GNOME key Kiwi takes over, crash-safe.
import { ListMembersOwner, OriginalsStore, SettingOwner, STORE_KEY, originalId, parseOriginalId, restoreStale, withMembers } from '../core/originals.js';

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
        get_uint: k => values[k] ?? 0, set_uint: set,
        get_double: k => values[k] ?? 0, set_double: set,
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
test('yieldToUser: a user change while owned stands, and Kiwi lets go', () => {
    const k = kiwi();
    const iface = fake('org.gnome.desktop.interface', { 'color-scheme': 'default' });
    const store = new OriginalsStore(k);
    let told = 0;
    const owner = new SettingOwner(store, iface, 'color-scheme', {
        type: 's', value: 'prefer-dark', yieldToUser: true, onOriginalChanged: () => told++,
    });
    owner.sync(true);
    eq(iface.values['color-scheme'], 'prefer-dark');
    iface.set_string('color-scheme', 'prefer-light');
    eq(iface.values['color-scheme'], 'prefer-light');
    eq([owner.owning, told, store.ids(), iface.nHandlers], [false, 1, [], 0]);
    owner.release();
    eq(iface.values['color-scheme'], 'prefer-light', 'release after yielding writes nothing');
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

// ListMembersOwner: Dash to Dock out of enabled-extensions while Kiwi's dock runs
const DTD = 'dash-to-dock@micxgx.gmail.com';
const shell = list => fake('org.gnome.shell', { 'enabled-extensions': list });
test('withMembers appends only what is missing', () => {
    eq(withMembers(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
    eq(withMembers([], []), []);
});
test('members: take removes only the member, release adds it back to the list as it is then', () => {
    const k = kiwi();
    const gs = shell(['kiwi@kemma', DTD, 'other@x']);
    const owner = new ListMembersOwner(new OriginalsStore(k), gs, 'enabled-extensions', [DTD]);
    owner.sync(true);
    eq(gs.values['enabled-extensions'], ['kiwi@kemma', 'other@x']);
    eq(owner.held, [DTD]);
    // The user enables another extension meanwhile: kept on release
    gs.set_strv('enabled-extensions', ['kiwi@kemma', 'other@x', 'new@y']);
    owner.release();
    eq(gs.values['enabled-extensions'], ['kiwi@kemma', 'other@x', 'new@y', DTD]);
    eq(new OriginalsStore(k).ids(), []);
    eq(gs.nHandlers, 0);
});
test('members: Kiwi itself leaving the list (user disables Kiwi) keeps the member', () => {
    const k = kiwi();
    const gs = shell(['kiwi@kemma', DTD]);
    const owner = new ListMembersOwner(new OriginalsStore(k), gs, 'enabled-extensions', [DTD]);
    owner.sync(true);
    gs.set_strv('enabled-extensions', []);
    eq(owner.held, [DTD]);
    owner.sync(false);
    eq(gs.values['enabled-extensions'], [DTD]);
});
test('members: re-added by the user while held is taken out again and returns on release', () => {
    const k = kiwi();
    const gs = shell([DTD]);
    const owner = new ListMembersOwner(new OriginalsStore(k), gs, 'enabled-extensions', [DTD]);
    owner.sync(true);
    gs.set_strv('enabled-extensions', ['a', DTD]);
    eq(gs.values['enabled-extensions'], ['a']);
    owner.release();
    eq(gs.values['enabled-extensions'], ['a', DTD]);
});
test('members: absent member means no store entry and no write', () => {
    const k = kiwi();
    const gs = shell(['kiwi@kemma']);
    const owner = new ListMembersOwner(new OriginalsStore(k), gs, 'enabled-extensions', [DTD]);
    owner.sync(true);
    eq(k.values[STORE_KEY], '');
    owner.release();
    eq(gs.values['enabled-extensions'], ['kiwi@kemma']);
});
test('members: keepStored release (a Shell re-base) leaves the list and the entry for the next take', () => {
    const k = kiwi();
    const gs = shell(['kiwi@kemma', DTD]);
    const store = new OriginalsStore(k);
    const a = new ListMembersOwner(store, gs, 'enabled-extensions', [DTD]);
    a.sync(true);
    a.release({ keepStored: true });
    eq(gs.values['enabled-extensions'], ['kiwi@kemma']);
    const b = new ListMembersOwner(store, gs, 'enabled-extensions', [DTD]);
    b.sync(true);
    eq(b.held, [DTD]);
    b.release();
    eq(gs.values['enabled-extensions'], ['kiwi@kemma', DTD]);
});
test('members: a crash restores only the member, keeping the rest of the list', () => {
    const k = kiwi();
    // The dying session's settings object (and its handler) are gone; the next one is new
    new ListMembersOwner(new OriginalsStore(k), shell(['kiwi@kemma', DTD]), 'enabled-extensions', [DTD]).sync(true);
    const gs = shell(['kiwi@kemma', 'later@z']);   // edits went on after the crash
    const restored = restoreStale(new OriginalsStore(k), id => (id === gs.schema_id ? gs : null));
    eq(restored, ['org.gnome.shell::enabled-extensions']);
    eq(gs.values['enabled-extensions'], ['kiwi@kemma', 'later@z', DTD]);
});

// ---- hardening (H3): crash restore, user edits, double release, list edge cases, types ----
const writes = (gs, k) => { let n = 0; gs.connect(`changed::${k}`, () => n++); return () => n; };

test('double release: the second is a no-op and never overwrites the user\'s later edit', () => {
    const k = kiwi();
    const wm = fake('org.gnome.desktop.wm.preferences', { 'button-layout': 'close:' });
    const owner = new SettingOwner(new OriginalsStore(k), wm, 'button-layout', { type: 's', value: 'appmenu:' });
    owner.sync(true);
    owner.release();
    wm.set_string('button-layout', 'minimize:close');
    owner.release();
    owner.sync(false);
    eq(wm.values['button-layout'], 'minimize:close', 'user edit kept');
    eq(owner.owning, false);
    eq(wm.nHandlers, 0);
    eq(k.values[STORE_KEY], '');
});
test('double take: a second sync(true) does not save Kiwi\'s value as the original', () => {
    const k = kiwi();
    const wm = fake('org.gnome.desktop.wm.preferences', { 'num-workspaces': 4 });
    const store = new OriginalsStore(k);
    const owner = new SettingOwner(store, wm, 'num-workspaces', { type: 'i', value: 1 });
    owner.sync(true);
    owner.sync(true);
    eq(store.get('org.gnome.desktop.wm.preferences::num-workspaces'), { type: 'i', value: 4 });
    eq(wm.nHandlers, 1, 'one handler only');
    owner.release();
    eq(wm.values['num-workspaces'], 4);
});
test('user changing the key while owned: release gives back the user\'s value, not the one before', () => {
    const k = kiwi();
    const iface = fake('org.gnome.desktop.interface', { 'enable-hot-corners': true });
    const store = new OriginalsStore(k);
    const owner = new SettingOwner(store, iface, 'enable-hot-corners', { type: 'b', value: false });
    owner.sync(true);
    iface.set_boolean('enable-hot-corners', true);
    eq(iface.values['enable-hot-corners'], false, 'Kiwi keeps its value');
    eq(owner.original, true);
    owner.release();
    eq(iface.values['enable-hot-corners'], true);
});
test('user changes while owned, then a crash: the restore writes the user\'s latest value', () => {
    const k = kiwi();
    const wm = fake('org.gnome.desktop.wm.preferences', { 'button-layout': 'close:' });
    new SettingOwner(new OriginalsStore(k), wm, 'button-layout', { type: 's', value: 'appmenu:' }).sync(true);
    wm.set_string('button-layout', 'minimize,maximize:close');
    // session dies: no release. The next session has a new settings object, as in reality
    const next = fake(wm.schema_id, { 'button-layout': wm.values['button-layout'] });
    const restored = restoreStale(new OriginalsStore(k), id => (id === next.schema_id ? next : null));
    eq(restored, ['org.gnome.desktop.wm.preferences::button-layout']);
    eq(next.values['button-layout'], 'minimize,maximize:close');
    eq(next.nHandlers, 0);
});
test('yieldToUser then a crash: nothing stored, nothing restored', () => {
    const k = kiwi();
    const iface = fake('org.gnome.desktop.interface', { 'color-scheme': 'default' });
    const owner = new SettingOwner(new OriginalsStore(k), iface, 'color-scheme', { type: 's', value: 'prefer-dark', yieldToUser: true });
    owner.sync(true);
    iface.set_string('color-scheme', 'prefer-light');
    eq(restoreStale(new OriginalsStore(k), () => iface), []);
    eq(iface.values['color-scheme'], 'prefer-light');
});
test('crash with a stale value equal to the live one: restored, no write', () => {
    const k = fake('kiwi', { [STORE_KEY]: JSON.stringify({ 'org.s::n': { type: 'i', value: 7 } }) });
    const gs = fake('org.s', { n: 7 });
    const writesSeen = writes(gs, 'n');
    eq(restoreStale(new OriginalsStore(k), () => gs), ['org.s::n']);
    eq(writesSeen(), 0, 'no write when already equal');
    eq(gs.values.n, 7);
});
test('crash with a stale int, bool, string: each is written back with its own type', () => {
    const k = fake('kiwi', { [STORE_KEY]: JSON.stringify({
        'org.i::n': { type: 'i', value: -3 },
        'org.b::on': { type: 'b', value: false },
        'org.s::name': { type: 's', value: '' },
    }) });
    const gs = { 'org.i': fake('org.i', { n: 9 }), 'org.b': fake('org.b', { on: true }), 'org.s': fake('org.s', { name: 'x' }) };
    const restored = restoreStale(new OriginalsStore(k), schema => gs[schema] ?? null);
    eq(restored.sort(), ['org.b::on', 'org.i::n', 'org.s::name']);
    eq([gs['org.i'].values.n, gs['org.b'].values.on, gs['org.s'].values.name], [-3, false, '']);
    eq(k.values[STORE_KEY], '');
});
test('crash: an entry whose settings cannot be opened is dropped and does not stop the others', () => {
    const k = fake('kiwi', { [STORE_KEY]: JSON.stringify({
        'org.bad::x': { type: 's', value: 'a' },
        'org.ok::y': { type: 'b', value: true },
    }) });
    const ok_ = fake('org.ok', { y: false });
    const restored = restoreStale(new OriginalsStore(k), schema => {
        if (schema === 'org.bad') throw new Error('schema broken');
        return ok_;
    });
    eq(restored, ['org.ok::y']);
    eq(ok_.values.y, true);
    eq(k.values[STORE_KEY], '', 'both forgotten');
});
test('crash: an unsupported stored type is dropped, not written', () => {
    const k = fake('kiwi', { [STORE_KEY]: JSON.stringify({ 'org.x::k': { type: 'a{sv}', value: {} } }) });
    const gs = fake('org.x', { k: 'keep' });
    eq(restoreStale(new OriginalsStore(k), () => gs), []);
    eq(gs.values.k, 'keep');
    eq(k.values[STORE_KEY], '');
});
test('crash: a stored list-members entry with an empty value adds nothing', () => {
    const k = fake('kiwi', { [STORE_KEY]: JSON.stringify({ 'org.shell::enabled-extensions': { type: 'as', value: [], mode: 'members' } }) });
    const gs = fake('org.shell', { 'enabled-extensions': ['a'] });
    const seen = writes(gs, 'enabled-extensions');
    eq(restoreStale(new OriginalsStore(k), () => gs), ['org.shell::enabled-extensions']);
    eq(gs.values['enabled-extensions'], ['a']);
    eq(seen(), 0);
});

// Types: every supported GVariant type round-trips through take and release
test('types: string, bool, int, uint, double and strv round-trip through take and release', () => {
    const cases = [
        ['s', 'str', 'orig', 'kiwi'],
        ['b', 'bool', true, false],
        ['i', 'int', -5, 12],
        ['u', 'uint', 3, 0],
        ['d', 'dbl', 0.5, 2.25],
        ['as', 'list', ['x', 'y'], []],
    ];
    for (const [type, key, orig, kiwiValue] of cases) {
        const k = kiwi();
        const gs = fake('org.types', { [key]: orig });
        const owner = new SettingOwner(new OriginalsStore(k), gs, key, { type, value: kiwiValue });
        owner.sync(true);
        eq(gs.values[key], kiwiValue, `${type} taken`);
        owner.release();
        eq(gs.values[key], orig, `${type} given back`);
    }
});
test('types: an empty string original and an empty strv original are kept, not treated as missing', () => {
    const k = kiwi();
    const gs = fake('org.types', { s: '', as: [] });
    const store = new OriginalsStore(k);
    const a = new SettingOwner(store, gs, 's', { type: 's', value: 'on' });
    const b = new SettingOwner(store, gs, 'as', { type: 'as', value: ['k'] });
    a.sync(true);
    b.sync(true);
    eq(store.get('org.types::s'), { type: 's', value: '' });
    eq(store.get('org.types::as'), { type: 'as', value: [] });
    a.release();
    b.release();
    eq([gs.values.s, gs.values.as], ['', []]);
});
test('types: a strv transform returning a non-array is written as an empty list', () => {
    const k = kiwi();
    const gs = fake('org.types', { as: ['a'] });
    const owner = new SettingOwner(new OriginalsStore(k), gs, 'as', { type: 'as', transform: () => 'oops' });
    owner.sync(true);
    eq(gs.values.as, []);
    owner.release();
    eq(gs.values.as, ['a']);
});
test('types: a string transform gets the stored value, not the live one, after a crash', () => {
    const k = kiwi();
    const gs = fake('org.types', { s: 'live' });
    const store = new OriginalsStore(k);
    store.set('org.types::s', 's', 'stored');
    const owner = new SettingOwner(store, gs, 's', { type: 's', transform: v => `${v}+kiwi` });
    owner.sync(true);
    eq(gs.values.s, 'stored+kiwi');
    eq(owner.original, 'stored');
});

// ListMembersOwner: the user's own list edits while Kiwi holds a member
test('members: user removes other entries while held: release keeps that removal', () => {
    const k = kiwi();
    const gs = shell(['kiwi@kemma', DTD, 'a', 'b']);
    const owner = new ListMembersOwner(new OriginalsStore(k), gs, 'enabled-extensions', [DTD]);
    owner.sync(true);
    gs.set_strv('enabled-extensions', ['kiwi@kemma', 'b']);
    owner.release();
    eq(gs.values['enabled-extensions'], ['kiwi@kemma', 'b', DTD]);
});
test('members: user removes and re-adds other entries while held: order of the rest is kept', () => {
    const k = kiwi();
    const gs = shell(['kiwi@kemma', DTD, 'a']);
    const owner = new ListMembersOwner(new OriginalsStore(k), gs, 'enabled-extensions', [DTD]);
    owner.sync(true);
    gs.set_strv('enabled-extensions', ['z', 'a', 'kiwi@kemma']);
    owner.release();
    eq(gs.values['enabled-extensions'], ['z', 'a', 'kiwi@kemma', DTD]);
});
test('members: user removes the held member itself while held: nothing comes back on release', () => {
    const k = kiwi();
    const gs = shell(['kiwi@kemma', DTD]);
    const owner = new ListMembersOwner(new OriginalsStore(k), gs, 'enabled-extensions', [DTD]);
    owner.sync(true);
    gs.set_strv('enabled-extensions', ['kiwi@kemma', 'other']);
    eq(owner.held, [DTD], 'still held: it was present at take');
    owner.release();
    eq(gs.values['enabled-extensions'], ['kiwi@kemma', 'other', DTD]);
});
test('members: double release is a no-op and does not add the member twice', () => {
    const k = kiwi();
    const gs = shell(['kiwi@kemma', DTD]);
    const owner = new ListMembersOwner(new OriginalsStore(k), gs, 'enabled-extensions', [DTD]);
    owner.sync(true);
    owner.release();
    owner.release();
    owner.sync(false);
    eq(gs.values['enabled-extensions'], ['kiwi@kemma', DTD]);
    eq(gs.nHandlers, 0);
    eq(k.values[STORE_KEY], '');
});
test('members: double take does not lose the first saved member', () => {
    const k = kiwi();
    const gs = shell(['kiwi@kemma', DTD]);
    const store = new OriginalsStore(k);
    const owner = new ListMembersOwner(store, gs, 'enabled-extensions', [DTD]);
    owner.sync(true);
    owner.sync(true);
    eq(owner.held, [DTD]);
    owner.release();
    eq(gs.values['enabled-extensions'], ['kiwi@kemma', DTD]);
});
test('members: an empty list: take, release and crash restore all leave it empty', () => {
    const k = kiwi();
    const gs = shell([]);
    const owner = new ListMembersOwner(new OriginalsStore(k), gs, 'enabled-extensions', [DTD]);
    owner.sync(true);
    eq(gs.values['enabled-extensions'], []);
    eq(k.values[STORE_KEY], '');
    owner.release();
    eq(gs.values['enabled-extensions'], []);
    eq(restoreStale(new OriginalsStore(k), () => gs), []);
});
test('members: an empty member list owns nothing', () => {
    const k = kiwi();
    const gs = shell(['a', 'b']);
    const owner = new ListMembersOwner(new OriginalsStore(k), gs, 'enabled-extensions', []);
    owner.sync(true);
    eq(gs.values['enabled-extensions'], ['a', 'b']);
    eq(k.values[STORE_KEY], '');
    owner.release();
    eq(gs.values['enabled-extensions'], ['a', 'b']);
});
test('members: the user adds a member while Kiwi holds it then the list is emptied: release restores it alone', () => {
    const k = kiwi();
    const gs = shell(['kiwi@kemma', DTD]);
    const owner = new ListMembersOwner(new OriginalsStore(k), gs, 'enabled-extensions', [DTD]);
    owner.sync(true);
    gs.set_strv('enabled-extensions', []);
    owner.release();
    eq(gs.values['enabled-extensions'], [DTD]);
});
test('members: the user re-adds the member first: it is taken out again and returns once, at the end', () => {
    const k = kiwi();
    const gs = shell(['kiwi@kemma', DTD]);
    const owner = new ListMembersOwner(new OriginalsStore(k), gs, 'enabled-extensions', [DTD]);
    owner.sync(true);
    gs.set_strv('enabled-extensions', [DTD, 'kiwi@kemma']);
    eq(gs.values['enabled-extensions'], ['kiwi@kemma'], 'taken out again while held');
    owner.release();
    eq(gs.values['enabled-extensions'], ['kiwi@kemma', DTD], 'no duplicate');
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
