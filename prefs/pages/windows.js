// SPDX-License-Identifier: GPL-3.0-or-later
// Windows: the traffic lights (in the top bar, or in the apps' own titlebars), full screen
// Spaces, rounded corners and Show Desktop.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import * as windowControlsPrefs from '../../features/windowControls/prefs.js';
import * as roundedCornersPrefs from '../../features/roundedCorners/prefs.js';
import * as showDesktopPrefs from '../../features/showDesktop/prefs.js';
import { addFeatureGroups, comboRow, switchRow } from '../widgets.js';

export const PAGE = { id: 'windows', icon: 'kiwi-buttons-symbolic' };

export function build(args) {
    const { settings, _ } = args;
    const page = new Adw.PreferencesPage({ title: _('Windows'), icon_name: PAGE.icon });

    const buttons = new Adw.PreferencesGroup({
        title: _('Window Buttons'),
        description: _('Log out to apply a new button look across all apps.'),
    });
    const macos = new Adw.ExpanderRow({
        title: _('macOS Window Buttons'),
        subtitle: _('Traffic lights for the top-bar controls, and for app windows that keep their buttons beside them'),
        show_enable_switch: true,
    });
    settings.bind('enable-app-window-buttons', macos, 'enable-expansion', Gio.SettingsBindFlags.DEFAULT);
    macos.add_row(comboRow(settings, {
        title: _('Button Size'), subtitle: _('Size of the traffic lights'),
        key: 'button-size', values: ['small', 'normal'], labels: [_('Small'), _('Normal')],
    }));
    buttons.add(macos);
    buttons.add(switchRow(settings, _('Window controls in top bar (removes them from app windows)'),
        _('Close, minimize and maximize for the focused window. Turn off to give every app its own titlebar buttons back'),
        'show-window-controls'));
    page.add(buttons);
    addFeatureGroups(page, windowControlsPrefs, args);

    const spaces = new Adw.PreferencesGroup({ title: _('Full Screen') });
    spaces.add(switchRow(settings, _('Full Screen in Its Own Space'),
        _('A window that goes full screen moves to a new workspace of its own, and back when it leaves full screen'),
        'move-window-to-new-workspace'));
    spaces.add(switchRow(settings, _('Split View'),
        _('Hover the green button of a full-screen window to tile it to the left or right of the screen, then pick the other window'),
        'split-view'));
    page.add(spaces);

    addFeatureGroups(page, roundedCornersPrefs, args);
    addFeatureGroups(page, showDesktopPrefs, args);
    return page;
}
