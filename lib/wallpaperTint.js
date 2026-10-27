// SPDX-License-Identifier: GPL-3.0-or-later
// WallpaperTint: the average colour of the current wallpaper, for the glass tint.
//
// The picture is decoded once per change, asynchronously, straight to a 32x32 thumbnail
// (GdkPixbuf's stream loader runs in a worker thread), and averaged. Results are cached per
// URI for the session, so switching between Light and Dark (two pictures) costs nothing after
// the first time. Nothing runs per frame, and nothing at all while the wallpaper is unchanged.
// An unreadable picture (a format without a loader, a missing file) means "no tint", silently.
//
//   const tint = new WallpaperTint();
//   tint.start(registry, color => ...);   // color: [r, g, b] or null; called on every change
//   tint.color                            // latest value

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';

import { ColorCache, SAMPLE_SIZE, averageRgb, isXmlBackground, wallpaperSource, xmlFirstImage }
    from './wallpaperModel.js';

const BG_SCHEMA = 'org.gnome.desktop.background';
const IFACE_SCHEMA = 'org.gnome.desktop.interface';
const BG_KEYS = ['picture-uri', 'picture-uri-dark', 'picture-options', 'primary-color'];

Gio._promisify(Gio.File.prototype, 'read_async');
Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(GdkPixbuf.Pixbuf, 'new_from_stream_at_scale_async', 'new_from_stream_finish');

// Session cache: a wallpaper is decoded once however often glass restarts
const cache = new ColorCache();

export class WallpaperTint {
    constructor() {
        this.color = null;
        this._cancellable = null;
        this._onChange = null;
        this._bg = null;
        this._iface = null;
    }

    /**
     * Follow the wallpaper until `registry` is disposed.
     *
     * @param {import('./disposables.js').CleanupRegistry} registry
     * @param {(color: ?number[]) => void} onChange
     */
    start(registry, onChange) {
        this._onChange = onChange;
        this._bg = new Gio.Settings({ schema_id: BG_SCHEMA });
        this._iface = new Gio.Settings({ schema_id: IFACE_SCHEMA });
        for (const key of BG_KEYS)
            registry.connect(this._bg, `changed::${key}`, () => this._sample());
        registry.connect(this._iface, 'changed::color-scheme', () => this._sample());
        registry.add(() => {
            this._cancellable?.cancel();
            this._cancellable = null;
            this._onChange = null;
            this._bg = null;
            this._iface = null;
        });
        this._sample();
    }

    _source() {
        return wallpaperSource({
            pictureUri: this._bg.get_string('picture-uri'),
            pictureUriDark: this._bg.get_string('picture-uri-dark'),
            options: this._bg.get_string('picture-options'),
            primaryColor: this._bg.get_string('primary-color'),
            colorScheme: this._iface.get_string('color-scheme'),
        });
    }

    _set(color) {
        const same = color === this.color ||
            (color && this.color && color.every((c, i) => c === this.color[i]));
        this.color = color;
        if (!same)
            this._onChange?.(color);
    }

    _sample() {
        this._cancellable?.cancel();
        this._cancellable = null;
        const source = this._source();
        if (source.kind === 'none') {
            this._set(null);
            return;
        }
        if (source.kind === 'color') {
            this._set(source.color);
            return;
        }
        const cached = cache.get(source.uri);
        if (cached !== undefined) {
            this._set(cached);
            return;
        }
        const cancellable = new Gio.Cancellable();
        this._cancellable = cancellable;
        this._decode(source.uri, cancellable).then(color => {
            if (cancellable.is_cancelled())
                return;
            cache.set(source.uri, color);
            this._cancellable = null;
            this._set(color);
        }).catch(e => {
            if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return;
            // No loader for this format, or a missing file: glass keeps its neutral tint
            cache.set(source.uri, null);
            if (!cancellable.is_cancelled()) {
                this._cancellable = null;
                this._set(null);
            }
        });
    }

    async _decode(uri, cancellable) {
        let file = Gio.File.new_for_uri(uri);
        if (isXmlBackground(uri)) {
            const [bytes] = await file.load_contents_async(cancellable);
            const path = xmlFirstImage(new TextDecoder().decode(bytes));
            if (!path)
                return null;
            file = GLib.path_is_absolute(path) ? Gio.File.new_for_path(path)
                : file.get_parent().resolve_relative_path(path);
        }
        const stream = await file.read_async(GLib.PRIORITY_LOW, cancellable);
        try {
            const pixbuf = await GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(
                stream, SAMPLE_SIZE, SAMPLE_SIZE, false, cancellable);
            return averageRgb(pixbuf.read_pixel_bytes().toArray(), {
                width: pixbuf.get_width(),
                height: pixbuf.get_height(),
                rowstride: pixbuf.get_rowstride(),
                channels: pixbuf.get_n_channels(),
            });
        } finally {
            stream.close_async(GLib.PRIORITY_LOW, null, null);
        }
    }
}
