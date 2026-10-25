// SPDX-License-Identifier: GPL-3.0-or-later
// Prefs for the panel window controls. Adw/Gtk/Gio only (runs in the prefs process).
// The groups go on the Window Controls page, below the "show on panel" master row.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

export const PAGE = { into: 'windowControls' };

function comboRow(settings, { title, subtitle, key, values, labels }) {
    const row = new Adw.ComboRow({ title, subtitle, model: Gtk.StringList.new(labels) });
    const sync = () => {
        const i = values.indexOf(settings.get_string(key));
        row.selected = i < 0 ? 0 : i;
    };
    sync();
    const rowId = row.connect('notify::selected', () => {
        const value = values[row.selected];
        if (value !== undefined && settings.get_string(key) !== value)
            settings.set_string(key, value);
    });
    const settingsId = settings.connect(`changed::${key}`, sync);
    return { row, rowId, settingsId };
}

/**
 * @param {{settings: Gio.Settings, window: Adw.PreferencesWindow, extension: object}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, window, extension }) {
    const _ = s => extension.gettext(s);
    const group = new Adw.PreferencesGroup({
        title: _('Panel Window Controls'),
        description: _('Close, minimize and maximize buttons for the focused window.'),
    });

    const scope = comboRow(settings, {
        title: _('Show buttons for'),
        subtitle: _('Which focused windows get the buttons in the top bar'),
        key: 'window-controls-scope',
        values: ['all', 'maximized', 'fullscreen'],
        labels: [_('All windows'), _('Maximized windows'), _('Fullscreen windows')],
    });
    group.add(scope.row);

    const position = comboRow(settings, {
        title: _('Position'),
        subtitle: _('System follows the window button layout of GNOME'),
        key: 'window-controls-position',
        values: ['system', 'left', 'right'],
        labels: [_('System'), _('Left'), _('Right')],
    });
    group.add(position.row);

    const remove = new Adw.SwitchRow({
        title: _('Remove titlebar buttons from windows'),
        subtitle: _('While the top bar shows the buttons for all windows, Kiwi sets a GNOME button layout ' +
            'without them (GTK, libadwaita, Chromium/Electron and server-side frames follow it) and restores ' +
            'yours when turned off. With the maximized or fullscreen scope only GTK apps lose theirs'),
    });
    group.add(remove);
    settings.bind('remove-titlebar-buttons', remove, 'active', Gio.SettingsBindFlags.DEFAULT);

    // The apps' own buttons, managed while the top-bar controls are off
    const appGroup = new Adw.PreferencesGroup({
        title: _('When top-bar controls are off'),
        description: _('Apps get their own titlebar buttons back. Kiwi sets the GNOME button layout ' +
            'and restores yours when the top-bar controls come back on or Kiwi is disabled.'),
    });
    settings.bind('show-window-controls', appGroup, 'sensitive',
        Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.INVERT_BOOLEAN);

    const appPosition = comboRow(settings, {
        title: _('Position'),
        subtitle: _('Side of the titlebar for close, minimize and maximize'),
        key: 'app-buttons-position',
        values: ['right', 'left'],
        labels: [_('Right'), _('Left')],
    });
    appGroup.add(appPosition.row);

    const appStyle = comboRow(settings, {
        title: _('Style'),
        subtitle: _('GNOME keeps the stock look; macOS uses the button type and size above. ' +
            'Open apps pick up a new style when restarted'),
        key: 'app-buttons-style',
        values: ['gnome', 'macos'],
        labels: [_('GNOME'), _('macOS')],
    });
    appGroup.add(appStyle.row);

    const appSet = comboRow(settings, {
        title: _('Buttons'),
        subtitle: _('Close only is the stock Fedora layout'),
        key: 'app-buttons-set',
        values: ['all', 'close'],
        labels: [_('Close, minimize and maximize'), _('Close only')],
    });
    appGroup.add(appSet.row);

    window.connect('close-request', () => {
        for (const c of [scope, position, appPosition, appStyle, appSet]) {
            c.row.disconnect(c.rowId);
            settings.disconnect(c.settingsId);
        }
        return false;
    });

    return [group, appGroup];
}
