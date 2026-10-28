// SPDX-License-Identifier: GPL-3.0-or-later
// Keyboard accessibility preferences (macOS Accessibility > Keyboard). Adw only;
// prefs/pages/keyboard.js places them.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import { comboRow, shortcutRow, switchRow, watchKey } from '../../prefs/widgets.js';

/**
 * @param {{settings: Gio.Settings, extension: object}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, extension }) {
    const _ = extension?.gettext?.bind(extension) ?? (s => s);
    const a11y = new Gio.Settings({ schema_id: 'org.gnome.desktop.a11y.keyboard' });

    const group = new Adw.PreferencesGroup({
        title: _('Keyboard Accessibility'),
        description: _('Sticky Keys and Slow Keys are GNOME\'s own; Kiwi shows them the macOS way.'),
    });
    group.add(switchRow(settings, _('Keyboard accessibility'), '', 'keyboard-access'));

    const sticky = switchRow(a11y, _('Sticky Keys'),
        _('Press modifier keys one at a time instead of together'), 'stickykeys-enable');
    const display = switchRow(settings, _('Display pressed keys on screen'),
        _('Show the latched and locked modifier keys as ⌃ ⌥ ⇧ ⌘'), 'kbd-a11y-sticky-display');
    const corner = comboRow(settings, {
        title: _('Screen area for display'), key: 'kbd-a11y-sticky-corner',
        values: ['top-right', 'top-left', 'bottom-right', 'bottom-left'],
        labels: [_('Top Right'), _('Top Left'), _('Bottom Right'), _('Bottom Left')],
    });
    const beep = switchRow(a11y, _('Beep when a modifier key is set'), '', 'stickykeys-modifier-beep');
    const slow = switchRow(a11y, _('Slow Keys'),
        _('Keys must be held down a moment before they count'), 'slowkeys-enable');
    const slowChip = switchRow(settings, _('Show when Slow Keys is on'),
        _('A "Slow Keys" chip in the same corner'), 'kbd-a11y-slowkeys-indicator');
    for (const row of [sticky, display, corner, beep, slow, slowChip])
        group.add(row);

    const shortcuts = new Adw.PreferencesGroup({ title: _('Accessibility Shortcuts and Keyboard Viewer') });
    shortcuts.add(shortcutRow(settings, _, {
        key: 'kbd-a11y-panel-shortcut', title: _('Accessibility Shortcuts panel'), example: '<Super><Alt>F5',
        suggestion: { accel: '<Super><Alt>F5', label: _('Use Super+Alt+F5') },
    }));
    shortcuts.add(shortcutRow(settings, _, {
        key: 'kbd-a11y-viewer-shortcut', title: _('Keyboard Viewer'), example: '<Super><Alt>k',
    }));
    const follow = comboRow(settings, {
        title: _('Zoom follows the keyboard focus'),
        subtitle: _('How the magnified image follows the focus and the text cursor'),
        key: 'kbd-a11y-zoom-follow',
        values: ['system', 'always', 'typing', 'never'],
        labels: [_('As GNOME is set'), _('Always'), _('Only when typing'), _('Never')],
    });
    shortcuts.add(follow);

    const sync = () => {
        const on = settings.get_boolean('keyboard-access');
        for (const row of [display, corner, slowChip, follow])
            row.sensitive = on;
        display.sensitive = on && a11y.get_boolean('stickykeys-enable');
        corner.sensitive = display.sensitive && settings.get_boolean('kbd-a11y-sticky-display');
        beep.sensitive = a11y.get_boolean('stickykeys-enable');
        slowChip.sensitive = on && a11y.get_boolean('slowkeys-enable');
    };
    sync();
    for (const key of ['keyboard-access', 'kbd-a11y-sticky-display'])
        watchKey(settings, key, group, sync);
    for (const key of ['stickykeys-enable', 'slowkeys-enable'])
        watchKey(a11y, key, group, sync);
    return [group, shortcuts];
}
