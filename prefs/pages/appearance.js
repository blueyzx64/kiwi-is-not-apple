// SPDX-License-Identifier: GPL-3.0-or-later
// Appearance: Light/Dark and colours, Liquid Glass with its accessibility options, and the
// Shell menu styling (macOS System Settings > Appearance).

import Adw from 'gi://Adw';

import * as appearancePrefs from '../../features/appearance/prefs.js';
import * as liquidGlassPrefs from '../../features/liquidGlass/prefs.js';
import { addFeatureGroups, switchRow } from '../widgets.js';

export const PAGE = { id: 'appearance', icon: 'applications-graphics-symbolic' };

export function build(args) {
    const { settings, _ } = args;
    const page = new Adw.PreferencesPage({ title: _('Appearance'), icon_name: PAGE.icon });
    addFeatureGroups(page, appearancePrefs, args);
    addFeatureGroups(page, liquidGlassPrefs, args);
    const menus = new Adw.PreferencesGroup({ title: _('Menus') });
    menus.add(switchRow(settings, _('Menu and App Styling'),
        _('Narrower shell menu items with accent-colored hover and selection, plus the GTK app fixes'),
        'popup-menu-styling'));
    page.add(menus);
    return page;
}
