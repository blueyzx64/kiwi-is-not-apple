// SPDX-License-Identifier: GPL-3.0-or-later
// Keyboard input preferences (macOS Sonoma text-cursor indicators, Keyboard > Input Sources and
// "Press fn key to"). Adw only; prefs/pages/keyboard.js places them.

import Adw from 'gi://Adw';

import { comboRow, shortcutRow, switchRow, watchKey } from '../../prefs/widgets.js';

/**
 * @param {{settings: Gio.Settings, extension: object}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, extension }) {
    const _ = extension?.gettext?.bind(extension) ?? (s => s);
    const group = new Adw.PreferencesGroup({
        title: _('Text Cursor'),
        description: _('A small badge at the text cursor, like macOS. It shows near the pointer in apps that do not report their cursor.'),
    });
    group.add(switchRow(settings, _('Text cursor indicators'), '', 'input-indicator'));
    const caps = switchRow(settings, _('Caps Lock'),
        _('Show ⇪ under the text cursor while Caps Lock is on'), 'input-indicator-caps-lock');
    const capsOff = switchRow(settings, _('Caps Lock off'),
        _('Also show a muted ⇪ for a moment when Caps Lock is turned off (macOS shows nothing)'), 'input-indicator-caps-off');
    const source = switchRow(settings, _('Input source'),
        _('Show the new input source when you switch it'), 'input-indicator-source');
    group.add(caps);
    group.add(capsOff);
    group.add(source);
    group.add(switchRow(settings, _('Caps Lock in password fields'),
        _('Show ⇪ inside the password field of system dialogs while Caps Lock is on'), 'dialogs-caps-lock-icon'));
    const sync = () => {
        const on = settings.get_boolean('input-indicator');
        caps.sensitive = source.sensitive = on;
        capsOff.sensitive = on && settings.get_boolean('input-indicator-caps-lock');
    };
    sync();
    watchKey(settings, 'input-indicator', group, sync);
    watchKey(settings, 'input-indicator-caps-lock', group, sync);

    const sources = new Adw.PreferencesGroup({
        title: _('Input Sources'),
        description: _('How you switch between keyboard layouts and input methods.'),
    });
    sources.add(switchRow(settings, _('Caps Lock switches the input source'),
        _('With a Latin and a non-Latin source, tap Caps Lock to switch between them; hold it to type in capitals'),
        'input-caps-lock-switch'));
    sources.add(comboRow(settings, {
        title: _('Input source per window'),
        subtitle: _('Automatically switch to a window\'s own input source'),
        key: 'input-per-window',
        values: ['system', 'document', 'global'],
        labels: [_('As in GNOME Settings'), _('Each window keeps its own'), _('Same in every window')],
    }));
    sources.add(comboRow(settings, {
        title: _('Press the input key to'),
        subtitle: _('Like the Globe key on a Mac keyboard'),
        key: 'input-key-action',
        values: ['none', 'input-source', 'emoji'],
        labels: [_('Do Nothing'), _('Change Input Source'), _('Show Emoji & Symbols')],
    }));
    sources.add(shortcutRow(settings, _, {
        key: 'input-key-shortcut', title: _('Input key'), example: 'Menu',
        suggestion: { accel: 'Menu', label: _('Use the Menu key') },
    }));
    return [group, sources];
}
