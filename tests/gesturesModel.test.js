// Run: gjs -m tests/gesturesModel.test.js
import {
    DEFAULT_CONFIG, DRAG_THRESHOLD, GestureTracker, PINCH_SWIPE_TRAVEL, SWIPE_DISTANCE, blocksStock,
    classify, ownsPinch, pinchIsSwipe, routeGesture,
} from '../features/gestures/model.js';
import { DESKTOP_ACTIONS } from '../core/desktopActionsModel.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b) {
    const ja = JSON.stringify(a), jb = JSON.stringify(b);
    if (ja !== jb)
        throw new Error(`expected ${jb}, got ${ja}`);
}

/** Feed a swipe or pinch in n equal steps; returns the tracker's finished sample. */
function run(kind, fingers, dx, dy, scale = 1, n = 10) {
    const t = new GestureTracker();
    t.begin(kind, fingers);
    for (let i = 1; i <= n; i++)
        t.update(dx / n, dy / n, 1 + (scale - 1) * i / n);
    return t.finish();
}
const DESK = { overview: false };

test('tracker picks the orientation once, at the drag threshold', () => {
    const t = new GestureTracker();
    t.begin('swipe', 3);
    eq(t.update(DRAG_THRESHOLD / 2, 0), null);
    eq(t.update(0, -DRAG_THRESHOLD), 'vertical');
    eq(t.update(100, 0), null);
    eq(t.orientation, 'vertical');
    t.reset();
    eq(t.active, false);
    eq(t.update(50, 0), null);
});

test('classify swipes (natural scrolling: fingers up is up)', () => {
    eq(classify(run('swipe', 4, 0, -200)), 'swipe-up');
    eq(classify(run('swipe', 4, 0, 200)), 'swipe-down');
    eq(classify(run('swipe', 3, -200, 10)), 'swipe-left');
    eq(classify(run('swipe', 3, 200, 10)), 'swipe-right');
    eq(classify(run('swipe', 4, 0, SWIPE_DISTANCE - 1)), null);
    eq(classify(run('swipe', 2, 0, 200)), null);
});

test('classify follows GNOME when natural scrolling is off', () => {
    eq(classify(run('swipe', 4, 0, 200), { naturalScroll: false }), 'swipe-up');
    eq(classify(run('swipe', 4, 0, -200), { naturalScroll: false }), 'swipe-down');
});

test('classify pinches', () => {
    eq(classify(run('pinch', 4, 0, 0, 0.5)), 'pinch-in');
    eq(classify(run('pinch', 4, 0, 0, 1.8)), 'spread-out');
    eq(classify(run('pinch', 4, 0, 0, 1.1)), null);
    eq(classify(run('pinch', 2, 0, 0, 0.5)), null);
});

test('routes: the macOS defaults', () => {
    const c = DEFAULT_CONFIG;
    eq(routeGesture('swipe-down', 4, c, DESK), 'app-expose');
    eq(routeGesture('swipe-down', 3, c, DESK), 'app-expose');
    eq(routeGesture('swipe-down', 2, c, DESK), null);
    eq(routeGesture('swipe-down', 4, c, { overview: true }), null);  // GNOME's closes it
    eq(routeGesture('pinch-in', 4, c, DESK), 'launchpad');
    eq(routeGesture('spread-out', 4, c, DESK), 'desktop');
    eq(routeGesture('swipe-up', 4, c, DESK), null);       // GNOME's
    eq(routeGesture('swipe-left', 3, c, DESK), null);     // GNOME's
    for (const a of ['app-expose', 'launchpad', 'desktop'])
        eq(DESKTOP_ACTIONS.includes(a), true);
});

test('routes: each Kiwi gesture can be turned off', () => {
    const off = { ...DEFAULT_CONFIG, appExpose: false, launchpad: false, showDesktop: false };
    eq(routeGesture('swipe-down', 4, off, DESK), null);
    eq(routeGesture('pinch-in', 4, off, DESK), null);
    eq(routeGesture('spread-out', 4, off, DESK), null);
    eq(ownsPinch(4, off), false);
    eq(ownsPinch(4, DEFAULT_CONFIG), true);
    eq(ownsPinch(2, DEFAULT_CONFIG), false);
});

test('GNOME swipes are held back only when turned off, only on the desktop', () => {
    const swipe = { kind: 'swipe', fingers: 3 };
    eq(blocksStock('vertical', swipe, DEFAULT_CONFIG, DESK), false);
    eq(blocksStock('horizontal', swipe, DEFAULT_CONFIG, DESK), false);
    const off = { ...DEFAULT_CONFIG, missionControl: false, spaces: false };
    eq(blocksStock('vertical', swipe, off, DESK), true);
    eq(blocksStock('horizontal', swipe, off, DESK), true);
    eq(blocksStock('vertical', swipe, off, { overview: true }), false);
    eq(blocksStock('vertical', { kind: 'pinch', fingers: 4 }, off, DESK), false);
    eq(blocksStock(null, swipe, off, DESK), false);
});

test('a swipe down on the desktop never reaches GNOME\'s overview tracker', () => {
    const up = { kind: 'swipe', fingers: 3, dy: -20 };
    const down = { kind: 'swipe', fingers: 4, dy: 20 };
    eq(blocksStock('vertical', up, DEFAULT_CONFIG, DESK), false);
    eq(blocksStock('vertical', down, DEFAULT_CONFIG, DESK), true);
    // Without natural scrolling the directions flip, as in classify()
    eq(blocksStock('vertical', up, DEFAULT_CONFIG, { overview: false, naturalScroll: false }), true);
    eq(blocksStock('vertical', down, DEFAULT_CONFIG, { overview: false, naturalScroll: false }), false);
    // In Mission Control a swipe down closes it (GNOME's)
    eq(blocksStock('vertical', down, DEFAULT_CONFIG, { overview: true }), false);
});

test('a swipe libinput took for a pinch is a swipe, a real pinch stays a pinch', () => {
    // Fingers closing as they swipe up: the centre moves far, the scale drops
    eq(classify(run('pinch', 4, 0, -300, 0.7)), 'swipe-up');
    eq(classify(run('pinch', 3, 10, -250, 0.6)), 'swipe-up');
    eq(classify(run('pinch', 4, 0, 300, 0.8)), 'swipe-down');
    eq(classify(run('pinch', 4, -280, 20, 1.2)), 'swipe-left');
    eq(classify(run('pinch', 4, 0, 300, 0.7), { naturalScroll: false }), 'swipe-up');
    // Thumb and three fingers: the centre hardly moves
    eq(classify(run('pinch', 4, 0, -30, 0.5)), 'pinch-in');
    eq(classify(run('pinch', 4, 15, 20, 1.6)), 'spread-out');
    // Moving a little while pinching hard is still a pinch
    eq(classify(run('pinch', 4, 0, -PINCH_SWIPE_TRAVEL, 0.45)), 'pinch-in');
    eq(pinchIsSwipe({ dx: 0, dy: -PINCH_SWIPE_TRAVEL + 1, scale: 1 }), false);
    eq(pinchIsSwipe({ dx: 0, dy: -PINCH_SWIPE_TRAVEL, scale: 1 }), true);
});

test('a swipe up only ever opens Mission Control, never Launchpad', () => {
    const c = DEFAULT_CONFIG;
    for (const fingers of [3, 4]) {
        for (const scale of [0.3, 0.5, 0.7, 0.75, 1]) {
            const g = classify(run('pinch', fingers, 0, -400, scale));
            eq(g, 'swipe-up', `scale ${scale}`);
            eq(routeGesture(g, fingers, c, { overview: false, stock: false }), 'mission-control');
            eq(routeGesture(g, fingers, c, { overview: true, stock: false }), null, 'stays in Mission Control');
        }
        const g = classify(run('swipe', fingers, 0, -400));
        eq(routeGesture(g, fingers, c, DESK), null, 'GNOME\'s tracker opens it');
        eq(routeGesture(g, fingers, c, { overview: true }), null);
    }
});

test('a swipe that came as a pinch does what GNOME\'s swipe would', () => {
    const c = DEFAULT_CONFIG;
    const asPinch = overview => ({ overview, stock: false });
    eq(routeGesture('swipe-down', 4, c, asPinch(true)), 'close-overview');
    eq(routeGesture('swipe-down', 3, c, asPinch(false)), 'app-expose');
    eq(routeGesture('swipe-left', 4, c, asPinch(false)), 'space-next');
    eq(routeGesture('swipe-right', 3, c, asPinch(true)), 'space-previous');
    const off = { ...c, missionControl: false, spaces: false };
    eq(routeGesture('swipe-up', 4, off, asPinch(false)), null);
    eq(routeGesture('swipe-down', 4, off, asPinch(true)), null);
    eq(routeGesture('swipe-left', 4, off, asPinch(false)), null);
    eq(DESKTOP_ACTIONS.includes('mission-control'), true);
});

if (failed) {
    print(`${failed} test(s) failed`);
    imports.system.exit(1);
}
