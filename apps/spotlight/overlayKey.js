// SPDX-License-Identifier: GPL-3.0-or-later
// Take over the Super tap ("overlay-key") from the Activities overview, and give it back.
//
// How the stock Shell does it: Main.overview's OverviewControls connects a handler to
// global.display 'overlay-key' (js/ui/overviewControls.js, unchanged in structure 48-51; read
// in the 51.1 source). mutter emits that signal only for a Super press and release with no
// other key in between, so Super+key shortcuts are unaffected.
//
// What we do, with no monkey patch of the Shell:
//   start(): GObject.signal_handlers_block_matched() on every handler connected to
//            'overlay-key' at that moment (this silences the stock overview toggle), then
//            connect our own handler.
//   stop():  disconnect ours, unblock the handlers we blocked.
// The overview itself is untouched: hot corner, touchpad gesture, Super+A and the Activities
// button all keep working, and a Super tap while the overview is open still closes it.
//
// Side effect: another extension's 'overlay-key' handler that was connected before start() is
// blocked while Spotlight owns the key. That is the price of a clean restore.

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SIGNAL = 'overlay-key';

export class OverlayKeyTakeover {
    /** @param {Function} onTap called for a Super tap when the overview is not open */
    constructor(onTap) {
        this._onTap = onTap;
        this._handlerId = 0;
        this._blocked = 0;
        this._a11y = null;
    }

    get active() {
        return this._handlerId !== 0;
    }

    start() {
        if (this.active)
            return;
        const display = global.display;
        this._blocked = GObject.signal_handlers_block_matched(display, { signalId: SIGNAL });
        if (this._blocked === 0)
            console.warn('[Kiwi] spotlight: no stock overlay-key handler found; a Super tap may also open the overview');
        this._a11y = new Gio.Settings({ schema_id: 'org.gnome.desktop.a11y.keyboard' });
        this._handlerId = display.connect(SIGNAL, () => this._tap());
    }

    stop() {
        if (!this.active)
            return;
        const display = global.display;
        display.disconnect(this._handlerId);
        this._handlerId = 0;
        if (this._blocked > 0)
            GObject.signal_handlers_unblock_matched(display, { signalId: SIGNAL });
        this._blocked = 0;
        this._a11y = null;
    }

    _tap() {
        // The stock handler ignores the key with sticky keys on (Super is a latching modifier
        // then); do the same.
        if (this._a11y?.get_boolean('stickykeys-enable'))
            return;
        if (Main.overview.visible) {
            // Behave as stock while the overview is up: a tap closes it
            Main.overview.toggle();
            return;
        }
        if (Main.sessionMode.isLocked || Main.sessionMode.isGreeter)
            return;
        this._onTap();
    }
}
