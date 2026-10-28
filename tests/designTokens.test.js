// Run: gjs -m tests/designTokens.test.js
import { ICON_WELL, RADIUS, SEARCH_BAR, SPACE, TOOLBAR, iconSizeFor, innerRadius, wellClasses } from '../lib/designTokens.js';

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
        throw new Error(msg);
}

test('spacing is the 4 px grid', () => {
    eq(Object.values(SPACE), [4, 8, 12, 16, 20]);
});

test('radii ascend from controls to capsules, within the agreed ranges', () => {
    ok(RADIUS.control < RADIUS.row && RADIUS.row < RADIUS.menu && RADIUS.menu < RADIUS.card, 'order');
    ok(RADIUS.card >= 16 && RADIUS.card <= 20, 'cards 16-20');
    ok(RADIUS.panel >= 24 && RADIUS.panel <= 28, 'panels 24-28');
    eq(RADIUS.capsule, 999);
});

test('icon wells: the icon fits inside the box, glyphs are smaller', () => {
    for (const [name, w] of Object.entries(ICON_WELL)) {
        ok(w.icon < w.box && w.glyph < w.icon, name);
        ok((w.box - w.icon) % 2 === 0, `${name} centred`);
    }
    eq(iconSizeFor('M'), 28);
    eq(iconSizeFor('M', true), 18);
    eq(iconSizeFor('nope'), ICON_WELL.M.icon);
});

test('well classes', () => {
    eq(wellClasses('L'), 'kiwi-icon-well kiwi-icon-well-l');
    eq(wellClasses('S', 'circle'), 'kiwi-icon-well kiwi-icon-well-s kiwi-icon-well-circle');
    eq(wellClasses('?', 'blob'), 'kiwi-icon-well kiwi-icon-well-m');
});

test('toolbar buttons fit the search bar; concentric radii', () => {
    ok(TOOLBAR.button < SEARCH_BAR.height, 'button inside the bar');
    eq((SEARCH_BAR.height - TOOLBAR.button) % 2, 0);
    eq(innerRadius(RADIUS.panel, SPACE.s), RADIUS.card);
    eq(innerRadius(RADIUS.card, SPACE.s), RADIUS.row);
    eq(innerRadius(4, 8), 0);
});

if (failed > 0)
    throw new Error(`${failed} test(s) failed`);
print('designTokens: all passed');
