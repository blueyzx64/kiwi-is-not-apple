// SPDX-License-Identifier: GPL-3.0-or-later
// Screen corners preferences. Adw/Gtk/Gio only (runs in the prefs process, no Shell libs).
// buildPrefs() returns the Adw.PreferencesGroup[]; prefs/pages/ places them on the Notch page,
// the other half of the MacBook display Kiwi draws.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import { RADIUS_MAX, RADIUS_MIN, WHICH_DEFAULT, WHICH_VALUES } from './model.js';

const KEY = 'screen-corners';
const KEY_WHICH = 'screen-corners-which';

export function buildPrefs({ settings, extension }) {
    const _ = s => extension.gettext(s);
    const group = new Adw.PreferencesGroup({
        title: _('Screen corners'),
        description: _('The rounded corners of a MacBook display, drawn in black over the corners of every screen. They stay above everything and take no clicks.'),
    });

    const enabled = new Adw.SwitchRow({ title: _('Rounded screen corners') });
    settings.bind(KEY, enabled, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(enabled);

    // Same order as WHICH_VALUES
    const which = new Adw.ComboRow({
        title: _('Corners'),
        model: Gtk.StringList.new([_('Top corners only'), _('All four corners')]),
    });
    const sync = () => {
        const i = WHICH_VALUES.indexOf(settings.get_string(KEY_WHICH));
        const want = i >= 0 ? i : WHICH_VALUES.indexOf(WHICH_DEFAULT);
        if (which.selected !== want)
            which.selected = want;
    };
    sync();
    which.connect('notify::selected', () => {
        const v = WHICH_VALUES[which.selected];
        if (v && settings.get_string(KEY_WHICH) !== v)
            settings.set_string(KEY_WHICH, v);
    });
    const id = settings.connect(`changed::${KEY_WHICH}`, sync);
    group.connect('destroy', () => settings.disconnect(id));
    settings.bind(KEY, which, 'sensitive', Gio.SettingsBindFlags.GET);
    group.add(which);

    const radius = new Adw.SpinRow({
        title: _('Corner radius'),
        subtitle: _('In pixels'),
        adjustment: new Gtk.Adjustment({ lower: RADIUS_MIN, upper: RADIUS_MAX, step_increment: 1, page_increment: 4 }),
    });
    settings.bind('screen-corners-radius', radius, 'value', Gio.SettingsBindFlags.DEFAULT);
    settings.bind(KEY, radius, 'sensitive', Gio.SettingsBindFlags.GET);
    group.add(radius);

    return [group];
}
