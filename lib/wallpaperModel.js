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

// The picture named by a <file> element: its text, or the first <size> of the multi-size form
function filePath(inner) {
    const size = /<size[^>]*>([\s\S]*?)<\/size>/.exec(inner);
    return (size ? size[1] : inner).trim();
}

/**
 * The first picture of a GNOME XML background (`<static><file>…</file>` or the multi-size
 * `<file><size …>…</size></file>` form), or null.
 */
export function xmlFirstImage(text) {
    const file = /<file>([\s\S]*?)<\/file>/.exec(text ?? '');
    return file ? filePath(file[1]) || null : null;
}

const xmlNumber = (inner, tag) => {
    const m = new RegExp(`<${tag}>\\s*([0-9.]+)\\s*</${tag}>`).exec(inner);
    return m ? Number(m[1]) : NaN;
};

/**
 * The picture a GNOME XML (day/night) background shows at `now`, and how long that lasts. The
 * file is a loop of <static> pictures and <transition>s from <starttime>; a transition counts
 * as its source for the first half and its target for the second. Without a start time or
 * durations it is the first picture, for good.
 *
 * @param {string} text the XML
 * @param {Date} now
 * @returns {?{path: string, until: ?number}} until: seconds to the next picture (null: never)
 */
export function xmlSlideAt(text, now) {
    const first = xmlFirstImage(text);
    if (!first)
        return null;
    const start = /<starttime>([\s\S]*?)<\/starttime>/.exec(text);
    const slides = [];
    for (const m of text.matchAll(/<(static|transition)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
        const duration = xmlNumber(m[2], 'duration');
        if (!(duration > 0))
            continue;
        if (m[1] === 'static') {
            const file = /<file>([\s\S]*?)<\/file>/.exec(m[2]);
            if (file)
                slides.push({ duration, path: filePath(file[1]) });
        } else {
            const from = /<from>([\s\S]*?)<\/from>/.exec(m[2]);
            const to = /<to>([\s\S]*?)<\/to>/.exec(m[2]);
            if (from && to)
                slides.push({ duration, path: filePath(from[1]), then: filePath(to[1]) });
        }
    }
    const cycle = slides.reduce((s, x) => s + x.duration, 0);
    if (!start || !(cycle > 0))
        return { path: first, until: null };
    const field = tag => xmlNumber(start[1], tag);
    const begin = new Date(field('year'), field('month') - 1, field('day'),
        field('hour') || 0, field('minute') || 0, field('second') || 0);
    if (Number.isNaN(begin.getTime()))
        return { path: first, until: null };
    let t = (((now - begin) / 1000) % cycle + cycle) % cycle;
    for (const slide of slides) {
        if (t < slide.duration) {
            if (slide.then === undefined)
                return { path: slide.path, until: slide.duration - t };
            const half = slide.duration / 2;
            return t < half ? { path: slide.path, until: half - t } : { path: slide.then, until: slide.duration - t };
        }
        t -= slide.duration;
    }
    return { path: first, until: null };
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
