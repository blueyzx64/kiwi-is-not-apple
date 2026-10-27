// SPDX-License-Identifier: GPL-3.0-or-later
// The vocabulary of window tiling, shared by everything that asks for a tile: the zones (as
// fractions of a work area), the multi-window arrangements and the action strings of the
// 'window-tile-requested' event (core/events.js). The tiling engine (features/windows) acts on them;
// the green-button menu (features/windowControls) and the menu bar's Window menu draw and
// request them. Pure JS, no gi imports.

// Marks a string for translation; the view translates it
const N_ = s => s;

/** Single-window tiles, as fractions of the work area. */
export const ZONES = Object.freeze({
    'fill': Object.freeze({ x: 0, y: 0, w: 1, h: 1 }),
    'left': Object.freeze({ x: 0, y: 0, w: 1 / 2, h: 1 }),
    'right': Object.freeze({ x: 1 / 2, y: 0, w: 1 / 2, h: 1 }),
    'top': Object.freeze({ x: 0, y: 0, w: 1, h: 1 / 2 }),
    'bottom': Object.freeze({ x: 0, y: 1 / 2, w: 1, h: 1 / 2 }),
    'top-left': Object.freeze({ x: 0, y: 0, w: 1 / 2, h: 1 / 2 }),
    'top-right': Object.freeze({ x: 1 / 2, y: 0, w: 1 / 2, h: 1 / 2 }),
    'bottom-left': Object.freeze({ x: 0, y: 1 / 2, w: 1 / 2, h: 1 / 2 }),
    'bottom-right': Object.freeze({ x: 1 / 2, y: 1 / 2, w: 1 / 2, h: 1 / 2 }),
});

/**
 * Multi-window arrangements (Fill & Arrange): the zones in order, the first for the active
 * window, the rest for the next most recently used windows. macOS 15 names in comments.
 */
export const ARRANGEMENTS = Object.freeze({
    'left-right': Object.freeze(['left', 'right']),                         // Left & Right
    'right-left': Object.freeze(['right', 'left']),                         // Right & Left
    'top-bottom': Object.freeze(['top', 'bottom']),                         // Top & Bottom
    'bottom-top': Object.freeze(['bottom', 'top']),                         // Bottom & Top
    'quarters': Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']),
    'left-quarters': Object.freeze(['left', 'top-right', 'bottom-right']),   // Left & Quarters
    'right-quarters': Object.freeze(['right', 'top-left', 'bottom-left']),   // Right & Quarters
    'top-quarters': Object.freeze(['top', 'bottom-left', 'bottom-right']),   // Top & Quarters
    'bottom-quarters': Object.freeze(['bottom', 'top-left', 'top-right']),   // Bottom & Quarters
});

/**
 * Parse a tiling action (the payload of the 'window-tile-requested' event, the green menu and the
 * shortcuts): a zone name, 'center', 'restore', or 'arrange-<arrangement>'.
 *
 * @param {string} action
 * @returns {?{kind: 'zone'|'center'|'restore'|'arrange', name?: string}}
 */
export function parseAction(action) {
    if (typeof action !== 'string')
        return null;
    if (action in ZONES)
        return { kind: 'zone', name: action };
    if (action === 'center' || action === 'restore')
        return { kind: action };
    if (action.startsWith('arrange-') && action.slice(8) in ARRANGEMENTS)
        return { kind: 'arrange', name: action.slice(8) };
    return null;
}

/**
 * Does a tile put the window's top edge at the top of the work area? (Left and right halves,
 * top halves and quarters, Fill: the windows whose controls belong in the top bar.)
 *
 * @param {?string} zone a key of ZONES, or anything else (center, null)
 */
export function zoneTouchesTop(zone) {
    return !!zone && zone in ZONES && ZONES[zone].y === 0;
}

/**
 * The zone to show for an action: a zone is its own; an arrangement puts the active window in
 * its first zone.
 *
 * @param {string} action see parseAction
 * @returns {?string} a key of ZONES
 */
export function leadZone(action) {
    const parsed = parseAction(action);
    if (parsed?.kind === 'zone')
        return parsed.name;
    return parsed?.kind === 'arrange' ? ARRANGEMENTS[parsed.name][0] : null;
}

/**
 * The layouts of the picker (the green-button menu and the drag picker): the glyph rows with
 * their section titles. the names are gettext keys (marked with N_).
 */
export const PICKER_SECTIONS = Object.freeze([
    Object.freeze({
        title: N_('Move & Resize'),
        rows: Object.freeze([
            Object.freeze([['left', N_('Left')], ['right', N_('Right')], ['top', N_('Top')], ['bottom', N_('Bottom')]]),
            Object.freeze([['top-left', N_('Top Left')], ['top-right', N_('Top Right')],
                ['bottom-left', N_('Bottom Left')], ['bottom-right', N_('Bottom Right')]]),
        ]),
    }),
    Object.freeze({
        title: N_('Fill & Arrange'),
        rows: Object.freeze([
            Object.freeze([['fill', N_('Fill')], ['arrange-left-right', N_('Left & Right')],
                ['arrange-right-left', N_('Right & Left')], ['arrange-top-bottom', N_('Top & Bottom')],
                ['arrange-quarters', N_('Quarters')]]),
        ]),
    }),
]);
