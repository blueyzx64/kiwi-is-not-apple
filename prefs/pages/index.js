// SPDX-License-Identifier: GPL-3.0-or-later
// The sidebar of the preferences window: sections and their pages, in macOS System Settings
// order. A page whose content is only one feature's groups is declared here; a page that
// combines several (or adds its own rows) has its own module in this folder.

import Adw from 'gi://Adw';

import * as general from './general.js';
import * as menuBar from './menuBar.js';
import * as dock from './dock.js';
import * as windows from './windows.js';
import * as appearance from './appearance.js';
import * as keyboard from './keyboard.js';
import * as about from './about.js';
import * as stageManagerPrefs from '../../features/stageManager/prefs.js';
import * as notchPrefs from '../../features/notch/prefs.js';
import * as spotlightPrefs from '../../features/spotlight/prefs.js';
import * as controlCenterPrefs from '../../features/controlCenter/prefs.js';
import * as clipboardPrefs from '../../features/clipboard/prefs.js';
import { addFeatureGroups } from '../widgets.js';

const N_ = s => s;

/** A page made of one feature's prefs groups. */
function featurePage(id, title, icon, mod) {
    return {
        PAGE: { id, icon },
        build(args) {
            const page = new Adw.PreferencesPage({ title: args._(title), icon_name: icon });
            addFeatureGroups(page, mod, args);
            return page;
        },
    };
}

/** [{title, pages: [module with PAGE and build(args)]}] */
export const SECTIONS = [
    { title: N_('General'), pages: [general] },
    { title: N_('Desktop'), pages: [menuBar, dock, windows,
        featurePage('stage-manager', N_('Stage Manager'), 'view-app-grid-symbolic', stageManagerPrefs)] },
    { title: N_('Features'), pages: [
        featurePage('notch', N_('Notch'), 'preferences-system-notifications-symbolic', notchPrefs),
        featurePage('spotlight', N_('Spotlight'), 'system-search-symbolic', spotlightPrefs),
        featurePage('control-center', N_('Control Center'), 'preferences-system-symbolic', controlCenterPrefs),
        featurePage('clipboard', N_('Clipboard'), 'edit-paste-symbolic', clipboardPrefs),
        keyboard,
    ] },
    { title: N_('Look'), pages: [appearance] },
    { title: N_('Kiwi'), pages: [about] },
];
