// Run: gjs -m tests/batteryModel.test.js
import { shouldShowLabel } from '../apps/batteryModel.js';

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
    if (a !== b)
        throw new Error(`expected ${b}, got ${a}`);
}

test('shows at the threshold while discharging', () => eq(shouldShowLabel(20, 2, 20), true));
test('shows below the threshold, even if the exact value was skipped', () => eq(shouldShowLabel(19, 2, 20), true));
test('hidden above the threshold', () => eq(shouldShowLabel(21, 2, 20), false));
test('hidden while charging below the threshold', () => eq(shouldShowLabel(10, 1, 20), false));
test('hidden when full or unknown', () => {
    eq(shouldShowLabel(10, 4, 20), false);
    eq(shouldShowLabel(10, 0, 20), false);
});

if (failed > 0)
    imports.system.exit(1);
