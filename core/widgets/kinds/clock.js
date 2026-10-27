// SPDX-License-Identifier: GPL-3.0-or-later
// Clock: an analog or digital face, and the world clocks of GNOME Clocks (medium, large).

import Clutter from 'gi://Clutter';

import { handAngles, offsetLabel } from '../data.js';
import { N_, box, canvas, label, openApp, spacer } from './common.js';

function drawFace(cr, w, h, fg, hours, minutes, faint = false) {
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2;
    const { hour, minute } = handAngles(hours, minutes);
    // Face
    cr.setSourceRGBA(fg[0], fg[1], fg[2], faint ? 0.08 : 0.12);
    cr.arc(cx, cy, r, 0, 2 * Math.PI);
    cr.fill();
    // Hour ticks
    cr.setSourceRGBA(fg[0], fg[1], fg[2], 0.55);
    for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        const long = i % 3 === 0;
        cr.setLineWidth(Math.max(1, r * (long ? 0.05 : 0.025)));
        cr.moveTo(cx + Math.sin(a) * r * 0.8, cy - Math.cos(a) * r * 0.8);
        cr.lineTo(cx + Math.sin(a) * r * (long ? 0.66 : 0.72), cy - Math.cos(a) * r * (long ? 0.66 : 0.72));
        cr.stroke();
    }
    cr.setLineCap(1);
    const hand = (deg, len, width, rgba) => {
        const a = deg * Math.PI / 180;
        cr.setSourceRGBA(...rgba);
        cr.setLineWidth(width);
        cr.moveTo(cx, cy);
        cr.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len);
        cr.stroke();
    };
    hand(hour, r * 0.45, Math.max(2, r * 0.07), fg);
    hand(minute, r * 0.68, Math.max(1.5, r * 0.045), fg);
    cr.setSourceRGBA(1, 0.58, 0, 1);
    cr.arc(cx, cy, Math.max(2, r * 0.06), 0, 2 * Math.PI);
    cr.fill();
}

function timeText(dt, twelve) {
    return dt.format(twelve ? '%l:%M' : '%R').trim();
}

export default {
    id: 'clock',
    title: N_('Clock'),
    category: N_('Clock'),
    sizes: ['small', 'medium', 'large'],
    defaultSize: 'small',
    provider: 'time',

    build(view) {
        const _ = view._;
        const s = view.scale;
        const digital = view.config.face === 'digital';
        const root = view.content;
        let now = null;
        let clocks = [];
        let twelve = false;

        if (view.size === 'small') {
            if (digital) {
                const date = label('', 'kiwi-widget-caption kiwi-widget-accent');
                const time = label('', 'kiwi-widget-hero');
                root.add_child(date);
                root.add_child(spacer());
                root.add_child(time);
                return {
                    update(d) {
                        if (!d?.now)
                            return;
                        date.text = d.now.format('%a %e').replace(/\s+/g, ' ');
                        time.text = timeText(d.now, d.twelveHour);
                    },
                };
            }
            const size = Math.round(132 * s);
            const face = canvas(size, size, (cr, w, h, fg) => now && drawFace(cr, w, h, fg, now.get_hour(), now.get_minute()));
            face.x_align = face.y_align = Clutter.ActorAlign.CENTER;
            face.x_expand = face.y_expand = true;
            root.add_child(face);
            return {
                update(d) {
                    if (!d?.now)
                        return;
                    now = d.now;
                    view.actor.accessible_name = `${_('Clock')} ${timeText(now, d.twelveHour)}`;
                    face.queue_repaint();
                },
            };
        }

        // Medium and large: the local time, then a row (or grid) of world clocks
        const header = box('kiwi-widget-row');
        const time = label('', 'kiwi-widget-hero');
        const date = label('', 'kiwi-widget-caption');
        const left = box('kiwi-widget-column', true);
        left.add_child(time);
        left.add_child(date);
        header.add_child(left);
        root.add_child(header);
        root.add_child(spacer());
        const faces = box('kiwi-widget-clocks', view.size === 'large');
        root.add_child(faces);
        const max = 4;
        const faceSize = Math.round((view.size === 'large' ? 52 : 56) * s);
        const cells = [];
        for (let i = 0; i < max; i++) {
            const cell = box(view.size === 'large' ? 'kiwi-widget-row kiwi-widget-world' : 'kiwi-widget-column kiwi-widget-world',
                view.size !== 'large', { x_expand: true });
            const f = canvas(faceSize, faceSize, (cr, w, h, fg) => {
                const c = clocks[i];
                if (c)
                    drawFace(cr, w, h, fg, c.time.get_hour(), c.time.get_minute(), true);
            });
            const name = label('', 'kiwi-widget-caption');
            const off = label('', 'kiwi-widget-caption kiwi-widget-dim');
            const text = box('kiwi-widget-column', true);
            text.add_child(name);
            text.add_child(off);
            cell.add_child(f);
            cell.add_child(text);
            faces.add_child(cell);
            cells.push({ cell, f, name, off });
        }
        const empty = label(_('Add cities in Clocks'), 'kiwi-widget-caption kiwi-widget-dim');
        faces.add_child(empty);
        return {
            update(d) {
                if (!d?.now)
                    return;
                now = d.now;
                clocks = d.clocks ?? [];
                twelve = d.twelveHour;
                time.text = timeText(now, twelve);
                date.text = now.format('%A, %e %B').replace(/\s+/g, ' ');
                empty.visible = clocks.length === 0;
                cells.forEach((c, i) => {
                    const w = clocks[i];
                    c.cell.visible = !!w;
                    if (!w)
                        return;
                    c.name.text = w.name;
                    c.off.text = `${timeText(w.time, twelve)}  ${offsetLabel(w.time.get_utc_offset() / 1e6 - now.get_utc_offset() / 1e6, _)}`;
                    c.f.queue_repaint();
                });
            },
        };
    },

    open() {
        openApp('org.gnome.clocks.desktop');
    },

    options(view) {
        if (view.size !== 'small')
            return [];
        return [{
            label: view._('Digital'),
            active: view.config.face === 'digital',
            apply: () => ({ face: view.config.face === 'digital' ? 'analog' : 'digital' }),
        }];
    },
};
