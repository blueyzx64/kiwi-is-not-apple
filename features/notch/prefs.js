// SPDX-License-Identifier: GPL-3.0-or-later
// Prefs for the notification notch. Adw/Gtk/Gio only (runs in the prefs process).

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';



/**
 * @param {{settings: Gio.Settings, window: Adw.PreferencesWindow, extension: object}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, extension }) {
    const _ = s => extension.gettext(s);
    const group = new Adw.PreferencesGroup({
        title: _('Notification notch'),
        description: _('A pill at the top centre of the screen shows notifications, music and volume changes. The notification history stays in the calendar menu.'),
    });

    const master = new Adw.SwitchRow({
        title: _('Show the notch'),
        subtitle: _('Moves the clock to the right and shows notifications in Quick Settings'),
    });
    settings.bind('notch', master, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(master);

    const part = (title, subtitle, key) => {
        const row = new Adw.SwitchRow({ title, subtitle });
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
        return row;
    };
    const notifications = part(_('Notifications'),
        _('Show banners in the notch instead of the standard banner'), 'notch-notifications');
    const activities = part(_('Live activities'),
        _('Replaces the top bar media button'), 'notch-live-activities');

    const timeout = new Adw.SpinRow({
        title: _('Notification time (seconds)'),
        subtitle: _('How long a banner stays. Hovering keeps it open; urgent ones stay until dismissed'),
        adjustment: new Gtk.Adjustment({ lower: 2, upper: 30, step_increment: 1, page_increment: 5 }),
    });
    settings.bind('notch-timeout', timeout, 'value', Gio.SettingsBindFlags.DEFAULT);
    group.add(timeout);

    const clipboard = part(_('Show clipboard in the dashboard'),
        _('Turn off to keep copied text off the screen while sharing it'), 'notch-show-clipboard');

    const rows = [notifications, activities, timeout, clipboard];
    const sync = () => rows.forEach(row => (row.sensitive = settings.get_boolean('notch')));
    const id = settings.connect('changed::notch', sync);
    sync();
    group.connect('destroy', () => settings.disconnect(id));

    return [group];
}
