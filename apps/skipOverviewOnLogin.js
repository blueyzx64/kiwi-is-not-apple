// SPDX-License-Identifier: GPL-3.0-or-later
// Prevents GNOME Shell from opening the overview automatically on login.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { CleanupRegistry } from '../lib/disposables.js';

let registry = null;
// Module state on purpose: Kiwi is torn down and re-enabled on lock/unlock, but the
// shell only starts up once per session. disable() must not reset this.
let firstLogin = true;

// `_startingUp` is a private LayoutManager flag; if it ever disappears treat it as "done".
function startingUp() {
    return Main.layoutManager._startingUp === true;
}

export function enable() {
    if (registry)
        return;
    registry = new CleanupRegistry();
    const reg = registry;

    if (!firstLogin)
        return;

    if (startingUp()) {
        // Block any show() while the shell is still starting up.
        const injection = reg.inject(Main.overview, 'show', function (orig, ...args) {
            if (startingUp())
                return undefined;
            return orig.apply(this, args);
        });

        const startupToken = reg.connect(Main.layoutManager, 'startup-complete', () => {
            reg.release(startupToken);
            reg.release(injection);
            firstLogin = false;

            // Hide if somehow still visible
            if (Main.overview.visible)
                Main.overview.hide();
        });
        return;
    }

    // Startup already finished (e.g. Kiwi enabled later): just close an open overview once.
    firstLogin = false;
    if (Main.overview.visible)
        Main.overview.hide();
}

export function disable() {
    registry?.dispose();
    registry = null;
}
