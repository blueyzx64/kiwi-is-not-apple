// Run: gjs -m tests/mozillaThemeManager.test.js
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {MozillaThemeManager, addKiwiPref, removeKiwiPref, parseBackupName, parseIni,
    applyKiwiBlock, stripKiwiBlock, isLegacyKiwiOutput, installsIniProfiles, parsePending, pendingBody} from '../apps/mozillaThemeManager.js';

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

const IMP = '@import url("file:///ext/css/firefoxWindowControls.css");';
const P = 'firefoxWindowControls';
test('block: user text outside it is kept, block replaced', () => {
    const a = applyKiwiBlock('#nav { color: red }\n', [IMP], P);
    eq(a, `/* Kiwi begin */\n${IMP}\n/* Kiwi end */\n#nav { color: red }\n`);
    eq(applyKiwiBlock(a, [], P), '/* Kiwi begin */\n/* Kiwi end */\n#nav { color: red }\n');
    eq(stripKiwiBlock(a, P), '#nav { color: red }\n');
});
test('legacy Kiwi-only userChrome.css migrates; user files are not legacy', () => {
    eq(isLegacyKiwiOutput(`/* Kiwi */\n${IMP}\n`, P), true);
    eq(isLegacyKiwiOutput(`${IMP}\n`, P), true);
    eq(isLegacyKiwiOutput('', P), true);
    eq(isLegacyKiwiOutput(`${IMP}\n#x{}\n`, P), false);
    eq(applyKiwiBlock(`/* Kiwi */\n${IMP}\n`, [IMP], P), `/* Kiwi begin */\n${IMP}\n/* Kiwi end */\n`);
});
test('installs.ini: every install default, deduped', () => {
    eq(installsIniProfiles(parseIni('[Install1]\nDefault=a.default\n[Install2]\nDefault=b\n[Install3]\nDefault=a.default\n')), ['a.default', 'b']);
});
test('pending journal round trip', () => {
    eq(parsePending(pendingBody('install', 'chrome.bak')), {op: 'install', backup: 'chrome.bak'});
    eq(parsePending('junk'), null);
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
    const current = [`${root}/profile`];
    m._getCurrentProfiles = async () => current.filter(p => exists(p));
    m._statePath = `${root}/share/kiwi/mozilla-profiles.json`;
    return {m, values, current};
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
    eq(read(`${root}/profile/chrome/userChrome.css`), '/* Kiwi begin */\n/* Kiwi end */\n');
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

test('user edits in userChrome.css survive login and disable', () => {
    const root = GLib.dir_make_tmp('kiwi-moz-XXXXXX');
    GLib.mkdir_with_parents(`${root}/profile`, 0o755);
    const {m} = makeManager(root);
    run(m.updateCss());
    const uc = `${root}/profile/chrome/userChrome.css`;
    write(uc, `${read(uc)}#nav { color: red }\n`);
    run(m.updateCss());
    eq(read(uc).endsWith('#nav { color: red }\n'), true);
    eq(read(uc).split('Kiwi begin').length, 2);
    run(m.removeCss());
    eq(read(uc), '#nav { color: red }\n');
    eq(exists(`${root}/profile/chrome/.kiwi-managed`), true);
});

test('old Kiwi-only userChrome.css is migrated and fully removed', () => {
    const root = GLib.dir_make_tmp('kiwi-moz-XXXXXX');
    write(`${root}/profile/chrome/.kiwi-managed`, 'Kiwi managed chrome folder\nbackup=chrome.bak\n');
    write(`${root}/profile/chrome/userChrome.css`, '/* Kiwi */\n@import url("file:///old/css/firefoxWindowControls.css");\n');
    const {m} = makeManager(root);
    run(m.updateCss());
    eq(read(`${root}/profile/chrome/userChrome.css`).includes('/old/'), false);
    run(m.removeCss());
    eq(exists(`${root}/profile/chrome`), false);
});

test('every profile Kiwi touched is cleaned, also after the default changed', () => {
    const root = GLib.dir_make_tmp('kiwi-moz-XXXXXX');
    GLib.mkdir_with_parents(`${root}/profile`, 0o755);
    GLib.mkdir_with_parents(`${root}/other`, 0o755);
    const {m, current} = makeManager(root);
    run(m.updateCss());
    current[0] = `${root}/other`;
    run(m.updateCss()); // old profile cleaned as it is no longer current
    eq(exists(`${root}/profile/chrome`), false);
    eq(exists(`${root}/other/chrome/.kiwi-managed`), true);
    eq(JSON.parse(read(`${root}/share/kiwi/mozilla-profiles.json`)), {firefoxWindowControls: [`${root}/other`]});
    current.length = 0; // no default profile at all: state file still drives cleanup
    run(m.removeCss());
    eq(exists(`${root}/other/chrome`), false);
    eq(exists(`${root}/share/kiwi/mozilla-profiles.json`), false);
});

test('two installs in installs.ini: both styled', () => {
    const root = GLib.dir_make_tmp('kiwi-moz-XXXXXX');
    write(`${root}/ff/installs.ini`, '[A1]\nDefault=p1\n\n[B2]\nDefault=p2\n');
    GLib.mkdir_with_parents(`${root}/ff/p1`, 0o755);
    GLib.mkdir_with_parents(`${root}/ff/p2`, 0o755);
    const {m} = makeManager(root);
    let found = null;
    run(m._getProfilesFromInstallsIni(`${root}/ff`).then(r => { found = r; }));
    eq(found, [`${root}/ff/p1`, `${root}/ff/p2`]);
});

test('crash after moving chrome/ aside: next run rolls back, then installs', () => {
    const root = GLib.dir_make_tmp('kiwi-moz-XXXXXX');
    write(`${root}/profile/chrome.bak/userChrome.css`, 'mine');
    GLib.mkdir_with_parents(`${root}/profile/chrome`, 0o755); // empty, no marker yet
    write(`${root}/profile/.kiwi-pending`, 'op=install\nbackup=chrome.bak\n');
    const {m} = makeManager(root);
    run(m.removeCss());
    eq(read(`${root}/profile/chrome/userChrome.css`), 'mine');
    eq(exists(`${root}/profile/chrome.bak`), false);
    eq(exists(`${root}/profile/.kiwi-pending`), false);
});

test('crash during removal (marker gone, empty chrome/): finished next run', () => {
    const root = GLib.dir_make_tmp('kiwi-moz-XXXXXX');
    write(`${root}/profile/chrome.bak/userChrome.css`, 'mine');
    GLib.mkdir_with_parents(`${root}/profile/chrome`, 0o755);
    write(`${root}/profile/.kiwi-pending`, 'op=remove\nbackup=chrome.bak\n');
    const {m} = makeManager(root);
    run(m.removeCss());
    eq(read(`${root}/profile/chrome/userChrome.css`), 'mine');
    eq(exists(`${root}/profile/.kiwi-pending`), false);
});

test('Kiwi-created chrome/ never restores an unrelated chrome.bak', () => {
    const root = GLib.dir_make_tmp('kiwi-moz-XXXXXX');
    GLib.mkdir_with_parents(`${root}/profile`, 0o755);
    const {m} = makeManager(root);
    run(m.updateCss());
    write(`${root}/profile/chrome.bak/x`, 'user backup');
    run(m.removeCss());
    eq(exists(`${root}/profile/chrome`), false);
    eq(read(`${root}/profile/chrome.bak/x`), 'user backup');
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
