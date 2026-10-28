// SPDX-License-Identifier: GPL-3.0-or-later
// Up Next (macOS Calendar's "Up Next" and "List"): the next event and when it starts in the
// small size, the next event beside the ones after it in the medium, and the coming days as a
// list in the large. Same data as the Calendar widget (Evolution Data Server through the
// Shell's calendar server, core/widgets/providers/calendar.js).

import St from 'gi://St';

import { agenda, nextEvent, startsIn, upcomingEvents } from '../data.js';
import { N_, box, label, openApp, spacer } from './common.js';

const fmtTime = d => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function whenText(e, _) {
    return e.allDay ? _('All day') : `${fmtTime(e.date)} – ${fmtTime(e.end)}`;
}

function dayTitle(group, _) {
    if (group.day === 0)
        return _('Today');
    if (group.day === 1)
        return _('Tomorrow');
    return group.date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
}

// A row of the list: the calendar bar, the title and the time
function eventRow(e, _, compact) {
    const row = box('kiwi-widget-event', false, { x_expand: true });
    row.add_child(new St.Widget({ style_class: 'kiwi-widget-event-bar' }));
    const text = box('kiwi-widget-column', true, { x_expand: true });
    text.add_child(label(e.summary || _('Untitled'), 'kiwi-widget-body kiwi-widget-strong'));
    if (!compact)
        text.add_child(label(whenText(e, _), 'kiwi-widget-caption kiwi-secondary-text'));
    row.add_child(text);
    if (compact) {
        const day = e.today ? '' : `${e.date.toLocaleDateString([], { weekday: 'short' })} `;
        row.add_child(label(e.allDay ? `${day}${_('All day')}`.trim() : `${day}${fmtTime(e.date)}`, 'kiwi-widget-caption kiwi-secondary-text'));
    }
    return row;
}

export default {
    id: 'up-next',
    title: N_('Up Next'),
    category: N_('Calendar'),
    sizes: ['small', 'medium', 'large'],
    defaultSize: 'small',
    provider: 'calendar',

    build(view) {
        const _ = view._;
        const root = view.content;
        const size = view.size;

        // The header: today's weekday in red and the day, as on every macOS calendar widget
        const header = box('kiwi-widget-row', false, { x_expand: true });
        const weekday = label('', 'kiwi-widget-caps kiwi-widget-accent');
        const date = label('', 'kiwi-widget-caps kiwi-secondary-text');
        header.add_child(weekday);
        header.add_child(date);
        root.add_child(header);

        if (size === 'large') {
            const list = box('kiwi-widget-events kiwi-widget-agenda', true, { x_expand: true, y_expand: true });
            root.add_child(list);
            return {
                update(d) {
                    const now = d?.now ?? new Date();
                    weekday.text = now.toLocaleDateString([], { weekday: 'long' }).toUpperCase();
                    date.text = now.toLocaleDateString([], { day: 'numeric', month: 'long' }).toUpperCase();
                    list.destroy_all_children();
                    const groups = agenda(d?.events ?? [], now, 8);
                    if (!groups.length) {
                        list.add_child(label(d?.hasCalendars === false ? _('No calendars') : _('No upcoming events'),
                            'kiwi-widget-caption kiwi-secondary-text'));
                        return;
                    }
                    for (const g of groups) {
                        list.add_child(label(dayTitle(g, _).toUpperCase(), 'kiwi-widget-footnote kiwi-widget-strong kiwi-secondary-text kiwi-widget-day-title'));
                        for (const e of g.events)
                            list.add_child(eventRow(e, _, false));
                    }
                },
            };
        }

        // Small and medium: the next event, large, with "In 25 min"
        const main = box('kiwi-widget-row', false, { x_expand: true, y_expand: true });
        root.add_child(main);
        const lead = box('kiwi-widget-column kiwi-widget-next', true, { x_expand: true, y_expand: true });
        main.add_child(lead);
        lead.add_child(spacer());
        const soon = label('', 'kiwi-widget-caption kiwi-widget-accent kiwi-widget-strong');
        const title = label('', 'kiwi-widget-headline');
        title.clutter_text.line_wrap = true;
        title.clutter_text.ellipsize = 3; // END
        const when = label('', 'kiwi-widget-caption kiwi-secondary-text');
        lead.add_child(soon);
        lead.add_child(title);
        lead.add_child(when);
        let rest = null;
        if (size === 'medium') {
            rest = box('kiwi-widget-events', true, { x_expand: true, y_expand: true });
            main.add_child(rest);
        }

        return {
            update(d) {
                const now = d?.now ?? new Date();
                weekday.text = now.toLocaleDateString([], { weekday: 'short' }).toUpperCase();
                date.text = String(now.getDate());
                const events = d?.events ?? [];
                const next = nextEvent(events, now);
                soon.visible = when.visible = !!next;
                if (!next) {
                    title.text = d?.hasCalendars === false ? _('No calendars') : _('No upcoming events');
                    title.add_style_class_name('kiwi-secondary-text');
                } else {
                    title.remove_style_class_name('kiwi-secondary-text');
                    title.text = next.summary || _('Untitled');
                    const inText = next.allDay ? '' : startsIn(next.date, now, _);
                    soon.text = inText || (next.today ? _('Today') : next.date.toLocaleDateString([], { weekday: 'long' }));
                    when.text = whenText(next, _);
                    view.actor.accessible_name = `${_('Up Next')}: ${title.text}, ${soon.text}`;
                }
                if (!rest)
                    return;
                rest.destroy_all_children();
                const after = upcomingEvents(events, now, 4).filter(e => e !== next && e.id !== next?.id).slice(0, 3);
                for (const e of after)
                    rest.add_child(eventRow(e, _, true));
                if (!after.length && next)
                    rest.add_child(label(_('Nothing else coming up'), 'kiwi-widget-caption kiwi-secondary-text'));
            },
        };
    },

    open() {
        openApp('org.gnome.Calendar.desktop');
    },
};
