// Run: gjs -m tests/dockColorsModel.test.js
import { resolveOriginals, parseSaved, staleRestores } from '../apps/dockColorsModel.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b) {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
const KIWI = { dot: ['K1', 'K2'], pill: ['P1', 'P2'] };

test('user changed key: current wins', () =>
    eq(resolveOriginals({ dot: 'mine', pill: 'P1' }, { dot: 'a', pill: 'b' }, KIWI), { dot: 'mine', pill: 'b' }));
test('stale Kiwi value: saved wins', () =>
    eq(resolveOriginals({ dot: 'K2', pill: 'P1' }, { dot: 'a', pill: 'b' }, KIWI), { dot: 'a', pill: 'b' }));
test('no record: current', () =>
    eq(resolveOriginals({ dot: 'K1' }, null, KIWI), { dot: 'K1' }));
test('parseSaved malformed / array / empty / null JSON', () => {
    eq(parseSaved('{oops'), null);
    eq(parseSaved('[1,2]'), null);
    eq(parseSaved(''), null);
    eq(parseSaved(undefined), null);
    eq(parseSaved('null'), null);
    eq(parseSaved('{}'), null);
});
test('parseSaved keeps strings only', () => eq(parseSaved('{"a":"x","b":3}'), { a: 'x' }));
test('feature-off restore: only keys still Kiwi-coloured', () =>
    eq(staleRestores({ dot: 'K1', pill: 'mine' }, { dot: 'a', pill: 'b' }, KIWI), { dot: 'a' }));
test('feature-off restore: nothing saved', () =>
    eq(staleRestores({ dot: 'K1' }, null, KIWI), {}));
test('feature-off restore: unknown saved key ignored', () =>
    eq(staleRestores({ dot: 'K1' }, { other: 'x' }, KIWI), {}));

if (failed)
    imports.system.exit(1);
