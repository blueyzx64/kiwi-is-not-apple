// SPDX-License-Identifier: GPL-3.0-or-later
// Kiwi design system: the sizes code needs (St CSS has no variables). The look itself is the
// shared component classes in styles/base.css; docs/architecture/design-system.md describes
// both. Pure values, no gi imports: features and tests import them freely.
//
//   import { SPACE, RADIUS, ICON_WELL, TOOLBAR, iconSizeFor } from '../../lib/designTokens.js';

/** Spacing scale (logical px, 4-px grid). */
export const SPACE = Object.freeze({ xs: 4, s: 8, m: 12, l: 16, xl: 20 });

/** Corner radii (logical px). Inner radius = outer radius - padding (concentric). */
export const RADIUS = Object.freeze({
    control: 8,     // small buttons, chips, key caps
    row: 10,        // a selectable row inside a card or panel (panel 18 - padding 8)
    menu: 12,       // popup menus
    card: 18,       // cards, modules, banners (16-20)
    panel: 26,      // panels and overlays (24-28): Control Center, Notification Center, Launchpad
    capsule: 999,   // search fields, toolbar buttons, pills
});

/**
 * Icon wells: one fixed box per size so every row's icon lines up whatever the icon file's own
 * padding. `box` is the well, `icon` a full-colour icon drawn inside it (box - 2 x inset),
 * `glyph` a symbolic icon on the well's fill (.kiwi-icon-well-rounded / -circle).
 * S: menus, toolbar buttons; M: list rows; L: top hits, notifications; XL: app grids.
 */
export const ICON_WELL = Object.freeze({
    S: Object.freeze({ box: 20, icon: 16, glyph: 12 }),
    M: Object.freeze({ box: 32, icon: 28, glyph: 18 }),
    L: Object.freeze({ box: 44, icon: 40, glyph: 24 }),
    XL: Object.freeze({ box: 64, icon: 56, glyph: 32 }),
});

/** The search capsule and its circular toolbar buttons share one height rhythm. */
export const SEARCH_BAR = Object.freeze({ height: 48, padding: 4, glyph: 20 });
export const TOOLBAR = Object.freeze({ button: 32, icon: 16, spacing: 8 });

/** The icon size drawn in a well of this size name ('M' when unknown); symbolic: the glyph size. */
export function iconSizeFor(size, symbolic = false) {
    const well = ICON_WELL[size] ?? ICON_WELL.M;
    return symbolic ? well.glyph : well.icon;
}

/** Style classes of an icon well: size S/M/L/XL, shape 'none' | 'rounded' | 'circle'. */
export function wellClasses(size, shape = 'none') {
    const key = ICON_WELL[size] ? size : 'M';
    const out = ['kiwi-icon-well', `kiwi-icon-well-${key.toLowerCase()}`];
    if (shape === 'rounded' || shape === 'circle')
        out.push(`kiwi-icon-well-${shape}`);
    return out.join(' ');
}

/** Corner radius of a surface whose content sits `padding` px in from an `outer` corner. */
export function innerRadius(outer, padding) {
    return Math.max(0, outer - padding);
}
