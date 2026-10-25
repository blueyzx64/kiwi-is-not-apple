// SPDX-License-Identifier: GPL-3.0-or-later
// Show Desktop preferences. Adw/Gtk/Gio only (runs in the prefs process, no Shell libs).
// PAGE says where the page goes; buildPrefs() returns the Adw.PreferencesGroup[].

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import { KNOWN_DEFAULTS, findConflicts, normalizeAccel } from '../../lib/keybindingsModel.js';

const N_ = s => s;

export const PAGE = { id: 'show-desktop', title: N_('Show Desktop'), icon: 'kiwi-show-desktop-symbolic' };

const KEY_SHORTCUT = 'show-desktop-shortcut';
const SPEEDS = ['fast', 'normal', 'slow'];

function _isAccel(text) {
    if (!text)
        return true;                     // empty turns the shortcut off
    if (!normalizeAccel(text))
        return false;
    const [ok] = Gtk.accelerator_parse(text);
    return ok;
}

function _shortcutRow(settings, _) {
    const row = new Adw.EntryRow({ title: _('Shortcut') });
    const read = () => settings.get_strv(KEY_SHORTCUT)[0] ?? '';
    row.text = read();
    const base = row.title;
    const showNote = () => {
        const text = row.text.trim();
        row.remove_css_class('error');
        let note = '';
        if (!_isAccel(text)) {
            row.add_css_class('error');
            note = _('Not a valid shortcut. Example: <Super>d');
        } else {
            const hit = findConflicts([text], KNOWN_DEFAULTS)[0];
            if (hit)
                note = _('Also used by GNOME: %s').replace('%s', hit.with);
        }
        // An EntryRow has no subtitle, so the note goes in its title
        row.title = note ? `${base}: ${note}` : base;
    };
    row.connect('changed', () => {
        const text = row.text.trim();
        showNote();
        if (_isAccel(text) && text !== read())
            settings.set_strv(KEY_SHORTCUT, text ? [text] : []);
    });
    showNote();
    const id = settings.connect(`changed::${KEY_SHORTCUT}`, () => {
        if (read() !== row.text.trim())
            row.text = read();
    });
    row.connect('destroy', () => settings.disconnect(id));
    return row;
}

/**
 * @param {{settings: Gio.Settings, window: Adw.PreferencesWindow, extension: object}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, extension }) {
    const _ = s => extension.gettext(s);

    const main = new Adw.PreferencesGroup({
        title: _('Show Desktop'),
        description: _('Slide every window to the nearest screen edge to see the desktop. Press again, or click a window, to bring them back.'),
    });
    const button = new Adw.SwitchRow({
        title: _('Show the top bar button'),
        subtitle: _('A small button next to the system menu'),
    });
    settings.bind('show-desktop-button', button, 'active', Gio.SettingsBindFlags.DEFAULT);
    main.add(button);
    main.add(_shortcutRow(settings, _));

    const speed = new Adw.ComboRow({
        title: _('Animation speed'),
        model: Gtk.StringList.new([_('Fast'), _('Normal'), _('Slow')]),
    });
    const syncSpeed = () => {
        const i = SPEEDS.indexOf(settings.get_string('show-desktop-speed'));
        speed.selected = i < 0 ? 1 : i;
    };
    syncSpeed();
    speed.connect('notify::selected', () => {
        const value = SPEEDS[speed.selected];
        if (value && value !== settings.get_string('show-desktop-speed'))
            settings.set_string('show-desktop-speed', value);
    });
    const id = settings.connect('changed::show-desktop-speed', syncSpeed);
    speed.connect('destroy', () => settings.disconnect(id));
    main.add(speed);

    const note = new Adw.PreferencesGroup({
        description: _('GNOME\'s own "Hide all normal windows" shortcut, if you set one in Settings, plays the same animation while Kiwi runs. Kiwi never changes it. With Stage Manager on, Stage Manager handles Show Desktop.'),
    });
    return [main, note];
}
