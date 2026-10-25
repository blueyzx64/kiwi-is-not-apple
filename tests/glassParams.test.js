// SPDX-License-Identifier: GPL-3.0-or-later
// gjs -m tests/glassParams.test.js
import { followRect, readSnapshot, MIN_TINTED_ALPHA, MIN_TINT_PERCENT, wantsSurface, resolve, tintAlpha, legacySurfaces, worstCaseContrast, tintColor, SETTING_FIELDS }
    from '../lib/glassParams.js';

let failed = 0;
function check(name, cond) {
    if (!cond) {
        failed++;
        print(`FAIL: ${name}`);
    }
}

const snap = (over = {}) => ({
    liquid: true, style: 'tinted', blur: 30, tint: 55, highlight: true, refraction: false,
    surfaces: ['panel', 'menus', 'dock', 'overlays'], performance: false, offInPowersave: true,
    panelBlur: false, dockBlur: true, ...over,
});
const env = (over = {}) => ({ highContrast: false, reducedMotion: false, powerSaver: false,
    dark: true, blurOk: true, ...over });

// surfaces
check('on: panel wanted', wantsSurface(snap(), 'panel'));
check('surface list respected', !wantsSurface(snap({ surfaces: ['menus'] }), 'panel'));
check('off + legacy dock-blur true -> wanted', wantsSurface(snap({ liquid: false }), 'dock'));
check('off + legacy panel-blur false -> not wanted', !wantsSurface(snap({ liquid: false }), 'panel'));
check('off: menus never wanted', !wantsSurface(snap({ liquid: false }), 'menus'));
check('on but legacy key does not add surface', !wantsSurface(snap({ surfaces: [], panelBlur: true }), 'panel'));

// tiers
check('tinted blur tier', resolve(snap(), env(), 'panel').tier === 'blur');
check('high contrast -> opaque, no highlight', (() => {
    const p = resolve(snap(), env({ highContrast: true }), 'dock');
    return p.tier === 'opaque' && p.alpha === 1 && !p.highlight;
})());
check('no blur available -> light tier, more alpha', (() => {
    const a = resolve(snap(), env(), 'dock').alpha;
    const p = resolve(snap(), env({ blurOk: false }), 'dock');
    return p.tier === 'light' && p.alpha > a;
})());
check('legacy mode: plain blur 30, no tint', (() => {
    const p = resolve(snap({ liquid: false }), env(), 'dock');
    return p.tier === 'blur' && p.legacy && p.radius === 30 && p.alpha === 0;
})());
check('legacy ignores high contrast (as before)', resolve(snap({ liquid: false }), env({ highContrast: true }), 'dock').tier === 'blur');
check('unwanted surface off', resolve(snap({ surfaces: [] }), env(), 'panel').tier === 'off');
check('reduced motion flag', resolve(snap(), env({ reducedMotion: true }), 'panel').motion === false);
check('powersave -> still', resolve(snap(), env({ powerSaver: true }), 'panel').still);
check('powersave pref off -> live', !resolve(snap({ offInPowersave: false }), env({ powerSaver: true }), 'panel').still);
check('performance -> still', resolve(snap({ performance: true }), env(), 'panel').still);
check('refraction needs blur tier', !resolve(snap({ refraction: true }), env({ blurOk: false }), 'panel').refraction
    && resolve(snap({ refraction: true }), env(), 'panel').refraction);
check('refraction forces still copy', resolve(snap({ refraction: true }), env(), 'panel').still);
check('clear halves blur', resolve(snap({ style: 'clear' }), env(), 'panel').radius === 15);
check('clear + light scheme dims', resolve(snap({ style: 'clear' }), env({ dark: false }), 'panel').dim);
check('clear + dark no dim', !resolve(snap({ style: 'clear' }), env(), 'panel').dim);

// tint maths
check('default tint alpha 0.6225', Math.abs(tintAlpha({ style: 'tinted', tint: 55, role: 'small', tier: 'blur' }) - 0.6225) < 1e-9);
check('large +0.10', Math.abs(tintAlpha({ style: 'tinted', tint: 55, role: 'large', tier: 'blur' }) - 0.7225) < 1e-9);
check('alpha capped 0.92', tintAlpha({ style: 'tinted', tint: 100, role: 'large', tier: 'light' }) === 0.92);
check('tint clamped low to the contrast floor', tintAlpha({ style: 'tinted', tint: -50, role: 'small', tier: 'blur' }) === MIN_TINTED_ALPHA);
for (const dark of [true, false]) {
    const c = worstCaseContrast(tintAlpha({ style: 'tinted', tint: 0, role: 'small', tier: 'blur' }), dark);
    check(`contrast at slider 0 (${dark ? 'dark' : 'light'}) >= 4.5 (got ${c.toFixed(2)})`, c >= 4.5);
}
check('floor is below default alpha', MIN_TINTED_ALPHA < 0.6225 && MIN_TINT_PERCENT < 55);
check('tintColor dim is black', tintColor({ dim: true, dark: false, alpha: 0.1 }) === 'rgba(0, 0, 0, 0.35)');
check('tintColor dark', tintColor({ dim: false, dark: true, alpha: 0.5 }) === 'rgba(28, 28, 30, 0.500)');

// acceptance: contrast >= 4.5 at default tint, small and large, both schemes
for (const dark of [true, false]) {
    for (const role of ['small', 'large']) {
        const a = tintAlpha({ style: 'tinted', tint: 55, role, tier: 'blur' });
        const c = worstCaseContrast(a, dark);
        check(`contrast ${dark ? 'dark' : 'light'}/${role} >= 4.5 (got ${c.toFixed(2)})`, c >= 4.5);
    }
}
check('thin tint fails contrast (sanity)', worstCaseContrast(0.2, true) < 4.5);

// migration
check('migrate: none set -> null', legacySurfaces({ panelBlur: null, dockBlur: null }) === null);
check('migrate: panel on, dock default', JSON.stringify(legacySurfaces({ panelBlur: true, dockBlur: null }))
    === JSON.stringify(['panel', 'dock', 'menus', 'overlays']));
check('migrate: dock off only', JSON.stringify(legacySurfaces({ panelBlur: null, dockBlur: false }))
    === JSON.stringify(['menus', 'overlays']));
check('migrate: both off', JSON.stringify(legacySurfaces({ panelBlur: false, dockBlur: false }))
    === JSON.stringify(['menus', 'overlays']));

check('every field has a key', Object.keys(SETTING_FIELDS).length === 11);

// Glass.wants(surface, gs) reads a passed Gio.Settings fresh (no stale snapshot)
{
    const store = { 'liquid-glass': true, 'liquid-glass-surfaces': ['panel'] };
    const fake = {
        settings_schema: { has_key: k => k in store },
        get_boolean: k => store[k], get_int: k => store[k], get_string: k => store[k], get_strv: k => store[k],
    };
    check('fresh read: dock off', !wantsSurface(readSnapshot(fake), 'dock'));
    store['liquid-glass-surfaces'] = ['panel', 'dock'];
    check('fresh read: dock on right after the change', wantsSurface(readSnapshot(fake), 'dock'));
    check('missing keys fall back to defaults', readSnapshot(fake).style === 'tinted');
}

// followRect: never NaN, never 0-size
check('rect: plain child', JSON.stringify(followRect({ x: 1, y: 2, width: 30, height: 40 })) === '{"x":1,"y":2,"width":30,"height":40}');
check('rect: zero width -> null', followRect({ x: 0, y: 0, width: 0, height: 10 }) === null);
check('rect: NaN size -> null', followRect({ x: 0, y: 0, width: NaN, height: 10 }) === null);
check('rect: NaN transformed position -> null', followRect({ x: 0, y: 0, width: 5, height: 5 }, [NaN, 3], [0, 0]) === null);
check('rect: one position missing -> null', followRect({ x: 0, y: 0, width: 5, height: 5 }, [1, 1], null) === null);
check('rect: transformed difference', JSON.stringify(followRect({ x: 9, y: 9, width: 5, height: 6 }, [110, 220], [100, 200]))
    === '{"x":10,"y":20,"width":5,"height":6}');
check('rect: undefined -> null', followRect({ x: undefined, y: 0, width: 5, height: 5 }) === null);

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
print('glassParams: all ok');
