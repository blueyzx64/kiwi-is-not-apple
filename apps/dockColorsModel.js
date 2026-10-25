// SPDX-License-Identifier: GPL-3.0-or-later
// Pure rules for dockColors.js: which Dash-to-Dock colours are the user's own and
// how to give them back. No gi imports, so it runs under plain gjs -m.
//
// A record is { key: { value, user } }: the value the key held before Kiwi wrote
// to it, and whether that value was set by the user (true) or was the schema
// default (false). A default must be given back with reset(), not by writing the
// same string, or a later distro or Dash-to-Dock default change stops applying.

/**
 * The originals to keep while Kiwi runs. Kiwi overwrites two colour keys; if the
 * shell dies before disable() the Kiwi colours stay in dconf, so the originals are
 * persisted too. A leftover record is trusted for a key only while the key still
 * holds a colour Kiwi writes; anything else the user set since, and is the original.
 *
 * @param {Object<string,string>} current values in Dash-to-Dock's keys now
 * @param {Object<string,boolean>} userSet per key, whether it has a user value now
 * @param {Object<string,{value:string,user:boolean}>|null} saved leftover record, or null
 * @param {Object<string,string[]>} kiwiValues per key, every colour Kiwi writes
 * @returns {Object<string,{value:string,user:boolean}>}
 */
export function captureOriginals(current, userSet, saved, kiwiValues) {
    const result = {};
    for (const [key, value] of Object.entries(current)) {
        const recorded = saved?.[key];
        const stale = recorded && userSet[key] && (kiwiValues[key] ?? []).includes(value);
        result[key] = stale ? { ...recorded } : { value, user: !!userSet[key] };
    }
    return result;
}

/**
 * What to do with each key when giving the colours back.
 *
 * @param {Object<string,string>} current values in Dash-to-Dock's keys now
 * @param {Object<string,boolean>} userSet per key, whether it has a user value now
 * @param {Object<string,{value:string,user:boolean}>|null} originals the record
 * @param {Function} isKiwis (key, value) -> whether that value is the one Kiwi wrote;
 *   anything else the user chose while Kiwi ran, and it stays
 * @returns {Object<string,{action:'reset'}|{action:'set',value:string}>} only keys to touch
 */
export function restorePlan(current, userSet, originals, isKiwis) {
    const plan = {};
    for (const [key, original] of Object.entries(originals ?? {})) {
        if (!(key in current) || !userSet[key] || !isKiwis(key, current[key]))
            continue;
        if (!original.user)
            plan[key] = { action: 'reset' };
        else if (original.value !== current[key])
            plan[key] = { action: 'set', value: original.value };
    }
    return plan;
}

/**
 * @param {string} text the stored JSON
 * @returns {Object<string,{value:string,user:boolean}>|null} null when empty or
 *   damaged. The older form { key: "value" } reads as a user value.
 */
export function parseSaved(text) {
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
