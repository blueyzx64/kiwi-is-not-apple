// SPDX-License-Identifier: GPL-3.0-or-later
// Pure rules for the v3 one-shot cleanup of what Kiwi 2.x wrote outside the extension
// (index.js does the IO). Each function only recognises content Kiwi marked as its own.
// (gtk.css needs none: features/windowControls/gtkTheme.js replaces its whole managed block at
// every start, which drops the 2.x imports.)

// ---- environment.d (the advanced/ GTK3 module installer) ------------------------------------

/** The file advanced/install-extra.sh wrote, and the module it installed. */
export const ENV_CONF_NAME = '10-gtk3-titlebuttons.conf';
export const GTK_MODULE_NAME = 'libtitlebuttons_hover.so';
const KIWI_ENV_COMMENTS = [
    '# Kiwi GTK3 titlebuttons hover module',
    '# GTK3 Titlebuttons Hover Module for Kiwi Extension',
];

const MODULE_VARIABLE = /^(GTK3?_MODULES)=(.*)$/;
// The `${GTK3_MODULES:+$GTK3_MODULES:}` prefix Kiwi's installer wrote (keeps the inherited value)
const INHERIT = /\$\{(GTK3?_MODULES):\+\$\1:\}/;

/** True for a module path that is Kiwi's own: its file name is exactly Kiwi's module. */
const isKiwiModule = path => path === GTK_MODULE_NAME || path.endsWith(`/${GTK_MODULE_NAME}`);

/**
 * One GTK_MODULES / GTK3_MODULES line without Kiwi's module path; null when nothing of the line
 * is left. The user's other modules in that line stay.
 */
function withoutKiwiModule(line) {
    const m = line.match(MODULE_VARIABLE);
    if (!m || !m[2].includes(GTK_MODULE_NAME))
        return line;
    const quote = /^["']/.test(m[2]) && m[2].endsWith(m[2][0]) ? m[2][0] : '';
    const value = quote ? m[2].slice(1, -1) : m[2];
    const inherit = value.match(INHERIT)?.[0] ?? '';
    const modules = value.replace(INHERIT, '').split(':').filter(p => p && !isKiwiModule(p));
    if (!modules.length)
        return null;
    return `${m[1]}=${quote}${inherit}${modules.join(':')}${quote}`;
}

/**
 * The environment.d text without Kiwi's lines: its comment header and its module path in the
 * GTK_MODULES / GTK3_MODULES assignment. A user's own lines stay, and so do the user's other
 * modules in a line they shared with Kiwi's.
 *
 * @param {string} text
 * @returns {string} '' when nothing else is left
 */
export function stripKiwiEnvironment(text) {
    const kept = [];
    for (const line of text.split('\n')) {
        const t = line.trim();
        if (KIWI_ENV_COMMENTS.includes(t))
            continue;
        const next = withoutKiwiModule(t);
        if (next === null)
            continue;
        kept.push(next === t ? line : next);
    }
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

// ---- retrying a failed step ----------------------------------------------------------------

const RETRY_FIRST_MS = 10 * 60 * 1000;
const RETRY_MAX_MS = 6 * 60 * 60 * 1000;

/**
 * How long to wait before a cleanup step that failed `failures` times in a row may run again
 * (the Shell can enable Kiwi many times a day: every unlock): 10 minutes, doubling, 6 hours at most.
 *
 * @param {number} failures >= 1
 * @returns {number} milliseconds
 */
export function retryDelayMs(failures) {
    return Math.min(RETRY_FIRST_MS * 2 ** Math.max(0, failures - 1), RETRY_MAX_MS);
}
