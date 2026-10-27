// SPDX-License-Identifier: GPL-3.0-or-later
// Pure helpers for wallpaper tinting (lib/wallpaperTint.js samples, lib/glass.js mixes 8 % of
// the result into the glass tint). No gi imports; tests/wallpaperModel.test.js.

/** Side of the thumbnail the wallpaper is decoded to; its average is the tint source. */
export const SAMPLE_SIZE = 32;
/** Wallpapers whose average colour is remembered for the session. */
export const CACHE_SIZE = 8;

/** '#rrggbb' (or '#rgb') -> [r, g, b], null when it is not a colour. */
export function parseHexColor(text) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(text ?? '').trim());
    if (!m)
        return null;
    const hex = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
}

/**
 * What to sample, from org.gnome.desktop.background and the colour scheme. The Shell shows
 * picture-uri-dark only for 'prefer-dark' (js/ui/background.js, getBackground), and a
 * picture-options of 'none' shows primary-color.
 *
 * @param {{pictureUri: string, pictureUriDark: string, options: string, primaryColor: string,
 *          colorScheme: string}} bg
 * @returns {{kind: 'none'}|{kind: 'color', color: number[]}|{kind: 'file', uri: string}}
 */
export function wallpaperSource({ pictureUri, pictureUriDark, options, primaryColor, colorScheme }) {
    if (options === 'none') {
        const color = parseHexColor(primaryColor);
        return color ? { kind: 'color', color } : { kind: 'none' };
    }
    const uri = (colorScheme === 'prefer-dark' && pictureUriDark) ? pictureUriDark : pictureUri;
    return uri ? { kind: 'file', uri } : { kind: 'none' };
}

/** True for a GNOME time-based (slideshow) background description. */
export const isXmlBackground = uri => /\.xml$/i.test(uri ?? '');

/**
 * The first picture of a GNOME XML background (`<static><file>…</file>` or the multi-size
 * `<file><size …>…</size></file>` form), or null.
 */
export function xmlFirstImage(text) {
    const file = /<file>([\s\S]*?)<\/file>/.exec(text ?? '');
    if (!file)
        return null;
    const size = /<size[^>]*>([\s\S]*?)<\/size>/.exec(file[1]);
    const path = (size ? size[1] : file[1]).trim();
    return path || null;
}

/**
 * Average colour of raw pixel rows (GdkPixbuf layout), weighted by alpha when there is one.
 *
 * @param {Uint8Array} pixels
 * @param {{width: number, height: number, rowstride: number, channels: number}} layout
 * @returns {?number[]} [r, g, b] rounded, null when nothing is visible
 */
export function averageRgb(pixels, { width, height, rowstride, channels }) {
    let r = 0, g = 0, b = 0, w = 0;
    for (let y = 0; y < height; y++) {
        let i = y * rowstride;
        for (let x = 0; x < width; x++, i += channels) {
            const a = channels === 4 ? pixels[i + 3] / 255 : 1;
            r += pixels[i] * a;
            g += pixels[i + 1] * a;
            b += pixels[i + 2] * a;
            w += a;
        }
    }
    return w > 0 ? [r / w, g / w, b / w].map(v => Math.round(v)) : null;
}

/** A small most-recently-used map. */
export class ColorCache {
    constructor(limit = CACHE_SIZE) {
        this._limit = limit;
        this._map = new Map();
    }

    get(key) {
        if (!this._map.has(key))
            return undefined;
        const v = this._map.get(key);
        this._map.delete(key);
        this._map.set(key, v);
        return v;
    }

    set(key, value) {
        this._map.delete(key);
        this._map.set(key, value);
        while (this._map.size > this._limit)
            this._map.delete(this._map.keys().next().value);
    }

    get size() {
        return this._map.size;
    }
}
