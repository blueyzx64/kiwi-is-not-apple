// SPDX-License-Identifier: GPL-3.0-or-later
// Clipboard preferences. Adw/Gtk/Gio only (runs in the prefs process, no Shell libs).
// Contract: PAGE + buildPrefs() returning Adw.PreferencesGroup[]; S10 wires it in.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { KNOWN_DEFAULTS, findConflicts, normalizeAccel } from '../../lib/keybindingsModel.js';

const N_ = s => s;

export const PAGE = { id: 'clipboard', title: N_('Clipboard'), icon: 'edit-paste-symbolic' };

function _switchRow(settings, title, subtitle, key) {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function _isAccel(text) {
    if (!text)
        return true;                     // empty turns the shortcut off
    if (!normalizeAccel(text))
        return false;
    const [ok] = Gtk.accelerator_parse(text);
    return ok;
}

function _shortcutRow(settings, _) {
    const key = 'clipboard-shortcut';
    const row = new Adw.EntryRow({ title: _('Quick Paste shortcut') });
    const read = () => settings.get_strv(key)[0] ?? '';
    row.text = read();

    const note = () => {
        const text = row.text.trim();
        row.remove_css_class('error');
        if (!_isAccel(text)) {
            row.add_css_class('error');
            return _('Not a valid shortcut. Example: <Super><Shift>v');
        }
        const hit = findConflicts([text], KNOWN_DEFAULTS)[0];
        return hit ? _('Also used by GNOME: %s').replace('%s', hit.with) : '';
    };
    row.connect('changed', () => {
        const text = row.text.trim();
        note();
        if (_isAccel(text))
            settings.set_strv(key, text ? [text] : []);
    });
    const id = settings.connect(`changed::${key}`, () => {
        if (read() !== row.text.trim())
            row.text = read();
    });
    row.connect('destroy', () => settings.disconnect(id));
    return row;
}

function _sizeRow(settings, _) {
    const row = new Adw.SpinRow({
        title: _('History size'),
        subtitle: _('Entries kept. Pinned items do not count and never expire.'),
        adjustment: new Gtk.Adjustment({ lower: 5, upper: 200, step_increment: 5, page_increment: 25 }),
    });
    settings.bind('clipboard-history-size', row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function _excludedRow(settings, _) {
    const key = 'clipboard-excluded-apps';
    const row = new Adw.EntryRow({ title: _('Also ignore copies from these apps') });
    row.text = settings.get_strv(key).join(', ');
    row.connect('changed', () => {
        const list = row.text.split(',').map(s => s.trim()).filter(Boolean);
        settings.set_strv(key, list);
    });
    return row;
}

/**
 * @param {{settings: Gio.Settings, window: Adw.PreferencesWindow, extension: object}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, extension }) {
    const _ = extension?.gettext?.bind(extension) ?? (s => s);

    const main = new Adw.PreferencesGroup({
        title: _('Clipboard History'),
        description: _('Keeps what you copy so you can paste it again. Open it from the top bar or with the shortcut.'),
    });
    main.add(_switchRow(settings, _('Clipboard history'),
        _('Record text, links, colours and images that you copy.'), 'clipboard-history'));
    main.add(_switchRow(settings, _('Recording'),
        _('Turn off to pause without losing the history.'), 'clipboard-recording'));
    main.add(_switchRow(settings, _('Show in the top bar'), '', 'clipboard-panel-icon'));
    main.add(_switchRow(settings, _('Keep images'),
        _('Images over 5 MB are never kept.'), 'clipboard-images'));
    main.add(_sizeRow(settings, _));
    main.add(_shortcutRow(settings, _));

    const privacy = new Adw.PreferencesGroup({
        title: _('Privacy'),
        description: _('Nothing is recorded while the screen is locked.'),
    });
    privacy.add(_switchRow(settings, _('Save history to disk'),
        _('Kept in ~/.local/share/kiwi/clipboard/, readable only by you. Needed to keep history across lock and log out.'),
        'clipboard-persist'));
    privacy.add(_switchRow(settings, _('Ignore passwords'),
        _('Skip copies marked as secret and copies from password managers.'), 'clipboard-ignore-sensitive'));
    privacy.add(_excludedRow(settings, _));

    return [main, privacy];
}
