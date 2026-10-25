// SPDX-License-Identifier: GPL-3.0-or-later
// Shared window predicates. No gi imports, so gjs -m tests can load this file.

/**
 * Helper and internal windows (GJS scripts, reverse-DNS ids, '@!0,0' placeholders)
 * are not user windows. Pass the window's title and its app name, either may be null.
 * A blank title counts as a helper window.
 *
 * @param {{title: ?string, appName: ?string}} info
 * @returns {boolean}
 */
export function isHelperWindowInfo({ title, appName }) {
    if (title !== null && title !== undefined) {
        const t = title.trim().toLowerCase();
        if (!t)
            return true;
        if (t.startsWith('com.') || t.startsWith('gjs') || t.includes('@!0,0'))
            return true;
    }
    const a = (appName ?? '').trim().toLowerCase();
    return a.startsWith('com.') || a.startsWith('gjs');
}

/**
 * True when win is a window the user would call a window.
 *
 * @param {?Meta.Window} win
 * @param {?string} [appName] name of the window's app, if known
 * @returns {boolean}
 */
export function isUserWindow(win, appName = null) {
    if (!win)
        return false;
    return !isHelperWindowInfo({ title: win.get_title(), appName });
}

/**
 * The pointer lands on a child of an overview preview (the clone, the icon, the
 * caption), so walk up until an ancestor names the window it stands for.
 *
 * @param {?Clutter.Actor} actor
 * @returns {?Meta.Window}
 */
export function windowForActor(actor) {
    for (let a = actor; a; a = a.get_parent()) {
        if (a.metaWindow)
            return a.metaWindow;
    }
    return null;
}
