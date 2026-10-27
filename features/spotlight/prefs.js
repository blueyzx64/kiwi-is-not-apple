// SPDX-License-Identifier: GPL-3.0-or-later
// Spotlight preferences. Adw/Gtk/Gio only (runs in the prefs process, no Shell libs).
// buildPrefs() returns the Adw.PreferencesGroup[]; prefs/pages/ places them on a page.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ENGINES } from './model.js';
import { shortcutRow, switchRow } from '../../prefs/widgets.js';

const N_ = s => s;


const ENGINE_LABELS = {
    duckduckgo: N_('DuckDuckGo'),
    google: N_('Google'),
    bing: N_('Bing'),
    brave: N_('Brave Search'),
    startpage: N_('Startpage'),
    ecosia: N_('Ecosia'),
};




function engineRows(settings, _) {
    const key = 'spotlight-engine';
    const ids = Object.keys(ENGINES);
    const labels = [...ids.map(id => _(ENGINE_LABELS[id] ?? id)), _('Custom')];
    const combo = new Adw.ComboRow({
        title: _('Search engine'), subtitle: _('Used by the Web result'),
        model: Gtk.StringList.new(labels),
    });
    const custom = new Adw.EntryRow({ title: _('Custom address (https, with %s for the search)') });

    const sync = () => {
        const value = settings.get_string(key);
        const i = ids.indexOf(value);
        combo.selected = i < 0 ? ids.length : i;
        custom.visible = i < 0;
        if (i < 0 && custom.text !== value)
            custom.text = value;
    };
    sync();
    combo.connect('notify::selected', () => {
        if (combo.selected < ids.length) {
            if (settings.get_string(key) !== ids[combo.selected])
                settings.set_string(key, ids[combo.selected]);
        } else {
            custom.visible = true;
        }
    });
    custom.connect('changed', () => {
        const text = custom.text.trim();
        const valid = /^https:\/\/\S+$/.test(text) && text.includes('%s');
        custom.remove_css_class('error');
        if (!valid) {
            if (text)
                custom.add_css_class('error');
            return;
        }
        if (settings.get_string(key) !== text)
            settings.set_string(key, text);
    });
    const id = settings.connect(`changed::${key}`, sync);
    combo.connect('destroy', () => settings.disconnect(id));
    return [combo, custom];
}

/**
 * @param {{settings: Gio.Settings, window: Adw.PreferencesWindow, extension: object}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, extension }) {
    const _ = s => extension.gettext(s);

    const main = new Adw.PreferencesGroup({
        title: _('Spotlight'),
        description: _('A search bar in the middle of the screen. Apps, settings, files, the clipboard, a calculator and the web.'),
    });
    const enable = switchRow(settings, _('Enable Spotlight'), _('Search from the keyboard'), 'spotlight');
    main.add(enable);
    main.add(switchRow(settings, _('Open with a tap of Super'),
        _('The Activities overview stays on the hot corner, the touchpad gesture, Super+A and the Activities button'),
        'spotlight-on-super'));
    main.add(shortcutRow(settings, _, { key: 'spotlight-shortcut', title: _('Extra shortcut'), example: '<Super>slash', onNote: note => {
        main.description = note || _('A search bar in the middle of the screen. Apps, settings, files, the clipboard, a calculator and the web.');
    } }));

    const what = new Adw.PreferencesGroup({ title: _('Results') });
    what.add(switchRow(settings, _('Files and documents'), _('Uses GNOME search, so nothing is indexed twice'), 'spotlight-files'));
    what.add(switchRow(settings, _('Settings'), _('GNOME Settings panels and Kiwi switches'), 'spotlight-settings'));
    what.add(switchRow(settings, _('Calculator'), _('Arithmetic and unit conversions such as 5 km in miles'), 'spotlight-calculator'));
    what.add(switchRow(settings, _('Clipboard'), _('Search your copies from Clipboard history'), 'spotlight-clipboard'));
    const recentClips = switchRow(settings, _('Show recent clipboard when the search is empty'),
        _('Anyone who can see the screen sees what you copied'), 'spotlight-recent-clipboard');
    settings.bind('spotlight-clipboard', recentClips, 'sensitive', Gio.SettingsBindFlags.GET);
    what.add(recentClips);

    const web = new Adw.PreferencesGroup({ title: _('Web') });
    web.add(switchRow(settings, _('Web search'), _('Adds a row that opens your search engine. Nothing is sent until you press Return'), 'spotlight-web'));
    for (const row of engineRows(settings, _))
        web.add(row);

    return [main, what, web];
}
