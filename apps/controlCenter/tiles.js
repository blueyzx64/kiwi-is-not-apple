// SPDX-License-Identifier: GPL-3.0-or-later
// Tiles the Control Center adds to the stock grid.
//
// - The Kiwi module: one full-width card with a tile per Kiwi feature (notch, Stage Manager,
//   window buttons, clipboard, Spotlight, Liquid Glass), each bound to its key.
// - On GNOME 48 there is no stock Do Not Disturb toggle (49 moved it into Quick Settings),
//   so the Control Center builds one with the same binding GNOME 49 uses.

import Atk from 'gi://Atk';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';
import { QuickToggle } from 'resource:///org/gnome/shell/ui/quickSettings.js';

import { kiwiTiles } from './model.js';

const ICON_SIZE = 18;

function _icon(name, extensionDir) {
    // Kiwi's own icons ship in icons/ (the Shell's icon theme does not know them)
    if (name.startsWith('kiwi-') && extensionDir) {
        const file = extensionDir.get_child('icons').get_child(`${name}.svg`);
        return new St.Icon({
            gicon: new Gio.FileIcon({ file }),
            fallback_icon_name: 'window-maximize-symbolic',
            icon_size: ICON_SIZE,
        });
    }
    return new St.Icon({ icon_name: name, icon_size: ICON_SIZE });
}

/**
 * One Kiwi feature tile: a rounded square with the icon, its short name under it. The
 * button is checked while the feature's key is on, and toggles the key both ways. It never
 * calls the feature: the feature registry reacts to the key.
 */
function _createTile({ settings, tile, gettext, extensionDir }) {
    const box = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
        style_class: 'kiwi-cc-kiwi-tile-box',
    });
    const square = new St.Bin({
        style_class: 'kiwi-cc-kiwi-tile-square',
        x_align: Clutter.ActorAlign.CENTER,
        child: _icon(tile.icon, extensionDir),
    });
    const label = new St.Label({
        style_class: 'kiwi-cc-kiwi-tile-label',
        text: gettext(tile.label),
        x_align: Clutter.ActorAlign.CENTER,
    });
    label.clutter_text.line_wrap = true;
    label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    label.clutter_text.line_alignment = Pango.Alignment.CENTER;
    box.add_child(square);
    box.add_child(label);

    const button = new St.Button({
        style_class: 'kiwi-cc-kiwi-tile',
        accessible_name: gettext(tile.label),
        accessible_role: Atk.Role.TOGGLE_BUTTON,
        can_focus: true,
        toggle_mode: true,
        x_expand: true,
        child: box,
    });
    button.label_actor = label;
    settings.bind(tile.key, button, 'checked', Gio.SettingsBindFlags.DEFAULT);
    button.connect('destroy', () => {
        try {
            Gio.Settings.unbind(button, 'checked');
        } catch (_e) {
            // Already unbound with the object
        }
    });
    return button;
}

/**
 * The "Kiwi" module: a full-width rounded card with one tile per Kiwi feature that can be
 * switched on and off (see KIWI_TOGGLES). Null when the schema has none of the keys.
 *
 * @param {object} opts
 * @param {Gio.Settings} opts.settings Kiwi settings
 * @param {Function} opts.gettext
 * @param {Gio.File} [opts.extensionDir] for Kiwi's own icons
 * @returns {St.Widget|null}
 */
export function createKiwiModule({ settings, gettext, extensionDir }) {
    const schema = settings.settings_schema;
    const tiles = kiwiTiles(key => !!schema?.has_key(key));
    if (!tiles.length)
        return null;

    const layout = new Clutter.GridLayout({
        column_homogeneous: true,
        column_spacing: 4,
        row_spacing: 10,
    });
    const grid = new St.Widget({
        style_class: 'kiwi-cc-kiwi-grid',
        layout_manager: layout,
        x_expand: true,
    });
    for (const tile of tiles)
        layout.attach(_createTile({ settings, tile, gettext, extensionDir }), tile.column, tile.row, 1, 1);

    const module = new St.BoxLayout({
        style_class: 'kiwi-cc-module kiwi-cc-kiwi',
        orientation: Clutter.Orientation.VERTICAL,
        x_expand: true,
    });
    module.add_child(new St.Label({ style_class: 'kiwi-cc-module-title', text: 'Kiwi' }));
    module.add_child(grid);
    return module;
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
