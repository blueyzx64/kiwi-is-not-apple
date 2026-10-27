// SPDX-License-Identifier: GPL-3.0-or-later
// The menu bar's policy for the stock top bar. Phase 1 builds the real menu bar here (logo
// menu, app name and app menus); for now it only decides what of GNOME's own top bar shows.
//
//   menubar-show-activities  GNOME's Activities button (the workspace pill at the far left).
//                            Off by default, as macOS has none; the window controls and later
//                            the logo menu start the bar.

import { PanelLayout } from '../../core/panelLayout.js';
import { CleanupRegistry } from '../../lib/disposables.js';
import { KiwiSettings } from '../../lib/settings.js';

export class MenuBar {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._hidden = null;
    }

    enable() {
        const ks = new KiwiSettings(this._ctx.settings);
        ks.attach(this._cleanup);
        ks.watch('menubar-show-activities', () => this._sync(ks));
        this._cleanup.add(() => this._unhide());
        this._sync(ks);
    }

    disable() {
        // The cleanup registry, disposed right after this, shows the Activities button again
    }

    _sync(ks) {
        if (ks.bool('menubar-show-activities'))
            this._unhide();
        else if (!this._hidden) {
            this._hidden = new CleanupRegistry();
            PanelLayout.hide(this._hidden, 'activities');
        }
    }

    _unhide() {
        this._hidden?.dispose();
        this._hidden = null;
    }
}
