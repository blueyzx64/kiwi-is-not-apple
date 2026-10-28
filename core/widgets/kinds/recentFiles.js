// SPDX-License-Identifier: GPL-3.0-or-later
// Recent Files: the files you opened last (recently-used.xbel, read only:
// core/widgets/providers/recent.js), each one a button that opens it. Small lists three,
// medium six in two columns, large eight with when you used them.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { timeAgo } from '../data.js';
import { N_, box, icon, label, openApp } from './common.js';

const ROWS = { small: 3, medium: 6, large: 8 };
const COLUMNS = { small: 1, medium: 2, large: 1 };

function fileIcon(f, size) {
    const gicon = f.dir ? null : Gio.content_type_get_symbolic_icon(Gio.content_type_from_mime_type(f.mime) ?? f.mime);
    const i = icon(f.dir ? 'folder-symbolic' : null, size, 'kiwi-widget-icon kiwi-widget-file-icon');
    if (gicon)
        i.gicon = gicon;
    return i;
}

export default {
    id: 'recent-files',
    title: N_('Recent Files'),
    category: N_('Files'),
    sizes: ['small', 'medium', 'large'],
    defaultSize: 'medium',
    provider: 'recent',

    build(view) {
        const _ = view._;
        const root = view.content;
        const size = view.size;
        const s = view.scale;

        const header = box('kiwi-widget-row', false, { x_expand: true });
        header.add_child(icon('document-open-recent-symbolic', Math.round(14 * s), 'kiwi-widget-icon kiwi-widget-accent-blue'));
        header.add_child(label(_('Recents'), 'kiwi-widget-title kiwi-widget-accent-blue'));
        root.add_child(header);

        const columns = COLUMNS[size];
        const per = Math.ceil(ROWS[size] / columns);
        const grid = new St.Widget({
            layout_manager: new Clutter.GridLayout({ column_homogeneous: true, column_spacing: 8 }),
            x_expand: true,
            y_expand: true,
        });
        root.add_child(grid);
        const empty = label('', 'kiwi-widget-caption kiwi-widget-dim');
        root.add_child(empty);

        return {
            update(d) {
                grid.destroy_all_children();
                const files = (d?.files ?? []).slice(0, ROWS[size]);
                empty.visible = files.length === 0;
                empty.text = d?.state === 'ready' ? _('No recent files') : '';
                const now = d?.now ?? Date.now();
                files.forEach((f, i) => {
                    const row = box('kiwi-widget-row kiwi-widget-file', false, { x_expand: true });
                    row.add_child(fileIcon(f, Math.round(16 * s)));
                    const name = label(f.name, 'kiwi-widget-body', { x_expand: true, y_align: Clutter.ActorAlign.CENTER });
                    name.clutter_text.ellipsize = 2; // MIDDLE: keep the extension
                    row.add_child(name);
                    if (size === 'large') {
                        const ago = timeAgo(f.time, now, _) || new Date(f.time).toLocaleDateString([], { day: 'numeric', month: 'short' });
                        row.add_child(label(ago, 'kiwi-widget-footnote kiwi-widget-dim', { y_align: Clutter.ActorAlign.CENTER }));
                    }
                    const button = new St.Button({
                        style_class: 'kiwi-widget-file-button',
                        child: row,
                        accessible_name: `${_('Open')} ${f.name}`,
                        can_focus: true,
                        x_expand: true,
                    });
                    button.connect('clicked', () => view.provider?.open(f.uri));
                    grid.layout_manager.attach(button, Math.floor(i / per), i % per, 1, 1);
                });
            },
        };
    },

    open() {
        openApp('org.gnome.Nautilus.desktop');
    },
};
