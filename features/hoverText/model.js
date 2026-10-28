// SPDX-License-Identifier: GPL-3.0-or-later
// Hover Text, Hover Typing, Hover Color and the Full Keyboard Access highlight (macOS
// Accessibility > Hover Text, Keyboard > Full Keyboard Access). Pure: settings, the activation
// modifier and its triple-press lock, the text shown, placement, colours. index.js adapts.

/** Clutter.ModifierType bits of the activation modifiers (Super is MOD4 on GNOME). */
export const MODIFIERS = Object.freeze({ super: 1 << 6, ctrl: 1 << 2, alt: 1 << 3, shift: 1 << 0 });
export const MODIFIER_NAMES = Object.freeze(['super', 'ctrl', 'alt', 'shift']);

/** Three presses with at most this much between two of them toggle the lock (macOS: "quickly"). */
export const TRIPLE_MS = 450;
export const POINTER_DEBOUNCE_MS = 60;
export const HOVER_MAX_CHARS = 280;
export const TYPING_MAX_CHARS = 120;
export const PANEL_GAP = 16;
export const SCREEN_MARGIN = 8;
export const POSITIONS = Object.freeze(['caret', 'top-left', 'top-right', 'bottom-left', 'bottom-right']);

/** AT-SPI roles and coordinate types used here (at-spi2-core atspi-constants.h). */
export const ROLE = Object.freeze({ PASSWORD_TEXT: 40 });
export const COORD = Object.freeze({ SCREEN: 0, WINDOW: 1 });
/** Text granularities (Text.GetStringAtOffset). */
export const GRANULARITY = Object.freeze({ CHAR: 0, WORD: 1, SENTENCE: 2, LINE: 3, PARAGRAPH: 4 });

const clampInt = (v, lo, hi, dflt) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt);

/**
 * Settings in, plain config out. `get` reads like KiwiSettings: bool(k), int(k), string(k).
 *
 * @returns {object}
 */
export function readConfig(get) {
    const modifier = get.string('hover-modifier');
    const position = get.string('hover-typing-position');
    return {
        text: get.bool('hover-text'),
        typing: get.bool('hover-typing'),
        color: get.bool('hover-color'),
        focus: get.bool('hover-focus-highlight'),
        modifier: MODIFIER_NAMES.includes(modifier) ? modifier : 'super',
        textSize: clampInt(get.int('hover-text-size'), 12, 128, 36),
        typingSize: clampInt(get.int('hover-typing-size'), 12, 128, 36),
        textColor: parseColor(get.string('hover-text-color')),
        backgroundColor: parseColor(get.string('hover-background-color')),
        highlightColor: parseColor(get.string('hover-highlight-color')),
        caretColor: parseColor(get.string('hover-insertion-point-color')),
        typingPosition: POSITIONS.includes(position) ? position : 'caret',
        focusColor: parseColor(get.string('hover-focus-color')),
        focusWidth: clampInt(get.int('hover-focus-width'), 1, 12, 3),
        focusContrast: get.bool('hover-focus-contrast'),
        focusAutohide: clampInt(get.int('hover-focus-autohide'), 0, 60, 0),
    };
}

/** Whether any part runs (the feature's `when`). */
export function anyOn(config) {
    return !!(config.text || config.typing || config.color || config.focus);
}

/**
 * The activation modifier: held, or locked by a quick triple press (macOS "activation lock").
 * Fed the modifier mask on every modifier change.
 */
export class ModifierLock {
    constructor(bit, { tripleMs = TRIPLE_MS } = {}) {
        this._bit = bit;
        this._tripleMs = tripleMs;
        this._held = false;
        this._locked = false;
        this._presses = [];
    }

    get held() {
        return this._held;
    }

    get locked() {
        return this._locked;
    }

    get active() {
        return this._held || this._locked;
    }

    /**
     * @param {number} mask the current modifier mask
     * @param {number} nowMs a monotonic time in ms
     * @returns {{changed: boolean, lockToggled: boolean, pressed: boolean, released: boolean}}
     */
    update(mask, nowMs) {
        const wasActive = this.active;
        const held = (mask & this._bit) !== 0;
        const pressed = held && !this._held;
        const released = !held && this._held;
        this._held = held;
        let lockToggled = false;
        if (pressed) {
            const last = this._presses[this._presses.length - 1];
            if (last !== undefined && nowMs - last > this._tripleMs)
                this._presses = [];
            this._presses.push(nowMs);
            if (this._presses.length >= 3) {
                this._locked = !this._locked;
                this._presses = [];
                lockToggled = true;
            }
        }
        return { changed: wasActive !== this.active || lockToggled, lockToggled, pressed, released };
    }

    /** True when this press follows another one quickly (part of a multi-press). */
    get repeating() {
        return this._presses.length >= 2;
    }

    reset() {
        this._held = false;
        this._locked = false;
        this._presses = [];
    }
}

/** A rect is usable: finite, positive size. */
export function validRect(r) {
    return !!r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0;
}

/**
 * AT-SPI extents in window coordinates (relative to the window's surface, as GTK reports them
 * under Wayland) to stage coordinates, through the window's buffer rect. Null when the rect is
 * empty or lies entirely outside the window.
 *
 * @param {{x, y, width, height}} extents
 * @param {{x, y, width, height}} buffer the window's buffer rect (Meta.Window.get_buffer_rect)
 * @returns {?{x, y, width, height}}
 */
export function toStage(extents, buffer) {
    if (!validRect(extents) || !validRect(buffer))
        return null;
    const r = { x: buffer.x + extents.x, y: buffer.y + extents.y, width: extents.width, height: extents.height };
    const outside = r.x >= buffer.x + buffer.width || r.y >= buffer.y + buffer.height ||
        r.x + r.width <= buffer.x || r.y + r.height <= buffer.y;
    return outside ? null : r;
}

/** A stage point in a window's coordinates (the inverse of toStage for a point). */
export function toWindow(point, buffer) {
    return { x: Math.round(point.x - buffer.x), y: Math.round(point.y - buffer.y) };
}

/** True when the point lies inside the rect. */
export function contains(rect, x, y) {
    return !!rect && x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

const collapse = s => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * The text Hover Text shows: whitespace collapsed; when longer than `max`, a window around
 * `offset` cut at word boundaries, with an ellipsis on the cut sides.
 *
 * @param {string} text
 * @param {number} offset character offset under the pointer (-1: unknown, the start)
 * @param {number} max
 * @returns {string}
 */
export function textWindow(text, offset = -1, max = HOVER_MAX_CHARS) {
    const raw = String(text ?? '');
    if (collapse(raw).length <= max)
        return collapse(raw);
    const chars = [...raw];
    const at = Math.min(Math.max(0, offset), chars.length - 1);
    let start = Math.max(0, at - Math.floor(max / 2));
    let end = Math.min(chars.length, start + max);
    start = Math.max(0, end - max);
    // Move inwards to whole words (looking at most 24 characters in)
    const isSpace = c => /\s/.test(c);
    if (start > 0) {
        for (let i = start; i < Math.min(end, start + 24); i++) {
            if (isSpace(chars[i])) {
                start = i + 1;
                break;
            }
        }
    }
    if (end < chars.length) {
        for (let i = end - 1; i >= Math.max(start, end - 24); i--) {
            if (isSpace(chars[i])) {
                end = i;
                break;
            }
        }
    }
    const body = collapse(chars.slice(start, end).join(''));
    return `${start > 0 ? '…' : ''}${body}${end < chars.length ? '…' : ''}`;
}

/**
 * The part of a field Hover Typing shows: the line the caret is on, cut to `max` characters
 * around the caret (more before it than after: you read what you just typed).
 *
 * @param {string} text the field's text
 * @param {number} caret the caret offset in characters
 * @returns {{before: string, after: string}}
 */
export function typingWindow(text, caret, max = TYPING_MAX_CHARS) {
    const chars = [...String(text ?? '')];
    const at = Math.min(Math.max(0, Number.isFinite(caret) ? caret : chars.length), chars.length);
    let lineStart = at;
    while (lineStart > 0 && chars[lineStart - 1] !== '\n')
        lineStart--;
    let lineEnd = at;
    while (lineEnd < chars.length && chars[lineEnd] !== '\n')
        lineEnd++;
    const beforeMax = Math.ceil(max * 0.75);
    let start = Math.max(lineStart, at - beforeMax);
    const end = Math.min(lineEnd, at + (max - (at - start)));
    if (end - start < max)
        start = Math.max(lineStart, end - max);
    return {
        before: (start > lineStart ? '…' : '') + chars.slice(start, at).join(''),
        after: chars.slice(at, end).join('') + (end < lineEnd ? '…' : ''),
    };
}

/**
 * Where a panel goes, inside `area` (a monitor's work area):
 *   'pointer'  below-right of the pointer, flipped left/up at the edges (Hover Text)
 *   'caret'    below the anchor rect (the caret or the field), above it at the bottom (Hover Typing)
 *   corners    'top-left' ... 'bottom-right' of the area
 *
 * @param {{position: string, anchor: ?object, pointer: ?{x, y}, size: {width, height}, area: object}} p
 * @returns {{x: number, y: number}}
 */
export function placePanel({ position, anchor = null, pointer = null, size, area, gap = PANEL_GAP }) {
    const m = SCREEN_MARGIN;
    const maxX = area.x + area.width - size.width - m;
    const maxY = area.y + area.height - size.height - m;
    const clamp = (x, y) => ({
        x: Math.round(Math.max(area.x + m, Math.min(x, maxX))),
        y: Math.round(Math.max(area.y + m, Math.min(y, maxY))),
    });
    switch (position) {
    case 'top-left': return clamp(area.x + m, area.y + m);
    case 'top-right': return clamp(maxX, area.y + m);
    case 'bottom-left': return clamp(area.x + m, maxY);
    case 'bottom-right': return clamp(maxX, maxY);
    case 'pointer': {
        const p = pointer ?? { x: area.x, y: area.y };
        let x = p.x + gap;
        let y = p.y + gap;
        if (x > maxX)
            x = p.x - gap - size.width;
        if (y > maxY)
            y = p.y - gap - size.height;
        return clamp(x, y);
    }
    default: {
        // 'caret'
        const a = anchor ?? (pointer ? { x: pointer.x, y: pointer.y, width: 0, height: 0 } : area);
        let y = a.y + a.height + gap;
        if (y > maxY)
            y = a.y - gap - size.height;
        return clamp(a.x, y);
    }
    }
}

/** A focus ring around `rect`, `width` px wide, drawn just outside it. */
export function ringRect(rect, width) {
    const w = Math.max(1, Math.round(width));
    return { x: rect.x - w - 1, y: rect.y - w - 1, width: rect.width + 2 * (w + 1), height: rect.height + 2 * (w + 1) };
}

/** '#rrggbb' or '#rrggbbaa' (any case), else null ('' means the default colour). */
export function parseColor(s) {
    const v = String(s ?? '').trim();
    return /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v.toLowerCase() : null;
}

/** {red, green, blue} 0-255 to '#RRGGBB'. */
export function colorHex({ red, green, blue }) {
    const h = v => clampInt(v, 0, 255, 0).toString(16).padStart(2, '0');
    return `#${h(red)}${h(green)}${h(blue)}`.toUpperCase();
}

/** Relative luminance 0..1 of '#rrggbb' (WCAG), for picking readable text on a swatch. */
export function luminance(hex) {
    const v = parseColor(hex);
    if (!v)
        return 0;
    const ch = i => {
        const c = parseInt(v.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(0) + 0.7152 * ch(1) + 0.0722 * ch(2);
}

/** Never show what is typed into a password field. */
export function isSecret(role) {
    return role === ROLE.PASSWORD_TEXT;
}

/**
 * AT-SPI 'StateChanged' with detail 'focused' and detail1 1: an object got the focus.
 *
 * @param {string} detail
 * @param {number} detail1
 */
export function isFocusGained(detail, detail1) {
    return detail === 'focused' && detail1 === 1;
}
