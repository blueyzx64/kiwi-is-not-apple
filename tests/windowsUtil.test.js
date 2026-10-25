// Run: gjs -m tests/windowsUtil.test.js
import { isHelperWindowInfo, isUserWindow, windowForActor } from '../apps/util/windows.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b) {
    if (a !== b)
        throw new Error(`expected ${b}, got ${a}`);
}

test('helper titles', () => {
    eq(isHelperWindowInfo({ title: 'com.foo.Bar', appName: null }), true);
    eq(isHelperWindowInfo({ title: ' GJS app', appName: null }), true);
    eq(isHelperWindowInfo({ title: 'x @!0,0 y', appName: null }), true);
    eq(isHelperWindowInfo({ title: '   ', appName: null }), true);
});
test('helper app names', () => {
    eq(isHelperWindowInfo({ title: 'Doc', appName: 'com.example.App' }), true);
    eq(isHelperWindowInfo({ title: 'Doc', appName: 'gjs' }), true);
});
test('normal window', () => {
    eq(isHelperWindowInfo({ title: 'Notes', appName: 'Text Editor' }), false);
    eq(isHelperWindowInfo({ title: null, appName: null }), false);
});
test('isUserWindow', () => {
    eq(isUserWindow(null), false);
    eq(isUserWindow({ get_title: () => 'Files' }, 'Files'), true);
    eq(isUserWindow({ get_title: () => 'com.x' }), false);
});
test('windowForActor walks up', () => {
    const win = {};
    const top = { metaWindow: win, get_parent: () => null };
    const mid = { get_parent: () => top };
    const leaf = { get_parent: () => mid };
    eq(windowForActor(leaf), win);
    eq(windowForActor({ get_parent: () => null }), null);
    eq(windowForActor(null), null);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
