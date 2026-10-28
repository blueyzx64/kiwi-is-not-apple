// SPDX-License-Identifier: GPL-3.0-or-later
// The widget chooser of a panel ("Edit Widgets…" in the Notification Center and the notch's
// Widgets tab): one row per kind with its sizes as small toggle pills. A pill that is on shows
// the widget at that size; clicking it again hides the widget; another pill changes the size
// in place. New widgets go to the end of the list. Design-system rows and pills
// (docs/architecture/design-system.md); the list itself is plain data (model.js setWidget).
//
//   const actor = buildChooser({
//       _, entries: [{kind, title}], list, sizesFor: kind => [...],
//       canUse: (kind, size) => true, onChange: list => save(list), columns: 1,
//   });

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as A11y from '../../lib/a11y.js';
import { setWidget } from './model.js';

const SHORT = { small: 'S', medium: 'M', large: 'L', extraLarge: 'XL' };

/**
 * @param {object} o
 * @param {(s: string) => string} o._ gettext
 * @param {{kind: string, title: string}[]} o.entries every kind the surface offers, in order
 *   (titles untranslated: the chooser translates them)
 * @param {{kind: string, size: string}[]} o.list what the surface shows now
 * @param {(kind: string) => string[]} o.sizesFor the sizes the surface allows for a kind
 * @param {(kind: string, size: string) => boolean} [o.canUse] false: that pill is disabled
 *   (the notch's strip would overflow)
 * @param {(list: object[]) => void} o.onChange the new list (the caller stores it)
 * @param {number} [o.columns] rows side by side
 * @returns {St.Widget}
 */
export function buildChooser({ _, entries, list, sizesFor, canUse = () => true, onChange, columns = 1 }) {
    const layout = new Clutter.GridLayout({ column_homogeneous: true, column_spacing: 8, row_spacing: 2 });
    const grid = new St.Widget({ style_class: 'kiwi-widget-chooser', layout_manager: layout, x_expand: true });
    const names = { small: _('Small'), medium: _('Medium'), large: _('Large'), extraLarge: _('Extra Large') };
    entries.forEach((entry, i) => {
        const current = list.find(w => w.kind === entry.kind)?.size ?? null;
        const title = _(entry.title);
        const row = new St.BoxLayout({
            style_class: `kiwi-widget-chooser-row kiwi-row${current ? ' kiwi-widget-chooser-on' : ''}`,
            reactive: true, track_hover: true, x_expand: true,
        });
        row.add_child(new St.Label({
            text: title, x_expand: true, y_align: Clutter.ActorAlign.CENTER,
            style_class: `kiwi-widget-chooser-title kiwi-text-body${current ? '' : ' kiwi-secondary-text'}`,
        }));
        for (const size of sizesFor(entry.kind)) {
            const on = size === current;
            const usable = on || canUse(entry.kind, size);
            const b = new St.Button({
                style_class: 'kiwi-widget-chooser-size kiwi-pill-button',
                label: SHORT[size] ?? size,
                accessible_name: `${title}, ${names[size] ?? size}`,
                accessible_role: A11y.Role.TOGGLE_BUTTON,
                toggle_mode: true,
                checked: on,
                can_focus: usable,
                reactive: usable,
                opacity: usable ? 255 : 90,
                y_align: Clutter.ActorAlign.CENTER,
            });
            b.connect('clicked', () => onChange(setWidget(list, entry.kind, on ? null : size)));
            row.add_child(b);
        }
        layout.attach(row, i % columns, Math.floor(i / columns), 1, 1);
    });
    return grid;
}
