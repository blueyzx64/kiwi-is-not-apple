// SPDX-License-Identifier: GPL-3.0-or-later
// AppNames: the name Kiwi draws for an app (dock, Launchpad, Spotlight, app switcher), so an
// app profile (core/appMenus/profiles.js: Files as "Finder") reads the same everywhere.
//
//   import { AppNames } from '../../core/appNames.js';
//   label.text = AppNames.of(app);                       // Shell.App or Gio.AppInfo
//   AppNames.forId('org.gnome.Nautilus.desktop', 'Files');
//
// extension.js configures it with Kiwi's settings and resets it on disable; unconfigured it
// returns the app's own name. Features that cache labels restart on the profile keys
// (features.js restartOn), so nothing here watches settings.

import { displayName, profileKeywords } from './appMenus/profiles.js';

let _settings = null;

const isOn = key => !!_settings?.get_boolean(key);

export const AppNames = Object.freeze({
    /** @param {?Gio.Settings} settings Kiwi's settings, or null on disable */
    configure(settings) {
        _settings = settings;
    },

    /** @returns {string} the name for an app id, `fallback` when no profile applies */
    forId(appId, fallback) {
        return _settings ? displayName(appId, fallback, isOn) : fallback;
    },

    /** @param {Shell.App|Gio.AppInfo} app */
    of(app) {
        if (!app)
            return '';
        const own = app.get_name() ?? '';
        return this.forId(app.get_id?.() ?? null, own);
    },

    /** @returns {string[]} extra search words (the profile name and the app's own name) */
    keywords(appId, ownName) {
        return _settings ? profileKeywords(appId, ownName, isOn) : [];
    },
});
