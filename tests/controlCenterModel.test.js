// Run: gjs -m tests/controlCenterModel.test.js
import {
    COLUMNS, MORE_HEADER_ID, planLayout, place, restoreOrder, batteryTime, BATTERY_STATE,
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
const e = (id, key, visible = true, stockSpan = 1) => ({ id, key, visible, stockSpan });
const ids = plan => plan.map(p => p.id);
const byId = (plan, id) => plan.find(p => p.id === id);

test('stock items are grouped in block order, whatever the stock order', () => {
    const plan = planLayout([
        e('sys', 'system', true, 2), e('vol', 'volume-out', true, 2), e('bt', 'bluetooth'),
        e('dark', 'dark-style'), e('wifi', 'wifi'), e('br', 'brightness', true, 2),
    ]);
    eq(ids(plan).filter(i => i !== MORE_HEADER_ID), ['wifi', 'bt', 'br', 'vol', 'dark', 'sys']);
});

test('connectivity with wifi, bluetooth and vpn: a 2x2 block (vpn widened to fill)', () => {
    const plan = planLayout([e('wifi', 'wifi'), e('bt', 'bluetooth'), e('vpn', 'vpn')]);
    eq(plan.slice(0, 3).map(p => p.span), [2, 2, 4]);
});

test('a hidden vpn does not leave a hole', () => {
    const plan = planLayout([e('wifi', 'wifi'), e('bt', 'bluetooth'), e('vpn', 'vpn', false)]);
    eq(plan.slice(0, 2).map(p => p.span), [2, 2]);
});

test('focus row: dnd 2 + stage manager 1 + liquid glass 1', () => {
    const plan = planLayout([e('dnd', 'dnd'), e('sm', 'stage-manager'), e('lg', 'liquid-glass')]);
    eq(plan.slice(0, 3).map(p => p.span), [2, 1, 1]);
});

test('focus row without the stage manager tile widens the last tile', () => {
    const plan = planLayout([e('dnd', 'dnd'), e('lg', 'liquid-glass')]);
    eq(plan.slice(0, 2).map(p => p.span), [2, 2]);
});

test('a lone visible tile takes the full row', () => {
    const plan = planLayout([e('dnd', 'dnd')]);
    eq(byId(plan, 'dnd').span, COLUMNS);
});

test('every full row of a group adds up to COLUMNS', () => {
    const plan = planLayout([
        e('a', 'dark-style'), e('b', 'night-light'), e('c', 'power-saver'),
        e('d', 'rotation'), e('f', 'airplane'),
    ]);
    const spans = plan.filter(p => p.group === 'toggles').map(p => p.span);
    eq(spans, [2, 2, 2, 2, 4]);
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
