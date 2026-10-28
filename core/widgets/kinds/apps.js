// SPDX-License-Identifier: GPL-3.0-or-later
// Favorites: your favourite apps (the dock's) as a grid of icons that launch in place, as the
// macOS Shortcuts widget does with shortcuts. With no favourites, the most used apps.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { TILE_GRID } from '../data.js';
import { N_, label } from './common.js';

const ICON = { small: 52, medium: 44, large: 48, extraLarge: 48 };

export default {
    id: 'favorite-apps',
    title: N_('Favorites'),
    category: N_('Shortcuts'),
    sizes: ['small', 'medium', 'large', 'extraLarge'],
    defaultSize: 'medium',
    provider: 'apps',

    build(view) {
        const _ = view._;
        const root = view.content;
        const { cols, rows } = TILE_GRID[view.size];
        const names = view.size !== 'small';
        const iconSize = Math.round(ICON[view.size] * view.scale);
        const grid = new St.Widget({
            style_class: 'kiwi-widget-apps',
            layout_manager: new Clutter.GridLayout({ column_homogeneous: true, row_homogeneous: true }),
            x_expand: true,
            y_expand: true,
        });
        root.add_child(grid);
        const empty = label('', 'kiwi-widget-caption kiwi-secondary-text');
        root.add_child(empty);
        let shown = '';

        return {
            update(d) {
                const apps = (d?.apps ?? []).slice(0, cols * rows);
                const key = apps.map(a => a.get_id()).join(' ');
                empty.visible = apps.length === 0;
                empty.text = d ? _('No favorite apps') : '';
                if (key === shown)
                    return;
                shown = key;
                grid.destroy_all_children();
                apps.forEach((app, i) => {
                    const tile = new St.BoxLayout({
                        style_class: 'kiwi-widget-app',
                        orientation: Clutter.Orientation.VERTICAL,
                        x_align: Clutter.ActorAlign.CENTER,
                    });
                    const ic = app.create_icon_texture(iconSize);
                    ic.x_align = Clutter.ActorAlign.CENTER;
                    tile.add_child(ic);
                    if (names) {
                        const n = label(app.get_name(), 'kiwi-widget-footnote kiwi-widget-app-name', { x_align: Clutter.ActorAlign.CENTER });
                        tile.add_child(n);
                    }
                    const button = new St.Button({
                        style_class: 'kiwi-widget-app-button',
                        child: tile,
                        accessible_name: app.get_name(),
                        can_focus: true,
                        x_align: Clutter.ActorAlign.CENTER,
                        y_align: Clutter.ActorAlign.CENTER,
                    });
                    button.connect('clicked', () => app.activate());
                    grid.layout_manager.attach(button, i % cols, Math.floor(i / cols), 1, 1);
                });
            },
        };
    },
};
