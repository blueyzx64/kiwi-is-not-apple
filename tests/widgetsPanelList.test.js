// Run: gjs -m tests/widgetsPanelList.test.js
// The widget lists of the Notification Center and the notch (core/widgets/model.js).
import {
    SURFACE_SIZES, DEFAULT_PANEL_WIDGETS, SIZE_PX, WidgetRegistry, cellsOf, parseWidgetList, serializeWidgetList,
    setWidget, stripCells, fitsStrip, fitStrip, packRows,
} from '../core/widgets/model.js';
import { NOTCH_CONTROLS, WIDGET_STRIP, DASH_SIZE, stripWidth } from '../features/notch/dashboardModel.js';

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
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const reg = new WidgetRegistry();
const kind = (id, sizes, defaultSize = sizes[0]) => reg.register({
    id, title: id, category: 'x', sizes, defaultSize, provider: 'time', build: () => ({ update() {} }),
});
kind('weather', ['small', 'medium', 'large']);
kind('batteries', ['small', 'medium', 'large']);
kind('now-playing', ['small', 'medium'], 'medium');
kind('note', ['small', 'medium', 'large', 'extraLarge'], 'medium');
kind('up-next', ['small', 'medium', 'large']);
const center = { sizesFor: k => reg.sizesFor(k, 'center'), defaultSize: k => reg.get(k)?.defaultSize };
const notch = {
    sizesFor: k => (k === NOTCH_CONTROLS ? ['small'] : reg.sizesFor(k, 'notch')),
    defaultSize: k => reg.get(k)?.defaultSize,
};

test('each surface has its sizes', () => {
    eq(reg.sizesFor('note', 'desktop'), ['small', 'medium', 'large', 'extraLarge']);
    eq(reg.sizesFor('note', 'center'), ['small', 'medium', 'large']);
    eq(reg.sizesFor('note', 'notch'), ['small', 'medium']);
    eq(SURFACE_SIZES.notch, ['small', 'medium']);
    eq([cellsOf('small'), cellsOf('medium'), cellsOf('large')], [1, 2, 2]);
});

test('parse keeps order, drops unknown kinds and repeats, fixes sizes', () => {
    eq(parseWidgetList(['weather:small', 'bogus:small', 'weather:medium', 'note:extraLarge', 'now-playing', 7], center),
        [{ kind: 'weather', size: 'small' }, { kind: 'note', size: 'medium' }, { kind: 'now-playing', size: 'medium' }]);
    eq(parseWidgetList(['note:large', 'weather:large'], notch),
        [{ kind: 'note', size: 'medium' }, { kind: 'weather', size: 'small' }]);
    eq(parseWidgetList(null, center), []);
});

test('the defaults parse to today\'s look', () => {
    eq(parseWidgetList(DEFAULT_PANEL_WIDGETS.center, center),
        [{ kind: 'weather', size: 'small' }, { kind: 'batteries', size: 'small' }, { kind: 'now-playing', size: 'medium' }]);
    eq(parseWidgetList(DEFAULT_PANEL_WIDGETS.notch, notch),
        [{ kind: 'up-next', size: 'medium' }, { kind: 'weather', size: 'small' }, { kind: NOTCH_CONTROLS, size: 'small' }]);
});

test('serialize round-trips', () => {
    const list = [{ kind: 'weather', size: 'small' }, { kind: 'note', size: 'large' }];
    eq(parseWidgetList(serializeWidgetList(list), center), list);
});

test('setWidget adds at the end, resizes in place, removes', () => {
    let list = [{ kind: 'weather', size: 'small' }];
    list = setWidget(list, 'note', 'medium');
    eq(list.map(w => w.kind), ['weather', 'note']);
    list = setWidget(list, 'weather', 'medium');
    eq(list, [{ kind: 'weather', size: 'medium' }, { kind: 'note', size: 'medium' }]);
    eq(setWidget(list, 'weather', null), [{ kind: 'note', size: 'medium' }]);
});

test('the notch strip holds four cells', () => {
    const list = parseWidgetList(DEFAULT_PANEL_WIDGETS.notch, notch);
    eq(stripCells(list), 4);
    eq(fitsStrip(list, 'batteries', 'small', 4), false);
    eq(fitsStrip(list, 'weather', 'medium', 4), false);
    eq(fitsStrip(list, 'up-next', 'small', 4), true);
    const over = [...list, { kind: 'batteries', size: 'small' }];
    eq(fitStrip(over, 4).hidden.map(w => w.kind), ['batteries']);
    // a small after a medium that no longer fits still shows
    eq(fitStrip([{ kind: 'a', size: 'medium' }, { kind: 'b', size: 'medium' }, { kind: 'c', size: 'medium' },
        { kind: 'd', size: 'small' }], 4).shown.map(w => w.kind), ['a', 'b']);
    eq(fitStrip([{ kind: 'a', size: 'medium' }, { kind: 'b', size: 'small' }, { kind: 'c', size: 'medium' },
        { kind: 'd', size: 'small' }], 4).shown.map(w => w.kind), ['a', 'b', 'd']);
});

test('every full strip fits the dashboard body', () => {
    const s = SIZE_PX.small.width;
    const m = SIZE_PX.medium.width;
    for (const widths of [[s, s, s, s], [m, m], [m, s, s], [s, m, s]])
        eq(stripWidth(widths) <= WIDGET_STRIP.inner, true, JSON.stringify(widths));
    eq(stripWidth([]), 0);
    eq(SIZE_PX.small.height * WIDGET_STRIP.scale <= DASH_SIZE.h - 32 - 24, true);
    eq(WIDGET_STRIP.inner, DASH_SIZE.w - 40);
});

test('the Notification Center packs two cells a row, in order', () => {
    const w = (k, size) => ({ kind: k, size });
    eq(packRows([w('a', 'small'), w('b', 'small'), w('c', 'medium'), w('d', 'small'), w('e', 'large'), w('f', 'small')], 2)
        .map(r => r.map(x => x.kind).join('')), ['ab', 'c', 'd', 'e', 'f']);
    eq(packRows([], 2), []);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
