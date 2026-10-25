// SPDX-License-Identifier: GPL-3.0-or-later
// Every settings migration Kiwi has, in one list. extension.js runs it in enable(), before
// the feature registry starts, so no migration write can land in the middle of a registry
// pass (a feature's `when` would see the new key's default, then the migrated value).
// Pure data; no gi imports.
//
// To add one: export a MIGRATIONS array from the feature's pure model file and add it here.

import { runMigrations } from './settings.js';
import { MIGRATIONS as GLASS } from './glassParams.js';
import { MIGRATIONS as WINDOW_CONTROLS } from '../apps/windowControls/model.js';
import { MIGRATIONS as CONTROL_CENTER } from '../apps/controlCenter/model.js';

export const ALL_MIGRATIONS = [
    ...GLASS,
    ...WINDOW_CONTROLS,
    ...CONTROL_CENTER,
];

/**
 * Run all migrations once (see runMigrations). Errors are logged per migration.
 *
 * @param {Gio.Settings} gs Kiwi's settings
 * @returns {string[]} keys written
 */
export function runAllMigrations(gs) {
    return runMigrations(gs, ALL_MIGRATIONS);
}
