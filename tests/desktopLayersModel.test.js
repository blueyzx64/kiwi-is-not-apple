// Run: gjs -m tests/desktopLayersModel.test.js
import { ReserveStore, mirrorRect, overlapsMonitor, stackOrder } from '../core/desktopLayersModel.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

test('layers stack by rank, then by the order they were added', () => {
    const layers = [{ id: 'w1', rank: 20 }, { id: 'i', rank: 10 }, { id: 'w2', rank: 20 }];
    eq(stackOrder(layers).map(l => l.id), ['i', 'w1', 'w2']);
    eq(stackOrder([]), []);
});

test('reserved rectangles: each owner replaces its own, others see them', () => {
    const s = new ReserveStore();
    const r = { x: 1, y: 2, width: 3, height: 4 };
    eq(s.set('widgets', [r]), true);
    eq(s.set('widgets', [{ ...r }]), false, 'the same rectangles are no change');
    eq(s.all('icons'), [r]);
    eq(s.all('widgets'), []);
    eq(s.set('other', [{ x: 9, y: 9, width: 1, height: 1 }]), true);
    eq(s.all('icons').length, 2);
    eq(s.set('widgets', []), true);
    eq(s.all('icons').length, 1);
});

test('a layer belongs to the monitors it overlaps', () => {
    const left = { x: 0, y: 0, width: 1920, height: 1080 };
    const right = { x: 1920, y: 0, width: 1280, height: 800 };
    eq(overlapsMonitor({ ...left }, left), true);
    eq(overlapsMonitor({ ...left }, right), false, 'touching edges do not overlap');
    eq(overlapsMonitor({ ...right }, right), true);
    eq(overlapsMonitor({ x: 1900, y: 10, width: 100, height: 10 }, right), true);
});

test('a mirrored layer keeps its place on the monitor, scaled with the card', () => {
    const m = { x: 1920, y: 0 };
    eq(mirrorRect({ x: 1920, y: 0, width: 1280, height: 800 }, m, 1, 1), { x: 0, y: 0, width: 1280, height: 800 });
    eq(mirrorRect({ x: 1920, y: 0, width: 1280, height: 800 }, m, 0.5, 0.5), { x: 0, y: 0, width: 640, height: 400 });
    eq(mirrorRect({ x: 2020, y: 100, width: 200, height: 100 }, m, 0.5, 0.25), { x: 50, y: 25, width: 100, height: 25 });
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
