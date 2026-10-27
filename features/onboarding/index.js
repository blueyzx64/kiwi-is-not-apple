// SPDX-License-Identifier: GPL-3.0-or-later
// Onboarding: the Shell's part of the Setup Assistant. While the `onboarding` key is 'new'
// (features.js runs this only then), it waits until the session has started and is idle,
// then opens Kiwi's preferences once with the key set to 'requested'; prefs.js presents the
// assistant (prefs/setupAssistant.js). Not in a session other than the user's, and never over
// the overview (GNOME starts in it) or another modal such as GNOME's welcome dialog: then it
// asks again when the overview closes or a window gets the focus. Rules: model.js.
//
// Shell API: Main.layoutManager 'startup-complete' and its private _startingUp (checked on
// GNOME 50; it is how ui/main.js itself tells), Main.overview 'hidden', global.display
// notify::focus-window,
// Main.sessionMode.currentMode, Main.modalCount, Extension.openPreferences().

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ONBOARDING_KEY, offerDecision } from './model.js';

export class Onboarding {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
    }

    enable() {
        this._waiting = this._queued = false;
        const offer = () => this._cleanup.idle(() => this._offer(), { name: 'kiwi onboarding' });
        if (Main.layoutManager._startingUp)
            this._cleanup.connect(Main.layoutManager, 'startup-complete', offer);
        else
            offer();
    }

    disable() {
        // Everything is in the cleanup registry
    }

    _offer() {
        const { settings, extension } = this._ctx;
        const decision = offerDecision({
            state: settings.get_string(ONBOARDING_KEY),
            sessionMode: Main.sessionMode.currentMode,
            overviewVisible: Main.overview.visible,
            modalOpen: Main.modalCount > 0,
        });
        if (decision === 'later')
            this._askAgainLater();
        if (decision !== 'offer')
            return;
        settings.set_string(ONBOARDING_KEY, 'requested');
        extension.openPreferences();
    }

    // The overview closing, or a window getting the focus (no modal holds it then)
    _askAgainLater() {
        if (this._waiting)
            return;
        this._waiting = true;
        const again = () => {
            if (this._queued)
                return;
            this._queued = true;
            this._cleanup.idle(() => {
                this._queued = false;
                this._offer();
            }, { name: 'kiwi onboarding' });
        };
        this._cleanup.connect(Main.overview, 'hidden', again);
        this._cleanup.connect(global.display, 'notify::focus-window', again);
    }
}
