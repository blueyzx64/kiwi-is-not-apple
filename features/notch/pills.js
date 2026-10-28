// SPDX-License-Identifier: GPL-3.0-or-later
// What each live activity looks like. describe() turns an activity (stateMachine/model) into
// title, detail and actions; its tint, icon well and accessories come from the one table in
// model.js (presentation(kind)), so every kind goes through the same templates:
//   pill()  the compact 32px pill: [icon well] [title] [trailing slot: value, ring or action]
//   row()   a card in the Now tab: [icon well] [title / subtitle] [actions or ring]
//   iconWell()  the fixed square, circle or rounded square every glyph sits in (also used by
//           the view for notifications)
// Media has its own pill (art and waveform), built by the view on the same well size.

import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import { label, icon, themed, themedAny, button, setText, dismissButton } from './ui.js';
import {
    formatCountdown, formatElapsed, formatBytes, minutesUntil, batteryIconNames, presentation,
    wellRadius, WELL, TRAILING_W, canDismiss,
} from './model.js';

const monoNow = () => Math.floor(GLib.get_monotonic_time() / 1000);
const RING = 18;          // the progress ring, px (fits the trailing slot and a row)
const RING_LINE = 2.5;

/**
 * @param {{kind: string, data: object}} activity
 * @param {function(string): string} _
 * @returns {{icon: string|string[]|null, tint: string, shape: string, compact: string, row: string,
 *   title: string, detail: string|(() => string), fraction: number|null,
 *   actions: Array<{id: string, label: string, iconName?: string}>}}
 *   detail as a function: it changes every second (countdowns), the view refreshes it
 */
export function describe(activity, _) {
    const d = activity.data ?? {};
    const pres = presentation(activity.kind);
    const out = (fields, actions = []) => {
        let iconName = pres.icon;
        if (iconName === 'battery')
            iconName = batteryIconNames(d.percent, activity.kind !== 'low-battery' && activity.kind !== 'unplugged');
        else if (iconName === 'data')
            iconName = d.icon || 'weather-clear-night-symbolic';
        return { ...pres, icon: iconName, fraction: null, detail: '', ...fields, actions };
    };
    const pct = Number.isFinite(d.percent) ? `${Math.round(d.percent)}%` : '';
    switch (activity.kind) {
    case 'timer': {
        const left = () => (d.state === 'paused' ? d.remainingMs : Math.max(0, d.endsAt - Date.now()));
        return out({
            title: d.label || _('Timer'),
            detail: d.state === 'paused' ? formatCountdown(d.remainingMs) : () => formatCountdown(left()),
        }, [
            d.state === 'paused'
                ? { id: 'resume', label: _('Resume'), iconName: 'media-playback-start-symbolic' }
                : { id: 'pause', label: _('Pause'), iconName: 'media-playback-pause-symbolic' },
            { id: 'cancel', label: _('Cancel'), iconName: 'window-close-symbolic' },
        ]);
    }
    case 'timer-done':
        return out({ title: d.label || _('Timer'), detail: _('Done') });
    case 'recording':
        return out({ title: _('Recording'), detail: () => formatElapsed(monoNow() - d.startedAt) },
            [{ id: 'stop', label: _('Stop Recording'), iconName: 'media-playback-stop-symbolic' }]);
    case 'charging-started':
    case 'charging':
        return out({ title: _('Charging'), detail: pct });
    case 'charged':
        return out({ title: _('Charged'), detail: pct });
    case 'unplugged':
        return out({ title: _('On Battery'), detail: pct });
    case 'low-battery':
        return out({ title: _('Low Battery'), detail: pct });
    case 'low-power':
        return out({ title: _('Low Power Mode'), detail: d.active ? _('On') : _('Off') });
    case 'focus':
        return out({ title: d.name || _('Focus'), detail: d.active ? _('On') : _('Off') });
    case 'headphones-connected':
    case 'headphones':
        return out({
            title: d.name || _('Headphones'),
            detail: Number.isFinite(d.battery) ? `${Math.round(d.battery)}%` : _('Connected'),
        });
    case 'download': {
        const known = d.fraction !== null && d.fraction !== undefined;
        return out({
            title: d.count > 1 ? _('%d downloads').format(d.count) : d.label,
            detail: known ? `${Math.round(d.fraction * 100)}%` : formatBytes(d.bytes),
            fraction: known ? d.fraction : null,
        });
    }
    case 'download-done':
        return out({ title: d.label || _('Download'), detail: _('Done') });
    case 'event-soon':
    case 'event': {
        const when = () => {
            if (d.start <= Date.now())
                return _('Now');
            const m = minutesUntil(d.start, Date.now());
            if (m < 60)
                return _('in %d min').format(m);
            return GLib.DateTime.new_from_unix_local(Math.floor(d.start / 1000)).format('%H:%M');
        };
        return out({ title: d.summary || _('Event'), detail: when });
    }
    case 'code':
        return out({ title: _('Code %s').format(d.code), detail: d.app ?? '' },
            [{ id: 'copy', label: _('Copy'), iconName: 'edit-copy-symbolic' }]);
    default:
        return out({ title: '' });
    }
}

/**
 * The fixed shape a glyph sits in: `template` ('compact' | 'row' | 'banner') sets the well's
 * size and the glyph's (model.WELL); the shape and tint come from presentation(kind). The
 * glyph is centred at a fixed inset and the well clips, so nothing ever spills out of it.
 * @param {Gio.Icon} gicon
 * @param {{shape: string, tint: string}} look
 * @param {'compact'|'row'|'banner'} template
 * @param {{fill?: boolean}} [opts] fill: a full-colour app icon fills the well (no tint)
 */
export function iconWell(gicon, look, template, { fill = false } = {}) {
    const { size, glyph } = WELL[template];
    const well = new St.Bin({
        style_class: `kiwi-notch-well kiwi-notch-well-${look.tint}${fill ? ' kiwi-notch-well-app' : ''}`,
        style: `border-radius: ${wellRadius(look.shape, size)}px;`,
        width: size, height: size,
        x_expand: false, y_expand: false,
        x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
        clip_to_allocation: true,
    });
    const inner = fill ? size : glyph;
    const i = icon(gicon, inner, fill ? 'kiwi-notch-well-icon' : `kiwi-notch-well-glyph kiwi-notch-tint-${look.tint}`);
    i.x_align = Clutter.ActorAlign.CENTER;
    well.set_child(i);
    return well;
}

const gIconOf = desc => (Array.isArray(desc.icon) ? themedAny(desc.icon) : themed(desc.icon));

// A detail label that a function keeps current: refreshed by the view's 1 s tick while shown
function detailLabel(desc, styleClass, live) {
    const l = label('', styleClass);
    if (typeof desc.detail === 'function') {
        const fn = desc.detail;
        live.push(() => setText(l, fn()));
        l.text = fn();
    } else {
        l.text = desc.detail ?? '';
    }
    return l;
}

/** A progress ring (0..1) in the tint's colour, drawn once per change with Cairo. */
function ring(fraction, tint) {
    const area = new St.DrawingArea({
        style_class: `kiwi-notch-ring kiwi-notch-tint-${tint}`,
        width: RING, height: RING, y_align: Clutter.ActorAlign.CENTER,
    });
    area.connect('repaint', () => {
        const cr = area.get_context();
        try {
            const [w, h] = area.get_surface_size();
            const c = area.get_theme_node().get_foreground_color();
            const r = Math.min(w, h) / 2 - RING_LINE / 2;
            cr.setLineWidth(RING_LINE);
            cr.setLineCap(Cairo.LineCap.ROUND);
            cr.setSourceRGBA(1, 1, 1, 0.2);
            cr.arc(w / 2, h / 2, r, 0, 2 * Math.PI);
            cr.stroke();
            const f = Math.max(0, Math.min(1, fraction));
            if (f > 0) {
                cr.setSourceRGBA(c.red / 255, c.green / 255, c.blue / 255, 1);
                cr.arc(w / 2, h / 2, r, -Math.PI / 2, -Math.PI / 2 + f * 2 * Math.PI);
                cr.stroke();
            }
        } finally {
            cr.$dispose();
        }
    });
    return area;
}

/**
 * The compact pill for a non-media activity.
 * @param {object} activity
 * @param {{_: Function, live: Function[], onAction: (activity, id) => void}} env
 */
export function pill(activity, env) {
    const desc = describe(activity, env._);
    const row = new St.BoxLayout({ style_class: `kiwi-notch-row kiwi-notch-activity kiwi-notch-pill-${activity.kind}` });
    row.add_child(iconWell(gIconOf(desc), desc, 'compact'));
    row.add_child(label(desc.title,
        `kiwi-notch-pill-title${activity.kind === 'code' ? ' kiwi-notch-code' : ''}`, { x_expand: true }));

    // One trailing accessory, in a slot of fixed width, right-aligned
    const slot = trailingSlot();
    const main = desc.actions.find(a => a.id === 'copy');
    let child;
    if (desc.compact === 'action' && main) {
        child = button({
            styleClass: `kiwi-notch-pill-action kiwi-notch-pill-action-${main.id}`,
            text: main.label, accessibleName: main.label, size: 12,
            onClick: () => env.onAction(activity, main.id),
        });
    } else if (desc.compact === 'ring' && desc.fraction !== null) {
        child = ring(desc.fraction, desc.tint);
    } else if (desc.compact !== 'none') {
        child = detailLabel(desc, `kiwi-notch-value kiwi-notch-tint-${desc.tint}`, env.live);
    }
    if (child)
        slot.kiwiSet(child);
    row.add_child(slot);
    return row;
}

/**
 * The compact template's trailing slot: TRAILING_W wide, its one child pushed to the end (a
 * value, a ring, an action or a count), so values line up on the right edge whatever their width.
 * @returns {St.BoxLayout} with kiwiSet(child)
 */
export function trailingSlot() {
    const slot = new St.BoxLayout({ style_class: 'kiwi-notch-trailing', width: TRAILING_W, y_align: Clutter.ActorAlign.CENTER });
    slot.add_child(new St.Widget({ x_expand: true }));
    slot.kiwiSet = child => {
        child.y_align = Clutter.ActorAlign.CENTER;
        slot.add_child(child);
    };
    return slot;
}

/**
 * One card of the Now tab's list. A dismissable kind (model.js canDismiss) gets the × on hover.
 * @param {object} activity
 * @param {{_: Function, live: Function[], onAction: Function, onDismiss?: Function}} env
 */
export function row(activity, env) {
    const desc = describe(activity, env._);
    const box = new St.BoxLayout({ style_class: 'kiwi-notch-card-row kiwi-notch-activity-row kiwi-row', x_expand: true });
    box.add_child(iconWell(gIconOf(desc), desc, 'row'));
    const text = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER });
    text.add_child(label(desc.title, 'kiwi-notch-recent-title'));
    text.add_child(detailLabel(desc, 'kiwi-notch-recent-sub kiwi-secondary-text', env.live));
    box.add_child(text);
    if (desc.row === 'ring' && desc.fraction !== null)
        box.add_child(ring(desc.fraction, desc.tint));
    if (desc.row === 'action') {
        for (const a of desc.actions) {
            box.add_child(button({
                styleClass: 'kiwi-notch-row-action kiwi-toolbar-button',
                iconName: a.iconName,
                accessibleName: a.label,
                size: 14,
                onClick: () => env.onAction(activity, a.id),
            }));
        }
    }
    if (env.onDismiss && canDismiss(activity.kind))
        box.add_child(dismissButton(env._('Dismiss'), () => env.onDismiss(activity), box));
    return box;
}

/**
 * How often a pill's text changes while shown (ms), or null when it never does: countdowns
 * and elapsed time every second, "in 12 min" twice a minute.
 */
export function tickMs(activity) {
    if (activity.kind === 'recording' || (activity.kind === 'timer' && activity.data?.state === 'running'))
        return 1000;
    if (activity.kind === 'event-soon')
        return 30000;
    return null;
}
