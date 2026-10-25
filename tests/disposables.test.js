// Run: gjs -m tests/disposables.test.js
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import { CleanupRegistry } from '../lib/disposables.js';

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
function eq(a, b, msg = '') {
    if (a !== b)
        throw new Error(`${msg} expected ${b}, got ${a}`);
}
function pump(ms) {
    const loop = new GLib.MainLoop(null, false);
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { loop.quit(); return GLib.SOURCE_REMOVE; });
    loop.run();
}

const Emitter = GObject.registerClass({
    Signals: { ping: {} },
}, class Emitter extends GObject.Object {});

test('dispose runs newest first, once', () => {
    const r = new CleanupRegistry();
    const log = [];
    r.add(() => log.push('a'));
    r.add(() => log.push('b'));
    r.dispose();
    r.dispose();
    eq(log.join(), 'b,a');
    eq(r.size, 0);
});

test('error in one cleanup does not stop the rest', () => {
    const r = new CleanupRegistry();
    let ran = false;
    r.add(() => { ran = true; });
    r.add(() => { throw new Error('boom'); });
    r.dispose();
    eq(ran, true);
});

test('connect disconnects on dispose', () => {
    const e = new Emitter();
    const r = new CleanupRegistry();
    let n = 0;
    r.connect(e, 'ping', () => n++);
    e.emit('ping');
    r.dispose();
    e.emit('ping');
    eq(n, 1);
});

test('release runs one cleanup now', () => {
    const e = new Emitter();
    const r = new CleanupRegistry();
    let n = 0;
    const t = r.connect(e, 'ping', () => n++);
    r.release(t);
    e.emit('ping');
    eq(n, 0);
    eq(r.size, 0);
});

test('one-shot timeout fires and forgets itself', () => {
    const r = new CleanupRegistry();
    let n = 0;
    r.timeout(5, () => { n++; });
    eq(r.size, 1);
    pump(40);
    eq(n, 1);
    eq(r.size, 0);
});

test('repeating timeout stops after dispose', () => {
    const r = new CleanupRegistry();
    let n = 0;
    r.timeout(5, () => { n++; return GLib.SOURCE_CONTINUE; });
    pump(40);
    const seen = n;
    r.dispose();
    pump(40);
    eq(n, seen);
    if (seen < 2)
        throw new Error('timer did not repeat');
});

test('idle cancelled by dispose never runs', () => {
    const r = new CleanupRegistry();
    let n = 0;
    r.idle(() => n++);
    r.dispose();
    pump(20);
    eq(n, 0);
});

test('inject wraps and restores (own method)', () => {
    const obj = { v: 2, f(x) { return x + this.v; } };
    const r = new CleanupRegistry();
    r.inject(obj, 'f', function (orig, x) { return orig.call(this, x) * 10; });
    eq(obj.f(1), 30);
    r.dispose();
    eq(obj.f(1), 3);
});

test('inject restores inherited method by deleting own override', () => {
    class A { f() { return 'a'; } }
    const proto = A.prototype;
    const inst = new A();
    const child = Object.create(proto);
    const r = new CleanupRegistry();
    r.inject(child, 'f', (orig) => `x${orig.call(child)}`);
    eq(child.f(), 'xa');
    r.dispose();
    eq(Object.prototype.hasOwnProperty.call(child, 'f'), false);
    eq(inst.f(), 'a');
});

test('actor destroyed once; early destroy drops registration', () => {
    let destroys = 0;
    const handlers = {};
    const fake = {
        connect(sig, fn) { handlers[sig] = fn; return 1; },
        disconnect() {},
        destroy() { destroys++; handlers.destroy?.(); },
    };
    const r = new CleanupRegistry();
    r.actor(fake);
    r.dispose();
    eq(destroys, 1);

    destroys = 0;
    const r2 = new CleanupRegistry();
    r2.actor(fake);
    fake.destroy();
    eq(r2.size, 0);
    r2.dispose();
    eq(destroys, 1, 'no second destroy');
});

test('file removed on dispose, missing file tolerated', () => {
    const [fd, path] = GLib.file_open_tmp('kiwi-test-XXXXXX');
    GLib.close(fd);
    const r = new CleanupRegistry();
    r.file(path);
    r.dispose();
    eq(GLib.file_test(path, GLib.FileTest.EXISTS), false);
    r.file(path);
    r.dispose();
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
