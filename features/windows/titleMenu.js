// SPDX-License-Identifier: GPL-3.0-or-later
// Move & Resize in the title bar menu (key show-tiling-title-menu): the tiles of macOS 15's
// green-button menu, in the menu a window's title bar opens on right-click (and Alt+Space).
//
// Why not on the green button: the window buttons are drawn by each app inside its own window
// (GTK client-side decorations, Kiwi's traffic lights are GTK CSS), so the Shell never sees the
// pointer over them and cannot open a menu on hover. The title bar's right-click menu is the
// Shell's own (GTK and libadwaita apps ask for it with gtk_window_titlebar_action / xdg_toplevel
// show_window_menu), so it reaches the same actions for every app.
//
// Shell API: WindowMenu.prototype._buildMenu (js/ui/windowMenu.js, read on GNOME 50: it adds
// the stock items, ending with a separator and Close), PopupMenu.PopupSubMenuMenuItem,
// PopupSeparatorMenuItem. Injected through the cleanup registry; a menu already open keeps its
// items until it closes (each one is built per opening and destroyed on close).

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { WindowMenu } from 'resource:///org/gnome/shell/ui/windowMenu.js';

import { titleMenuItems } from './model.js';

/**
 * @param {object} ctx the extension ctx (gettext)
 * @param {import('../../lib/disposables.js').CleanupRegistry} cleanup the tiling feature's registry
 * @param {import('../../lib/settings.js').KiwiSettings} ks
 * @param {import('./index.js').WindowTiling} engine
 */
export function enableTitleMenu(ctx, cleanup, ks, engine) {
    const _ = ctx.gettext ?? (s => s);
    cleanup.inject(WindowMenu.prototype, '_buildMenu', function (orig, window, ...rest) {
        const result = orig.call(this, window, ...rest);
        try {
            if (ks.bool('show-tiling-title-menu'))
                addMoveResize(this, window, engine, _);
        } catch (e) {
            console.warn('[Kiwi] windows: cannot add Move & Resize to the window menu:', e.message);
        }
        return result;
    });
}

function addMoveResize(menu, window, engine, _) {
    const items = titleMenuItems({ canRestore: engine.canRestore(window), tileable: engine.tileable(window) });
    if (!items)
        return;
    const sub = new PopupMenu.PopupSubMenuMenuItem(_('Move & Resize'));
    for (const entry of items) {
        if (entry.separator) {
            sub.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_(entry.label ?? '')));
            continue;
        }
        const item = sub.menu.addAction(_(entry.label), () => engine.perform(window, entry.action));
        item.setOrnament(PopupMenu.Ornament.NONE);
    }
    // Above the last separator (the one before Close), as the stock menu groups its actions
    const children = menu._getMenuItems?.() ?? [];
    const lastSep = children.findLastIndex(c => c instanceof PopupMenu.PopupSeparatorMenuItem);
    menu.addMenuItem(sub, lastSep >= 0 ? lastSep : undefined);
}
