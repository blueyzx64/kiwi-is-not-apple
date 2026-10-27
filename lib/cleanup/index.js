// SPDX-License-Identifier: GPL-3.0-or-later
// The v3 one-shot cleanup: removes what Kiwi 2.x wrote outside the extension for features v3
// dropped, and nothing else (CLAUDE.md: never delete or overwrite user files Kiwi did not
// create). extension.js starts it after the features; it runs in the background on async Gio
// and records CLEANUP_ID in `migrations-done` only when every step succeeded, so a failed or
// interrupted run is simply tried again at the next start. Each step is idempotent.
//
// Steps:
//   mozilla       Firefox/Thunderbird profiles: Kiwi's userChrome.css block, chrome/ swap,
//                 tagged user.js pref, the profile state file (mozilla.js)
//   gtk-css       imports into Kiwi 2.x's css/ folder in the managed block of
//                 ~/.config/gtk-{3,4}.0/gtk.css (the block itself belongs to gtkTheme.js)
//   gtk-modules   advanced/'s ~/.config/environment.d/10-gtk3-titlebuttons.conf (Kiwi's lines)
//                 and its module under ~/.local/share/kiwi/gtk3-modules
//   dock-colours  Dash to Dock colours a crashed session left (dock-colors-saved)

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { MIGRATIONS_DONE_KEY } from '../settings.js';
import * as fs from './fileOps.js';
import { cleanMozillaProfiles } from './mozilla.js';
import {
    ENV_CONF_NAME, GTK_MODULE_NAME, dockColourPlan, environmentLoadsModule, isLegacyCssPath,
    parseSavedDockColours, stripKiwiEnvironment, stripStaleGtkImports,
} from './cleanupModel.js';

export const CLEANUP_ID = 'v3-user-files';
const DOCK_SCHEMA = 'org.gnome.shell.extensions.dash-to-dock';
// Read once here, then the key is deprecated (see the schema)
const DOCK_SAVED_KEY = 'dock-colors-saved';

const join = (...parts) => GLib.build_filenamev(parts);

/** gtk.css: drop imports of the 2.x css/ folder from Kiwi's block. */
export async function cleanGtkCss(configDir = GLib.get_user_config_dir()) {
    for (const v of ['3', '4']) {
        await fs.enqueueUserFileJob(() => fs.editText(join(configDir, `gtk-${v}.0`, 'gtk.css'),
            text => stripStaleGtkImports(text, isLegacyCssPath)));
    }
    return true;
}

/**
 * environment.d: Kiwi's GTK3 module lines out; the module file goes once this session's
 * environment no longer loads it (apps started now would warn), so it may take a login.
 *
 * @returns {Promise<boolean>} true when nothing of it is left
 */
export async function cleanGtkModules({
    configDir = GLib.get_user_config_dir(), dataDir = GLib.get_user_data_dir(),
    environment = GLib.getenv('GTK3_MODULES'),
} = {}) {
    const envDir = join(configDir, 'environment.d');
    await fs.enqueueUserFileJob(() => fs.editText(join(envDir, ENV_CONF_NAME), stripKiwiEnvironment,
        { deleteWhenEmpty: true }));
    const modules = [join(dataDir, 'kiwi', 'gtk3-modules', GTK_MODULE_NAME), join(envDir, GTK_MODULE_NAME)];
    if (environmentLoadsModule(environment)) {
        const any = (await Promise.all(modules.map(m => fs.exists(m)))).some(Boolean);
        return !any;
    }
    for (const m of modules)
        await fs.remove(m);
    const moduleDir = join(dataDir, 'kiwi', 'gtk3-modules');
    if (await fs.exists(moduleDir) && !(await fs.list(moduleDir)).length)
        await fs.remove(moduleDir);
    return true;
}

/** Dash to Dock colours Kiwi wrote, put back from the saved record. Sync GSettings only. */
export function restoreDockColours(settings, lookupSchema = id => Gio.SettingsSchemaSource.get_default()?.lookup(id, true)) {
    if (!settings.settings_schema?.has_key(DOCK_SAVED_KEY))
        return true;
    const saved = parseSavedDockColours(settings.get_string(DOCK_SAVED_KEY));
    if (!saved)
        return true;
    const schema = lookupSchema(DOCK_SCHEMA);
    if (schema) {
        const dock = new Gio.Settings({ settings_schema: schema });
        const current = {};
        for (const key of Object.keys(saved)) {
            if (schema.has_key(key) && dock.get_user_value(key) !== null)
                current[key] = dock.get_string(key);
        }
        for (const [key, step] of Object.entries(dockColourPlan(current, saved))) {
            if (step.action === 'reset')
                dock.reset(key);
            else
                dock.set_string(key, step.value);
        }
    }
    // Without Dash to Dock installed there is nothing to put back
    settings.set_string(DOCK_SAVED_KEY, '');
    return true;
}

/**
 * Run the cleanup unless it already completed.
 *
 * @param {Gio.Settings} settings Kiwi's settings
 * @param {{isCurrent?: () => boolean}} [opts] isCurrent: false once the extension was
 *   disabled (then nothing is recorded; the next start repeats the idempotent steps)
 * @returns {Promise<boolean>} true when complete (now or before)
 */
export async function runCleanup(settings, { isCurrent = () => true } = {}) {
    const done = () => settings.get_strv(MIGRATIONS_DONE_KEY);
    if (done().includes(CLEANUP_ID))
        return true;
    const steps = {
        'dock-colours': async () => restoreDockColours(settings),
        'mozilla': () => fs.enqueueUserFileJob(() => cleanMozillaProfiles()),
        'gtk-css': () => cleanGtkCss(),
        'gtk-modules': () => cleanGtkModules(),
    };
    let ok = true;
    for (const [name, step] of Object.entries(steps)) {
        try {
            ok = (await step()) !== false && ok;
        } catch (e) {
            ok = false;
            console.warn(`[Kiwi] cleanup step ${name} failed, will retry next start: ${e}`);
        }
    }
    if (ok && isCurrent() && !done().includes(CLEANUP_ID))
        settings.set_strv(MIGRATIONS_DONE_KEY, [...done(), CLEANUP_ID]);
    return ok;
}
