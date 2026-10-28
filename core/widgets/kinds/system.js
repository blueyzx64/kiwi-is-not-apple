// SPDX-License-Identifier: GPL-3.0-or-later
// System: processor and memory use in the small size; the medium adds the home disk and the
// network; the large adds the CPU and network history (sampled only while visible).

import { formatBytes, formatRate, rateLevel } from '../data.js';
import { COLORS, N_, box, canvas, drawRing, label, openApp, spacer } from './common.js';

function drawHistory(cr, w, h, history, fg, color, level = v => v) {
    cr.setSourceRGBA(fg[0], fg[1], fg[2], 0.1);
    cr.rectangle(0, 0, w, h);
    cr.fill();
    if (history.length < 2)
        return;
    const step = w / 29;
    const x0 = w - (history.length - 1) * step;
    cr.moveTo(x0, h);
    history.forEach((v, i) => cr.lineTo(x0 + i * step, h - level(v) * h));
    cr.lineTo(w, h);
    cr.closePath();
    cr.setSourceRGBA(color[0], color[1], color[2], 0.35);
    cr.fillPreserve();
    cr.setSourceRGBA(...color);
    cr.setLineWidth(1.5);
    cr.stroke();
}

export default {
    id: 'system',
    title: N_('System'),
    category: N_('System'),
    sizes: ['small', 'medium', 'large'],
    defaultSize: 'small',
    provider: 'system',

    build(view) {
        const _ = view._;
        const s = view.scale;
        const root = view.content;
        const size = view.size;
        const state = { cpu: 0, mem: 0, disk: 0, net: 0, history: [], netHistory: [] };
        const ringSize = Math.round((size === 'small' ? 54 : 58) * s);
        const gauge = (title, key, color) => {
            const col = box('kiwi-widget-column kiwi-widget-gauge', true, { x_expand: true });
            const ring = canvas(ringSize, ringSize, (cr, w, h, fg) => drawRing(cr, w, h, state[key], color, fg, Math.max(3, 6 * s)));
            const value = label('', 'kiwi-widget-title kiwi-widget-tabular');
            col.add_child(ring);
            col.add_child(value);
            col.add_child(label(title, 'kiwi-widget-caption kiwi-widget-dim'));
            return { col, ring, value };
        };
        const gauges = { cpu: gauge(_('CPU'), 'cpu', COLORS.blue), mem: gauge(_('Memory'), 'mem', COLORS.green) };
        if (size !== 'small') {
            gauges.disk = gauge(_('Disk'), 'disk', COLORS.orange);
            gauges.net = gauge(_('Network'), 'net', COLORS.purple);
        }
        const row = box('kiwi-widget-row', false, { x_expand: true });
        for (const g of Object.values(gauges))
            row.add_child(g.col);

        const memText = label('', 'kiwi-widget-caption kiwi-widget-dim');
        const graphs = [];
        if (size === 'large') {
            root.add_child(row);
            const graph = (title, key, color, level) => {
                const col = box('kiwi-widget-column', true, { x_expand: true, y_expand: true });
                const head = box('kiwi-widget-row', false, { x_expand: true });
                head.add_child(label(title, 'kiwi-widget-caption kiwi-widget-dim'));
                head.add_child(spacer());
                const now = label('', 'kiwi-widget-caption kiwi-widget-tabular');
                head.add_child(now);
                col.add_child(head);
                const area = canvas(Math.round(330 * s), Math.round(70 * s),
                    (cr, w, h, fg) => drawHistory(cr, w, h, state[key], fg, color, level));
                col.add_child(area);
                graphs.push(area);
                root.add_child(col);
                return now;
            };
            gauges.cpuNow = graph(_('CPU history'), 'history', COLORS.blue);
            gauges.netNow = graph(_('Network history'), 'netHistory', COLORS.purple, rateLevel);
            root.add_child(memText);
        } else {
            root.add_child(spacer());
            root.add_child(row);
            root.add_child(spacer());
            root.add_child(memText);
        }

        return {
            update(d) {
                if (!d)
                    return;
                state.cpu = d.cpu ?? 0;
                state.history = d.history ?? [];
                state.netHistory = d.netHistory ?? [];
                state.mem = d.memory ? d.memory.used / d.memory.total : 0;
                state.disk = d.disk ? d.disk.used / d.disk.total : 0;
                const rate = (d.net?.rx ?? 0) + (d.net?.tx ?? 0);
                state.net = rateLevel(rate);
                gauges.cpu.value.text = `${Math.round(state.cpu * 100)}%`;
                gauges.mem.value.text = `${Math.round(state.mem * 100)}%`;
                if (gauges.disk) {
                    gauges.disk.value.text = d.disk ? `${Math.round(state.disk * 100)}%` : '–';
                    gauges.net.value.text = formatRate(rate);
                }
                if (gauges.cpuNow) {
                    gauges.cpuNow.text = `${Math.round(state.cpu * 100)}%`;
                    gauges.netNow.text = `↓ ${formatRate(d.net?.rx ?? 0)}  ↑ ${formatRate(d.net?.tx ?? 0)}`;
                }
                const parts = [];
                if (d.memory)
                    parts.push(`${_('Memory')} ${formatBytes(d.memory.used)} / ${formatBytes(d.memory.total)}`);
                if (d.disk && size !== 'small')
                    parts.push(`${_('Disk')} ${formatBytes(d.disk.used)} / ${formatBytes(d.disk.total)}`);
                memText.text = size === 'small' && d.memory ? `${formatBytes(d.memory.used)} / ${formatBytes(d.memory.total)}` : parts.join('   ');
                for (const g of Object.values(gauges))
                    g.ring?.queue_repaint();
                for (const g of graphs)
                    g.queue_repaint();
            },
        };
    },

    open() {
        openApp('org.gnome.SystemMonitor.desktop', 'gnome-system-monitor.desktop');
    },
};
