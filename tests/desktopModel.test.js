// Run: gjs -m tests/desktopModel.test.js
import { DesktopModel, isHelperWindowInfo, isUserFacing } from '../core/desktopModel.js';
import { EventHub } from '../core/events.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function recorder() {
    const hub = new EventHub();
    const log = [];
    for (const name of ['window-added', 'window-changed', 'window-removed', 'window-focused', 'app-focused', 'workspaces-changed', 'monitors-changed'])
        hub.on(name, p => log.push([name, p.window?.id ?? p.appId ?? p.count ?? p.primary ?? null, p.fields ?? null]));
    return { hub, log };
}

test('helper windows', () => {
    eq(isHelperWindowInfo({ title: 'com.foo.Bar', appName: null }), true);
    eq(isHelperWindowInfo({ title: '   ', appName: null }), true);
    eq(isHelperWindowInfo({ title: 'Doc', appName: 'gjs' }), true);
    eq(isHelperWindowInfo({ title: 'Notes', appName: 'Text Editor' }), false);
    eq(isHelperWindowInfo({ title: null, appName: null }), false);
});
test('upsert: new window emits added with defaults; a real change emits changed with its fields', () => {
    const { hub, log } = recorder();
    const m = new DesktopModel(hub);
    eq(m.upsertWindow(1, { appId: 'a', title: 'A' }).length > 0, true);
    eq(m.window(1).minimized, false);
    eq(m.upsertWindow(1, { title: 'A' }), [], 'no change, no event');
    eq(m.upsertWindow(1, { minimized: true }), ['minimized']);
    eq(log, [['window-added', 1, null], ['window-changed', 1, ['minimized']]]);
    if (!Object.isFrozen(m.window(1)))
        throw new Error('WindowInfo must be frozen');
});
test('focus: MRU order, focused app, events once per change', () => {
    const { hub, log } = recorder();
    const m = new DesktopModel(hub);
    m.upsertWindow(1, { appId: 'a' });
    m.upsertWindow(2, { appId: 'b' });
    m.upsertWindow(3, { appId: 'a' });
    m.setFocus(3);
    m.setFocus(2);
    eq(m.windows().map(w => w.id), [2, 3, 1]);
    eq(m.apps(), ['b', 'a']);
    eq(m.focusedApp, 'b');
    log.length = 0;
    m.setFocus(2);
    eq(log, [], 'same focus: nothing');
    m.setFocus(99);
    eq(m.focusedWindow, null, 'unknown id is no focus');
    eq(log, [['window-focused', null, null], ['app-focused', null, null]]);
});
test('remove: forgets the window, drops focus', () => {
    const m = new DesktopModel();
    m.upsertWindow(1, { appId: 'a' });
    m.setFocus(1);
    eq(m.removeWindow(1), true);
    eq(m.removeWindow(1), false);
    eq(m.focusedWindow, null);
    eq(m.focusedApp, null);
    eq(m.windows(), []);
});
test('filters: workspace (with on-all), monitor, app, minimized, user-facing', () => {
    const m = new DesktopModel();
    m.upsertWindow(1, { appId: 'a', workspace: 0 });
    m.upsertWindow(2, { appId: 'a', workspace: 1, minimized: true });
    m.upsertWindow(3, { appId: 'b', workspace: -1, monitor: 1 });
    m.upsertWindow(4, { appId: 'c', type: 'other' });
    m.upsertWindow(5, { appId: 'd', skipTaskbar: true });
    const ids = f => m.windows(f).map(w => w.id).sort();
    eq(ids({ workspace: 1 }), [2, 3]);
    eq(ids({ monitor: 1 }), [3]);
    eq(ids({ appId: 'a', minimized: false }), [1]);
    eq(ids({}), [1, 2, 3]);
    eq(ids({ userFacing: false }), [1, 2, 3, 4, 5]);
    eq(isUserFacing(m.window(4)), false);
});
test('workspaces and monitors emit only on change', () => {
    const { hub, log } = recorder();
    const m = new DesktopModel(hub);
    m.setWorkspaces({ count: 1, active: 0 });
    m.setWorkspaces({ count: 2, active: 1 });
    const mon = [{ x: 0, y: 0, width: 1280, height: 800 }];
    m.setMonitors(mon, 0);
    m.setMonitors([{ ...mon[0] }], 0);
    eq(log.map(l => l[0]), ['workspaces-changed', 'monitors-changed']);
    eq(m.monitors[0].index, 0);
});
test('a focused window changing app re-announces the focused app', () => {
    const { hub, log } = recorder();
    const m = new DesktopModel(hub);
    m.upsertWindow(1, { appId: null });
    m.setFocus(1);
    log.length = 0;
    m.upsertWindow(1, { appId: 'late.App' });
    eq(log.map(l => l[0]), ['window-changed', 'app-focused']);
    eq(m.focusedApp, 'late.App');
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
