// SPDX-License-Identifier: GPL-3.0-or-later
// Pure maths and decisions for GlassService: which surfaces get glass, which tier
// each one renders in, and the numbers (blur radius, tint alpha) that follow.
// No gi imports, so tests/glassParams.test.js runs it under plain `gjs -m`.

export const SURFACES = ['panel', 'menus', 'dock', 'overlays'];

/** GSettings key -> snapshot field, with the schema default used if the key is missing. */
export const SETTING_FIELDS = {
    'liquid-glass': ['liquid', true],
    'liquid-glass-style': ['style', 'tinted'],
    'liquid-glass-blur': ['blur', 30],
    'liquid-glass-tint': ['tint', 55],
    'liquid-glass-highlight': ['highlight', true],
    'liquid-glass-refraction': ['refraction', false],
    'liquid-glass-surfaces': ['surfaces', ['panel', 'menus', 'dock', 'overlays']],
    'liquid-glass-performance': ['performance', false],
    'liquid-glass-off-in-powersave': ['offInPowersave', true],
    // Legacy keys: still honoured as plain blur while Liquid Glass is off.
    'panel-blur': ['panelBlur', false],
    'dock-blur': ['dockBlur', true],
};

const LEGACY_FIELD = { panel: 'panelBlur', dock: 'dockBlur' };
export const LEGACY_RADIUS = 30;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Does this surface get glass, either from Liquid Glass or from its legacy blur key? */
export function wantsSurface(snap, surface) {
    if (snap.liquid && snap.surfaces.includes(surface))
        return true;
    const legacy = LEGACY_FIELD[surface];
    return !snap.liquid && !!legacy && !!snap[legacy];
}

/**
 * Tint opacity. Tinted: 0.10 + 0.95 * t, so the default t = 0.55 gives 0.62, the
 * least that keeps text at 4.5:1 over the worst wallpaper (see worstCaseContrast).
 * Clear: a thin veil. Large surfaces (menus, Control Center) get +0.10.
 */
export function tintAlpha({ style, tint, role, tier }) {
    const t = clamp(tint, 0, 100) / 100;
    // Tinted never goes below the alpha that keeps text at 4.5:1 (MIN_TINTED_ALPHA)
    let a = style === 'clear' ? 0.04 + 0.12 * t : Math.max(0.10 + 0.95 * t, MIN_TINTED_ALPHA);
    if (role === 'large')
        a += 0.10;
    if (tier === 'light')
        a += 0.15;
    return clamp(a, 0, 0.92);
}

/**
 * Build the render parameters for one surface.
 *
 * @param {object} snap settings snapshot (SETTING_FIELDS values)
 * @param {{highContrast:boolean, reducedMotion:boolean, powerSaver:boolean,
 *          dark:boolean, blurOk:boolean}} env
 * @param {string} surface
 * @param {'small'|'large'} role
 * @returns {object} tier 'off'|'blur'|'light'|'opaque', plus the numbers
 */
export function resolve(snap, env, surface, role = 'small') {
    const off = { tier: 'off', legacy: false, radius: 0, brightness: 1, alpha: 0, dim: false,
        highlight: false, still: false, refraction: false, dark: env.dark, motion: !env.reducedMotion };

    if (!wantsSurface(snap, surface))
        return off;

    // Liquid Glass is off: the old Panel Blur / Dock Blur, exactly as before.
    if (!snap.liquid)
        return { ...off, tier: 'blur', legacy: true, radius: LEGACY_RADIUS };

    if (env.highContrast)
        return { ...off, tier: 'opaque', alpha: 1 };

    const clear = snap.style === 'clear';
    const perf = snap.performance || (snap.offInPowersave && env.powerSaver);
    const tier = env.blurOk ? 'blur' : 'light';
    // Clear glass over a bright (light scheme) backdrop needs a 35 % black dim layer.
    const dim = clear && !env.dark;
    return {
        ...off,
        tier,
        radius: Math.round(clamp(snap.blur, 0, 100) * (clear ? 0.5 : 1)),
        // There is no blur any more (plain translucent fills); the Blur slider makes the
        // fill more frosted, i.e. a little more opaque. 0..1.
        frost: clamp(snap.blur, 0, 100) / 100,
        brightness: clear ? 1 : 0.95,
        alpha: tintAlpha({ style: snap.style, tint: snap.tint, role, tier }),
        dim,
        highlight: snap.highlight,
        // Refraction needs the still wallpaper copy: a shader can only bend the texture of
        // the actor it sits on, not the live backdrop.
        still: tier === 'blur' && (perf || snap.refraction),
        refraction: tier === 'blur' && snap.refraction,
    };
}

/** Migration of the old blur toggles into liquid-glass-surfaces. null = nothing to do. */
export function legacySurfaces({ panelBlur, dockBlur }) {
    // panelBlur / dockBlur: true/false when the user set them, null when still default.
    if (panelBlur === null && dockBlur === null)
        return null;
    const list = ['menus', 'overlays'];
    if (panelBlur ?? false)
        list.unshift('panel');
    if (dockBlur ?? true)
        list.splice(list.includes('panel') ? 1 : 0, 0, 'dock');
    return list;
}

/** sRGB (0-255 channel) to relative luminance. */
function lum(r, g, b) {
    const f = c => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export const TINT_DARK = [28, 28, 30];
export const TINT_LIGHT = [246, 246, 248];
const TEXT_ON_DARK = [255, 255, 255];
const TEXT_ON_LIGHT = [36, 36, 38];

/**
 * WCAG contrast of text on the tint at `alpha`, over the worst wallpaper pixel:
 * pure white under dark glass, pure black under light glass. Blur only averages
 * the backdrop, so a flat worst case bounds it. Ignores the brightness multiplier.
 */
export function worstCaseContrast(alpha, dark) {
    const tint = dark ? TINT_DARK : TINT_LIGHT;
    const back = dark ? 255 : 0;
    const bg = tint.map(c => c * alpha + back * (1 - alpha));
    const fg = dark ? TEXT_ON_DARK : TEXT_ON_LIGHT;
    const l1 = lum(...bg);
    const l2 = lum(...fg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** CSS colour for the tint layer: black dim, else scheme tint. */
export function tintColor(params) {
    if (params.dim)
        return `rgba(0, 0, 0, ${0.35})`;
    const [r, g, b] = params.dark ? TINT_DARK : TINT_LIGHT;
    return `rgba(${r}, ${g}, ${b}, ${params.alpha.toFixed(3)})`;
}

/** Fill alpha buckets are FILL_STEP percent apart (stylesheet.css has one rule per bucket). */
export const FILL_STEP = 5;
const FROST_ALPHA = 0.12;   // alpha the Blur slider adds at 100
const MAX_FILL_ALPHA = 0.95;

/** Lowest fill per surface; content behind must not compete with the surface's own text. */
export const SURFACE_MIN_ALPHA = { menus: 0.85, overlays: 0.85, dock: 0.55, panel: 0 };

/** Opacity of the translucent fill: the tint alpha plus the frost from the Blur slider. */
export function fillAlpha(params) {
    if (params.tier === 'opaque')
        return 1;
    return clamp(params.alpha + FROST_ALPHA * (params.frost ?? 0), 0, MAX_FILL_ALPHA);
}

/**
 * Style classes that give a surface its translucent fill (see the Liquid Glass section of
 * stylesheet.css). The fill is the actor's own background, so it follows its border-radius.
 * Empty when the surface draws no glass.
 *
 * @param {object} params resolve() result
 * @param {string} surface 'panel' | 'menus' | 'dock' | 'overlays'
 * @returns {string[]}
 */
export function fillClasses(params, surface) {
    if (!params || params.tier === 'off' || params.legacy)
        return [];
    const classes = ['kiwi-glass-fill', `kiwi-glass-${surface}`,
        params.dark ? 'kiwi-glass-dark' : 'kiwi-glass-light'];
    if (params.dim && params.tier !== 'opaque') {
        classes.push('kiwi-glass-dim');
    } else {
        // Without blur behind it, a menu or overlay needs a fairly solid fill to stay readable
        const alpha = Math.max(fillAlpha(params), SURFACE_MIN_ALPHA[surface] ?? 0);
        const bucket = Math.round(alpha * 100 / FILL_STEP) * FILL_STEP;
        classes.push(`kiwi-glass-a${clamp(bucket, FILL_STEP, 100)}`);
    }
    if (params.tier === 'opaque')
        classes.push('kiwi-glass-opaque');
    else if (params.highlight)
        classes.push('kiwi-glass-highlight');
    if (!params.motion)
        classes.push('kiwi-glass-static');
    return classes;
}

/**
 * Read every glass-related setting from a Gio.Settings (duck-typed so tests can fake it).
 * Keys missing from the schema fall back to their defaults, so the service also works
 * before the schema fragment is merged.
 */
export function readSnapshot(gs) {
    const schema = gs?.settings_schema;
    const snap = {};
    for (const [key, [field, dflt]] of Object.entries(SETTING_FIELDS)) {
        let v = dflt;
        if (gs && (!schema || schema.has_key(key))) {
            if (typeof dflt === 'boolean')
                v = gs.get_boolean(key);
            else if (typeof dflt === 'number')
                v = gs.get_int(key);
            else if (typeof dflt === 'string')
                v = gs.get_string(key);
            else
                v = gs.get_strv(key);
        }
        snap[field] = v;
    }
    return snap;
}

/** Smallest Tinted alpha that keeps worst-case contrast >= 4.5:1 in both schemes. */
export const MIN_TINTED_ALPHA = (() => {
    for (let a = 0; a <= 1; a += 0.005) {
        if (worstCaseContrast(a, true) >= 4.5 && worstCaseContrast(a, false) >= 4.5)
            return Math.ceil(a * 1000) / 1000;
    }
    return 0.92;
})();

/** Tint slider percent below which Tinted style is clamped to MIN_TINTED_ALPHA. */
export const MIN_TINT_PERCENT = Math.ceil((MIN_TINTED_ALPHA - 0.10) / 0.95 * 100);

// The user's own value of a boolean key, or null when it is unset or missing.
function _userBool(gs, key) {
    if (gs.settings_schema && !gs.settings_schema.has_key(key))
        return null;
    const v = gs.get_user_value(key);
    return v === null ? null : v.get_boolean();
}

// panel-blur / dock-blur -> liquid-glass-surfaces. Both entries map from both old keys, so
// whichever runs first writes the combined list and the other is skipped (`to` is then set).
const _surfacesFromLegacy = (_value, gs) =>
    legacySurfaces({ panelBlur: _userBool(gs, 'panel-blur'), dockBlur: _userBool(gs, 'dock-blur') }) ?? [];

/** Old key -> new key, for runMigrations (run once from extension.js enable()). */
export const MIGRATIONS = [
    { from: 'panel-blur', to: 'liquid-glass-surfaces', map: _surfacesFromLegacy },
    { from: 'dock-blur', to: 'liquid-glass-surfaces', map: _surfacesFromLegacy },
];

/**
 * The glass rectangle in parent coordinates, or null while the geometry is not usable.
 * An actor without an allocation reports NaN from get_transformed_position(), and a
 * 0x0 target has nothing to glass; both mean "wait for the next allocation".
 *
 * @param {{x:number, y:number, width:number, height:number}} own target x/y/size
 * @param {number[]|null} targetPos transformed [x, y] of the target, null when it is a child of parent
 * @param {number[]|null} parentPos transformed [x, y] of the parent, null as above
 * @returns {{x:number, y:number, width:number, height:number}|null}
 */
export function followRect(own, targetPos = null, parentPos = null) {
    let { x, y } = own;
    const { width, height } = own;
    if (targetPos || parentPos) {
        if (!targetPos || !parentPos)
            return null;
        x = targetPos[0] - parentPos[0];
        y = targetPos[1] - parentPos[1];
    }
    const nums = [x, y, width, height];
    if (!nums.every(Number.isFinite) || width <= 0 || height <= 0)
        return null;
    return { x, y, width, height };
}

/** Power-profile D-Bus services, preferred first (GNOME 50+ / tuned-ppd, then old ppd). */
export const POWER_PROFILE_SERVICES = [
    ['org.freedesktop.UPower.PowerProfiles', '/org/freedesktop/UPower/PowerProfiles'],
    ['net.hadess.PowerProfiles', '/net/hadess/PowerProfiles'],
];

/**
 * Which proxy to follow: the first whose name has an owner; if none is owned yet,
 * the first one created (it notifies when its daemon appears).
 *
 * @param {Array<{g_name_owner: string|null}|null>} proxies same order as POWER_PROFILE_SERVICES
 */
export function pickPowerProxy(proxies) {
    return proxies.find(p => p?.g_name_owner) ?? proxies.find(p => p) ?? null;
}

/** ActiveProfile -> Power Saver on? */
export const isPowerSaver = profile => profile === 'power-saver';
