// SPDX-License-Identifier: GPL-3.0-or-later
// The actors of Hover Text: a large-text panel (Hover Text, Hover Typing, Hover Color) and an
// outline (the element under the pointer, the field being typed in, the keyboard focus ring).
// They sit in Main.layoutManager.uiGroup above windows and the panel, never reactive, so the
// pointer and clicks go through to the app underneath.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as A11y from '../../lib/a11y.js';
import { RADIUS } from '../../lib/designTokens.js';
import { Glass } from '../../lib/glass.js';
import { luminance, ringRect } from './model.js';

const isDark = () => St.Settings.get().color_scheme !== St.SystemColorScheme.PREFER_LIGHT;

/** A panel of large text, with an optional colour swatch row. */
export class HoverPanel {
    /**
     * @param {object} cleanup the feature's registry (the actor and glass go into it)
     * @param {object} motion ctx.motion
     * @param {string} kind 'text' | 'typing' (a style class suffix)
     */
    constructor(cleanup, motion, kind) {
        this._cleanup = cleanup;
        this._motion = motion;
        this._glass = null;
        this._style = '';
        this._shown = false;
        this.actor = cleanup.actor(new St.BoxLayout({
            style_class: `kiwi-hover-panel kiwi-hover-panel-${kind}`,
            orientation: Clutter.Orientation.VERTICAL,
            visible: false, opacity: 0, reactive: false,
        }));
        this._label = new St.Label({ style_class: 'kiwi-hover-panel-text' });
        const text = this._label.clutter_text;
        text.line_wrap = true;
        text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        text.ellipsize = Pango.EllipsizeMode.NONE;
        this._swatchRow = new St.BoxLayout({ style_class: 'kiwi-hover-color-row', visible: false });
        this._swatch = new St.Widget({ style_class: 'kiwi-hover-color-swatch', y_align: Clutter.ActorAlign.CENTER });
        this._hex = new St.Label({ style_class: 'kiwi-hover-color-hex', y_align: Clutter.ActorAlign.CENTER });
        this._swatchRow.add_child(this._swatch);
        this._swatchRow.add_child(this._hex);
        this.actor.add_child(this._label);
        this.actor.add_child(this._swatchRow);
        Main.layoutManager.uiGroup.add_child(this.actor);
        A11y.name(this.actor, '', A11y.Role.TOOL_TIP);
    }

    /**
     * Font size, colours and the max width (px). A solid background replaces the glass.
     *
     * @param {{size: number, color: ?string, background: ?string, maxWidth: number}} look
     */
    setLook({ size, color, background, maxWidth }) {
        const label = [`font-size: ${size}px;`, `max-width: ${Math.round(maxWidth)}px;`];
        if (color)
            label.push(`color: ${color};`);
        const style = `${label.join(' ')}|${background ?? ''}`;
        if (style !== this._style) {
            this._style = style;
            this._label.style = label.join(' ');
            this._hex.style = color ? `color: ${color};` : null;
            this.actor.style = background ? `background-color: ${background};` : null;
        }
        if (background && this._glass) {
            this._glass.destroy();
            this._glass = null;
        } else if (!background && !this._glass) {
            this._glass = Glass.attach(this.actor, { surface: 'overlays', role: 'overlay', radius: RADIUS.card, isDark });
            this._cleanup.add(() => this._glass?.destroy());
        }
    }

    /** The text shown (plain), for tests and the harness. */
    get text() {
        return this._shown && this._label.visible ? this._plain : null;
    }

    get color() {
        return this._shown && this._swatchRow.visible ? this._hex.text : null;
    }

    get visible() {
        return this._shown;
    }

    /**
     * @param {{text?: ?string, markup?: ?string, plain?: string, color?: ?string}} content
     */
    setContent({ text = null, markup = null, plain = null, color = null }) {
        this._plain = plain ?? text ?? '';
        if (markup !== null)
            this._label.clutter_text.set_markup(markup);
        else
            this._label.text = text ?? '';
        this._label.visible = !!(text || markup);
        this._swatchRow.visible = !!color;
        if (color) {
            this._swatch.style = `background-color: ${color};`;
            this._hex.text = color;
        }
        A11y.name(this.actor, this._plain || color || '');
    }

    get size() {
        const [, w] = this.actor.get_preferred_width(-1);
        const [, h] = this.actor.get_preferred_height(w);
        return { width: w, height: h };
    }

    moveTo(x, y) {
        this.actor.set_position(x, y);
    }

    show(owner) {
        const a = this.actor;
        a.get_parent()?.set_child_above_sibling(a, null);
        if (this._shown && a.visible)
            return;
        this._shown = true;
        a.visible = true;
        this._motion.ease(a, { opacity: 255 }, { duration: 'micro', curve: 'standard' }, owner);
    }

    hide(owner) {
        if (!this._shown)
            return;
        this._shown = false;
        const a = this.actor;
        this._motion.ease(a, { opacity: 0 }, {
            duration: 'short', curve: 'exit',
            onDone: finished => {
                if (finished && !this._shown)
                    a.visible = false;
            },
        }, owner);
    }
}

/** A rounded outline drawn around a rect (element highlight, field outline, focus ring). */
export class Outline {
    constructor(cleanup, kind) {
        this.actor = cleanup.actor(new St.Widget({
            style_class: `kiwi-hover-outline kiwi-hover-outline-${kind}`,
            visible: false, reactive: false,
        }));
        this._rect = null;
        Main.layoutManager.uiGroup.add_child(this.actor);
    }

    /**
     * @param {{color: ?string, width: number, contrast?: boolean}} look color null: the accent
     */
    setLook({ color, width, contrast = false }) {
        this._width = width;
        const parts = [`border-width: ${width}px;`];
        if (color)
            parts.push(`border-color: ${color};`);
        if (contrast) {
            // A dark edge outside and a light one inside: visible on any background
            const dark = luminance(color ?? '#007aff') > 0.5;
            parts.push(`box-shadow: 0 0 0 2px ${dark ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)'};`);
        }
        this.actor.style = parts.join(' ');
    }

    get rect() {
        return this.actor.visible ? this._rect : null;
    }

    /** Show around `rect` (stage coordinates), or hide with null. */
    setRect(rect) {
        if (!rect) {
            this.actor.visible = false;
            this._rect = null;
            return;
        }
        const r = ringRect(rect, this._width ?? 2);
        this._rect = r;
        this.actor.set_position(r.x, r.y);
        this.actor.set_size(r.width, r.height);
        this.actor.get_parent()?.set_child_above_sibling(this.actor, null);
        this.actor.visible = true;
    }
}

/** Pango markup for the typing panel: the text with a coloured insertion point at the caret. */
export function caretMarkup(before, after, caretColor) {
    const esc = s => GLib.markup_escape_text(s, -1);
    const bar = caretColor ? `<span foreground="${caretColor}">│</span>` : '│';
    return `${esc(before)}${bar}${esc(after)}`;
}
