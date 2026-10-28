// SPDX-License-Identifier: GPL-3.0-or-later
// Text Input preferences (macOS System Settings > Keyboard > Text Input and Text Replacements):
// the Kiwi input engine (helpers/kiwi-input, a separate system install), press and hold for
// accents, Text Replacements and their list. Adw only; prefs/pages/keyboard.js places it.
//
// The input sources are the user's: "Add Kiwi input sources" only appends, and only when the
// button is pressed.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { COMPONENT_FILE, cleanReplacements, hasKiwiSource, withKiwiSources } from '../lib/inputSourcesModel.js';
import { switchRow, watchKey } from './widgets.js';

const INPUT_SOURCES = 'org.gnome.desktop.input-sources';
const LIST_KEY = 'input-replacements-list';
const INSTALL_DOC = 'https://github.com/blueyzx64/kiwi-is-not-apple/blob/main/docs/features/input.md';

/** Where ibus-daemon reads components: IBUS_COMPONENT_PATH, else its data dir. */
function engineInstalled() {
    const env = GLib.getenv('IBUS_COMPONENT_PATH');
    const dirs = env ? env.split(':') : ['/usr/share/ibus/component', '/usr/local/share/ibus/component'];
    return dirs.some(d => d && GLib.file_test(GLib.build_filenamev([d, COMPONENT_FILE]), GLib.FileTest.EXISTS));
}

/**
 * @param {{settings: Gio.Settings, window: Adw.PreferencesWindow, extension: object}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, window, extension }) {
    const _ = extension?.gettext?.bind(extension) ?? (s => s);
    const installed = engineInstalled();

    const group = new Adw.PreferencesGroup({
        title: _('Text Input'),
        description: _('Press and hold a letter for its accents, and Text Replacements, like macOS. They work while a “(Kiwi)” input source is selected: the Kiwi input engine keeps your keyboard layout and adds them on top.'),
    });

    const status = new Adw.ActionRow({
        title: _('Kiwi input engine'),
        subtitle: installed ? _('Installed')
            : _('Not installed. Install the kiwi-input package, or run “sudo make input-install” in the Kiwi source folder, then log out and back in.'),
    });
    status.add_prefix(new Gtk.Image({
        icon_name: installed ? 'emblem-ok-symbolic' : 'dialog-information-symbolic', valign: Gtk.Align.CENTER,
    }));
    if (!installed) {
        const help = new Gtk.Button({ label: _('How to install'), valign: Gtk.Align.CENTER });
        help.connect('clicked', () => Gio.AppInfo.launch_default_for_uri(INSTALL_DOC, null));
        status.add_suffix(help);
    }
    group.add(status);

    const sourcesSettings = new Gio.Settings({ schema_id: INPUT_SOURCES });
    const sourcesRow = new Adw.ActionRow({ title: _('Add Kiwi input sources') });
    const addButton = new Gtk.Button({ label: _('Add'), valign: Gtk.Align.CENTER });
    sourcesRow.add_suffix(addButton);
    const syncSources = () => {
        const sources = sourcesSettings.get_value('sources').deepUnpack();
        const { added } = withKiwiSources(sources);
        addButton.sensitive = installed && added.length > 0;
        sourcesRow.subtitle = hasKiwiSource(sources)
            ? _('Choose a “(Kiwi)” source in the input menu of the top bar, or with Super+Space.')
            : _('Adds a “(Kiwi)” source for each of your keyboard layouts, after the ones you have. Nothing is removed.');
    };
    addButton.connect('clicked', () => {
        const { sources, added } = withKiwiSources(sourcesSettings.get_value('sources').deepUnpack());
        if (!added.length)
            return;
        sourcesSettings.set_value('sources', new GLib.Variant('a(ss)', sources));
        window?.add_toast?.(new Adw.Toast({ title: _('Added %d Kiwi input source(s)').replace('%d', String(added.length)) }));
    });
    const sourcesId = sourcesSettings.connect('changed::sources', syncSources);
    sourcesRow.connect('destroy', () => sourcesSettings.disconnect(sourcesId));
    syncSources();
    group.add(sourcesRow);

    const hold = switchRow(settings, _('Press and hold for accents'),
        _('Hold a letter to choose é, ü, ñ and others; type the number under one to pick it. Off while key repeat is off.'),
        'input-press-and-hold');
    group.add(hold);
    group.add(switchRow(settings, _('Text Replacements'),
        _('A shortcut followed by a space or punctuation becomes its phrase. Backspace right after puts the shortcut back.'),
        'input-replacements'));

    return [group, buildReplacementsGroup(settings, _)];
}

/** The Text Replacements list: one row per pair, and a row to add one. */
function buildReplacementsGroup(settings, _) {
    const group = new Adw.PreferencesGroup({
        title: _('Text Replacements'),
        description: _('Type the shortcut, then a space or punctuation.'),
    });
    const read = () => settings.get_value(LIST_KEY).deepUnpack();
    const write = rows => settings.set_value(LIST_KEY, new GLib.Variant('a(ss)', cleanReplacements(rows)));

    const shortcut = new Adw.EntryRow({ title: _('Shortcut') });
    const phrase = new Adw.EntryRow({ title: _('Phrase') });
    const add = new Gtk.Button({ label: _('Add'), valign: Gtk.Align.CENTER, css_classes: ['suggested-action'] });
    const syncAdd = () => {
        add.sensitive = cleanReplacements([[shortcut.text, phrase.text]]).length > 0;
    };
    shortcut.connect('changed', syncAdd);
    phrase.connect('changed', syncAdd);
    add.connect('clicked', () => {
        write([...read(), [shortcut.text, phrase.text]]);
        shortcut.text = '';
        phrase.text = '';
    });
    phrase.add_suffix(add);
    syncAdd();

    let rows = [];
    const rebuild = () => {
        for (const r of rows)
            group.remove(r);
        rows = read().map(([k, v], i) => {
            const row = new Adw.ActionRow({ title: GLib.markup_escape_text(k, -1), subtitle: GLib.markup_escape_text(v, -1) });
            const remove = new Gtk.Button({
                icon_name: 'user-trash-symbolic', valign: Gtk.Align.CENTER, css_classes: ['flat'],
                tooltip_text: _('Remove'),
            });
            remove.update_property([Gtk.AccessibleProperty.LABEL], [_('Remove %s').replace('%s', k)]);
            remove.connect('clicked', () => write(read().filter((_pair, j) => j !== i)));
            row.add_suffix(remove);
            group.add(row);
            return row;
        });
        // The entry rows stay last
        group.remove(shortcut);
        group.remove(phrase);
        group.add(shortcut);
        group.add(phrase);
    };
    group.add(shortcut);
    group.add(phrase);
    rebuild();
    watchKey(settings, LIST_KEY, group, rebuild);
    return group;
}
