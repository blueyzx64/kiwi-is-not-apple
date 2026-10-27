// SPDX-License-Identifier: GPL-3.0-or-later
// Stage Manager preferences. Adw/Gtk/Gio only (runs in the prefs process, no Shell libs).
// buildPrefs() returns the Adw.PreferencesGroup[]; prefs/pages/ places them on a page.

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import { shortcutRow } from '../../prefs/widgets.js';




const SUGGESTED = '<Control><Super>s';


/** A combo row over a string key with fixed values. */
function _choiceRow(settings, connect, key, title, subtitle, values, labels) {
    const row = new Adw.ComboRow({ title, subtitle, model: Gtk.StringList.new(labels) });
    const sync = () => {
        const i = values.indexOf(settings.get_string(key));
        row.selected = i < 0 ? 0 : i;
    };
    sync();
    row.connect('notify::selected', () => {
        const value = values[row.selected];
        if (value && settings.get_string(key) !== value)
            settings.set_string(key, value);
    });
    connect(key, sync);
    return row;
}

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
        description: _('Other apps wait as live thumbnails in a strip at the edge of the screen. Click one to switch to it.'),
    });
    const enabled = new Adw.SwitchRow({ title: _('Show the Stage Manager strip') });
    settings.bind('stage-manager', enabled, 'active', Gio.SettingsBindFlags.DEFAULT);
    main.add(enabled);
    main.add(shortcutRow(settings, _, {
        key: 'stage-manager-shortcut', title: _('Toggle shortcut'), example: '<Control><Super>s',
        suggestion: { accel: SUGGESTED, label: _('Use Ctrl+Super+S') },
    }));

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
        title: _('Hide recent apps under windows'),
        subtitle: _('The strip steps aside while a window overlaps it; push the screen edge to bring it back'),
    });
    settings.bind('stage-manager-autohide', autohide, 'active', Gio.SettingsBindFlags.DEFAULT);
    strip.add(autohide);

    // "Show windows from an application" (macOS): all at once = one stack per app
    const group = new Adw.ComboRow({
        title: _('Windows from an app'),
        subtitle: _('All at once: one stack per app. One at a time: each window has its own entry'),
        model: Gtk.StringList.new([_('All at once'), _('One at a time')]),
    });
    const syncGroup = () => {
        group.selected = settings.get_boolean('stage-manager-group-by-app') ? 0 : 1;
    };
    syncGroup();
    group.connect('notify::selected', () => {
        const on = group.selected === 0;
        if (settings.get_boolean('stage-manager-group-by-app') !== on)
            settings.set_boolean('stage-manager-group-by-app', on);
    });
    connect('stage-manager-group-by-app', syncGroup);
    strip.add(group);

    const recent = new Adw.SpinRow({
        title: _('Apps in the strip'),
        subtitle: _('The most thumbnails to list'),
        adjustment: new Gtk.Adjustment({ lower: 1, upper: 10, step_increment: 1, page_increment: 2 }),
    });
    settings.bind('stage-manager-recent-count', recent, 'value', Gio.SettingsBindFlags.DEFAULT);
    strip.add(recent);

    const tilt = new Adw.SpinRow({
        title: _('Tilt'),
        subtitle: _('Degrees the windows in the strip turn toward the stage'),
        adjustment: new Gtk.Adjustment({ lower: 0, upper: 40, step_increment: 2, page_increment: 6 }),
    });
    settings.bind('stage-manager-tilt', tilt, 'value', Gio.SettingsBindFlags.DEFAULT);
    strip.add(tilt);

    const speed = new Adw.SpinRow({
        title: _('Animation speed'),
        subtitle: _('1 is normal, 2 twice as fast'),
        digits: 2,
        adjustment: new Gtk.Adjustment({ lower: 0.5, upper: 2, step_increment: 0.25, page_increment: 0.5 }),
    });
    settings.bind('stage-manager-animation-speed', speed, 'value', Gio.SettingsBindFlags.DEFAULT);
    strip.add(speed);

    // Window sets and the desktop
    const sets = new Adw.PreferencesGroup({
        title: _('Sets'),
        description: _('Drag an app from the strip onto the stage, or Shift-click it, to use it with the windows already there. Drop it on the left or right side to place them side by side. Drag a window back to the strip to take it out.'),
    });
    sets.add(_choiceRow(settings, connect, 'stage-manager-new-windows', _('New windows'),
        _('What a newly opened app window does'),
        ['replace', 'join'], [_('Replace the stage'), _('Join the current set')]));
    sets.add(shortcutRow(settings, _, {
        key: 'stage-manager-remove-shortcut', title: _('Remove from set shortcut'), example: '<Control><Super>Down',
    }));
    const wallpaper = new Adw.SwitchRow({
        title: _('Click wallpaper to show the desktop'),
        subtitle: _('The windows on the stage step into the strip; click again to bring them back'),
    });
    settings.bind('stage-manager-wallpaper-click', wallpaper, 'active', Gio.SettingsBindFlags.DEFAULT);
    sets.add(wallpaper);

    // Dim the options while the strip is off
    const sync = () => {
        strip.sensitive = settings.get_boolean('stage-manager');
        sets.sensitive = strip.sensitive;
    };
    sync();
    connect('stage-manager', sync);

    // What Stage Manager pauses (features.js conflictsWith), only those the user has switched on
    const paused = new Adw.PreferencesGroup();
    const pausedRow = new Adw.ActionRow({ title: _('Paused while Stage Manager is on'), subtitle_lines: 0 });
    pausedRow.add_prefix(new Gtk.Image({ icon_name: 'media-playback-pause-symbolic' }));
    paused.add(pausedRow);
    const PAUSES = [
        [() => settings.get_boolean('move-window-to-new-workspace'), _('Full screen in its own Space')],
    ];
    const syncPaused = () => {
        const names = PAUSES.filter(([on]) => on()).map(([, name]) => name);
        pausedRow.subtitle = names.join(', ');
        paused.visible = settings.get_boolean('stage-manager') && names.length > 0;
    };
    syncPaused();
    for (const key of ['stage-manager', 'move-window-to-new-workspace'])
        connect(key, syncPaused);

    return [main, paused, strip, sets];
}
