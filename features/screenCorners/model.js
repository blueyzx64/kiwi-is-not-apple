// SPDX-License-Identifier: GPL-3.0-or-later
// Screen corners: pure decisions and geometry. No gi:// imports (tests run it under gjs -m).
//
// A MacBook's display has rounded top corners; Kiwi draws them in software: a black cap in
// each corner of every monitor, the area outside a quarter circle of the chosen radius.

export const RADIUS_MIN = 4;
export const RADIUS_MAX = 24;
export const RADIUS_DEFAULT = 12;

/** Which corners are rounded: the `screen-corners-which` setting. */
export const WHICH_VALUES = Object.freeze(['top', 'all']);
export const WHICH_DEFAULT = 'top';

/** @returns {number} the radius in logical pixels, inside the allowed range (junk: the default) */
export function clampRadius(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n))
        return RADIUS_DEFAULT;
    return Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, n));
}

/**
 * The caps of one monitor. Each cap is a square of the radius in the corner; flipX / flipY say
 * how the top-left shape is mirrored to fit it.
 *
 * @param {{x: number, y: number, width: number, height: number}} monitor
 * @param {number} radius logical pixels
 * @param {string} which 'top' or 'all' (junk: the default)
 * @returns {{corner: string, x: number, y: number, size: number, flipX: boolean, flipY: boolean}[]}
 */
export function cornerCaps(monitor, radius, which) {
    const r = clampRadius(radius);
    const all = (WHICH_VALUES.includes(which) ? which : WHICH_DEFAULT) === 'all';
    const left = monitor.x;
    const right = monitor.x + monitor.width - r;
    const top = monitor.y;
    const bottom = monitor.y + monitor.height - r;
    const caps = [
        { corner: 'top-left', x: left, y: top, size: r, flipX: false, flipY: false },
        { corner: 'top-right', x: right, y: top, size: r, flipX: true, flipY: false },
    ];
    if (all) {
        caps.push({ corner: 'bottom-right', x: right, y: bottom, size: r, flipX: true, flipY: true });
        caps.push({ corner: 'bottom-left', x: left, y: bottom, size: r, flipX: false, flipY: true });
    }
    return caps;
}
