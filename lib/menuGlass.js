// SPDX-License-Identifier: GPL-3.0-or-later
// Faux glass on Kiwi's own panel menus (logo, app menus, privacy, status items), the same look the
// liquid-glass feature gives the Control Center and the calendar: Glass.attachMenu() while
// the "menus" glass surface is on, nothing otherwise. Every menu added here also takes the
// design system's menu shape (.kiwi-menu in styles/base.css: radius 12, rows with the shared
// accent selection), glass or not.

import { Glass } from './glass.js';

const MENU_CLASS = 'kiwi-menu';

export class MenuGlass {
    /** @param {CleanupRegistry} cleanup the part's registry */
    constructor(cleanup) {
        this._cleanup = cleanup;
        this._menus = new Map(); // PopupMenu -> handle | null
        cleanup.add(() => {
            for (const [menu, handle] of this._menus) {
                handle?.destroy();
                // A menu destroyed with its actor already left the map
                menu.actor?.remove_style_class_name(MENU_CLASS);
            }
            this._menus.clear();
        });
        Glass.watch(cleanup, () => this._sync());
    }

    /** Give a menu glass for as long as it lives. */
    add(menu) {
        if (this._menus.has(menu))
            return;
        this._menus.set(menu, null);
        const actor = menu.actor ?? null;
        actor?.add_style_class_name(MENU_CLASS);
        this._cleanup.connect(menu, 'destroy', () => this._menus.delete(menu));
        this._sync();
    }

    _sync() {
        const wanted = Glass.wants('menus');
        for (const [menu, handle] of this._menus) {
            if (wanted && !handle)
                this._menus.set(menu, Glass.attachMenu(menu));
            else if (!wanted && handle) {
                handle.destroy();
                this._menus.set(menu, null);
            } else {
                handle?.refresh();
            }
        }
    }
}
