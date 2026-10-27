// SPDX-License-Identifier: GPL-3.0-or-later
// Dock preferences (macOS "Desktop & Dock"). Adw/Gtk/Gio only (the prefs process).
// buildPrefs() returns the groups; prefs/pages/dock.js places them on the Dock page.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { comboRow, switchRow } from '../../prefs/widgets.js';

/** A spin row bound to an integer key. */
function spinRow(settings, { key, title, subtitle, lower, upper, step }) {
    const row = new Adw.SpinRow({
        title, subtitle,
        adjustment: new Gtk.Adjustment({ lower, upper, step_increment: step, page_increment: step * 4 }),
    });
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

/**
 * @param {{settings: Gio.Settings, _: Function}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, _ }) {
    const dock = new Adw.PreferencesGroup({
        title: _('Dock'),
        description: _('Pinned apps are your GNOME favourites. Dash to Dock is turned off while Kiwi’s dock runs and turned back on when it stops.'),
    });
    dock.add(switchRow(settings, _('Show the Dock'), _('Kiwi’s own dock with your apps, Downloads and the Trash'), 'dock'));
    dock.add(spinRow(settings, {
        key: 'dock-icon-size', title: _('Size'), subtitle: _('Icon size in pixels'), lower: 24, upper: 128, step: 4,
    }));
    dock.add(comboRow(settings, {
        title: _('Position on screen'), key: 'dock-position',
        values: ['left', 'bottom', 'right'], labels: [_('Left'), _('Bottom'), _('Right')],
    }));

    const behaviour = new Adw.PreferencesGroup({ title: _('Behaviour') });
    const autohide = switchRow(settings, _('Automatically hide and show the Dock'),
        _('Rest the pointer on the screen edge, or push against it, to show the dock'), 'dock-autohide');
    behaviour.add(autohide);
    const delay = spinRow(settings, {
        key: 'dock-autohide-delay', title: _('Reveal delay'), subtitle: _('Milliseconds the pointer rests on the edge'),
        lower: 0, upper: 2000, step: 50,
    });
    settings.bind('dock-autohide', delay, 'sensitive', Gio.SettingsBindFlags.GET);
    behaviour.add(delay);
    behaviour.add(switchRow(settings, _('Show indicators for open applications'), null, 'dock-running-dots'));
    behaviour.add(switchRow(settings, _('Show suggested and recent apps in Dock'),
        _('Up to three recent apps that are not pinned, in their own section'), 'dock-show-recents'));
    behaviour.add(switchRow(settings, _('Minimize windows into application icon'),
        _('Off: each minimized window gets its own tile beside the Downloads stack'), 'dock-minimize-to-app'));

    const downloads = new Adw.PreferencesGroup({ title: _('Downloads Stack') });
    downloads.add(switchRow(settings, _('Show Downloads in the Dock'), _('Your newest downloads, before the Trash'), 'dock-downloads'));
    const view = comboRow(settings, {
        title: _('View content as'), key: 'dock-downloads-view',
        values: ['automatic', 'fan', 'grid', 'list'], labels: [_('Automatic'), _('Fan'), _('Grid'), _('List')],
    });
    settings.bind('dock-downloads', view, 'sensitive', Gio.SettingsBindFlags.GET);
    downloads.add(view);

    return [dock, behaviour, downloads];
}
