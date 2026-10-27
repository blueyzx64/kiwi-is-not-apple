// Run: gjs -m tests/layoutModel.test.js
import { LayoutModel } from '../core/layoutModel.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
const MON = { x: 0, y: 0, width: 1280, height: 800 };
const rect = (x, y, width, height) => ({ x, y, width, height });

test('the menu bar strut, as Mutter already applied it', () => {
    const m = new LayoutModel();
    m.claim({ id: 'menu-bar', edge: 'top', size: 32, reserve: 'strut', order: -100 });
    const { workArea, rects } = m.compute(0, MON, { base: rect(0, 32, 1280, 768) });
    eq(rects.get('menu-bar'), rect(0, 0, 1280, 32));
    eq(workArea, rect(0, 32, 1280, 768));
});
test('without a Mutter area the struts are taken off too', () => {
    const m = new LayoutModel();
    m.claim({ id: 'menu-bar', edge: 'top', size: 32, reserve: 'strut' });
    m.claim({ id: 'dock', edge: 'bottom', size: 70, reserve: 'strut' });
    eq(m.compute(0, MON, { strutsApplied: false }).workArea, rect(0, 32, 1280, 698));
});
test('a soft claim (the Stage Manager strip) shrinks the work area for Kiwi only', () => {
    const m = new LayoutModel();
    m.claim({ id: 'menu-bar', edge: 'top', size: 32, reserve: 'strut' });
    m.claim({ id: 'stage-strip', edge: 'left', size: 180, reserve: 'soft' });
    const base = rect(0, 32, 1280, 768);
    const { workArea, rects } = m.compute(0, MON, { base });
    eq(workArea, rect(180, 32, 1100, 768));
    eq(rects.get('stage-strip'), rect(0, 0, 180, 800));
});
test('claims on one edge stack outward to inward by order', () => {
    const m = new LayoutModel();
    m.claim({ id: 'inner', edge: 'bottom', size: 20, order: 1, reserve: 'soft' });
    m.claim({ id: 'dock', edge: 'bottom', size: 70, order: 0, reserve: 'soft' });
    const { workArea, rects } = m.compute(0, MON);
    eq(rects.get('dock'), rect(0, 730, 1280, 70));
    eq(rects.get('inner'), rect(0, 710, 1280, 20));
    eq(workArea.height, 710);
});
test('the notch sits inside the menu bar without pushing, centred with its length', () => {
    const m = new LayoutModel();
    m.claim({ id: 'menu-bar', edge: 'top', size: 32, reserve: 'strut', order: -100 });
    m.claim({ id: 'notch', edge: 'top', size: 32, stack: false, length: 200 });
    m.claim({ id: 'below', edge: 'top', size: 10, reserve: 'soft' });
    const { rects, workArea } = m.compute(0, MON, { base: rect(0, 32, 1280, 768) });
    eq(rects.get('notch'), rect(540, 0, 200, 32));
    eq(rects.get('below'), rect(0, 32, 1280, 10), 'stacks under the menu bar, not the notch');
    eq(workArea.y, 42);
});
test('align start/end along the edge; length capped to the edge', () => {
    const m = new LayoutModel();
    m.claim({ id: 'a', edge: 'right', size: 50, length: 300, align: 'start' });
    m.claim({ id: 'b', edge: 'left', size: 50, length: 9999, align: 'end' });
    const { rects } = m.compute(0, MON);
    eq(rects.get('a'), rect(1230, 0, 50, 300));
    eq(rects.get('b'), rect(0, 0, 50, 800));
});
test('monitors: primary, all, or an index; offsets follow the monitor origin', () => {
    const m = new LayoutModel();
    m.claim({ id: 'p', edge: 'top', size: 10, reserve: 'soft' });
    m.claim({ id: 'all', edge: 'bottom', size: 5, monitor: 'all', reserve: 'soft' });
    m.claim({ id: 'two', edge: 'left', size: 7, monitor: 1, reserve: 'soft' });
    const second = { x: 1280, y: 0, width: 1000, height: 600 };
    const r0 = m.compute(0, MON, { primary: 0 });
    const r1 = m.compute(1, second, { primary: 0 });
    eq([...r0.rects.keys()].sort(), ['all', 'p']);
    eq([...r1.rects.keys()].sort(), ['all', 'two']);
    eq(r1.workArea, rect(1287, 0, 993, 595));
});
test('update keeps registration order; release frees the edge; bad specs throw', () => {
    const m = new LayoutModel();
    m.claim({ id: 'a', edge: 'top', size: 10, reserve: 'soft' });
    m.claim({ id: 'b', edge: 'top', size: 10, reserve: 'soft' });
    m.update('a', { size: 20 });
    eq(m.compute(0, MON).rects.get('b').y, 20);
    eq(m.release('a'), true);
    eq(m.compute(0, MON).rects.get('b').y, 0);
    eq(m.update('zzz', { size: 1 }), null);
    let threw = 0;
    for (const bad of [{ edge: 'top' }, { id: 'x', edge: 'middle' }, { id: 'x', edge: 'top', reserve: 'hard' }]) {
        try { m.claim(bad); } catch (_e) { threw++; }
    }
    eq(threw, 3);
});
test('a base smaller than the claims wins (another client strut is respected)', () => {
    const m = new LayoutModel();
    m.claim({ id: 'strip', edge: 'left', size: 100, reserve: 'soft' });
    eq(m.compute(0, MON, { base: rect(200, 0, 1080, 800) }).workArea, rect(200, 0, 1080, 800));
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
