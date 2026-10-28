#!/usr/bin/gjs -m
// SPDX-License-Identifier: GPL-3.0-or-later
// Kiwi input engine: an IBus engine that keeps the user's XKB layout and adds two macOS typing
// aids GNOME has no place for: press and hold for accents (holdModel.js) and Text Replacements
// (replacementsModel.js). A GNOME Shell extension cannot see the keys typed into apps on
// Wayland, so this runs out of process; ibus-daemon starts it (`--ibus`) once the user picks a
// "… (Kiwi)" input source.
//
//   kiwi-input-engine --xml               print the engines (one per XKB layout) for IBus
//   kiwi-input-engine --ibus              run as the component IBus started
//   kiwi-input-engine --schemadir DIR     where Kiwi's compiled settings schema is (optional)
//
// Settings come from Kiwi's schema (input-press-and-hold, input-replacements,
// input-replacements-list), found installed or in the extension's folder; without it the
// macOS defaults apply. Key repeat off turns press and hold off (macOS).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import IBus from 'gi://IBus?version=1.0';
import System from 'system';

import { DEFAULT_REPLACEMENTS, Replacer, TypedBuffer, isTrigger, parseReplacements } from './replacementsModel.js';
import { HoldMachine } from './holdModel.js';
import { enginesXml, layoutsToOffer } from './enginesModel.js';

const ARGS = System.programArgs;
const BUS_NAME = 'org.kiwi.Input';
const KIWI_SCHEMA = 'org.gnome.shell.extensions.kiwi';
const UUID = 'kiwi@kemma';
const BACKSPACE_KEYCODE = 14;   // evdev KEY_BACKSPACE (IBus keycodes are evdev codes)
const MODS = IBus.ModifierType.CONTROL_MASK | IBus.ModifierType.MOD1_MASK |
    IBus.ModifierType.SUPER_MASK | IBus.ModifierType.MOD4_MASK | IBus.ModifierType.HYPER_MASK;
// Keys after which the engine no longer knows the text before the caret
const MOVES = new Set([IBus.KEY_Left, IBus.KEY_Right, IBus.KEY_Up, IBus.KEY_Down, IBus.KEY_Home,
    IBus.KEY_End, IBus.KEY_Page_Up, IBus.KEY_Page_Down, IBus.KEY_Return, IBus.KEY_KP_Enter,
    IBus.KEY_Delete, IBus.KEY_Tab, IBus.KEY_Escape]);

function argValue(name) {
    const i = ARGS.indexOf(name);
    return i >= 0 ? ARGS[i + 1] ?? null : null;
}

/** Kiwi's settings, from the installed schema or the extension's folder; null without them. */
function openKiwiSettings() {
    const base = Gio.SettingsSchemaSource.get_default();
    let schema = base?.lookup(KIWI_SCHEMA, true) ?? null;
    const dirs = [argValue('--schemadir'),
        GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-shell', 'extensions', UUID, 'schemas']),
        ...GLib.get_system_data_dirs().map(d => GLib.build_filenamev([d, 'gnome-shell', 'extensions', UUID, 'schemas']))];
    for (const dir of dirs) {
        if (schema)
            break;
        if (!dir || !GLib.file_test(GLib.build_filenamev([dir, 'gschemas.compiled']), GLib.FileTest.EXISTS))
            continue;
        try {
            schema = Gio.SettingsSchemaSource.new_from_directory(dir, base, false).lookup(KIWI_SCHEMA, false);
        } catch (e) {
            printerr(`kiwi-input: schema in ${dir}: ${e.message}`);
        }
    }
    return schema ? new Gio.Settings({ settings_schema: schema }) : null;
}

/** Everything the engines share: settings, read once and kept current. */
class Config {
    constructor() {
        this.kiwi = openKiwiSettings();
        this.keyboard = new Gio.Settings({ schema_id: 'org.gnome.desktop.peripherals.keyboard' });
        this.listeners = new Set();
        this._read();
        this.kiwi?.connect('changed', () => this._changed());
        this.keyboard.connect('changed', () => this._changed());
    }

    _read() {
        const k = this.kiwi;
        this.repeat = this.keyboard.get_boolean('repeat');
        this.delayMs = Math.max(150, this.keyboard.get_uint('delay'));
        this.holdEnabled = (k ? k.get_boolean('input-press-and-hold') : true) && this.repeat;
        this.replacementsEnabled = k ? k.get_boolean('input-replacements') : true;
        const pairs = k ? k.get_value('input-replacements-list').deepUnpack() : DEFAULT_REPLACEMENTS;
        this.replacements = parseReplacements(pairs);
    }

    _changed() {
        this._read();
        for (const fn of this.listeners)
            fn();
    }
}

let config = null;

const KiwiEngine = GObject.registerClass({ GTypeName: 'KiwiInputEngine' },
class KiwiEngine extends IBus.Engine {
    _init(params) {
        super._init(params);
        this._hold = new HoldMachine({ enabled: config.holdEnabled });
        this._replacer = new Replacer(config.replacements);
        this._typed = new TypedBuffer();
        this._timer = 0;
        this._table = null;
        this._sync = () => {
            this._hold.enabled = config.holdEnabled;
            this._replacer.map = config.replacements;
        };
        config.listeners.add(this._sync);
        this.connect('destroy', () => {
            config.listeners.delete(this._sync);
            this._cancelTimer();
        });
    }

    vfunc_process_key_event(keyval, keycode, state) {
        const release = (state & IBus.ModifierType.RELEASE_MASK) !== 0;
        const key = this._describe(keyval, state);
        if (release)
            return this._apply(this._hold.release(key));

        const hold = this._hold.press(key);
        if (this._apply(hold)) {
            this._replacer.forget();
            return true;
        }
        if (key.mods) {
            this._replacer.forget();
            this._typed.clear();
            return false;
        }
        if (keyval === IBus.KEY_BackSpace) {
            const undo = config.replacementsEnabled ? this._replacer.backspace() : null;
            if (undo) {
                this._edit(undo);
                return true;
            }
            this._typed.backspace();
            return false;
        }
        if (config.replacementsEnabled && key.ch && isTrigger(key.ch)) {
            const edit = this._replacer.expand(this._typed.text, key.ch);
            if (edit) {
                this._edit(edit);
                return true;
            }
        } else {
            this._replacer.forget();
        }
        if (MOVES.has(keyval))
            this._typed.clear();
        else if (key.ch)
            this._typed.type(key.ch);
        return false;
    }

    vfunc_candidate_clicked(index, _button, _state) {
        this._apply(this._hold.pick(index));
    }

    vfunc_focus_in() {
        this._forget();
    }

    vfunc_focus_out() {
        this._forget();
    }

    vfunc_reset() {
        this._forget();
    }

    vfunc_disable() {
        this._forget();
    }

    _forget() {
        this._apply(this._hold.reset());
        this._typed.clear();
        this._replacer.forget();
    }

    _describe(keyval, state) {
        const ch = IBus.keyval_to_unicode(keyval);
        const NAMES = { [IBus.KEY_Escape]: 'Escape', [IBus.KEY_Return]: 'Return', [IBus.KEY_KP_Enter]: 'Return',
            [IBus.KEY_Left]: 'Left', [IBus.KEY_Right]: 'Right' };
        return {
            keyval,
            ch: typeof ch === 'string' && ch !== '\0' && ch >= ' ' ? ch : '',
            name: NAMES[keyval] ?? 'other',
            mods: (state & MODS) !== 0,
        };
    }

    /** Applies a HoldMachine result; returns whether the key was handled. */
    _apply({ handled, effects }) {
        for (const e of effects) {
            switch (e.type) {
            case 'commit':
                this.commit_text(IBus.Text.new_from_string(e.text));
                this._typed.type(e.text);
                break;
            case 'delete':
                this._delete(e.count);
                for (let i = 0; i < e.count; i++)
                    this._typed.backspace();
                break;
            case 'start-timer':
                this._startTimer();
                break;
            case 'cancel-timer':
                this._cancelTimer();
                break;
            case 'show':
                this._showTable(e.variants, e.cursor);
                break;
            case 'cursor':
                this._showTable(this._hold.variants, e.index);
                break;
            case 'hide':
                this.hide_lookup_table();
                break;
            }
        }
        return handled;
    }

    _edit({ delete: count, text }) {
        this._delete(count);
        for (let i = 0; i < count; i++)
            this._typed.backspace();
        this.commit_text(IBus.Text.new_from_string(text));
        this._typed.type(text);
    }

    /** Removes count characters before the caret: through surrounding text, else Backspace. */
    _delete(count) {
        if (count <= 0)
            return;
        if (this.client_capabilities & IBus.Capabilite.SURROUNDING_TEXT) {
            this.delete_surrounding_text(-count, count);
            return;
        }
        for (let i = 0; i < count; i++) {
            this.forward_key_event(IBus.KEY_BackSpace, BACKSPACE_KEYCODE, 0);
            this.forward_key_event(IBus.KEY_BackSpace, BACKSPACE_KEYCODE, IBus.ModifierType.RELEASE_MASK);
        }
    }

    _startTimer() {
        this._cancelTimer();
        this._timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, config.delayMs, () => {
            this._timer = 0;
            this._apply(this._hold.timeout());
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelTimer() {
        if (this._timer)
            GLib.source_remove(this._timer);
        this._timer = 0;
    }

    _showTable(variants, cursor) {
        const table = IBus.LookupTable.new(variants.length || 1, 0, cursor >= 0, false);
        table.set_orientation(IBus.Orientation.HORIZONTAL);
        variants.forEach((v, i) => {
            table.append_candidate(IBus.Text.new_from_string(v));
            table.set_label(i, IBus.Text.new_from_string(String(i + 1)));
        });
        if (cursor >= 0)
            table.set_cursor_pos(cursor);
        this._table = table;
        this.update_lookup_table(table, true);
    }
});

/** `--xml`: the engines IBus lists, one per XKB layout to offer. */
async function printEngines() {
    const sources = new Gio.Settings({ schema_id: 'org.gnome.desktop.input-sources' })
        .get_value('sources').deepUnpack();
    let info = null;
    try {
        const { default: GnomeDesktop } = await import('gi://GnomeDesktop?version=4.0');
        info = new GnomeDesktop.XkbInfo();
    } catch {}
    const layouts = [];
    for (const xkbId of layoutsToOffer(sources)) {
        const [known, displayName, shortName] = info?.get_layout_info(xkbId) ?? [true, xkbId, xkbId];
        if (!known)
            continue;
        layouts.push({ xkbId, displayName, shortName, language: shortName });
    }
    print(enginesXml(layouts));
}

function run() {
    IBus.init();
    const bus = new IBus.Bus();
    if (!bus.is_connected()) {
        printerr('kiwi-input: no IBus daemon');
        return 1;
    }
    config = new Config();
    const loop = new GLib.MainLoop(null, false);
    bus.connect('disconnected', () => loop.quit());
    const factory = IBus.Factory.new(bus.get_connection());
    // The daemon asks for engines by name; every Kiwi engine is the same class
    factory.connect('create-engine', (_f, name) => {
        if (!name.startsWith('kiwi:'))
            return null;
        return new KiwiEngine({
            engine_name: name,
            object_path: `/org/freedesktop/IBus/Engine/kiwi/${++engineCount}`,
            connection: bus.get_connection(),
        });
    });
    if (ARGS.includes('--ibus'))
        bus.request_name(BUS_NAME, 0);
    loop.run();
    return 0;
}

let engineCount = 0;

if (ARGS.includes('--xml'))
    await printEngines();
else
    System.exit(run());
