// SPDX-License-Identifier: GPL-3.0-or-later
// Keyboard Viewer (macOS Accessibility Keyboard, which replaced the Keyboard Viewer in
// Catalina): a floating glass keyboard of the current input source. Each key shows what it
// types at the level the held modifiers select, so holding Shift or AltGr (⌥) shows the other
// characters. Clicking a key types it into the focused window through a virtual keyboard
// (physical key codes, so the app sees the layout's own character); clicking ⇧ ⌃ ⌥ ⌘ latches
// that modifier for the next key, as on macOS.
//
// The layout is read from the XKB symbols files (model.js resolveKeys) of the input source's
// XKB id; keysym names become characters through Clutter's keysym tables. The panel is chrome
// (Main.layoutManager.addTopChrome), never takes the keyboard focus and is moved by its header.
//
// Shell API (checked on 50): ui/status/keyboard.js getInputSourceManager() currentSource.xkbId,
// 'current-source-changed'; Clutter.Seat create_virtual_device / notify_key (evdev codes);
// Clutter.Keymap 'state-changed' for the held modifiers (it fires on Shift and AltGr too).

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { getInputSourceManager } from 'resource:///org/gnome/shell/ui/status/keyboard.js';

import * as A11y from '../../lib/a11y.js';
import { RADIUS } from '../../lib/designTokens.js';
import { CleanupRegistry } from '../../lib/disposables.js';
import { Glass } from '../../lib/glass.js';
import { EVDEV, board, resolveKeys, splitXkbId } from './model.js';

const LOG = '[Kiwi]';
const UNIT = 36;        // px per key unit
const GAP = 4;
const SYMBOL_DIRS = ['/usr/share/xkeyboard-config-2/symbols', '/usr/share/X11/xkb/symbols'];
// Viewer-latched modifier -> the physical key pressed around the next key
const MOD_KEYS = Object.freeze({
    shift: EVDEV.LFSH, control: EVDEV.LCTL, alt: EVDEV.LALT, option: EVDEV.RALT, command: EVDEV.LWIN,
});

function loadContents(file, cancellable) {
    return new Promise((resolve, reject) => {
        file.load_contents_async(cancellable, (f, res) => {
            try {
                resolve(f.load_contents_finish(res)[1]);
            } catch (e) {
                reject(e);
            }
        });
    });
}

/** keysym name -> Unicode code point (0 when the keysym has no character). */
function toCodepoint(name) {
    const sym = Clutter[`KEY_${name}`];
    return typeof sym === 'number' ? Clutter.keysym_to_unicode(sym) : 0;
}

export class KeyboardViewer {
    /**
     * @param {object} ctx feature ctx
     * @param {object} cleanup the feature's CleanupRegistry
     */
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._reg = null;           // CleanupRegistry of the open panel
        this._view = null;
        this._keys = null;          // resolveKeys() of the current source
        this._xkbId = null;
        this._latched = new Set();  // viewer-latched modifiers
        this._loadSerial = 0;
        this._device = null;
        cleanup.add(() => {
            this.close();
            this._device = null;
        });
    }

    get isOpen() {
        return !!this._view;
    }

    /** For the harness: what is open and what a few keys say. */
    get state() {
        if (!this._view)
            return { open: false };
        const label = id => this._view.buttons.get(id)?.label.text ?? null;
        return {
            open: true, xkbId: this._xkbId, keys: this._view.buttons.size, loaded: !!this._keys,
            latched: [...this._latched], AC01: label('AC01'), AE01: label('AE01'),
        };
    }

    toggle() {
        if (this._view)
            this.close();
        else
            this.open();
    }

    open() {
        if (this._view)
            return;
        const reg = new CleanupRegistry();
        this._reg = reg;
        this._build(reg);
        const keymap = this._seat().get_keymap();
        reg.connect(keymap, 'state-changed', () => this._refreshLabels());
        reg.connect(getInputSourceManager(), 'current-source-changed', () => this._load());
        this._load();
    }

    close() {
        this._loadSerial++;
        this._reg?.dispose();
        this._reg = null;
        this._view = null;
        this._latched.clear();
    }

    _seat() {
        const backend = global.stage.context?.get_backend?.() ?? Clutter.get_default_backend();
        return backend.get_default_seat();
    }

    // ---- layout ----------------------------------------------------------------------------

    async _load() {
        const serial = ++this._loadSerial;
        const source = getInputSourceManager().currentSource;
        const xkbId = source?.xkbId ?? source?.id ?? 'us';
        const cancellable = new Gio.Cancellable();
        this._reg?.add(() => cancellable.cancel());
        const load = async name => {
            if (!/^[\w.+-]+$/.test(name))
                return null;
            for (const dir of SYMBOL_DIRS) {
                try {
                    return new TextDecoder().decode(await loadContents(Gio.File.new_for_path(`${dir}/${name}`), cancellable));
                } catch (e) {
                    if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        return null;
                }
            }
            return null;
        };
        try {
            const keys = await resolveKeys(splitXkbId(xkbId), load);
            if (serial !== this._loadSerial || !this._view)
                return;
            this._keys = keys;
            this._xkbId = xkbId;
            this._view.title.text = source?.displayName ?? xkbId;
            this._rebuildKeys();
        } catch (e) {
            console.warn(`${LOG} keyboard viewer: layout ${xkbId} failed: ${e.message}`);
        }
    }

    _mods() {
        const [, , mask] = global.get_pointer();
        const M = Clutter.ModifierType;
        const caps = this._seat().get_keymap().get_caps_lock_state();
        return {
            shift: !!(mask & M.SHIFT_MASK) || this._latched.has('shift'),
            caps,
            option: !!(mask & M.MOD5_MASK) || this._latched.has('option'),
        };
    }

    // ---- view ------------------------------------------------------------------------------

    _build(reg) {
        const _ = this._ctx.gettext ?? (s => s);
        const root = new St.BoxLayout({
            style_class: 'kiwi-kbd-viewer', orientation: Clutter.Orientation.VERTICAL, reactive: true,
        });
        A11y.name(root, _('Keyboard Viewer'), A11y.Role.PANEL);
        const header = new St.BoxLayout({ style_class: 'kiwi-kbd-viewer-header', reactive: true });
        const close = new St.Button({
            style_class: 'kiwi-kbd-viewer-close', can_focus: false, accessible_name: _('Close Keyboard Viewer'),
            child: new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 12 }),
        });
        close.connect('clicked', () => this.close());
        const title = new St.Label({
            style_class: 'kiwi-kbd-viewer-title', text: _('Keyboard Viewer'), x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        header.add_child(close);
        header.add_child(title);
        const keysBox = new St.BoxLayout({ style_class: 'kiwi-kbd-viewer-keys', orientation: Clutter.Orientation.VERTICAL });
        root.add_child(header);
        root.add_child(keysBox);
        Main.layoutManager.addTopChrome(root);
        reg.add(() => {
            Main.layoutManager.removeChrome(root);
            root.destroy();
        });
        const glass = Glass.attach(root, {
            surface: 'overlays', role: 'overlay', radius: RADIUS.card,
            isDark: () => St.Settings.get().color_scheme !== St.SystemColorScheme.PREFER_LIGHT,
        });
        reg.add(() => glass.destroy());
        this._dragByHeader(reg, header, root);
        this._view = { root, header, title, keysBox, buttons: new Map() };
        this._rebuildKeys();
        this._place();
    }

    _place() {
        const { root } = this._view;
        const area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        const [, w] = root.get_preferred_width(-1);
        const [, h] = root.get_preferred_height(w);
        root.set_position(Math.round(area.x + (area.width - w) / 2), Math.round(area.y + area.height - h - 24));
    }

    _rebuildKeys() {
        const v = this._view;
        if (!v)
            return;
        v.keysBox.destroy_all_children();
        v.buttons.clear();
        const rows = board(this._keys ?? new Map(), this._mods(), toCodepoint);
        for (const row of rows) {
            const line = new St.BoxLayout({ style_class: 'kiwi-kbd-viewer-row' });
            for (const k of row) {
                const label = new St.Label({ text: k.text, y_align: Clutter.ActorAlign.CENTER, x_align: Clutter.ActorAlign.CENTER });
                const button = new St.Button({
                    style_class: `kiwi-kbd-key kiwi-kbd-key-${k.kind}`, child: label, can_focus: false,
                    width: Math.round(k.width * UNIT + (k.width - 1) * GAP), height: UNIT,
                    accessible_name: k.text || k.key,
                });
                button.connect('clicked', () => this._press(k));
                line.add_child(button);
                v.buttons.set(k.key, { button, label, key: k });
            }
            v.keysBox.add_child(line);
        }
        this._refreshLabels();
    }

    _refreshLabels() {
        const v = this._view;
        if (!v)
            return;
        const rows = board(this._keys ?? new Map(), this._mods(), toCodepoint);
        for (const row of rows) {
            for (const k of row) {
                const entry = v.buttons.get(k.key);
                if (!entry)
                    continue;
                if (entry.label.text !== k.text)
                    entry.label.text = k.text;
                const b = entry.button;
                if (k.dead)
                    b.add_style_class_name('kiwi-kbd-key-dead');
                else
                    b.remove_style_class_name('kiwi-kbd-key-dead');
                if (k.kind === 'mod' && this._latched.has(k.mod))
                    b.add_style_pseudo_class('checked');
                else
                    b.remove_style_pseudo_class('checked');
            }
        }
    }

    _dragByHeader(reg, header, root) {
        let grab = null;
        let from = null;
        reg.connect(header, 'button-press-event', (_a, event) => {
            const [x, y] = event.get_coords();
            from = { x: x - root.x, y: y - root.y };
            grab = global.stage.grab(header);
            return Clutter.EVENT_STOP;
        });
        reg.connect(header, 'motion-event', (_a, event) => {
            if (!grab)
                return Clutter.EVENT_PROPAGATE;
            const [x, y] = event.get_coords();
            root.set_position(Math.round(x - from.x), Math.round(y - from.y));
            return Clutter.EVENT_STOP;
        });
        const end = () => {
            grab?.dismiss();
            grab = null;
        };
        reg.connect(header, 'button-release-event', () => {
            end();
            return Clutter.EVENT_STOP;
        });
        reg.add(end);
    }

    // ---- typing ----------------------------------------------------------------------------

    _press(k) {
        if (k.kind === 'mod') {
            if (this._latched.has(k.mod))
                this._latched.delete(k.mod);
            else
                this._latched.add(k.mod);
            this._refreshLabels();
            return;
        }
        if (!this._device)
            this._device = this._seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        const dev = this._device;
        const t = () => GLib.get_monotonic_time();
        const mods = k.kind === 'caps' ? [] : [...this._latched].map(m => MOD_KEYS[m]).filter(Boolean);
        for (const code of mods)
            dev.notify_key(t(), code, Clutter.KeyState.PRESSED);
        dev.notify_key(t(), k.code, Clutter.KeyState.PRESSED);
        dev.notify_key(t(), k.code, Clutter.KeyState.RELEASED);
        for (const code of mods.reverse())
            dev.notify_key(t(), code, Clutter.KeyState.RELEASED);
        if (k.kind !== 'caps' && this._latched.size) {
            this._latched.clear();
            this._refreshLabels();
        }
    }
}
