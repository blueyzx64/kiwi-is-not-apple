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
        subtitle: _('Hide the buttons that windows draw themselves while the panel shows them. ' +
            'Works for GTK 3 and GTK 4 apps; Qt, Electron and server-side decorated windows keep theirs'),
    });
    group.add(remove);
    settings.bind('remove-titlebar-buttons', remove, 'active', Gio.SettingsBindFlags.DEFAULT);

    window.connect('close-request', () => {
        for (const c of [scope, position]) {
            c.row.disconnect(c.rowId);
            settings.disconnect(c.settingsId);
        }
        return false;
    });

    return [group];
}
