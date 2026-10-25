// Run: gjs -m tests/windowControlsModel.test.js
import {
    parseButtonLayout, resolvePlacement, shouldShow,
    titlebarHideSheet, resolveIcon, MIGRATIONS, createJobQueue,
    stripControlButtons, ownsButtonLayout, planMinimize, planMaximize, centerIn, sameRect,
    appButtonsLayout, appButtonsMacos,
} from '../apps/windowControls/model.js';
import { ButtonLayoutOwner, restoreStaleButtonLayout, SAVED_KEY } from '../apps/windowControls/buttonLayout.js';
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
test('default left on stock GNOME 50 (appmenu:close) shows the trio on the left', () =>
    eq(resolvePlacement('left', parseButtonLayout('appmenu:close')),
        { buttons: ['close', 'minimize', 'maximize'], side: 'left' }));

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

// --- stripControlButtons / ownsButtonLayout
test('strip stock GNOME layout', () => eq(stripControlButtons('appmenu:close'), 'appmenu:'));
test('strip right trio', () => eq(stripControlButtons(':minimize,maximize,close'), ':'));
test('strip keeps icon/spacer and sides', () =>
    eq(stripControlButtons('close,icon,minimize:spacer,maximize,appmenu'), 'icon:spacer,appmenu'));
test('strip empty/null', () => eq(stripControlButtons(null), ':'));
test('owns layout only for scope all + remove', () => {
    eq(ownsButtonLayout({ showOnPanel: true, remove: true, scope: 'all' }), true);
    eq(ownsButtonLayout({ showOnPanel: true, remove: false, scope: 'all' }), false);
    eq(ownsButtonLayout({ showOnPanel: false, remove: true, scope: 'all' }), false);
    eq(ownsButtonLayout({ showOnPanel: true, remove: true, scope: 'maximized' }), false);
    eq(ownsButtonLayout({ showOnPanel: true, remove: true, scope: 'fullscreen' }), false);
});

// --- planMinimize / planMaximize (forced minimize & maximize)
test('normal window minimizes itself', () =>
    eq(planMinimize([{ canMinimize: true }]), { action: 'minimize', index: 0 }));
test('modal dialog goes down with its parent', () =>
    eq(planMinimize([{ canMinimize: false }, { canMinimize: true }]), { action: 'minimize', index: 1 }));
test('nested dialogs reach the first minimizable ancestor', () =>
    eq(planMinimize([{ canMinimize: false }, { canMinimize: false }, { canMinimize: true }]),
        { action: 'minimize', index: 2 }));
test('nothing minimizable: lower', () => eq(planMinimize([{ canMinimize: false }]), { action: 'lower' }));
test('empty chain: lower', () => eq(planMinimize([]), { action: 'lower' }));
const mx = o => planMaximize({ fullscreen: false, maximized: false, filled: false, resizable: true, ...o });
test('maximize resizable', () => eq(mx({}), 'maximize'));
test('fixed size is centred', () => eq(mx({ resizable: false }), 'center'));
test('maximized unmaximizes', () => eq(mx({ maximized: true, resizable: false }), 'unmaximize'));
test('fullscreen leaves fullscreen first', () => eq(mx({ fullscreen: true, maximized: true }), 'unfullscreen'));
test('filled window goes back', () => eq(mx({ filled: true }), 'unfill'));
test('centerIn', () => eq(centerIn({ x: 0, y: 32, width: 1280, height: 768 }, 400, 300),
    { x: 440, y: 266, width: 400, height: 300 }));
test('centerIn clamps to the area', () => eq(centerIn({ x: 0, y: 0, width: 100, height: 100 }, 400, 50),
    { x: 0, y: 25, width: 100, height: 50 }));
test('sameRect slack', () => {
    eq(sameRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 1, y: 2, width: 9, height: 11 }), true);
    eq(sameRect({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 0, width: 10, height: 10 }), false);
    eq(sameRect(null, { x: 0, y: 0, width: 1, height: 1 }), false);
});

// --- ButtonLayoutOwner (fake settings)
function fakeSettings(values) {
    const handlers = new Map();
    let next = 1;
    return {
        values,
        get_string: k => values[k],
        set_string(k, v) {
            values[k] = v;
            for (const [, h] of handlers) {
                if (h.sig === `changed::${k}`)
                    h.fn();
            }
        },
        connect(sig, fn) {
            handlers.set(next, { sig, fn });
            return next++;
        },
        disconnect: id => handlers.delete(id),
        get nHandlers() {
            return handlers.size;
        },
    };
}
test('owner saves, strips and restores exactly', () => {
    const kiwi = fakeSettings({ [SAVED_KEY]: '' });
    const wm = fakeSettings({ 'button-layout': 'appmenu:minimize,close' });
    const o = new ButtonLayoutOwner(kiwi, wm);
    o.sync(true);
    eq(wm.values['button-layout'], 'appmenu:');
    eq(kiwi.values[SAVED_KEY], 'appmenu:minimize,close');
    eq(o.original, 'appmenu:minimize,close');
    o.sync(false);
    eq(wm.values['button-layout'], 'appmenu:minimize,close');
    eq(kiwi.values[SAVED_KEY], '');
    eq(wm.nHandlers, 0);
    eq(o.original, 'appmenu:minimize,close');
});
test('owner: user change while owned becomes the new original', () => {
    const kiwi = fakeSettings({ [SAVED_KEY]: '' });
    const wm = fakeSettings({ 'button-layout': 'appmenu:close' });
    let notified = 0;
    const o = new ButtonLayoutOwner(kiwi, wm, () => notified++);
    o.sync(true);
    wm.set_string('button-layout', 'close,minimize,maximize:');
    eq(wm.values['button-layout'], ':');
    eq(o.original, 'close,minimize,maximize:');
    eq(notified, 1);
    o.release();
    eq(wm.values['button-layout'], 'close,minimize,maximize:');
});
test('owner: release when not owning is a no-op', () => {
    const kiwi = fakeSettings({ [SAVED_KEY]: '' });
    const wm = fakeSettings({ 'button-layout': 'appmenu:close' });
    new ButtonLayoutOwner(kiwi, wm).release();
    eq(wm.values['button-layout'], 'appmenu:close');
});
test('stale saved layout is restored once', () => {
    const kiwi = fakeSettings({ [SAVED_KEY]: 'appmenu:close' });
    const wm = fakeSettings({ 'button-layout': 'appmenu:' });
    eq(restoreStaleButtonLayout(kiwi, wm), true);
    eq(wm.values['button-layout'], 'appmenu:close');
    eq(kiwi.values[SAVED_KEY], '');
    eq(restoreStaleButtonLayout(kiwi, wm), false);
});
test('owner after a crash keeps the saved original, not the stripped live value', () => {
    const kiwi = fakeSettings({ [SAVED_KEY]: 'appmenu:close' });
    const wm = fakeSettings({ 'button-layout': 'appmenu:' });
    const o = new ButtonLayoutOwner(kiwi, wm);
    o.sync(true);
    eq(o.original, 'appmenu:close');
    o.sync(false);
    eq(wm.values['button-layout'], 'appmenu:close');
});

// --- titlebarHideSheet
const sheet = (o) => titlebarHideSheet({ showOnPanel: true, remove: true, scope: 'all', gtkVersion: '4', ...o });
test('all -> no sheet (the button-layout does it, live)', () => eq(sheet({}), null));
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

// --- app buttons while the top-bar controls are off (UX round 2, #8)
const AB = (orig, position, set) => appButtonsLayout(orig, { position, set });
test('app buttons: stock appmenu:close, all combinations', () => {
    eq(AB('appmenu:close', 'right', 'all'), 'appmenu:minimize,maximize,close');
    eq(AB('appmenu:close', 'left', 'all'), 'close,minimize,maximize:appmenu');
    eq(AB('appmenu:close', 'right', 'close'), 'appmenu:close');
    eq(AB('appmenu:close', 'left', 'close'), 'close:appmenu');
});
test('app buttons: defaults are right + all', () =>
    eq(appButtonsLayout('appmenu:close'), 'appmenu:minimize,maximize,close'));
test('app buttons: a left (macOS) original, all combinations', () => {
    eq(AB('close,minimize,maximize:appmenu', 'left', 'all'), 'close,minimize,maximize:appmenu');
    eq(AB('close,minimize,maximize:appmenu', 'right', 'all'), 'appmenu:minimize,maximize,close');
    eq(AB('close,minimize,maximize:appmenu', 'left', 'close'), 'close:appmenu');
    eq(AB('close,minimize,maximize:appmenu', 'right', 'close'), 'appmenu:close');
});
test('app buttons: other items kept in place on the same side', () => {
    eq(AB('icon,appmenu:spacer,close', 'right', 'all'), 'icon,appmenu:spacer,minimize,maximize,close');
    eq(AB('close,spacer:icon', 'left', 'all'), 'close,minimize,maximize,spacer:icon');
});
test('app buttons: other items mirrored when the side flips', () => {
    eq(AB('icon,appmenu:spacer,close', 'left', 'all'), 'close,minimize,maximize,spacer:appmenu,icon');
    eq(AB('close,spacer:icon', 'right', 'all'), 'icon:spacer,minimize,maximize,close');
});
test('app buttons: stripped or empty originals', () => {
    eq(AB('appmenu:', 'right', 'all'), 'appmenu:minimize,maximize,close');
    eq(AB('appmenu:', 'left', 'all'), 'close,minimize,maximize:appmenu');
    eq(AB('', 'right', 'all'), ':minimize,maximize,close');
    eq(AB(':', 'left', 'all'), 'close,minimize,maximize:');
    eq(AB(null, 'left', 'close'), 'close:');
});
test('app buttons: user button order and duplicates replaced by the full set', () =>
    eq(AB('maximize,close,close:appmenu', 'left', 'all'), 'close,minimize,maximize:appmenu'));
test('app buttons: idempotent on its own output', () => {
    for (const orig of ['appmenu:close', 'close,minimize,maximize:', 'icon:spacer,close', ''])
        for (const pos of ['right', 'left'])
            for (const set of ['all', 'close']) {
                const once = AB(orig, pos, set);
                eq(AB(once, pos, set), once);
            }
});
test('app buttons: unknown position falls back to right', () =>
    eq(AB('appmenu:close', 'middle', 'all'), 'appmenu:minimize,maximize,close'));
test('appButtonsMacos: controls on, apps keep buttons -> enable-app-window-buttons', () => {
    eq(appButtonsMacos({ showOnPanel: true, scope: 'maximized', enableAppButtons: true, style: 'gnome' }), true);
    eq(appButtonsMacos({ showOnPanel: true, scope: 'fullscreen', enableAppButtons: false, style: 'macos' }), false);
    eq(appButtonsMacos({ showOnPanel: true, remove: false, scope: 'all', enableAppButtons: true, style: 'gnome' }), true);
});
test('appButtonsMacos: controls on with the layout owned -> app-buttons-style (no change on toggle)', () => {
    for (const style of ['gnome', 'macos'])
        for (const enableAppButtons of [true, false])
            eq(appButtonsMacos({ showOnPanel: true, remove: true, scope: 'all', enableAppButtons, style }),
                appButtonsMacos({ showOnPanel: false, enableAppButtons, style }));
});
test('appButtonsMacos: controls off follow app-buttons-style', () => {
    eq(appButtonsMacos({ showOnPanel: false, enableAppButtons: true, style: 'gnome' }), false);
    eq(appButtonsMacos({ showOnPanel: false, enableAppButtons: false, style: 'macos' }), true);
});
test('owner with the app-buttons transform: take, reapply, restore exactly', () => {
    const kiwi = fakeSettings({ [SAVED_KEY]: '' });
    const wm = fakeSettings({ 'button-layout': 'appmenu:close' });
    let position = 'right';
    const o = new ButtonLayoutOwner(kiwi, wm, () => {}, orig => appButtonsLayout(orig, { position }));
    o.sync(true);
    eq(wm.values['button-layout'], 'appmenu:minimize,maximize,close');
    eq(kiwi.values[SAVED_KEY], 'appmenu:close');
    position = 'left';
    o.reapply();
    eq(wm.values['button-layout'], 'close,minimize,maximize:appmenu');
    eq(kiwi.values[SAVED_KEY], 'appmenu:close');
    o.release();
    eq(wm.values['button-layout'], 'appmenu:close');
    eq(kiwi.values[SAVED_KEY], '');
    eq(wm.nHandlers, 0);
});
test('owner handover: panel controls -> app buttons -> panel controls keeps the original', () => {
    const kiwi = fakeSettings({ [SAVED_KEY]: '' });
    const wm = fakeSettings({ 'button-layout': 'icon:close' });
    const panel = new ButtonLayoutOwner(kiwi, wm);
    panel.sync(true);
    eq(wm.values['button-layout'], 'icon:');
    panel.release(); // the registry stops the old owner first
    const apps = new ButtonLayoutOwner(kiwi, wm, () => {}, orig => appButtonsLayout(orig));
    apps.sync(true);
    eq(wm.values['button-layout'], 'icon:minimize,maximize,close');
    apps.release();
    panel.sync(true);
    eq(wm.values['button-layout'], 'icon:');
    panel.release();
    eq(wm.values['button-layout'], 'icon:close');
    eq(kiwi.values[SAVED_KEY], '');
});
test('owner reapply while not owning does nothing', () => {
    const wm = fakeSettings({ 'button-layout': 'appmenu:close' });
    new ButtonLayoutOwner(fakeSettings({ [SAVED_KEY]: '' }), wm, () => {}, () => 'x:y').reapply();
    eq(wm.values['button-layout'], 'appmenu:close');
});
function fakeGs2(user, defaults = { 'enable-app-window-buttons': true, 'show-window-controls': true }) {
    const types = { 'show-window-controls': 'b', 'enable-app-window-buttons': 'b', 'app-buttons-style': 's' };
    const gs = {
        user: { ...user },
        settings_schema: { has_key: k => k in types },
        get_user_value: k => (k in gs.user ? { v: gs.user[k] } : null),
        get_value: k => ({ get_type_string: () => types[k] }),
        get_boolean: k => (k in gs.user ? gs.user[k] : defaults[k]),
        set_string: (k, v) => { gs.user[k] = v; return true; },
    };
    return gs;
}
test('migration: controls already off + macOS app buttons (default) -> style macos', () => {
    const gs = fakeGs2({ 'show-window-controls': false });
    eq(runMigrations(gs, MIGRATIONS), ['app-buttons-style']);
    eq(gs.user['app-buttons-style'], 'macos');
});
test('migration: controls off, macOS app buttons turned off -> style gnome', () => {
    const gs = fakeGs2({ 'show-window-controls': false, 'enable-app-window-buttons': false });
    runMigrations(gs, MIGRATIONS);
    eq(gs.user['app-buttons-style'], 'gnome');
});
test('migration: controls never touched -> style stays default', () => {
    const gs = fakeGs2({ 'enable-app-window-buttons': true });
    eq(runMigrations(gs, MIGRATIONS), []);
    eq(gs.user['app-buttons-style'], undefined);
});
test('migration: app-buttons-style set by the user wins', () => {
    const gs = fakeGs2({ 'show-window-controls': false, 'app-buttons-style': 'gnome' });
    eq(runMigrations(gs, MIGRATIONS), []);
    eq(gs.user['app-buttons-style'], 'gnome');
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
