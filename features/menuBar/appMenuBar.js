// SPDX-License-Identifier: GPL-3.0-or-later
// The app's part of the menu bar: the focused app's name in bold, then its menus (plan §5.1).
//
// The menus come from core/appMenus (ctx.appMenus): generic menus for every app, plus the
// GTK actions the app exports. Titles are known from the cached provider result; the items
// are built only when a menu opens, so a closed menu bar costs nothing but a label update on
// focus changes. With no focused window (the desktop) the menus are Files', as Finder's are
// on macOS; in the overview the app menus step aside.
//
// Every title is a PanelMenu.Button registered with the panel's menu manager, so hovering
// from one open menu to the next and Left/Right on the keyboard move between them, like
// macOS. focus() (F10) opens the app menu with its first item selected.
//
// Shell API: PanelMenu.Button, PopupMenu, Main.panel.menuManager, Shell.AppSystem.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { PanelLayout } from '../../core/panelLayout.js';
import { searchMenus, WM_ACCEL_SLOTS } from '../../core/appMenus/model.js';
import { LazyMenu, menuItem } from './menuItems.js';
import { MenuGlass } from './menuGlass.js';

export const APPS_CLAIM = 'kiwi-menubar-apps';
const DESKTOP_APP = 'org.gnome.Nautilus.desktop';
const SOFTWARE_APP = 'org.gnome.Software.desktop';
const HELP_RESULTS = 8;

/**
 * Lays its children out left to right and leaves out (allocates empty) those that do not fit,
 * so a long menu list never runs into the notch or the clock. Its minimum width is its first
 * child's (the app name).
 */
const OverflowLayout = GObject.registerClass(
class KiwiMenuOverflowLayout extends Clutter.LayoutManager {
    vfunc_get_preferred_width(container, forHeight) {
        let min = 0;
        let nat = 0;
        for (const child of container.get_children()) {
            if (!child.visible)
                continue;
            const [, n] = child.get_preferred_width(forHeight);
            if (!min)
                min = n;
            nat += n;
        }
        return [min, nat];
    }

    vfunc_get_preferred_height(container, forWidth) {
        let min = 0;
        let nat = 0;
        for (const child of container.get_children()) {
            if (!child.visible)
                continue;
            const [m, n] = child.get_preferred_height(-1);
            min = Math.max(min, m);
            nat = Math.max(nat, n);
        }
        return [min, nat];
    }

    vfunc_allocate(container, box) {
        const height = box.get_height();
        const width = box.get_width();
        let x = 0;
        let full = false;
        for (const child of container.get_children()) {
            if (!child.visible)
                continue;
            const [, n] = child.get_preferred_width(height);
            const childBox = new Clutter.ActorBox();
            if (!full && x + n <= width + 0.5) {
                childBox.set_origin(x, 0);
                childBox.set_size(n, height);
                x += n;
            } else {
                full = true;
                childBox.set_origin(x, 0);
                childBox.set_size(0, 0);
            }
            child.allocate(childBox);
        }
    }
});

const TopMenu = GObject.registerClass(
class KiwiTopMenu extends PanelMenu.Button {
    _init(title, fill) {
        super._init(0.0, title, true);
        this.setMenu(new LazyMenu(this, () => fill(this)));
        this.add_style_class_name('kiwi-menubar-item');
        this._label = new St.Label({ text: title, y_align: Clutter.ActorAlign.CENTER, style_class: 'kiwi-menubar-title' });
        this.add_child(this._label);
        this.menu.actor.add_style_class_name('kiwi-menubar-menu');
        this.def = null;
    }

    setTitle(title, bold) {
        this._label.text = title;
        this.accessible_name = title;
        if (bold)
            this.add_style_class_name('kiwi-menubar-app-name');
        else
            this.remove_style_class_name('kiwi-menubar-app-name');
    }
});

// The Help menu's search field
const HelpSearchItem = GObject.registerClass(
class KiwiHelpSearchItem extends PopupMenu.PopupBaseMenuItem {
    _init(hint) {
        super._init({ reactive: false, can_focus: false, style_class: 'kiwi-menubar-search-item' });
        this.entry = new St.Entry({
            hint_text: hint, can_focus: true, x_expand: true,
            style_class: 'kiwi-menubar-search',
        });
        this.add_child(this.entry);
    }
});

export class AppMenuBar {
    /**
     * @param {object} ctx the feature ctx
     * @param {CleanupRegistry} cleanup this part's registry
     * @param {{keys: () => object}} opts shortcut label options
     */
    constructor(ctx, cleanup, { keys }) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._keys = keys;
        this._buttons = [];
        this._target = null;
        this._menus = [];
    }

    /** Menu titles shown now (tests, the harness). */
    get titles() {
        return this._buttons.filter(b => b.container.visible).map(b => b.def?.title ?? '');
    }

    /** The menus of the focused app as built now (tests, the harness, Spotlight later). */
    get menus() {
        return this._menus;
    }

    get target() {
        return this._target;
    }

    start() {
        const ctx = this._ctx;
        const cleanup = this._cleanup;
        this._service = ctx.appMenus.acquire(cleanup);
        this._desktop = ctx.desktop.acquire(cleanup);
        this._wm = new Gio.Settings({ schema_id: 'org.gnome.desktop.wm.keybindings' });
        this._mutter = new Gio.Settings({ schema_id: 'org.gnome.mutter.keybindings' });

        this._glass = new MenuGlass(cleanup);
        this._strip = new St.Widget({
            style_class: 'kiwi-menubar-apps', layout_manager: new OverflowLayout(),
            y_expand: true, clip_to_allocation: true,
        });
        cleanup.add(() => {
            for (const b of this._buttons)
                b.destroy();
            this._buttons = [];
            this._strip.destroy();
            this._strip = null;
        });
        PanelLayout.claim(cleanup, {
            id: APPS_CLAIM, actor: this._strip, box: 'left',
            anchor: { after: ['activities', 'kiwi-menubar-logo', 'window-controls'], fallback: 'first' },
        });

        ctx.events.on('window-focused', () => this.sync(), cleanup);
        ctx.events.on('app-focused', () => this.sync(), cleanup);
        cleanup.connect(Main.overview, 'showing', () => this.sync());
        cleanup.connect(Main.overview, 'hidden', () => this.sync());
        cleanup.connect(Shell.AppSystem.get_default(), 'installed-changed', () => this.sync());
        this.sync();
    }

    /** Re-read the focused app and rebuild the titles. */
    sync() {
        if (!this._strip)
            return;
        const target = this._currentTarget();
        const same = target && this._target && target.windowId === this._target.windowId &&
            target.appId === this._target.appId;
        if (!same)
            this._closeMenus();
        this._target = target;
        this._strip.visible = !!target;
        if (!target) {
            this._setMenus([]);
            return;
        }
        const cached = this._service.peek(target);
        this._setMenus(this._build(target, cached));
        if (!cached && target.gtk) {
            this._service.results(target).then(results => {
                if (this._target === target && !this._openButton())
                    this._setMenus(this._build(target, results));
            });
        }
    }

    /** Open the app menu with its first item focused (F10); close it when a menu is open. */
    focus() {
        const open = this._openButton();
        if (open) {
            open.menu.close(BoxPointer.PopupAnimation.FULL);
            return false;
        }
        const first = this._buttons.find(b => b.container.visible);
        if (!first)
            return false;
        first.menu.open(BoxPointer.PopupAnimation.FULL);
        first.menu.actor.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
        return true;
    }

    /** Open one menu by id ('app', 'file', ...); tests and the harness. */
    openMenu(id) {
        const b = this._buttons.find(x => x.def?.id === id);
        b?.menu.open(BoxPointer.PopupAnimation.NONE);
        return b?.menu ?? null;
    }

    // ---- building ---------------------------------------------------------------------------

    _currentTarget() {
        if (Main.overview.visible)
            return null;
        const info = this._desktop.model.focusedWindow;
        const win = info ? this._desktop.metaWindow(info.id) : null;
        if (win)
            return this._service.targetFor(win);
        // The desktop: Files' menus, as Finder's on macOS
        const files = Shell.AppSystem.get_default().lookup_app(DESKTOP_APP);
        return files ? this._service.targetFor(null, files) : null;
    }

    _build(target, results) {
        this._menus = this._service.build(target, results, {
            generic: this._generic(target), accels: this._accels(), _: this._ctx.gettext,
        });
        return this._menus;
    }

    _generic(target) {
        const appSystem = Shell.AppSystem.get_default();
        const app = appSystem.lookup_app(target.appId);
        const win = target.windowId !== null ? this._desktop.metaWindow(target.windowId) : null;
        const wm = global.workspace_manager;
        const active = wm.get_active_workspace_index();
        const windows = (app?.get_windows() ?? [])
            .filter(w => !w.skip_taskbar)
            .map(w => ({ id: w.get_stable_sequence(), title: w.get_title() ?? '', focused: w === win }));
        return {
            hasWindow: !!win,
            canNewWindow: !!app?.can_open_new_window(),
            hasAbout: !!appSystem.lookup_app(SOFTWARE_APP),
            maximized: !!win && win.maximized_horizontally && win.maximized_vertically,
            fullscreen: !!win?.is_fullscreen(),
            above: !!win?.is_above(),
            workspaces: {
                count: wm.get_n_workspaces(), active,
                current: win?.is_on_all_workspaces() ? -1 : win?.get_workspace()?.index() ?? active,
            },
            windows,
        };
    }

    _accels() {
        const out = {};
        for (const [slot, [schema, key]] of Object.entries(WM_ACCEL_SLOTS)) {
            const settings = schema === 'wm' ? this._wm : this._mutter;
            out[slot] = settings.get_strv(key)[0] ?? null;
        }
        return out;
    }

    _setMenus(menus) {
        while (this._buttons.length < menus.length) {
            const b = new TopMenu('', button => this._onOpen(button));
            Main.panel.menuManager.addMenu(b.menu);
            this._glass.add(b.menu);
            this._cleanup.connect(b.menu, 'open-state-changed', (_m, open) => {
                // Connected after the menu manager's handler, so it runs once the grab took
                // the key focus: macOS puts the cursor in Help's search field
                if (open)
                    b.searchEntry?.grab_key_focus();
                else if (!this._openButton())
                    this._refreshTitles();
            });
            // A PanelMenu.Button lives in its own container (St.Bin), like in the panel boxes
            this._strip.add_child(b.container);
            this._buttons.push(b);
        }
        this._buttons.forEach((b, i) => {
            const def = menus[i] ?? null;
            b.def = def;
            b.container.visible = !!def;
            if (def)
                b.setTitle(def.title, def.id === 'app');
        });
    }

    _openButton() {
        return this._buttons.find(b => b.menu.isOpen) ?? null;
    }

    _closeMenus() {
        this._openButton()?.menu.close(BoxPointer.PopupAnimation.NONE);
    }

    // A menu opens: build it from what is known now (window titles, workspaces and states
    // change while menus are closed), and re-read the app's actions in the background if stale
    _onOpen(button) {
        const target = this._target;
        const id = button.def?.id;
        const fill = results => {
            const menus = this._build(target, results);
            button.def = menus.find(m => m.id === id) ?? button.def;
            this._fill(button);
        };
        fill(target ? this._service.peek(target) : null);
        if (!target || !this._service.isStale(target))
            return;
        this._service.results(target).then(results => {
            if (this._target === target && button.menu.isOpen)
                fill(results);
        });
    }

    // After the last menu closed: titles may have changed (Edit or View appeared)
    _refreshTitles() {
        if (this._target)
            this._setMenus(this._build(this._target, this._service.peek(this._target)));
    }

    _fill(button) {
        const menu = button.menu;
        menu.removeAll();
        button.searchEntry = null;
        const def = button.def;
        if (!def)
            return;
        this._addItems(menu, def.items, button);
    }

    _addItems(menu, items, button) {
        const target = this._target;
        // A menu with a checkmark reserves the check column for every item (macOS alignment)
        const checks = items.some(i => i.checked === true || i.checked === false);
        for (const it of items) {
            switch (it.kind) {
            case 'separator':
                menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                break;
            case 'submenu': {
                const sub = new PopupMenu.PopupSubMenuMenuItem(it.label);
                sub.add_style_class_name('kiwi-menubar-menu-item');
                if (checks)
                    sub.setOrnament(PopupMenu.Ornament.NONE);
                this._addItems(sub.menu, it.items, button);
                menu.addMenuItem(sub);
                break;
            }
            case 'search':
                button.searchEntry = this._addSearch(menu);
                break;
            default:
                menu.addMenuItem(menuItem(it.label, {
                    accel: it.accel, keys: this._keys(), enabled: it.enabled,
                    checked: checks ? !!it.checked : null,
                    onActivate: () => this._service.activate(target, it.command),
                }));
            }
        }
    }

    _addSearch(menu) {
        const _ = this._ctx.gettext;
        const search = new HelpSearchItem(_('Search'));
        const results = new PopupMenu.PopupMenuSection();
        menu.addMenuItem(search);
        menu.addMenuItem(results);
        const target = this._target;
        const run = hit => {
            menu.close(BoxPointer.PopupAnimation.FULL);
            this._service.activate(target, hit.item.command);
        };
        let hits = [];
        search.entry.clutter_text.connect('text-changed', () => {
            results.removeAll();
            hits = searchMenus(this._menus, search.entry.get_text(), HELP_RESULTS);
            for (const hit of hits) {
                const item = menuItem(hit.item.label, { onActivate: () => run(hit) });
                item.add_child(new St.Label({
                    text: hit.path, style_class: 'kiwi-menubar-accel',
                    x_expand: true, x_align: Clutter.ActorAlign.END, y_align: Clutter.ActorAlign.CENTER,
                }));
                results.addMenuItem(item);
            }
        });
        search.entry.clutter_text.connect('activate', () => {
            if (hits.length)
                run(hits[0]);
        });
        if (menu.isOpen)
            search.entry.grab_key_focus();
        return search.entry;
    }
}
