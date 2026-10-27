// SPDX-License-Identifier: GPL-3.0-or-later
// Dock: Kiwi's own dock (overhaul plan §5.2) and Launchpad; the groups come from
// features/dock/prefs.js and features/launchpad/prefs.js.

import Adw from 'gi://Adw';

import * as dockPrefs from '../../features/dock/prefs.js';
import * as launchpadPrefs from '../../features/launchpad/prefs.js';
import { addFeatureGroups } from '../widgets.js';

export const PAGE = { id: 'dock', icon: 'kiwi-dock-symbolic' };

export function build(args) {
    const page = new Adw.PreferencesPage({ title: args._('Dock'), icon_name: PAGE.icon });
    addFeatureGroups(page, dockPrefs, args);
    addFeatureGroups(page, launchpadPrefs, args);
    return page;
}
