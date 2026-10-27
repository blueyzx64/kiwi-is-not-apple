// SPDX-License-Identifier: GPL-3.0-or-later
// Liquid Glass: applies lib/glass.js to the shell surfaces the user picked.
//
// Glass is a translucent fill on the surface actor itself (no blur, no extra layer), so
// every surface keeps its own rounded shape:
// - panel   : the top bar.
// - menus   : Control Center and the date/calendar menu. The fill goes on the menu box
//             (.popup-menu-content), the rounded bubble; the BoxPointer around it stays
//             untouched (an -arrow-background-color there draws a square backing).
// - dock    : Kiwi's own dock attaches itself (phase 1).
// - overlays: not attached here. Spotlight, Quick Paste, the clipboard popover and the
//             Stage Manager strip attach themselves with Glass.attach(actor, {surface: 'overlays'}).
//
// Everything lives in the entry's CleanupRegistry; disable() has nothing left to do.

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Glass } from '../../lib/glass.js';

/** True when text on this actor is light, i.e. the glass behind it must be the dark one. */
function _textIsLight(actor) {
    try {
        const c = actor.get_theme_node().get_foreground_color();
        return (0.2126 * c.red + 0.7152 * c.green + 0.0722 * c.blue) / 255 > 0.5;
    } catch (_e) {
        return true;
    }
}

export class LiquidGlass {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._panel = null;     // {handle, restore}
        this._menus = new Map();   // menu -> {handle, token, destroyToken}
    }

    enable() {
        const cleanup = this._cleanup;

        // Foreground colour of the theme decides dark or light glass
        cleanup.connect(St.ThemeContext.get_for_stage(global.stage), 'changed', () => this._refreshAll());
        cleanup.add(() => this._detachAll());

        // Calls back now, so the first sync happens here
        Glass.watch(cleanup, () => this._sync());
    }

    disable() {
        // Cleanup registry does the work (this._detachAll runs on dispose)
    }

    // ---- sync ------------------------------------------------------------

    _sync() {
        const panelWanted = Glass.wants('panel');
        if (panelWanted && !this._panel)
            this._attachPanel();
        else if (!panelWanted && this._panel)
            this._detachPanel();

        if (Glass.wants('menus'))
            this._attachMenus();
        else
            this._detachMenus();

        this._refreshAll();
    }

    _refreshAll() {
        this._panel?.handle.refresh();
        for (const state of this._menus.values())
            state.handle.refresh();
    }

    // ---- panel -------------------------------------------------------------

    _attachPanel() {
        const panel = Main.panel;
        const handle = Glass.attach(panel, {
            surface: 'panel',
            layers: 'glass',
            isDark: () => _textIsLight(panel),
        });

        const reg = this._cleanup;
        const sync = (inOverview = Main.overview.visible) => {
            const inFullscreen = Main.layoutManager.primaryMonitor?.inFullscreen ?? false;
            // Hidden: the panel falls back to its theme colour
            handle.setVisible(!inOverview && !inFullscreen);
        };
        const tokens = [
            // The panel is transparent in the overview and solid over fullscreen windows
            reg.connect(Main.overview, 'showing', () => sync(true)),
            reg.connect(Main.overview, 'hiding', () => sync(false)),
            reg.connect(global.display, 'in-fullscreen-changed', () => sync()),
        ];
        sync();
        this._panel = { handle, tokens };
    }

    _detachPanel() {
        const { handle, tokens } = this._panel;
        this._panel = null;
        tokens.forEach(t => this._cleanup.release(t));
        handle.destroy();
    }

    // ---- menus -------------------------------------------------------------

    _menuTargets() {
        const area = Main.panel.statusArea;
        return [area.quickSettings?.menu, area.dateMenu?.menu].filter(menu => menu?.box);
    }

    _attachMenus() {
        for (const menu of this._menuTargets()) {
            if (this._menus.has(menu))
                continue;
            // The rounded bubble is the menu box; its theme radius is kept as is
            const box = menu.box;
            const handle = Glass.attach(box, {
                surface: 'menus',
                role: 'large',
                isDark: () => _textIsLight(box),
            });
            const state = { handle };
            // Menu destroyed under us: forget it (the handle dies with the box)
            state.destroyToken = this._cleanup.connect(menu, 'destroy', () => this._menus.delete(menu));
            this._menus.set(menu, state);
        }
    }

    _detachMenu(menu, state) {
        this._cleanup.release(state.destroyToken);
        state.handle.destroy();
        this._menus.delete(menu);
    }

    _detachMenus() {
        for (const [menu, state] of [...this._menus])
            this._detachMenu(menu, state);
    }

    _detachAll() {
        if (this._panel)
            this._detachPanel();
        this._detachMenus();
    }
}
