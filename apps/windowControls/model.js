// SPDX-License-Identifier: GPL-3.0-or-later
// Pure logic for the panel window controls. No gi imports, so it runs under `gjs -m` tests.

export const VALID_BUTTONS = ['close', 'minimize', 'maximize'];
export const MACOS_ORDER = ['close', 'minimize', 'maximize'];
export const SYSTEM_RIGHT_ORDER = ['minimize', 'maximize', 'close'];

export const SCOPES = ['all', 'maximized', 'fullscreen'];
export const POSITIONS = ['system', 'left', 'right'];

/** Old key -> new key. Run once by lib/migrations.js from extension.js enable(). */
export const MIGRATIONS = [
    {
        from: 'show-window-controls-fullscreen-only',
        to: 'window-controls-scope',
        map: fullscreenOnly => (fullscreenOnly ? 'fullscreen' : 'all'),
    },
];

/**
 * Parse a WM button-layout such as 'appmenu:minimize,maximize,close'.
 * The side with more control buttons wins; a tie goes to the left only when it has any,
 * otherwise to the right (GNOME default).
 *
 * @param {string} layoutStr
 * @returns {{buttons: string[], side: 'left'|'right'}}
 */
export function parseButtonLayout(layoutStr) {
    const parts = String(layoutStr ?? '').split(':');
    const pick = part => (part ?? '').split(',')
        .map(b => b.trim())
        .filter(b => VALID_BUTTONS.includes(b));
    const left = pick(parts[0]);
    const right = pick(parts[1]);

    let side;
    let ordered;
    if (left.length >= right.length && left.length > 0) {
        side = 'left';
        ordered = left;
    } else if (right.length > 0) {
        side = 'right';
        ordered = right;
    } else {
        side = 'right';
        ordered = SYSTEM_RIGHT_ORDER;
    }
    return { buttons: [...new Set(ordered)], side };
}

/**
 * Where the controls go and in which order.
 * 'system' follows the layout. Forcing the other side uses the usual order of that side
 * (macOS order on the left, GNOME order on the right); the same side keeps the user's order.
 *
 * @param {string} position 'system' | 'left' | 'right'
 * @param {{buttons: string[], side: string}} parsed result of parseButtonLayout
 * @returns {{buttons: string[], side: 'left'|'right'}}
 */
export function resolvePlacement(position, parsed) {
    if (position !== 'left' && position !== 'right')
        return { buttons: parsed.buttons, side: parsed.side };
    if (position === parsed.side)
        return { buttons: parsed.buttons, side: position };
    return { buttons: position === 'left' ? [...MACOS_ORDER] : [...SYSTEM_RIGHT_ORDER], side: position };
}

/**
 * Should the panel buttons be on screen?
 *
 * @param {object} s
 * @param {string} s.scope 'all' | 'maximized' | 'fullscreen'
 * @param {boolean} s.hasWindow a managed, normal window has focus
 * @param {boolean} s.maximized
 * @param {boolean} s.fullscreen
 * @param {boolean} s.overview
 * @param {boolean} s.excluded see isExcludedWindow
 */
export function shouldShow({ scope, hasWindow, maximized, fullscreen, overview, excluded }) {
    if (!hasWindow || overview || excluded)
        return false;
    switch (scope) {
    case 'fullscreen':
        return fullscreen;
    case 'maximized':
        return maximized || fullscreen;
    default:
        return true;
    }
}

/**
 * Which GTK stylesheet removes the titlebar buttons of CSD windows.
 * The scope decides where the panel shows the buttons, and the windows lose theirs in the
 * same cases, so no window is ever left without buttons.
 *
 * @returns {string|null} file name in css/, or null when removal is off
 */
export function titlebarHideSheet({ showOnPanel, remove, scope, gtkVersion }) {
    if (!showOnPanel || !remove)
        return null;
    switch (scope) {
    case 'fullscreen':
        return `hide-titlebar-fullscreen${gtkVersion}.css`;
    case 'maximized':
        return `hide-titlebar${gtkVersion}.css`;
    default:
        return `hide-titlebar-always${gtkVersion}.css`;
    }
}

/**
 * Pick the icon file for a button. `has(folder, name)` says whether the file exists,
 * so the caller decides how to know (a cached directory listing, never a stat per hover).
 *
 * @returns {{folder: string, name: string}}
 */
export function resolveIcon({ buttonType, iconName, scale, has }) {
    const isAlt = buttonType === 'titlebuttons-alt';
    const base = isAlt ? 'titlebuttons' : buttonType;
    const scaled = n => (scale >= 1.5 && n.endsWith('.png') ? `${n.slice(0, -4)}@2.png` : n);

    const candidates = [];
    if (isAlt && /-hover|-active/.test(iconName) && iconName.endsWith('.png')) {
        const alt = `${iconName.slice(0, -4)}-alt.png`;
        candidates.push([base, scaled(alt)], [base, alt]);
    }
    candidates.push([base, scaled(iconName)], [base, iconName]);
    candidates.push(['titlebuttons', scaled(iconName)]);

    for (const [folder, name] of candidates) {
        if (has(folder, name))
            return { folder, name };
    }
    return { folder: 'titlebuttons', name: iconName };
}

/**
 * Runs jobs one after another; a failing job is reported and does not stop the next.
 * Share one queue between all users of the same files.
 */
export function createJobQueue(onError = () => {}) {
    let tail = Promise.resolve();
    return job => {
        tail = tail.then(job).catch(onError);
        return tail;
    };
}
