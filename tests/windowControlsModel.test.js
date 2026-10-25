// Run: gjs -m tests/windowControlsModel.test.js
import {
    parseButtonLayout, resolvePlacement, shouldShow,
    titlebarHideSheet, resolveIcon, MIGRATIONS, createJobQueue,
} from '../apps/windowControls/model.js';
import { isHelperWindowInfo } from '../apps/util/windows.js';
import { runMigrations } from '../lib/settings.js';

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
function eq(a, b) {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// --- parseButtonLayout
test('gnome default layout is right', () =>
    eq(parseButtonLayout('appmenu:close'), { buttons: ['close'], side: 'right' }));
test('right side with three buttons', () =>
    eq(parseButtonLayout(':minimize,maximize,close'),
        { buttons: ['minimize', 'maximize', 'close'], side: 'right' }));
test('left side layout', () =>
    eq(parseButtonLayout('close,minimize,maximize:'),
        { buttons: ['close', 'minimize', 'maximize'], side: 'left' }));
test('tie goes left', () =>
    eq(parseButtonLayout('close:minimize'), { buttons: ['close'], side: 'left' }));
test('more on the right wins', () =>
    eq(parseButtonLayout('close:minimize,maximize'), { buttons: ['minimize', 'maximize'], side: 'right' }));
test('no buttons falls back to the GNOME order on the right', () =>
    eq(parseButtonLayout('appmenu:'), { buttons: ['minimize', 'maximize', 'close'], side: 'right' }));
test('duplicates and junk are dropped', () =>
    eq(parseButtonLayout('close,close,spacer,icon:'), { buttons: ['close'], side: 'left' }));
test('empty string', () =>
    eq(parseButtonLayout('').side, 'right'));

// --- resolvePlacement
const gnome = parseButtonLayout('appmenu:minimize,maximize,close');
const mac = parseButtonLayout('close,minimize,maximize:');
test('system follows layout', () => eq(resolvePlacement('system', gnome), gnome));
test('same side keeps the user order', () =>
    eq(resolvePlacement('right', gnome), { buttons: ['minimize', 'maximize', 'close'], side: 'right' }));
test('forced left on a right layout uses macOS order', () =>
    eq(resolvePlacement('left', gnome), { buttons: ['close', 'minimize', 'maximize'], side: 'left' }));
test('forced right on a left layout uses GNOME order', () =>
    eq(resolvePlacement('right', mac), { buttons: ['minimize', 'maximize', 'close'], side: 'right' }));
test('unknown position acts like system', () => eq(resolvePlacement('x', mac), mac));

// --- isExcludedWindow
test('plain window is fine', () => eq(isHelperWindowInfo({ title: 'Docs', appName: 'Files' }), false));
test('null title is fine', () => eq(isHelperWindowInfo({ title: null, appName: null }), false));
test('blank title excluded', () => eq(isHelperWindowInfo({ title: '  ', appName: 'Files' }), true));
test('com. title excluded', () => eq(isHelperWindowInfo({ title: 'com.foo.Bar', appName: 'x' }), true));
test('gjs app excluded', () => eq(isHelperWindowInfo({ title: 'ok', appName: 'GJS Thing' }), true));

// --- shouldShow
const base = { scope: 'all', hasWindow: true, maximized: false, fullscreen: false, overview: false, excluded: false };
test('all: any focused window', () => eq(shouldShow(base), true));
test('all: not maximized still shows', () => eq(shouldShow({ ...base, maximized: false }), true));
test('no window hides', () => eq(shouldShow({ ...base, hasWindow: false }), false));
test('overview hides', () => eq(shouldShow({ ...base, overview: true }), false));
test('excluded hides', () => eq(shouldShow({ ...base, excluded: true }), false));
test('maximized scope: floating window hides', () => eq(shouldShow({ ...base, scope: 'maximized' }), false));
test('maximized scope: maximized shows', () => eq(shouldShow({ ...base, scope: 'maximized', maximized: true }), true));
test('maximized scope: fullscreen shows', () => eq(shouldShow({ ...base, scope: 'maximized', fullscreen: true }), true));
test('fullscreen scope: maximized hides', () => eq(shouldShow({ ...base, scope: 'fullscreen', maximized: true }), false));
test('fullscreen scope: fullscreen shows', () => eq(shouldShow({ ...base, scope: 'fullscreen', fullscreen: true }), true));

// --- titlebarHideSheet
const sheet = (o) => titlebarHideSheet({ showOnPanel: true, remove: true, scope: 'all', gtkVersion: '4', ...o });
test('all -> always sheet', () => eq(sheet({}), 'hide-titlebar-always4.css'));
test('maximized -> classic sheet', () => eq(sheet({ scope: 'maximized', gtkVersion: '3' }), 'hide-titlebar3.css'));
test('fullscreen -> fullscreen sheet', () => eq(sheet({ scope: 'fullscreen' }), 'hide-titlebar-fullscreen4.css'));
test('remove off -> none', () => eq(sheet({ remove: false }), null));
test('panel controls off -> none', () => eq(sheet({ showOnPanel: false }), null));

// --- resolveIcon
const files = new Set(['titlebuttons/button-close.png', 'titlebuttons/button-close@2.png',
    'titlebuttons/button-close-hover.png', 'titlebuttons/button-close-hover-alt.png',
    'titlebuttons-glass/button-close.png']);
const has = (f, n) => files.has(`${f}/${n}`);
test('plain 1x', () =>
    eq(resolveIcon({ buttonType: 'titlebuttons', iconName: 'button-close.png', scale: 1, has }),
        { folder: 'titlebuttons', name: 'button-close.png' }));
test('plain 2x', () =>
    eq(resolveIcon({ buttonType: 'titlebuttons', iconName: 'button-close.png', scale: 2, has }),
        { folder: 'titlebuttons', name: 'button-close@2.png' }));
test('2x missing falls back to 1x', () =>
    eq(resolveIcon({ buttonType: 'titlebuttons', iconName: 'button-close-hover.png', scale: 2, has }),
        { folder: 'titlebuttons', name: 'button-close-hover.png' }));
test('alt hover uses the -alt file', () =>
    eq(resolveIcon({ buttonType: 'titlebuttons-alt', iconName: 'button-close-hover.png', scale: 1, has }),
        { folder: 'titlebuttons', name: 'button-close-hover-alt.png' }));
test('alt idle uses the plain file', () =>
    eq(resolveIcon({ buttonType: 'titlebuttons-alt', iconName: 'button-close.png', scale: 1, has }),
        { folder: 'titlebuttons', name: 'button-close.png' }));
test('glass missing file falls back to default set', () =>
    eq(resolveIcon({ buttonType: 'titlebuttons-glass', iconName: 'button-close-hover.png', scale: 1, has }),
        { folder: 'titlebuttons', name: 'button-close-hover.png' }));
test('nothing exists -> default set, plain name', () =>
    eq(resolveIcon({ buttonType: 'titlebuttons', iconName: 'x.png', scale: 2, has: () => false }),
        { folder: 'titlebuttons', name: 'x.png' }));
test('optimistic has picks the first candidate', () =>
    eq(resolveIcon({ buttonType: 'titlebuttons-glass', iconName: 'button-close.png', scale: 2, has: () => true }),
        { folder: 'titlebuttons-glass', name: 'button-close@2.png' }));

// --- migration (runs through the real runMigrations)
function fakeGs(user) {
    const types = { 'show-window-controls-fullscreen-only': 'b', 'window-controls-scope': 's' };
    const gs = {
        user: { ...user },
        settings_schema: { has_key: k => k in types },
        get_user_value: k => (k in gs.user ? { v: gs.user[k] } : null),
        get_value: k => ({ get_type_string: () => types[k] }),
        get_boolean: k => gs.user[k],
        set_string: (k, v) => { gs.user[k] = v; return true; },
    };
    return gs;
}
test('migration: fullscreen-only true -> scope fullscreen', () => {
    const gs = fakeGs({ 'show-window-controls-fullscreen-only': true });
    eq(runMigrations(gs, MIGRATIONS), ['window-controls-scope']);
    eq(gs.user['window-controls-scope'], 'fullscreen');
});
test('migration: fullscreen-only false (user set) -> scope all', () => {
    const gs = fakeGs({ 'show-window-controls-fullscreen-only': false });
    runMigrations(gs, MIGRATIONS);
    eq(gs.user['window-controls-scope'], 'all');
});
test('migration: old key never set -> nothing written', () => {
    const gs = fakeGs({});
    eq(runMigrations(gs, MIGRATIONS), []);
});
test('migration: idempotent, new key wins', () => {
    const gs = fakeGs({ 'show-window-controls-fullscreen-only': true, 'window-controls-scope': 'maximized' });
    eq(runMigrations(gs, MIGRATIONS), []);
    eq(gs.user['window-controls-scope'], 'maximized');
});

try {
    const q = createJobQueue(() => {});
    const log = [];
    let running = 0;
    const job = (name, ms, fail) => () => new Promise((res, rej) => {
        running++;
        if (running > 1) log.push('OVERLAP');
        setTimeout(() => { running--; log.push(name); fail ? rej(new Error('x')) : res(); }, ms);
    });
    q(job('a', 20, true));
    q(job('b', 1));
    await q(job('c', 1));
    eq(log, ['a', 'b', 'c']);
    print('ok   job queue: no overlap, failure does not stop the next');
} catch (e) {
    failed++;
    print(`FAIL job queue: ${e.message}`);
}

if (failed)
    throw new Error(`${failed} failed`);
