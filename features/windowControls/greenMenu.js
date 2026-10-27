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
// Shell API: PopupMenu.PopupMenu / PopupBaseMenuItem / PopupSubMenuMenuItem, Main.uiGroup,
// Main.panel.menuManager (keyboard navigation and the grab).

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { ARRANGEMENTS, ZONES } from '../../core/tileActions.js';
import { MENU_CLOSE_ARGS } from '../../lib/compat.js';

const GLYPH_W = 26;
const GLYPH_H = 18;
const GLYPH_INSET = 2;   // border (1px) + 1px air inside the glyph frame
const PANE_GAP = 2;

const N_ = s => s;

const MOVE_RESIZE = [
    ['left', N_('Left')], ['right', N_('Right')], ['top', N_('Top')], ['bottom', N_('Bottom')],
    ['top-left', N_('Top Left')], ['top-right', N_('Top Right')],
    ['bottom-left', N_('Bottom Left')], ['bottom-right', N_('Bottom Right')],
];
const FILL_ARRANGE = [
    ['fill', N_('Fill')],
    ['arrange-left-right', N_('Left & Right')], ['arrange-right-left', N_('Right & Left')],
    ['arrange-top-bottom', N_('Top & Bottom')], ['arrange-quarters', N_('Quarters')],
];

/** The panes a glyph draws: the first is the window, the others ghosts of the next windows. */
function panesOf(action) {
    if (action in ZONES)
        return [ZONES[action]];
    const name = action.replace(/^arrange-/, '');
    return (ARRANGEMENTS[name] ?? []).map(z => ZONES[z]);
}

function buildGlyph(action) {
    const frame = new St.Widget({
        style_class: 'kiwi-tile-glyph', width: GLYPH_W, height: GLYPH_H,
        layout_manager: new Clutter.FixedLayout(),
    });
    const iw = GLYPH_W - 2 * GLYPH_INSET;
    const ih = GLYPH_H - 2 * GLYPH_INSET;
    // Inner edges give up half a gap each, so neighbouring panes stay apart
    const edge = (frac, len, end) =>
        Math.round(GLYPH_INSET + frac * len + (frac > 0 && frac < 1 ? (end ? -PANE_GAP / 2 : PANE_GAP / 2) : 0));
    panesOf(action).forEach((f, i) => {
        const x0 = edge(f.x, iw, false);
        const x1 = edge(f.x + f.w, iw, true);
        const y0 = edge(f.y, ih, false);
        const y1 = edge(f.y + f.h, ih, true);
        const pane = new St.Widget({ style_class: i === 0 ? 'kiwi-tile-pane' : 'kiwi-tile-pane ghost' });
        pane.set_position(x0, y0);
        pane.set_size(Math.max(1, x1 - x0), Math.max(1, y1 - y0));
        frame.add_child(pane);
    });
    return frame;
}

export class GreenMenu {
    /**
     * @param {object} opts
     * @param {Clutter.Actor} opts.source the green button
     * @param {Function} opts.gettext
     * @param {(action: string, arg?: number) => void} opts.onAction tiling actions, or
     *   'fullscreen' | 'zoom' | 'workspace' (arg index) | 'monitor' (arg index)
     * @param {import('../../lib/disposables.js').CleanupRegistry} opts.cleanup
     */
    constructor({ source, gettext, onAction, cleanup }) {
        this._ = gettext;
        this._onAction = onAction;
        this._menu = new PopupMenu.PopupMenu(source, 0.5, St.Side.TOP);
        this._menu.actor.add_style_class_name('kiwi-green-menu');
        Main.uiGroup.add_child(this._menu.actor);
        this._menu.actor.hide();
        Main.panel.menuManager.addMenu(this._menu);
        // destroy() closes the menu first, so the manager drops its grab, then forgets it
        cleanup.add(() => {
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
            this._glyphSection(_('Move & Resize'), MOVE_RESIZE.slice(0, 4), MOVE_RESIZE.slice(4));
            this._glyphSection(_('Fill & Arrange'), FILL_ARRANGE);
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
