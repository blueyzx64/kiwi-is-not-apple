// SPDX-License-Identifier: GPL-3.0-or-later
// Stage Manager preferences. Adw/Gtk/Gio only (runs in the prefs process, no Shell libs).
// Contract: PAGE + buildPrefs() returning Adw.PreferencesGroup[]; S10 wires it in.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

const N_ = s => s;

export const PAGE = { id: 'stage-manager', title: N_('Stage Manager'), icon: 'view-app-grid-symbolic' };

/**
 * @param {{settings: Gio.Settings, window: Adw.PreferencesWindow, extension: object}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, window, extension }) {
    const _ = s => extension.gettext(s);
    const handlers = [];
    const connect = (key, fn) => handlers.push(settings.connect(`changed::${key}`, fn));
    window.connect('close-request', () => {
        handlers.splice(0).forEach(id => settings.disconnect(id));
        return false;
    });

    const main = new Adw.PreferencesGroup({
        title: _('Stage Manager'),
        description: _('Other apps wait as live thumbnails in a strip at the edge of the screen. Click one to switch to it. While it is on, Minimize to Dock, window tiling by drag and Move Fullscreen Window are paused; their settings are kept.'),
    });
    const enabled = new Adw.SwitchRow({ title: _('Show the Stage Manager strip') });
    settings.bind('stage-manager', enabled, 'active', Gio.SettingsBindFlags.DEFAULT);
    main.add(enabled);

    const strip = new Adw.PreferencesGroup({ title: _('Strip') });

    const sides = ['left', 'right'];
    const side = new Adw.ComboRow({
        title: _('Side'),
        subtitle: _('Which screen edge holds the strip'),
        model: Gtk.StringList.new([_('Left'), _('Right')]),
    });
    const syncSide = () => {
        const i = sides.indexOf(settings.get_string('stage-manager-side'));
        side.selected = i < 0 ? 0 : i;
    };
    syncSide();
    side.connect('notify::selected', () => {
        const value = sides[side.selected];
        if (value && settings.get_string('stage-manager-side') !== value)
            settings.set_string('stage-manager-side', value);
    });
    connect('stage-manager-side', syncSide);
    strip.add(side);

    const autohide = new Adw.SwitchRow({
        title: _('Auto-hide'),
        subtitle: _('Hide the strip while a window overlaps it; reveal it at the screen edge'),
    });
    settings.bind('stage-manager-autohide', autohide, 'active', Gio.SettingsBindFlags.DEFAULT);
    strip.add(autohide);

    const group = new Adw.SwitchRow({
        title: _('Group windows by app'),
        subtitle: _('Windows of one app share a stack'),
    });
    settings.bind('stage-manager-group-by-app', group, 'active', Gio.SettingsBindFlags.DEFAULT);
    strip.add(group);

    const recent = new Adw.SpinRow({
        title: _('Apps in the strip'),
        subtitle: _('The most thumbnails to list'),
        adjustment: new Gtk.Adjustment({ lower: 1, upper: 10, step_increment: 1, page_increment: 2 }),
    });
    settings.bind('stage-manager-recent-count', recent, 'value', Gio.SettingsBindFlags.DEFAULT);
    strip.add(recent);

    // Dim the options while the strip is off
    const sync = () => {
        strip.sensitive = settings.get_boolean('stage-manager');
    };
    sync();
    connect('stage-manager', sync);

    return [main, strip];
}
