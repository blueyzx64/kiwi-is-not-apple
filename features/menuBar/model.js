// SPDX-License-Identifier: GPL-3.0-or-later
// Pure logic of the menu bar: the adaptive look (wallpaper luminance, solid or clear), the
// About This PC facts, Recent Items, Force Quit rows and the privacy dots. No Shell objects:
// the adapters in this folder pass plain values in.

// ---- adaptive look ---------------------------------------------------------------------------

/** WCAG relative luminance of an sRGB colour (0..255 channels) -> 0..1. */
export function relativeLuminance(r, g, b) {
    const lin = c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Black text beats white text on a background brighter than this (equal contrast point)
export const TEXT_FLIP_LUMINANCE = 0.179;
// How far past the flip point the band must move before the text flips back (hysteresis)
export const TEXT_FLIP_HYSTERESIS = 0.04;
// A band whose luminance spread is wider than this is "mixed": a soft scrim is drawn
export const MIXED_SPREAD = 0.35;

/**
 * Which part of the wallpaper image lies under the top band of a monitor.
 *
 * @param {{width: number, height: number}} image picture size in pixels
 * @param {{width: number, height: number}} monitor
 * @param {string} option org.gnome.desktop.background picture-options
 * @param {number} band band height in monitor px (the menu bar)
 * @returns {?{x: number, y: number, width: number, height: number}} image rect, or null when
 *   the band shows only the background colour ('none', or bars of 'scaled' / 'centered')
 */
export function wallpaperBand(image, monitor, option, band) {
    const { width: iw, height: ih } = image;
    const { width: mw, height: mh } = monitor;
    if (!iw || !ih || !mw || !mh || option === 'none')
        return null;
    const clampRect = (x, y, w, h) => {
        const x0 = Math.max(0, Math.floor(x));
        const y0 = Math.max(0, Math.floor(y));
        const x1 = Math.min(iw, Math.ceil(x + w));
        const y1 = Math.min(ih, Math.ceil(y + h));
        return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
    };
    switch (option) {
    case 'stretched':
        return clampRect(0, 0, iw, ih * band / mh);
    case 'scaled': {
        // Fit inside: bars of the background colour above and below when the image is wider
        const s = Math.min(mw / iw, mh / ih);
        const top = (mh - ih * s) / 2;
        if (top >= band)
            return null;
        return clampRect(0, Math.max(0, -top) / s, iw, (band - Math.max(0, top)) / s);
    }
    case 'centered': {
        const top = (mh - ih) / 2;
        const left = (mw - iw) / 2;
        if (top >= band)
            return null;
        return clampRect(-left, -top, mw, band - Math.max(0, top));
    }
    case 'wallpaper':
        return clampRect(0, 0, Math.min(iw, mw), Math.min(ih, band));
    case 'zoom':
    case 'spanned':
    default: {
        // Cover: the image fills the monitor, centred, cropped on one axis
        const s = Math.max(mw / iw, mh / ih);
        const cropX = (iw * s - mw) / 2 / s;
        const cropY = (ih * s - mh) / 2 / s;
        return clampRect(cropX, cropY, mw / s, band / s);
    }
    }
}

/**
 * Luminance statistics of a rect of RGB(A) pixels, sampling a grid of at most ~grid² points.
 *
 * @param {Uint8Array} pixels
 * @param {{rowstride: number, channels: number}} layout
 * @param {{x, y, width, height}} rect
 * @param {number} [grid] samples per axis
 * @returns {{mean: number, spread: number}} spread = 90th - 10th percentile
 */
export function bandLuminance(pixels, { rowstride, channels }, rect, grid = 24) {
    const values = [];
    const stepX = Math.max(1, Math.floor(rect.width / grid));
    const stepY = Math.max(1, Math.floor(rect.height / Math.min(grid, rect.height)));
    for (let y = rect.y; y < rect.y + rect.height; y += stepY) {
        for (let x = rect.x; x < rect.x + rect.width; x += stepX) {
            const i = y * rowstride + x * channels;
            values.push(relativeLuminance(pixels[i], pixels[i + 1], pixels[i + 2]));
        }
    }
    if (!values.length)
        return { mean: 0, spread: 0 };
    values.sort((a, b) => a - b);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const at = f => values[Math.min(values.length - 1, Math.floor(f * values.length))];
    return { mean, spread: at(0.9) - at(0.1) };
}

/** Luminance of a '#rrggbb' colour (the background colour of 'none' or bars). */
export function colorLuminance(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex ?? '');
    if (!m)
        return 0;
    return relativeLuminance(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16));
}

/**
 * Dark or light text over the band, with hysteresis so a band near the flip point does not
 * flicker between wallpapers of similar brightness.
 *
 * @param {{mean: number, spread: number}} stats
 * @param {?boolean} previousDark the last choice (null: none yet)
 * @returns {{darkText: boolean, scrim: boolean}}
 */
export function chooseText(stats, previousDark = null) {
    let darkText = stats.mean > TEXT_FLIP_LUMINANCE;
    if (previousDark === true && stats.mean > TEXT_FLIP_LUMINANCE - TEXT_FLIP_HYSTERESIS)
        darkText = true;
    else if (previousDark === false && stats.mean < TEXT_FLIP_LUMINANCE + TEXT_FLIP_HYSTERESIS)
        darkText = false;
    return { darkText, scrim: stats.spread > MIXED_SPREAD };
}

/**
 * The first picture of a GNOME background XML (slideshow or day/night): its <file> (or the
 * <from> of a transition).
 *
 * @param {string} xml
 * @returns {?string} a path or URI
 */
export function backgroundXmlPicture(xml) {
    const m = /<(?:file|from)>\s*([^<\s][^<]*?)\s*<\/(?:file|from)>/.exec(xml ?? '');
    return m ? m[1] : null;
}

/**
 * Does a window touch the menu bar (macOS: the bar turns solid)?
 *
 * @param {{y: number, x: number, width: number}} frame the window's frame rect
 * @param {{x: number, y: number, width: number}} area the work area of its monitor (its top
 *   is the bottom of the menu bar)
 * @returns {boolean}
 */
export function touchesBar(frame, area) {
    const overlapsX = frame.x < area.x + area.width && frame.x + frame.width > area.x;
    return overlapsX && frame.y <= area.y;
}

/**
 * The menu bar's look.
 *
 * @param {object} s
 * @param {boolean} s.transparent the "transparent menu bar" setting
 * @param {boolean} s.windowAtTop a window touches the bar or is maximized
 * @param {boolean} s.overview Mission Control / the overview is showing
 * @param {boolean} s.solidOnly high contrast or reduced transparency
 * @returns {'clear'|'solid'|'overview'}
 */
export function barLook({ transparent, windowAtTop, overview, solidOnly }) {
    if (overview)
        return 'overview';
    if (!transparent || solidOnly || windowAtTop)
        return 'solid';
    return 'clear';
}

// ---- About This PC ---------------------------------------------------------------------------

/** os-release text -> {NAME, VERSION, PRETTY_NAME, LOGO, ...} */
export function parseOsRelease(text) {
    const out = {};
    for (const line of (text ?? '').split('\n')) {
        const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
        if (!m)
            continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
            v = v.slice(1, -1);
        out[m[1]] = v.replace(/\\(["'\\$`])/g, '$1');
    }
    return out;
}

/** /proc/cpuinfo -> {model, threads} */
export function parseCpuInfo(text) {
    let model = null;
    let threads = 0;
    for (const line of (text ?? '').split('\n')) {
        const [k, ...rest] = line.split(':');
        const key = k?.trim();
        const value = rest.join(':').trim();
        if (key === 'processor')
            threads++;
        else if (!model && (key === 'model name' || key === 'Hardware' || key === 'cpu model' || key === 'Model'))
            model = value;
    }
    return { model: model ? model.replace(/\s+/g, ' ').replace(/\((R|TM)\)/g, '') : null, threads };
}

/** /proc/meminfo -> total bytes (or 0) */
export function parseMemTotal(text) {
    const m = /^MemTotal:\s+(\d+)\s*kB/m.exec(text ?? '');
    return m ? Number(m[1]) * 1024 : 0;
}

/**
 * Bytes as macOS writes them (decimal units): '512 GB', '1.5 TB'.
 * Memory is shown in binary-rounded GB like "16 GB".
 *
 * @param {number} bytes
 * @param {{memory?: boolean}} [opts] memory: round to the nearest power-of-two-ish GB
 */
export function formatBytes(bytes, { memory = false } = {}) {
    if (!(bytes > 0))
        return '';
    if (memory) {
        const gib = bytes / 1024 ** 3;
        return `${gib >= 1 ? Math.round(gib) : Math.round(gib * 1024) / 1024} GB`;
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let v = bytes;
    let i = 0;
    while (v >= 1000 && i < units.length - 1) {
        v /= 1000;
        i++;
    }
    const s = v >= 100 || i === 0 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString();
    return `${s} ${units[i]}`;
}

/**
 * The model line: "Vendor Model", without repeating the vendor and without filler DMI strings.
 *
 * @param {?string} vendor
 * @param {?string} model
 * @returns {?string}
 */
export function deviceModel(vendor, model) {
    const junk = /^(to be filled by o\.e\.m\.|system product name|default string|none|unknown|o\.e\.m\.|not specified)$/i;
    const v = vendor && !junk.test(vendor.trim()) ? vendor.trim() : '';
    const m = model && !junk.test(model.trim()) ? model.trim() : '';
    if (!m)
        return v || null;
    return v && !m.toLowerCase().startsWith(v.toLowerCase()) ? `${v} ${m}` : m;
}

/** Chassis (hostname1) -> a symbolic icon name. */
export function chassisIcon(chassis) {
    switch (chassis) {
    case 'laptop':
    case 'convertible':
        return 'computer-laptop-symbolic';
    case 'tablet':
        return 'tablet-symbolic';
    case 'handset':
        return 'phone-symbolic';
    default:
        return 'computer-symbolic';
    }
}

/**
 * Switcheroo GPUs (aa{sv}, unpacked) -> names, the default one first.
 *
 * @param {{Name?: string, Default?: boolean}[]} gpus
 * @returns {string[]}
 */
export function gpuNames(gpus) {
    return [...(gpus ?? [])]
        .filter(g => g?.Name)
        .sort((a, b) => Number(!!b.Default) - Number(!!a.Default))
        .map(g => g.Name);
}

// ---- Recent Items ----------------------------------------------------------------------------

const decodeXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/**
 * The most recent documents of a recently-used.xbel file.
 *
 * @param {string} xml
 * @param {number} [limit]
 * @returns {{uri: string, name: string, time: number, mime: ?string}[]} newest first
 */
export function parseRecentXbel(xml, limit = 10) {
    const out = [];
    const re = /<bookmark\b([^>]*)>([\s\S]*?)<\/bookmark>/g;
    let m;
    while ((m = re.exec(xml ?? ''))) {
        const attrs = m[1];
        const href = /\bhref="([^"]*)"/.exec(attrs)?.[1];
        if (!href)
            continue;
        const stamp = /\bvisited="([^"]*)"/.exec(attrs)?.[1] ?? /\bmodified="([^"]*)"/.exec(attrs)?.[1] ?? '';
        const time = Date.parse(stamp) || 0;
        const mime = /<mime:mime-type\s+type="([^"]*)"/.exec(m[2])?.[1] ?? null;
        const uri = decodeXml(href);
        let name = uri.replace(/\/+$/, '').split('/').pop() ?? uri;
        try {
            name = decodeURIComponent(name);
        } catch (_e) {
            // keep the raw name
        }
        out.push({ uri, name, time, mime });
    }
    out.sort((a, b) => b.time - a.time);
    const seen = new Set();
    return out.filter(r => !seen.has(r.uri) && seen.add(r.uri)).slice(0, limit);
}

// ---- Force Quit ------------------------------------------------------------------------------

/**
 * Rows of the Force Quit dialog: apps with windows, by name, the unresponsive ones flagged.
 *
 * @param {{id: string, name: string, windows: {alive: boolean}[]}[]} apps
 * @returns {{id: string, name: string, notResponding: boolean}[]}
 */
export function forceQuitRows(apps) {
    return apps
        .filter(a => a.windows.length > 0)
        .map(a => ({ id: a.id, name: a.name, notResponding: a.windows.some(w => !w.alive) }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// ---- privacy dots ----------------------------------------------------------------------------

/**
 * The dots to show, in macOS order (left to right: screen, camera, microphone).
 *
 * @param {{mic: boolean, camera: boolean, screen: boolean}} state
 * @returns {('screen'|'camera'|'mic')[]}
 */
export function privacyDots({ mic, camera, screen }) {
    return [screen && 'screen', camera && 'camera', mic && 'mic'].filter(Boolean);
}

/**
 * Apps recording from the microphone, from the mixer's source outputs (the same rule as the
 * Shell's microphone indicator: level meters of volume controls do not count).
 *
 * @param {{appId: ?string, name: ?string}[]} outputs
 * @returns {string[]} unique display names
 */
export function micApps(outputs) {
    const skipped = new Set(['org.gnome.VolumeControl', 'org.PulseAudio.pavucontrol']);
    const names = [];
    for (const o of outputs) {
        if (skipped.has(o.appId))
            continue;
        const name = o.name || o.appId;
        if (name && !names.includes(name))
            names.push(name);
    }
    return names;
}
