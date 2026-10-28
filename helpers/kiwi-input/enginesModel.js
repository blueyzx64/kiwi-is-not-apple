// SPDX-License-Identifier: GPL-3.0-or-later
// Which Kiwi input engines exist, their names and the IBus component XML. Pure.
//
// One engine per XKB layout ("kiwi:us", "kiwi:us:euro"): the engine keeps the user's keyboard
// layout (GNOME Shell sets the XKB layout from the engine's layout and variant) and adds press
// and hold and Text Replacements on top. The list is the Latin layouts below plus every XKB
// source the user has in GNOME when IBus asks (`--xml`). The preferences add these sources
// through lib/inputSourcesModel.js (the extension does not ship this helper).

export const ENGINE_PREFIX = 'kiwi';

export const CURATED_LAYOUTS = Object.freeze([
    'us', 'us+intl', 'us+altgr-intl', 'us+euro', 'us+dvorak', 'us+colemak', 'gb', 'gb+extd', 'ie',
    'ca+eng', 'ca', 'fr', 'fr+oss', 'fr+bepo', 'be', 'ch', 'ch+fr', 'de', 'de+nodeadkeys', 'at',
    'nl', 'es', 'latam', 'it', 'pt', 'br', 'se', 'no', 'dk', 'fi', 'is', 'pl', 'cz', 'sk', 'hu',
    'ro', 'tr', 'hr', 'si', 'ee', 'lv', 'lt', 'mt',
]);

/** 'us+euro' -> 'kiwi:us:euro' */
export function engineName(xkbId) {
    const [layout, variant] = String(xkbId).split('+');
    return variant ? `${ENGINE_PREFIX}:${layout}:${variant}` : `${ENGINE_PREFIX}:${layout}`;
}

/** 'kiwi:us:euro' -> 'us+euro'; null for another engine */
export function xkbIdOfEngine(name) {
    const parts = String(name).split(':');
    if (parts[0] !== ENGINE_PREFIX || !parts[1])
        return null;
    return parts[2] ? `${parts[1]}+${parts[2]}` : parts[1];
}

/** The XKB ids to offer: the curated list, then the user's own XKB sources, once each. */
export function layoutsToOffer(userSources) {
    const ids = [...CURATED_LAYOUTS];
    for (const [type, id] of userSources ?? []) {
        if (type === 'xkb' && id && !ids.includes(id))
            ids.push(id);
    }
    return ids;
}

function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * The <engines> XML IBus reads from `kiwi-input-engine --xml`.
 *
 * @param {Array<{xkbId: string, displayName: string, shortName?: string, language?: string}>} layouts
 */
export function enginesXml(layouts) {
    const rows = layouts.map(l => {
        const [layout, variant] = l.xkbId.split('+');
        return [
            '  <engine>',
            `    <name>${esc(engineName(l.xkbId))}</name>`,
            `    <language>${esc(l.language || 'en')}</language>`,
            '    <license>GPL-3.0-or-later</license>',
            '    <author>Kiwi (is not Apple)</author>',
            `    <layout>${esc(layout)}</layout>`,
            variant ? `    <layout_variant>${esc(variant)}</layout_variant>` : null,
            `    <longname>${esc(l.displayName)} (Kiwi)</longname>`,
            `    <description>${esc(l.displayName)} with press and hold for accents and Text Replacements</description>`,
            `    <symbol>${esc(l.shortName || layout)}</symbol>`,
            '    <icon>input-keyboard-symbolic</icon>',
            '    <rank>0</rank>',
            '  </engine>',
        ].filter(Boolean).join('\n');
    });
    return `<engines>\n${rows.join('\n')}\n</engines>\n`;
}
