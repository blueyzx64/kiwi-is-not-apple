// SPDX-License-Identifier: GPL-3.0-or-later
// Pure decisions for Mission Control (no gi:// imports; unit-tested under plain gjs).
//
// Mission Control is GNOME's own overview, restyled. These functions decide what the
// adapter shows: the Spaces bar labels, which windows App Exposé spreads or puts in its
// minimized strip, the window order when "Group windows by application" is on, how Spaces
// rearrange by recent use, and whether the overview the Shell opens at login is skipped.

/** What the overview shows: every window of the Space, or one app's windows. */
export const MODE = Object.freeze({ ALL: 'all', APP: 'app' });

/**
 * The labels of the Spaces bar. Desktops are numbered on their own ("Desktop 1, 2"); a Space
 * that holds one full-screen app is named after the app, as on macOS.
 *
 * @param {{fullscreenApp: ?string}[]} spaces in workspace order
 * @param {(n: number) => string} desktopName e.g. n => _('Desktop %d').format(n)
 * @returns {{label: string, fullscreen: boolean}[]}
 */
export function spaceLabels(spaces, desktopName) {
    let n = 0;
    return spaces.map(s => {
        if (s.fullscreenApp)
            return { label: s.fullscreenApp, fullscreen: true };
        n++;
        return { label: desktopName(n), fullscreen: false };
    });
}

/**
 * The full-screen app of a Space: a Space is a full-screen Space when its only normal
 * window is full screen (what fullscreenSpace and macOS create).
 *
 * @param {{appName: ?string, fullscreen: boolean, normal: boolean}[]} windows of one Space
 * @returns {?string} the app name, or null for a desktop
 */
export function fullscreenAppOf(windows) {
    const normal = windows.filter(w => w.normal);
    if (normal.length !== 1 || !normal[0].fullscreen)
        return null;
    return normal[0].appName || null;
}

/** A Space can be removed (×) only while another one is left. */
export const canRemoveSpace = count => count > 1;

/**
 * Where a window goes in the overview.
 *
 * @param {{appId: ?string, minimized: boolean}} w
 * @param {{mode: string, appId: ?string}} view
 * @returns {'spread'|'strip'|'hidden'} spread: in the stock window picker; strip: App
 *   Exposé's row of minimized windows; hidden: not shown
 */
export function windowPlace(w, view) {
    if (view.mode !== MODE.APP)
        return 'spread';
    if (!view.appId || w.appId !== view.appId)
        return 'hidden';
    return w.minimized ? 'strip' : 'spread';
}

/**
 * The view to open for an App Exposé request: the requested app, else the focused one.
 * Without an app there is nothing to show, so it falls back to all windows.
 *
 * @param {?string} requested
 * @param {?string} focused
 * @returns {{mode: string, appId: ?string}}
 */
export function exposeView(requested, focused) {
    const appId = requested || focused || null;
    return appId ? { mode: MODE.APP, appId } : { mode: MODE.ALL, appId: null };
}

/**
 * "Group windows by application": a stable order where each app's windows sit together.
 * Groups keep the order of their first window; inside a group the given order is kept.
 *
 * @param {{appId: ?string}[]} windows in the Shell's order
 * @returns {number[]} indices into `windows`
 */
export function groupedOrder(windows) {
    const groups = new Map();
    windows.forEach((w, i) => {
        const key = w.appId ?? `#${i}`;
        if (!groups.has(key))
            groups.set(key, []);
        groups.get(key).push(i);
    });
    return [...groups.values()].flat();
}

/**
 * "Automatically rearrange Spaces based on most recent use": the Spaces in the order they
 * were last used, the most recent first; Spaces never used keep their order after those.
 *
 * @param {Array} order the Spaces (any ids) in their current order
 * @param {Array} recent ids, most recently used first (may hold Spaces that are gone)
 * @returns {Array} the new order
 */
export function mruOrder(order, recent) {
    const present = new Set(order);
    const seen = new Set();
    const out = [];
    for (const id of recent) {
        if (present.has(id) && !seen.has(id)) {
            seen.add(id);
            out.push(id);
        }
    }
    for (const id of order) {
        if (!seen.has(id))
            out.push(id);
    }
    return out;
}

/**
 * The most-recent-use list after `id` was used.
 *
 * @param {Array} recent most recent first
 * @param {*} id
 * @param {number} [limit] the list never grows past this
 * @returns {Array}
 */
export function touchRecent(recent, id, limit = 64) {
    return [id, ...recent.filter(r => r !== id)].slice(0, limit);
}

/**
 * Whether to skip the overview the Shell opens at login (macOS starts on the desktop).
 *
 * @param {{wanted: boolean, startingUp: boolean}} s
 * @returns {boolean}
 */
export function skipStartupOverview({ wanted, startingUp }) {
    return wanted && startingUp;
}

/**
 * Size of a minimized-window card in App Exposé's strip: the window's aspect, fitted into a
 * box `height` tall and at most `maxWidth` wide.
 *
 * @param {{width: number, height: number}} frame
 * @param {number} height
 * @param {number} maxWidth
 * @returns {{width: number, height: number}}
 */
export function stripCardSize(frame, height, maxWidth) {
    const w = Math.max(1, frame.width);
    const h = Math.max(1, frame.height);
    const scale = Math.min(height / h, maxWidth / w);
    return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * The index a Space is dropped at when dragged along the bar.
 *
 * @param {number[]} centres the x centre of every Space thumbnail, in order
 * @param {number} x the pointer
 * @returns {number} 0..centres.length - 1
 */
export function reorderIndex(centres, x) {
    if (!centres.length)
        return 0;
    let i = 0;
    while (i < centres.length - 1 && x > (centres[i] + centres[i + 1]) / 2)
        i++;
    return i;
}
