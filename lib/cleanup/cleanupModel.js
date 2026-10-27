// SPDX-License-Identifier: GPL-3.0-or-later
// Pure rules for the v3 one-shot cleanup of what Kiwi 2.x wrote outside the extension
// (index.js does the IO). Each function only recognises content Kiwi marked as its own.

// ---- gtk-3.0 / gtk-4.0 gtk.css ---------------------------------------------------------------

const GTK_BLOCK_REGEX = /\/\* Kiwi \(is not Apple\) - managed imports: begin \*\/\n?([\s\S]*?)\/\* Kiwi \(is not Apple\) - managed imports: end \*\/\n?/g;

/**
 * Drop the imports of Kiwi's managed gtk.css block that point at stylesheets Kiwi no longer
 * ships (the 2.x css/ folder: titlebutton icon sets, Firefox styles). A block left with no
 * import goes as a whole. Text outside the block is never touched.
 *
 * @param {string} text gtk.css
 * @param {(path: string) => boolean} stale true for an import path that no longer exists
 * @returns {string}
 */
export function stripStaleGtkImports(text, stale) {
    return text.replace(GTK_BLOCK_REGEX, (whole, body) => {
        const lines = body.split('\n').filter(Boolean);
        const keep = lines.filter(line => {
            const m = line.match(/@import url\("file:\/\/([^"]+)"\);/);
            return !m || !stale(decodeURI(m[1]));
        });
        if (keep.length === lines.length)
            return whole;
        if (!keep.some(l => l.includes('@import')))
            return '';
        return whole.replace(body, `${keep.join('\n')}\n`);
    });
}

/** True for a path into Kiwi 2.x's css/ folder (moved to features/windowControls/gtk/ in v3). */
export function isLegacyCssPath(path) {
    return /\/kiwi@kemma\/css\/[^/]+\.css$/.test(path);
}

// ---- environment.d (the advanced/ GTK3 module installer) ------------------------------------

/** The file advanced/install-extra.sh wrote, and the module it installed. */
export const ENV_CONF_NAME = '10-gtk3-titlebuttons.conf';
export const GTK_MODULE_NAME = 'libtitlebuttons_hover.so';
const KIWI_ENV_COMMENTS = [
    '# Kiwi GTK3 titlebuttons hover module',
    '# GTK3 Titlebuttons Hover Module for Kiwi Extension',
];

/**
 * The environment.d text without Kiwi's lines: its comment header and the GTK_MODULES /
 * GTK3_MODULES assignment that loads Kiwi's module. A user's own lines stay.
 *
 * @param {string} text
 * @returns {string} '' when nothing else is left
 */
export function stripKiwiEnvironment(text) {
    const kept = text.split('\n').filter(line => {
        const t = line.trim();
        if (KIWI_ENV_COMMENTS.includes(t))
            return false;
        return !(/^GTK3?_MODULES=/.test(t) && t.includes(GTK_MODULE_NAME));
    });
    const out = kept.join('\n');
    return out.trim() ? out : '';
}

/** True when an environment value (GTK3_MODULES) still loads Kiwi's module. */
export function environmentLoadsModule(value) {
    return (value ?? '').split(':').some(p => p.endsWith(`/${GTK_MODULE_NAME}`) || p === GTK_MODULE_NAME);
}

// ---- Dash to Dock colours (dock-adaptive-colors, removed) -----------------------------------

/** The colours Kiwi 2.x wrote into Dash to Dock, per key. */
export const KIWI_DOCK_COLOURS = Object.freeze({
    'custom-theme-running-dots-color': ['rgb(28,28,28)', 'rgb(250,250,251)'],
    'background-color': ['rgb(120,120,120)', 'rgb(28,28,28)'],
});

/**
 * Kiwi's record of the user's dock colours (`dock-colors-saved`), tolerant of both formats it
 * used: {key: "value"} and {key: {value, user}}. null when empty or damaged.
 */
export function parseSavedDockColours(text) {
    if (!text)
        return null;
    try {
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object' || Array.isArray(data))
            return null;
        const out = {};
        for (const [key, entry] of Object.entries(data)) {
            if (typeof entry === 'string')
                out[key] = { value: entry, user: true };
            else if (entry && typeof entry === 'object' && typeof entry.value === 'string')
                out[key] = { value: entry.value, user: entry.user !== false };
        }
        return Object.keys(out).length ? out : null;
    } catch (_e) {
        return null;
    }
}

/**
 * What to do with each dock key: only a key that still holds one of Kiwi's colours goes back
 * (reset, or the user's saved value). A colour the user picked since stays.
 *
 * @param {Object<string,string>} current values now
 * @param {Object<string,{value:string,user:boolean}>} saved
 * @returns {Object<string,{action:'reset'}|{action:'set',value:string}>}
 */
export function dockColourPlan(current, saved) {
    const plan = {};
    for (const [key, original] of Object.entries(saved ?? {})) {
        if (!(key in current) || !(KIWI_DOCK_COLOURS[key] ?? []).includes(current[key]))
            continue;
        if (!original.user)
            plan[key] = { action: 'reset' };
        else if (original.value !== current[key])
            plan[key] = { action: 'set', value: original.value };
    }
    return plan;
}
