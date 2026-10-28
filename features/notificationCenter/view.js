// SPDX-License-Identifier: GPL-3.0-or-later
// Notification Center column: the St widgets inside lib/modalSurface.js (position 'right').
//
//   [ date widget: weekday, date, small month ]
//   [ Notifications                 Clear All ]
//   [ app stack: newest card, two peeking     ]   click: expand; header: Show Less, ×
//   [ ... "N more notifications"              ]
//   [ widgets slot (L11) or placeholders      ]
//
// Pure decisions (grouping, stacks, ages, the month) come from model.js. This file only
// builds actors from them; index.js owns the life cycle.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { age, monthGrid, stackView, visibleGroups } from './model.js';

const ICON_SIZE = 32;

const label = (text, styleClass, opts = {}) => new St.Label({ text, style_class: styleClass, ...opts });

function button({ text = null, icon = null, name, styleClass, onClick }) {
    const b = new St.Button({
        style_class: styleClass, accessible_name: name, can_focus: true, reactive: true,
        ...text !== null ? { label: text } : {},
        ...icon ? { child: new St.Icon({ icon_name: icon, style_class: 'kiwi-nc-button-icon' }) } : {},
    });
    b.connect('clicked', () => onClick());
    return b;
}

/** The date widget: macOS's Calendar widget, small month. */
export function buildDateWidget(_, now, weekStart) {
    const date = GLib.DateTime.new_from_unix_local(Math.floor(now / 1000));
    const box = new St.BoxLayout({ style_class: 'kiwi-nc-card kiwi-card kiwi-nc-date', orientation: Clutter.Orientation.VERTICAL });
    const head = new St.BoxLayout({ style_class: 'kiwi-nc-date-head' });
    const titles = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
    titles.add_child(label(date.format('%A').toUpperCase(), 'kiwi-nc-date-weekday'));
    titles.add_child(label(date.format('%e %B').trim(), 'kiwi-nc-date-day'));
    head.add_child(titles);
    box.add_child(head);

    const grid = monthGrid(date.get_year(), date.get_month() - 1, weekStart,
        { year: date.get_year(), month: date.get_month() - 1, day: date.get_day_of_month() });
    const layout = new Clutter.GridLayout({ column_homogeneous: true, row_homogeneous: true });
    const table = new St.Widget({ style_class: 'kiwi-nc-month', layout_manager: layout, x_expand: true });
    // A known Sunday (4 Jan 2026) gives the localized weekday initials
    grid.weekdays.forEach((weekday, column) => {
        const name = GLib.DateTime.new_local(2026, 1, 4 + weekday, 12, 0, 0).format('%a');
        layout.attach(label(name.slice(0, 1).toUpperCase(), 'kiwi-nc-month-weekday', { x_align: Clutter.ActorAlign.CENTER }), column, 0, 1, 1);
    });
    grid.weeks.forEach((week, row) => week.forEach((cell, column) => {
        const classes = ['kiwi-nc-month-day', cell.inMonth ? '' : 'kiwi-nc-month-other', cell.today ? 'kiwi-nc-month-today' : ''];
        // Today is marked by colour: say it too
        const opts = { x_align: Clutter.ActorAlign.CENTER, ...cell.today ? { accessible_name: _('%d, today').replace('%d', String(cell.day)) } : {} };
        layout.attach(label(String(cell.day), classes.join(' ').trim(), opts), column, row + 1, 1, 1);
    }));
    box.add_child(table);
    return box;
}

export function formatAge(_, now, then) {
    const a = age(now, then);
    switch (a.unit) {
    case 'now': return _('now');
    case 'min': return _('%dm ago').replace('%d', a.n);
    case 'hour': return _('%dh ago').replace('%d', a.n);
    default:
        return a.n === 1 ? _('Yesterday')
            : GLib.DateTime.new_from_unix_local(Math.floor(then / 1000)).format('%e %b').trim();
    }
}

/**
 * One notification card.
 *
 * @param {object} item model item, with `notification` and `gicon`
 * @param {object} ctl {_, now, activate(item), clear(item), action(item, index)}
 * @param {{actions: boolean}} opts
 */
function buildCard(item, ctl, { actions }) {
    const { _ } = ctl;
    const card = new St.Button({
        style_class: 'kiwi-nc-card kiwi-card kiwi-nc-notification',
        accessible_name: [item.appName, item.title, item.body].filter(Boolean).join(', '),
        can_focus: true, reactive: true, x_expand: true,
    });
    const outer = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
    const row = new St.BoxLayout({ style_class: 'kiwi-nc-notification-row', x_expand: true });
    row.add_child(new St.Icon({
        gicon: item.gicon, fallback_icon_name: 'application-x-executable-symbolic',
        icon_size: ICON_SIZE, style_class: 'kiwi-nc-app-icon', y_align: Clutter.ActorAlign.START,
    }));
    const text = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
    const top = new St.BoxLayout({ x_expand: true });
    const title = label(item.title || item.appName, 'kiwi-nc-title kiwi-text-headline', { x_expand: true });
    title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    top.add_child(title);
    const when = label(formatAge(_, ctl.now, item.time), 'kiwi-nc-age kiwi-text-caption kiwi-secondary-text', { y_align: Clutter.ActorAlign.CENTER });
    top.add_child(when);
    // The close button takes the age's place while the pointer is over the card (macOS)
    const close = button({
        icon: 'window-close-symbolic', name: _('Clear'), styleClass: 'kiwi-nc-close',
        onClick: () => ctl.clear(item),
    });
    close.set({ visible: false, y_align: Clutter.ActorAlign.CENTER });
    top.add_child(close);
    text.add_child(top);
    if (item.body) {
        const body = label(item.body, 'kiwi-nc-body kiwi-text-callout');
        body.clutter_text.set({ line_wrap: true, ellipsize: Pango.EllipsizeMode.END });
        body.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        text.add_child(body);
    }
    row.add_child(text);
    outer.add_child(row);
    if (actions && item.actions.length) {
        const bar = new St.BoxLayout({ style_class: 'kiwi-nc-actions', x_expand: true });
        item.actions.forEach((name, index) => {
            const b = button({ text: name, name, styleClass: 'kiwi-nc-action kiwi-push-button', onClick: () => ctl.action(item, index) });
            b.x_expand = true;
            bar.add_child(b);
        });
        outer.add_child(bar);
    }
    card.set_child(outer);
    card.connect('clicked', () => ctl.activate(item));
    const hover = () => {
        const on = card.hover || card.has_key_focus() || close.has_key_focus();
        close.visible = on;
        when.visible = !on;
    };
    card.connect('notify::hover', hover);
    for (const actor of [card, close]) {
        actor.connect('key-focus-in', hover);
        actor.connect('key-focus-out', hover);
    }
    return card;
}

/** One app's group: a stack while collapsed, every card with a header while expanded. */
function buildGroup(group, ctl, expanded) {
    const { _ } = ctl;
    const view = stackView(group, expanded);
    const box = new St.BoxLayout({
        style_class: `kiwi-nc-group${view.stacked ? ' kiwi-nc-stacked' : ''}`,
        orientation: Clutter.Orientation.VERTICAL, x_expand: true,
    });
    box.kiwiGroupKey = group.key;
    if (expanded && view.count > 1) {
        const head = new St.BoxLayout({ style_class: 'kiwi-nc-group-head', x_expand: true });
        head.add_child(label(group.appName, 'kiwi-nc-group-title kiwi-section-header', { x_expand: true, y_align: Clutter.ActorAlign.CENTER }));
        head.add_child(button({ text: _('Show Less'), name: _('Show Less'), styleClass: 'kiwi-nc-pill kiwi-pill-button', onClick: () => ctl.collapse(group) }));
        head.add_child(button({ icon: 'window-close-symbolic', name: _('Clear All'), styleClass: 'kiwi-nc-pill kiwi-pill-button kiwi-nc-pill-icon', onClick: () => ctl.clearGroup(group) }));
        box.add_child(head);
    }
    for (const item of view.shown) {
        const card = buildCard(item, view.stacked ? { ...ctl, activate: () => ctl.expand(group) } : ctl,
            { actions: !view.stacked });
        box.add_child(card);
    }
    for (let i = 0; i < view.peek; i++)
        box.add_child(new St.Widget({ style_class: `kiwi-nc-peek kiwi-nc-peek-${i + 1}`, x_expand: true }));
    return box;
}

/**
 * The notification section.
 *
 * @param {object[]} groups from groupByApp
 * @param {object} ctl adds {expanded: Set, showAll, expand, collapse, clearGroup, clearAll, showMore}
 */
export function buildNotifications(groups, ctl) {
    const { _ } = ctl;
    const box = new St.BoxLayout({ style_class: 'kiwi-nc-section', orientation: Clutter.Orientation.VERTICAL, x_expand: true });
    const head = new St.BoxLayout({ style_class: 'kiwi-nc-section-head', x_expand: true });
    head.add_child(label(_('Notifications'), 'kiwi-nc-section-title kiwi-text-headline', { x_expand: true, y_align: Clutter.ActorAlign.CENTER }));
    if (groups.length) {
        head.add_child(button({ text: _('Clear All'), name: _('Clear All notifications'), styleClass: 'kiwi-nc-pill kiwi-pill-button', onClick: () => ctl.clearAll() }));
    }
    box.add_child(head);
    if (!groups.length) {
        box.add_child(label(_('No Notifications'), 'kiwi-nc-empty kiwi-text-callout kiwi-secondary-text', { x_align: Clutter.ActorAlign.CENTER }));
        return box;
    }
    const visible = visibleGroups(groups, ctl.showAll);
    for (const group of visible.shown)
        box.add_child(buildGroup(group, ctl, ctl.expanded.has(group.key)));
    if (visible.more) {
        const text = visible.more === 1 ? _('1 more notification') : _('%d more notifications').replace('%d', visible.more);
        const more = button({ text, name: text, styleClass: 'kiwi-nc-pill kiwi-pill-button kiwi-nc-more', onClick: () => ctl.showMore() });
        more.x_align = Clutter.ActorAlign.CENTER;
        box.add_child(more);
    }
    return box;
}

/**
 * The widgets area: the registered widgets, or placeholders while there are none, and the
 * "Edit Widgets…" pill; while editing, the chooser and Done.
 *
 * @param {{id: string, create: function(): Clutter.Actor}[]} widgets ordered
 * @param {{editing?: boolean, editor?: function(): Clutter.Actor, onEdit?: ?function(): void}} [edit]
 *   onEdit toggles editing (null: no button); editor builds the chooser
 */
export function buildWidgets(_, widgets, { editing = false, editor = null, onEdit = null } = {}) {
    const box = new St.BoxLayout({ style_class: 'kiwi-nc-section kiwi-nc-widgets', orientation: Clutter.Orientation.VERTICAL, x_expand: true });
    const editButton = () => {
        const edit = new St.Button({
            style_class: 'kiwi-nc-edit-widgets kiwi-pill-button', label: editing ? _('Done') : _('Edit Widgets…'),
            can_focus: true, x_align: Clutter.ActorAlign.CENTER,
        });
        edit.connect('clicked', onEdit);
        return edit;
    };
    if (editing && editor) {
        box.add_child(new St.Label({ text: _('Widgets'), style_class: 'kiwi-nc-group-title kiwi-section-header' }));
        try {
            box.add_child(editor());
        } catch (e) {
            console.error('[Kiwi] Notification Center widget chooser failed:', e);
        }
        if (onEdit)
            box.add_child(editButton());
        return box;
    }
    let added = 0;
    for (const widget of widgets) {
        try {
            const actor = widget.create();
            if (actor) {
                box.add_child(actor);
                added++;
            }
        } catch (e) {
            console.error(`[Kiwi] Notification Center widget ${widget.id} failed:`, e);
        }
    }
    if (added) {
        if (onEdit)
            box.add_child(editButton());
        return box;
    }
    const row = new St.BoxLayout({ style_class: 'kiwi-nc-placeholder-row', x_expand: true });
    for (const [icon, text] of [['weather-few-clouds-symbolic', _('Weather')], ['preferences-system-time-symbolic', _('Clock')]]) {
        const tile = new St.BoxLayout({ style_class: 'kiwi-nc-card kiwi-card kiwi-nc-placeholder', orientation: Clutter.Orientation.VERTICAL, x_expand: true });
        tile.add_child(new St.Icon({ icon_name: icon, icon_size: 24, style_class: 'kiwi-nc-placeholder-icon' }));
        tile.add_child(label(text, 'kiwi-nc-placeholder-label', { x_align: Clutter.ActorAlign.CENTER }));
        row.add_child(tile);
    }
    box.add_child(row);
    if (onEdit)
        box.add_child(editButton());
    return box;
}
