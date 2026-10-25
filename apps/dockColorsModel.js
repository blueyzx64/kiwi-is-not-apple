// SPDX-License-Identifier: GPL-3.0-or-later
// Pure rules for dockColors.js: which Dash-to-Dock colours are the user's own.
// No gi imports, so it runs under plain gjs -m.

/**
 * Kiwi overwrites two Dash-to-Dock colour keys and writes the user's values back on
 * disable. If the shell dies in between, the Kiwi values stay in dconf, so the
 * originals are kept in a Kiwi key too. On the next enable that record is trusted
 * for a key only while the key still holds a colour Kiwi wrote; if it holds anything
 * else the user changed it since, and that value is the original.
 *
 * @param {Object<string,string>} current values in Dash-to-Dock's keys now
 * @param {Object<string,string>|null} saved the persisted originals, or null
 * @param {Object<string,string[]>} kiwiValues per key, every colour Kiwi writes
 * @returns {Object<string,string>} the originals to restore on disable
 */
export function resolveOriginals(current, saved, kiwiValues) {
    const result = {};
    for (const [key, value] of Object.entries(current)) {
        const recorded = saved?.[key];
        const stale = typeof recorded === 'string' && (kiwiValues[key] ?? []).includes(value);
        result[key] = stale ? recorded : value;
    }
    return result;
}

/**
 * @param {string} text the stored JSON
 * @returns {Object<string,string>|null} null when empty or damaged
 */
export function parseSaved(text) {
    if (!text)
        return null;
    try {
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object' || Array.isArray(data))
            return null;
        const out = {};
        for (const [key, value] of Object.entries(data)) {
            if (typeof value === 'string')
                out[key] = value;
        }
        return Object.keys(out).length ? out : null;
    } catch (_e) {
        return null;
    }
}

/**
 * Which keys to write back when Kiwi's colours are found left over (feature off).
 *
 * @param {Object<string,string>} current values in Dash-to-Dock's keys now
 * @param {Object<string,string>|null} saved the persisted originals, or null
 * @param {Object<string,string[]>} kiwiValues per key, every colour Kiwi writes
 * @returns {Object<string,string>} key -> original, only for keys still holding a Kiwi colour
 */
export function staleRestores(current, saved, kiwiValues) {
    const out = {};
    for (const [key, original] of Object.entries(saved ?? {})) {
        if (key in current && (kiwiValues[key] ?? []).includes(current[key]))
            out[key] = original;
    }
    return out;
}
