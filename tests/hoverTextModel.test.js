// Run: gjs -m tests/hoverTextModel.test.js
// features/hoverText/model.js: settings, the triple-press lock, extents mapping, text windows,
// placement, colours.
import {
    MODIFIERS, ModifierLock, PANEL_GAP, ROLE, SCREEN_MARGIN, TRIPLE_MS, anyOn, colorHex, contains, isFocusGained,
    isSecret, luminance, parseColor, placePanel, readConfig, ringRect, textWindow, toStage, toWindow, typingWindow,
} from '../features/hoverText/model.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const DEFAULTS = {
    'hover-text': false, 'hover-typing': false, 'hover-color': false, 'hover-focus-highlight': false,
    'hover-modifier': 'super', 'hover-text-size': 36, 'hover-typing-size': 36, 'hover-text-color': '',
    'hover-background-color': '', 'hover-highlight-color': '', 'hover-insertion-point-color': '',
    'hover-typing-position': 'caret', 'hover-focus-color': '', 'hover-focus-width': 3,
    'hover-focus-contrast': false, 'hover-focus-autohide': 0,
};
const reader = v => ({ bool: k => v[k], int: k => v[k], string: k => v[k] });

test('config: defaults are all off, Super, caret; bad values fall back', () => {
    const c = readConfig(reader(DEFAULTS));
    eq([c.text, c.typing, c.color, c.focus, anyOn(c)], [false, false, false, false, false]);
    eq([c.modifier, c.typingPosition, c.textSize, c.focusWidth, c.textColor], ['super', 'caret', 36, 3, null]);
    const bad = readConfig(reader({ ...DEFAULTS, 'hover-modifier': 'hyper', 'hover-typing-position': 'middle',
        'hover-text-size': 900, 'hover-focus-width': 0, 'hover-text-color': 'red', 'hover-focus-color': '#FF0000' }));
    eq([bad.modifier, bad.typingPosition, bad.textSize, bad.focusWidth, bad.textColor, bad.focusColor],
        ['super', 'caret', 128, 1, null, '#ff0000']);
    eq(anyOn(readConfig(reader({ ...DEFAULTS, 'hover-focus-highlight': true }))), true);
});

test('modifier: held is active, release ends it', () => {
    const l = new ModifierLock(MODIFIERS.super);
    eq(l.update(MODIFIERS.super, 0), { changed: true, lockToggled: false, pressed: true, released: false });
    eq(l.active, true);
    eq(l.update(MODIFIERS.super | MODIFIERS.shift, 10).changed, false, 'another modifier');
    eq(l.update(0, 2000).released, true);
    eq(l.active, false);
});

test('modifier: other modifiers alone do nothing', () => {
    const l = new ModifierLock(MODIFIERS.ctrl);
    eq(l.update(MODIFIERS.super | MODIFIERS.alt, 0).changed, false);
    eq(l.active, false);
});

test('modifier: a quick triple press locks, another unlocks', () => {
    const l = new ModifierLock(MODIFIERS.alt);
    const tap = t => {
        const press = l.update(MODIFIERS.alt, t);
        l.update(0, t + 60);
        return press;
    };
    tap(0);
    eq(l.repeating, false);
    tap(200);
    eq(l.repeating, true, 'second press');
    eq(tap(400).lockToggled, true);
    eq([l.locked, l.active], [true, true]);
    tap(5000); tap(5200);
    eq(l.locked, true, 'two presses do not unlock');
    tap(5400);
    eq([l.locked, l.active], [false, false]);
});

test('modifier: slow presses never lock; the window restarts', () => {
    const l = new ModifierLock(MODIFIERS.super);
    let t = 0;
    for (let i = 0; i < 5; i++) {
        l.update(MODIFIERS.super, t);
        l.update(0, t + 50);
        t += TRIPLE_MS + 100;
    }
    eq(l.locked, false);
    // two slow, then three quick
    l.update(MODIFIERS.super, t); l.update(0, t + 10);
    l.update(MODIFIERS.super, t + 100); l.update(0, t + 110);
    eq(l.update(MODIFIERS.super, t + 200).lockToggled, true);
    l.reset();
    eq([l.locked, l.held], [false, false]);
});

test('extents: window to stage through the buffer rect; empty or outside is null', () => {
    const buffer = { x: 100, y: 50, width: 800, height: 600 };
    eq(toStage({ x: 10, y: 20, width: 30, height: 40 }, buffer), { x: 110, y: 70, width: 30, height: 40 });
    eq(toStage({ x: 10, y: 20, width: 0, height: 40 }, buffer), null);
    eq(toStage({ x: 900, y: 20, width: 10, height: 10 }, buffer), null);
    eq(toStage({ x: -5, y: -5, width: 10, height: 10 }, buffer), { x: 95, y: 45, width: 10, height: 10 });
    eq(toStage({ x: NaN, y: 0, width: 1, height: 1 }, buffer), null);
    eq(toWindow({ x: 150.4, y: 80.6 }, buffer), { x: 50, y: 31 });
    eq([contains(buffer, 100, 50), contains(buffer, 900, 50), contains(null, 0, 0)], [true, false, false]);
});

test('text window: short text whole, whitespace collapsed', () => {
    eq(textWindow('  Hello\n  world  ', 3), 'Hello world');
});

test('text window: long text around the offset, cut at words, ellipses', () => {
    const words = Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ');
    const at = words.indexOf('w100');
    const out = textWindow(words, at, 60);
    if (!out.startsWith('…') || !out.endsWith('…'))
        throw new Error(`no ellipses: ${out}`);
    if (!out.includes('w100'))
        throw new Error(`offset not inside: ${out}`);
    if (out.length > 62)
        throw new Error(`too long: ${out.length}`);
    eq(/…w\d+ /.test(out), true, 'starts on a whole word');
    const head = textWindow(words, -1, 60);
    eq([head.startsWith('w0 '), head.endsWith('…')], [true, true]);
});

test('typing window: the caret line, more before the caret than after', () => {
    eq(typingWindow('first line\nhello wor|ld\nlast', 20), { before: 'hello wor', after: '|ld' });
    eq(typingWindow('abc', 99), { before: 'abc', after: '' });
    const long = 'x'.repeat(300);
    const w = typingWindow(long, 300, 100);
    eq([w.before.startsWith('…'), w.before.length, w.after], [true, 101, '']);
    const mid = typingWindow(long, 150, 100);
    eq([mid.before.length - 1, mid.after.length - 1], [75, 25]);
});

const area = { x: 0, y: 32, width: 1280, height: 768 };
const size = { width: 300, height: 80 };
test('place: below the caret, above it at the bottom, clamped', () => {
    eq(placePanel({ position: 'caret', anchor: { x: 100, y: 200, width: 2, height: 18 }, size, area }),
        { x: 100, y: 200 + 18 + PANEL_GAP });
    eq(placePanel({ position: 'caret', anchor: { x: 1200, y: 760, width: 2, height: 18 }, size, area }),
        { x: 1280 - 300 - SCREEN_MARGIN, y: 760 - PANEL_GAP - 80 });
});
test('place: by the pointer, flipped at the right and bottom edges', () => {
    eq(placePanel({ position: 'pointer', pointer: { x: 100, y: 100 }, size, area }),
        { x: 100 + PANEL_GAP, y: 100 + PANEL_GAP });
    eq(placePanel({ position: 'pointer', pointer: { x: 1200, y: 760 }, size, area }),
        { x: 1200 - PANEL_GAP - 300, y: 760 - PANEL_GAP - 80 });
});
test('place: corners of the area', () => {
    eq(placePanel({ position: 'top-left', size, area }), { x: SCREEN_MARGIN, y: 32 + SCREEN_MARGIN });
    eq(placePanel({ position: 'bottom-right', size, area }),
        { x: 1280 - 300 - SCREEN_MARGIN, y: 800 - 80 - SCREEN_MARGIN });
});

test('ring: just outside the rect', () => {
    eq(ringRect({ x: 10, y: 10, width: 100, height: 20 }, 3), { x: 6, y: 6, width: 108, height: 28 });
});

test('colours: hex out, parse in, luminance', () => {
    eq(colorHex({ red: 255, green: 128, blue: 0 }), '#FF8000');
    eq(colorHex({ red: 300, green: -4, blue: 15.6 }), '#FF0010');
    eq([parseColor('#AbCdEf'), parseColor('#11223344'), parseColor(''), parseColor('blue')],
        ['#abcdef', '#11223344', null, null]);
    eq([luminance('#ffffff') > 0.99, luminance('#000000'), luminance('nope')], [true, 0, 0]);
});

test('events and roles: focus gained, password fields are secret', () => {
    eq([isFocusGained('focused', 1), isFocusGained('focused', 0), isFocusGained('selected', 1)], [true, false, false]);
    eq([isSecret(ROLE.PASSWORD_TEXT), isSecret(61)], [true, false]);
});

if (failed)
    throw new Error(`${failed} test(s) failed`);
