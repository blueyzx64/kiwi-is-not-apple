// Run: gjs -m tests/controlCenterModel.test.js
import {
    COLUMNS, MORE_HEADER_ID, planLayout, place, restoreOrder, batteryTime, BATTERY_STATE,
    KIWI_COLUMNS, KIWI_TOGGLES, kiwiTiles,
} from '../apps/controlCenter/model.js';

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
const e = (id, key, visible = true, stockSpan = 1, compactable = false) =>
    ({ id, key, visible, stockSpan, compactable });
// A plain on/off stock toggle the shell can make icon-only
const c = (id, key, visible = true) => e(id, key, visible, 1, true);
const ids = plan => plan.map(p => p.id);
const byId = (plan, id) => plan.find(p => p.id === id);

test('stock items are grouped in block order, whatever the stock order', () => {
    const plan = planLayout([
        e('sys', 'system', true, 2), e('vol', 'volume-out', true, 2), e('bt', 'bluetooth'),
        e('dark', 'dark-style'), e('wifi', 'wifi'), e('br', 'brightness', true, 2),
    ]);
    eq(ids(plan).filter(i => i !== MORE_HEADER_ID), ['wifi', 'bt', 'dark', 'br', 'vol', 'sys']);
});

test('connectivity with wifi, bluetooth and vpn: a 2x2 block (vpn widened to fill)', () => {
    const plan = planLayout([e('wifi', 'wifi'), e('bt', 'bluetooth'), e('vpn', 'vpn')]);
    eq(plan.slice(0, 3).map(p => p.span), [2, 2, 4]);
});

test('a hidden vpn does not leave a hole', () => {
    const plan = planLayout([e('wifi', 'wifi'), e('bt', 'bluetooth'), e('vpn', 'vpn', false)]);
    eq(plan.slice(0, 2).map(p => p.span), [2, 2]);
});

test('focus row: dnd 2 + dark style and night light as 1x1 squares', () => {
    const plan = planLayout([e('dnd', 'dnd'), c('dark', 'dark-style'), c('night', 'night-light')]);
    eq(plan.slice(0, 3).map(p => [p.id, p.span, p.compact]),
        [['dnd', 2, false], ['dark', 1, true], ['night', 1, true]]);
});

test('a widened compact square gets its label back', () => {
    const plan = planLayout([e('dnd', 'dnd'), c('dark', 'dark-style')]);
    eq(plan.slice(0, 2).map(p => [p.span, p.compact]), [[2, false], [2, false]]);
});

test('a secondary toggle the shell cannot compact stays a labelled half tile', () => {
    const plan = planLayout([e('dnd', 'dnd'), e('dark', 'dark-style'), c('night', 'night-light')]);
    eq(plan.slice(0, 3).map(p => [p.id, p.span, p.compact]),
        [['dnd', 2, false], ['dark', 2, false], ['night', 4, false]]);
});

test('a lone visible tile takes the full row', () => {
    const plan = planLayout([e('dnd', 'dnd')]);
    eq(byId(plan, 'dnd').span, COLUMNS);
});

test('labelled toggles come first, then the squares fill whole rows', () => {
    const plan = planLayout([
        c('air', 'airplane'), e('power', 'power-saver'), c('rot', 'rotation'),
        e('kbd', 'backlight'), c('loc', 'location'), c('cam', 'camera'), c('tb', 'thunderbolt'),
    ]);
    const toggles = plan.filter(p => p.group === 'toggles');
    eq(toggles.map(p => p.id), ['kbd', 'power', 'air', 'rot', 'loc', 'cam', 'tb']);
    eq(toggles.map(p => p.span), [2, 2, 1, 1, 1, 1, 4]);
    eq(toggles.map(p => p.compact), [false, false, true, true, true, true, false]);
});

test('every row of a group adds up to COLUMNS', () => {
    const plan = planLayout([
        c('a', 'airplane'), e('c', 'power-saver'), c('d', 'rotation'), c('f', 'location'),
    ]);
    const spans = plan.filter(p => p.group === 'toggles').map(p => p.span);
    eq(spans, [2, 1, 1, 4]);
});

test('the Kiwi module is one full-width block after the toggles', () => {
    const plan = planLayout([e('k', 'kiwi-toggles'), c('air', 'airplane'), e('sys', 'system', true, 2)]);
    eq(plan.filter(p => p.id !== MORE_HEADER_ID).map(p => [p.id, p.span]),
        [['air', 4], ['k', 4], ['sys', 4]]);
});

test('kiwiTiles: the catalogue covers the Kiwi features, never the Control Center', () => {
    const keys = KIWI_TOGGLES.map(t => t.key);
    for (const key of ['notch', 'stage-manager', 'panel-autohide', 'clipboard-history', 'spotlight',
        'liquid-glass', 'show-window-controls'])
        if (!keys.includes(key))
            throw new Error(`missing ${key}`);
    eq(keys.includes('control-center'), false);
    eq(kiwiTiles(() => true).some(t => t.key === 'control-center'), false);
    for (const t of KIWI_TOGGLES)
        if (!t.icon || !t.label)
            throw new Error(`${t.key} needs an icon and a label`);
});

test('kiwiTiles: keys missing from the schema are skipped and cells stay packed', () => {
    const tiles = kiwiTiles(key => key !== 'stage-manager');
    eq(tiles.some(t => t.key === 'stage-manager'), false);
    eq(tiles.map(t => [t.column, t.row]), tiles.map((_t, i) => [i % KIWI_COLUMNS, Math.floor(i / KIWI_COLUMNS)]));
    eq(kiwiTiles(() => false), []);
});

test('unknown items go to extras after the stock toggles, with the header', () => {
    const plan = planLayout([
        e('x', null, true, 1), e('dark', 'dark-style'), e('notif', 'notifications', true, 2),
        e('bg', 'background-apps', true, 2),
    ]);
    eq(ids(plan), ['dark', 'bg', MORE_HEADER_ID, 'x', 'notif']);
    eq(byId(plan, MORE_HEADER_ID).visible, true);
});

test('no visible extras: header hidden', () => {
    const plan = planLayout([e('x', null, false), e('dark', 'dark-style')]);
    eq(byId(plan, MORE_HEADER_ID).visible, false);
});

test('an extra with stock span 2 (full width) stays full width', () => {
    eq(place({ key: null, stockSpan: 2 }).span, COLUMNS);
    eq(place({ key: null, stockSpan: 1 }).span, 2);
    eq(place({ key: null }).span, 2);
});

test('order is stable for equal rank (volume out before volume in; same-key keeps stock order)', () => {
    const plan = planLayout([e('b1', 'brightness', true, 2), e('b2', 'brightness', true, 2)]);
    eq(ids(plan).slice(0, 2), ['b1', 'b2']);
});

test('planLayout does not mutate its input', () => {
    const input = [e('wifi', 'wifi'), e('bt', 'bluetooth')];
    const copy = JSON.stringify(input);
    planLayout(input);
    eq(JSON.stringify(input), copy);
});

test('restoreOrder keeps the saved order of items still alive', () => {
    eq(restoreOrder(['a', 'b', 'c', 'd'], ['d', 'b', 'a', 'c']), ['a', 'b', 'c', 'd']);
});

test('restoreOrder skips items that left the grid (rebuilt grid, dead parent)', () => {
    eq(restoreOrder(['a', 'b', 'c'], ['c', 'a']), ['a', 'c']);
});

test('restoreOrder puts newcomers after the restored items', () => {
    eq(restoreOrder(['a', 'b'], ['n1', 'b', 'a', 'n2']), ['a', 'b', 'n1', 'n2']);
});

test('restoreOrder on an empty grid is empty', () => eq(restoreOrder(['a'], []), []));

test('batteryTime: discharging uses time to empty', () => {
    eq(batteryTime({ state: BATTERY_STATE.DISCHARGING, toEmpty: 3 * 3600 + 20 * 60, toFull: 0 }),
        { kind: 'remaining', hours: 3, minutes: 20 });
});

test('batteryTime: charging uses time to full', () => {
    eq(batteryTime({ state: BATTERY_STATE.CHARGING, toEmpty: 0, toFull: 45 * 60 }),
        { kind: 'until-full', hours: 0, minutes: 45 });
});

test('batteryTime: no estimate or full battery gives null', () => {
    eq(batteryTime({ state: BATTERY_STATE.DISCHARGING, toEmpty: 0, toFull: 0 }), null);
    eq(batteryTime({ state: BATTERY_STATE.FULLY_CHARGED, toEmpty: 0, toFull: 0 }), null);
    eq(batteryTime({ state: BATTERY_STATE.DISCHARGING, toEmpty: NaN, toFull: 0 }), null);
});

if (failed > 0)
    throw new Error(`${failed} test(s) failed`);
