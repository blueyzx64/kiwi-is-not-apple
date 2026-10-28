// Run: gjs -m tests/screenCornersModel.test.js
import { RADIUS_DEFAULT, RADIUS_MAX, RADIUS_MIN, clampRadius, cornerCaps } from '../features/screenCorners/model.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b) {
    const ja = JSON.stringify(a), jb = JSON.stringify(b);
    if (ja !== jb)
        throw new Error(`expected ${jb}, got ${ja}`);
}

const MON = { x: 0, y: 0, width: 1920, height: 1080 };

test('clampRadius: inside the range, junk is the default', () => {
    eq(clampRadius(12), 12);
    eq(clampRadius(1), RADIUS_MIN);
    eq(clampRadius(100), RADIUS_MAX);
    eq(clampRadius('x'), RADIUS_DEFAULT);
    eq(clampRadius(10.6), 11);
});

test('cornerCaps: top corners only by default, mirrored for the right', () => {
    eq(cornerCaps(MON, 12, 'top'), [
        { corner: 'top-left', x: 0, y: 0, size: 12, flipX: false, flipY: false },
        { corner: 'top-right', x: 1908, y: 0, size: 12, flipX: true, flipY: false },
    ]);
    eq(cornerCaps(MON, 12, 'junk').length, 2);
});

test('cornerCaps: all four, on a second monitor', () => {
    const caps = cornerCaps({ x: 1920, y: 100, width: 1280, height: 800 }, 10, 'all');
    eq(caps.map(c => [c.corner, c.x, c.y, c.flipX, c.flipY]), [
        ['top-left', 1920, 100, false, false],
        ['top-right', 3190, 100, true, false],
        ['bottom-right', 3190, 890, true, true],
        ['bottom-left', 1920, 890, false, true],
    ]);
});

if (failed) {
    print(`${failed} test(s) failed`);
    imports.system.exit(1);
}
