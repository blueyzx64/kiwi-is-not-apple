// SPDX-License-Identifier: GPL-3.0-or-later
// Every settings migration Kiwi has, in one list, and the only code (with lib/cleanup/) that
// may read a deprecated key (tests/deprecatedKeys.test.js checks). extension.js runs it in
// enable(), before the feature registry starts, so no migration write can land in the middle
// of a registry pass (a feature's `when` would see the new key's default, then the migrated
// value). Pure data and logic; no gi imports.
//
// To add one: append an entry with a stable `id` (or rely on `${from}->${to}`), and give the
// old key "(Deprecated, unused)" in the schema.

import { runMigrations } from './settings.js';
import { legacySurfaces, legacyTint } from './glassParams.js';

/** The legacy layout key the window controls used before core/originals.js. */
const LEGACY_BUTTON_LAYOUT_KEY = 'saved-button-layout';

// The user's own value of a boolean key, or null when it is unset or missing.
function userBool(gs, key) {
    if (gs.settings_schema && !gs.settings_schema.has_key(key))
        return null;
    const v = gs.get_user_value(key);
    return v === null ? null : v.get_boolean();
}

// panel-blur / dock-blur -> liquid-glass-surfaces. Both entries map from both old keys, so
// whichever runs first writes the combined list and the other is skipped (`to` is then set).
const surfacesFromLegacy = (_value, gs) =>
    legacySurfaces({ panelBlur: userBool(gs, 'panel-blur'), dockBlur: userBool(gs, 'dock-blur') }) ?? [];

// liquid-glass-style / liquid-glass-tint -> the Clear <-> Tinted slider (glass-tint). Both map
// from both old keys, like the surfaces above, so a user who set either keeps their look.
const userValue = (gs, key, read) => (gs.get_user_value(key) === null ? null : read(gs, key));
const tintFromLegacy = (_value, gs) => legacyTint(
    userValue(gs, 'liquid-glass-style', (g, k) => g.get_string(k)) ?? 'tinted',
    userValue(gs, 'liquid-glass-tint', (g, k) => g.get_int(k)));

export const ALL_MIGRATIONS = [
    // 2.x
    { from: 'panel-blur', to: 'liquid-glass-surfaces', map: surfacesFromLegacy },
    { from: 'dock-blur', to: 'liquid-glass-surfaces', map: surfacesFromLegacy },
    { from: 'add-username-to-quick-menu', to: 'control-center-user-row' },
    // Round 2: one side for the window buttons, right by default.
    // A side the user chose stays; 'system' becomes the side their own button layout has.
    // The top-bar choice wins over the one for the apps (the first to write sets the key).
    {
        id: 'r2-window-controls-side', from: 'window-controls-position', to: 'window-controls-side',
        map: (position, _gs, context) => (position === 'system' ? context.buttonLayoutSide?.() ?? 'right' : position),
    },
    { id: 'r2-app-buttons-side', from: 'app-buttons-position', to: 'window-controls-side' },
    // Round 3: the top-bar window controls are gone; macOS buttons on the apps' titlebars are
    // decided by app-buttons-style alone (enable-app-window-buttons used to, with the controls on)
    { id: 'r3-app-buttons-style', from: 'enable-app-window-buttons', to: 'app-buttons-style', map: on => (on ? 'macos' : 'gnome') },
    // v3: the glass style and tint became one Clear <-> Tinted slider
    { id: 'v3-glass-tint-style', from: 'liquid-glass-style', to: 'glass-tint', map: tintFromLegacy },
    { id: 'v3-glass-tint-tint', from: 'liquid-glass-tint', to: 'glass-tint', map: tintFromLegacy },
    // v3: hide-activities-button became a menu-bar option, stored the positive way round
    { id: 'v3-menubar-activities', from: 'hide-activities-button', to: 'menubar-show-activities', map: hide => !hide },
    // v3: the notch's volume and brightness switch became the OSD location (off: GNOME's pop-up)
    { id: 'v3-osd-location', from: 'notch-osd', to: 'osd-location', map: on => (on ? 'notch' : 'system') },
];

/**
 * Run all migrations once (see runMigrations). Errors are logged per migration.
 *
 * @param {Gio.Settings} gs Kiwi's settings
 * @param {{buttonLayoutSide?: () => 'left'|'right'}} [context] the side the user's own window
 *   button layout has (read only when a migration needs it)
 * @returns {string[]} keys written
 */
export function runAllMigrations(gs, context = {}) {
    return runMigrations(gs, ALL_MIGRATIONS, context);
}

/**
 * Kiwi 2.x kept the user's window button-layout in `saved-button-layout` while the window
 * controls owned it. A value left there means a 2.x session ended without giving it back:
 * write it back once (core/originals.js keeps such values now).
 *
 * @param {Gio.Settings} gs Kiwi's settings
 * @param {{get_string: Function, set_string: Function}} wmSettings org.gnome.desktop.wm.preferences
 * @returns {boolean} true if it wrote the layout back
 */
export function restoreLegacyButtonLayout(gs, wmSettings) {
    if (gs.settings_schema && !gs.settings_schema.has_key(LEGACY_BUTTON_LAYOUT_KEY))
        return false;
    const saved = gs.get_string(LEGACY_BUTTON_LAYOUT_KEY);
    if (!saved)
        return false;
    if (wmSettings.get_string('button-layout') !== saved)
        wmSettings.set_string('button-layout', saved);
    gs.set_string(LEGACY_BUTTON_LAYOUT_KEY, '');
    return true;
}
