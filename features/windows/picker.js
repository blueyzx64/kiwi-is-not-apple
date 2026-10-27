// SPDX-License-Identifier: GPL-3.0-or-later
// The layout picker of the drag (macOS 15: drag a window to the top centre): a glass popover
// under the notch with the same glyphs as the green-button menu (halves, quarters,
// arrangements). A view: drag.js tells it when to open and which glyph the pointer is over.
//
// While a window is dragged, the Shell sends no hover to other actors (the move grab owns the
// pointer), so the glyphs are found from the pointer position (model.js pickerHit) and shown
// hovered by their style pseudo-class, which is what :hover in the CSS looks for.
//
// Shell API: St, Main.uiGroup (above the windows), Glass.attach (faux glass), core/motion.

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { PICKER_SECTIONS } from '../../core/tileActions.js';
import { Glass } from '../../lib/glass.js';
import { buildGlyph } from '../../lib/tileGlyphs.js';

const N_ = s => s;

// The glyphs are larger than the menu's: the pointer has to find them while dragging
const GLYPH_W = 42;
const GLYPH_H = 29;
// Gap between the bar (the notch's bottom edge) and the picker
const GAP_PX = 8;
// What the title says until a glyph is hovered (the glyph's own name replaces it)
const PLACEHOLDER = N_('Layouts');
// Rise of the picker as it opens
const RISE_PX = 8;

export class TilePicker {
    /**
     * @param {object} ctx the extension ctx (motion, gettext)
     * @param {import('../../lib/disposables.js').CleanupRegistry} cleanup
     */
    constructor(ctx, cleanup) {
        this._motion = ctx.motion;
        this._ = ctx.gettext ?? (s => s);
        this._cleanup = cleanup;
        this._actor = null;
        this._cells = [];       // {action, name, button}
        this._title = null;
        this._hovered = null;
        this._open = false;
        this._anim = null;
    }

    /** The picker's rect on screen while it is open, else null. */
    get rect() {
        if (!this._open || !this._actor)
            return null;
        const [x, y] = this._actor.get_transformed_position();
        const [width, height] = this._actor.get_transformed_size();
        return width > 0 ? { x, y, width, height } : null;
    }

    /** The glyphs with their screen rects (empty until the first frame has laid them out). */
    cells() {
        if (!this._open)
            return [];
        return this._cells.flatMap(({ action, button }) => {
            const [x, y] = button.get_transformed_position();
            const [width, height] = button.get_transformed_size();
            return width > 0 ? [{ action, rect: { x, y, width, height } }] : [];
        });
    }

    /** Open, centred under the bar of `monitor`. `barBottom` is the bar's bottom edge. */
    open(monitor, barBottom) {
        if (this._open)
            return;
        this._open = true;
        const actor = this._actor ??= this._build();
        this._setHovered(null);
        actor.ensure_style();   // its padding counts in the size
        const [, width] = actor.get_preferred_width(-1);
        const [, height] = actor.get_preferred_height(width);
        actor.set_size(width, height);
        actor.set_position(Math.round(monitor.x + (monitor.width - width) / 2), Math.round(barBottom + GAP_PX));
        this._anim?.cancel();
        actor.opacity = 0;
        actor.translation_y = -RISE_PX;
        actor.show();
        this._anim = this._motion.ease(actor, { opacity: 255, translation_y: 0 },
            { duration: 'short', curve: 'enter' }, this._cleanup);
    }

    /** Close with a short fade; the actor stays for the next drag. */
    close() {
        if (!this._open)
            return;
        this._open = false;
        this._anim?.cancel();
        const actor = this._actor;
        this._anim = this._motion.ease(actor, { opacity: 0 }, {
            duration: 'micro', curve: 'exit',
            onDone: () => {
                if (!this._open)
                    actor.hide();
            },
        }, this._cleanup);
    }

    /** Show the glyph of `action` hovered (null: none). Returns the action when it changed. */
    hover(action) {
        if (action === this._hovered)
            return false;
        this._setHovered(action);
        return true;
    }

    _setHovered(action) {
        this._hovered = action;
        for (const { action: a, button } of this._cells) {
            if (a === action)
                button.add_style_pseudo_class('hover');
            else
                button.remove_style_pseudo_class('hover');
        }
        const cell = this._cells.find(c => c.action === action);
        this._title.text = this._(cell ? cell.name : PLACEHOLDER);
    }

    _build() {
        const _ = this._;
        const actor = new St.BoxLayout({
            style_class: 'kiwi-tile-picker', orientation: Clutter.Orientation.VERTICAL,
            visible: false, reactive: false,
        });
        const glass = Glass.attach(actor, { surface: 'menus', role: 'content' });
        this._cleanup.add(() => glass.destroy());
        this._title = new St.Label({ style_class: 'kiwi-tile-picker-title', text: _(PLACEHOLDER) });
        actor.add_child(this._title);
        for (const section of PICKER_SECTIONS) {
            for (const row of section.rows) {
                const box = new St.BoxLayout({ style_class: 'kiwi-tile-picker-row' });
                for (const [action, name] of row) {
                    const button = new St.Bin({
                        style_class: 'kiwi-tile-glyph-button', child: buildGlyph(action, GLYPH_W, GLYPH_H),
                    });
                    box.add_child(button);
                    this._cells.push({ action, name, button });
                }
                actor.add_child(box);
            }
        }
        Main.uiGroup.add_child(actor);
        this._cleanup.actor(actor);
        return actor;
    }
}
