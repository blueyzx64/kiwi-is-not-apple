// SPDX-License-Identifier: GPL-3.0-or-later
// Prefs for the panel window controls. Adw/Gtk/Gio only (runs in the prefs process).
// The groups go on the Windows page (prefs/pages/windows.js), below the top-bar master row.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import { comboRow, switchRow } from '../../prefs/widgets.js';

/**
 * @param {{settings: Gio.Settings, window: Adw.PreferencesWindow, extension: object}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, extension }) {
    const _ = s => extension.gettext(s);
    const group = new Adw.PreferencesGroup({
        title: _('Panel Window Controls'),
        description: _('Close, minimize and maximize buttons for the focused window.'),
    });

    const scope = comboRow(settings, {
        title: _('Show buttons for'),
        subtitle: _('Maximized windows move their buttons to the top bar; the others keep them in their titlebar'),
        key: 'window-controls-scope',
        values: ['all', 'maximized', 'fullscreen'],
        labels: [_('All windows'), _('Maximized windows'), _('Fullscreen windows')],
    });
    group.add(scope);

    group.add(comboRow(settings, {
        title: _('Side'),
        subtitle: _('Right is the GNOME side, with the buttons at the far right of the top bar. Left is the macOS side. ' +
            'The apps\' own titlebar buttons follow'),
        key: 'window-controls-side',
        values: ['right', 'left'],
        labels: [_('Right'), _('Left')],
    }));

    group.add(comboRow(settings, {
        title: _('Traffic light style'),
        subtitle: _('Glass beads as in macOS 27, or the classic flat buttons (with macOS window buttons on)'),
        key: 'windows-traffic-style',
        values: ['glass', 'flat'],
        labels: [_('Glass'), _('Flat')],
    }));
    group.add(comboRow(settings, {
        title: _('Clicking the green button'),
        subtitle: _('Alt-click does the other one'),
        key: 'windows-green-click',
        values: ['fullscreen', 'zoom'],
        labels: [_('Enters full screen'), _('Zooms (fills the screen)')],
    }));
    group.add(switchRow(settings, _('Green button menu'),
        _('Hover over the green button, or press and hold it, for Move & Resize, Fill & Arrange and full screen'),
        'windows-green-menu'));

    const appSet = comboRow(settings, {
        title: _('Buttons in app titlebars'),
        subtitle: _('Close only is the stock Fedora layout'),
        key: 'app-buttons-set',
        values: ['all', 'close'],
        labels: [_('Close, minimize and maximize'), _('Close only')],
    });
    group.add(appSet);

    const remove = new Adw.SwitchRow({
        title: _('Remove titlebar buttons from windows'),
        subtitle: _('Where the top bar shows the buttons, the app\'s own titlebar drops them (GTK, libadwaita, ' +
            'Chromium/Electron and server-side frames). Kiwi sets a GNOME button layout and restores yours when ' +
            'turned off'),
    });
    group.add(remove);
    settings.bind('remove-titlebar-buttons', remove, 'active', Gio.SettingsBindFlags.DEFAULT);

    group.add(switchRow(settings, _('Hide title bars of maximized windows'),
        _('Only for windows with a plain title bar of their own (X11 frames, GTK 3 without a header bar); ' +
            'header bars are never hidden. X11 frames need the xprop tool'),
        'hide-maximized-titlebars'));

    // The apps' own buttons, managed while the top-bar controls are off
    const appGroup = new Adw.PreferencesGroup({
        title: _('When top-bar controls are off'),
        description: _('Apps get their own titlebar buttons back, on the side chosen above. Kiwi sets the GNOME ' +
            'button layout and restores yours when the top-bar controls come back on or Kiwi is disabled.'),
    });
    settings.bind('show-window-controls', appGroup, 'sensitive',
        Gio.SettingsBindFlags.GET | Gio.SettingsBindFlags.INVERT_BOOLEAN);

    const appStyle = comboRow(settings, {
        title: _('Style'),
        subtitle: _('macOS shows the traffic lights (the size above applies); GNOME keeps the stock look. ' +
            'Open apps pick up a new style when restarted'),
        key: 'app-buttons-style',
        values: ['macos', 'gnome'],
        labels: [_('macOS'), _('GNOME')],
    });
    appGroup.add(appStyle);

    return [group, appGroup];
}
