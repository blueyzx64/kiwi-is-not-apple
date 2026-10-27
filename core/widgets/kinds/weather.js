// SPDX-License-Identifier: GPL-3.0-or-later
// Weather: the Shell's weather (GNOME Weather's location); medium and large add the coming
// hours.

import GLib from 'gi://GLib';
import Pango from 'gi://Pango';

import { N_, box, icon, label, openApp, spacer } from './common.js';

const STATES = {
    'unavailable': N_('Install Weather to see the weather'),
    'no-location': N_('Choose a location in Weather'),
    'loading': N_('Loading…'),
    'offline': N_('Weather is not available'),
};

export default {
    id: 'weather',
    title: N_('Weather'),
    category: N_('Weather'),
    sizes: ['small', 'medium', 'large'],
    defaultSize: 'small',
    provider: 'weather',

    build(view) {
        const _ = view._;
        const s = view.scale;
        const root = view.content;
        const top = box('kiwi-widget-row', false, { x_expand: true });
        const left = box('kiwi-widget-column', true, { x_expand: true });
        const place = label('', 'kiwi-widget-body kiwi-widget-strong');
        const temp = label('', 'kiwi-widget-hero');
        left.add_child(place);
        left.add_child(temp);
        top.add_child(left);
        const big = icon('weather-few-clouds-symbolic', Math.round(view.size === 'small' ? 30 * s : 40 * s));
        top.add_child(big);
        root.add_child(top);
        root.add_child(spacer());
        const summary = label('', 'kiwi-widget-caption');
        root.add_child(summary);
        const hours = view.size === 'small' ? null : box('kiwi-widget-forecast', false, { x_expand: true });
        if (hours)
            root.add_child(hours);
        const message = label('', 'kiwi-widget-caption kiwi-widget-dim', { x_expand: true });
        message.clutter_text.line_wrap = true;
        message.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        root.add_child(message);

        return {
            update(d) {
                const ready = d?.state === 'ready';
                summary.visible = ready;
                if (hours)
                    hours.visible = ready;
                message.visible = !ready;
                if (!ready) {
                    // A quiet placeholder in the widget's own layout, and why there is no data
                    place.text = _('Weather');
                    temp.text = '--°';
                    big.icon_name = 'weather-few-clouds-symbolic';
                    big.opacity = 128;
                    message.text = _(STATES[d?.state ?? 'loading'] ?? STATES.loading);
                    return;
                }
                big.opacity = 255;
                place.text = d.location;
                temp.text = d.temp;
                big.icon_name = d.icon;
                summary.text = d.summary;
                if (!hours)
                    return;
                hours.destroy_all_children();
                const n = view.size === 'large' ? 5 : 4;
                for (const f of d.forecasts.slice(0, n)) {
                    const col = box('kiwi-widget-column kiwi-widget-hour', true, { x_expand: true });
                    const t = GLib.DateTime.new_from_unix_local(f.time);
                    col.add_child(label(t.format('%R'), 'kiwi-widget-caption kiwi-widget-dim'));
                    col.add_child(icon(f.icon, Math.round(18 * s)));
                    col.add_child(label(f.temp, 'kiwi-widget-caption'));
                    hours.add_child(col);
                }
            },
        };
    },

    open(view) {
        if (view.provider?.open)
            view.provider.open();
        else
            openApp('org.gnome.Weather.desktop');
    },
};
