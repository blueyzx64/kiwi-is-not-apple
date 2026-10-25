// SPDX-License-Identifier: GPL-3.0-or-later
// Control Center preferences. Adw/Gtk/Gio only (runs in the prefs process, no Shell libs).
// Contract: PAGE + buildPrefs() returning Adw.PreferencesGroup[]; S10 wires it in.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

const N_ = s => s;

export const PAGE = { id: 'control-center', title: N_('Control Center'), icon: 'preferences-system-symbolic' };

function _switchRow(settings, title, subtitle, key) {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

/**
 * @param {{settings: Gio.Settings, window: Adw.PreferencesWindow, extension: object}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, window, extension }) {
    const _ = s => extension?.gettext?.(s) ?? s;

    const main = new Adw.PreferencesGroup({
        title: _('Control Center'),
        description: _('Re-lays out the Quick Settings menu in blocks, like the macOS Control Center. GNOME keeps running every toggle; turning this off restores the stock menu.'),
    });
    main.add(_switchRow(settings, _('Control Center'),
        _('Blocks for connectivity, focus, display, sound and media, with Stage Manager and Liquid Glass tiles'),
        'control-center'));

    const details = new Adw.PreferencesGroup({ title: _('Details') });
    details.add(_switchRow(settings, _('User row'),
        _('Show your picture and name at the bottom, with the battery time left'),
        'control-center-user-row'));
    details.add(_switchRow(settings, _('Always show battery percentage'),
        _('Show the charge in the top bar at any level, not only when it is low'),
        'battery-percentage-always'));

    const sync = () => {
        details.sensitive = settings.get_boolean('control-center');
    };
    sync();
    const id = settings.connect('changed::control-center', sync);
    window?.connect('close-request', () => {
        settings.disconnect(id);
        return false;
    });

    return [main, details];
}
