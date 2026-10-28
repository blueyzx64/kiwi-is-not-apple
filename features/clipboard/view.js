// SPDX-License-Identifier: GPL-3.0-or-later
// Widgets shared by the panel popover and Quick Paste: type tile, row, metadata text.
// `ctl` is the controller from index.js; `_` is the extension's gettext.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as A11y from '../../lib/a11y.js';
import { FILTERS, ageOf, ensureVisible, tileIconProps } from './model.js';

const PREVIEW_CHARS = 2000;
const SCROLL_MARGIN = 4;            // px of the neighbouring row kept in view
const SCROLLBAR_LINGER_MS = 800;    // the bar stays this long after the list stops moving

/** '<Super><Shift>v' -> 'Super+Shift+V' for hints. */
export function accelLabel(accel) {
    if (!accel)
        return '';
    const mods = [...accel.matchAll(/<([A-Za-z0-9_]+)>/g)].map(m => {
        const k = m[1].toLowerCase();
        return k === 'primary' || k === 'control' ? 'Ctrl' : k[0].toUpperCase() + k.slice(1);
    });
    const key = accel.replace(/<[^>]*>/g, '');
    return [...mods, key.length === 1 ? key.toUpperCase() : key].join('+');
}

export function ageText(entry, now, _) {
    const [unit, n] = ageOf(entry.time, now);
    switch (unit) {
    case 'now': return _('Just now');
    case 'minutes': return _('%d min ago').replace('%d', n);
    case 'hours': return _('%d h ago').replace('%d', n);
    default: return _('%d d ago').replace('%d', n);
    }
}

export function sizeText(bytes) {
    if (bytes >= 1024 * 1024)
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024)
        return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
}

/** "Firefox · 2 min ago" */
export function subtitleOf(entry, now, _) {
    const age = ageText(entry, now, _);
    return entry.app ? `${entry.app} · ${age}` : age;
}

export function titleOf(entry, _) {
    return entry.kind === 'image' ? _('Image') : entry.preview;
}

/** Type tile: image thumbnail (made lazily when the tile is built), colour swatch or glyph. */
export function buildTile(entry, ctl, size) {
    const tile = new St.Bin({
        style_class: `kiwi-clip-tile kiwi-clip-tile-${entry.type}`,
        width: size, height: size,
        x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
    });
    if (entry.type === 'color') {
        tile.set_style(`background-color: ${entry.text.trim()};`);
        return tile;
    }
    const gicon = entry.kind === 'image' ? ctl.iconFor(entry) : null;
    tile.set_child(new St.Icon(tileIconProps(entry.type, size, gicon)));
    return tile;
}

function iconButton(iconName, label, onClick) {
    const b = new St.Button({
        style_class: 'kiwi-clip-action', can_focus: true, reactive: true,
        accessible_name: label,
        child: new St.Icon({ icon_name: iconName, icon_size: 14 }),
    });
    b.connect('clicked', () => {
        onClick();
        return Clutter.EVENT_STOP;
    });
    return b;
}

/**
 * One list row.
 *
 * @param {object} entry
 * @param {object} ctl controller
 * @param {Function} _ gettext
 * @param {{onActivate: Function, tile?: number, now?: number, compact?: boolean}} o
 *   compact: one line (type icon, preview, time on the right), for the panel popover
 * @returns {St.Button} with `.entryId`; add pseudo class 'selected' to mark it
 */
export function buildRow(entry, ctl, _, { onActivate, tile = 34, now = Date.now(), compact = false }) {
    if (compact)
        return buildCompactRow(entry, ctl, _, { onActivate, tile, now });
    const row = new St.Button({
        style_class: 'kiwi-clip-row', can_focus: true, reactive: true, track_hover: true,
        x_expand: true, x_align: Clutter.ActorAlign.FILL,
    });
    row.entryId = entry.id;
    row.accessible_name = titleOf(entry, _);
    const box = new St.BoxLayout({ style_class: 'kiwi-clip-row-box', x_expand: true });
    row.set_child(box);
    box.add_child(buildTile(entry, ctl, tile));

    const text = new St.BoxLayout({
        orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        y_align: Clutter.ActorAlign.CENTER, style_class: 'kiwi-clip-text',
    });
    const title = new St.Label({ text: titleOf(entry, _), style_class: 'kiwi-clip-title' });
    title.clutter_text.set_ellipsize(3);          // Pango.EllipsizeMode.END
    text.add_child(title);
    text.add_child(new St.Label({ text: subtitleOf(entry, now, _), style_class: 'kiwi-clip-sub' }));
    box.add_child(text);

    const actions = new St.BoxLayout({ style_class: 'kiwi-clip-actions', y_align: Clutter.ActorAlign.CENTER });
    actions.add_child(iconButton(
        'view-pin-symbolic', entry.pinned ? _('Unpin') : _('Pin'), () => ctl.togglePin(entry.id)));
    actions.add_child(iconButton('edit-delete-symbolic', _('Remove'), () => ctl.remove(entry.id)));
    actions.opacity = 0;
    box.add_child(actions);
    if (entry.pinned) {
        row.add_style_pseudo_class('pinned');
        actions.opacity = 255;
    }
    // Pin and Remove show on hover or while the row holds the keyboard selection
    const sync = () => {
        actions.opacity = row.hover || entry.pinned || row.has_style_pseudo_class('selected') ? 255 : 0;
    };
    row.connect('notify::hover', sync);
    row.connect('style-changed', sync);
    row.connect('clicked', () => onActivate(entry));
    return row;
}

/** One-line preview: line breaks and runs of blanks read as a single space. */
export function oneLine(text) {
    return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * The one-line row of the panel popover: type icon, preview, and a quiet time on the
 * right. Pin and Remove take the time's place on hover.
 */
function buildCompactRow(entry, ctl, _, { onActivate, tile, now }) {
    const row = new St.Button({
        style_class: 'kiwi-clip-row kiwi-clip-row-compact', can_focus: true, reactive: true,
        track_hover: true, x_expand: true, x_align: Clutter.ActorAlign.FILL,
    });
    row.entryId = entry.id;
    row.accessible_name = titleOf(entry, _);
    const box = new St.BoxLayout({ style_class: 'kiwi-clip-row-box', x_expand: true });
    row.set_child(box);
    box.add_child(buildTile(entry, ctl, tile));

    const title = new St.Label({
        text: oneLine(titleOf(entry, _)), style_class: 'kiwi-clip-title',
        x_expand: true, y_align: Clutter.ActorAlign.CENTER,
    });
    title.clutter_text.set_ellipsize(3);          // Pango.EllipsizeMode.END
    box.add_child(title);

    const time = new St.Label({
        text: ageText(entry, now, _), style_class: 'kiwi-clip-time', y_align: Clutter.ActorAlign.CENTER,
    });
    box.add_child(time);

    const actions = new St.BoxLayout({ style_class: 'kiwi-clip-actions', y_align: Clutter.ActorAlign.CENTER });
    actions.add_child(iconButton(
        'view-pin-symbolic', entry.pinned ? _('Unpin') : _('Pin'), () => ctl.togglePin(entry.id)));
    actions.add_child(iconButton('edit-delete-symbolic', _('Remove'), () => ctl.remove(entry.id)));
    box.add_child(actions);
    if (entry.pinned)
        row.add_style_pseudo_class('pinned');
    const sync = () => {
        // Hover only: the keyboard selection keeps its time, so the list stays calm
        const active = row.hover;
        actions.visible = active;
        time.visible = !active;
    };
    sync();
    row.connect('notify::hover', sync);
    row.connect('style-changed', sync);
    row.connect('clicked', () => onActivate(entry));
    return row;
}

/**
 * Add a row for `entry` to `list`. A row that fails to build is logged and skipped, so one
 * bad entry never blanks the rest of the list (or leaves the count stale).
 */
export function addRow(list, entry, ctl, _, opts) {
    try {
        list.add_child(buildRow(entry, ctl, _, opts));
    } catch (e) {
        console.warn(`[Kiwi] clipboard row failed: ${e.message}`);
    }
}

/** "Pinned" / "Recent" caption. */
export function sectionLabel(text) {
    return new St.Label({ text, style_class: 'kiwi-clip-section' });
}

/** Cap the characters a preview pane has to lay out. */
export function longPreview(entry) {
    return entry.text.length > PREVIEW_CHARS ? `${entry.text.slice(0, PREVIEW_CHARS)}…` : entry.text;
}

/* ---- keyboard ---- */

/**
 * What a key does in a clipboard list: 'up', 'down', 'pageUp', 'pageDown', 'left', 'right',
 * 'enter', 'escape', or null (the search field gets it). Left/Right switch the category tabs
 * only as plain arrows: with Shift, Ctrl or Alt they edit the search text.
 *
 * @param {Clutter.Event} event a key press
 * @returns {?string}
 */
export function navAction(event) {
    const sym = event.get_key_symbol();
    const mods = event.get_state() & (Clutter.ModifierType.SHIFT_MASK |
        Clutter.ModifierType.CONTROL_MASK | Clutter.ModifierType.MOD1_MASK);
    switch (sym) {
    case Clutter.KEY_Up: case Clutter.KEY_KP_Up: return 'up';
    case Clutter.KEY_Down: case Clutter.KEY_KP_Down: return 'down';
    case Clutter.KEY_Page_Up: case Clutter.KEY_KP_Page_Up: return 'pageUp';
    case Clutter.KEY_Page_Down: case Clutter.KEY_KP_Page_Down: return 'pageDown';
    case Clutter.KEY_Left: case Clutter.KEY_KP_Left: return mods ? null : 'left';
    case Clutter.KEY_Right: case Clutter.KEY_KP_Right: return mods ? null : 'right';
    case Clutter.KEY_Return: case Clutter.KEY_KP_Enter: case Clutter.KEY_ISO_Enter: return 'enter';
    case Clutter.KEY_Escape: return 'escape';
    default: return null;
    }
}

/* ---- category tabs ---- */

/**
 * The All / Text / Links / Images tabs (a small segmented control). Click picks one;
 * Left/Right are handled by the surface, which then calls sync().
 *
 * @param {Function} _ gettext
 * @param {(id: string) => void} onPick
 * @returns {{actor: St.BoxLayout, sync: (filter: string, tabs?: {id: string, count: number}[]) => void}}
 */
export function buildFilterTabs(_, onPick) {
    const labels = { all: _('All'), text: _('Text'), links: _('Links'), images: _('Images') };
    const actor = new St.BoxLayout({ style_class: 'kiwi-clip-filters' });
    const buttons = new Map();
    for (const id of FILTERS) {
        const b = new St.Button({
            label: labels[id], style_class: 'kiwi-clip-filter', can_focus: true, toggle_mode: true,
            accessible_name: labels[id], accessible_role: A11y.Role.TOGGLE_BUTTON,
        });
        b.connect('clicked', () => onPick(id));
        buttons.set(id, b);
        actor.add_child(b);
    }
    const sync = (filter, tabs = null) => {
        for (const [id, b] of buttons) {
            b.checked = id === filter;
            const n = tabs?.find(t => t.id === id)?.count;
            b.accessible_name = n === undefined ? labels[id] : `${labels[id]}, ${n}`;
        }
    };
    return { actor, sync };
}

/* ---- scrolling ---- */

/** A scroll view's vertical St.ScrollBar (an internal child; no public getter on GNOME 50). */
function verticalBar(scroll) {
    return scroll.get_children().find(c => c instanceof St.ScrollBar &&
        c.orientation === Clutter.Orientation.VERTICAL) ?? null;
}

/**
 * Keeps the selected row of a St.ScrollView in view, with a short ease, and gives the view a
 * macOS overlay scrollbar: thin (stylesheet), shown while the list moves or the pointer is on
 * it, faded out a moment after. The rows leave a gutter on the right for it (.kiwi-clip-list),
 * so it never covers their content. Everything it holds ends with the scroll view.
 */
export class ListScroller {
    /**
     * @param {St.ScrollView} scroll
     * @param {object} [motion] core/motion.js (ctx.motion); without it the list jumps
     */
    constructor(scroll, motion = null) {
        this._scroll = scroll;
        this._motion = motion;
        this._adj = scroll.vadjustment ?? scroll.get_vadjustment?.() ?? null;
        this._anim = null;
        this._target = null;        // where the running ease ends
        this._idle = 0;
        this._hideId = 0;
        this._waitRow = null;       // {row, allocId, destroyId} while a fresh row has no allocation yet
        this._bar = verticalBar(scroll);
        this._dead = false;
        if (this._bar && this._adj) {
            this._bar.opacity = 0;
            this._bar.track_hover = true;
            this._adj.connect('notify::value', () => this._flash());
            this._bar.connect('notify::hover', () => this._flash());
        }
        scroll.connect('destroy', () => this._dispose());
    }

    /** Scroll so `row` (and its section caption, if it starts one) is visible. */
    reveal(row) {
        if (this._dead || !this._adj || !row || !row.get_parent())
            return;
        this._cancelWait();
        // A row that was never laid out has an empty box. (Not has_allocation(): that is false
        // after any queued relayout, e.g. the 'selected' style change itself, and the box
        // notifies only when it changes, so waiting for it could wait forever.)
        if (row.get_allocation_box().get_height() <= 0) {
            // A row just built: measure it once the list has been laid out
            // (a refresh can destroy it first: then the wait just ends)
            const wait = { row, allocId: 0, destroyId: 0 };
            wait.allocId = row.connect('notify::allocation', () => {
                row.disconnect(wait.allocId);
                wait.allocId = 0;
                this._idle ||= GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    this._idle = 0;
                    this._cancelWait();
                    this.reveal(row);
                    return GLib.SOURCE_REMOVE;
                });
            });
            wait.destroyId = row.connect('destroy', () => this._cancelWait());
            this._waitRow = wait;
            return;
        }
        const prev = row.get_previous_sibling();
        const top = prev && prev.entryId === undefined && !prev.reactive ? prev.y : row.y;
        const adj = this._adj;
        const from = this._target ?? adj.value;
        const to = ensureVisible({ top, bottom: row.y + row.height },
            { value: from, pageSize: adj.page_size, lower: adj.lower, upper: adj.upper }, SCROLL_MARGIN);
        if (to === from)
            return;
        this._scrollTo(to);
    }

    _scrollTo(to) {
        const adj = this._adj;
        this._anim?.cancel();
        this._anim = null;
        if (!this._motion || this._motion.env.reducedMotion) {
            this._target = null;
            adj.value = to;
            return;
        }
        const from = adj.value;
        this._target = to;
        this._anim = this._motion.tween(this._scroll, { duration: 'micro', curve: 'standard',
            onDone: () => {
                this._target = null;
            } }, p => {
            adj.value = from + (to - from) * p;
        });
    }

    _flash() {
        const bar = this._bar;
        if (this._dead || !bar)
            return;
        this._fade(bar, 255, 'micro');
        if (this._hideId)
            GLib.source_remove(this._hideId);
        this._hideId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SCROLLBAR_LINGER_MS, () => {
            this._hideId = 0;
            if (bar.hover)
                return GLib.SOURCE_CONTINUE;      // still under the pointer: check again later
            this._fade(bar, 0, 'short');
            return GLib.SOURCE_REMOVE;
        });
    }

    _fade(bar, opacity, duration) {
        if (bar.opacity === opacity)
            return;
        if (this._motion)
            this._motion.ease(bar, { opacity }, { duration, curve: 'standard' });
        else
            bar.opacity = opacity;
    }

    _cancelWait() {
        const wait = this._waitRow;
        this._waitRow = null;
        if (wait?.allocId)
            wait.row.disconnect(wait.allocId);
        if (wait?.destroyId)
            wait.row.disconnect(wait.destroyId);
        if (this._idle)
            GLib.source_remove(this._idle);
        this._idle = 0;
    }

    _dispose() {
        this._dead = true;
        this._anim?.cancel();
        this._anim = null;
        this._cancelWait();
        if (this._hideId)
            GLib.source_remove(this._hideId);
        this._hideId = 0;
        // The adjustment and the bar go with the scroll view, and their handlers with them
    }
}
