// SPDX-License-Identifier: GPL-3.0-or-later
// Option (Alt) in Kiwi's menus, as on macOS: while Alt is held with a menu open, items that have
// an alternate show it in place (Minimize -> Minimize All), and choosing the item runs the alternate.
//
//   setAlternate(item, {label, onActivate, accelText})   // once, when the item is built
//   OptionAlternates.attach(menu, cleanup, {enabled})     // per top-level PopupMenu
//   isOptionHeld()                                        // Alt-click on a menu bar item
//
// Alt state: the pointer's modifier mask when the menu opens, then the menu's own key events
// (an open PopupMenu holds the grab, so Alt presses reach its actor). Submenus are walked too.
//
// Shell API: PopupMenu.PopupMenuItem (label, activate), PopupMenu._getMenuItems() (private,
// stable 45-51), PopupSubMenuMenuItem.menu.

import Clutter from 'gi://Clutter';

const ALT_KEYS = new Set([Clutter.KEY_Alt_L, Clutter.KEY_Alt_R, Clutter.KEY_Meta_L, Clutter.KEY_Meta_R,
    Clutter.KEY_ISO_Level3_Shift]);

/** True while Alt (Option) is held, from the pointer's modifier mask. */
export function isOptionHeld() {
    const [, , mods] = global.get_pointer();
    return (mods & Clutter.ModifierType.MOD1_MASK) !== 0;
}

/**
 * Give a menu item an Option alternate. The item's activate handler must ask
 * `alternateShown(item)` to pick what to run (menuItem() in features/menuBar does).
 *
 * @param {PopupMenu.PopupMenuItem} item
 * @param {{label: string, accelText?: string, enabled?: boolean}} alternate
 * @param {?St.Label} [accelLabel] the item's shortcut label, swapped with the text
 */
export function setAlternate(item, alternate, accelLabel = null) {
    item._kiwiAlternate = {
        primary: { label: item.label.text, accelText: accelLabel?.text ?? '', enabled: item.sensitive },
        alternate: { accelText: '', enabled: true, ...alternate },
        accelLabel,
        shown: false,
    };
}

/** Whether the item shows its alternate right now. */
export function alternateShown(item) {
    return !!item?._kiwiAlternate?.shown;
}

function showAlternate(item, on) {
    const alt = item._kiwiAlternate;
    if (!alt || alt.shown === on)
        return;
    alt.shown = on;
    const v = on ? alt.alternate : alt.primary;
    item.label.text = v.label;
    if (alt.accelLabel) {
        alt.accelLabel.text = v.accelText;
        alt.accelLabel.visible = !!v.accelText;
    }
    item.setSensitive(v.enabled);
}

function walk(menu, fn) {
    for (const item of menu?._getMenuItems?.() ?? []) {
        fn(item);
        if (item.menu && item.menu !== menu)
            walk(item.menu, fn);
    }
}

/** Show or hide every alternate in a menu (and its submenus). */
export function showAlternates(menu, on) {
    walk(menu, item => showAlternate(item, on));
}

export const OptionAlternates = {
    /**
     * Swap a menu's alternates with Alt while it is open; back to the primaries on close.
     *
     * @param {PopupMenu.PopupMenu} menu
     * @param {CleanupRegistry} cleanup
     * @param {{enabled: () => boolean}} opts
     */
    attach(menu, cleanup, { enabled }) {
        const sync = held => showAlternates(menu, enabled() && held);
        cleanup.connect(menu, 'open-state-changed', (_m, open) => sync(open && isOptionHeld()));
        cleanup.connect(menu.actor, 'captured-event', (_a, event) => {
            const type = event.type();
            if (type !== Clutter.EventType.KEY_PRESS && type !== Clutter.EventType.KEY_RELEASE)
                return Clutter.EVENT_PROPAGATE;
            if (ALT_KEYS.has(event.get_key_symbol()))
                sync(type === Clutter.EventType.KEY_PRESS);
            return Clutter.EVENT_PROPAGATE;
        });
    },
};
