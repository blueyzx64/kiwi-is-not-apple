// SPDX-License-Identifier: GPL-3.0-or-later
// macOS-style alerts for the Shell's modal dialogs: which dialog it is and the icon on top.
// Pure (no gi imports).

// EndSessionDialog's DialogType (js/ui/endSessionDialog.js, the same in 48.0-50.0 and main)
const END_SESSION_ICONS = Object.freeze({
    0: 'system-log-out-symbolic',    // LOGOUT
    1: 'system-shutdown-symbolic',   // SHUTDOWN
    2: 'system-reboot-symbolic',     // RESTART
    3: 'system-software-install-symbolic', // UPDATE_RESTART
    4: 'system-software-install-symbolic', // UPGRADE_RESTART
});

/**
 * Where the ⇪ goes inside a password field (macOS: at the trailing edge, before the field's
 * own button such as the Shell's show-password eye). Rects are in the same coordinates.
 *
 * @param {{x, y, width, height}} entry the password entry
 * @param {?{x, y, width, height}} button the entry's trailing icon, when visible
 * @param {{width: number, height: number}} icon
 * @param {number} [inset] px from the trailing edge (or the button)
 * @returns {{x: number, y: number}}
 */
export function capsIconPosition(entry, button, icon, inset = 8) {
    const right = button ? button.x - inset / 2 : entry.x + entry.width - inset;
    return {
        x: Math.round(right - icon.width),
        y: Math.round(entry.y + (entry.height - icon.height) / 2),
    };
}

/**
 * Which password field shows the ⇪: the one with the keyboard focus, else the first that is
 * on screen (macOS shows it in the field you type into).
 *
 * @param {{focused: boolean, shown: boolean}[]} fields
 * @returns {number} an index, or -1
 */
export function capsIconField(fields) {
    const focused = fields.findIndex(f => f.focused && f.shown);
    return focused >= 0 ? focused : fields.findIndex(f => f.shown);
}

/**
 * Which Shell dialog a card is, from the style classes of its `.modal-dialog` box.
 *
 * @param {string} styleClass the box's style_class
 * @returns {'end-session'|'auth'|'run'|'other'}
 */
export function dialogKind(styleClass) {
    const classes = (styleClass ?? '').split(/\s+/);
    if (classes.includes('end-session-dialog'))
        return 'end-session';
    if (classes.includes('prompt-dialog'))
        return 'auth';
    if (classes.includes('run-dialog'))
        return 'run';
    return 'other';
}

/**
 * The icon on top of the card, like the app icon of a macOS alert; null for dialogs that
 * bring their own picture (other extensions', Kiwi's About This PC).
 *
 * @param {string} kind dialogKind()
 * @param {?number} endSessionType EndSessionDialog._type while it opens
 * @returns {?string}
 */
export function dialogIcon(kind, endSessionType = null) {
    switch (kind) {
    case 'end-session':
        return END_SESSION_ICONS[endSessionType] ?? 'system-shutdown-symbolic';
    case 'auth':
        return 'dialog-password-symbolic';
    case 'run':
        return 'system-run-symbolic';
    default:
        return null;
    }
}
