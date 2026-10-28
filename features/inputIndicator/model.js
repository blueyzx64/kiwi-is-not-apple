// SPDX-License-Identifier: GPL-3.0-or-later
// Text-cursor indicators (macOS Sonoma): what the badge says and where it goes. Pure.
//
//   Caps Lock on   an accent ⇪ under the caret, as long as Caps Lock stays on (it follows the
//                  caret; without a caret it shows by the pointer for BADGE_MS)
//   Caps Lock off  nothing, like macOS; a muted ⇪ for BADGE_MS when input-indicator-caps-off
//                  is on (Kiwi's confirmation that the key took)
//   Input source   the new source's short name ("EN", "DE", "あ") under the caret, for BADGE_MS
//
// Also the pure parts of the other keyboard features in this folder: Caps Lock switches the
// input source (capsSwitch.js) and the single-key action (inputKey.js).
//
// The caret comes from lib/caret.js (the IBus panel service); without one the badge goes next
// to the pointer.

export const BADGE_MS = 1500;      // how long the badge stays (macOS hides it after a pause)
export const CARET_GAP = 3;        // px between the caret's bottom and the badge
export const POINTER_OFFSET = Object.freeze({ x: 14, y: 20 });
export const SCREEN_MARGIN = 4;
export const CAPS_GLYPH = '⇪';

/** Settings in, plain config out. `get` is a KiwiSettings-like reader. */
export function readConfig(get) {
    return {
        enabled: get.bool('input-indicator'),
        capsLock: get.bool('input-indicator-caps-lock'),
        capsOff: get.bool('input-indicator-caps-off'),
        source: get.bool('input-indicator-source'),
    };
}

/**
 * The short label of an input source: its short name in capitals for Latin layouts, as is
 * for scripts without case; the display name's first letters when it has no short name.
 *
 * @param {{shortName?: string, displayName?: string}} source
 */
export function sourceLabel(source) {
    const raw = (source?.shortName || source?.displayName || '').trim();
    if (!raw)
        return '';
    return [...raw.toUpperCase()].slice(0, 3).join('');
}

/**
 * The badge for an event.
 *
 * @param {{type: 'caps', on: boolean}|{type: 'source', source: object}} event
 * @param {object} config readConfig()
 * @returns {?{text: string, style: 'caps-on'|'caps-off'|'source', key: string}} null when the
 *   event is off in the settings or has nothing to show
 */
export function badgeFor(event, config) {
    if (!config?.enabled)
        return null;
    if (event.type === 'caps') {
        if (!config.capsLock || (!event.on && !config.capsOff))
            return null;
        return { text: CAPS_GLYPH, style: event.on ? 'caps-on' : 'caps-off', key: event.on ? 'caps-on' : 'caps-off' };
    }
    if (event.type === 'source') {
        if (!config.source)
            return null;
        const text = sourceLabel(event.source);
        return text ? { text, style: 'source', key: `source:${text}` } : null;
    }
    return null;
}

/** Whether a current-source-changed is a real switch (not the first source at startup). */
export function isSourceSwitch(oldId, newId) {
    return !!oldId && !!newId && oldId !== newId;
}

/** Caps Lock edges from a keymap that also reports other modifier changes. */
export class CapsWatch {
    constructor(initial) {
        this._on = !!initial;
    }

    /** @returns {?boolean} the new state when it changed, else null */
    update(on) {
        const now = !!on;
        if (now === this._on)
            return null;
        this._on = now;
        return now;
    }
}

/**
 * Where the badge goes: under the caret (above it at the bottom of the screen), else below
 * and right of the pointer; always inside the monitor's area.
 *
 * @param {{caret: ?object, pointer: {x, y}, size: {width, height}, area: {x, y, width, height}}} p
 * @returns {{x: number, y: number, anchor: 'caret'|'pointer'}}
 */
export function placeBadge({ caret, pointer, size, area }) {
    const clampX = x => Math.round(Math.max(area.x + SCREEN_MARGIN,
        Math.min(x, area.x + area.width - size.width - SCREEN_MARGIN)));
    const clampY = y => Math.round(Math.max(area.y + SCREEN_MARGIN,
        Math.min(y, area.y + area.height - size.height - SCREEN_MARGIN)));
    if (caret) {
        let y = caret.y + caret.height + CARET_GAP;
        if (y + size.height > area.y + area.height - SCREEN_MARGIN)
            y = caret.y - CARET_GAP - size.height;
        return { x: clampX(caret.x), y: clampY(y), anchor: 'caret' };
    }
    return {
        x: clampX(pointer.x + POINTER_OFFSET.x),
        y: clampY(pointer.y + POINTER_OFFSET.y),
        anchor: 'pointer',
    };
}

/** True when the point lies inside the rect (which monitor a caret or pointer is on). */
export function contains(rect, x, y) {
    return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

/**
 * How long a badge stays: the Caps Lock badge stays while Caps Lock is on and a caret is
 * known (macOS keeps it under the text cursor); everything else fades after BADGE_MS.
 *
 * @param {string} style badgeFor().style
 * @param {boolean} hasCaret
 * @returns {'persist'|'timed'}
 */
export function badgeLifetime(style, hasCaret) {
    return style === 'caps-on' && hasCaret ? 'persist' : 'timed';
}

// --- Caps Lock switches the input source (macOS "Use Caps Lock to switch to and from ABC") ---

export const CAPS_HOLD_MS = 350;       // longer than this is a hold: Caps Lock stays on
const HOLD_SLACK_MS = 25;              // timer and event latency

/**
 * Tap or hold, from the core idle time measured CAPS_HOLD_MS after the Caps Lock press: a
 * release resets the idle time, so a key still held shows (about) the whole hold time.
 *
 * @param {number} idleMs Meta.IdleMonitor.get_idletime() at the check
 * @param {number} [holdMs]
 * @returns {'tap'|'hold'}
 */
export function classifyCapsPress(idleMs, holdMs = CAPS_HOLD_MS) {
    return idleMs >= holdMs - HOLD_SLACK_MS ? 'hold' : 'tap';
}

// XKB layouts whose letters are not Latin (the base layout, before any '+variant')
const NON_LATIN_LAYOUTS = new Set([
    'af', 'am', 'ara', 'bd', 'bg', 'bt', 'by', 'eg', 'et', 'ge', 'gr', 'il', 'in', 'iq', 'ir', 'jo',
    'kg', 'kh', 'kz', 'la', 'lk', 'ma', 'mk', 'mm', 'mn', 'mv', 'np', 'pk', 'ru', 'rs', 'sy', 'th',
    'tj', 'ua', 'uz',
]);

/**
 * Whether an input source types Latin letters. IBus engines are input methods (Chinese,
 * Japanese, Korean...) except IBus's own xkb:<layout> engines.
 *
 * @param {?{type: string, id: string}} source an InputSource (type 'xkb' or 'ibus')
 */
export function isLatinSource(source) {
    if (!source)
        return true;
    let layout = source.id ?? '';
    if (source.type === 'ibus') {
        if (!layout.startsWith('xkb:'))
            return false;
        layout = layout.slice(4).split(':')[0];
    }
    layout = layout.split('+')[0];
    return !NON_LATIN_LAYOUTS.has(layout);
}

/**
 * The source a Caps Lock tap switches to: from a non-Latin source to the most recent Latin
 * one, from a Latin source to the most recent non-Latin one. Null when there is no pair.
 *
 * @param {object[]} mru sources, most recently used first
 * @param {object} current
 * @returns {?object}
 */
export function capsSwitchTarget(mru, current) {
    const latin = isLatinSource(current);
    return (mru ?? []).find(s => s && s.id !== current?.id && isLatinSource(s) !== latin) ?? null;
}

/** Whether Caps Lock switching applies: at least one Latin and one non-Latin source. */
export function capsSwitchApplies(sources) {
    const list = sources ?? [];
    return list.some(s => isLatinSource(s)) && list.some(s => !isLatinSource(s));
}

// --- One key, one action (macOS "Press fn key to") ---

export const KEY_ACTIONS = Object.freeze(['none', 'input-source', 'emoji']);

/**
 * The source the key action switches to: the previously used one (macOS fn switches to the
 * last used source), else the next in the user's list.
 *
 * @param {object[]} mru most recently used first
 * @param {object[]} list in the user's order
 * @param {object} current
 * @returns {?object}
 */
export function nextSource(mru, list, current) {
    const prev = (mru ?? []).find(s => s && s.id !== current?.id);
    if (prev)
        return prev;
    const all = list ?? [];
    if (all.length < 2)
        return null;
    const i = all.findIndex(s => s.id === current?.id);
    return all[(i + 1) % all.length];
}
