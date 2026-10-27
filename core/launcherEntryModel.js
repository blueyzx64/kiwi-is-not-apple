// SPDX-License-Identifier: GPL-3.0-or-later
// The pure side of the LauncherEntry protocol (com.canonical.Unity.LauncherEntry), which apps
// and the owner's installer use to put a progress bar or a count on their dock icon:
//
//   signal Update(s app_uri, a{sv} properties)   app_uri 'application://<desktop id>'
//   properties: count (x), count-visible (b), progress (d 0..1), progress-visible (b),
//               urgent (b) (quicklist is ignored)
//
// Each Update carries only the properties that changed, so the book merges them per app. An
// app's entry is dropped when the bus name that sent it leaves the bus (the app quit).
//
// Pure JS (no gi imports): runs under `gjs -m` in tests.

/**
 * @typedef {object} LauncherEntry
 * @property {number} count
 * @property {boolean} countVisible
 * @property {number} progress 0..1
 * @property {boolean} progressVisible
 * @property {boolean} urgent
 */

const EMPTY = Object.freeze({ count: 0, countVisible: false, progress: 0, progressVisible: false, urgent: false });

// Wire name -> [field, check]
const FIELDS = {
    'count': ['count', v => Number.isFinite(v)],
    'count-visible': ['countVisible', v => typeof v === 'boolean'],
    'progress': ['progress', v => Number.isFinite(v)],
    'progress-visible': ['progressVisible', v => typeof v === 'boolean'],
    'urgent': ['urgent', v => typeof v === 'boolean'],
};

/** 'application://org.gnome.Nautilus.desktop' -> 'org.gnome.Nautilus.desktop', else null. */
export function appIdFromUri(uri) {
    if (typeof uri !== 'string' || !uri.startsWith('application://'))
        return null;
    const id = uri.slice('application://'.length);
    return id.endsWith('.desktop') && !id.includes('/') ? id : null;
}

/** The progress to draw (0..1), or null when the entry shows none. */
export function progressOf(entry) {
    if (!entry?.progressVisible)
        return null;
    return Math.min(1, Math.max(0, entry.progress));
}

/** The count badge text, or null. Large counts are capped like macOS mail ("9999+"). */
export function badgeOf(entry) {
    if (!entry?.countVisible || entry.count <= 0)
        return null;
    return entry.count > 9999 ? '9999+' : String(Math.floor(entry.count));
}

/** True when an entry shows nothing (it can be forgotten). */
const isBlank = e => !e.countVisible && !e.progressVisible && !e.urgent;

export class LauncherEntryBook {
    constructor() {
        this._entries = new Map(); // appId -> {sender, entry}
    }

    /**
     * Merge one Update.
     *
     * @param {string} sender the unique bus name that sent it
     * @param {string} uri app_uri
     * @param {object} props unpacked a{sv}
     * @returns {?string} the app id whose entry changed, or null
     */
    update(sender, uri, props) {
        const appId = appIdFromUri(uri);
        if (!appId || !props || typeof props !== 'object')
            return null;
        const before = this._entries.get(appId)?.entry ?? EMPTY;
        const next = { ...before };
        for (const [wire, value] of Object.entries(props)) {
            const field = FIELDS[wire];
            if (field && field[1](value))
                next[field[0]] = value;
        }
        const same = Object.keys(EMPTY).every(k => next[k] === before[k]);
        if (isBlank(next))
            this._entries.delete(appId);
        else
            this._entries.set(appId, { sender, entry: Object.freeze(next) });
        return same ? null : appId;
    }

    /** @returns {?LauncherEntry} */
    entry(appId) {
        return this._entries.get(appId)?.entry ?? null;
    }

    /** @returns {string[]} senders that have an entry (to watch them leave the bus) */
    senders() {
        return [...new Set([...this._entries.values()].map(e => e.sender))];
    }

    /**
     * The sender left the bus: forget its entries.
     *
     * @returns {string[]} the app ids that lost their entry
     */
    dropSender(sender) {
        const gone = [];
        for (const [appId, e] of this._entries) {
            if (e.sender === sender) {
                this._entries.delete(appId);
                gone.push(appId);
            }
        }
        return gone;
    }

    clear() {
        this._entries.clear();
    }
}
