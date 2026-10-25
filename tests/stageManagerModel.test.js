// Run: gjs -m tests/stageManagerModel.test.js
import {
    DEFAULTS, overlaps, thumbFit, cropThumb, stackLayers, cardTilt, fitCount, stripLayout,
    edgeZone, stageArea, fitToStage, centerOnStage, stripShown, StageModel,
} from '../apps/stageManager/model.js';

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
    eq(cardTilt('left'), 24);
    eq(cardTilt('right'), -24);
    eq(cardTilt('left', 10), 10);
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
    near(l.cards[0].width / l.cards[0].height, 180 / 116);
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
test('views are copies', () => {
    const m = new StageModel();
    m.sync(SET);
    m.stageOf(1).windows.push(99);
    eq(m.stageOf(1).windows, [1, 2]);
});

if (failed)
    throw new Error(`${failed} failed`);
