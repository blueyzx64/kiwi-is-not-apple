// SPDX-License-Identifier: GPL-3.0-or-later
// Pure helpers for the expanded notch: its size, track times, the clock and the card size. No
// gi:// imports; tested by tests/notchDashboardModel.test.js.

/** The expanded notch: one shape for every tab, on a 4px grid (logical px). Header band 32
 * (level with the top bar), body 136 (art 68 + 12 + scrubber 16 + 8 + controls 32), 4 + 20
 * padding; two columns of 340 and 248 with a 20 gap and 20 sides. */
export const DASH_SIZE = Object.freeze({ w: 648, h: 192, r: 32 });

/** @returns {string} "m:ss", or "h:mm:ss" from one hour on; '' for unknown input */
export function formatTrackTime(us) {
    if (!Number.isFinite(us) || us < 0)
        return '';
    const total = Math.floor(us / 1e6);
    const h = Math.floor(total / 3600);
    const m = Math.floor(total % 3600 / 60);
    const s = String(total % 60).padStart(2, '0');
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * @param {number|null} positionUs from MPRIS Position
 * @param {number|null} lengthUs from mpris:length
 * @returns {{fraction: number, elapsed: string, remaining: string}|null} null when the player
 *   gives no usable length or position (live streams, some browsers): no scrubber then
 */
export function trackProgress(positionUs, lengthUs) {
    if (!Number.isFinite(lengthUs) || lengthUs <= 0 || !Number.isFinite(positionUs) || positionUs < 0)
        return null;
    const pos = Math.min(positionUs, lengthUs);
    return {
        fraction: pos / lengthUs,
        elapsed: formatTrackTime(pos),
        remaining: `-${formatTrackTime(lengthUs - pos)}`,
    };
}

/**
 * Where a click on the scrubber seeks to.
 * @param {number} fraction 0..1 across the track (clamped)
 * @param {number|null} lengthUs from mpris:length
 * @returns {number|null} the target in microseconds, or null without a usable length
 */
export function seekTarget(fraction, lengthUs) {
    if (!Number.isFinite(lengthUs) || lengthUs <= 0 || !Number.isFinite(fraction))
        return null;
    return Math.round(Math.max(0, Math.min(1, fraction)) * lengthUs);
}

/**
 * @param {number} hours 0..23
 * @param {number} minutes 0..59
 * @param {'24h'|'12h'} format org.gnome.desktop.interface clock-format
 * @returns {{time: string, suffix: string}} suffix is 'AM'/'PM' in 12h, else ''
 */
export function formatClock(hours, minutes, format) {
    const mm = String(minutes).padStart(2, '0');
    if (format === '12h') {
        const h = hours % 12 === 0 ? 12 : hours % 12;
        return { time: `${h}:${mm}`, suffix: hours < 12 ? 'AM' : 'PM' };
    }
    return { time: `${String(hours).padStart(2, '0')}:${mm}`, suffix: '' };
}

/**
 * The notification card fits its content: the header row centred in the 32px band level with the
 * top bar (3 + 26 + 3), title and two lines of body, plus a row of action buttons when there are
 * any; 16 below, on the 4px grid.
 * @returns {{w: number, h: number, r: number}}
 */
export function cardSize({ actions }) {
    return { w: 430, h: actions ? 148 : 108, r: DASH_SIZE.r };
}

/** The Widgets tab's own tile (Focus, microphone, timers), listed in notch-widgets like a kind. */
export const NOTCH_CONTROLS = 'notch-controls';

/**
 * The Widgets tab: core/widgets cards side by side in the body under the header band. A card
 * is drawn at its desktop size and scaled to the body's height (170 -> 136: the 192 shape minus
 * the 32 band and the body's 4 + 20 padding), so text keeps its proportions; four smalls, two
 * mediums or a medium and two smalls fill the 608 px inner width.
 */
export const WIDGET_STRIP = Object.freeze({ columns: 4, scale: 0.8, spacing: 20, inner: 608 });

/** @returns {number} the strip's width in px for cards of these (unscaled) widths */
export function stripWidth(widths) {
    if (!widths.length)
        return 0;
    return widths.reduce((n, w) => n + w * WIDGET_STRIP.scale, 0) + (widths.length - 1) * WIDGET_STRIP.spacing;
}
