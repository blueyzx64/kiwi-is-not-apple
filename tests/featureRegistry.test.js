// Run: gjs -m tests/featureRegistry.test.js
import GLib from 'gi://GLib';

import { FeatureRegistry } from '../lib/featureRegistry.js';
import { CleanupRegistry } from '../lib/disposables.js';
import { FEATURES } from '../features.js';

let failed = 0;
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
// Let pending promise jobs (lazy loads) run
function settle(reg) {
    const loop = new GLib.MainLoop(null, false);
    let err = null;
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        reg.settled().catch(e => (err = e)).finally(() => loop.quit());
        return GLib.SOURCE_REMOVE;
    });
    loop.run();
    if (err)
        throw err;
}

// A class that logs +id / -id, with optional hooks
function logged(log, id, { onEnable = () => {}, extra = {} } = {}) {
    return class {
        constructor(ctx, cleanup) {
            this.cleanup = cleanup;
            Object.assign(this, extra);
        }

        enable() {
            onEnable(this);
            log.push(`+${id}`);
        }

        disable() {
            log.push(`-${id}`);
        }
    };
}

function setup(entries, flags = {}, opts = {}, log = []) {
    const ctx = { settings: { get_boolean: k => !!flags[k] }, flags };
    const reg = new FeatureRegistry(CleanupRegistry, opts);
    for (const { hooks, ...e } of entries)
        reg.register(e.load ? e : { cls: logged(log, e.id, hooks), ...e });
    return { reg, log, ctx, flags };
}

test('edge-triggered: enable once, disable once', () => {
    const { reg, log, ctx, flags } = setup([{ id: 'a', setting: 'a' }]);
    reg.start(ctx);
    eq(log, []);
    flags.a = true;
    reg.refresh('a');
    reg.refresh('other');
    eq(log, ['+a']);
    flags.a = false;
    reg.refresh('a');
    reg.refresh('a');
    eq(log, ['+a', '-a']);
});

test('registration order on start, reverse on stop', () => {
    const { reg, log, ctx } = setup([{ id: 'a' }, { id: 'b' }]);
    reg.start(ctx);
    reg.stop();
    eq(log, ['+a', '+b', '-b', '-a']);
});

test('restartOn disables first then re-enables', () => {
    const { reg, log, ctx } = setup([{ id: 'a', restartOn: ['k'] }]);
    reg.start(ctx);
    reg.refresh('k');
    eq(log, ['+a', '-a', '+a']);
});

test('needs holds a feature off until its dependency runs', () => {
    const { reg, log, ctx, flags } = setup([
        { id: 'dock', setting: 'dock' },
        { id: 'magnify', setting: 'magnify', needs: ['dock'] },
    ], { magnify: true });
    reg.start(ctx);
    eq(log, []);
    eq(reg.status('magnify'), 'paused');
    flags.dock = true;
    reg.refresh('dock');
    eq(log, ['+dock', '+magnify']);
});

test('conflictsWith: the winner pauses the loser; losers stop before winners start', () => {
    const { reg, log, ctx, flags } = setup([
        { id: 'space', setting: 'space' },
        { id: 'stage', setting: 'stage', conflictsWith: ['space'] },
    ], { space: true });
    reg.start(ctx);
    eq(log, ['+space']);
    flags.stage = true;
    reg.refresh('stage');
    eq(log, ['+space', '-space', '+stage']);
    eq(reg.status('space'), 'paused');
    flags.stage = false;
    reg.refresh('stage');
    eq(log.slice(-2), ['-stage', '+space']);
});

test('the cleanup registry is disposed after disable', () => {
    const log = [];
    const { reg, ctx } = setup([{ id: 'f', hooks: { onEnable: self => self.cleanup.add(() => log.push('cleanup')) } }]);
    reg.start(ctx);
    reg.stop();
    eq(log, ['cleanup']);
});

test('throwing enable does not stop others and leaves the entry inactive', () => {
    const { reg, log, ctx } = setup([
        { id: 'bad', hooks: { onEnable() { throw new Error('x'); } } },
        { id: 'ok' },
    ]);
    reg.start(ctx);
    eq(log.includes('+ok'), true);
    eq(reg.isActive('bad'), false);
});

test('duplicate ids and entries without cls/load are rejected', () => {
    const reg = new FeatureRegistry(CleanupRegistry);
    reg.register({ id: 'a', cls: class {} });
    let threw = 0;
    try { reg.register({ id: 'a', cls: class {} }); } catch (_e) { threw++; }
    try { reg.register({ id: 'b' }); } catch (_e) { threw++; }
    eq(threw, 2);
});

test('a winner that fails to enable does not pause its losers, and is not retried on other keys', () => {
    let tries = 0;
    const { reg, log, ctx } = setup([
        { id: 'loser' },
        { id: 'winner', setting: 'w', conflictsWith: ['loser'], hooks: { onEnable() { tries++; throw new Error('boom'); } } },
    ], { w: true });
    reg.start(ctx);
    eq(reg.isActive('winner'), false);
    eq(reg.status('loser'), 'active');
    eq(log, ['-winner', '+loser'], 'the failed winner is torn down, then the loser starts');
    reg.refresh('unrelated');
    eq(tries, 1);
});

test('a failed entry is retried on its own key, and after off -> on', () => {
    let tries = 0;
    let broken = true;
    const { reg, ctx, flags } = setup([{
        id: 'a', setting: 'a', keys: ['a-extra'],
        hooks: { onEnable() { tries++; if (broken) throw new Error('x'); } },
    }], { a: true });
    reg.start(ctx);
    reg.refresh('a-extra');
    eq(tries, 2);
    flags.a = false;
    reg.refresh('a');
    flags.a = true;
    broken = false;
    reg.refresh('a');
    eq(tries, 3);
    eq(reg.isActive('a'), true);
});

test('instance(): the running instance, null while off', () => {
    const { reg, ctx, flags } = setup([{ id: 't', setting: 't', hooks: { extra: { hello: () => 'hi' } } }]);
    reg.start(ctx);
    eq(reg.instance('t'), null);
    flags.t = true;
    reg.refresh('t');
    eq(reg.instance('t').hello(), 'hi');
    eq(reg.instance('missing'), null);
});

test('onChange reports starts and stops', () => {
    const changes = [];
    const { reg, ctx, flags } = setup([{ id: 'a', setting: 'a' }], {}, { onChange: (id, on) => changes.push(`${id}:${on}`) });
    reg.start(ctx);
    flags.a = true;
    reg.refresh('a');
    reg.stop();
    eq(changes, ['a:true', 'a:false']);
});

// ---- lazy classes (load) ------------------------------------------------------------------

test('load(): not called while the entry is off; starts once the class arrives', () => {
    const log = [];
    let loads = 0;
    const { reg, ctx, flags } = setup([
        { id: 'lazy', setting: 'lazy', load: async () => { loads++; return logged(log, 'lazy'); } },
    ]);
    reg.start(ctx);
    settle(reg);
    eq(loads, 0);
    flags.lazy = true;
    reg.refresh('lazy');
    eq(reg.status('lazy'), 'loading');
    settle(reg);
    eq(log, ['+lazy']);
    eq(reg.status('lazy'), 'active');
    flags.lazy = false;
    reg.refresh('lazy');
    flags.lazy = true;
    reg.refresh('lazy');
    eq(loads, 1, 'loaded once');
    eq(log, ['+lazy', '-lazy', '+lazy']);
});

test('load(): starts keep registration order whatever order the classes arrive in', () => {
    const log = [];
    let releaseFirst;
    const gate = new Promise(r => (releaseFirst = r));
    const { reg, ctx } = setup([
        { id: 'first', load: async () => { await gate; return logged(log, 'first'); } },
        { id: 'second', load: async () => logged(log, 'second') },
        { id: 'eager' },
    ], {}, {}, log);
    reg.start(ctx);
    eq(reg.status('eager'), 'loading', 'waits behind first');
    releaseFirst();
    settle(reg);
    eq(log, ['+first', '+second', '+eager']);
});

test('load(): a failed load lets the losers back and reads as off', () => {
    const { reg, log, ctx } = setup([
        { id: 'loser' },
        { id: 'winner', conflictsWith: ['loser'], load: async () => { throw new Error('no module'); } },
    ]);
    reg.start(ctx);
    settle(reg);
    eq(reg.status('winner'), 'off');
    eq(log, ['+loser']);
});

test('load(): a load that resolves after stop() starts nothing', () => {
    const log = [];
    let release;
    const gate = new Promise(r => (release = r));
    const { reg, ctx } = setup([{ id: 'x', load: async () => { await gate; return logged(log, 'x'); } }]);
    reg.start(ctx);
    reg.stop();
    release();
    settle(reg);
    eq(log, []);
});

// ---- the real list ----------------------------------------------------------------------------

test('features.js: ids unique, every entry lazy, conflicts and needs name real ids', () => {
    const ids = FEATURES.map(f => f.id);
    eq(new Set(ids).size, ids.length);
    for (const f of FEATURES) {
        if (typeof f.load !== 'function')
            throw new Error(`${f.id} is not lazy`);
        for (const other of [...(f.conflictsWith ?? []), ...(f.needs ?? [])]) {
            if (!ids.includes(other))
                throw new Error(`${f.id} names unknown '${other}'`);
        }
    }
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
