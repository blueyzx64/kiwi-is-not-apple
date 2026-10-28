// SPDX-License-Identifier: GPL-3.0-or-later
// The Kiwi input engine's sources, for the preferences ("Add Kiwi input sources"). Pure.
//
// The engine itself is a separate install (helpers/kiwi-input, not in the extension zip); its
// names follow helpers/kiwi-input/enginesModel.js engineName(), which tests/kiwiInputModel.test.js
// checks against this file.

export const ENGINE_PREFIX = 'kiwi';
export const COMPONENT_FILE = 'kiwi-input.xml';

/** 'us+euro' -> 'kiwi:us:euro' */
export function kiwiEngineName(xkbId) {
    const [layout, variant] = String(xkbId).split('+');
    return variant ? `${ENGINE_PREFIX}:${layout}:${variant}` : `${ENGINE_PREFIX}:${layout}`;
}

/**
 * The input sources after "Add Kiwi input sources": each XKB source gets its Kiwi engine
 * appended after the user's list. Nothing is removed or reordered; existing Kiwi sources stay.
 *
 * @param {Array<[string, string]>} sources org.gnome.desktop.input-sources sources
 * @returns {{sources: Array<[string, string]>, added: string[]}}
 */
export function withKiwiSources(sources) {
    const out = (sources ?? []).map(([t, id]) => [t, id]);
    const added = [];
    for (const [type, id] of sources ?? []) {
        if (type !== 'xkb')
            continue;
        const name = kiwiEngineName(id);
        if (out.some(([t, i]) => t === 'ibus' && i === name))
            continue;
        out.push(['ibus', name]);
        added.push(name);
    }
    return { sources: out, added };
}

/** True when a source list already has a Kiwi engine. */
export function hasKiwiSource(sources) {
    return (sources ?? []).some(([t, id]) => t === 'ibus' && String(id).startsWith(`${ENGINE_PREFIX}:`));
}

/**
 * Text Replacements rows from the editor -> a(ss) value: trimmed, one word shortcuts, no
 * empty phrase, the last row for a shortcut wins.
 */
export function cleanReplacements(rows) {
    const map = new Map();
    for (const [shortcut, phrase] of rows ?? []) {
        const k = String(shortcut ?? '').trim();
        const v = String(phrase ?? '');
        if (!k || /\s/.test(k) || !v.trim())
            continue;
        map.set(k, v);
    }
    return [...map.entries()];
}
