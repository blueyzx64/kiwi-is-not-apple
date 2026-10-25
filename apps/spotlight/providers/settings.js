// SPDX-License-Identifier: GPL-3.0-or-later
// Settings results: GNOME Settings panels plus a few Kiwi switches.

import Gio from 'gi://Gio';

import * as Util from 'resource:///org/gnome/shell/misc/util.js';

import { rank } from '../model.js';
import { settingsItems } from './settingsCatalog.js';

const SETTINGS_APP = 'org.gnome.Settings.desktop';
const MAX_RESULTS = 8;

export class SettingsProvider {
    /**
     * @param {{settings: Gio.Settings, gettext: Function, extension: object}} ctx
     */
    constructor(ctx) {
        this._ctx = ctx;
        this._items = null;
        this._panelsAvailable = null;
    }

    /** Drop the cached list (a toggle changed value, or a Kiwi key appeared). */
    invalidate() {
        this._items = null;
    }

    _list() {
        if (this._items)
            return this._items;
        const { settings, gettext } = this._ctx;
        this._panelsAvailable ??= !!Gio.DesktopAppInfo.new(SETTINGS_APP);
        const schema = settings.settings_schema;
        this._items = settingsItems(gettext, {
            panelsAvailable: this._panelsAvailable,
            has: key => schema.has_key(key),
            read: key => settings.get_boolean(key),
        });
        return this._items;
    }

    searchSync(query) {
        return rank(this._list(), query, MAX_RESULTS);
    }

    /** @returns {boolean} true when something was done */
    activate(item) {
        const { action } = item;
        const { settings, extension } = this._ctx;
        switch (action?.type) {
        case 'panel':
            if (!/^[a-z-]+$/.test(action.panel))
                return false;
            Util.spawn(['gnome-control-center', action.panel]);
            return true;
        case 'toggle':
            if (!settings.settings_schema.has_key(action.key))
                return false;
            settings.set_boolean(action.key, !!action.to);
            this.invalidate();
            return true;
        case 'kiwi-prefs':
            extension.openPreferences();
            return true;
        default:
            return false;
        }
    }
}
