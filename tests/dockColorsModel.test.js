// Run: gjs -m tests/dockColorsModel.test.js
import { captureOriginals, parseSaved, restorePlan } from '../apps/dockColorsModel.js';
import { unpinPlan } from '../apps/launchpadModel.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b) {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
const KIWI = { dot: ['K1', 'K2'], pill: ['P1', 'P2'] };
const anyKiwi = (k, v) => KIWI[k].includes(v);
const U = (value, user = true) => ({ value, user });

// captureOriginals
test('capture: records default vs user value', () =>
    eq(captureOriginals({ dot: 'd', pill: 'u' }, { dot: false, pill: true }, null, KIWI),
        { dot: U('d', false), pill: U('u') }));
test('capture: crash leftover (Kiwi colour, user-set) takes the record', () =>
    eq(captureOriginals({ dot: 'K2', pill: 'P1' }, { dot: true, pill: true },
        { dot: U('a', false), pill: U('b') }, KIWI), { dot: U('a', false), pill: U('b') }));
test('capture: user changed key since crash: current wins', () =>
    eq(captureOriginals({ dot: 'mine', pill: 'P1' }, { dot: true, pill: true },
        { dot: U('a'), pill: U('b') }, KIWI), { dot: U('mine'), pill: U('b') }));
test('capture: key reset to default since crash: record ignored', () =>
    eq(captureOriginals({ dot: 'K1' }, { dot: false }, { dot: U('a') }, KIWI), { dot: U('K1', false) }));

// restorePlan
test('restore: was default -> reset', () =>
    eq(restorePlan({ dot: 'K1' }, { dot: true }, { dot: U('d', false) }, anyKiwi), { dot: { action: 'reset' } }));
test('restore: was user value -> set', () =>
    eq(restorePlan({ dot: 'K1' }, { dot: true }, { dot: U('u') }, anyKiwi), { dot: { action: 'set', value: 'u' } }));
test('restore: user changed it while Kiwi ran -> leave', () =>
    eq(restorePlan({ dot: 'mine' }, { dot: true }, { dot: U('u') }, anyKiwi), {}));
test('restore: exact-written check (other Kiwi colour = user choice) -> leave', () =>
    eq(restorePlan({ dot: 'K2' }, { dot: true }, { dot: U('u') }, (k, v) => v === 'K1'), {}));
test('restore: user reset the key meanwhile -> leave', () =>
    eq(restorePlan({ dot: 'K1' }, { dot: false }, { dot: U('u') }, anyKiwi), {}));
test('restore: same value already -> nothing', () =>
    eq(restorePlan({ dot: 'K1' }, { dot: true }, { dot: U('K1') }, anyKiwi), {}));
test('restore: no record / unknown key -> nothing', () => {
    eq(restorePlan({ dot: 'K1' }, { dot: true }, null, anyKiwi), {});
    eq(restorePlan({ dot: 'K1' }, { dot: true }, { other: U('x') }, anyKiwi), {});
});
test('feature-off restore after crash', () =>
    eq(restorePlan({ dot: 'K1', pill: 'mine' }, { dot: true, pill: true },
        { dot: U('a', false), pill: U('b') }, anyKiwi), { dot: { action: 'reset' } }));

// parseSaved
test('parseSaved malformed / array / empty / null JSON', () => {
    for (const t of ['{oops', '[1,2]', '', undefined, 'null', '{}', '{"a":3}'])
        eq(parseSaved(t), null);
});
test('parseSaved new and legacy forms', () => {
    eq(parseSaved('{"a":{"value":"x","user":false},"b":"y","c":{"value":1}}'),
        { a: U('x', false), b: U('y') });
});

// unpinPlan (launchpadApp favorite-apps)
const DEF = ['a.desktop', 'b.desktop'];
const KID = ['kiwi.desktop', 'old.desktop'];
test('unpin: default before and after -> reset', () =>
    eq(unpinPlan(['a.desktop', 'kiwi.desktop', 'b.desktop'], KID, DEF, true), { action: 'reset' }));
test('unpin: user edited list -> set without Kiwi ids only', () =>
    eq(unpinPlan(['a.desktop', 'kiwi.desktop', 'c.desktop'], KID, DEF, true),
        { action: 'set', value: ['a.desktop', 'c.desktop'] }));
test('unpin: was user-set, equals default -> set (not reset)', () =>
    eq(unpinPlan(['a.desktop', 'old.desktop', 'b.desktop'], KID, DEF, false),
        { action: 'set', value: DEF }));
test('unpin: nothing of ours -> keep', () =>
    eq(unpinPlan(['c.desktop'], KID, DEF, false), { action: 'keep' }));

if (failed)
    imports.system.exit(1);
