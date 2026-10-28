// SPDX-License-Identifier: GPL-3.0-or-later
// Text Replacements (macOS System Settings > Keyboard > Text Replacements): a shortcut typed and
// followed by a space or punctuation becomes its phrase. Backspace right after an expansion
// puts the shortcut back. Pure.
//
// The engine feeds what it knows about the text before the caret: the client's surrounding
// text when the app reports it, else its own record of what was typed since the last focus
// change or cursor key (TypedBuffer).

export const DEFAULT_REPLACEMENTS = Object.freeze([['omw', 'On my way!']]);

// macOS expands on a space and on sentence punctuation
const TRIGGERS = new Set([' ', '.', ',', '!', '?', ';', ':', '\n', '\t', ')', '"', '\'']);
const MAX_BUFFER = 64;

/** True for a character that ends a word and can expand the shortcut before it. */
export function isTrigger(ch) {
    return TRIGGERS.has(ch);
}

/** a(ss) pairs from settings -> Map shortcut -> phrase (empty or duplicate shortcuts dropped). */
export function parseReplacements(pairs) {
    const map = new Map();
    for (const pair of pairs ?? []) {
        const [shortcut, phrase] = pair ?? [];
        if (typeof shortcut !== 'string' || typeof phrase !== 'string')
            continue;
        const key = shortcut.trim();
        if (!key || /\s/.test(key) || map.has(key) || !phrase)
            continue;
        map.set(key, phrase);
    }
    return map;
}

/**
 * The replacement for the word that ends the text before the caret, when the trigger is typed.
 * A shortcut matches only as a whole word (the character before it is not a letter or digit).
 *
 * @param {Map<string, string>} map parseReplacements()
 * @param {string} before the text before the caret, without the trigger
 * @param {string} trigger the character being typed
 * @returns {?{shortcut: string, phrase: string}}
 */
export function matchReplacement(map, before, trigger) {
    if (!map?.size || !isTrigger(trigger) || !before)
        return null;
    let best = null;
    for (const [shortcut, phrase] of map) {
        if (!before.endsWith(shortcut))
            continue;
        const prev = before.charAt(before.length - shortcut.length - 1);
        if (prev && /[\p{L}\p{N}]/u.test(prev))
            continue;
        if (!best || shortcut.length > best.shortcut.length)
            best = { shortcut, phrase };
    }
    return best;
}

/**
 * The engine's own record of the current word run, for apps without surrounding text.
 * Cleared on focus changes, cursor keys and anything it cannot follow.
 */
export class TypedBuffer {
    constructor() {
        this.text = '';
    }

    type(text) {
        this.text = (this.text + text).slice(-MAX_BUFFER);
    }

    backspace() {
        this.text = [...this.text].slice(0, -1).join('');
    }

    clear() {
        this.text = '';
    }
}

/**
 * Expansion and its undo. expand() gives the edit for a trigger; backspace() right after an
 * expansion gives the edit that restores the shortcut (macOS); any other key forgets it.
 */
export class Replacer {
    constructor(map = new Map()) {
        this.map = map;
        this._last = null;      // {shortcut, phrase, trigger}
    }

    /**
     * @returns {?{delete: number, text: string}} delete that many characters before the caret,
     *   then type text; null when nothing expands
     */
    expand(before, trigger) {
        this._last = null;
        const m = matchReplacement(this.map, before, trigger);
        if (!m)
            return null;
        this._last = { ...m, trigger };
        return { delete: [...m.shortcut].length, text: m.phrase + trigger };
    }

    /** @returns {?{delete: number, text: string}} the undo edit, or null */
    backspace() {
        const last = this._last;
        this._last = null;
        if (!last)
            return null;
        return { delete: [...last.phrase].length + [...last.trigger].length, text: last.shortcut + last.trigger };
    }

    /** Any key other than Backspace right after an expansion. */
    forget() {
        this._last = null;
    }
}
