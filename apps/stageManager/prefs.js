// SPDX-License-Identifier: GPL-3.0-or-later
// Stage Manager preferences. Adw/Gtk/Gio only (runs in the prefs process, no Shell libs).
// PAGE says where the page goes; buildPrefs() returns the Adw.PreferencesGroup[].

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import { KNOWN_DEFAULTS, findConflicts, normalizeAccel } from '../../lib/keybindingsModel.js';

const N_ = s => s;

export const PAGE = { id: 'stage-manager', title: N_('Stage Manager'), icon: 'view-app-grid-symbolic' };

function _isAccel(text) {
    if (!text)
        return true;                     // empty turns the shortcut off
    if (!normalizeAccel(text))
        return false;
    const [ok] = Gtk.accelerator_parse(text);
    return ok;
}

const SUGGESTED = '<Control><Super>s';

function _shortcutRow(settings, _, key = 'stage-manager-shortcut', title = null, suggested = SUGGESTED) {
    const row = new Adw.EntryRow({ title: title ?? _('Toggle shortcut') });
    const read = () => settings.get_strv(key)[0] ?? '';
    row.text = read();

    const base = row.title;
    const showNote = () => {
        const text = row.text.trim();
        row.remove_css_class('error');
        let note = '';
        if (!_isAccel(text)) {
            row.add_css_class('error');
            note = _('Not a valid shortcut. Example: <Control><Super>s');
        } else {
            const hit = findConflicts([text], KNOWN_DEFAULTS)[0];
            if (hit)
                note = _('Also used by GNOME: %s').replace('%s', hit.with);
        }
        // An EntryRow has no subtitle, so the note goes in its title
        row.title = note ? `${base}: ${note}` : base;
    };
    // Offer the suggestion only when nothing known uses it
    if (suggested && findConflicts([suggested], KNOWN_DEFAULTS).length === 0) {
        const use = new Gtk.Button({
            label: _('Use Ctrl+Super+S'), valign: Gtk.Align.CENTER, css_classes: ['flat'],
        });
        use.connect('clicked', () => {
            settings.set_strv(key, [suggested]);
            row.text = suggested;
        });
        row.add_suffix(use);
    }
    row.connect('changed', () => {
        const text = row.text.trim();
        showNote();
        if (_isAccel(text))
            settings.set_strv(key, text ? [text] : []);
    });
    showNote();
    const id = settings.connect(`changed::${key}`, () => {
        if (read() !== row.text.trim())
            row.text = read();
    });
    row.connect('destroy', () => settings.disconnect(id));
    return row;
}

/** A combo row over a string key with fixed values. */
function _choiceRow(settings, connect, key, title, subtitle, values, labels) {
    const row = new Adw.ComboRow({ title, subtitle, model: Gtk.StringList.new(labels) });
    const sync = () => {
        const i = values.indexOf(settings.get_string(key));
        row.selected = i < 0 ? 0 : i;
    };
    sync();
    row.connect('notify::selected', () => {
        const value = values[row.selected];
        if (value && settings.get_string(key) !== value)
            settings.set_string(key, value);
    });
    connect(key, sync);
    return row;
}

/**
 * @param {{settings: Gio.Settings, window: Adw.PreferencesWindow, extension: object}} args
 * @returns {Adw.PreferencesGroup[]}
 */
export function buildPrefs({ settings, window, extension }) {
    const _ = s => extension.gettext(s);
    const handlers = [];
    const connect = (key, fn) => handlers.push(settings.connect(`changed::${key}`, fn));
    window.connect('close-request', () => {
        handlers.splice(0).forEach(id => settings.disconnect(id));
        return false;
    });

    const main = new Adw.PreferencesGroup({
        title: _('Stage Manager'),
        description: _('Other apps wait as live thumbnails in a strip at the edge of the screen. Click one to switch to it.'),
    });
    const enabled = new Adw.SwitchRow({ title: _('Show the Stage Manager strip') });
    settings.bind('stage-manager', enabled, 'active', Gio.SettingsBindFlags.DEFAULT);
    main.add(enabled);
    main.add(_shortcutRow(settings, _));

    const strip = new Adw.PreferencesGroup({ title: _('Strip') });

    const sides = ['left', 'right'];
    const side = new Adw.ComboRow({
        title: _('Side'),
        subtitle: _('Which screen edge holds the strip'),
        model: Gtk.StringList.new([_('Left'), _('Right')]),
    });
    const syncSide = () => {
        const i = sides.indexOf(settings.get_string('stage-manager-side'));
        side.selected = i < 0 ? 0 : i;
    };
    syncSide();
    side.connect('notify::selected', () => {
        const value = sides[side.selected];
        if (value && settings.get_string('stage-manager-side') !== value)
            settings.set_string('stage-manager-side', value);
    });
    connect('stage-manager-side', syncSide);
    strip.add(side);

    const autohide = new Adw.SwitchRow({
        title: _('Hide recent apps under windows'),
        subtitle: _('The strip steps aside while a window overlaps it; push the screen edge to bring it back'),
    });
    settings.bind('stage-manager-autohide', autohide, 'active', Gio.SettingsBindFlags.DEFAULT);
    strip.add(autohide);

    // "Show windows from an application" (macOS): all at once = one stack per app
    const group = new Adw.ComboRow({
        title: _('Windows from an app'),
        subtitle: _('All at once: one stack per app. One at a time: each window has its own entry'),
        model: Gtk.StringList.new([_('All at once'), _('One at a time')]),
    });
    const syncGroup = () => {
        group.selected = settings.get_boolean('stage-manager-group-by-app') ? 0 : 1;
    };
    syncGroup();
    group.connect('notify::selected', () => {
        const on = group.selected === 0;
        if (settings.get_boolean('stage-manager-group-by-app') !== on)
            settings.set_boolean('stage-manager-group-by-app', on);
    });
    connect('stage-manager-group-by-app', syncGroup);
    strip.add(group);

    const recent = new Adw.SpinRow({
        title: _('Apps in the strip'),
        subtitle: _('The most thumbnails to list'),
        adjustment: new Gtk.Adjustment({ lower: 1, upper: 10, step_increment: 1, page_increment: 2 }),
    });
    settings.bind('stage-manager-recent-count', recent, 'value', Gio.SettingsBindFlags.DEFAULT);
    strip.add(recent);

    const tilt = new Adw.SpinRow({
        title: _('Tilt'),
        subtitle: _('Degrees the windows in the strip turn toward the stage'),
        adjustment: new Gtk.Adjustment({ lower: 0, upper: 40, step_increment: 2, page_increment: 6 }),
    });
    settings.bind('stage-manager-tilt', tilt, 'value', Gio.SettingsBindFlags.DEFAULT);
    strip.add(tilt);

    const speed = new Adw.SpinRow({
        title: _('Animation speed'),
        subtitle: _('1 is normal, 2 twice as fast'),
        digits: 2,
        adjustment: new Gtk.Adjustment({ lower: 0.5, upper: 2, step_increment: 0.25, page_increment: 0.5 }),
    });
    settings.bind('stage-manager-animation-speed', speed, 'value', Gio.SettingsBindFlags.DEFAULT);
    strip.add(speed);

    // Window sets and the desktop
    const sets = new Adw.PreferencesGroup({
        title: _('Sets'),
        description: _('Drag an app from the strip onto the stage, or Shift-click it, to use it with the windows already there. Drop it on the left or right side to place them side by side. Drag a window back to the strip to take it out.'),
    });
    sets.add(_choiceRow(settings, connect, 'stage-manager-new-windows', _('New windows'),
        _('What a newly opened app window does'),
        ['replace', 'join'], [_('Replace the stage'), _('Join the current set')]));
    sets.add(_shortcutRow(settings, _, 'stage-manager-remove-shortcut', _('Remove from set shortcut'), null));
    const wallpaper = new Adw.SwitchRow({
        title: _('Click wallpaper to show the desktop'),
        subtitle: _('The windows on the stage step into the strip; click again to bring them back'),
    });
    settings.bind('stage-manager-wallpaper-click', wallpaper, 'active', Gio.SettingsBindFlags.DEFAULT);
    sets.add(wallpaper);

    // Dim the options while the strip is off
    const sync = () => {
        strip.sensitive = settings.get_boolean('stage-manager');
        sets.sensitive = strip.sensitive;
    };
    sync();
    connect('stage-manager', sync);

    // What Stage Manager pauses (features.js conflictsWith), only those the user has switched on
    const paused = new Adw.PreferencesGroup();
    const pausedRow = new Adw.ActionRow({ title: _('Paused while Stage Manager is on'), subtitle_lines: 0 });
    pausedRow.add_prefix(new Gtk.Image({ icon_name: 'media-playback-pause-symbolic' }));
    paused.add(pausedRow);
    const PAUSES = [
        [() => settings.get_boolean('minimize-to-dock'), _('Minimize to Dock')],
        [() => settings.get_boolean('move-window-to-new-workspace'), _('Move Fullscreen to New Workspace')],
        [() => settings.get_boolean('show-window-title') && settings.get_boolean('show-tiling-title-menu'),
            _('Tiling title menu')],
    ];
    const syncPaused = () => {
        const names = PAUSES.filter(([on]) => on()).map(([, name]) => name);
        pausedRow.subtitle = names.join(', ');
        paused.visible = settings.get_boolean('stage-manager') && names.length > 0;
    };
    syncPaused();
    for (const key of ['stage-manager', 'minimize-to-dock', 'move-window-to-new-workspace',
        'show-window-title', 'show-tiling-title-menu'])
        connect(key, syncPaused);

    return [main, paused, strip, sets];
}
