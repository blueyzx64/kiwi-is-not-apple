// SPDX-License-Identifier: GPL-3.0-or-later
// Liquid Glass: applies lib/glass.js to the shell surfaces the user picked.
//
// - panel   : only while Panel Transparency is off. With it on, apps/panelTransparency.js
//             owns the panel colour and already draws the blur through the same service.
// - menus   : Control Center and the date/calendar menu.
// - dock    : apps/dockBlur.js (it knows Dash to Dock's actors) - see its `when` in features.js.
// - overlays: not attached here. Spotlight, Quick Paste, the notch and the Stage Manager
//             strip attach themselves with Glass.attach(actor, {surface: 'overlays'}).
//
// Everything lives in the entry's CleanupRegistry; disable() has nothing left to do.

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Glass } from '../../lib/glass.js';
import { tintColor } from '../../lib/glassParams.js';

const PANEL_CLASS = 'kiwi-glass-panel';
const MENU_RADIUS = { quickSettings: 26, dateMenu: 18 };

/**
 * The bubble actor of a popup menu. For most menus menu.actor is the BoxPointer, but the
 * Quick Settings menu's actor is a 0x0 container and the bubble is menu._boxPointer.
 */
function _bubble(menu) {
    return menu?._boxPointer ?? menu?.actor ?? null;
}

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
        this._menus = new Map();   // menu -> {handle, savedStyle}
    }

    enable() {
        const { settings } = this._ctx;
        const cleanup = this._cleanup;

        // The panel is ours only while Panel Transparency is off
        cleanup.connect(settings, 'changed::panel-transparency', () => this._sync());
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
        const panelWanted = Glass.wants('panel') &&
            !this._ctx.settings.get_boolean('panel-transparency');
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
        for (const [menu, state] of this._menus) {
            state.handle.refresh();
            this._styleMenu(menu, state);
        }
    }

    // ---- panel -------------------------------------------------------------

    _attachPanel() {
        const panel = Main.panel;
        const panelBox = panel.get_parent();
        if (!panelBox)
            return;
        const handle = Glass.attach(panel, {
            surface: 'panel',
            parent: panelBox,
            layers: 'glass',
            name: 'kiwi-glass-panel',
            isDark: () => _textIsLight(panel),
        });

        const reg = this._cleanup;
        const sync = (inOverview = Main.overview.visible) => {
            const inFullscreen = Main.layoutManager.primaryMonitor?.inFullscreen ?? false;
            const show = !inOverview && !inFullscreen;
            handle.setVisible(show);
            // Never leave the panel bare-transparent while the glass is hidden
            if (show)
                panel.add_style_class_name(PANEL_CLASS);
            else
                panel.remove_style_class_name(PANEL_CLASS);
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
        Main.panel.remove_style_class_name(PANEL_CLASS);
    }

    // ---- menus -------------------------------------------------------------

    _menuTargets() {
        const area = Main.panel.statusArea;
        return [
            ['quickSettings', area.quickSettings?.menu],
            ['dateMenu', area.dateMenu?.menu],
        ].filter(([, menu]) => _bubble(menu)?.get_parent());
    }

    _attachMenus() {
        for (const [kind, menu] of this._menuTargets()) {
            if (this._menus.has(menu))
                continue;
            const boxPointer = _bubble(menu);
            const handle = Glass.attach(boxPointer.bin ?? boxPointer, {
                surface: 'menus',
                parent: boxPointer.get_parent(),
                below: boxPointer,
                layers: 'blur',
                role: 'large',
                radius: MENU_RADIUS[kind],
                name: `kiwi-glass-${kind}`,
                isDark: () => _textIsLight(boxPointer),
            });
            const state = { handle, box: boxPointer, savedStyle: boxPointer.get_style(), kind };
            // The blur layer does not follow the open/close animation, so it is shown only
            // while the menu is open.
            state.token = this._cleanup.connect(menu, 'open-state-changed', (_m, open) => handle.setVisible(open));
            handle.setVisible(menu.isOpen);
            // Menu destroyed under us: forget it, touch nothing on the dead actor
            state.destroyToken = this._cleanup.connect(menu, 'destroy', () => this._menus.delete(menu));
            this._menus.set(menu, state);
        }
    }

    // The bubble keeps its shape and arrow; only its fill becomes the glass tint.
    _styleMenu(menu, state) {
        const { params } = state.handle;
        const box = state.box;
        if (!params || params.tier === 'off') {
            box.set_style(state.savedStyle);
            return;
        }
        const tint = params.tier === 'opaque'
            ? tintColor({ ...params, dim: false, alpha: 1 }) : tintColor(params);
        box.set_style(`${state.savedStyle ?? ''} -arrow-background-color: ${tint};`);
    }

    _detachMenu(menu, state) {
        this._cleanup.release(state.token);
        this._cleanup.release(state.destroyToken);
        state.handle.destroy();
        state.box.set_style(state.savedStyle);
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
