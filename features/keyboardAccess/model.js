// SPDX-License-Identifier: GPL-3.0-or-later
// Keyboard accessibility (macOS System Settings > Accessibility > Keyboard). Pure: no gi, so
// it runs under `gjs -m`.
//
//   Sticky Keys HUD   "Display pressed keys on screen": the latched and locked modifiers as
//                     ⌃ ⌥ ⇧ ⌘ in a screen corner (locked ones drawn filled, as macOS does)
//   Zoom follows      macOS's "Follow keyboard focus: always / only when typing / never" on
//                     GNOME's magnifier focus-tracking and caret-tracking
//   Keyboard Viewer   the current XKB layout drawn as a keyboard; each key shows what it types
//                     at the level the held modifiers select. The layout comes from the XKB
//                     symbols files (parseSymbols / resolveKeys), the geometry is a fixed
//                     ANSI/ISO board (ROWS)

// ---- settings ----------------------------------------------------------------------------

export const CORNERS = Object.freeze(['top-right', 'top-left', 'bottom-right', 'bottom-left']);
export const ZOOM_FOLLOW = Object.freeze(['system', 'always', 'typing', 'never']);

/** Settings in, plain config out. `get` is a KiwiSettings-like reader. */
export function readConfig(get) {
    const corner = get.string('kbd-a11y-sticky-corner');
    const follow = get.string('kbd-a11y-zoom-follow');
    return {
        stickyDisplay: get.bool('kbd-a11y-sticky-display'),
        corner: CORNERS.includes(corner) ? corner : 'top-right',
        slowKeysIndicator: get.bool('kbd-a11y-slowkeys-indicator'),
        zoomFollow: ZOOM_FOLLOW.includes(follow) ? follow : 'system',
    };
}

// ---- Sticky Keys HUD -----------------------------------------------------------------------

// XKB real modifier bits (the masks of Clutter.Seat::kbd-a11y-mods-state-changed)
export const MOD = Object.freeze({ SHIFT: 1, LOCK: 2, CONTROL: 4, MOD1: 8, MOD4: 64, MOD5: 128 });

// macOS order: Control, Option, Shift, Command. Alt (and AltGr) is Option, Super is Command.
const GLYPHS = Object.freeze([
    { id: 'control', glyph: '⌃', masks: [MOD.CONTROL] },
    { id: 'option', glyph: '⌥', masks: [MOD.MOD1, MOD.MOD5] },
    { id: 'shift', glyph: '⇧', masks: [MOD.SHIFT] },
    { id: 'command', glyph: '⌘', masks: [MOD.MOD4] },
]);

/**
 * The modifiers to show, in macOS order.
 *
 * @param {number} latched mask: pressed once, applies to the next key
 * @param {number} locked mask: pressed twice, stays until pressed again
 * @returns {{id: string, glyph: string, state: 'latched'|'locked'}[]}
 */
export function stickyGlyphs(latched, locked) {
    const out = [];
    for (const g of GLYPHS) {
        if (g.masks.some(m => locked & m))
            out.push({ id: g.id, glyph: g.glyph, state: 'locked' });
        else if (g.masks.some(m => latched & m))
            out.push({ id: g.id, glyph: g.glyph, state: 'latched' });
    }
    return out;
}

/**
 * What the HUD shows, or null when it should hide.
 *
 * @param {{stickyKeys: boolean, slowKeys: boolean, latched: number, locked: number}} state
 * @param {object} config readConfig()
 * @returns {?{glyphs: object[], slowKeys: boolean}}
 */
export function hudContent(state, config) {
    const glyphs = state.stickyKeys && config.stickyDisplay ? stickyGlyphs(state.latched, state.locked) : [];
    const slowKeys = !!(state.slowKeys && config.slowKeysIndicator);
    return glyphs.length || slowKeys ? { glyphs, slowKeys } : null;
}

export const HUD_MARGIN = 16;

/**
 * Where the HUD goes: the chosen corner of the work area, HUD_MARGIN in.
 *
 * @param {{corner: string, size: {width, height}, area: {x, y, width, height}}} p
 * @returns {{x: number, y: number}}
 */
export function hudPosition({ corner, size, area }) {
    const right = corner.endsWith('right');
    const bottom = corner.startsWith('bottom');
    const x = right ? area.x + area.width - size.width - HUD_MARGIN : area.x + HUD_MARGIN;
    const y = bottom ? area.y + area.height - size.height - HUD_MARGIN : area.y + HUD_MARGIN;
    return { x: Math.round(x), y: Math.round(y) };
}

// ---- Zoom follows keyboard focus -----------------------------------------------------------

/**
 * GNOME magnifier tracking for a macOS "Follow keyboard focus" choice; null = leave GNOME's.
 * The image moves "just enough to show the item" (push), macOS's quieter option.
 *
 * @param {string} mode ZOOM_FOLLOW
 * @returns {?{focus: string, caret: string}}
 */
export function zoomTracking(mode) {
    switch (mode) {
    case 'always': return { focus: 'push', caret: 'push' };
    case 'typing': return { focus: 'none', caret: 'push' };
    case 'never': return { focus: 'none', caret: 'none' };
    default: return null;
    }
}

// ---- Accessibility Shortcuts panel ---------------------------------------------------------

/** The switches the panel lists (lib/a11ySettingsModel.js ids), in macOS's order. */
export const PANEL_SWITCHES = Object.freeze([
    'zoom', 'screen-reader', 'sticky-keys', 'slow-keys', 'bounce-keys', 'mouse-keys',
    'screen-keyboard', 'high-contrast', 'reduce-motion', 'locate-pointer',
]);

// ---- XKB symbols ---------------------------------------------------------------------------

/** "de+nodeadkeys" / "de(nodeadkeys)" -> {layout: 'de', variant: 'nodeadkeys'} */
export function splitXkbId(id) {
    const s = String(id ?? '').trim();
    let m = s.match(/^([^+()]+)\+(.+)$/);
    if (m)
        return { layout: m[1], variant: m[2] };
    m = s.match(/^([^()]+)\(([^()]+)\)$/);
    if (m)
        return { layout: m[1], variant: m[2] };
    return { layout: s || 'us', variant: '' };
}

/** 'latin(type4)' -> {file: 'latin', variant: 'type4'}; '' variant = the file's default */
export function parseInclude(spec) {
    const m = String(spec).trim().match(/^([^()]+)(?:\(([^()]*)\))?$/);
    return m ? { file: m[1].trim(), variant: (m[2] ?? '').trim() } : null;
}

function stripComments(text) {
    return text.replace(/\/\/[^\n]*/g, '').replace(/#[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

// The body of a block that starts at `open` (the index of its "{"), braces balanced
function blockAt(text, open) {
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{')
            depth++;
        else if (text[i] === '}' && --depth === 0)
            return { body: text.slice(open + 1, i), end: i + 1 };
    }
    return { body: text.slice(open + 1), end: text.length };
}

// The symbols of one key statement body: "[a, A]" or "type=..., symbols[Group1]=[a, A]".
// Only the first group is used (a second group is a second layout in the same key).
function keySymbols(body) {
    const named = body.match(/symbols\s*\[\s*group1\s*\]\s*=\s*\[([^\]]*)\]/i);
    const plain = named ?? body.match(/\[([^\]]*)\]/);
    if (!plain)
        return null;
    return plain[1].split(',').map(s => s.trim()).filter((s, i, all) => s || i < all.length - 1);
}

/**
 * One symbols file: its variants with includes and keys, in source order.
 *
 * @param {string} text the file
 * @returns {Map<string, {isDefault: boolean, steps: ({include: string, merge: string}|{key: string, levels: string[]})[]}>}
 */
export function parseSymbols(text) {
    const src = stripComments(text);
    const variants = new Map();
    const head = /((?:\b(?:default|partial|hidden|alphanumeric_keys|modifier_keys|keypad_keys|function_keys|alternate_group)\s+)*)xkb_symbols\s+"([^"]+)"\s*\{/g;
    for (let m; (m = head.exec(src));) {
        const { body, end } = blockAt(src, m.index + m[0].length - 1);
        head.lastIndex = end;
        const steps = [];
        const stmt = /\b(include|augment|override|replace)\s+"([^"]+)"|\b(?:(?:replace|override|augment)\s+)?key\s*<([A-Z0-9a-z+-]+)>\s*\{/g;
        for (let s; (s = stmt.exec(body));) {
            if (s[2] !== undefined) {
                // include "a+b|c": each part merges in turn ('+' override, '|' augment)
                const parts = s[2].split(/(?=[+|])/);
                parts.forEach((part, i) => {
                    const merge = i === 0 ? (s[1] === 'augment' ? '|' : '+') : part[0];
                    const spec = i === 0 ? part : part.slice(1);
                    if (spec.trim())
                        steps.push({ include: spec.trim(), merge });
                });
                continue;
            }
            const kb = blockAt(body, s.index + s[0].length - 1);
            stmt.lastIndex = kb.end;
            const levels = keySymbols(kb.body);
            if (levels)
                steps.push({ key: s[3], levels });
        }
        variants.set(m[2], { isDefault: /\bdefault\b/.test(m[1] ?? ''), steps });
    }
    return variants;
}

/** The variant a spec asks for: the named one, else the file's default, else the first. */
export function pickVariant(variants, name) {
    if (name && variants.has(name))
        return variants.get(name);
    if (name)
        return null;
    for (const v of variants.values()) {
        if (v.isDefault)
            return v;
    }
    return variants.values().next().value ?? null;
}

const MAX_DEPTH = 12;

/**
 * Every key of a layout with its levels, following includes.
 *
 * @param {{layout: string, variant: string}} id
 * @param {(file: string) => Promise<?string>} load the text of a symbols file, null if missing
 * @returns {Promise<Map<string, string[]>>} XKB key name -> keysym names by level
 */
export async function resolveKeys(id, load) {
    const cache = new Map();
    const file = async name => {
        if (!cache.has(name))
            cache.set(name, (async () => {
                const text = await load(name);
                return text ? parseSymbols(text) : null;
            })());
        return cache.get(name);
    };
    const keys = new Map();
    const apply = async (fileName, variantName, merge, depth) => {
        if (depth > MAX_DEPTH)
            return;
        const variants = await file(fileName);
        const variant = variants ? pickVariant(variants, variantName) : null;
        if (!variant)
            return;
        for (const step of variant.steps) {
            if (step.include) {
                const inc = parseInclude(step.include);
                // an include inside an augmented block augments too
                if (inc)
                    await apply(inc.file, inc.variant, merge === '|' ? '|' : step.merge, depth + 1);
            } else if (merge === '|') {
                const old = keys.get(step.key) ?? [];
                const levels = step.levels.map((s, i) => old[i] || s);
                keys.set(step.key, old.length > levels.length ? [...levels, ...old.slice(levels.length)] : levels);
            } else {
                keys.set(step.key, step.levels);
            }
        }
    };
    await apply(id.layout, id.variant, '+', 0);
    return keys;
}

// ---- keysyms -> what a key shows -----------------------------------------------------------

// Dead keys show their accent (macOS draws them highlighted)
const DEAD = Object.freeze({
    grave: '`', acute: '´', circumflex: '^', tilde: '~', perispomeni: '~', macron: '¯', breve: '˘',
    abovedot: '˙', diaeresis: '¨', abovering: '˚', doubleacute: '˝', caron: 'ˇ', cedilla: '¸',
    ogonek: '˛', iota: 'ͺ', belowdot: '.', hook: '̉', horn: '̛', stroke: '/', greek: 'µ',
    currency: '¤', semivoiced_sound: '゜', voiced_sound: '゛',
});

/**
 * What a keysym name types.
 *
 * @param {string} name keysym name ('a', 'U20AC', 'dead_acute', 'NoSymbol')
 * @param {(name: string) => number} toCodepoint keysym name -> Unicode code point, 0 if none
 * @returns {{text: string, dead: boolean}}
 */
export function keysymLabel(name, toCodepoint) {
    if (!name || name === 'NoSymbol' || name === 'VoidSymbol')
        return { text: '', dead: false };
    const dead = name.match(/^dead_(.+)$/);
    if (dead)
        return { text: DEAD[dead[1]] ?? '◌', dead: true };
    const u = name.match(/^U([0-9A-Fa-f]{4,6})$/);
    if (u)
        return { text: String.fromCodePoint(parseInt(u[1], 16)), dead: false };
    if (/^0x[0-9a-f]+$/i.test(name)) {
        const v = parseInt(name, 16);
        // keysyms 0x01000000 + code point are Unicode
        return { text: v >= 0x1000000 ? String.fromCodePoint(v - 0x1000000) : '', dead: false };
    }
    const cp = toCodepoint(name);
    return { text: cp > 0x1f && cp !== 0x7f ? String.fromCodePoint(cp) : '', dead: false };
}

/** Letters whose second level is their capital follow Caps Lock (XKB's ALPHABETIC types). */
export function isAlphabetic(levels, toCodepoint) {
    const lo = keysymLabel(levels[0], toCodepoint).text;
    const hi = keysymLabel(levels[1], toCodepoint).text;
    return !!lo && lo !== hi && lo.toUpperCase() === hi && lo.toLowerCase() === lo;
}

/**
 * The level the modifiers select: 0 base, 1 Shift, 2 AltGr (Option), 3 AltGr+Shift. Caps Lock
 * acts as Shift on letters only.
 *
 * @param {{shift: boolean, caps: boolean, option: boolean}} mods
 * @param {boolean} alphabetic
 */
export function levelFor(mods, alphabetic) {
    const shifted = !!mods.shift !== (alphabetic && !!mods.caps);
    return (mods.option ? 2 : 0) + (shifted ? 1 : 0);
}

/** What a key shows at a level; levels it lacks fall back like XKB does (to level 1/0). */
export function keyLabel(levels, level, toCodepoint) {
    const pick = levels[level] ?? (level >= 2 ? null : levels[level & 1]) ?? null;
    if (!pick && level >= 2)
        return { text: '', dead: false };
    return keysymLabel(pick ?? levels[0], toCodepoint);
}

// ---- geometry ------------------------------------------------------------------------------

// Linux evdev key codes (XKB keycode - 8) of the keys the viewer draws
export const EVDEV = Object.freeze({
    TLDE: 41, AE01: 2, AE02: 3, AE03: 4, AE04: 5, AE05: 6, AE06: 7, AE07: 8, AE08: 9, AE09: 10,
    AE10: 11, AE11: 12, AE12: 13, BKSP: 14, TAB: 15, AD01: 16, AD02: 17, AD03: 18, AD04: 19,
    AD05: 20, AD06: 21, AD07: 22, AD08: 23, AD09: 24, AD10: 25, AD11: 26, AD12: 27, RTRN: 28,
    LCTL: 29, AC01: 30, AC02: 31, AC03: 32, AC04: 33, AC05: 34, AC06: 35, AC07: 36, AC08: 37,
    AC09: 38, AC10: 39, AC11: 40, LFSH: 42, BKSL: 43, AB01: 44, AB02: 45, AB03: 46, AB04: 47,
    AB05: 48, AB06: 49, AB07: 50, AB08: 51, AB09: 52, AB10: 53, RTSH: 54, LALT: 56, SPCE: 57,
    CAPS: 58, LSGT: 86, RALT: 100, LWIN: 125, RWIN: 126, RCTL: 97,
});

// Function keys: what they show and do. kind 'mod' latches in the viewer; 'key' is typed.
export const SPECIAL = Object.freeze({
    BKSP: { glyph: '⌫', kind: 'key' },
    TAB: { glyph: '⇥', kind: 'key' },
    RTRN: { glyph: '↩', kind: 'key' },
    CAPS: { glyph: '⇪', kind: 'caps' },
    LFSH: { glyph: '⇧', kind: 'mod', mod: 'shift' },
    RTSH: { glyph: '⇧', kind: 'mod', mod: 'shift' },
    LCTL: { glyph: '⌃', kind: 'mod', mod: 'control' },
    RCTL: { glyph: '⌃', kind: 'mod', mod: 'control' },
    LALT: { glyph: '⌥', kind: 'mod', mod: 'alt' },
    RALT: { glyph: '⌥', kind: 'mod', mod: 'option' },
    LWIN: { glyph: '⌘', kind: 'mod', mod: 'command' },
    RWIN: { glyph: '⌘', kind: 'mod', mod: 'command' },
    SPCE: { glyph: '', kind: 'key' },
});

// Rows of [key, width in units]; LSGT only shows on ISO layouts (those that define it)
export const ROWS = Object.freeze([
    [['TLDE', 1], ['AE01', 1], ['AE02', 1], ['AE03', 1], ['AE04', 1], ['AE05', 1], ['AE06', 1],
        ['AE07', 1], ['AE08', 1], ['AE09', 1], ['AE10', 1], ['AE11', 1], ['AE12', 1], ['BKSP', 1.5]],
    [['TAB', 1.5], ['AD01', 1], ['AD02', 1], ['AD03', 1], ['AD04', 1], ['AD05', 1], ['AD06', 1],
        ['AD07', 1], ['AD08', 1], ['AD09', 1], ['AD10', 1], ['AD11', 1], ['AD12', 1], ['BKSL', 1]],
    [['CAPS', 1.75], ['AC01', 1], ['AC02', 1], ['AC03', 1], ['AC04', 1], ['AC05', 1], ['AC06', 1],
        ['AC07', 1], ['AC08', 1], ['AC09', 1], ['AC10', 1], ['AC11', 1], ['RTRN', 1.75]],
    [['LFSH', 1.25], ['LSGT', 1], ['AB01', 1], ['AB02', 1], ['AB03', 1], ['AB04', 1], ['AB05', 1],
        ['AB06', 1], ['AB07', 1], ['AB08', 1], ['AB09', 1], ['AB10', 1], ['RTSH', 2.25]],
    [['LCTL', 1.25], ['LALT', 1.25], ['LWIN', 1.5], ['SPCE', 6], ['RWIN', 1.5], ['RALT', 1.25], ['RCTL', 1.25]],
]);

/**
 * The board for a layout: rows of keys with what each shows at `level`.
 *
 * @param {Map<string, string[]>} keys resolveKeys()
 * @param {{shift, caps, option}} mods
 * @param {(name: string) => number} toCodepoint
 * @returns {{key: string, width: number, text: string, dead: boolean, kind: string, mod?: string, code: number}[][]}
 */
export function board(keys, mods, toCodepoint) {
    const iso = keys.has('LSGT');
    return ROWS.map(row => {
        const out = [];
        for (const [key, units] of row) {
            if (key === 'LSGT' && !iso)
                continue;
            // an ANSI board has a wider left Shift where the ISO key would be
            const width = key === 'LFSH' && !iso ? units + 1 : units;
            const special = SPECIAL[key];
            if (special) {
                out.push({ key, width, text: special.glyph, dead: false, kind: special.kind, mod: special.mod, code: EVDEV[key] });
                continue;
            }
            const levels = keys.get(key) ?? [];
            const level = levelFor(mods, isAlphabetic(levels, toCodepoint));
            const label = keyLabel(levels, level, toCodepoint);
            out.push({ key, width, text: label.text, dead: label.dead, kind: 'char', code: EVDEV[key] });
        }
        return out;
    });
}
