// Run: gjs -m tests/clipboardStore.test.js   (real Gio async I/O in a temp dir)
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { ClipboardStore } from '../apps/clipboard/store.js';
import { History, imageFileName, makeEntry, orphanFiles } from '../apps/clipboard/model.js';

let failed = 0;
const loop = new GLib.MainLoop(null, false);
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
function eq(a, b, msg = '') {
    if (a !== b)
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
const H = n => String(n).padStart(64, '0');
const mode = path => Gio.File.new_for_path(path).query_info('unix::mode', 0, null)
    .get_attribute_uint32('unix::mode') & 0o777;

test('save, load, modes 0600/0700, clear', async () => {
    const base = GLib.dir_make_tmp('kiwi-clip-XXXXXX');
    const dir = GLib.build_filenamev([base, 'kiwi', 'clipboard']);
    const store = new ClipboardStore(dir);
    eq((await store.load()).length, 0, 'empty load');

    const h = new History();
    h.add(makeEntry({ kind: 'text', hash: 'a', mime: 't', size: 3, time: 1, text: 'abc' }));
    const name = imageFileName(H(1), 'image/png');
    h.add(makeEntry({ kind: 'image', hash: H(1), mime: 'image/png', size: 4, time: 2, file: name }));
    await store.writeImage(name, new GLib.Bytes(new Uint8Array([1, 2, 3, 4])));
    await store.saveIndex(h);

    eq(mode(dir), 0o700, 'dir mode');
    eq(mode(GLib.build_filenamev([dir, 'images'])), 0o700, 'images dir mode');
    eq(mode(GLib.build_filenamev([dir, 'history.json'])), 0o600, 'index mode');
    eq(mode(GLib.build_filenamev([dir, 'images', name])), 0o600, 'image mode');

    const back = await new ClipboardStore(dir).load();
    eq(back.length, 2);
    eq((await store.readImage(name)).get_size(), 4);
    eq(await store.readImage('../history.json'), null, 'path trick refused');

    // orphan sweep removes only store-pattern files, leaves a stray user file alone
    const stray = GLib.build_filenamev([dir, 'images', 'notes.txt']);
    GLib.file_set_contents(stray, 'mine');
    const orphan = imageFileName(H(9), 'image/png');
    await store.writeImage(orphan, new GLib.Bytes(new Uint8Array([9])));
    await store.sweep(h, orphanFiles);
    eq(GLib.file_test(GLib.build_filenamev([dir, 'images', orphan]), GLib.FileTest.EXISTS), false, 'orphan gone');
    eq(GLib.file_test(stray, GLib.FileTest.EXISTS), true, 'user file kept');

    await store.clearAll();
    eq(GLib.file_test(GLib.build_filenamev([dir, 'history.json']), GLib.FileTest.EXISTS), false);
    eq(GLib.file_test(GLib.build_filenamev([dir, 'images', name]), GLib.FileTest.EXISTS), false);
    eq(GLib.file_test(stray, GLib.FileTest.EXISTS), true, 'user file kept after clear');
});

test('corrupt index loads as empty', async () => {
    const dir = GLib.dir_make_tmp('kiwi-clip-XXXXXX');
    GLib.file_set_contents(GLib.build_filenamev([dir, 'history.json']), '{oops');
    eq((await new ClipboardStore(dir).load()).length, 0);
});

(async () => {
    for (const [name, fn] of tests) {
        try {
            await fn();
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
    loop.quit();
})();
loop.run();
