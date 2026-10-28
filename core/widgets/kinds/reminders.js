// SPDX-License-Identifier: GPL-3.0-or-later
// Reminders (macOS Sonoma's interactive Reminders widget): the open tasks of the Evolution
// Data Server task lists, the count in the list's colour, and a circle that ticks one done in
// place (core/widgets/providers/reminders.js). A click elsewhere opens Endeavour.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { CleanupRegistry } from '../../../lib/disposables.js';
import { N_, box, label, openApp, safeColor, spacer } from './common.js';

const ROWS = { small: 3, medium: 6, large: 9, extraLarge: 18 };
const COLUMNS = { small: 1, medium: 2, large: 1, extraLarge: 2 };
// The circle fills before the reminder leaves the list, as on macOS
const TICK_MS = 350;

// "Today 15:00", "Tomorrow", "28 Oct": when a reminder is due, and whether that has passed
function due(r, now, _) {
    if (!r.due)
        return null;
    const day = new Date(r.due.getFullYear(), r.due.getMonth(), r.due.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((day - today) / 86400000);
    const time = r.allDay ? '' : ` ${r.due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    const date = days === 0 ? _('Today') : days === 1 ? _('Tomorrow')
        : r.due.toLocaleDateString([], { day: 'numeric', month: 'short' });
    return { text: `${date}${time}`, overdue: r.allDay ? days < 0 : r.due < now };
}

export default {
    id: 'reminders',
    title: N_('Reminders'),
    category: N_('Reminders'),
    sizes: ['small', 'medium', 'large', 'extraLarge'],
    defaultSize: 'small',
    provider: 'reminders',

    build(view) {
        const _ = view._;
        const root = view.content;
        const size = view.size;
        const cleanup = new CleanupRegistry();

        // Header: the list's name over the count, both in its colour (macOS puts the count big)
        const header = box('kiwi-widget-row', false, { x_expand: true });
        const name = label(_('Reminders'), 'kiwi-widget-title kiwi-widget-reminders-name', { y_align: Clutter.ActorAlign.CENTER });
        const count = label('', 'kiwi-widget-reminders-count', { x_align: Clutter.ActorAlign.END });
        header.add_child(name);
        header.add_child(spacer());
        header.add_child(count);
        root.add_child(header);

        const columns = COLUMNS[size];
        const grid = new St.Widget({
            style_class: 'kiwi-widget-reminders',
            layout_manager: new Clutter.GridLayout({ column_homogeneous: true, column_spacing: 12, row_spacing: 2 }),
            x_expand: true,
            y_expand: true,
        });
        root.add_child(grid);
        const empty = label('', 'kiwi-widget-caption kiwi-widget-dim');
        root.add_child(empty);

        const tick = (row, r) => {
            row.check.checked = true;
            row.check.add_style_class_name('kiwi-widget-check-done');
            cleanup.timeout(TICK_MS, () => {
                if (!view.provider?.complete(r.list, r.uid))
                    openApp('org.gnome.Todo.desktop');
            }, { name: 'kiwi-widgets-reminders-tick' });
        };

        let rows = [];
        const fill = (items, now) => {
            grid.destroy_all_children();
            rows = [];
            const max = ROWS[size];
            items.slice(0, max).forEach((r, i) => {
                const row = box('kiwi-widget-row kiwi-widget-reminder', false, { x_expand: true });
                const color = safeColor(r.color);
                const check = new St.Button({
                    style_class: 'kiwi-widget-check',
                    accessible_name: `${_('Complete')} ${r.summary}`,
                    can_focus: true,
                    y_align: Clutter.ActorAlign.START,
                });
                if (color)
                    check.set_style(`border-color: ${color};`);
                const text = box('kiwi-widget-column', true, { x_expand: true });
                const title = label(r.summary || _('New Reminder'), 'kiwi-widget-body');
                text.add_child(title);
                const when = columns === 1 && size !== 'small' ? due(r, now, _) : null;
                if (when)
                    text.add_child(label(when.text, `kiwi-widget-footnote ${when.overdue ? 'kiwi-widget-accent' : 'kiwi-widget-dim'}`));
                row.add_child(check);
                row.add_child(text);
                const per = Math.ceil(max / columns);
                grid.layout_manager.attach(row, Math.floor(i / per), i % per, 1, 1);
                const rec = { row, check };
                check.connect('clicked', () => tick(rec, r));
                rows.push(rec);
            });
        };

        return {
            update(d) {
                const state = d?.state ?? 'loading';
                const items = d?.items ?? [];
                const lists = d?.lists ?? [];
                const one = lists.length === 1 ? lists[0] : null;
                name.text = one?.name || _('Reminders');
                const color = safeColor(one?.color ?? (items[0]?.color ?? null));
                const tint = color && one ? `color: ${color};` : null;
                name.set_style(tint);
                count.set_style(tint);
                count.text = state === 'ready' ? String(items.length) : '';
                fill(state === 'ready' ? items : [], new Date());
                empty.visible = state !== 'ready' || items.length === 0;
                empty.text = {
                    loading: '',
                    unavailable: _('Reminders are not available'),
                    'no-lists': _('No reminder lists'),
                }[state] ?? _('All done');
                view.actor.accessible_name = `${name.text}: ${count.text}`;
            },
            destroy() {
                cleanup.dispose();
            },
        };
    },

    open() {
        openApp('org.gnome.Todo.desktop', 'org.gnome.Evolution.desktop');
    },
};
