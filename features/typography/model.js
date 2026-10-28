// SPDX-License-Identifier: GPL-3.0-or-later
// Pure decisions for typography (no gi:// imports; unit-tested under plain gjs).
//
// macOS draws text with San Francisco, unhinted, with grayscale antialiasing (no subpixel
// colour fringes since Mojave). That look depends on a Retina screen: at ~96 dpi (scale 1)
// unhinted grayscale text is uneven and jagged-soft at once, far from what ClearType gives on
// the same panel. So the rendering is DPI-aware (renderingFor): on a standard screen slight
// hinting with subpixel antialiasing (ClearType-like) by default; on HiDPI the macOS look.
//
// Kiwi can't ship San Francisco (Apple's licence): it uses SF Pro Text (else SF Pro) when the
// user installed it, else Inter, the open typeface drawn after it (Fedora: rsms-inter-vf-fonts). The font size
// stays the user's.

/**
 * UI families, best first. SF Pro Text is the optical size Apple draws below 20 pt (wider
 * spacing, sturdier stems). The "SF Pro" variable font (SF-Pro.ttf) has an optical-size axis
 * of 17-28 and its named instances sit at 28, the Display cut: fontconfig and Pango do not
 * move the axis to the point size, so at 10-11 pt it draws thin, tight Display letters that
 * break up on a 96 dpi screen. SF Pro Display is never picked. Then Inter (variable, then
 * static).
 */
export const UI_FAMILIES = Object.freeze(['SF Pro Text', 'SF Pro', 'Inter Variable', 'Inter']);
/** Monospace families: only Apple's own (a coding font is the user's choice otherwise). */
export const MONO_FAMILIES = Object.freeze(['SF Mono']);
/** The Fedora package that brings Inter (offered by the preferences). */
export const INTER_PACKAGE = 'rsms-inter-vf-fonts';

/** org.gnome.desktop.interface values that render text like macOS (HiDPI screens). */
export const MACOS_RENDERING = Object.freeze({
    'font-hinting': 'none',
    'font-antialiasing': 'grayscale',
});

/**
 * A standard (~96 dpi) screen, by default: slight hinting snaps stems to the pixel grid
 * vertically only, so letter shapes and spacing stay true (full hinting gives the harsh, sharp
 * old-Windows look), and subpixel antialiasing smooths horizontally with the LCD's colour
 * stripes, as ClearType does. Slight hinting is also what lets FreeType's stem darkening
 * (FREETYPE_PROPERTIES, as lucidglyph sets it) apply to TrueType fonts: darkening runs in the
 * autofitter, which unhinted rendering skips. The stripe order is the user's font-rgba-order.
 *
 * Who honours what (GNOME 50): the Shell (Clutter's settings read hinting, antialiasing and
 * rgba order), GTK 3 apps (Firefox among them) and X11 apps under Xwayland (gsd-xsettings
 * hands the keys to Xft, Chromium/Electron). GTK 4 ignores them at its default font-rendering
 * 'automatic' and always draws slight + grayscale (gtkwidget.c); 'manual' would make it read
 * the hinting but still not subpixel (gtksettings.c maps any antialiasing to grayscale) and
 * would turn on hinted metrics (gtk-hint-font-metrics defaults to true: uneven spacing).
 * So Kiwi leaves font-rendering alone.
 */
export const STANDARD_RENDERING = Object.freeze({
    'font-hinting': 'slight',
    'font-antialiasing': 'rgba',
});

/** Standard screen, Greyscale chosen: no colour fringes (on glass or a rotated panel). */
export const STANDARD_GRAYSCALE = Object.freeze({
    'font-hinting': 'slight',
    'font-antialiasing': 'grayscale',
});

/** HiDPI, Subpixel chosen: unhinted, with subpixel antialiasing. */
export const HIDPI_SUBPIXEL = Object.freeze({
    'font-hinting': 'none',
    'font-antialiasing': 'rgba',
});

/** The values of macos-font-smoothing. */
export const SMOOTHING = Object.freeze(['automatic', 'subpixel', 'grayscale']);

/** GNOME's logical pixel density at scale 1. */
export const BASE_DPI = 96;
/** From this effective density up (scale 1.5 and over), unhinted text is crisp enough. */
export const HIDPI_MIN_DPI = 144;

/**
 * The rendering for the screens connected now. One GNOME key serves every monitor, so the
 * least dense one decides: a scale-1 monitor next to a HiDPI one keeps the standard rendering
 * (slight hinting barely changes text on the HiDPI one). A larger text-scaling-factor makes
 * glyphs bigger in pixels, which counts like a denser screen.
 *
 * Hinting always follows density (slight below HIDPI_MIN_DPI, none from it). Smoothing:
 * 'automatic' is subpixel on a standard screen and grayscale on HiDPI (the macOS look);
 * 'subpixel' and 'grayscale' force that antialiasing on every screen.
 *
 * @param {{scales: number[], textScale?: number, smoothing?: string}} screens monitor scales
 *   (logical/geometry scale, fractional allowed), org.gnome.desktop.interface
 *   text-scaling-factor, and Kiwi's macos-font-smoothing
 * @returns {{hinting: string, antialiasing: string, dpi: number, hidpi: boolean, values: object}}
 *   values: the keys to set (one of the frozen tables above, so they compare by identity)
 */
export function renderingFor({ scales, textScale = 1, smoothing = 'automatic' } = {}) {
    const valid = (scales ?? []).filter(s => Number.isFinite(s) && s > 0);
    const scale = valid.length ? Math.min(...valid) : 1;
    const text = Number.isFinite(textScale) && textScale > 0 ? textScale : 1;
    const dpi = Math.round(BASE_DPI * scale * text);
    const hidpi = dpi >= HIDPI_MIN_DPI;
    const mode = SMOOTHING.includes(smoothing) ? smoothing : 'automatic';
    const subpixel = mode === 'subpixel' || (mode === 'automatic' && !hidpi);
    let values;
    if (hidpi)
        values = subpixel ? HIDPI_SUBPIXEL : MACOS_RENDERING;
    else
        values = subpixel ? STANDARD_RENDERING : STANDARD_GRAYSCALE;
    return {
        hinting: values['font-hinting'], antialiasing: values['font-antialiasing'], dpi, hidpi, values,
    };
}

/**
 * The first of `wanted` that is installed (case-insensitive), with its installed spelling.
 *
 * @param {string[]} installed family names (fc-list : family, one per entry)
 * @param {readonly string[]} wanted
 * @returns {?string}
 */
export function pickFamily(installed, wanted) {
    const byLower = new Map();
    for (const f of installed ?? [])
        byLower.set(String(f).trim().toLowerCase(), String(f).trim());
    for (const w of wanted) {
        const hit = byLower.get(w.toLowerCase());
        if (hit)
            return hit;
    }
    return null;
}

/**
 * Family names out of `fc-list : family` output. A font with localized names lists them
 * comma-separated on one line; each counts.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function parseFcList(text) {
    const out = new Set();
    for (const line of String(text ?? '').split('\n')) {
        for (const name of line.split(',')) {
            const n = name.replace(/\\-/g, '-').trim();
            if (n)
                out.add(n);
        }
    }
    return [...out];
}

/**
 * The size of a Pango font description string ("Adwaita Sans 11", "Cantarell Bold 10.5").
 *
 * @param {string} desc
 * @returns {?number} points, null when the string names none
 */
export function fontSize(desc) {
    const m = /\s(\d+(?:\.\d+)?)(px)?\s*$/.exec(String(desc ?? ''));
    if (!m || m[2])
        return null;
    return Number(m[1]);
}

/**
 * `family` at the size of the user's `original` description (or `fallbackSize`).
 *
 * @param {string} original the user's value of the key
 * @param {string} family
 * @param {number} fallbackSize
 * @returns {string}
 */
export function withFamily(original, family, fallbackSize) {
    const size = fontSize(original) ?? fallbackSize;
    return `${family} ${size}`;
}

/**
 * The fonts Kiwi sets, from what is installed.
 *
 * @param {string[]} installed
 * @returns {{ui: ?string, mono: ?string}}
 */
export function plan(installed) {
    return { ui: pickFamily(installed, UI_FAMILIES), mono: pickFamily(installed, MONO_FAMILIES) };
}
