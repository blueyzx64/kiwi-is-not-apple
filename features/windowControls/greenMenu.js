// SPDX-License-Identifier: GPL-3.0-or-later
// The green-button menu (macOS 15 "Fill & Arrange"): opened by hovering over the green top-bar
// control, or pressing and holding it. A view only: it draws what the feature gives it and
// reports the chosen action.
//
//   Move & Resize   [left] [right] [top] [bottom]  [4 quarters]   glyphs of the layout
//   Fill & Arrange  [fill] [left & right] [right & left] [top & bottom] [quarters]
//   Center, Return to Previous Size
//   Enter / Exit Full Screen, Zoom
//   Move to Workspace ▸, Move to Display ▸ (with more than one display)
//
// Hovering a glyph puts its name in the section header, as macOS does. The tiling sections
// are left out while window tiling is off.
//
// Faux glass from lib/glass.js (Glass.attachMenu), like every Kiwi menu.
//
// Shell API: PopupMenu.PopupMenu / PopupBaseMenuItem / PopupSubMenuMenuItem, Main.uiGroup,
// Main.panel.menuManager (keyboard navigation and the grab).

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { PICKER_SECTIONS } from '../../core/tileActions.js';
import { MENU_CLOSE_ARGS } from '../../lib/compat.js';
import { Glass } from '../../lib/glass.js';
import { buildGlyph } from '../../lib/tileGlyphs.js';

export class GreenMenu {
    /**
     * @param {object} opts
     * @param {import('gi://Clutter').Actor} opts.source the indicator the menu hangs from. Not the green
     *   button itself: a St.Button that is a menu source stops taking presses after the menu
     *   grab ends (seen on GNOME 50.6), as panel menus always hang from their PanelMenu.Button
     * @param {import('gi://Clutter').Actor} opts.target the green button the arrow points at
     * @param {Function} opts.gettext
     * @param {(action: string, arg?: number) => void} opts.onAction tiling actions, or
     *   'fullscreen' | 'zoom' | 'workspace' (arg index) | 'monitor' (arg index)
     * @param {import('../../lib/disposables.js').CleanupRegistry} opts.cleanup
     */
    constructor({ source, target, gettext, onAction, cleanup }) {
        this._source = source;
        this._target = target;
        this._ = gettext;
        this._onAction = onAction;
        this._menu = new PopupMenu.PopupMenu(source, 0.5, St.Side.TOP);
        this._menu.actor.add_style_class_name('kiwi-green-menu');
        Main.uiGroup.add_child(this._menu.actor);
        this._menu.actor.hide();
        Main.panel.menuManager.addMenu(this._menu);
        const glass = Glass.attachMenu(this._menu);
        // destroy() closes the menu first, so the manager drops its grab, then forgets it
        cleanup.add(() => {
            glass.destroy();
            this._menu.destroy();
            this._menu = null;
        });
    }

    get isOpen() {
        return !!this._menu?.isOpen;
    }

    close() {
        if (this._menu?.isOpen)
            this._menu.close(MENU_CLOSE_ARGS);
    }

    /**
     * Rebuild for the focused window and open.
     *
     * @param {object} s
     * @param {boolean} s.tiling the tiling engine runs
     * @param {boolean} s.canRestore
     * @param {boolean} s.fullscreen
     * @param {boolean} s.canFullscreen
     * @param {{count: number, active: number, current: number, dynamic: boolean}} s.workspaces
     * @param {{count: number, current: number}} s.monitors
     */
    open(s) {
        const menu = this._menu;
        const _ = this._;
        menu.removeAll();
        if (s.tiling) {
            for (const section of PICKER_SECTIONS)
                this._glyphSection(_(section.title), ...section.rows);
            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            menu.addAction(_('Center'), () => this._onAction('center'));
            const back = menu.addAction(_('Return to Previous Size'), () => this._onAction('restore'));
            back.setSensitive(s.canRestore);
            menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
        const full = menu.addAction(s.fullscreen ? _('Exit Full Screen') : _('Enter Full Screen'),
            () => this._onAction('fullscreen'));
        full.setSensitive(s.fullscreen || s.canFullscreen);
        menu.addAction(_('Zoom'), () => this._onAction('zoom'));

        const ws = s.workspaces;
        if (ws.count > 1) {
            const sub = new PopupMenu.PopupSubMenuMenuItem(_('Move to Workspace'));
            for (let i = 0; i < ws.count; i++) {
                const last = ws.dynamic && i === ws.count - 1;
                const label = last ? _('New Workspace') : _('Workspace %d').replace('%d', String(i + 1));
                const item = sub.menu.addAction(label, () => this._onAction('workspace', i));
                if (i === ws.current)
                    item.setSensitive(false);
            }
            menu.addMenuItem(sub);
        }
        if (s.monitors.count > 1) {
            const sub = new PopupMenu.PopupSubMenuMenuItem(_('Move to Display'));
            for (let i = 0; i < s.monitors.count; i++) {
                const item = sub.menu.addAction(_('Display %d').replace('%d', String(i + 1)),
                    () => this._onAction('monitor', i));
                if (i === s.monitors.current)
                    item.setSensitive(false);
            }
            menu.addMenuItem(sub);
        }
        // Point the arrow at the green button
        const [sx] = this._source.get_transformed_position();
        const [tx] = this._target.get_transformed_position();
        const sw = this._source.get_transformed_size()[0];
        const tw = this._target.get_transformed_size()[0];
        if (sw > 0)
            menu.setSourceAlignment(Math.min(Math.max((tx + tw / 2 - sx) / sw, 0), 1));
        menu.open(true);
    }

    // A section: its header (which names the hovered glyph) and one or two rows of glyphs
    _glyphSection(title, ...rows) {
        const _ = this._;
        const header = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false, activate: false });
        const label = new St.Label({ text: title, style_class: 'kiwi-green-menu-header' });
        header.add_child(label);
        this._menu.addMenuItem(header);
        for (const row of rows) {
            const item = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false, activate: false });
            item.add_style_class_name('kiwi-green-menu-glyphs');
            const box = new St.BoxLayout({ style_class: 'kiwi-green-menu-glyph-row' });
            for (const [action, name] of row) {
                const button = new St.Button({
                    style_class: 'kiwi-tile-glyph-button',
                    accessible_name: _(name),
                    can_focus: true,
                    track_hover: true,
                    child: buildGlyph(action),
                });
                const show = () => {
                    label.text = button.hover || button.has_key_focus() ? _(name) : title;
                };
                button.connect('notify::hover', show);
                button.connect('key-focus-in', show);
                button.connect('key-focus-out', show);
                button.connect('clicked', () => {
                    this.close();
                    this._onAction(action);
                });
                box.add_child(button);
            }
            item.add_child(box);
            this._menu.addMenuItem(item);
        }
    }
}
