// SPDX-License-Identifier: GPL-3.0-or-later
// Favourite apps data: the dash's (and Kiwi's dock's) favourites, followed live; with none,
// the most used apps. The widget launches them in place.
//
// Shell API: js/ui/appFavorites.js getAppFavorites() ('changed', getFavorites()),
// Shell.AppUsage.get_most_used(). Checked on 50.6.

import Shell from 'gi://Shell';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';

import { Provider } from './base.js';

const MAX = 32;

export class AppsProvider extends Provider {
    initial() {
        return { apps: [], favorites: false };
    }

    run(cleanup) {
        const favorites = AppFavorites.getAppFavorites();
        this._favorites = favorites;
        cleanup.connect(favorites, 'changed', () => this._read());
        cleanup.connect(Shell.AppSystem.get_default(), 'installed-changed', () => this._read());
        cleanup.add(() => {
            this._favorites = null;
        });
        this._read();
    }

    _read() {
        let apps = this._favorites?.getFavorites() ?? [];
        const favorites = apps.length > 0;
        if (!favorites)
            apps = Shell.AppUsage.get_default().get_most_used();
        this.publish({ apps: apps.slice(0, MAX), favorites });
    }
}
