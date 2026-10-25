// Run: gjs -m tests/mozillaThemeManager.test.js
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {MozillaThemeManager, addKiwiPref, removeKiwiPref, parseBackupName, parseIni} from '../apps/mozillaThemeManager.js';

let failed = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const LINE = 'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);';

test('addKiwiPref adds a tagged pair to empty and keeps user lines', () => {
    eq(addKiwiPref('').includes(LINE), true);
    const out = addKiwiPref('user_pref("a", 1);\n');
    eq(out.startsWith('user_pref("a", 1);\n'), true);
});
test('addKiwiPref is a no-op when the pref exists', () => {
    const c = `${LINE}\n`;
    eq(addKiwiPref(c), c);
});
test('removeKiwiPref round trips', () => {
    eq(removeKiwiPref(addKiwiPref('')), '');
    const base = 'user_pref("a", 1);\n';
    eq(removeKiwiPref(addKiwiPref(base)).trim(), base.trim());
});
test('removeKiwiPref keeps a user-written pref without the tag', () => {
    const c = `${LINE}\nuser_pref("b", 2);\n`;
    eq(removeKiwiPref(c), c);
});
test('parseBackupName', () => {
    eq(parseBackupName('Kiwi managed chrome folder\nbackup=chrome.kiwi-bak-1\n'), 'chrome.kiwi-bak-1');
    eq(parseBackupName('Kiwi managed chrome folder\n'), 'chrome.bak');
});
test('parseIni', () => {
    const s = parseIni('[Profile0]\nName=x\nDefault=1\n\n[General]\nA=b\n');
    eq(s.map(x => x.name), ['Profile0', 'General']);
    eq(s[0].data.Default, '1');
});

// Integration on a temp HOME-like tree, driven through the real async paths.
function run(loopPromise) {
    const loop = new GLib.MainLoop(null, false);
    let err = null;
    loopPromise.catch(e => { err = e; }).finally(() => loop.quit());
    loop.run();
    if (err)
        throw err;
}
const read = p => new TextDecoder().decode(Gio.File.new_for_path(p).load_contents(null)[1]);
const exists = p => GLib.file_test(p, GLib.FileTest.EXISTS);
function write(p, t) { GLib.mkdir_with_parents(GLib.path_get_dirname(p), 0o755); GLib.file_set_contents(p, t); }

function makeManager(root) {
    const values = {'enable-firefox-styling': true, 'enable-app-window-buttons': true,
        'show-window-controls': true, 'remove-titlebar-buttons': true};
    const settings = {
        get_boolean: k => values[k] ?? false,
        get_string: k => (k === 'button-type' ? 'titlebuttons' : 'normal'),
        connect: () => 1, disconnect: () => {},
    };
    const m = new MozillaThemeManager({path: '/ext', getSettings: () => settings}, {
        settingsKey: 'enable-firefox-styling', profileBaseDir: 'nohome/.mozilla/firefox',
        xdgProfileDir: 'nohome/xdg', cssPrefix: 'firefoxWindowControls', logPrefix: 'Test',
    });
    m._settings = settings;
    m._getDefaultProfile = async () => `${root}/profile`;
    return {m, values};
}

test('user chrome/ is moved aside, restored on removal, user.js line removed', () => {
    const root = GLib.dir_make_tmp('kiwi-moz-XXXXXX');
    write(`${root}/profile/chrome/userChrome.css`, 'user rules');
    write(`${root}/profile/user.js`, 'user_pref("a", 1);\n');
    const {m} = makeManager(root);
    run(m.updateCss());
    eq(read(`${root}/profile/chrome/userChrome.css`).includes('firefoxWindowControls.css'), true);
    eq(read(`${root}/profile/chrome.bak/userChrome.css`), 'user rules');
    eq(read(`${root}/profile/user.js`).includes(LINE), true);
    run(m.removeCss());
    eq(read(`${root}/profile/chrome/userChrome.css`), 'user rules');
    eq(exists(`${root}/profile/chrome.bak`), false);
    eq(read(`${root}/profile/user.js`).trim(), 'user_pref("a", 1);');
});

test('existing chrome.bak is never overwritten', () => {
    const root = GLib.dir_make_tmp('kiwi-moz-XXXXXX');
    write(`${root}/profile/chrome/userChrome.css`, 'mine');
    write(`${root}/profile/chrome.bak/keep`, 'old backup');
    const {m} = makeManager(root);
    run(m.updateCss());
    eq(read(`${root}/profile/chrome.bak/keep`), 'old backup');
    eq(exists(`${root}/profile/chrome.kiwi-bak-1`), false);
    run(m.removeCss());
    eq(read(`${root}/profile/chrome/userChrome.css`), 'mine');
    eq(exists(`${root}/profile/user.js`), false);
});

test('no buttons and no panel controls: no hang, userChrome.css not empty', () => {
    const root = GLib.dir_make_tmp('kiwi-moz-XXXXXX');
    GLib.mkdir_with_parents(`${root}/profile`, 0o755);
    const {m, values} = makeManager(root);
    values['enable-app-window-buttons'] = false;
    values['show-window-controls'] = false;
    run(m.updateCss());
    eq(read(`${root}/profile/chrome/userChrome.css`), '/* Kiwi */\n');
    eq(read(`${root}/profile/chrome/.kiwi-managed`).includes('userjs=created'), true);
});

test('user.js that Kiwi did not create is kept (empty) after removal', () => {
    const root = GLib.dir_make_tmp('kiwi-moz-XXXXXX');
    write(`${root}/profile/user.js`, '');
    const {m} = makeManager(root);
    run(m.updateCss());
    eq(read(`${root}/profile/chrome/.kiwi-managed`).includes('userjs=created'), false);
    run(m.removeCss());
    eq(exists(`${root}/profile/user.js`), true);
    eq(read(`${root}/profile/user.js`), '');
});

test('symlinked user.js survives', () => {
    const root = GLib.dir_make_tmp('kiwi-moz-XXXXXX');
    write(`${root}/dot/user.js`, 'user_pref("a", 1);\n');
    GLib.mkdir_with_parents(`${root}/profile`, 0o755);
    Gio.File.new_for_path(`${root}/profile/user.js`).make_symbolic_link(`${root}/dot/user.js`, null);
    const {m} = makeManager(root);
    run(m.updateCss());
    eq(Gio.File.new_for_path(`${root}/profile/user.js`).query_info('standard::is-symlink', 0, null).get_is_symlink(), true);
    eq(read(`${root}/dot/user.js`).includes(LINE), true);
    run(m.removeCss());
    eq(Gio.File.new_for_path(`${root}/profile/user.js`).query_info('standard::is-symlink', 0, null).get_is_symlink(), true);
    eq(read(`${root}/dot/user.js`).trim(), 'user_pref("a", 1);');
});

test('foreign files in chrome/: marker kept, backup kept', () => {
    const root = GLib.dir_make_tmp('kiwi-moz-XXXXXX');
    write(`${root}/profile/chrome/userChrome.css`, 'mine');
    const {m} = makeManager(root);
    run(m.updateCss());
    write(`${root}/profile/chrome/extra.css`, 'x');
    run(m.removeCss());
    eq(exists(`${root}/profile/chrome/.kiwi-managed`), true);
    eq(exists(`${root}/profile/chrome/userChrome.css`), false);
    eq(exists(`${root}/profile/chrome.bak/userChrome.css`), true);
});

test('unmarked chrome/ is not touched by removal', () => {
    const root = GLib.dir_make_tmp('kiwi-moz-XXXXXX');
    write(`${root}/profile/chrome/userChrome.css`, 'mine');
    const {m} = makeManager(root);
    run(m.removeCss());
    eq(read(`${root}/profile/chrome/userChrome.css`), 'mine');
});

for (const [name, fn] of tests) {
    try {
        fn();
        print(`ok   ${name}`);
    } catch (e) {
        failed++;
        print(`FAIL ${name}: ${e.message}`);
    }
}
if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
