// SPDX-License-Identifier: GPL-3.0-or-later
// Take over the Super tap ("overlay-key") from the Activities overview, and give it back.
//
// How the stock Shell does it: Main.overview's OverviewControls connects a handler to
// global.display 'overlay-key' (js/ui/overviewControls.js, unchanged in structure 48-51; read
// in the 51.1 source). mutter emits that signal only for a Super press and release with no
// other key in between, so Super+key shortcuts are unaffected.
//
// What we do, with no monkey patch of the Shell:
//   start(): find the OLDEST handler connected to 'overlay-key' (GLib keeps handlers in connect
//            order, and the Shell connects its own at startup, before any extension) and block
//            that one id, then connect our own handler. If no handler is found we do nothing
//            and the stock behaviour stays; Spotlight is then reachable by its optional shortcut.
//   stop():  disconnect ours, unblock exactly the id we blocked.
// Other extensions' overlay-key handlers are not touched. The overview itself is untouched:
// hot corner, touchpad gesture, Super+A and the Activities button keep working, and a Super
// tap while the overview is open still closes it.

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const SIGNAL = 'overlay-key';

export class OverlayKeyTakeover {
    /** @param {Function} onTap called for a Super tap when the overview is not open */
    constructor(onTap) {
        this._onTap = onTap;
        this._handlerId = 0;
        this._blockedId = 0;
        this._a11y = null;
    }

    get active() {
        return this._handlerId !== 0;
    }

    start() {
        if (this.active)
            return;
        const display = global.display;
        let a11y = null;
        let ours = 0;
        let blocked = 0;
        try {
            // Everything that can throw comes first; nothing is blocked until it is all ready
            a11y = new Gio.Settings({ schema_id: 'org.gnome.desktop.a11y.keyboard' });
            blocked = GObject.signal_handler_find(display, { signalId: SIGNAL });
            if (!blocked) {
                console.warn('[Kiwi] spotlight: no stock overlay-key handler found; the Super tap stays with the overview');
                return;
            }
            // No safe way to count handlers (the *_matched calls would also touch handlers other
            // extensions blocked), so only the id is logged, for diagnosis.
            console.debug(`[Kiwi] spotlight: blocking the oldest overlay-key handler (id ${blocked}, assumed to be the Shell's)`);
            GObject.signal_handler_block(display, blocked);
            ours = display.connect(SIGNAL, () => this._tap());
        } catch (e) {
            console.warn(`[Kiwi] spotlight: overlay-key takeover failed: ${e.message}`);
            if (blocked)
                GObject.signal_handler_unblock(display, blocked);
            if (ours)
                display.disconnect(ours);
            return;
        }
        this._a11y = a11y;
        this._blockedId = blocked;
        this._handlerId = ours;
    }

    stop() {
        if (!this.active)
            return;
        const display = global.display;
        display.disconnect(this._handlerId);
        if (GObject.signal_handler_is_connected(display, this._blockedId))
            GObject.signal_handler_unblock(display, this._blockedId);
        this._handlerId = 0;
        this._blockedId = 0;
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
        // A window move or resize (or another grab) is in progress: do not pop up over it
        if (global.display.is_grabbed?.())
            return;
        this._onTap();
    }
}
