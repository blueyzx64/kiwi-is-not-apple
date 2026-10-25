// Run: gjs -m tests/dockRetry.test.js
import { boundedRetry } from '../apps/dockRetry.js';

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
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// Fake timers: run(n) fires the pending timer n times
function fakeTimers() {
    let next = 1;
    const live = new Map();
    return {
        add: (_ms, fn) => { const id = next++; live.set(id, fn); return id; },
        remove: id => live.delete(id),
        fire() {
            for (const [id, fn] of [...live]) {
                if (!fn())
                    live.delete(id);
            }
        },
        get pending() { return live.size; },
    };
}

test('stops on success', () => {
    const t = fakeTimers();
    let n = 0, done = 0;
    const r = boundedRetry({ interval: 1, tries: 10, timers: t, onDone: () => done++, step: () => ++n === 3 });
    r.start();
    t.fire(); t.fire();
    eq(r.running, true);
    t.fire();
    eq([n, done, r.running, t.pending], [3, 1, false, 0]);
});

test('gives up after tries', () => {
    const t = fakeTimers();
    let n = 0, done = 0;
    const r = boundedRetry({ interval: 1, tries: 4, timers: t, onDone: () => done++, step: () => { n++; return false; } });
    r.start();
    for (let i = 0; i < 10; i++)
        t.fire();
    eq([n, done, r.running], [4, 1, false]);
});

test('start while running is a no-op; stop resets the budget', () => {
    const t = fakeTimers();
    let n = 0, done = 0;
    const r = boundedRetry({ interval: 1, tries: 3, timers: t, onDone: () => done++, step: () => { n++; return false; } });
    const a = r.start();
    eq(r.start(), a);
    t.fire(); t.fire();
    r.stop();
    eq([r.running, r.attempts, done], [false, 0, 0]);
    r.start();
    t.fire(); t.fire(); t.fire();
    eq([n, done], [5, 1]);
});

if (failed)
    imports.system.exit(1);
