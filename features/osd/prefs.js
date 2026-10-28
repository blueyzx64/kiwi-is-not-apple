// SPDX-License-Identifier: GPL-3.0-or-later
// Where volume and brightness changes show (osd-location). Adw/Gtk only (the prefs process).

import Adw from 'gi://Adw';

import { comboRow } from '../../prefs/widgets.js';

/**
 * @param {{settings: Gio.Settings, extension: object}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, _ }) {
    const group = new Adw.PreferencesGroup({
        title: _('Volume and Brightness'),
        description: _('macOS shows them in a glass pill under the menu bar; with a notch they show in the notch'),
    });
    group.add(comboRow(settings, {
        title: _('Show Volume and Brightness In'),
        subtitle: _('The notch while it is on, or a glass pill under the menu bar like macOS'),
        key: 'osd-location', values: ['notch', 'menu-bar', 'system'],
        labels: [_('Notch'), _('Menu Bar'), _('Standard Pop-up')],
    }));
    group.add(comboRow(settings, {
        title: _('Pill Style'),
        subtitle: _('macOS 27.2: a segmented bar under the matching menu-bar item. macOS 26: a slider under the Control Center'),
        key: 'osd-style', values: ['golden-gate', 'tahoe'],
        labels: [_('Golden Gate'), _('Tahoe')],
    }));
    return [group];
}
