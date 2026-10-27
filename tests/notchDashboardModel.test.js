// Run: gjs -m tests/notchDashboardModel.test.js
import {
    dashboardLayout, cardSize, formatTrackTime, trackProgress, seekTarget, formatClock, moreCount, spring, GRID,
} from '../features/notch/dashboardModel.js';

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
function eq(a, b) {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(v, msg) {
    if (!v)
        throw new Error(msg ?? 'expected true');
}

test('track times: m:ss, h:mm:ss, unknown', () => {
    eq(formatTrackTime(0), '0:00');
    eq(formatTrackTime(5_400_000), '0:05');
    eq(formatTrackTime(83_999_999), '1:23');
    eq(formatTrackTime(3_725_000_000), '1:02:05');
    eq(formatTrackTime(NaN), '');
    eq(formatTrackTime(-1), '');
    eq(formatTrackTime(null), '');
});

test('progress needs a length and a position', () => {
    eq(trackProgress(null, 200e6), null);
    eq(trackProgress(10e6, null), null);
    eq(trackProgress(10e6, 0), null);
    eq(trackProgress(50e6, 200e6), { fraction: 0.25, elapsed: '0:50', remaining: '-2:30' });
});

test('progress clamps a position past the end', () => {
    eq(trackProgress(300e6, 200e6), { fraction: 1, elapsed: '3:20', remaining: '-0:00' });
});

test('clock: 24h pads the hour, 12h has a suffix and no 0', () => {
    eq(formatClock(7, 5, '24h'), { time: '07:05', suffix: '' });
    eq(formatClock(0, 0, '12h'), { time: '12:00', suffix: 'AM' });
    eq(formatClock(12, 30, '12h'), { time: '12:30', suffix: 'PM' });
    eq(formatClock(23, 9, '12h'), { time: '11:09', suffix: 'PM' });
});

test('more count', () => {
    eq(moreCount(6, 2), 4);
    eq(moreCount(2, 2), 0);
    eq(moreCount(undefined, 0), 0);
});

test('layout: media is the hero, the list beside it', () => {
    const l = dashboardLayout({ media: true, rows: 2, more: true, clipboard: false });
    eq(l.mode, 'media');
    eq(l.columns, ['media', 'list']);
    eq(l.size.w, l.widths.media + l.widths.list + GRID.gap + 2 * GRID.pad);
    eq(l.size.r, GRID.radius);
});

test('layout: no media shows the clock and is narrower and shorter', () => {
    const m = dashboardLayout({ media: true, rows: 2, more: true, clipboard: false });
    const c = dashboardLayout({ media: false, rows: 2, more: true, clipboard: false });
    eq(c.mode, 'clock');
    eq(c.columns, ['clock', 'list']);
    ok(c.size.w < m.size.w, 'narrower');
    ok(c.size.h < m.size.h, 'shorter');
});

test('layout: the list grows the height only past the hero', () => {
    const a = dashboardLayout({ media: true, rows: 0, more: false, clipboard: false });
    const b = dashboardLayout({ media: true, rows: 2, more: true, clipboard: false });
    eq(a.size.h, b.size.h);
    const c0 = dashboardLayout({ media: false, rows: 0, more: false, clipboard: false });
    const c2 = dashboardLayout({ media: false, rows: 2, more: true, clipboard: false });
    ok(c2.size.h > c0.size.h, 'two rows and a more line are taller than the clock');
});

test('layout: the clipboard adds a column and width', () => {
    const a = dashboardLayout({ media: true, rows: 2, more: false, clipboard: false });
    const b = dashboardLayout({ media: true, rows: 2, more: false, clipboard: true, clipRows: 3 });
    eq(b.columns, ['media', 'list', 'clipboard']);
    eq(b.size.w, a.size.w + b.widths.clipboard + GRID.gap);
});

test('layout: sizes sit on the 4px grid', () => {
    for (const media of [true, false]) {
        for (const rows of [0, 1, 2]) {
            const { size } = dashboardLayout({ media, rows, more: rows > 1, clipboard: false });
            ok(size.w % 4 === 0 && size.h % 4 === 0, `${size.w}x${size.h}`);
        }
    }
});

test('spring: starts at 0, overshoots a little when bouncy, settles at 1', () => {
    eq(spring(0), 0);
    const p = { bounce: 0.18, response: 0.42 };
    let peak = 0;
    for (let t = 0; t <= 0.72; t += 0.005)
        peak = Math.max(peak, spring(t, p));
    ok(peak > 1 && peak < 1.06, `peak ${peak}`);
    ok(Math.abs(spring(0.72, p) - 1) < 0.01, 'settled');
});

test('spring: no bounce never overshoots', () => {
    const p = { bounce: 0, response: 0.3 };
    for (let t = 0; t <= 0.4; t += 0.005)
        ok(spring(t, p) <= 1, `t ${t}`);
    ok(spring(0.4, p) > 0.99, 'settled');
});

test('card: taller only with actions', () => {
    eq(cardSize({ actions: false }).h < cardSize({ actions: true }).h, true);
    eq(cardSize({ actions: true }).w, cardSize({ actions: false }).w);
});

test('seekTarget: clamps the fraction, needs a length', () => {
    eq(seekTarget(0.5, 200e6), 100e6);
    eq(seekTarget(-0.2, 200e6), 0);
    eq(seekTarget(1.7, 200e6), 200e6);
    eq(seekTarget(0.333, 34_000_000), 11_322_000);
    eq(seekTarget(0.5, null), null);
    eq(seekTarget(0.5, 0), null);
    eq(seekTarget(NaN, 200e6), null);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
