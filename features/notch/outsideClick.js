// SPDX-License-Identifier: GPL-3.0-or-later
// A press anywhere outside the open notch: on a window, the wallpaper, the top bar or the dock.
//
// Why a catcher. The stage's 'captured-event' never sees a press that lands on a Wayland client
// window (mutter's event filter hands it to the client first), and a press on the window that
// already has the focus changes no focus either, so neither stage events nor
// 'notify::focus-window' catch every case. A modal grab would catch all of them, but it also
// swallows the click. So while the dashboard is open a transparent, reactive layer covers the
// whole stage right under the island (and its ears). It sees every press and tells the notch to
// collapse at once. On the release it steps aside and replays the whole click (press and
// release) through a virtual pointer, so the click still reaches whatever was under it. (Both
// halves come from one device; replaying only the press would leave that device's button down.)
//
// While the shelf helper's window is under the shelf, the layer leaves a hole over the dashboard
// so that presses there go on to that window. Touch presses only collapse: a touch cannot be
// replayed as a pointer press.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import { InputRing } from './inputRing.js';

export class OutsideClick {
    /**
     * @param {CleanupRegistry} cleanup
     * @param {Clutter.Actor[]} keepAbove actors that stay above the layer, bottom first
     * @param {() => void} onOutside a press landed outside; collapse
     */
    constructor(cleanup, keepAbove, onOutside) {
        this._keepAbove = keepAbove;
        this._onOutside = onOutside;
        this._pointer = null;
        this._held = 0;      // the button pressed on the layer, until its release
        this._ring = new InputRing(cleanup, 'kiwi-notch-catcher', {
            press: event => this._press(event),
            release: () => this._release(),
            touch: event => {
                if (event.type() !== Clutter.EventType.TOUCH_BEGIN)
                    return Clutter.EVENT_PROPAGATE;
                this._onOutside();
                return Clutter.EVENT_STOP;
            },
        });
        cleanup.add(() => {
            this._pointer = null;
        });
    }

    /**
     * Cover the stage, leaving `hole` (stage px, or null) to what is below.
     * @param {{x: number, y: number, w: number, h: number}|null} hole
     */
    start(hole = null) {
        const [w, h] = global.stage.get_size();
        this._ring.place({ x: 0, y: 0, w, h }, hole);
        this._ring.restack(this._keepAbove);
    }

    stop() {
        // Not while a press waits for its release: that release must find the layer
        if (!this._held)
            this._ring.hide();
    }

    _press(event) {
        this._held = event.get_button();
        this._onOutside();
        return Clutter.EVENT_STOP;
    }

    _release() {
        const button = this._held;
        this._held = 0;
        if (!button)
            return Clutter.EVENT_PROPAGATE;
        // The layer is hidden, so the replayed click is picked on what lies under the pointer
        this._ring.hide();
        this._pointer ??= Clutter.get_default_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const now = GLib.get_monotonic_time();
        this._pointer.notify_button(now, button, Clutter.ButtonState.PRESSED);
        this._pointer.notify_button(now + 1000, button, Clutter.ButtonState.RELEASED);
        return Clutter.EVENT_STOP;
    }
}
