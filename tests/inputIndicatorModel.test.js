// Run: gjs -m tests/inputIndicatorModel.test.js
// features/inputIndicator/model.js and lib/caretModel.js: badge text, caret trust, placement.
import {
    CAPS_GLYPH, CAPS_HOLD_MS, CARET_GAP, CapsWatch, POINTER_OFFSET, SCREEN_MARGIN, badgeFor, badgeLifetime,
    capsSwitchApplies, capsSwitchTarget, classifyCapsPress, isLatinSource, isSourceSwitch, nextSource,
    placeBadge, readConfig, sourceLabel,
} from '../features/inputIndicator/model.js';
import { capsIconField, capsIconPosition } from '../features/dialogs/model.js';
import { CaretTracker } from '../lib/caretModel.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const on = { enabled: true, capsLock: true, capsOff: true, source: true };

test('config reads the four keys', () => {
    const v = { 'input-indicator': true, 'input-indicator-caps-lock': false, 'input-indicator-caps-off': false, 'input-indicator-source': true };
    eq(readConfig({ bool: k => v[k] }), { enabled: true, capsLock: false, capsOff: false, source: true });
});
test('badge: accent glyph on, muted glyph off, source short name; settings turn parts off', () => {
    eq(badgeFor({ type: 'caps', on: true }, on), { text: CAPS_GLYPH, style: 'caps-on', key: 'caps-on' });
    eq(badgeFor({ type: 'caps', on: false }, on).style, 'caps-off');
    eq(badgeFor({ type: 'source', source: { shortName: 'de', displayName: 'German' } }, on).text, 'DE');
    eq(badgeFor({ type: 'caps', on: true }, { ...on, capsLock: false }), null);
    eq(badgeFor({ type: 'source', source: { shortName: 'en' } }, { ...on, source: false }), null);
    eq(badgeFor({ type: 'caps', on: true }, { ...on, enabled: false }), null);
    eq(badgeFor({ type: 'source', source: {} }, on), null);
});
test('source label: capitals, at most three, scripts without case unchanged', () => {
    eq([sourceLabel({ shortName: 'en' }), sourceLabel({ shortName: 'あ' }), sourceLabel({ displayName: 'Dvorak' })],
        ['EN', 'あ', 'DVO']);
});
test('source switch: not at startup, not to the same source', () => {
    eq([isSourceSwitch(null, 'us'), isSourceSwitch('us', 'us'), isSourceSwitch('us', 'de')], [false, false, true]);
});
test('caps watch reports only Caps Lock edges', () => {
    const w = new CapsWatch(false);
    eq([w.update(false), w.update(true), w.update(true), w.update(false)], [null, true, null, false]);
});
test('caret: an empty rect clears it; a focus change forgets it', () => {
    const c = new CaretTracker();
    c.report({ x: 10, y: 20, width: 1, height: 18 });
    eq(c.rect, { x: 10, y: 20, width: 1, height: 18 });
    c.report({ x: 0, y: 0, width: 0, height: 0 });
    eq(c.rect, null);
    c.report({ x: 5, y: 6, width: 0, height: 15 });
    c.focusChanged();
    eq(c.rect, null);
    c.report({ x: NaN, y: 1, width: 1, height: 1 });
    eq(c.rect, null);
});
const area = { x: 0, y: 0, width: 1280, height: 800 };
const size = { width: 24, height: 20 };
test('place: under the caret, above it at the bottom, clamped at the sides', () => {
    eq(placeBadge({ caret: { x: 100, y: 200, width: 1, height: 18 }, pointer: { x: 0, y: 0 }, size, area }),
        { x: 100, y: 200 + 18 + CARET_GAP, anchor: 'caret' });
    eq(placeBadge({ caret: { x: 100, y: 780, width: 1, height: 18 }, pointer: { x: 0, y: 0 }, size, area }).y,
        780 - CARET_GAP - 20);
    eq(placeBadge({ caret: { x: 1275, y: 100, width: 1, height: 18 }, pointer: { x: 0, y: 0 }, size, area }).x,
        1280 - 24 - SCREEN_MARGIN);
});
test('place: by the pointer without a caret', () => {
    eq(placeBadge({ caret: null, pointer: { x: 300, y: 400 }, size, area }),
        { x: 300 + POINTER_OFFSET.x, y: 400 + POINTER_OFFSET.y, anchor: 'pointer' });
    const second = { x: 1280, y: 0, width: 1024, height: 768 };
    eq(placeBadge({ caret: null, pointer: { x: 2300, y: 760 }, size, area: second }),
        { x: 1280 + 1024 - 24 - SCREEN_MARGIN, y: 768 - 20 - SCREEN_MARGIN, anchor: 'pointer' });
});
test('caps off: nothing by default (macOS), the muted badge only when asked for', () => {
    eq(badgeFor({ type: 'caps', on: false }, { ...on, capsOff: false }), null);
    eq(badgeFor({ type: 'caps', on: true }, { ...on, capsOff: false }).style, 'caps-on');
});
test('lifetime: caps-on stays while there is a caret; the rest is timed', () => {
    eq([badgeLifetime('caps-on', true), badgeLifetime('caps-on', false), badgeLifetime('source', true),
        badgeLifetime('caps-off', true)], ['persist', 'timed', 'timed', 'timed']);
});
test('caps press: idle about the whole hold time is a hold, a release earlier is a tap', () => {
    eq([classifyCapsPress(CAPS_HOLD_MS), classifyCapsPress(CAPS_HOLD_MS - 10), classifyCapsPress(CAPS_HOLD_MS - 120),
        classifyCapsPress(0)], ['hold', 'hold', 'tap', 'tap']);
});
const us = { type: 'xkb', id: 'us' }, ru = { type: 'xkb', id: 'ru' }, de = { type: 'xkb', id: 'de+nodeadkeys' };
const pinyin = { type: 'ibus', id: 'libpinyin' }, ibusUs = { type: 'ibus', id: 'xkb:us::eng' };
test('latin: xkb layouts by base layout; ibus input methods are not Latin, ibus xkb engines are', () => {
    eq([us, ru, de, pinyin, ibusUs, { type: 'xkb', id: 'gr' }].map(isLatinSource), [true, false, true, false, true, false]);
});
test('caps switch: to the most recent source of the other kind', () => {
    eq(capsSwitchTarget([ru, de, us], ru), de);
    eq(capsSwitchTarget([de, us, pinyin, ru], de), pinyin);
    eq(capsSwitchTarget([us, de], us), null);
    eq([capsSwitchApplies([us, ru]), capsSwitchApplies([us, de]), capsSwitchApplies([])], [true, false, false]);
});
test('input key: the previous source, else the next in the list', () => {
    eq(nextSource([de, us], [us, de], de), us);
    eq(nextSource([], [us, de, ru], de), ru);
    eq(nextSource([], [us], us), null);
});
test('dialog ⇪: at the trailing edge, before the field button, centred vertically', () => {
    const entry = { x: 100, y: 50, width: 300, height: 36 };
    eq(capsIconPosition(entry, null, { width: 16, height: 16 }, 8), { x: 376, y: 60 });
    eq(capsIconPosition(entry, { x: 370, y: 56, width: 24, height: 24 }, { width: 16, height: 16 }, 8), { x: 350, y: 60 });
});
test('dialog ⇪: the focused field, else the first one on screen', () => {
    eq(capsIconField([{ focused: false, shown: true }, { focused: true, shown: true }]), 1);
    eq(capsIconField([{ focused: true, shown: false }, { focused: false, shown: true }]), 1);
    eq(capsIconField([{ focused: false, shown: false }]), -1);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
