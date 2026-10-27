// Run: gjs -m tests/coreEvents.test.js
import { EventHub, EVENTS } from '../core/events.js';
import { CleanupRegistry } from '../lib/disposables.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function throws(fn, what) {
    try { fn(); } catch (_e) { return; }
    throw new Error(`expected a throw: ${what}`);
}

test('on / emit / off', () => {
    const hub = new EventHub();
    const got = [];
    const off = hub.on('app-focused', ({ appId }) => got.push(appId));
    hub.emit('app-focused', { appId: 'a' });
    off();
    off();
    hub.emit('app-focused', { appId: 'b' });
    eq(got, ['a']);
    eq(hub.listenerCount('app-focused'), 0);
});
test('typos fail fast: unknown events and missing payload fields throw', () => {
    const hub = new EventHub();
    throws(() => hub.on('app-focussed', () => {}), 'unknown on');
    throws(() => hub.emit('window-added', {}), 'missing field');
    throws(() => hub.emit('nope', {}), 'unknown emit');
});
test('the same function twice is two subscriptions', () => {
    const hub = new EventHub();
    let n = 0;
    const fn = () => n++;
    const off1 = hub.on('feature-changed', fn);
    hub.on('feature-changed', fn);
    hub.emit('feature-changed', { id: 'x', active: true });
    off1();
    hub.emit('feature-changed', { id: 'x', active: true });
    eq(n, 3);
});
test('once runs one time', () => {
    const hub = new EventHub();
    let n = 0;
    hub.once('motion-changed', () => n++);
    hub.emit('motion-changed', { reducedMotion: true, animations: true });
    hub.emit('motion-changed', { reducedMotion: false, animations: true });
    eq(n, 1);
});
test('a throwing listener does not stop the others', () => {
    const hub = new EventHub();
    let reached = false;
    hub.on('work-area-changed', () => { throw new Error('boom'); });
    hub.on('work-area-changed', () => (reached = true));
    hub.emit('work-area-changed', { monitor: 0 });
    eq(reached, true);
});
test('an owner registry removes its listeners on dispose', () => {
    const hub = new EventHub();
    const cleanup = new CleanupRegistry();
    hub.on('window-removed', () => {}, cleanup);
    hub.on('window-added', () => {}, cleanup);
    cleanup.dispose();
    eq(hub.listenerCount('window-removed') + hub.listenerCount('window-added'), 0);
});
test('a listener that unsubscribes another during emit does not break the loop', () => {
    const hub = new EventHub();
    const got = [];
    let offB = null;
    hub.on('app-focused', () => { got.push('a'); offB(); });
    offB = hub.on('app-focused', () => got.push('b'));
    hub.emit('app-focused', { appId: null });
    eq(got, ['a', 'b'], 'this emit still reaches b');
    hub.emit('app-focused', { appId: null });
    eq(got, ['a', 'b', 'a']);
});
test('every declared event has a field map', () => {
    for (const [name, fields] of Object.entries(EVENTS)) {
        if (typeof fields !== 'object')
            throw new Error(name);
    }
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
