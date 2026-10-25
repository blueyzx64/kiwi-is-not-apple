// SPDX-License-Identifier: GPL-3.0-or-later
// Liquid Glass preferences. Adw/Gtk/Gio only (runs in the prefs process, no Shell libs).
// Contract: PAGE + buildPrefs() returning Adw.PreferencesGroup[]; S10 wires it in.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { MIN_TINT_PERCENT } from '../../lib/glassParams.js';

const N_ = s => s;

export const PAGE = { id: 'liquid-glass', title: N_('Liquid Glass'), icon: 'applications-graphics-symbolic' };

const SURFACES = [
    ['panel', N_('Top bar')],
    ['menus', N_('Menus and Control Center')],
    ['dock', N_('Dock')],
    ['overlays', N_('Spotlight, Quick Paste and the Stage Manager strip')],
];

const BMS_DIRS = [
    GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-shell', 'extensions', 'blur-my-shell@aunetx']),
    '/usr/share/gnome-shell/extensions/blur-my-shell@aunetx',
];

function _switchRow(settings, title, subtitle, key) {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

function _scaleRow(settings, title, subtitle, key) {
    const row = new Adw.ActionRow({ title, subtitle });
    const scale = new Gtk.Scale({
        orientation: Gtk.Orientation.HORIZONTAL,
        adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, step_increment: 1, page_increment: 10 }),
        draw_value: true,
        value_pos: Gtk.PositionType.RIGHT,
        digits: 0,
        hexpand: true,
        valign: Gtk.Align.CENTER,
        width_request: 220,
    });
    settings.bind(key, scale.get_adjustment(), 'value', Gio.SettingsBindFlags.DEFAULT);
    row.add_suffix(scale);
    return row;
}

function _styleRow(settings, _) {
    const row = new Adw.ComboRow({
        title: _('Style'),
        subtitle: _('Tinted is easier to read. Clear is more transparent.'),
        model: Gtk.StringList.new([_('Tinted'), _('Clear')]),
    });
    const values = ['tinted', 'clear'];
    const sync = () => {
        const i = values.indexOf(settings.get_string('liquid-glass-style'));
        row.selected = i < 0 ? 0 : i;
    };
    sync();
    row.connect('notify::selected', () => {
        const v = values[row.selected];
        if (v && settings.get_string('liquid-glass-style') !== v)
            settings.set_string('liquid-glass-style', v);
    });
    const id = settings.connect('changed::liquid-glass-style', sync);
    row.connect('destroy', () => settings.disconnect(id));
    return row;
}

function _surfaceRow(settings, surface, title) {
    const row = new Adw.SwitchRow({ title });
    const key = 'liquid-glass-surfaces';
    const sync = () => {
        const on = settings.get_strv(key).includes(surface);
        if (row.active !== on)
            row.active = on;
    };
    sync();
    row.connect('notify::active', () => {
        const list = settings.get_strv(key).filter(s => s !== surface);
        if (row.active)
            list.push(surface);
        // keep the canonical order so equal sets compare equal
        const ordered = SURFACES.map(([s]) => s).filter(s => list.includes(s));
        if (ordered.join() !== settings.get_strv(key).join())
            settings.set_strv(key, ordered);
    });
    const id = settings.connect(`changed::${key}`, sync);
    row.connect('destroy', () => settings.disconnect(id));
    return row;
}

/**
 * @param {{settings: Gio.Settings, window: Adw.PreferencesWindow, extension: object}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, window, extension }) {
    const _ = s => extension?.gettext?.(s) ?? s;
    const groups = [];

    const main = new Adw.PreferencesGroup({
        title: _('Liquid Glass'),
        description: _('Frosted, translucent shell surfaces. App windows stay opaque. Turning this off restores solid surfaces; the old Panel Blur and Dock Blur switches then apply again.'),
    });
    const master = _switchRow(settings, _('Liquid Glass'), _('Shell-wide glass style'), 'liquid-glass');
    main.add(master);

    if (BMS_DIRS.some(dir => GLib.file_test(dir, GLib.FileTest.IS_DIR))) {
        const notice = new Adw.ActionRow({
            title: _('Blur my Shell is installed'),
            subtitle: _('Its blur and its own Liquid Glass effect overlap with this page. Use one of them for each surface, or the panel and dock may blur twice. Kiwi never changes Blur my Shell.'),
        });
        notice.add_prefix(new Gtk.Image({ icon_name: 'dialog-information-symbolic' }));
        main.add(notice);
    }
    groups.push(main);

    const look = new Adw.PreferencesGroup({ title: _('Look') });
    look.add(_styleRow(settings, _));
    look.add(_scaleRow(settings, _('Blur'), _('How much the background is blurred'), 'liquid-glass-blur'));
    look.add(_scaleRow(settings, _('Tint'), _('Higher keeps text readable over any wallpaper. In Tinted style, values below %d are treated as %d to keep text readable.').format(MIN_TINT_PERCENT, MIN_TINT_PERCENT), 'liquid-glass-tint'));
    look.add(_switchRow(settings, _('Edge highlight'), _('A thin light edge along the top'), 'liquid-glass-highlight'));
    groups.push(look);

    const where = new Adw.PreferencesGroup({ title: _('Surfaces') });
    for (const [surface, title] of SURFACES)
        where.add(_surfaceRow(settings, surface, _(title)));
    groups.push(where);

    const perf = new Adw.PreferencesGroup({ title: _('Performance') });
    perf.add(_switchRow(settings, _('Performance mode'),
        _('Blur a still copy of the wallpaper instead of the live screen'), 'liquid-glass-performance'));
    perf.add(_switchRow(settings, _('Performance mode in Power Saver'),
        _('Switch automatically while the Power Saver profile is active'), 'liquid-glass-off-in-powersave'));
    perf.add(_switchRow(settings, _('Edge refraction (experimental)'),
        _('Bends the picture at the edges. Uses the still wallpaper copy and a GPU shader.'), 'liquid-glass-refraction'));
    groups.push(perf);

    // Dim the controls while the master switch is off
    const sync = () => {
        const on = settings.get_boolean('liquid-glass');
        for (const g of groups.slice(1))
            g.sensitive = on;
    };
    sync();
    const id = settings.connect('changed::liquid-glass', sync);
    window?.connect('close-request', () => {
        settings.disconnect(id);
        return false;
    });

    return groups;
}
