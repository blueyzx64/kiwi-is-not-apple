// SPDX-License-Identifier: GPL-3.0-or-later
// Photos (macOS's "Featured Photo"): a picture from the Pictures folder, edge to edge, a new
// one every hour (or day). It is decoded at the widget's own size in the probe process
// (core/widgets/providers/photos.js), never on the Shell's main loop; a click opens it.

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import St from 'gi://St';

import { pickPhoto } from '../data.js';
import { pixelSize } from '../view.js';
import { N_, icon, label, openApp } from './common.js';

const TRIES = 3;

export default {
    id: 'photos',
    title: N_('Photos'),
    category: N_('Photos'),
    sizes: ['small', 'medium', 'large', 'extraLarge'],
    defaultSize: 'small',
    provider: 'photos',
    bleed: true,

    build(view) {
        const _ = view._;
        const root = view.content;
        const { width, height } = pixelSize(view.size, view.scale);
        const picture = new Clutter.Actor({ width, height, visible: false });
        root.add_child(picture);
        const empty = new St.BoxLayout({
            style_class: 'kiwi-widget-photos-empty',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const glyph = icon('image-x-generic-symbolic', Math.round(32 * view.scale));
        glyph.x_align = Clutter.ActorAlign.CENTER;
        empty.add_child(glyph);
        const note = label('', 'kiwi-widget-caption kiwi-secondary-text', { x_align: Clutter.ActorAlign.CENTER });
        note.clutter_text.line_wrap = true;
        note.clutter_text.line_alignment = 2; // CENTER
        empty.add_child(note);
        root.add_child(empty);

        let cancel = null;
        let shownKey = '';
        view.photoPath = null;

        const show = (path, image) => {
            picture.content = image;
            picture.visible = true;
            empty.visible = false;
            view.photoPath = path;
            const name = Gio.File.new_for_path(path).get_basename();
            view.actor.accessible_name = `${_('Photos')}: ${name}`;
        };

        const load = async (d, attempt) => {
            const provider = view.provider;
            const slot = view.config.interval === 'daily' ? d.day : d.hour;
            const index = pickPhoto(d.count, slot, (view.config.shuffle ?? 0) + attempt);
            const path = provider?.path(index);
            if (!path)
                return;
            const key = `${path} ${width}x${height}`;
            if (key === shownKey)
                return;
            cancel?.cancel();
            const mine = cancel = new Gio.Cancellable();
            try {
                const px = await provider.decode(path, width, height, Math.round(view.radius), mine);
                if (mine.is_cancelled())
                    return;
                const image = St.ImageContent.new_with_preferred_size(px.width, px.height);
                const context = global.stage.context.get_backend().get_cogl_context();
                image.set_bytes(context, px.bytes, Cogl.PixelFormat.RGBA_8888, px.width, px.height, px.rowstride);
                shownKey = key;
                show(path, image);
            } catch (e) {
                if (mine.is_cancelled())
                    return;
                // A format GdkPixbuf cannot read, a file that went away: try another one
                console.debug(`[Kiwi] photos: skipped ${path}: ${e.message}`);
                if (attempt + 1 < TRIES && d.count > 1)
                    load(d, attempt + 1);
            }
        };

        return {
            update(d) {
                const ready = d?.state === 'ready' && d.count > 0;
                if (!ready) {
                    picture.visible = false;
                    empty.visible = true;
                    note.text = d?.state === 'empty' ? _('Add photos to your Pictures folder') : '';
                    return;
                }
                load(d, 0);
            },
            destroy() {
                cancel?.cancel();
                cancel = null;
                view.photoPath = null;
            },
        };
    },

    open(view) {
        if (view.photoPath)
            view.provider?.open(view.photoPath);
        else
            openApp('org.gnome.Loupe.desktop', 'org.gnome.Shotwell.desktop', 'org.gnome.Nautilus.desktop');
    },

    options(view) {
        const daily = view.config.interval === 'daily';
        return [
            { label: view._('Next Photo'), active: false, apply: () => ({ shuffle: (view.config.shuffle ?? 0) + 1 }) },
            { label: view._('New Photo Every Day'), active: daily, apply: () => ({ interval: daily ? 'hourly' : 'daily' }) },
        ];
    },
};
