// SPDX-License-Identifier: GPL-3.0-or-later
// Pure rule for launchpadApp.js: taking Kiwi's entry back out of favorite-apps.
// No gi imports, so it runs under plain gjs -m.

/**
 * Only Kiwi's own ids are removed. A list that was at its schema default before
 * Kiwi pinned itself, and is back to exactly that default once Kiwi's ids are gone,
 * is reset() rather than written, so later default changes keep applying.
 *
 * @param {string[]} current favorite-apps now
 * @param {string[]} kiwiIds ids Kiwi adds
 * @param {string[]} defaults the schema default of favorite-apps
 * @param {boolean} wasDefault whether the key had no user value before Kiwi pinned
 * @returns {{action:'keep'}|{action:'reset'}|{action:'set',value:string[]}}
 */
export function unpinPlan(current, kiwiIds, defaults, wasDefault) {
    const rest = current.filter(id => !kiwiIds.includes(id));
    const same = (a, b) => a.length === b.length && a.every((id, i) => id === b[i]);
    if (wasDefault && same(rest, defaults))
        return { action: 'reset' };
    if (rest.length === current.length)
        return { action: 'keep' };
    return { action: 'set', value: rest };
}
