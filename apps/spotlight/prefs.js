// SPDX-License-Identifier: GPL-3.0-or-later
// Spotlight preferences. Adw/Gtk/Gio only (runs in the prefs process, no Shell libs).
// PAGE says where the page goes; buildPrefs() returns the Adw.PreferencesGroup[].

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { KNOWN_DEFAULTS, findConflicts, normalizeAccel } from '../../lib/keybindingsModel.js';
import { ENGINES } from './model.js';

const N_ = s => s;

export const PAGE = { id: 'spotlight', title: N_('Spotlight'), icon: 'system-search-symbolic' };

const ENGINE_LABELS = {
    duckduckgo: N_('DuckDuckGo'),
    google: N_('Google'),
    bing: N_('Bing'),
    brave: N_('Brave Search'),
    startpage: N_('Startpage'),
    ecosia: N_('Ecosia'),
};

function switchRow(settings, title, subtitle, key) {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function isAccel(text) {
    if (!text)
        return true; // empty turns the shortcut off
    if (!normalizeAccel(text))
        return false;
    const [ok] = Gtk.accelerator_parse(text);
    return ok;
}

function shortcutRow(settings, _, onNote) {
    const key = 'spotlight-shortcut';
    const row = new Adw.EntryRow({ title: _('Extra shortcut') });
    const read = () => settings.get_strv(key)[0] ?? '';
    row.text = read();
    row.connect('changed', () => {
        const text = row.text.trim();
        row.remove_css_class('error');
        let note = '';
        if (!isAccel(text)) {
            row.add_css_class('error');
            note = _('Not a valid shortcut. Example: <Super>slash');
        } else {
            settings.set_strv(key, text ? [text] : []);
            const hit = text ? findConflicts([text], KNOWN_DEFAULTS)[0] : null;
            if (hit)
                note = `${_('Also used by GNOME')}: ${hit.with}`;
        }
        onNote(note);
    });
    const id = settings.connect(`changed::${key}`, () => {
        if (read() !== row.text.trim())
            row.text = read();
    });
    row.connect('destroy', () => settings.disconnect(id));
    return row;
}

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
    main.add(shortcutRow(settings, _, note => {
        main.description = note || _('A search bar in the middle of the screen. Apps, settings, files, the clipboard, a calculator and the web.');
    }));

    const what = new Adw.PreferencesGroup({ title: _('Results') });
    what.add(switchRow(settings, _('Files and documents'), _('Uses GNOME search, so nothing is indexed twice'), 'spotlight-files'));
    what.add(switchRow(settings, _('Settings'), _('GNOME Settings panels and Kiwi switches'), 'spotlight-settings'));
    what.add(switchRow(settings, _('Calculator'), _('Arithmetic and unit conversions such as 5 km in miles'), 'spotlight-calculator'));
    what.add(switchRow(settings, _('Clipboard'), _('Recent copies from Clipboard history'), 'spotlight-clipboard'));

    const web = new Adw.PreferencesGroup({ title: _('Web') });
    web.add(switchRow(settings, _('Web search'), _('Adds a row that opens your search engine. Nothing is sent until you press Return'), 'spotlight-web'));
    for (const row of engineRows(settings, _))
        web.add(row);

    return [main, what, web];
}
