// SPDX-License-Identifier: GPL-3.0-or-later
// The volume / brightness pill: what it says and where it goes. Pure (no gi imports).
//
// Two looks (osd-style):
//   'golden-gate'  macOS 27.2: one larger icon on the left, a segmented level bar, centred under
//                  the menu-bar item that matches the change (Sound, Keyboard Brightness), else
//                  under the Control Center button
//   'tahoe'        macOS 26: icon, caption and a continuous track, its right edge on the Control
//                  Center button

/** How long the pill stays after the last change (the stock OSD's HIDE_TIMEOUT). */
export const VISIBLE_MS = 1500;

/** Pill geometry, logical px. The track is what is left of the width after icon and padding. */
export const PILL = Object.freeze({ width: 248, height: 52, padding: 14, icon: 20, spacing: 12, gap: 6, margin: 8 });
export const TRACK_WIDTH = PILL.width - 2 * PILL.padding - PILL.icon - PILL.spacing;

const FALLBACK_ICONS = Object.freeze({
    'brightness': 'display-brightness-symbolic',
    'keyboard-backlight': 'keyboard-brightness-symbolic',
});

/**
 * The name to show for an output: the port (Speakers, Headphones) when the card has one,
 * else the device description.
 *
 * @param {?string} description Gvc stream description
 * @param {?string} port the active port's human name
 * @returns {?string}
 */
export function deviceLabel(description, port) {
    return port?.trim() || description?.trim() || null;
}

/** The volume icon for a level, as GNOME names them. */
export function volumeIconName(fraction, muted) {
    if (muted || !fraction)
        return 'audio-volume-muted-symbolic';
    if (fraction < 1 / 3)
        return 'audio-volume-low-symbolic';
    return fraction < 2 / 3 ? 'audio-volume-medium-symbolic' : 'audio-volume-high-symbolic';
}

/**
 * What the pill shows for one routed OSD.
 *
 * @param {{kind: string, muted: boolean, fraction: ?number}} osd from core/osdModel classifyOsd
 * @param {{device: ?string, deviceMuted: boolean}} audio the default output, read from the mixer
 * @param {Function} _ gettext
 * @returns {{caption: string, iconName: string, fill: number, muted: boolean, accessibleName: string}}
 */
export function pillContent(osd, audio, _) {
    const volume = osd.kind === 'volume';
    const muted = volume && (osd.muted || audio.deviceMuted);
    const fill = muted ? 0 : Math.max(0, Math.min(1, osd.fraction ?? 0));
    let caption;
    if (volume)
        caption = audio.device ?? _('Volume');
    else
        caption = osd.kind === 'brightness' ? _('Display') : _('Keyboard Backlight');
    const iconName = volume ? volumeIconName(fill, muted) : FALLBACK_ICONS[osd.kind];
    const state = muted ? _('Muted') : `${Math.round(fill * 100)} %`;
    return { caption, iconName, fill, muted, accessibleName: `${caption}: ${state}` };
}

/**
 * Where the pill goes: under the menu bar, its right edge on the Control Center button's,
 * kept inside the monitor.
 *
 * @param {{x: number, y: number, width: number, height: number}} monitor
 * @param {number} barBottom the menu bar's bottom edge (stage y)
 * @param {?{x: number, width: number}} anchor the Control Center button, null if none
 * @returns {{x: number, y: number}}
 */
export function pillPosition(monitor, barBottom, anchor) {
    const right = anchor && anchor.width > 0 ? anchor.x + anchor.width : monitor.x + monitor.width - PILL.margin;
    const minX = monitor.x + PILL.margin;
    const maxX = monitor.x + monitor.width - PILL.margin - PILL.width;
    return { x: Math.round(Math.max(minX, Math.min(maxX, right - PILL.width))), y: Math.round(barBottom + PILL.gap) };
}

// ---- Golden Gate (macOS 27.2) ------------------------------------------------------------

/** Values of osd-style; the first is the default. */
export const OSD_STYLES = Object.freeze(['golden-gate', 'tahoe']);

/** The segmented bar: as many steps as the classic macOS HUD (16 squares). */
export const SEGMENTS = 16;

/** Golden Gate pill geometry, logical px. */
export const GG_PILL = Object.freeze({ width: 236, height: 56, icon: 26, gap: 6, margin: 8 });

/**
 * How many segments are lit for a level. Any audible level lights at least one, so a quiet
 * output never looks muted; muted lights none.
 *
 * @param {?number} fraction 0..1
 * @param {boolean} muted
 * @param {number} [segments]
 * @returns {number}
 */
export function segmentFill(fraction, muted, segments = SEGMENTS) {
    if (muted || !(fraction > 0))
        return 0;
    return Math.max(1, Math.min(segments, Math.round(Math.min(1, fraction) * segments)));
}

/**
 * Which menu-bar item the pill hangs from. Candidates are the on-screen rects of the items
 * (null when not in the menu bar or not mapped):
 *   pinnedSound, pinnedKeyboard  Kiwi's pinned Control Center items (menubar-pinned)
 *   stockVolume, stockBrightness, stockBacklight
 *                                GNOME's own icons inside the system status pill (shown only
 *                                in some states, e.g. the volume icon while there is an output)
 *   controlCenter                the Control Center button (the fallback for every kind)
 *
 * @param {string} kind 'volume' | 'brightness' | 'keyboard-backlight'
 * @param {object} rects
 * @returns {{name: string, rect: {x: number, width: number}}|null}
 */
export function pickAnchor(kind, rects) {
    const order = {
        'volume': ['pinnedSound', 'stockVolume'],
        'brightness': ['stockBrightness'],
        'keyboard-backlight': ['pinnedKeyboard', 'stockBacklight'],
    }[kind] ?? [];
    for (const name of [...order, 'controlCenter']) {
        const rect = rects?.[name];
        if (rect && rect.width > 0)
            return { name, rect };
    }
    return null;
}

/**
 * Where the Golden Gate pill goes: centred under its anchor, just below the menu bar, kept
 * inside the monitor. Without an anchor it sits at the right like the Control Center.
 *
 * @param {{x: number, y: number, width: number, height: number}} monitor
 * @param {number} barBottom
 * @param {?{x: number, width: number}} anchor
 * @param {number} [width]
 * @returns {{x: number, y: number}}
 */
export function ggPosition(monitor, barBottom, anchor, width = GG_PILL.width) {
    const centre = anchor && anchor.width > 0
        ? anchor.x + anchor.width / 2
        : monitor.x + monitor.width - GG_PILL.margin - width / 2;
    const minX = monitor.x + GG_PILL.margin;
    const maxX = monitor.x + monitor.width - GG_PILL.margin - width;
    return {
        x: Math.round(Math.max(minX, Math.min(maxX, centre - width / 2))),
        y: Math.round(barBottom + GG_PILL.gap),
    };
}
