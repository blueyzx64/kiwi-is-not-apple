// Run: gjs -m tests/launcherEntryModel.test.js
import { LauncherEntryBook, appIdFromUri, badgeOf, progressOf } from '../core/launcherEntryModel.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

test('app uris', () => {
    eq(appIdFromUri('application://org.gnome.Nautilus.desktop'), 'org.gnome.Nautilus.desktop');
    eq(appIdFromUri('application://a/b.desktop'), null);
    eq(appIdFromUri('file:///x.desktop'), null);
    eq(appIdFromUri('application://nodesktop'), null);
    eq(appIdFromUri(null), null);
});
test('updates merge per app and report only real changes', () => {
    const book = new LauncherEntryBook();
    const uri = 'application://io.github.blueyzx64.Installer.desktop';
    eq(book.update(':1.5', uri, { 'progress': 0.25, 'progress-visible': true }), 'io.github.blueyzx64.Installer.desktop');
    eq(progressOf(book.entry('io.github.blueyzx64.Installer.desktop')), 0.25);
    eq(book.update(':1.5', uri, { 'progress': 0.25 }), null);
    eq(book.update(':1.5', uri, { 'count': 3, 'count-visible': true, 'quicklist': '/x' }), 'io.github.blueyzx64.Installer.desktop');
    const e = book.entry('io.github.blueyzx64.Installer.desktop');
    eq([e.progress, e.count, badgeOf(e)], [0.25, 3, '3']);
    // Wrong types are ignored
    eq(book.update(':1.5', uri, { 'progress': 'lots', 'count-visible': 1 }), null);
});
test('an entry that shows nothing is forgotten', () => {
    const book = new LauncherEntryBook();
    const uri = 'application://a.desktop';
    book.update(':1.9', uri, { 'progress': 0.5, 'progress-visible': true });
    eq(book.update(':1.9', uri, { 'progress-visible': false }), 'a.desktop');
    eq(book.entry('a.desktop'), null);
    eq(book.senders(), []);
});
test('a sender leaving the bus drops its entries only', () => {
    const book = new LauncherEntryBook();
    book.update(':1.1', 'application://a.desktop', { 'urgent': true });
    book.update(':1.1', 'application://b.desktop', { 'count': 2, 'count-visible': true });
    book.update(':1.2', 'application://c.desktop', { 'urgent': true });
    eq(book.senders(), [':1.1', ':1.2']);
    eq(book.dropSender(':1.1'), ['a.desktop', 'b.desktop']);
    eq([book.entry('a.desktop'), !!book.entry('c.desktop')], [null, true]);
});
test('progress clamps; badges cap and hide at zero', () => {
    eq(progressOf({ progress: 1.7, progressVisible: true }), 1);
    eq(progressOf({ progress: -1, progressVisible: true }), 0);
    eq(progressOf({ progress: 0.5, progressVisible: false }), null);
    eq(progressOf(null), null);
    eq(badgeOf({ count: 0, countVisible: true }), null);
    eq(badgeOf({ count: 12000, countVisible: true }), '9999+');
    eq(badgeOf({ count: 4, countVisible: false }), null);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
