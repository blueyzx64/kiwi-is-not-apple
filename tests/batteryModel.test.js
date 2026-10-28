// Run: gjs -m tests/batteryModel.test.js
import { BATTERY_STATE, batteryDetails, batteryTime } from '../lib/batteryModel.js';

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

test('batteryTime: remaining while discharging', () => {
    eq(batteryTime({ state: BATTERY_STATE.DISCHARGING, toEmpty: 5400, toFull: 0 }), { kind: 'remaining', hours: 1, minutes: 30 });
    eq(batteryTime({ state: BATTERY_STATE.FULLY_CHARGED, toEmpty: 0, toFull: 0 }), null);
});

test('batteryDetails: Option-click lines from what UPower knows', () => {
    eq(batteryDetails({ EnergyRate: 7.25, Energy: 40, EnergyFull: 52.5 }), [
        { kind: 'rate', text: '7.3 W' }, { kind: 'energy', text: '40.0 / 52.5 Wh' },
    ]);
    eq(batteryDetails({ EnergyRate: 0, Energy: 40, EnergyFull: 0 }), []);
    eq(batteryDetails(null), []);
});

if (failed)
    throw new Error(`${failed} failed`);
