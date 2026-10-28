// SPDX-License-Identifier: GPL-3.0-or-later
// Pure parts of the keybinding service: which Kiwi names are claimed, accelerator
// normalising and conflict detection. No gi imports (tests/keybindingsModel.test.js).

/** Stock GNOME accelerators worth warning about when the live schemas cannot be read. */
export const KNOWN_DEFAULTS = {
    '<super>v': 'org.gnome.shell.keybindings toggle-message-tray',
    '<super>m': 'org.gnome.shell.keybindings toggle-message-tray',
    '<super>space': 'org.gnome.desktop.wm.keybindings switch-input-source',
    '<super>a': 'org.gnome.shell.keybindings toggle-application-view',
    '<super>l': 'org.gnome.settings-daemon.plugins.media-keys screensaver',
};

const MOD_ORDER = ['super', 'ctrl', 'alt', 'shift'];
const MOD_ALIAS = {
    primary: 'ctrl', control: 'ctrl', ctl: 'ctrl', ctrl: 'ctrl',
    mod1: 'alt', alt: 'alt', meta: 'super', mod4: 'super', super: 'super', shift: 'shift',
};

/**
 * Canonical form of a GTK accelerator string, '' when it is empty or not parseable.
 * '<Shift><Super>V' and '<Super><Shift>v' both give '<super><shift>v'.
 */
export function normalizeAccel(accel) {
    if (typeof accel !== 'string')
        return '';
    const mods = new Set();
    let rest = accel.trim();
    for (;;) {
        const m = /^<([A-Za-z0-9_]+)>/.exec(rest);
        if (!m)
            break;
        const mod = MOD_ALIAS[m[1].toLowerCase()];
        if (!mod)
            return '';
        mods.add(mod);
        rest = rest.slice(m[0].length);
    }
    if (!rest || /[<>\s]/.test(rest))
        return '';
    return MOD_ORDER.filter(x => mods.has(x)).map(x => `<${x}>`).join('') + rest.toLowerCase();
}

/**
 * @param {string[]} accels the accelerators we want to bind
 * @param {Map<string,string>|Object} taken normalised accel -> "schema key"
 * @returns {{accel:string, with:string}[]}
 */
export function findConflicts(accels, taken) {
    const lookup = taken instanceof Map ? taken : new Map(Object.entries(taken ?? {}));
    const out = [];
    for (const a of accels ?? []) {
        const n = normalizeAccel(a);
        if (n && lookup.has(n))
            out.push({ accel: a, with: lookup.get(n) });
    }
    return out;
}

/**
 * A GNOME accelerator list with the ones a Kiwi shortcut uses taken out, so Kiwi's binding wins
 * there (Launchpad takes Super+A from toggle-application-view, the clipboard Super+V from
 * toggle-message-tray). Compared normalised; the others keep their order and spelling.
 *
 * @param {string[]} stock the GNOME key's value (the user's)
 * @param {string[]} ours Kiwi's shortcut key
 * @param {(accel: string) => string} [normalize]
 * @returns {string[]}
 */
export function freeAccels(stock, ours, normalize = normalizeAccel) {
    const taken = new Set(ours.map(normalize).filter(Boolean));
    return stock.filter(a => !taken.has(normalize(a)));
}

/**
 * The KNOWN_DEFAULTS entries to fall back on: only those of schemas that could not be read
 * live. A schema that was read is the truth, so a stock accelerator Kiwi took out of it (or the
 * user removed) is not reported again.
 *
 * @param {string[]} missing schema ids that were not installed
 * @returns {Map<string,string>} normalised accel -> "schema key"
 */
export function fallbackDefaults(missing) {
    const gone = new Set(missing);
    return new Map(Object.entries(KNOWN_DEFAULTS).filter(([, where]) => gone.has(where.split(' ')[0])));
}

/** Names claimed by Kiwi, so a second claim (or a leaked one) is noticed instead of silent. */
export class BindingTable {
    constructor() {
        this._names = new Set();
    }

    /** @returns {boolean} false when already claimed */
    claim(name) {
        if (this._names.has(name))
            return false;
        this._names.add(name);
        return true;
    }

    release(name) {
        return this._names.delete(name);
    }

    has(name) {
        return this._names.has(name);
    }

    names() {
        return [...this._names];
    }
}
