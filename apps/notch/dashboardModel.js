// SPDX-License-Identifier: GPL-3.0-or-later
// Pure helpers for the notch dashboard and its motion: which layout to show, its size, track
// times, the clock and the spring curve. No gi:// imports; tested by
// tests/notchDashboardModel.test.js.
//
// The dashboard follows the expanded Dynamic Island and the macOS notch utilities:
//   media   the player is the hero (large art, title, artist, scrubber, controls) on the left,
//           a compact notification list on the right
//   clock   nothing is playing: a large clock and the date on the left, the notifications
//           take the rest of the width
// A clipboard column, when that option is on, adds a fixed-width column at the right.

// One 4px grid for every size below (logical px).
export const GRID = Object.freeze({
    pad: 20,          // outer padding left, right and bottom
    header: 32,       // the top band, level with the top bar: date at left, DND at right
    gap: 20,          // between columns
    radius: 32,       // bottom corners of the expanded island
    row: 44,          // one notification row
    more: 24,         // the "N more" line
});

const WIDTH = Object.freeze({
    media: 340,       // the hero column
    clock: 168,
    list: 248,        // the notification column
    clipboard: 196,
});

const BODY = Object.freeze({
    media: 136,       // art 68 + 12 + scrubber 16 + 8 + controls 32
    clock: 88,        // large time + date
});

/**
 * @param {object} p
 * @param {boolean} p.media a player is there (playing or paused)
 * @param {number} p.rows notification rows shown (0..)
 * @param {boolean} p.more an "N more" line is shown under the rows
 * @param {boolean} p.clipboard the clipboard column is shown
 * @param {number} [p.clipRows] clipboard rows shown
 * @returns {{mode: 'media'|'clock', columns: string[], size: {w: number, h: number, r: number},
 *   widths: object}}
 */
export function dashboardLayout({ media, rows, more, clipboard, clipRows = 0 }) {
    const mode = media ? 'media' : 'clock';
    const columns = [mode, 'list'];
    if (clipboard)
        columns.push('clipboard');
    const listBody = Math.max(1, rows) * GRID.row + (more ? GRID.more : 0);
    const clipBody = clipboard ? 26 + Math.max(1, clipRows) * 42 : 0;  // caption, 32px rows, 10px gaps
    const body = Math.max(BODY[mode], listBody, clipBody);
    const inner = columns.reduce((sum, c) => sum + WIDTH[c === 'media' || c === 'clock' ? mode : c], 0) +
        GRID.gap * (columns.length - 1);
    return {
        mode,
        columns,
        widths: { ...WIDTH },
        size: {
            w: inner + 2 * GRID.pad,
            h: Math.ceil((GRID.header + 4 + body + GRID.pad) / 4) * 4,
            r: GRID.radius,
        },
    };
}

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

/** @returns {number} how many notifications the "N more" button names (0: no button) */
export function moreCount(total, shown) {
    return Math.max(0, (total ?? 0) - (shown ?? 0));
}

/**
 * A damped spring from 0 to 1 (SwiftUI-style: `bounce` 0 is critically damped, 0.3 bouncy;
 * `response` is the period of the undamped oscillation, in the same unit as t).
 * @returns {number} the value at time t; 1 at t >= the settle time is the caller's to snap
 */
export function spring(t, { bounce = 0.15, response = 0.5 } = {}) {
    if (t <= 0)
        return 0;
    const zeta = Math.max(0.05, Math.min(1, 1 - bounce));
    const omega = 2 * Math.PI / response;
    if (zeta >= 1)
        return 1 - Math.exp(-omega * t) * (1 + omega * t);
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * omega * t);
    return 1 - decay * (Math.cos(wd * t) + zeta * omega / wd * Math.sin(wd * t));
}

/**
 * The notification card fits its content: header, title and two lines of body, plus a row of
 * action buttons when there are any.
 * @returns {{w: number, h: number, r: number}}
 */
export function cardSize({ actions }) {
    return { w: 430, h: actions ? 156 : 116, r: GRID.radius };
}
