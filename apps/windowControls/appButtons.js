// SPDX-License-Identifier: GPL-3.0-or-later
// The apps' own titlebar buttons while the top-bar window controls are off (features.js runs
// this entry only then). Kiwi sets the WM button-layout to all three buttons (or close only,
// app-buttons-set) on the side from app-buttons-position, through the same crash-safe owner as
// the panel controls: the user's layout is saved in saved-button-layout and written back
// exactly when the top-bar controls come back on or Kiwi is disabled.
// The look (stock GNOME or Kiwi's macOS CSS) is the GTK CSS in gtkThemeManager.js, which reads
// app-buttons-style while the controls are off (appButtonsMacos in model.js).

import Gio from 'gi://Gio';

import { KiwiSettings } from '../../lib/settings.js';
import { ButtonLayoutOwner } from './buttonLayout.js';
import { appButtonsLayout } from './model.js';

const KEYS = ['app-buttons-position', 'app-buttons-set'];

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

        const wm = new Gio.Settings({ schema_id: 'org.gnome.desktop.wm.preferences' });
        this._owner = new ButtonLayoutOwner(settings, wm, () => {},
            original => appButtonsLayout(original, {
                position: ks.string('app-buttons-position'),
                set: ks.string('app-buttons-set'),
            }));
        // LIFO: released before the settings watcher goes
        cleanup.add(() => {
            this._owner.release();
            this._owner = null;
        });
        this._owner.sync(true);
        ks.watch(KEYS, () => this._owner?.reapply());
    }

    disable() {
        // The cleanup registry, disposed right after this, releases the layout.
    }
}
