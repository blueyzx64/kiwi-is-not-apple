// Run: gjs -m tests/dragHelperModel.test.js
// lib/dragHelperModel.js: talking to the drag-out helper (notch shelf, dock stacks).
import { DROP, HELPER, CLEAR_LINE, dropPlan, isHelperWindow, layoutOf, parseEvent, pointerOnNotch, dragIconName } from '../lib/dragHelperModel.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

test('the helper window is matched by class and title together', () => {
    eq(isHelperWindow(HELPER.appId, HELPER.title), true);
    eq(isHelperWindow(HELPER.appId, 'Other'), false);
    eq(isHelperWindow('org.gnome.Nautilus', HELPER.title), false);
    eq(isHelperWindow(null, null), false);
});

test('layout: item boxes are relative to the window, whole pixels', () => {
    const { box, line } = layoutOf({ x: 100.4, y: 80.6, w: 300.2, h: 90 }, [
        { uri: 'file:///a', icon: 'text-x-generic', x: 100.4, y: 80.6, w: 70, h: 80 },
        { uri: 'file:///b', icon: '', x: 178.4, y: 80.6, w: 70, h: 80 },
    ]);
    eq(box, { x: 100, y: 81, w: 300, h: 90 });
    eq(JSON.parse(line), {
        type: 'layout', w: 300, h: 90, items: [
            { uri: 'file:///a', icon: 'text-x-generic', x: 0, y: 0, w: 70, h: 80 },
            { uri: 'file:///b', icon: '', x: 78, y: 0, w: 70, h: 80 },
        ],
    });
});

test('layout: never a zero-sized box', () => {
    const { box } = layoutOf({ x: 0, y: 0, w: 0, h: 0 }, []);
    eq([box.w, box.h], [1, 1]);
    eq(JSON.parse(CLEAR_LINE).items, []);
});

test('events: known ones parse, anything else is null', () => {
    eq(parseEvent('{"event":"click","uri":"file:///a"}'), { event: 'click', uri: 'file:///a' });
    eq(parseEvent('{"event":"drag","state":"begin","uri":"file:///a","ok":true}'), { event: 'drag', state: 'begin', uri: 'file:///a', ok: true });
    eq(parseEvent('{"event":"drag","state":"end","uri":"file:///a","ok":false}').ok, false);
    eq(parseEvent('{"event":"hover","value":true}'), { event: 'hover', value: true });
    eq(parseEvent('{"event":"ready"}'), { event: 'ready' });
    eq(parseEvent('{"event":"drag","state":"x","uri":"u"}'), null);
    eq(parseEvent('{"event":"hover","value":"yes"}'), null);
    eq(parseEvent('not json'), null);
    eq(parseEvent('null'), null);
});

test('the pointer counts as on the notch during a drag', () => {
    eq(pointerOnNotch({ helper: false, dragging: false }), false);
    eq(pointerOnNotch({ helper: true, dragging: false }), true);
    eq(pointerOnNotch({ helper: false, dragging: true }), true);
});

test('drag icon: first themed name, else empty', () => {
    eq(dragIconName({ get_names: () => ['text-x-generic', 'text-x'] }), 'text-x-generic');
    eq(dragIconName({}), '');
    eq(dragIconName(null), '');
});

const MON = { x: 0, y: 0, width: 1920, height: 1080 };
const inside = (b, [x, y]) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

test('drop plan: press on the helper beside the drop point, path ends on the point', () => {
    const p = dropPlan({ x: 700, y: 400 }, MON);
    eq(p.box, { x: 728, y: 388, w: DROP.size, h: DROP.size });
    eq(inside(p.box, p.press), true, 'press on the helper');
    eq(p.path.length, DROP.steps);
    eq(p.path[p.path.length - 1], [700, 400]);
    // The drop point itself is not under the helper: the drop goes to what lies there
    eq(inside(p.box, [700, 400]), false);
    // Past GTK's drag threshold before the end
    const [x0, y0] = p.press;
    const [x1, y1] = p.path[1];
    eq(Math.hypot(x1 - x0, y1 - y0) > 8, true);
});

test('drop plan: at the right edge the helper goes left; it stays on the monitor', () => {
    const p = dropPlan({ x: 1915, y: 1078 }, MON);
    eq(p.box.x + p.box.w <= 1920 && p.box.y + p.box.h <= 1080, true, 'on the monitor');
    eq(p.box.x < 1915, true, 'to the left');
    eq(inside(p.box, [1915, 1078]), false);
    const second = dropPlan({ x: 20, y: 5 }, { x: 1920, y: 0, width: 1280, height: 1024 });
    eq(second.box.x >= 1920 && second.box.y >= 0, true, 'second monitor');
});

if (failed)
    throw new Error(`${failed} test(s) failed`);
