// Run: gjs -m tests/stageManagerModel.test.js
import {
    DEFAULTS, overlaps, thumbFit, cropThumb, stackLayers, cardTilt, fitCount, stripLayout,
    pointRect, clonePose, balancedFit, edgeZone, stageArea, fitToStage, centerOnStage, stripShown, StageModel, focusRoot, isExempt, edgeBarrier,
    dropZone, dropZoneRect, tileOrder, tilePlan, settleTiles, scaleMs, workspaceDirection, isClick,
} from '../features/stageManager/model.js';

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
function near(a, b, eps = 1e-6) {
    if (Math.abs(a - b) > eps)
        throw new Error(`expected ${b}, got ${a}`);
}
const ids = stages => stages.map(s => s.id);

// ---- rects ----
test('overlaps true', () => eq(overlaps({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }), true));
test('overlaps touching edge is false', () =>
    eq(overlaps({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 5, height: 5 }), false));
test('overlaps apart', () => eq(overlaps({ x: 0, y: 0, width: 4, height: 4 }, { x: 9, y: 9, width: 4, height: 4 }), false));

// ---- thumbnails ----
test('thumbFit wide window fits width', () => {
    const f = thumbFit(1800, 600, 180, 116);
    near(f.scale, 0.1);
    near(f.width, 180);
    near(f.height, 60);
    near(f.y, 28);
    near(f.x, 0);
});
test('thumbFit tall window fits height', () => {
    const f = thumbFit(500, 1160, 180, 116);
    near(f.scale, 0.1);
    near(f.height, 116);
    near(f.width, 50);
    near(f.x, 65);
});
test('thumbFit never upscales', () => eq(thumbFit(90, 58, 180, 116).scale, 1));
test('thumbFit degenerate sizes', () => eq(thumbFit(0, 100, 180, 116).scale, 0));
test('cropThumb offsets the clone by the shadow margin', () => {
    const frame = { x: 100, y: 100, width: 1800, height: 1160 };
    const buffer = { x: 80, y: 90, width: 1840, height: 1200 };
    const c = cropThumb(frame, buffer, 180, 116);
    near(c.scale, 0.1);
    near(c.cloneX, -2);
    near(c.cloneY, -1);
    near(c.cloneW, 184);
    near(c.cloneH, 120);
    near(c.width, 180);
    near(c.height, 116);
});
test('cropThumb with no shadow has zero offsets', () => {
    const r = { x: 0, y: 0, width: 360, height: 232 };
    const c = cropThumb(r, r, 180, 116);
    near(c.cloneX, 0);
    near(c.cloneW, 180);
});
test('stackLayers one window', () => eq(stackLayers(1).length, 1));
test('stackLayers caps at 3', () => eq(stackLayers(9).length, 3));
test('stackLayers none', () => eq(stackLayers(0), []));
test('stackLayers front layer is untouched', () => {
    const [front] = stackLayers(3, 'left');
    eq([front.dx, front.dy, front.scale, front.opacity], [0, 0, 1, 255]);
});
test('stackLayers peek direction follows side', () => {
    eq(stackLayers(2, 'left')[1].dx < 0, true);
    eq(stackLayers(2, 'right')[1].dx > 0, true);
});
test('stackLayers shrink and fade', () => {
    const l = stackLayers(3);
    eq(l[1].scale < l[0].scale && l[2].scale < l[1].scale, true);
    eq(l[2].opacity < l[1].opacity, true);
});
test('cardTilt flips with side', () => {
    eq(cardTilt('left', 24), 24);
    eq(cardTilt('right', 24), -24);
    eq(cardTilt('left'), DEFAULTS.rotation);
    eq(cardTilt('left', 10), 10);
});

test('balancedFit keeps the aspect ratio', () => {
    for (const [w, h] of [[361, 600], [900, 329], [700, 520], [1920, 1080]]) {
        const f = balancedFit(w, h, 132, 112);
        near(f.width / f.height, w / h);
        eq(f.width <= 132 + 1e-9 && f.height <= 112 + 1e-9, true);
    }
});
test('balancedFit: a tall window takes the slot height, a wide one the slot width', () => {
    near(balancedFit(361, 600, 132, 112).height, 112);
    near(balancedFit(900, 329, 132, 112).width, 132);
});
test('balancedFit: a normal window lands on the target area', () => {
    const f = balancedFit(700, 520, 132, 112, 0.6);
    near(f.width * f.height, 0.6 * 132 * 112);
});
test('balancedFit: no window is a sliver', () => {
    const areas = [[361, 600], [900, 329], [700, 520]].map(([w, h]) => {
        const f = balancedFit(w, h, 132, 112);
        return f.width * f.height;
    });
    eq(Math.min(...areas) / Math.max(...areas) > 0.5, true);
});
test('balancedFit: empty input', () => eq(balancedFit(0, 10, 100, 100), { width: 0, height: 0, scale: 0 }));
test('clonePose pivots on the frame centre', () => {
    const frame = { x: 100, y: 50, width: 400, height: 300 };
    const buffer = { x: 80, y: 30, width: 440, height: 340 };
    eq(clonePose(frame, buffer, frame), { x: 80, y: 30, pivotX: 220 / 440, pivotY: 170 / 340, scale: 1 });
    const p = clonePose(frame, buffer, { x: 0, y: 0, width: 100, height: 100 });
    eq([p.x, p.y, p.scale], [50 - 220, 50 - 170, 0.25]);
    eq(clonePose(frame, buffer, { x: 0, y: 0, width: 0, height: 5 }), null);
});
test('pointRect is centred and keeps aspect', () => {
    eq(pointRect({ x: 50, y: 50 }, { width: 200, height: 100 }, 20), { x: 40, y: 45, width: 20, height: 10 });
});

// ---- strip layout ----
const WA = { x: 0, y: 32, width: 1920, height: 1048 };
test('fitCount six cards fit on 1080p', () => eq(fitCount(1048, 6), 6));
test('fitCount drops cards on a short screen', () => eq(fitCount(400, 6), 4));
test('fitCount tiny screen gives 0', () => eq(fitCount(100, 6), 0));
test('stripLayout left strip rect', () => {
    const l = stripLayout({ workArea: WA, side: 'left', count: 3 });
    eq(l.strip, { x: 0, y: 32, width: 200, height: 1048 });
});
test('stripLayout right strip rect', () => {
    const l = stripLayout({ workArea: WA, side: 'right', count: 3 });
    eq(l.strip.x, 1720);
});
test('stripLayout no cards', () => eq(stripLayout({ workArea: WA, count: 0 }).cards, []));
test('stripLayout cards are centred in the strip and in the height', () => {
    const l = stripLayout({ workArea: WA, side: 'left', count: 3 });
    eq(l.cards.length, 3);
    near(l.cards[0].x, 10);
    near(l.cards[0].width, 180);
    const top = l.cards[0].y - WA.y;
    const bottom = WA.y + WA.height - (l.cards[2].y + l.cards[2].height);
    near(top, bottom);
    eq(l.scale, 1);
});
test('stripLayout cards do not overlap', () => {
    const l = stripLayout({ workArea: WA, count: 6 });
    for (let i = 1; i < l.cards.length; i++)
        eq(l.cards[i].y >= l.cards[i - 1].y + l.cards[i - 1].height, true);
});
test('stripLayout shrinks to fit a short screen', () => {
    const wa = { x: 0, y: 0, width: 1280, height: 520 };
    const l = stripLayout({ workArea: wa, count: 4 });
    eq(l.scale < 1, true);
    const last = l.cards[3];
    eq(last.y + last.height <= wa.height - DEFAULTS.padBottom + 1e-6, true);
    eq(l.cards[0].y >= DEFAULTS.padTop - 1e-6, true);
    near(l.cards[0].width / l.cards[0].height, DEFAULTS.thumbW / DEFAULTS.thumbH);
});
test('stripLayout honours option overrides', () => {
    const l = stripLayout({ workArea: WA, count: 1, stripWidth: 300, thumbW: 100, thumbH: 60 });
    near(l.cards[0].x, 100);
    eq(l.strip.width, 300);
});
test('edgeZone left and right', () => {
    eq(edgeZone(WA, 'left').x, 0);
    eq(edgeZone(WA, 'right').x, 1918);
    eq(edgeZone(WA, 'left', 5).width, 5);
});

// ---- stage area ----
test('stageArea reserves the strip when not auto-hiding', () => {
    eq(stageArea(WA, { side: 'left' }), { x: 200, y: 32, width: 1720, height: 1048 });
    eq(stageArea(WA, { side: 'right' }), { x: 0, y: 32, width: 1720, height: 1048 });
});
test('stageArea is the full area with auto-hide', () => eq(stageArea(WA, { autohide: true }), WA));
test('stageArea is the full area when the strip is empty', () => eq(stageArea(WA, { stripShown: false }), WA));
test('fitToStage leaves an inside window alone', () => {
    const r = { x: 300, y: 100, width: 800, height: 600 };
    eq(fitToStage(r, stageArea(WA)), r);
});
test('fitToStage pushes a window off the strip, size kept', () => {
    const out = fitToStage({ x: 50, y: 100, width: 800, height: 600 }, stageArea(WA));
    eq(out, { x: 200, y: 100, width: 800, height: 600 });
});
test('fitToStage pulls a window back from the far edge', () => {
    const out = fitToStage({ x: 1800, y: 900, width: 800, height: 600 }, stageArea(WA));
    eq(out, { x: 1120, y: 480, width: 800, height: 600 });
});
test('fitToStage shrinks an oversized window', () => {
    const out = fitToStage({ x: 0, y: 0, width: 2500, height: 2000 }, stageArea(WA));
    eq(out, { x: 200, y: 32, width: 1720, height: 1048 });
});
test('centerOnStage', () => {
    eq(centerOnStage({ width: 1000, height: 600 }, stageArea(WA)), { x: 560, y: 256, width: 1000, height: 600 });
});
test('centerOnStage clamps size', () => {
    const out = centerOnStage({ width: 5000, height: 5000 }, stageArea(WA));
    eq([out.width, out.height], [1720, 1048]);
});

// ---- auto-hide ----
const base = { autohide: true, overview: false, stageOverlapsStrip: false, pointerAtEdge: false, pointerOnStrip: false };
test('stripShown: overview always hides', () => eq(stripShown({ ...base, autohide: false, overview: true }), false));
test('stripShown: no auto-hide always shows', () => eq(stripShown({ ...base, autohide: false, stageOverlapsStrip: true }), true));
test('stripShown: auto-hide, no overlap shows', () => eq(stripShown(base), true));
test('stripShown: no auto-hide, a maximized stage window over the strip hides it', () =>
    eq(stripShown({ ...base, autohide: false, stageOverlapsStrip: true, stageCoversStrip: true }), false));
test('stripShown: no auto-hide, covered, pointer at edge reveals', () =>
    eq(stripShown({ ...base, autohide: false, stageOverlapsStrip: true, stageCoversStrip: true, pointerAtEdge: true }), true));
test('stripShown: overlap hides', () => eq(stripShown({ ...base, stageOverlapsStrip: true }), false));
test('stripShown: overlap + pointer at edge reveals', () =>
    eq(stripShown({ ...base, stageOverlapsStrip: true, pointerAtEdge: true }), true));
test('stripShown: overlap + pointer on strip stays', () =>
    eq(stripShown({ ...base, stageOverlapsStrip: true, pointerOnStrip: true }), true));

// ---- model ----
const W = (id, appId) => ({ id, appId });
const SET = [W(1, 'a'), W(2, 'a'), W(3, 'b'), W(4, 'c'), W(5, null)];

test('sync groups windows by app', () => {
    const m = new StageModel();
    m.sync(SET);
    eq(ids(m.stages()), ['app:a', 'app:b', 'app:c', 'win:5']);
    eq(m.stageOf(2).windows, [1, 2]);
});
test('sync without grouping gives one stage per window', () => {
    const m = new StageModel({ groupByApp: false });
    m.sync(SET);
    eq(m.stages().length, 5);
    eq(m.stageOf(1).id, 'win:1');
});
test('no current stage before any focus; strip lists everything', () => {
    const m = new StageModel();
    m.sync(SET);
    eq(m.current, null);
    eq(m.strip().length, 4);
});
test('focus makes the stage current and moves it to the front', () => {
    const m = new StageModel();
    m.sync(SET);
    const r = m.focus(3);
    eq(r.changed, true);
    eq(m.current.id, 'app:b');
    eq(ids(m.stages())[0], 'app:b');
    eq(ids(m.strip()), ['app:a', 'app:c', 'win:5']);
});
test('inStrip: current stage windows are not parked, strip ones are', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(3);
    eq(m.inStrip(3), false);
    eq(m.inStrip(1), true);
    eq(m.inStrip(2), true);
});
test('inStrip honours the card limit', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(3);
    // strip order after focusing b: a, c, win:5
    eq(m.inStrip(5, 2), false);
    eq(m.inStrip(4, 2), true);
    eq(m.inStrip(99), false);
});
test('focusing the same stage again is not a change', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(1);
    eq(m.focus(2).changed, false);
    eq(m.current.lead, 2);
});
test('focus on an unknown id does nothing', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(3);
    const r = m.focus(99);
    eq(r.changed, false);
    eq(m.current.id, 'app:b');
});
test('strip is most-recent first', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(4);
    m.focus(3);
    m.focus(1);
    eq(ids(m.strip()), ['app:b', 'app:c', 'win:5']);
});
test('strip honours recentCount', () => {
    const m = new StageModel({ recentCount: 2 });
    m.sync(SET);
    m.focus(1);
    eq(m.strip().length, 2);
    m.setRecentCount(3);
    eq(m.strip().length, 3);
});
test('lead is the most recently focused window of the stage', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(2);
    m.focus(3);
    m.focus(1);
    m.focus(4);
    eq(m.stageOf(1).lead, 1);
    m.focus(2);
    m.focus(4);
    eq(m.stageOf(1).lead, 2);
});
test('visibility: current stage shown, others hidden', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(1);
    eq(m.visibility(), { show: [1, 2], hide: [3, 4, 5] });
});
test('visibility with no current stage hides everything', () => {
    const m = new StageModel();
    m.sync(SET);
    eq(m.visibility().show, []);
});
test('activateStage switches and returns the view', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(1);
    const v = m.activateStage('app:c');
    eq(v.windows, [4]);
    eq(m.current.id, 'app:c');
    eq(ids(m.strip())[0], 'app:a');
    eq(m.activateStage('nope'), null);
    eq(m.current.id, 'app:c');
});
test('sync drops closed windows and empty stages', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(3);
    m.sync(SET.filter(w => w.id !== 3 && w.id !== 2));
    eq(m.stageOf(1).windows, [1]);
    eq(m.stageOf(3), null);
    eq(m.current, null);
    eq(m.size, 3);
});
test('sync keeps order and adds new stages at the back', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(4);
    m.sync([...SET, W(6, 'd'), W(7, 'a')]);
    eq(ids(m.stages()), ['app:c', 'app:a', 'app:b', 'win:5', 'app:d']);
    eq(m.stageOf(7).windows, [1, 2, 7]);
    eq(m.current.id, 'app:c');
});
test('sync is idempotent', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(3);
    const a = JSON.stringify(m.stages());
    m.sync(SET);
    eq(JSON.stringify(m.stages()), a);
});
test('windows without an app never group', () => {
    const m = new StageModel();
    m.sync([W(1, null), W(2, null)]);
    eq(m.stages().length, 2);
});
test('setGroupByApp off splits stages, keeps current window on stage', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(1);
    m.setGroupByApp(false);
    eq(m.stages().length, 5);
    eq(m.current.id, 'win:1');
    eq(m.groupByApp, false);
});
test('setGroupByApp on merges again, current kept', () => {
    const m = new StageModel({ groupByApp: false });
    m.sync(SET);
    m.focus(2);
    m.setGroupByApp(true);
    eq(m.current.windows, [1, 2]);
    eq(m.stages().length, 4);
});
test('setGroupByApp to the same value is a no-op', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(3);
    const a = JSON.stringify(m.stages());
    m.setGroupByApp(true);
    eq(JSON.stringify(m.stages()), a);
});
test('split moves one window to its own stage after its old one', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(1);
    const v = m.split(2);
    eq(v.id, 'win:2');
    eq(m.stageOf(1).windows, [1]);
    eq(ids(m.stages()).slice(0, 2), ['app:a', 'win:2']);
    eq(m.current.id, 'app:a');
});
test('split of a lone window keeps one stage for it', () => {
    const m = new StageModel();
    m.sync(SET);
    m.split(3);
    eq(m.stages().filter(s => s.windows.includes(3)).length, 1);
    eq(m.stageOf(3).id, 'win:3');
    eq(m.stages().length, 4);
});
test('split of an unknown window', () => eq(new StageModel().split(1), null));
test('split survives a re-sync', () => {
    const m = new StageModel();
    m.sync(SET);
    m.split(2);
    m.sync(SET);
    eq(m.stageOf(2).id, 'win:2');
});
test('unfocus clears the current stage and shows everything in the strip', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(1);
    m.unfocus();
    eq(m.current, null);
    eq(m.strip().length, 4);
    eq(m.visibility().show, []);
});
test('split of the only window of the current stage keeps it current', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(3);
    m.split(3);
    eq(m.current.windows, [3]);
    eq(m.stages().length, 4);
});
test('visibility never hides a stage past recentCount (no card)', () => {
    const m = new StageModel({ recentCount: 2 });
    m.sync(SET);
    m.focus(1);
    const v = m.visibility();
    eq(v.hide, [3, 4]);
    eq(v.show, [1, 2, 5]);
});
test('visibility honours the strip limit (cards that fit on screen)', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(4);
    eq(m.visibility(1), { show: [4, 3, 5], hide: [1, 2] });
    eq(m.visibility(0).hide, []);
});
test('visibility: hidden set equals the stages the strip lists', () => {
    const m = new StageModel({ recentCount: 3 });
    m.sync([...SET, W(6, 'd'), W(7, 'e')]);
    m.focus(7);
    const cards = m.strip().slice(0, 2).flatMap(st => st.windows);
    eq(m.visibility(2).hide, cards);
});
test('leadForApp gives the most recent window of the app', () => {
    const m = new StageModel();
    m.sync(SET);
    m.focus(2);
    m.focus(1);
    m.focus(3);
    eq(m.leadForApp('a'), 1);
    eq(m.leadForApp('zzz'), null);
    eq(m.leadForApp(null), null);
});
test('leadForApp without grouping picks the most recent window stage of the app', () => {
    const m = new StageModel({ groupByApp: false });
    m.sync(SET);
    m.focus(2);
    eq(m.leadForApp('a'), 2);
});

// ---- focus roots ----
const node = (name, parent = null, listed = false) => ({ name, parent, listed });
const up = w => w.parent;
const listed = w => w.listed;
test('focusRoot: a listed window is its own root', () => {
    const a = node('a', null, true);
    eq(focusRoot(a, up, listed).name, 'a');
});
test('focusRoot: dialog maps to its listed parent', () => {
    const a = node('a', null, true);
    const d = node('d', a);
    eq(focusRoot(d, up, listed).name, 'a');
});
test('focusRoot: nested dialogs walk up', () => {
    const a = node('a', null, true);
    const d1 = node('d1', a);
    const d2 = node('d2', d1);
    eq(focusRoot(d2, up, listed).name, 'a');
});
test('focusRoot: no listed ancestor gives null', () => {
    eq(focusRoot(node('d', node('p')), up, listed), null);
    eq(focusRoot(null, up, listed), null);
});
test('focusRoot: a transient loop ends', () => {
    const x = node('x');
    const y = node('y', x);
    x.parent = y;
    eq(focusRoot(x, up, listed), null);
});

// ---- edge barrier ----
const MON = { x: 0, y: 0, width: 1920, height: 1080 };
test('edgeBarrier left edge of a lone monitor', () =>
    eq(edgeBarrier(WA, MON, [], 'left'), { x1: 0, x2: 0, y1: 32, y2: 1080, direction: 'positive' }));
test('edgeBarrier right edge', () =>
    eq(edgeBarrier(WA, MON, [], 'right'), { x1: 1920, x2: 1920, y1: 32, y2: 1080, direction: 'negative' }));
test('edgeBarrier none where a monitor continues past the edge', () => {
    eq(edgeBarrier(WA, MON, [{ x: -1280, y: 0, width: 1280, height: 1024 }], 'left'), null);
    eq(edgeBarrier(WA, MON, [{ x: 1920, y: 200, width: 1280, height: 1024 }], 'right'), null);
});
test('edgeBarrier ignores a monitor on the other side or not overlapping vertically', () => {
    eq(edgeBarrier(WA, MON, [{ x: 1920, y: 0, width: 1280, height: 1024 }], 'left') !== null, true);
    eq(edgeBarrier(WA, MON, [{ x: -1280, y: 2000, width: 1280, height: 1024 }], 'left') !== null, true);
});

// ---- exempt windows ----
const plainWin = { above: false, sticky: false, title: 'Notes', monitor: 0, primary: 0 };
test('isExempt: a plain window on the primary monitor is managed', () => eq(isExempt(plainWin), false));
test('isExempt: always on top', () => eq(isExempt({ ...plainWin, above: true }), true));
test('isExempt: on all workspaces', () => eq(isExempt({ ...plainWin, sticky: true }), true));
test('isExempt: picture-in-picture titles', () => {
    eq(isExempt({ ...plainWin, title: 'Picture-in-Picture' }), true);
    eq(isExempt({ ...plainWin, title: 'Picture in picture' }), true);
    eq(isExempt({ ...plainWin, title: 'Pictures' }), false);
    eq(isExempt({ ...plainWin, title: null }), false);
});
test('isExempt: other monitor', () => eq(isExempt({ ...plainWin, monitor: 1 }), true));

test('views are copies', () => {
    const m = new StageModel();
    m.sync(SET);
    m.stageOf(1).windows.push(99);
    eq(m.stageOf(1).windows, [1, 2]);
});

// ---- window sets (UX round 2) ----
const AREA = { x: 200, y: 0, width: 1000, height: 800 };
test('dropZone: left, middle band and right', () => {
    eq(dropZone({ x: 210, y: 10 }, AREA), 'left');
    eq(dropZone({ x: 700, y: 10 }, AREA), 'center');
    eq(dropZone({ x: 1190, y: 10 }, AREA), 'right');
});
test('dropZone: band edges and outside', () => {
    eq(dropZone({ x: 549, y: 5 }, AREA), 'left');
    eq(dropZone({ x: 550, y: 5 }, AREA), 'center');
    eq(dropZone({ x: 850, y: 5 }, AREA), 'right');
    eq(dropZone({ x: 100, y: 5 }, AREA), null);
    eq(dropZone({ x: 300, y: 900 }, AREA), null);
    eq(dropZone({ x: 300, y: 5 }, null), null);
});
test('dropZone: no middle band means halves', () => {
    eq(dropZone({ x: 699, y: 5 }, AREA, 0), 'left');
    eq(dropZone({ x: 700, y: 5 }, AREA, 0), 'right');
});
test('dropZoneRect: halves and whole, inset', () => {
    eq(dropZoneRect(AREA, 'left', 10), { x: 210, y: 10, width: 480, height: 780 });
    eq(dropZoneRect(AREA, 'right', 10), { x: 710, y: 10, width: 480, height: 780 });
    eq(dropZoneRect(AREA, 'center', 10), { x: 210, y: 10, width: 980, height: 780 });
    eq(dropZoneRect(AREA, null), null);
});
test('tileOrder: dropped on the zone side', () => {
    eq(tileOrder('left', [5], [1, 2]), [5, 1, 2]);
    eq(tileOrder('right', [5, 6], [1]), [1, 5, 6]);
    eq(tileOrder('center', [5], [1]), null);
    eq(tileOrder('right', [1], [1, 2]), [2, 1]);
});
test('tilePlan: two equal halves with gaps', () => {
    const p = tilePlan(AREA, 2, 8);
    eq(p.length, 2);
    eq(p[0], { x: 208, y: 8, width: 488, height: 784 });
    eq(p[1].x, 704);
    eq(p[1].x + p[1].width <= AREA.x + AREA.width, true);
});
test('tilePlan: three columns, none, degenerate', () => {
    eq(tilePlan(AREA, 3).length, 3);
    eq(tilePlan(AREA, 0), []);
    eq(tilePlan({ x: 0, y: 0, width: 10, height: 10 }, 4, 8), []);
});
test('settleTiles: windows that took their columns stay where tilePlan put them', () => {
    const plan = tilePlan(AREA, 2, 8);
    eq(settleTiles(AREA, plan), plan.map(r => ({ x: r.x, y: r.y })));
});
test('settleTiles: min sizes wider than the columns overlap evenly inside the area', () => {
    // Real case (GNOME 50, 1080 px stage): three apps with a 360 px minimum in 349 px columns
    const area = { x: 200, y: 32, width: 1080, height: 768 };
    const spots = settleTiles(area, [{ width: 360, height: 752 }, { width: 360, height: 752 }, { width: 360, height: 752 }]);
    eq(spots.map(p => p.x), [208, 560, 912]);
    eq(spots.every(p => p.y === 40), true);
    eq(spots[2].x + 360 <= area.x + area.width, true);
});
test('settleTiles: a too-tall window keeps its top in view, a short one is centred', () => {
    const spots = settleTiles(AREA, [{ width: 400, height: 900 }, { width: 400, height: 400 }]);
    eq(spots[0].y, 0);
    eq(spots[1].y, 200);
});
test('settleTiles: a narrow fixed-size window is centred in its column', () => {
    const spots = settleTiles(AREA, [{ width: 488, height: 784 }, { width: 288, height: 784 }]);
    eq(spots[0].x, 208);
    eq(spots[1].x, 804);
});
test('settleTiles: a window wider than the area starts at its left edge; empty input', () => {
    eq(settleTiles(AREA, [{ width: 1400, height: 700 }, { width: 400, height: 700 }])[0].x, 200);
    eq(settleTiles(AREA, []), []);
    eq(settleTiles(null, [{ width: 1, height: 1 }]), []);
});
test('scaleMs: speed multiplier, clamped, bad input is normal', () => {
    eq(scaleMs(300, 2), 150);
    eq(scaleMs(300, 0.5), 600);
    eq(scaleMs(300, 100), 75);
    eq(scaleMs(300, NaN), 300);
    eq(scaleMs(300, 0), 300);
});
test('workspaceDirection', () => {
    eq(workspaceDirection(0, 1), 1);
    eq(workspaceDirection(2, 1), -1);
    eq(workspaceDirection(1, 1), 0);
    eq(workspaceDirection(null, 1), 0);
});
test('isClick: still and quick is a click, a drag or a hold is not', () => {
    eq(isClick({ x: 0, y: 0, time: 0 }, { x: 3, y: 2, time: 100 }), true);
    eq(isClick({ x: 0, y: 0, time: 0 }, { x: 30, y: 2, time: 100 }), false);
    eq(isClick({ x: 0, y: 0, time: 0 }, { x: 0, y: 0, time: 2000 }), false);
    eq(isClick(null, { x: 0, y: 0, time: 0 }), false);
});
test('stackLayers: a set fans out and stays opaque', () => {
    const set = stackLayers(3, 'left', 3, { set: true });
    const app = stackLayers(3, 'left', 3);
    eq(Math.abs(set[1].dx) > Math.abs(app[1].dx), true);
    eq(set[2].opacity > app[2].opacity, true);
    eq(set[0].tilt, 0);
});

const SETWINS = [W(1, 'a'), W(2, 'a'), W(3, 'b'), W(4, 'c')];
function setModel() {
    const m = new StageModel();
    m.sync(SETWINS);
    m.focus(3);
    return m;
}
test('join: strip entry added to the stage makes one set, current', () => {
    const m = setModel();
    const v = m.join('app:a', 'app:b');
    eq(v.set, true);
    eq(v.windows.sort(), [1, 2, 3]);
    eq(m.current.id, v.id);
    eq(m.strip().map(s => s.id), ['app:c']);
    eq(v.apps.sort(), ['a', 'b']);
});
test('join: the set keeps the destination place and the source leaves the order', () => {
    const m = setModel();
    m.focus(4);
    const v = m.join('app:a', 'app:b');
    eq(ids(m.stages()), ['app:c', v.id]);
});
test('join into an existing set keeps its id', () => {
    const m = setModel();
    const a = m.join('app:a', 'app:b');
    const b = m.join('app:c', a.id);
    eq(b.id, a.id);
    eq(b.windows.length, 4);
});
test('join: unknown or same stage', () => {
    const m = setModel();
    eq(m.join('app:b', 'app:b'), null);
    eq(m.join('nope', 'app:b'), null);
});
test('a set goes to the strip as one entry when another app takes the stage', () => {
    const m = setModel();
    const v = m.join('app:a', 'app:b');
    m.focus(4);
    eq(m.strip().map(s => s.id), [v.id]);
    eq(m.visibility().hide.sort(), [1, 2, 3]);
});
test('split takes a window out of a set; the last one dissolves it', () => {
    const m = setModel();
    const v = m.join('app:c', 'app:b');
    m.split(4);
    eq(m.stageOf(4).id, 'win:4');
    eq(m.stageOf(3).id, 'app:b');
    eq(m.current.id, 'app:b');
    eq(m.stages().some(s => s.id === v.id), false);
});
test('a closed window dissolves a set of two', () => {
    const m = setModel();
    m.join('app:c', 'app:b');
    m.sync(SETWINS.filter(w => w.id !== 4));
    eq(m.current.id, 'app:b');
    eq(m.stages().every(s => !s.set), true);
});
test('a new window of an app in a set joins the set', () => {
    const m = setModel();
    const v = m.join('app:c', 'app:b');
    const r = m.sync([...SETWINS, W(9, 'c')]);
    eq(r.added, [9]);
    eq(m.stageOf(9).id, v.id);
});
test('a new window of another app gets its own stage', () => {
    const m = setModel();
    m.join('app:c', 'app:b');
    m.sync([...SETWINS, W(9, 'z')]);
    eq(m.stageOf(9).id, 'app:z');
});
test('sync reports new ids only once', () => {
    const m = new StageModel();
    eq(m.sync(SETWINS).added, [1, 2, 3, 4]);
    eq(m.sync(SETWINS).added, []);
});
test('tiles: set, read, filtered and cleared', () => {
    const m = setModel();
    const v = m.join('app:c', 'app:b');
    eq(m.setTiles(v.id, [4, 3, 99]), [4, 3]);
    eq(m.tilesOf(v.id), [4, 3]);
    eq(m.setTiles('app:a', [1, 2]), null);
    m.split(4);
    eq(m.tilesOf(v.id), null);
});
test('tiles of a set of three survive a split down to two', () => {
    const m = setModel();
    const v = m.join('app:c', 'app:b');
    m.join('app:a', v.id);
    m.setTiles(v.id, [4, 3, 1]);
    m.split(2);
    eq(m.tilesOf(v.id), [4, 3, 1]);
    m.split(1);
    eq(m.tilesOf(v.id), [4, 3]);
});
test('sets survive setGroupByApp', () => {
    const m = setModel();
    const v = m.join('app:c', 'app:b');
    m.setGroupByApp(false);
    eq(m.stageOf(3).id, v.id);
    eq(m.stageOf(1).id, 'win:1');
});

if (failed)
    throw new Error(`${failed} failed`);
