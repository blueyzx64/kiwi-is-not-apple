// SPDX-License-Identifier: GPL-3.0-or-later
// Pure logic for the panel window controls. No gi imports, so it runs under `gjs -m` tests.

export const VALID_BUTTONS = ['close', 'minimize', 'maximize'];
export const MACOS_ORDER = ['close', 'minimize', 'maximize'];
export const SYSTEM_RIGHT_ORDER = ['minimize', 'maximize', 'close'];

export const SCOPES = ['all', 'maximized', 'fullscreen'];
/** The side of the window controls, in the top bar and in the apps' titlebars. */
export const SIDES = ['right', 'left'];

export const APP_BUTTONS_STYLES = ['gnome', 'macos'];
export const APP_BUTTONS_SETS = ['all', 'close'];

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
 * Where the controls go and in which order: macOS order (close, minimize, maximize) on the
 * left, GNOME order with close at the screen edge on the right.
 *
 * @param {string} side 'left' | 'right' (anything else is 'right', the default)
 * @returns {{buttons: string[], side: 'left'|'right'}}
 */
export function placementFor(side) {
    return side === 'left'
        ? { buttons: [...MACOS_ORDER], side: 'left' }
        : { buttons: [...SYSTEM_RIGHT_ORDER], side: 'right' };
}

/**
 * Should the panel buttons be on screen for the focused window?
 * - scope 'all': every window;
 * - scope 'maximized' (default): a window with no controls of its own (a server-side frame)
 *   always; a window with its own (a header bar) only while it is maximized, full screen or
 *   touching the top bar;
 * - scope 'fullscreen': full-screen windows only.
 *
 * @param {object} s
 * @param {string} s.scope 'all' | 'maximized' | 'fullscreen'
 * @param {boolean} s.hasWindow a managed, normal window has focus
 * @param {boolean} s.maximized
 * @param {boolean} s.fullscreen
 * @param {boolean} [s.touching] the window's top edge is against the top bar (touchesTopBar)
 * @param {boolean} [s.noOwnControls] Mutter draws its title bar (decorated), so it has no
 *   controls of its own to keep
 * @param {boolean} s.overview
 * @param {boolean} s.excluded see isExcludedWindow
 */
export function shouldShow({ scope, hasWindow, maximized, fullscreen, touching = false, noOwnControls = false,
    overview, excluded }) {
    if (!hasWindow || overview || excluded)
        return false;
    switch (scope) {
    case 'fullscreen':
        return !!fullscreen;
    case 'maximized':
        return !!noOwnControls || !!maximized || !!fullscreen || !!touching;
    default:
        return true;
    }
}

/**
 * Is the window's top edge against the top bar (the work area's top)? A window dragged up
 * until it stops, a tile whose top is the work area's top (the caller adds those through
 * `zoneTouchesTop`), or one a few pixels off.
 *
 * @param {{y: number}} frame
 * @param {{y: number}} workArea
 * @param {number} [slack] px
 */
export function touchesTopBar(frame, workArea, slack = 2) {
    return !!frame && !!workArea && frame.y <= workArea.y + slack;
}

/**
 * Which GTK stylesheet removes the titlebar buttons of CSD windows.
 * The scope decides where the panel shows the buttons, and the windows lose theirs in the
 * same cases, so no window is ever left without buttons.
 *
 * Scope 'all' needs no sheet: Kiwi then owns the WM button-layout (ownsButtonLayout), which
 * GTK follows live through the settings portal. A sheet would be worse there: GTK reads
 * gtk.css once at start, so windows opened while it was imported would stay without buttons
 * after the controls are turned off, until restarted (seen in the real Shell, GNOME 50.6).
 *
 * @returns {string|null} file name in gtk/, or null when no sheet is needed
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
        return null;
    }
}

/**
 * Pick the icon file for a button (one traffic-light set, in icons/titlebuttons/). `has(folder,
 * name)` says whether the file exists, so the caller decides how to know (a cached directory
 * listing, never a stat per hover). The @2 image is preferred on scaled monitors.
 *
 * @returns {{folder: string, name: string}}
 */
export function resolveIcon({ iconName, scale, has }) {
    const folder = 'titlebuttons';
    if (scale >= 1.5 && iconName.endsWith('.png')) {
        const scaled = `${iconName.slice(0, -4)}@2.png`;
        if (has(folder, scaled))
            return { folder, name: scaled };
    }
    return { folder, name: iconName };
}

/**
 * A WM button-layout with the close / minimize / maximize buttons taken out, so every
 * titlebar that follows the layout (GTK 3, GTK 4/libadwaita, Chromium, Mutter frames) draws
 * none. Other entries (appmenu, icon, spacer) stay where they were.
 * 'appmenu:close' -> 'appmenu:', 'close,minimize,maximize:' -> ':'.
 *
 * @param {string} layoutStr
 * @returns {string}
 */
export function stripControlButtons(layoutStr) {
    const parts = String(layoutStr ?? '').split(':');
    const keep = part => (part ?? '').split(',')
        .map(b => b.trim())
        .filter(b => b && !VALID_BUTTONS.includes(b))
        .join(',');
    return `${keep(parts[0])}:${keep(parts[1])}`;
}

/**
 * Does the WM button-layout lose its buttons for good? Only while the panel shows the
 * controls for every window: with the maximized / fullscreen scopes, floating windows must keep
 * their own buttons, and the layout is global, so the GTK CSS (which can follow the window
 * state) does the removal for GTK windows then (see hidesTitlebarButtons for the others).
 */
export function ownsButtonLayout({ showOnPanel, remove, scope }) {
    return !!showOnPanel && !!remove && scope === 'all';
}

/**
 * Should the WM button-layout be the one without buttons right now?
 * - scope 'all': always (the top bar has them for every window);
 * - otherwise while the focused window's controls are in the top bar (`onPanel`, see
 *   shouldShow). The layout is global: GTK 3 / 4, Chromium and Mutter's own frames all follow
 *   it, so this is the one way to take the buttons off a window that is not maximized (a tile
 *   against the top bar, a server-side frame). Other windows lose theirs only while that
 *   window has focus. Maximized client-side windows also have the GTK CSD sheet, which keeps
 *   them clean while another window has focus.
 *
 * @param {object} s
 * @param {boolean} s.remove remove-titlebar-buttons
 * @param {string} s.scope
 * @param {boolean} s.onPanel the focused window's controls are on the panel
 * @returns {boolean}
 */
export function hidesTitlebarButtons({ remove, scope, onPanel }) {
    return !!remove && (scope === 'all' || !!onPanel);
}

/**
 * The WM button-layout Kiwi sets for a given user layout: without the buttons while the top
 * bar has them (`hide`), else the apps' own buttons on the chosen side.
 *
 * @param {string} original the user's layout
 * @param {{hide: boolean, side: string, set: string}} s
 * @returns {string}
 */
export function titlebarLayout(original, { hide, side, set }) {
    return hide ? stripControlButtons(original) : appButtonsLayout(original, { position: side, set });
}

/**
 * Who to minimize when the user asks to minimize `chain[0]`.
 * chain is the focused window followed by its transient-for ancestors, each
 * `{canMinimize: boolean}`. Mutter refuses minimize for windows without the capability
 * (dialogs, modal dialogs, skip-taskbar windows) but hides every transient whose ancestor
 * is minimized, and shows them again with it. So a dialog goes down with the nearest
 * ancestor that can be minimized, and comes back when that window is restored.
 * With no such window at all, the closest action is to send it behind the others.
 *
 * @param {{canMinimize: boolean}[]} chain
 * @returns {{action: 'minimize', index: number} | {action: 'lower'}}
 */
export function planMinimize(chain) {
    const index = (chain ?? []).findIndex(w => w?.canMinimize);
    return index < 0 ? { action: 'lower' } : { action: 'minimize', index };
}

/**
 * What the maximize button does for the focused window.
 * - fullscreen leaves fullscreen; maximized (by mutter) unmaximizes;
 * - a window Kiwi "filled" to the work area goes back to its saved frame;
 * - a resizable window is maximized even when it does not advertise it (mutter's
 *   meta_window_maximize() does not check the capability); the caller falls back to 'fill'
 *   when mutter did not take it;
 * - a fixed-size window (min size == max size) cannot grow, so it is centred in the work area.
 *
 * @returns {'unfullscreen'|'unmaximize'|'unfill'|'maximize'|'center'}
 */
export function planMaximize({ fullscreen, maximized, filled, resizable }) {
    if (fullscreen)
        return 'unfullscreen';
    if (maximized)
        return 'unmaximize';
    if (filled)
        return 'unfill';
    return resizable ? 'maximize' : 'center';
}

/** What a click on the green button can do (windows-green-click). */
export const GREEN_CLICK_MODES = ['fullscreen', 'zoom'];

/**
 * What a click on the green button does. macOS: a click enters full screen and Option-click
 * zooms; with the 'zoom' setting it is the other way round. A full-screen window leaves full
 * screen either way.
 *
 * @param {{mode: string, alt: boolean, fullscreen: boolean}} s
 * @returns {'unfullscreen'|'fullscreen'|'zoom'}
 */
export function planGreenClick({ mode, alt, fullscreen }) {
    if (fullscreen)
        return 'unfullscreen';
    const zoom = (mode === 'zoom') !== !!alt;
    return zoom ? 'zoom' : 'fullscreen';
}

/** Rect of the given size centred in `area` (all {x, y, width, height}), kept inside it. */
export function centerIn(area, width, height) {
    const w = Math.min(width, area.width);
    const h = Math.min(height, area.height);
    return {
        x: Math.round(area.x + (area.width - w) / 2),
        y: Math.round(area.y + (area.height - h) / 2),
        width: w,
        height: h,
    };
}

/** True when two rects are the same within `slack` pixels on each edge. */
export function sameRect(a, b, slack = 2) {
    if (!a || !b)
        return false;
    return Math.abs(a.x - b.x) <= slack && Math.abs(a.y - b.y) <= slack &&
        Math.abs(a.width - b.width) <= slack && Math.abs(a.height - b.height) <= slack;
}

/**
 * The WM button-layout Kiwi sets while the top-bar controls are off: the apps' own buttons on
 * the chosen side, at its outer edge (right: minimize,maximize,close; left: close,minimize,
 * maximize, macOS order), or close alone with set 'close'. The other entries of `original`
 * (appmenu, icon, spacer) are kept. When the buttons move to the other side than the original
 * had them, the whole layout is mirrored, so the app menu stays opposite the buttons:
 * 'appmenu:close' -> right 'appmenu:minimize,maximize,close', left 'close,minimize,maximize:appmenu'.
 *
 * @param {string} original the user's layout
 * @param {{position?: string, set?: string}} opts position 'right' | 'left', set 'all' | 'close'
 * @returns {string}
 */
export function appButtonsLayout(original, { position = 'right', set = 'all' } = {}) {
    const parts = String(original ?? '').split(':');
    const extras = part => (part ?? '').split(',')
        .map(b => b.trim())
        .filter(b => b && !VALID_BUTTONS.includes(b));
    let left = extras(parts[0]);
    let right = extras(parts[1]);
    const side = position === 'left' ? 'left' : 'right';
    if (side !== parseButtonLayout(original).side)
        [left, right] = [right.reverse(), left.reverse()];
    if (side === 'right')
        right = [...right, ...(set === 'close' ? ['close'] : SYSTEM_RIGHT_ORDER)];
    else
        left = [...(set === 'close' ? ['close'] : MACOS_ORDER), ...left];
    return `${left.join(',')}:${right.join(',')}`;
}

/**
 * Do GTK apps (and Firefox / Thunderbird) get Kiwi's macOS traffic-light CSS?
 * - Top-bar controls on, but the apps keep their buttons (scope maximized / fullscreen, or
 *   remove-titlebar-buttons off): enable-app-window-buttons decides, as before.
 * - Otherwise app-buttons-style decides ('gnome' = the stock look). That includes controls on
 *   with the layout owned (the apps draw no buttons then), so the CSS does not change when the
 *   controls are toggled: GTK reads gtk.css only at start, and open apps would otherwise keep
 *   the old look until restarted (seen in the real Shell, GNOME 50.6).
 */
export function appButtonsMacos({ showOnPanel, remove = true, scope = 'all', enableAppButtons, style }) {
    if (showOnPanel && !ownsButtonLayout({ showOnPanel, remove, scope }))
        return !!enableAppButtons;
    return style === 'macos';
}

/**
 * The GTK stylesheets (in gtk/) Kiwi imports into ~/.config/gtk-<version>.0/gtk.css, in
 * order. One traffic-light set (titlebuttons<v>.css, plus its small size), the titlebar
 * button hiding of the top-bar controls, and the app fixes of popup-menu-styling (last, so
 * they can override the rest).
 *
 * @param {{showOnPanel: boolean, remove: boolean, scope: string, enableAppButtons: boolean,
 *   style: string, size: string, appFixes: boolean, hideTitlebars?: boolean}} config
 * @param {'3'|'4'} version GTK major version
 * @returns {string[]} file names
 */
export function gtkSheets(config, version) {
    const sheets = [];
    if (appButtonsMacos(config)) {
        sheets.push(`titlebuttons${version}.css`);
        if (config.size === 'small')
            sheets.push(`titlebuttons-size-small${version}.css`);
    }
    const hide = titlebarHideSheet({ ...config, gtkVersion: version });
    if (hide)
        sheets.push(hide);
    // Plain GTK3 title bars (no header bar) go only when the owner asks; GTK 4 has none
    if (config.hideTitlebars && version === '3')
        sheets.push('hide-titlebar-plain3.css');
    if (config.appFixes)
        sheets.push(`fixes${version}.css`);
    return sheets;
}

// --- Title bars Mutter draws (X11 windows): _MOTIF_WM_HINTS, the property Mutter reads to decide

const MWM_HINTS_DECORATIONS = 2;

/**
 * The five 32-bit values of a `xprop -id X _MOTIF_WM_HINTS` output, or null when the window
 * has no such property (or the output is not what xprop prints).
 *
 * @param {string} output
 * @returns {?number[]}
 */
export function parseMotifHints(output) {
    const m = /=\s*((?:0x[0-9a-f]+|\d+)(?:\s*,\s*(?:0x[0-9a-f]+|\d+))*)\s*$/im.exec(String(output ?? ''));
    const values = m ? m[1].split(',').map(v => Number(v.trim())) : [];
    return values.length === 5 && values.every(Number.isInteger) ? values : null;
}

/**
 * The hints with the decorations taken away: the decorations flag set and its field 0, every
 * other field as the window had it.
 *
 * @param {?number[]} original null when the window had none
 * @returns {number[]}
 */
export function undecoratedHints(original) {
    const [flags, functions, , input, status] = original ?? [0, 0, 0, 0, 0];
    return [flags | MWM_HINTS_DECORATIONS, functions, 0, input, status];
}

/**
 * The xprop arguments that set the hints of window `xid`, or remove the property (null).
 *
 * @param {string} xid '0x...'
 * @param {?number[]} values
 * @returns {string[]}
 */
export function motifArgs(xid, values) {
    return values
        ? ['xprop', '-id', xid, '-f', '_MOTIF_WM_HINTS', '32c', '-set', '_MOTIF_WM_HINTS', values.join(', ')]
        : ['xprop', '-id', xid, '-remove', '_MOTIF_WM_HINTS'];
}

/** Should the title bar Mutter draws be taken off this window? */
export function hidesFrameTitlebar({ enabled, serverSide, x11, maximized, fullscreen }) {
    return !!enabled && !!serverSide && !!x11 && (!!maximized || !!fullscreen);
}
