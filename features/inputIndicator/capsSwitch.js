// SPDX-License-Identifier: GPL-3.0-or-later
// Caps Lock switches the input source (macOS: Keyboard > Input Sources > "Use the Caps Lock key
// to switch to and from ABC"). With a Latin and a non-Latin source (Russian, Greek, Chinese,
// Japanese...), a tap of Caps Lock switches between the most recent of each and leaves Caps
// Lock off; holding it turns Caps Lock on as usual. Off by default, like macOS.
//
// Tap or hold: the Shell sees no key release, but every input event resets the core idle
// monitor (Meta.Backend core idle monitor, Shell 45-51). CAPS_HOLD_MS after the Caps Lock edge,
// an idle time of about CAPS_HOLD_MS means nothing happened since the press: still held.
// A tap is undone with a Caps Lock press from a virtual keyboard (that edge is ignored here).
//
// Shell API: ui/status/keyboard.js getInputSourceManager(): currentSource, inputSources,
// _mruSources (private, most recent first; checked on 50.6), InputSource.activate(interactive).

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import { getInputSourceManager } from 'resource:///org/gnome/shell/ui/status/keyboard.js';

import { CAPS_HOLD_MS, CapsWatch, capsSwitchApplies, capsSwitchTarget, classifyCapsPress } from './model.js';

export class CapsLockSwitch {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._suppress = 0;         // our own Caps Lock presses still to come back as edges
        this._decideToken = 0;
        this._device = null;
        this.lastDecision = null;   // 'tap' | 'hold', for the harness
    }

    enable() {
        const cleanup = this._cleanup;
        const backend = global.stage.context?.get_backend?.() ?? Clutter.get_default_backend();
        this._seat = backend.get_default_seat();
        this._keymap = this._seat.get_keymap();
        this._idle = global.backend.get_core_idle_monitor();
        this._sources = getInputSourceManager();
        this._caps = new CapsWatch(this._keymap.get_caps_lock_state());
        cleanup.connect(this._keymap, 'state-changed', () => {
            const on = this._caps.update(this._keymap.get_caps_lock_state());
            if (on === null)
                return;
            if (this._suppress > 0) {
                this._suppress--;
                return;
            }
            if (on && this.applies())
                this._decideLater();
        });
        cleanup.add(() => {
            this._device = null;
        });
    }

    disable() {
        // Everything is in the cleanup registry
        this._decideToken = 0;
    }

    /** Whether a Caps Lock press may switch sources (a Latin and a non-Latin source exist). */
    applies() {
        return capsSwitchApplies(Object.values(this._sources?.inputSources ?? {}));
    }

    _decideLater() {
        if (this._decideToken)
            this._cleanup.release(this._decideToken);
        this._decideToken = this._cleanup.timeout(CAPS_HOLD_MS, () => {
            this._decideToken = 0;
            this.lastDecision = classifyCapsPress(this._idle.get_idletime());
            if (this.lastDecision === 'tap')
                this._switch();
        }, { name: 'caps-switch-decide' });
    }

    _switch() {
        const manager = this._sources;
        const current = manager.currentSource;
        const mru = manager._mruSources ?? Object.values(manager.inputSources ?? {});
        capsSwitchTarget(mru, current)?.activate(true);
        if (!this._keymap.get_caps_lock_state())
            return;
        // Caps Lock goes back off: one press and release of our own
        this._device ??= this._seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        this._suppress++;
        // Never swallow a real press later if our edge did not come back
        this._cleanup.timeout(500, () => {
            this._suppress = 0;
        }, { name: 'caps-switch-suppress' });
        const t = GLib.get_monotonic_time();
        this._device.notify_keyval(t, Clutter.KEY_Caps_Lock, Clutter.KeyState.PRESSED);
        this._device.notify_keyval(t + 1000, Clutter.KEY_Caps_Lock, Clutter.KeyState.RELEASED);
    }
}
