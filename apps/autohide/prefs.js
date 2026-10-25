// SPDX-License-Identifier: GPL-3.0-or-later
// Prefs for the auto-hide top bar. Adw/Gtk/Gio/GObject only (runs in the prefs process).

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

const N_ = s => s;

export const PAGE = { id: 'autohide', title: N_('Auto-hide Top Bar'), icon: 'view-fullscreen-symbolic' };

/**
 * @param {{settings: Gio.Settings, window: Adw.PreferencesWindow, extension: object}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, extension }) {
    const _ = s => extension.gettext(s);
    const group = new Adw.PreferencesGroup({
        title: _('Auto-hide'),
        description: _('The top bar slides away and comes back when the pointer pushes against the top edge.'),
    });

    const master = new Adw.SwitchRow({
        title: _('Auto-hide the top bar'),
        subtitle: _('Windows then use the full screen height'),
    });
    settings.bind('panel-autohide', master, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(master);

    const fullscreenOnly = new Adw.SwitchRow({
        title: _('Only over fullscreen windows'),
        subtitle: _('Keep the top bar and its space otherwise'),
    });
    settings.bind('panel-autohide-fullscreen-only', fullscreenOnly, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(fullscreenOnly);

    const keepOnDesktop = new Adw.SwitchRow({
        title: _('Keep visible on an empty desktop'),
        subtitle: _('Do not hide while no window is open on the main screen'),
    });
    settings.bind('panel-autohide-keep-on-desktop', keepOnDesktop, 'active', Gio.SettingsBindFlags.DEFAULT);
    group.add(keepOnDesktop);

    const spin = (title, subtitle, key, upper) => {
        const row = new Adw.SpinRow({
            title,
            subtitle,
            adjustment: new Gtk.Adjustment({ lower: 0, upper, step_increment: 50, page_increment: 250 }),
        });
        settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
        return row;
    };
    const revealRow = spin(_('Reveal delay (ms)'), _('How long to push against the top edge'),
        'panel-autohide-reveal-delay', 2000);
    const hideRow = spin(_('Hide delay (ms)'), _('How long after the pointer leaves the top bar'),
        'panel-autohide-hide-delay', 5000);

    for (const row of [fullscreenOnly, keepOnDesktop, revealRow, hideRow])
        master.bind_property('active', row, 'sensitive', GObject.BindingFlags.SYNC_CREATE);

    return [group];
}
