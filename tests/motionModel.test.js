// Run: gjs -m tests/motionModel.test.js
import { DURATIONS, CURVES, SPRINGS, REDUCED_MAX_MS, resolve, splitProps, springAt, springDuration, springKeyframes } from '../core/motionModel.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(c, msg) {
    if (!c)
        throw new Error(msg);
}
const ON = { reducedMotion: false, animations: true };

test('named durations and curves', () => {
    eq(resolve({ duration: 'short', curve: 'emphasized' }, ON), { duration: DURATIONS.short, mode: CURVES.emphasized, spring: null, transforms: true });
    eq(resolve({}, ON).duration, DURATIONS.medium);
    eq(resolve({ duration: 123 }, ON).duration, 123);
});
test('unknown names throw', () => {
    for (const bad of [{ duration: 'slowish' }, { curve: 'bouncy' }, { spring: 'wobbly' }]) {
        let threw = false;
        try { resolve(bad, ON); } catch (_e) { threw = true; }
        ok(threw, JSON.stringify(bad));
    }
});
test('animations off: everything at once', () => {
    eq(resolve({ duration: 'long', spring: 'bouncy' }, { reducedMotion: false, animations: false }),
        { duration: 0, mode: CURVES.linear, spring: null, transforms: false });
});
test('reduced motion: short crossfade, no transforms, no springs', () => {
    const r = resolve({ duration: 'extraLong', spring: 'bouncy' }, { reducedMotion: true, animations: true });
    eq(r.transforms, false);
    eq(r.spring, null);
    ok(r.duration <= REDUCED_MAX_MS, 'capped');
    eq(resolve({ duration: 'micro' }, { reducedMotion: true, animations: true }).duration, DURATIONS.micro);
});
test('splitProps moves transforms to jump only when asked', () => {
    eq(splitProps({ opacity: 255, scale_x: 1, translation_y: 0 }, false),
        { animate: { opacity: 255 }, jump: { scale_x: 1, translation_y: 0 } });
    eq(splitProps({ opacity: 0, x: 5 }, true), { animate: { opacity: 0, x: 5 }, jump: {} });
});
test('springs: start at 0, settle at 1; under-damped overshoots, critical does not', () => {
    for (const s of Object.values(SPRINGS)) {
        eq(springAt(s, 0), 0);
        ok(Math.abs(springAt(s, 5) - 1) < 1e-4, 'settles');
    }
    let peak = 0;
    for (let t = 0; t < 2; t += 0.005)
        peak = Math.max(peak, springAt(SPRINGS.bouncy, t));
    ok(peak > 1.02, `bouncy overshoots (${peak})`);
    let max = 0;
    for (let t = 0; t < 2; t += 0.005)
        max = Math.max(max, springAt(SPRINGS.smooth, t));
    ok(max <= 1 + 1e-9, 'smooth never overshoots');
});
test('spring durations are bounded and ordered by response', () => {
    const snappy = springDuration(SPRINGS.snappy);
    const bouncy = springDuration(SPRINGS.bouncy);
    ok(snappy > 100 && snappy < 1500, `snappy ${snappy}`);
    ok(bouncy > snappy, 'a slower spring takes longer');
    eq(resolve({ spring: 'snappy' }, ON).duration, snappy);
});
test('keyframes: evenly spaced, end exactly at the target', () => {
    const k = springKeyframes(SPRINGS.bouncy, 10);
    eq(k.keys.length, 10);
    eq(k.keys[0], 0);
    eq(k.keys[9], 1);
    eq(k.values[0], 0);
    eq(k.values[9], 1);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
