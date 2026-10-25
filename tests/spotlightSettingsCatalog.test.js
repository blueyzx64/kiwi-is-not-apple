// Run: gjs -m tests/spotlightSettingsCatalog.test.js
import { settingsItems, PANELS, KIWI_TOGGLES } from '../apps/spotlight/providers/settingsCatalog.js';
import { rank, usageBoost } from '../apps/spotlight/model.js';

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
const _ = s => s;
const env = (over = {}) => ({ has: () => true, read: () => false, panelsAvailable: true, ...over });

test('panels are unique', () => eq(new Set(PANELS.map(p => p.panel)).size, PANELS.length));
test('every panel name is safe for a command line', () => {
    for (const p of PANELS) {
        if (!/^[a-z-]+$/.test(p.panel))
            throw new Error(p.panel);
    }
});
test('no panels when Settings is missing', () =>
    eq(settingsItems(_, env({ panelsAvailable: false })).some(i => i.action.type === 'panel'), false));
test('toggle hidden when the key does not exist', () => {
    const ids = settingsItems(_, env({ has: k => k === 'liquid-glass' })).map(i => i.id);
    eq(ids.includes('kiwi:liquid-glass'), true);
    eq(ids.includes('kiwi:stage-manager'), false);
});
test('toggle flips the current value', () => {
    const on = settingsItems(_, env({ read: () => true })).find(i => i.id === 'kiwi:liquid-glass');
    eq(on.action, { type: 'toggle', key: 'liquid-glass', to: false });
    const off = settingsItems(_, env()).find(i => i.id === 'kiwi:liquid-glass');
    eq(off.action.to, true);
});
test('toggle keys are in the catalog list', () => eq(KIWI_TOGGLES.map(t => t.key), ['liquid-glass', 'stage-manager']));
test('search finds Wi-Fi by keyword', () => {
    const r = rank(settingsItems(_, env()), 'wireless');
    eq(r[0].action.panel === 'wifi' || r[0].action.panel === 'bluetooth', true);
});
test('search finds Liquid Glass', () => eq(rank(settingsItems(_, env()), 'liquid')[0].id, 'kiwi:liquid-glass'));
test('usageBoost falls off and floors at 0', () => {
    eq(usageBoost(0) > usageBoost(3), true);
    eq(usageBoost(50), 0);
    eq(usageBoost(-1), 0);
});

if (failed > 0)
    throw new Error(`${failed} test(s) failed`);
print('settingsCatalog: all passed');
