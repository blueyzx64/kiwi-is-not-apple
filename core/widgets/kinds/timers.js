// SPDX-License-Identifier: GPL-3.0-or-later
// Timers (macOS Clock's timer widget, interactive as in Sonoma): Kiwi's own countdown timers
// (core/timers.js, the ones the notch shows) with a ring for the time left, pause / resume and
// stop in place, and preset buttons that start a new one.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { TIMER_PRESETS, durationName, formatCountdown } from '../data.js';
import { COLORS, N_, box, canvas, drawRing, iconButton, label, spacer } from './common.js';

const SHOWN = { small: 1, medium: 2, large: 4 };
const PRESETS = { small: [1, 5, 10, 15], medium: TIMER_PRESETS, large: TIMER_PRESETS };

const left = (t, now) => (t.state === 'running' ? Math.max(0, t.endsAt - now)
    : t.state === 'paused' ? Math.max(0, t.remainingMs) : 0);

export default {
    id: 'timers',
    title: N_('Timers'),
    category: N_('Clock'),
    sizes: ['small', 'medium', 'large'],
    defaultSize: 'small',
    provider: 'timers',

    build(view) {
        const _ = view._;
        const root = view.content;
        const size = view.size;
        const s = view.scale;
        const act = fn => () => {
            const p = view.provider;
            if (p)
                fn(p);
        };

        const header = box('kiwi-widget-row', false, { x_expand: true });
        header.add_child(label(_('Timers'), 'kiwi-widget-caps kiwi-widget-accent-orange'));
        root.add_child(header);

        // Presets: a grid of round buttons ("5 min")
        const presets = new St.Widget({
            style_class: 'kiwi-widget-presets',
            layout_manager: new Clutter.GridLayout({ column_homogeneous: true, row_homogeneous: true, column_spacing: 6, row_spacing: 6 }),
            x_expand: true,
        });
        const list = PRESETS[size];
        const perRow = size === 'small' ? 2 : size === 'medium' ? 3 : 6;
        list.forEach((m, i) => {
            const b = iconButton({
                name: _('Start a %d minute timer').replace('%d', String(m)),
                text: _('%d min').replace('%d', String(m)),
                styleClass: 'kiwi-widget-preset',
                onClick: act(p => p.startTimer(m)),
            });
            b.x_expand = true;
            presets.layout_manager.attach(b, i % perRow, Math.floor(i / perRow), 1, 1);
        });

        // Timer rows: ring, time left, name, pause/resume and stop
        const rows = [];
        const holder = box('kiwi-widget-column kiwi-widget-timers', true, { x_expand: true, y_expand: size !== 'small' });
        const ringSize = Math.round((size === 'small' ? 64 : 40) * s);
        for (let i = 0; i < SHOWN[size]; i++) {
            const state = { fraction: 0, color: COLORS.orange };
            const ring = canvas(ringSize, ringSize, (cr, w, h, fg) => drawRing(cr, w, h, state.fraction, state.color, fg, Math.max(3, 5 * s)));
            const time = label('', size === 'small' ? 'kiwi-widget-headline kiwi-widget-tabular' : 'kiwi-text-headline kiwi-widget-tabular');
            const name = label('', 'kiwi-widget-footnote kiwi-secondary-text');
            const toggle = iconButton({ name: _('Pause'), iconName: 'media-playback-pause-symbolic', size: Math.round(14 * s), onClick: () => {} });
            const stop = iconButton({ name: _('Stop'), iconName: 'window-close-symbolic', size: Math.round(14 * s), onClick: () => {} });
            const rec = { state, ring, time, name, toggle, stop, timer: null };
            toggle.connect('clicked', act(p => {
                const t = rec.timer;
                if (t?.state === 'running')
                    p.pause(t.id);
                else if (t?.state === 'paused')
                    p.resume(t.id);
            }));
            stop.connect('clicked', act(p => rec.timer && p.cancel(rec.timer.id)));
            const buttons = box('kiwi-widget-controls', false, { y_align: Clutter.ActorAlign.CENTER });
            buttons.add_child(toggle);
            buttons.add_child(stop);
            let row;
            if (size === 'small') {
                // The ring with the time beside it, the name and the buttons under
                row = box('kiwi-widget-column kiwi-widget-timer', true, { x_expand: true, y_expand: true });
                const top = box('kiwi-widget-row', false, { x_expand: true });
                top.add_child(ring);
                const text = box('kiwi-widget-column', true, { x_expand: true, y_align: Clutter.ActorAlign.CENTER });
                text.add_child(time);
                text.add_child(name);
                top.add_child(text);
                row.add_child(top);
                row.add_child(spacer());
                buttons.x_align = Clutter.ActorAlign.END;
                row.add_child(buttons);
            } else {
                row = box('kiwi-widget-row kiwi-widget-timer', false, { x_expand: true });
                row.add_child(ring);
                const text = box('kiwi-widget-column', true, { x_expand: true, y_align: Clutter.ActorAlign.CENTER });
                text.add_child(time);
                text.add_child(name);
                row.add_child(text);
                row.add_child(buttons);
            }
            rec.row = row;
            holder.add_child(row);
            rows.push(rec);
        }
        const empty = label('', 'kiwi-widget-caption kiwi-secondary-text');

        if (size === 'small') {
            root.add_child(holder);
            root.add_child(spacer());
            root.add_child(presets);
        } else if (size === 'medium') {
            const line = box('kiwi-widget-row', false, { x_expand: true, y_expand: true });
            presets.x_expand = false;
            presets.y_align = Clutter.ActorAlign.CENTER;
            presets.width = Math.round(160 * s);
            line.add_child(presets);
            const right = box('kiwi-widget-column', true, { x_expand: true });
            right.add_child(holder);
            right.add_child(empty);
            line.add_child(right);
            root.add_child(line);
        } else {
            root.add_child(presets);
            root.add_child(holder);
            root.add_child(empty);
        }

        return {
            update(d) {
                // Running ones first, then paused, then finished; the newest first within each
                const rank = { running: 0, paused: 1, finished: 2 };
                const timers = [...(d?.timers ?? [])].reverse()
                    .sort((a, b) => (rank[a.state] ?? 3) - (rank[b.state] ?? 3)).slice(0, SHOWN[size]);
                const now = d?.now ?? Date.now();
                const any = timers.length > 0;
                presets.reactive = !!d?.available;
                if (size === 'small') {
                    holder.visible = any;
                    presets.visible = !any;
                }
                empty.visible = !any;
                empty.text = d?.available === false ? _('Timers are not available') : _('No timers');
                rows.forEach((r, i) => {
                    const t = timers[i];
                    r.row.visible = !!t;
                    r.timer = t ?? null;
                    if (!t)
                        return;
                    const ms = left(t, now);
                    const done = t.state === 'finished';
                    r.state.fraction = done ? 1 : t.durationMs ? ms / t.durationMs : 0;
                    r.state.color = done ? COLORS.green : t.state === 'paused' ? COLORS.yellow : COLORS.orange;
                    r.time.text = done ? _('Done') : formatCountdown(ms);
                    r.name.text = t.label || durationName(t.durationMs, _);
                    r.toggle.visible = !done;
                    const running = t.state === 'running';
                    r.toggle.child.icon_name = running ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
                    r.toggle.accessible_name = running ? _('Pause') : _('Resume');
                    r.stop.accessible_name = done ? _('Dismiss') : _('Stop');
                    r.ring.queue_repaint();
                });
                view.actor.accessible_name = any ? `${_('Timers')}: ${rows[0].time.text}` : _('Timers');
            },
        };
    },
};
