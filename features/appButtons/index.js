// SPDX-License-Identifier: GPL-3.0-or-later
// The apps' own titlebar buttons. Window buttons always stay on the app's titlebar; Kiwi never
// draws them in the top bar. Kiwi sets the WM button-layout to all three buttons (or close only,
// app-buttons-set) on the side from window-controls-side. The user's layout is kept by
// core/originals (crash-safe) and written back exactly when Kiwi is disabled.
// The look (stock GNOME or Kiwi's macOS CSS) is the GTK CSS of gtkTheme.js, which reads
// app-buttons-style.

//
// With the macOS look, unsavedDots.js puts the unsaved-changes dot in the red close button of
// windows whose title marks unsaved changes (app-buttons-unsaved-dot).

import Gio from 'gi://Gio';

import { CleanupRegistry } from '../../lib/disposables.js';
import { KiwiSettings } from '../../lib/settings.js';
import { ButtonLayoutOwner, WM_SCHEMA } from './buttonLayout.js';
import { appButtonsLayout } from './model.js';
import { UnsavedDots } from './unsavedDots.js';

const KEYS = ['window-controls-side', 'app-buttons-set'];
const DOT_KEYS = ['app-buttons-unsaved-dot', 'app-buttons-style'];

export class AppButtonsFeature {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._owner = null;
    }

    enable() {
        const { settings } = this._ctx;
        const cleanup = this._cleanup;
        const ks = new KiwiSettings(settings);
        ks.attach(cleanup);

        const wm = new Gio.Settings({ schema_id: WM_SCHEMA });
        this._owner = new ButtonLayoutOwner(this._ctx.originals, wm, () => {},
            original => appButtonsLayout(original, {
                position: ks.string('window-controls-side'),
                set: ks.string('app-buttons-set'),
            }));
        // LIFO: released before the settings watcher goes
        cleanup.add(() => {
            this._owner.release();
            this._owner = null;
        });
        this._owner.sync(true);
        ks.watch(KEYS, () => {
            this._owner?.reapply();
            this._dots?.refresh();
        });

        // The unsaved dot: its own registry, so its setting turns it on and off live
        cleanup.add(() => this._stopDots());
        const syncDots = () => {
            this._stopDots();
            if (ks.bool('app-buttons-unsaved-dot') && ks.string('app-buttons-style') === 'macos') {
                this._dotsReg = new CleanupRegistry();
                this._dots = new UnsavedDots(this._dotsReg, {
                    side: () => ks.string('window-controls-side'),
                    size: () => ks.string('button-size'),
                });
                this._dots.start();
            }
        };
        ks.watch(DOT_KEYS, syncDots);
        ks.watch('button-size', () => this._dots?.refresh());
        syncDots();
    }

    /** The unsaved-dot tracker while it runs (tests, the harness). */
    get unsavedDots() {
        return this._dots ?? null;
    }

    _stopDots() {
        this._dotsReg?.dispose();
        this._dotsReg = null;
        this._dots = null;
    }

    disable() {
        // The cleanup registry, disposed right after this, releases the layout.
    }
}
