// Run: gjs -m tests/gtkThemeManager.test.js
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {processUserGtkFile} from '../apps/gtkThemeManager.js';

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
    promise.catch(e => { err = e; }).finally(() => loop.quit());
    loop.run();
    if (err)
        throw err;
}
const read = p => new TextDecoder().decode(Gio.File.new_for_path(p).load_contents(null)[1]);
const exists = p => GLib.file_test(p, GLib.FileTest.EXISTS);
const isLink = p => GLib.file_test(p, GLib.FileTest.IS_SYMLINK);
function write(p, t) { GLib.mkdir_with_parents(GLib.path_get_dirname(p), 0o755); GLib.file_set_contents(p, t); }

const BLOCK = '/* Kiwi (is not Apple) - managed imports: begin */\n@import url("file:///ext/css/a.css");\n/* Kiwi (is not Apple) - managed imports: end */\n';

function linked(root, text) {
    write(`${root}/dotfiles/gtk.css`, text);
    GLib.mkdir_with_parents(`${root}/gtk-4.0`, 0o755);
    Gio.File.new_for_path(`${root}/gtk-4.0/gtk.css`).make_symbolic_link(`${root}/dotfiles/gtk.css`, null);
}

test('symlinked gtk.css: block written to the target, link kept', () => {
    const root = GLib.dir_make_tmp('kiwi-gtk-XXXXXX');
    linked(root, 'window { color: red; }\n');
    run(processUserGtkFile(`${root}/gtk-4.0`, BLOCK));
    eq(isLink(`${root}/gtk-4.0/gtk.css`), true);
    eq(read(`${root}/dotfiles/gtk.css`), `${BLOCK}window { color: red; }\n`);
    run(processUserGtkFile(`${root}/gtk-4.0`, ''));
    eq(isLink(`${root}/gtk-4.0/gtk.css`), true);
    eq(read(`${root}/dotfiles/gtk.css`), 'window { color: red; }\n');
});

test('symlinked gtk.css that holds only our block: emptied, never deleted', () => {
    const root = GLib.dir_make_tmp('kiwi-gtk-XXXXXX');
    linked(root, '');
    run(processUserGtkFile(`${root}/gtk-4.0`, BLOCK));
    run(processUserGtkFile(`${root}/gtk-4.0`, ''));
    eq(isLink(`${root}/gtk-4.0/gtk.css`), true);
    eq(exists(`${root}/dotfiles/gtk.css`), true);
    eq(read(`${root}/dotfiles/gtk.css`), '');
});

test('regular gtk.css with only our block is deleted; user file kept', () => {
    const root = GLib.dir_make_tmp('kiwi-gtk-XXXXXX');
    run(processUserGtkFile(`${root}/gtk-3.0`, BLOCK));
    eq(read(`${root}/gtk-3.0/gtk.css`), BLOCK);
    run(processUserGtkFile(`${root}/gtk-3.0`, ''));
    eq(exists(`${root}/gtk-3.0/gtk.css`), false);
    write(`${root}/gtk-3.0/gtk.css`, 'mine\n');
    run(processUserGtkFile(`${root}/gtk-3.0`, ''));
    eq(read(`${root}/gtk-3.0/gtk.css`), 'mine\n');
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
