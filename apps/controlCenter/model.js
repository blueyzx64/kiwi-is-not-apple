// SPDX-License-Identifier: GPL-3.0-or-later
// Control Center layout model. Pure functions, no gi imports, so it runs under `gjs -m`.
//
// The stock Quick Settings grid is a flow layout with N columns and a per-child column
// span. The Control Center runs it with 4 columns (a half-width stock tile is span 2) and
// decides, from this table, the order and span of every item.

export const COLUMNS = 4;

/** Block order, top to bottom. */
export const GROUPS = [
    'connectivity', 'focus', 'display', 'sound', 'media', 'toggles', 'kiwi',
    'background', 'extras', 'notifications', 'system',
];

export const MORE_HEADER_ID = 'kiwi:more-header';

// key -> [group, rank inside the group, span in 4 columns, compact]
// A compact item is a secondary on/off toggle: when the shell says it can be (a plain
// QuickToggle, no menu), it becomes a 1x1 icon-only square, like the small tiles of macOS.
// Otherwise it keeps a 2-column labelled tile.
const STOCK = {
    'wifi': ['connectivity', 0, 2],
    'bluetooth': ['connectivity', 1, 2],
    'vpn': ['connectivity', 2, 2],
    'wired': ['connectivity', 3, 2],
    'modem': ['connectivity', 4, 2],
    'bt-tether': ['connectivity', 5, 2],

    'dnd': ['focus', 0, 2],
    'dark-style': ['focus', 1, 1, true],
    'night-light': ['focus', 2, 1, true],

    'brightness': ['display', 0, 4],

    'volume-out': ['sound', 0, 4],
    'volume-in': ['sound', 1, 4],

    'now-playing': ['media', 0, 4],

    'backlight': ['toggles', 0, 2],
    'power-saver': ['toggles', 1, 2],
    'remote-access': ['toggles', 2, 2],
    'airplane': ['toggles', 3, 1, true],
    'rotation': ['toggles', 4, 1, true],
    'location': ['toggles', 5, 1, true],
    'camera': ['toggles', 6, 1, true],
    'thunderbolt': ['toggles', 7, 1, true],
    'unsafe': ['toggles', 8, 1, true],

    'kiwi-toggles': ['kiwi', 0, 4],

    'background-apps': ['background', 0, 4],
    'notifications': ['notifications', 0, 4],
    'system': ['system', 0, 4],
};

/**
 * The Kiwi feature tiles of the Control Center, in display order. Each is bound to the
 * boolean settings key that switches the feature on. The Control Center itself is
 * deliberately absent: switching it off from inside would take the switch away.
 */
// Marks a label for translation (xgettext -kN_); the adapter translates it with gettext
const N_ = s => s;

export const KIWI_TOGGLES = [
    { key: 'notch', icon: 'preferences-system-notifications-symbolic', label: N_('Notch') },
    { key: 'stage-manager', icon: 'view-paged-symbolic', label: N_('Stage Manager') },
    { key: 'show-window-controls', icon: 'kiwi-buttons-symbolic', label: N_('Window Buttons') },
    { key: 'clipboard-history', icon: 'edit-paste-symbolic', label: N_('Clipboard') },
    { key: 'spotlight', icon: 'system-search-symbolic', label: N_('Spotlight') },
    { key: 'liquid-glass', icon: 'weather-fog-symbolic', label: N_('Liquid Glass') },
    { key: 'rounded-corners', icon: 'window-restore-symbolic', label: N_('Rounded Corners') },
    { key: 'show-desktop-button', icon: 'kiwi-show-desktop-symbolic', label: N_('Show Desktop') },
];

/** Columns of the Kiwi tile module. */
export const KIWI_COLUMNS = 4;

/**
 * The Kiwi tiles to build, given which keys the schema has, with their cell in the
 * module's own grid.
 *
 * @param {(key: string) => boolean} hasKey
 * @returns {{key: string, icon: string, label: string, column: number, row: number}[]}
 */
export function kiwiTiles(hasKey) {
    return KIWI_TOGGLES
        .filter(t => t.key !== 'control-center' && hasKey(t.key))
        .map((t, i) => ({ ...t, column: i % KIWI_COLUMNS, row: Math.floor(i / KIWI_COLUMNS) }));
}

export function isKnownKey(key) {
    return Object.hasOwn(STOCK, key);
}

/**
 * Where one item goes. Unknown items (other extensions' toggles) land in "extras" and keep
 * their stock look: a stock span of 1 of 2 columns becomes 2 of 4.
 *
 * @param {{key: ?string, stockSpan?: number, compactable?: boolean}} entry
 * @returns {{group: string, rank: number, span: number, compact: boolean}}
 */
export function place(entry) {
    if (entry.key && Object.hasOwn(STOCK, entry.key)) {
        const [group, rank, span, compact = false] = STOCK[entry.key];
        if (compact && !entry.compactable)
            return { group, rank, span: 2, compact: false };
        return { group, rank, span, compact };
    }
    const span = Math.min(COLUMNS, Math.max(1, (entry.stockSpan ?? 1) * 2));
    return { group: 'extras', rank: 0, span, compact: false };
}

/**
 * Order and spans for the whole grid.
 *
 * Inside a group the labelled tiles come first and the compact (icon-only) ones after them,
 * so the squares fill the free half of a row. Visible items of one group are packed into
 * rows of COLUMNS; a row that would end short gets its last item widened, so no block
 * shares a row with the next one. A compact square that is widened gets its label back
 * (a wide icon-only tile reads as a bug). Hidden items keep their place in the order (they
 * may appear later) and are not counted.
 * The "More" header comes before the extras and is visible only when an extra is.
 *
 * @param {{id: string, key: ?string, stockSpan?: number, visible: boolean,
 *   compactable?: boolean}[]} entries
 * @returns {{id: string, group: string, span: number, visible: boolean, compact: boolean}[]}
 */
export function planLayout(entries) {
    const items = entries.map((entry, index) => ({
        id: entry.id,
        index,
        visible: entry.visible,
        ...place(entry),
    }));

    const extrasVisible = items.some(i => i.group === 'extras' && i.visible);
    items.push({
        id: MORE_HEADER_ID, index: -1, visible: extrasVisible,
        group: 'extras', rank: -1, span: COLUMNS, compact: false,
    });

    items.sort((a, b) =>
        GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) ||
        Number(a.compact) - Number(b.compact) ||
        a.rank - b.rank || a.index - b.index);

    for (const group of GROUPS) {
        let row = [];
        let used = 0;
        const close = () => {
            if (row.length && used < COLUMNS) {
                const last = row[row.length - 1];
                last.span += COLUMNS - used;
                last.compact = false;
            }
            row = [];
            used = 0;
        };
        for (const item of items.filter(i => i.group === group && i.visible)) {
            if (used + item.span > COLUMNS)
                close();
            row.push(item);
            used += item.span;
        }
        close();
    }

    return items.map(({ id, group, span, visible, compact }) => ({ id, group, span, visible, compact }));
}

/**
 * The order to put back on disable. The grid may have been rebuilt, or items removed or
 * re-parented by others, since the snapshot: only ids that are still in the live grid are
 * kept, in their saved order. Ids that appeared since go after them, in live order.
 *
 * Works on any identity values (ids in tests, actors in the shell adapter).
 *
 * @param {string[]} saved
 * @param {string[]} live items currently in the grid, in current order
 * @returns {string[]}
 */
export function restoreOrder(saved, live) {
    const liveSet = new Set(live);
    const keep = saved.filter(id => liveSet.has(id));
    const keepSet = new Set(keep);
    return [...keep, ...live.filter(id => !keepSet.has(id))];
}

// UPower.DeviceState values (not imported here to stay free of gi)
export const BATTERY_STATE = { CHARGING: 1, DISCHARGING: 2, FULLY_CHARGED: 4 };

/**
 * What the user row says about time. Returns null when UPower has no estimate.
 *
 * @param {{state: number, toEmpty: number, toFull: number}} battery seconds, 0 = unknown
 * @returns {{kind: 'remaining'|'until-full', hours: number, minutes: number}|null}
 */
export function batteryTime({ state, toEmpty, toFull }) {
    let kind = null;
    let seconds = 0;
    if (state === BATTERY_STATE.DISCHARGING) {
        kind = 'remaining';
        seconds = toEmpty;
    } else if (state === BATTERY_STATE.CHARGING) {
        kind = 'until-full';
        seconds = toFull;
    }
    if (!kind || !Number.isFinite(seconds) || seconds <= 0 || seconds > 99 * 3600)
        return null;
    const total = Math.round(seconds / 60);
    return { kind, hours: Math.floor(total / 60), minutes: total % 60 };
}

/** Old key -> new key, for runMigrations (run once from extension.js enable()). */
export const MIGRATIONS = [
    { from: 'add-username-to-quick-menu', to: 'control-center-user-row' },
];
