// SPDX-License-Identifier: GPL-3.0-or-later
// Tiles the Control Center adds to the stock grid.
//
// - A setting tile (Stage Manager, Liquid Glass) is a 1x1 icon button bound to a Kiwi boolean
//   key. It never calls the feature: the feature registry reacts to the key.
// - On GNOME 48 there is no stock Do Not Disturb toggle (49 moved it into Quick Settings),
//   so the Control Center builds one with the same binding GNOME 49 uses.

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import { QuickToggle } from 'resource:///org/gnome/shell/ui/quickSettings.js';

/**
 * @param {object} opts
 * @param {Gio.Settings} opts.settings Kiwi settings
 * @param {string} opts.key boolean key
 * @param {string} opts.iconName
 * @param {string} opts.name accessible name and tooltip-like label
 * @returns {St.Button|null} null when the key is not in the schema
 */
export function createSettingTile({ settings, key, iconName, name }) {
    if (!settings.settings_schema?.has_key(key))
        return null;

    const tile = new St.Button({
        style_class: 'quick-toggle button kiwi-cc-tile',
        accessible_name: name,
        accessible_role: Atk.Role.TOGGLE_BUTTON,
        can_focus: true,
        toggle_mode: true,
        x_expand: true,
        child: new St.Icon({
            icon_name: iconName,
            style_class: 'quick-toggle-icon',
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        }),
    });
    settings.bind(key, tile, 'checked', Gio.SettingsBindFlags.DEFAULT);
    tile.connect('destroy', () => {
        try {
            Gio.Settings.unbind(tile, 'checked');
        } catch (_e) {
            // Already unbound with the object
        }
    });
    return tile;
}

/** GNOME 49's Do Not Disturb toggle, for GNOME 48. Checked means banners are off. */
export function createDndToggle(gettext) {
    const notifications = new Gio.Settings({ schema_id: 'org.gnome.desktop.notifications' });
    const toggle = new QuickToggle({
        title: gettext('Do Not Disturb'),
        iconName: 'notifications-disabled-symbolic',
        toggleMode: true,
    });
    notifications.bind('show-banners', toggle, 'checked', Gio.SettingsBindFlags.INVERT_BOOLEAN);
    toggle.connect('destroy', () => {
        try {
            Gio.Settings.unbind(toggle, 'checked');
        } catch (_e) {
            // Already unbound with the object
        }
    });
    return toggle;
}
