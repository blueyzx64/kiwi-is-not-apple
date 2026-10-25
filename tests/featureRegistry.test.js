// Run: gjs -m tests/featureRegistry.test.js
import { FeatureRegistry } from '../lib/featureRegistry.js';
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
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function setup(entries, flags = {}) {
    const log = [];
    const ctx = { settings: { get_boolean: k => !!flags[k] }, flags };
    const reg = new FeatureRegistry(CleanupRegistry);
    for (const e of entries) {
        reg.register({
            enable: () => log.push(`+${e.id}`),
            disable: () => log.push(`-${e.id}`),
            ...e,
        });
    }
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

test('reapply (legacy): enable/disable on every refresh', () => {
    const { reg, log, ctx, flags } = setup([{ id: 'a', setting: 'a', reapply: true }]);
    reg.start(ctx);
    reg.refresh('x');
    flags.a = true;
    reg.refresh('x');
    reg.refresh('x');
    eq(log, ['-a', '-a', '+a', '+a']);
});

test('registration order on refresh, reverse on stop', () => {
    const { reg, log, ctx } = setup([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    reg.start(ctx);
    reg.stop();
    eq(log, ['+a', '+b', '+c', '-c', '-b', '-a']);
});

test('restartOn disables first then re-enables', () => {
    const { reg, log, ctx } = setup([{ id: 'a', restartOn: ['k'] }]);
    reg.start(ctx);
    reg.refresh('k');
    eq(log, ['+a', '-a', '+a']);
});

test('restartOn with reapply: disable, then enable once', () => {
    const { reg, log, ctx } = setup([{ id: 'a', restartOn: ['k'], reapply: true }]);
    reg.start(ctx);
    log.length = 0;
    reg.refresh('k');
    eq(log, ['-a', '+a']);
});

test('startOnly runs at start, not on refresh, and stops', () => {
    const { reg, log, ctx } = setup([{ id: 'g', startOnly: true, reapply: true }]);
    reg.start(ctx);
    reg.refresh('x');
    reg.stop();
    eq(log, ['+g', '-g']);
});

test('needs holds feature off until dependency wanted', () => {
    const { reg, log, ctx, flags } = setup([
        { id: 'dock', setting: 'dock' },
        { id: 'blur', setting: 'blur', needs: ['dock'] },
    ], { blur: true });
    reg.start(ctx);
    eq(log, []);
    eq(reg.status('blur'), 'paused');
    flags.dock = true;
    reg.refresh('dock');
    eq(log, ['+dock', '+blur']);
});

test('conflictsWith: winner pauses loser without touching its setting', () => {
    const { reg, log, ctx, flags } = setup([
        { id: 'min', setting: 'min' },
        { id: 'stage', setting: 'stage', conflictsWith: ['min'] },
    ], { min: true });
    reg.start(ctx);
    eq(log, ['+min']);
    flags.stage = true;
    reg.refresh('stage');
    eq(log, ['+min', '-min', '+stage']);
    eq(reg.status('min'), 'paused');
    eq(flags.min, true);
    flags.stage = false;
    reg.refresh('stage');
    eq(log, ['+min', '-min', '+stage', '-stage', '+min']);
});

test('apply() re-evaluates one entry', () => {
    const { reg, log, ctx, flags } = setup([{ id: 'a', setting: 'a' }, { id: 'b', setting: 'b' }]);
    reg.start(ctx);
    flags.a = true;
    flags.b = true;
    reg.apply('a');
    eq(log, ['+a']);
});

test('apply() does not enable startOnly entries', () => {
    const { reg, log, ctx } = setup([{ id: 'g', startOnly: true }]);
    reg.apply('g');
    eq(log, []);
    reg.start(ctx);
    reg.apply('g');
    eq(log, ['+g']);
});

test('class entries: construct, enable, disable; cleanup disposed', () => {
    const log = [];
    let cleanupSeen = null;
    class F {
        constructor(ctx, cleanup) { cleanupSeen = cleanup; this.cleanup = cleanup; }
        enable() { log.push('on'); this.cleanup.add(() => log.push('cleanup')); }
        disable() { log.push('off'); }
    }
    const reg = new FeatureRegistry(CleanupRegistry);
    reg.register({ id: 'f', cls: F });
    reg.start({ settings: {} });
    reg.stop();
    eq(log, ['on', 'off', 'cleanup']);
    if (!cleanupSeen)
        throw new Error('no cleanup passed');
});

test('throwing enable does not stop others and leaves entry inactive', () => {
    const { reg, log, ctx } = setup([
        { id: 'bad', enable() { throw new Error('x'); } },
        { id: 'ok' },
    ]);
    reg.start(ctx);
    eq(log.includes('+ok'), true);
    eq(reg.isActive('bad'), false);
});

test('duplicate id and missing enable are rejected', () => {
    const reg = new FeatureRegistry(CleanupRegistry);
    reg.register({ id: 'a', enable() {} });
    let threw = 0;
    try { reg.register({ id: 'a', enable() {} }); } catch (_e) { threw++; }
    try { reg.register({ id: 'b' }); } catch (_e) { threw++; }
    eq(threw, 2);
});

test('V1: a winner that fails to enable does not pause its losers', () => {
    const flags = { sm: true };
    const ctx = { settings: { get_boolean: k => !!flags[k] } };
    const reg = new FeatureRegistry(CleanupRegistry);
    let mtd = 0;
    let tries = 0;
    reg.registerAll([
        { id: 'mtd', reapply: true, when: () => true, enable() { mtd = 1; }, disable() { mtd = 0; } },
        {
            id: 'sm', setting: 'sm', conflictsWith: ['mtd'],
            cls: class { enable() { tries++; throw new Error('boom'); } disable() {} },
        },
    ]);
    reg.start(ctx);
    eq(reg.isActive('sm'), false);
    eq(mtd, 1, 'loser resumed');
    eq(reg.status('mtd'), 'active');
    eq(reg.status('sm'), 'off');
    reg.refresh('unrelated');
    reg.refresh('other');
    eq(tries, 1, 'not retried on unrelated keys');
    eq(mtd, 1);
});

test('failed entry retried on its own key, and after off -> on', () => {
    const flags = { a: true };
    const ctx = { settings: { get_boolean: k => !!flags[k] } };
    const reg = new FeatureRegistry(CleanupRegistry);
    let tries = 0;
    let broken = true;
    reg.register({ id: 'a', setting: 'a', keys: ['a-extra'], enable() { tries++; if (broken) throw new Error('x'); }, disable() {} });
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

test('needs on a failed entry holds the dependent off', () => {
    const ctx = { settings: { get_boolean: () => true } };
    const reg = new FeatureRegistry(CleanupRegistry);
    const log = [];
    reg.register({ id: 'base', enable() { throw new Error('x'); }, disable() {} });
    reg.register({ id: 'dep', needs: ['base'], enable() { log.push('+dep'); }, disable() { log.push('-dep'); } });
    reg.start(ctx);
    eq(log, []);
    eq(reg.isActive('dep'), false);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
