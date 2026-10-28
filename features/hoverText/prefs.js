// SPDX-License-Identifier: GPL-3.0-or-later
// Hover Text, Hover Typing, Hover Color and the keyboard focus highlight (macOS System
// Settings > Accessibility > Hover Text, and Keyboard > Full Keyboard Access). Adw/Gtk only.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { comboRow, switchRow, watchKey } from '../../prefs/widgets.js';

/** A spin row bound to an integer key. */
function spinRow(settings, { title, subtitle, key, lower, upper }) {
    const row = new Adw.SpinRow({
        title, subtitle: subtitle ?? '',
        adjustment: new Gtk.Adjustment({ lower, upper, step_increment: 1, page_increment: 4 }),
    });
    settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

/**
 * A colour button bound to a '#rrggbb' string key, with a reset to the default ('').
 */
function colorRow(settings, _, { title, subtitle, key }) {
    const row = new Adw.ActionRow({ title, subtitle: subtitle ?? '' });
    const dialog = new Gtk.ColorDialog({ with_alpha: false });
    const button = new Gtk.ColorDialogButton({ dialog, valign: Gtk.Align.CENTER });
    button.update_property([Gtk.AccessibleProperty.LABEL], [title]);
    const reset = new Gtk.Button({
        icon_name: 'edit-undo-symbolic', valign: Gtk.Align.CENTER, tooltip_text: _('Use the default colour'),
        css_classes: ['flat'],
    });
    reset.update_property([Gtk.AccessibleProperty.LABEL], [_('Use the default colour')]);
    let syncing = false;
    const sync = () => {
        syncing = true;
        const rgba = new Gdk.RGBA();
        const value = settings.get_string(key);
        reset.sensitive = value !== '';
        if (value && rgba.parse(value))
            button.rgba = rgba;
        syncing = false;
    };
    sync();
    button.connect('notify::rgba', () => {
        if (syncing)
            return;
        const c = button.rgba;
        const hex = v => Math.round(v * 255).toString(16).padStart(2, '0');
        settings.set_string(key, `#${hex(c.red)}${hex(c.green)}${hex(c.blue)}`);
    });
    reset.connect('clicked', () => settings.set_string(key, ''));
    watchKey(settings, key, row, sync);
    row.add_suffix(button);
    row.add_suffix(reset);
    return row;
}

/**
 * @param {{settings: Gio.Settings, extension: object}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, extension }) {
    const _ = extension?.gettext?.bind(extension) ?? (s => s);

    const hover = new Adw.PreferencesGroup({
        title: _('Hover Text'),
        description: _('Hold the activation modifier and point at text to see it large. Press the modifier three times quickly to keep Hover Text on. Apps must expose their text to accessibility tools: GTK apps do; Firefox, Chromium and Qt apps only while accessibility is turned on.'),
    });
    hover.add(switchRow(settings, _('Hover Text'), _('Show large text under the pointer'), 'hover-text'));
    hover.add(switchRow(settings, _('Hover Color'),
        _('Show a large swatch and the hex value of the colour under the pointer'), 'hover-color'));
    hover.add(comboRow(settings, {
        title: _('Activation Modifier'),
        subtitle: _('With Super, a tap that is not part of a hover still opens Spotlight'),
        key: 'hover-modifier',
        values: ['super', 'ctrl', 'alt', 'shift'],
        labels: [_('Super (⌘)'), _('Control'), _('Alt (⌥)'), _('Shift')],
    }));
    hover.add(spinRow(settings, { title: _('Text Size'), key: 'hover-text-size', lower: 12, upper: 128 }));
    hover.add(colorRow(settings, _, { title: _('Text Colour'), key: 'hover-text-color' }));
    hover.add(colorRow(settings, _, {
        title: _('Background Colour'), subtitle: _('Default: Kiwi glass'), key: 'hover-background-color',
    }));
    hover.add(colorRow(settings, _, {
        title: _('Element Highlight Colour'), subtitle: _('The outline around the hovered element or field'),
        key: 'hover-highlight-color',
    }));

    const typing = new Adw.PreferencesGroup({
        title: _('Hover Typing'),
        description: _('A large copy of what you type, while you type in a text field. Password fields are never shown.'),
    });
    typing.add(switchRow(settings, _('Hover Typing'), '', 'hover-typing'));
    typing.add(spinRow(settings, { title: _('Text Size'), key: 'hover-typing-size', lower: 12, upper: 128 }));
    typing.add(comboRow(settings, {
        title: _('Position'), key: 'hover-typing-position',
        values: ['caret', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
        labels: [_('By the Text Cursor'), _('Top Left'), _('Top Right'), _('Bottom Left'), _('Bottom Right')],
    }));
    typing.add(colorRow(settings, _, { title: _('Insertion Point Colour'), key: 'hover-insertion-point-color' }));

    const focus = new Adw.PreferencesGroup({
        title: _('Keyboard Focus Highlight'),
        description: _('A ring around the item that has the keyboard focus in apps, like Full Keyboard Access. Moving the focus stays with the apps: Tab, arrows and Space.'),
    });
    focus.add(switchRow(settings, _('Highlight the Keyboard Focus'), '', 'hover-focus-highlight'));
    focus.add(colorRow(settings, _, { title: _('Colour'), key: 'hover-focus-color' }));
    focus.add(spinRow(settings, { title: _('Width'), key: 'hover-focus-width', lower: 1, upper: 12 }));
    focus.add(switchRow(settings, _('High Contrast'), _('A dark or light edge around the ring'), 'hover-focus-contrast'));
    focus.add(spinRow(settings, {
        title: _('Auto-Hide'), subtitle: _('Seconds after the focus last moved; 0 keeps it shown'),
        key: 'hover-focus-autohide', lower: 0, upper: 60,
    }));

    return [hover, typing, focus];
}
