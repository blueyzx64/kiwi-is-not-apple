// Run: gjs -m tests/userFileCleanup.test.js
// The v3 one-shot cleanup (lib/cleanup/): only Kiwi-marked content goes, everything else stays,
// and a second run changes nothing. File cases run on a temp tree through the real async Gio.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
    removeKiwiPref, kiwiPrefLines, parseBackupName, parseIni, stripKiwiBlock, stripMarkedBlock,
    isLegacyKiwiOutput, iniProfiles, parsePending, pendingBody, stateProfiles,
} from '../lib/cleanup/mozillaModel.js';
import {
    stripStaleGtkImports, isLegacyCssPath, stripKiwiEnvironment, environmentLoadsModule,
    parseSavedDockColours, dockColourPlan,
} from '../lib/cleanup/cleanupModel.js';
import { cleanMozillaProfiles, cleanProfile } from '../lib/cleanup/mozilla.js';
import { CLEANUP_ID, cleanGtkCss, cleanGtkModules, runCleanup } from '../lib/cleanup/index.js';

let failed = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function run(promise) {
    const loop = new GLib.MainLoop(null, false);
    let err = null;
    let value;
    promise.then(v => { value = v; }).catch(e => { err = e; }).finally(() => loop.quit());
    loop.run();
    if (err)
        throw err;
    return value;
}
const read = p => new TextDecoder().decode(Gio.File.new_for_path(p).load_contents(null)[1]);
const exists = p => GLib.file_test(p, GLib.FileTest.EXISTS);
const isLink = p => GLib.file_test(p, GLib.FileTest.IS_SYMLINK);
function write(p, t) { GLib.mkdir_with_parents(GLib.path_get_dirname(p), 0o755); GLib.file_set_contents(p, t); }
const tmp = () => GLib.dir_make_tmp('kiwi-clean-XXXXXX');

const P = 'firefoxWindowControls';
const IMP = '@import url("file:///ext/css/firefoxWindowControls.css");';
const BLOCK = `/* Kiwi begin */\n${IMP}\n/* Kiwi end */\n`;
const PREF = kiwiPrefLines();
const MARKER = (backup, created) => `Kiwi managed chrome folder\n${backup ? `backup=${backup}\n` : ''}${created ? 'userjs=created\n' : ''}`;

// ---- pure: Mozilla ------------------------------------------------------------------------

test('removeKiwiPref drops only the tagged pair', () => {
    eq(removeKiwiPref(PREF), '');
    eq(removeKiwiPref(`user_pref("a", 1);\n${PREF}`).trim(), 'user_pref("a", 1);');
    const own = 'user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);\n';
    eq(removeKiwiPref(own), own);
});
test('stripKiwiBlock: block out, user text kept, legacy Kiwi-only file empty', () => {
    eq(stripKiwiBlock(`${BLOCK}#nav { color: red }\n`, P), '#nav { color: red }\n');
    eq(stripKiwiBlock(`/* Kiwi */\n${IMP}\n`, P), '');
    eq(isLegacyKiwiOutput(`${IMP}\n#x{}\n`, P), false);
    eq(stripMarkedBlock(`/* Kiwi */\n${IMP}\n`), `/* Kiwi */\n${IMP}\n`);
});
test('markers, journal, ini and state parsing', () => {
    eq(parseBackupName(MARKER('chrome.kiwi-bak-1')), 'chrome.kiwi-bak-1');
    eq(parseBackupName(MARKER(null)), 'chrome.bak');
    eq(parsePending(pendingBody('install', 'chrome.bak')), { op: 'install', backup: 'chrome.bak' });
    eq(parsePending('junk'), null);
    eq(parseIni('[Profile0]\nPath=a\n')[0].data.Path, 'a');
    eq(iniProfiles('[I1]\nDefault=a\n[I2]\nDefault=a\n', '[Profile0]\nPath=/abs\nIsRelative=0\n'),
        [{ path: 'a', relative: true }, { path: '/abs', relative: false }]);
    eq(stateProfiles('{"firefoxWindowControls":["/p","rel"]}', P), ['/p']);
    eq(stateProfiles('not json', P), []);
});

// ---- pure: gtk.css, environment.d, dock colours ---------------------------------------------

const GTK_BEGIN = '/* Kiwi (is not Apple) - managed imports: begin */';
const GTK_END = '/* Kiwi (is not Apple) - managed imports: end */';
const gtkBlock = lines => `${GTK_BEGIN}\n${lines.join('\n')}\n${GTK_END}\n`;
const oldImp = n => `@import url("file:///home/u/.local/share/gnome-shell/extensions/kiwi@kemma/css/${n}");`;
const newImp = n => `@import url("file:///home/u/.local/share/gnome-shell/extensions/kiwi@kemma/features/windowControls/gtk/${n}");`;

test('gtk.css: stale 2.x imports go, the new ones and user rules stay', () => {
    const user = 'window { color: red; }\n';
    eq(stripStaleGtkImports(`${gtkBlock([oldImp('titlebuttons-alt4.css')])}${user}`, isLegacyCssPath), user);
    const mixed = gtkBlock([oldImp('titlebuttons-glass4.css'), newImp('titlebuttons4.css')]);
    eq(stripStaleGtkImports(mixed, isLegacyCssPath), gtkBlock([newImp('titlebuttons4.css')]));
    eq(stripStaleGtkImports(user, isLegacyCssPath), user);
    eq(stripStaleGtkImports(`@import url("file:///x/kiwi@kemma/css/a.css");\n`, isLegacyCssPath),
        '@import url("file:///x/kiwi@kemma/css/a.css");\n', 'outside the block it is not ours to touch');
});
test('environment.d: Kiwi lines go, user lines stay', () => {
    const kiwi = '# Kiwi GTK3 titlebuttons hover module\nGTK3_MODULES=${GTK3_MODULES:+$GTK3_MODULES:}/h/.local/share/kiwi/gtk3-modules/libtitlebuttons_hover.so\n';
    eq(stripKiwiEnvironment(kiwi), '');
    eq(stripKiwiEnvironment('# GTK3 Titlebuttons Hover Module for Kiwi Extension\nGTK_MODULES=/h/.config/environment.d/libtitlebuttons_hover.so\n'), '');
    eq(stripKiwiEnvironment(`${kiwi}FOO=bar\n`).trim(), 'FOO=bar');
    eq(stripKiwiEnvironment('GTK3_MODULES=other.so\n').trim(), 'GTK3_MODULES=other.so');
    eq(environmentLoadsModule('a.so:/x/libtitlebuttons_hover.so'), true);
    eq(environmentLoadsModule(null), false);
});
test('dock colours: only Kiwi colours go back', () => {
    const saved = parseSavedDockColours('{"background-color":{"value":"rgb(1,2,3)","user":true},"custom-theme-running-dots-color":{"value":"x","user":false}}');
    eq(dockColourPlan({ 'background-color': 'rgb(28,28,28)', 'custom-theme-running-dots-color': 'rgb(250,250,251)' }, saved),
        { 'background-color': { action: 'set', value: 'rgb(1,2,3)' }, 'custom-theme-running-dots-color': { action: 'reset' } });
    eq(dockColourPlan({ 'background-color': 'rgb(9,9,9)' }, saved), {}, 'a colour the user picked since stays');
    eq(parseSavedDockColours('{"background-color":"rgb(1,1,1)"}')['background-color'], { value: 'rgb(1,1,1)', user: true });
    eq(parseSavedDockColours('[]'), null);
});

// ---- Mozilla profiles on disk ----------------------------------------------------------------

test('Kiwi chrome/ with the user\'s moved-aside chrome.bak: restored; user.js pair removed', () => {
    const root = tmp();
    const pr = `${root}/profile`;
    write(`${pr}/chrome.bak/userChrome.css`, 'user rules');
    write(`${pr}/chrome/.kiwi-managed`, MARKER('chrome.bak'));
    write(`${pr}/chrome/userChrome.css`, BLOCK);
    write(`${pr}/user.js`, `user_pref("a", 1);\n${PREF}`);
    run(cleanProfile(pr, P));
    eq(read(`${pr}/chrome/userChrome.css`), 'user rules');
    eq(exists(`${pr}/chrome.bak`), false);
    eq(read(`${pr}/user.js`).trim(), 'user_pref("a", 1);');
    eq(run(cleanProfile(pr, P)), [], 'second run does nothing');
});
test('Kiwi-created chrome/ and user.js: both gone; an unrelated chrome.bak stays', () => {
    const root = tmp();
    const pr = `${root}/profile`;
    write(`${pr}/chrome/.kiwi-managed`, MARKER('none', true));
    write(`${pr}/chrome/userChrome.css`, BLOCK);
    write(`${pr}/user.js`, PREF);
    write(`${pr}/chrome.bak/x`, 'user backup');
    run(cleanProfile(pr, P));
    eq(exists(`${pr}/chrome`), false);
    eq(exists(`${pr}/user.js`), false);
    eq(read(`${pr}/chrome.bak/x`), 'user backup');
});
test('user.js Kiwi did not create is kept, even empty; a symlinked one stays a link', () => {
    const root = tmp();
    const pr = `${root}/profile`;
    write(`${pr}/chrome/.kiwi-managed`, MARKER('none', false));
    write(`${pr}/user.js`, PREF);
    run(cleanProfile(pr, P));
    eq(exists(`${pr}/user.js`), true);
    eq(read(`${pr}/user.js`), '');

    const pr2 = `${root}/p2`;
    write(`${root}/dot/user.js`, `user_pref("a", 1);\n${PREF}`);
    GLib.mkdir_with_parents(pr2, 0o755);
    Gio.File.new_for_path(`${pr2}/user.js`).make_symbolic_link(`${root}/dot/user.js`, null);
    run(cleanProfile(pr2, P));
    eq(isLink(`${pr2}/user.js`), true);
    eq(read(`${root}/dot/user.js`).trim(), 'user_pref("a", 1);');
});
test('user edits in Kiwi\'s userChrome.css and new user files: the dir becomes the user\'s', () => {
    const root = tmp();
    const pr = `${root}/profile`;
    write(`${pr}/chrome/.kiwi-managed`, MARKER('chrome.bak'));
    write(`${pr}/chrome/userChrome.css`, `${BLOCK}#nav { color: red }\n`);
    write(`${pr}/chrome/extra.css`, 'x');
    write(`${pr}/chrome.bak/userChrome.css`, 'old');
    run(cleanProfile(pr, P));
    eq(read(`${pr}/chrome/userChrome.css`), '#nav { color: red }\n');
    eq(exists(`${pr}/chrome/extra.css`), true);
    eq(exists(`${pr}/chrome/.kiwi-managed`), false);
    eq(read(`${pr}/chrome.bak/userChrome.css`), 'old', 'the backup is never deleted');
});
test('unmarked chrome/: only a marked Kiwi block goes', () => {
    const root = tmp();
    const pr = `${root}/profile`;
    write(`${pr}/chrome/userChrome.css`, `${BLOCK}mine\n`);
    run(cleanProfile(pr, P));
    eq(read(`${pr}/chrome/userChrome.css`), 'mine\n');
    write(`${pr}/chrome/userChrome.css`, `/* Kiwi */\n${IMP}\n`);
    run(cleanProfile(pr, P));
    eq(read(`${pr}/chrome/userChrome.css`), `/* Kiwi */\n${IMP}\n`, 'no guessing outside a Kiwi dir');
});
test('crash journals: an install half done is rolled back, a removal finished', () => {
    const root = tmp();
    const a = `${root}/a`;
    write(`${a}/chrome.bak/userChrome.css`, 'mine');
    GLib.mkdir_with_parents(`${a}/chrome`, 0o755);
    write(`${a}/.kiwi-pending`, pendingBody('install', 'chrome.bak'));
    run(cleanProfile(a, P));
    eq(read(`${a}/chrome/userChrome.css`), 'mine');
    eq(exists(`${a}/.kiwi-pending`), false);

    const b = `${root}/b`;
    write(`${b}/chrome.bak/userChrome.css`, 'mine');
    GLib.mkdir_with_parents(`${b}/chrome`, 0o755);
    write(`${b}/.kiwi-pending`, pendingBody('remove', 'chrome.bak'));
    run(cleanProfile(b, P));
    eq(read(`${b}/chrome/userChrome.css`), 'mine');
});
test('every profile: from the state file and from profiles.ini; state file removed', () => {
    const root = tmp();
    const home = `${root}/home`;
    const ff = `${home}/.mozilla/firefox`;
    write(`${ff}/profiles.ini`, '[Profile0]\nName=a\nIsRelative=1\nPath=abc.default\n');
    write(`${ff}/abc.default/chrome/.kiwi-managed`, MARKER('none'));
    write(`${ff}/abc.default/chrome/userChrome.css`, BLOCK);
    write(`${root}/old/chrome/.kiwi-managed`, MARKER('none'));
    write(`${root}/data/kiwi/mozilla-profiles.json`, JSON.stringify({ firefoxWindowControls: [`${root}/old`] }));
    write(`${home}/.thunderbird/profiles.ini`, '[Profile0]\nPath=t\n');
    write(`${home}/.thunderbird/t/user.js`, `x\n${PREF}`);
    const ok = run(cleanMozillaProfiles({ home, configDir: `${root}/config`, dataDir: `${root}/data` }));
    eq(ok, true);
    eq(exists(`${ff}/abc.default/chrome`), false);
    eq(exists(`${root}/old/chrome`), false);
    eq(exists(`${root}/data/kiwi/mozilla-profiles.json`), false);
    eq(read(`${home}/.thunderbird/t/user.js`).trim(), 'x');
});

// ---- gtk.css and environment.d on disk ---------------------------------------------------------

test('gtk.css on disk: a block of only stale imports goes, the file with it when it is ours', () => {
    const root = tmp();
    write(`${root}/gtk-3.0/gtk.css`, `${gtkBlock([oldImp('titlebuttons-alt3.css')])}window {}\n`);
    write(`${root}/gtk-4.0/gtk.css`, gtkBlock([oldImp('titlebuttons-glass4.css')]));
    run(cleanGtkCss(root));
    eq(read(`${root}/gtk-3.0/gtk.css`), 'window {}\n');
    eq(read(`${root}/gtk-4.0/gtk.css`), '', 'a gtk.css Kiwi may not have created is emptied, not deleted');
});
test('environment.d: conf removed; module kept while this session still loads it', () => {
    const root = tmp();
    const conf = `${root}/config/environment.d/10-gtk3-titlebuttons.conf`;
    const mod = `${root}/data/kiwi/gtk3-modules/libtitlebuttons_hover.so`;
    write(conf, `# Kiwi GTK3 titlebuttons hover module\nGTK3_MODULES=${mod}\n`);
    write(mod, 'ELF');
    const dirs = { configDir: `${root}/config`, dataDir: `${root}/data` };
    eq(run(cleanGtkModules({ ...dirs, environment: mod })), false);
    eq(exists(conf), false);
    eq(exists(mod), true);
    eq(run(cleanGtkModules({ ...dirs, environment: '' })), true);
    eq(exists(mod), false);
    eq(exists(`${root}/data/kiwi/gtk3-modules`), false);
    write(conf, 'MY_VAR=1\n');
    run(cleanGtkModules({ ...dirs, environment: '' }));
    eq(read(conf), 'MY_VAR=1\n', 'a conf without Kiwi lines is left alone');
});

// ---- the one-shot record ----------------------------------------------------------------------

test('runCleanup records its id once and is skipped afterwards', () => {
    const values = { 'migrations-done': ['x'] };
    let writes = 0;
    const settings = {
        settings_schema: { has_key: () => false },
        get_strv: k => values[k],
        set_strv: (k, v) => { writes++; values[k] = v; },
    };
    // Points HOME-like lookups at an empty temp tree through the environment
    const root = tmp();
    GLib.setenv('HOME', root, true);
    GLib.setenv('XDG_CONFIG_HOME', `${root}/config`, true);
    GLib.setenv('XDG_DATA_HOME', `${root}/data`, true);
    eq(run(runCleanup(settings, { isCurrent: () => true })), true);
    eq(values['migrations-done'], ['x', CLEANUP_ID]);
    eq(run(runCleanup(settings)), true);
    eq(writes, 1);
    // A run that ends after disable() records nothing
    values['migrations-done'] = [];
    run(runCleanup(settings, { isCurrent: () => false }));
    eq(values['migrations-done'], []);
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
