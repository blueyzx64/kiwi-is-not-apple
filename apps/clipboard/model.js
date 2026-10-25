// SPDX-License-Identifier: GPL-3.0-or-later
// Clipboard history policy. Pure: no gi imports, no Shell, no I/O, so it runs under
// plain `gjs -m` (tests/clipboardModel.test.js). index.js feeds it facts (offered mime
// types, focused app, sizes, a content hash) and acts on what it returns.

export const MiB = 1024 * 1024;

export const DEFAULTS = Object.freeze({
    maxItems: 25,                // unpinned entries kept; pinned ones never count or expire
    maxTextBytes: 256 * 1024,    // longer text is not recorded
    maxImageBytes: 5 * MiB,      // bigger images are not recorded
    maxPreviewChars: 400,        // stored preview length for list rows
    images: true,
    ignoreSensitive: true,
    maxTotalImageBytes: 256 * MiB,   // all image bytes kept (64 MiB when nothing is saved to disk)
    maxTotalTextBytes: 4 * MiB,      // all text bytes kept; keeps history.json small
    maxPinned: 50,
    maxAgeMs: 0,                 // 0 = no expiry for unpinned entries
});

export const MIN_ITEMS = 1;
export const MAX_ITEMS = 500;

/** Mime types a password manager adds to mark a secret (KeePassXC, Klipper/CopyQ convention). */
export const SECRET_MIMES = Object.freeze(['x-kde-passwordManagerHint']);

/**
 * Lowercased app ids / WM classes of password managers. Matched against the focused window
 * when the clipboard changed, as a whole id or as the last dotted part ("org.keepassxc.KeePassXC").
 */
export const PASSWORD_MANAGER_APPS = Object.freeze([
    'keepassxc', 'keepass2', 'keepassx', 'bitwarden', '1password', 'proton pass', 'proton-pass',
    'protonpass', 'enpass', 'lastpass', 'dashlane', 'nordpass', 'keeper', 'buttercup',
    'seahorse', 'gnome-keyring', 'org.gnome.seahorse.application', 'org.gnome.world.secrets',
    'secrets', 'org.gnome.passwordsafe', 'passwordsafe', 'authenticator',
    'com.belmoussaoui.authenticator', 'authy', 'gopass', 'pass', 'passwords', 'psono',
    'strongbox', 'zoho vault', 'roboform', 'myki', 'pwsafe', 'revelation',
]);

const TEXT_MIMES = ['text/plain;charset=utf-8', 'UTF8_STRING', 'text/plain', 'STRING', 'TEXT'];
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/svg+xml'];
export const TEXT_MIME = 'text/plain;charset=utf-8';

export const IMAGE_EXT = Object.freeze({
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
    'image/gif': 'gif', 'image/bmp': 'bmp', 'image/svg+xml': 'svg',
});

/** @returns {string} normalised app key: lowercase, trimmed */
function appKey(app) {
    return typeof app === 'string' ? app.trim().toLowerCase() : '';
}

/** True if the focused app (WM class / app id) is a known or user-listed password manager. */
export function isPasswordManagerApp(app, extra = []) {
    const key = appKey(app);
    if (!key)
        return false;
    const list = new Set([...PASSWORD_MANAGER_APPS, ...extra.map(appKey).filter(Boolean)]);
    if (list.has(key))
        return true;
    const base = key.replace(/\.desktop$/, '');
    if (list.has(base))
        return true;
    const last = base.split('.').pop();
    return list.has(last) && last.length > 4;      // "pass", "secrets" must match the whole id
}

/** True if the offered mime types carry a "this is a secret" marker. */
export function hasSecretHint(mimes) {
    return (mimes ?? []).some(m => SECRET_MIMES.includes(m));
}

/**
 * Should a clipboard change be skipped as a secret?
 *
 * @param {{mimes: string[], app?: string, ignoreSensitive?: boolean, extraApps?: string[]}} f
 */
export function isSecret({ mimes, app, ignoreSensitive = true, extraApps = [] }) {
    if (!ignoreSensitive)
        return false;
    return hasSecretHint(mimes) || isPasswordManagerApp(app, extraApps);
}

/**
 * Pick what to read from the offered mime types.
 *
 * @param {string[]} offered
 * @param {{images?: boolean}} [opts]
 * @returns {{kind: 'text'|'image', mime: string}|null} text wins over an image: apps that copy
 *   both (a spreadsheet cell) want the text, and file managers offer only text/uri-list.
 */
export function pickMime(offered, { images = true } = {}) {
    const list = offered ?? [];
    const text = TEXT_MIMES.find(m => list.includes(m));
    if (text)
        return { kind: 'text', mime: text };
    if (images) {
        const img = IMAGE_MIMES.find(m => list.includes(m));
        if (img)
            return { kind: 'image', mime: img };
    }
    return null;
}

/**
 * @returns {'ok'|'empty'|'too-large'|'disabled'}
 */
export function checkSize(kind, size, limits = {}) {
    const l = { ...DEFAULTS, ...limits };
    if (kind === 'image' && !l.images)
        return 'disabled';
    if (!(size > 0))
        return 'empty';
    const max = kind === 'image' ? l.maxImageBytes : l.maxTextBytes;
    return size > max ? 'too-large' : 'ok';
}

/** Whitespace-only text is not worth keeping. */
export function isBlankText(text) {
    return typeof text !== 'string' || text.trim().length === 0;
}

/**
 * Is recording allowed right now?
 *
 * @param {{enabled: boolean, recording: boolean, locked: boolean}} s
 */
export function shouldRecord({ enabled, recording, locked }) {
    return !!enabled && !!recording && !locked;
}

const URL_RE = /^(?:https?|ftp|file|mailto|sftp|ssh):\/\/?[^\s]+$|^mailto:[^\s@]+@[^\s@]+$|^www\.[^\s.]+\.[^\s]+$/i;
const COLOR_RE = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|hsl)a?\([^)]{3,60}\))$/i;

/** @returns {'link'|'color'|'text'} */
export function classifyText(text) {
    const t = (text ?? '').trim();
    if (!t || t.includes('\n'))
        return 'text';
    if (COLOR_RE.test(t))
        return 'color';
    if (URL_RE.test(t))
        return 'link';
    return 'text';
}

/** First-line preview, collapsed whitespace, cut to `max` characters. */
export function previewOf(text, max = DEFAULTS.maxPreviewChars) {
    const flat = (text ?? '').replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Build an entry. `hash` is the caller's content hash (sha256 hex of the bytes); two entries
 * with the same kind and hash are the same item.
 *
 * @param {object} p
 * @param {'text'|'image'} p.kind
 * @param {string} p.hash
 * @param {string} p.mime
 * @param {number} p.size bytes
 * @param {number} p.time ms since epoch
 * @param {string} [p.text] text entries
 * @param {string} [p.app] source app name
 * @param {string} [p.file] image file name inside the store (persisted images)
 * @param {number} [p.width] image px
 * @param {number} [p.height]
 */
export function makeEntry(p) {
    const e = {
        id: `${p.kind}:${p.hash}`,
        kind: p.kind,
        type: p.kind === 'image' ? 'image' : classifyText(p.text),
        hash: p.hash,
        mime: p.mime,
        size: p.size,
        time: p.time,
        app: p.app ?? '',
        pinned: false,
    };
    if (p.kind === 'text') {
        e.text = p.text;
        e.preview = previewOf(p.text);
    } else {
        e.file = p.file ?? '';
        if (p.width)
            e.width = p.width;
        if (p.height)
            e.height = p.height;
    }
    return e;
}

function clampItems(n) {
    const v = Math.trunc(Number(n));
    if (!Number.isFinite(v))
        return DEFAULTS.maxItems;
    return Math.min(MAX_ITEMS, Math.max(MIN_ITEMS, v));
}

/**
 * Newest-first history. Pinned entries sort first in list() but keep their own recency
 * order, never count toward the cap and never age out.
 */
export class History {
    constructor(opts = {}) {
        this._max = clampItems(opts.maxItems ?? DEFAULTS.maxItems);
        this._maxAge = Math.max(0, opts.maxAgeMs ?? DEFAULTS.maxAgeMs);
        this._maxImageTotal = opts.maxTotalImageBytes ?? DEFAULTS.maxTotalImageBytes;
        this._maxTextTotal = opts.maxTotalTextBytes ?? DEFAULTS.maxTotalTextBytes;
        this._maxPinned = opts.maxPinned ?? DEFAULTS.maxPinned;
        this._items = [];        // newest first
    }

    get maxItems() {
        return this._max;
    }

    get size() {
        return this._items.length;
    }

    /** Raw array, newest first (do not mutate). */
    get items() {
        return this._items;
    }

    get(id) {
        return this._items.find(e => e.id === id) ?? null;
    }

    /**
     * Add an entry.
     *
     * @param {object} entry from makeEntry()
     * @returns {{status: 'added'|'bumped'|'same', entry: object, evicted: object[]}}
     *   'same' = it is already the newest entry (nothing changed, e.g. our own paste).
     *   'bumped' = a duplicate moved to the top; pin and first-seen app are kept, time updates.
     *   'refused' = it can never fit the byte budget, because pinned entries already use it.
     *   evicted: entries pushed out by the cap; the store deletes their files.
     */
    add(entry) {
        const at = this._items.findIndex(e => e.id === entry.id);
        if (at === 0) {
            this._items[0].time = entry.time;
            return { status: 'same', entry: this._items[0], evicted: [] };
        }
        if (at > 0) {
            const [old] = this._items.splice(at, 1);
            old.time = entry.time;
            if (entry.app)
                old.app = entry.app;
            this._items.unshift(old);
            return { status: 'bumped', entry: old, evicted: [] };
        }
        if (!this._fits(entry))
            return { status: 'refused', entry, evicted: [] };
        this._items.unshift(entry);
        return { status: 'added', entry, evicted: this._trim() };
    }

    remove(id) {
        const at = this._items.findIndex(e => e.id === id);
        return at < 0 ? null : this._items.splice(at, 1)[0];
    }

    /** @returns {boolean|null} the new pinned state, null for an unknown id */
    togglePin(id) {
        const e = this.get(id);
        if (!e)
            return null;
        if (!e.pinned) {
            // Pinned entries are never evicted, so they are capped by count and by bytes
            if (this._items.filter(x => x.pinned).length >= this._maxPinned)
                return null;
            if (this._bytes(e.kind, true) + e.size > this._budget(e.kind))
                return null;
        }
        e.pinned = !e.pinned;
        return e.pinned;
    }

    /** Change limits (settings changed). @returns {object[]} evicted */
    configure(opts) {
        if (opts.maxItems !== undefined)
            this._max = clampItems(opts.maxItems);
        if (opts.maxTotalImageBytes !== undefined)
            this._maxImageTotal = opts.maxTotalImageBytes;
        if (opts.maxTotalTextBytes !== undefined)
            this._maxTextTotal = opts.maxTotalTextBytes;
        return this._trim();
    }

    _budget(kind) {
        return kind === 'image' ? this._maxImageTotal : this._maxTextTotal;
    }

    _bytes(kind, pinnedOnly = false) {
        let n = 0;
        for (const e of this._items) {
            if (e.kind === kind && (!pinnedOnly || e.pinned))
                n += e.size;
        }
        return n;
    }

    _fits(entry) {
        return this._bytes(entry.kind, true) + entry.size <= this._budget(entry.kind);
    }

    /**
     * Remove everything unpinned (or everything).
     *
     * @returns {object[]} removed entries
     */
    clear({ keepPinned = true } = {}) {
        const gone = this._items.filter(e => !(keepPinned && e.pinned));
        this._items = this._items.filter(e => keepPinned && e.pinned);
        return gone;
    }

    /** @returns {object[]} entries evicted by the new cap */
    setMaxItems(n) {
        this._max = clampItems(n);
        return this._trim();
    }

    /** Drop unpinned entries older than maxAge. @returns {object[]} removed */
    expire(now) {
        if (!this._maxAge)
            return [];
        const gone = this._items.filter(e => !e.pinned && now - e.time > this._maxAge);
        if (gone.length)
            this._items = this._items.filter(e => !gone.includes(e));
        return gone;
    }

    /**
     * Rows for a view: pinned first, then recent, each newest first.
     *
     * @param {{filter?: 'all'|'text'|'links'|'images', query?: string}} [q]
     * @returns {{pinned: object[], recent: object[]}}
     */
    view({ filter = 'all', query = '' } = {}) {
        const needle = query.trim().toLowerCase();
        const match = e => {
            if (filter === 'text' && !(e.kind === 'text' && e.type !== 'link'))
                return false;
            if (filter === 'links' && e.type !== 'link')
                return false;
            if (filter === 'images' && e.kind !== 'image')
                return false;
            if (!needle)
                return true;
            return e.kind === 'text'
                ? e.text.toLowerCase().includes(needle) || e.app.toLowerCase().includes(needle)
                : 'image'.includes(needle) || e.app.toLowerCase().includes(needle);
        };
        const rows = this._items.filter(match);
        return { pinned: rows.filter(e => e.pinned), recent: rows.filter(e => !e.pinned) };
    }

    /** File names (images) that live entries still need. */
    referencedFiles() {
        return new Set(this._items.filter(e => e.kind === 'image' && e.file).map(e => e.file));
    }

    _trim() {
        const evicted = [];
        let unpinned = 0;
        // Newest first: keep the first `max` unpinned entries, evict the rest
        this._items = this._items.filter(e => {
            if (e.pinned)
                return true;
            unpinned++;
            if (unpinned <= this._max)
                return true;
            evicted.push(e);
            return false;
        });
        // Byte budgets, per kind: drop the oldest unpinned until the total fits
        for (const kind of ['image', 'text']) {
            let total = this._bytes(kind);
            for (let i = this._items.length - 1; i >= 0 && total > this._budget(kind); i--) {
                const e = this._items[i];
                if (e.kind !== kind || e.pinned)
                    continue;
                this._items.splice(i, 1);
                evicted.push(e);
                total -= e.size;
            }
        }
        return evicted;
    }
}

/* ------------------------------------------------------------ persistence */

export const INDEX_VERSION = 1;

/** The JSON text of history.json. Images are not inlined: only their file names. */
export function serializeHistory(history) {
    return JSON.stringify({ version: INDEX_VERSION, items: history.items });
}

const SAFE_FILE = /^[0-9a-f]{64}\.(?:png|jpg|webp|gif|bmp|svg)$/;

/** True if `name` is a file name the store itself would have written (no paths, no dots). */
export function isStoreFileName(name) {
    return typeof name === 'string' && SAFE_FILE.test(name);
}

/** The file name an image entry is stored under. */
export function imageFileName(hash, mime) {
    const ext = IMAGE_EXT[mime];
    return ext ? `${hash}.${ext}` : '';
}

/**
 * Rebuild entries from history.json text. Anything malformed is dropped, never thrown:
 * a damaged file must not stop the extension from enabling.
 *
 * @param {string} json
 * @param {object} [limits] see DEFAULTS; also re-applied here (the user may have lowered them)
 * @returns {object[]} entries, newest first
 */
export function parseHistory(json, limits = {}) {
    const l = { ...DEFAULTS, ...limits };
    let data;
    try {
        data = JSON.parse(json);
    } catch (_e) {
        return [];
    }
    if (!data || data.version !== INDEX_VERSION || !Array.isArray(data.items))
        return [];
    const seen = new Set();
    const out = [];
    for (const raw of data.items) {
        if (!raw || typeof raw !== 'object' || typeof raw.hash !== 'string' || !raw.hash)
            continue;
        const time = Number.isFinite(raw.time) ? raw.time : 0;
        const size = Number.isFinite(raw.size) ? raw.size : 0;
        let e;
        if (raw.kind === 'text' && typeof raw.text === 'string') {
            if (isBlankText(raw.text) || checkSize('text', size || raw.text.length, l) !== 'ok')
                continue;
            e = makeEntry({
                kind: 'text', hash: raw.hash, mime: TEXT_MIME, size, time,
                text: raw.text, app: typeof raw.app === 'string' ? raw.app : '',
            });
        } else if (raw.kind === 'image' && isStoreFileName(raw.file)) {
            if (checkSize('image', size, l) !== 'ok')
                continue;
            e = makeEntry({
                kind: 'image', hash: raw.hash, mime: typeof raw.mime === 'string' ? raw.mime : 'image/png',
                size, time, file: raw.file, app: typeof raw.app === 'string' ? raw.app : '',
                width: raw.width, height: raw.height,
            });
        } else {
            continue;
        }
        if (seen.has(e.id))
            continue;
        seen.add(e.id);
        e.pinned = raw.pinned === true;
        out.push(e);
    }
    return out;
}

/** Build a History from parsed entries (applies the cap; returns evicted too). */
export function historyFrom(entries, opts = {}) {
    const h = new History(opts);
    h._items = [...entries].sort((a, b) => b.time - a.time);
    return { history: h, evicted: h._trim() };
}

/** Image files in the store folder that no entry references (safe to delete: Kiwi wrote them). */
export function orphanFiles(listed, history) {
    const used = history.referencedFiles();
    return listed.filter(name => isStoreFileName(name) && !used.has(name));
}

/* --------------------------------------------------------------- paste */

const TERMINAL_HINTS = [
    'gnome-terminal', 'kgx', 'org.gnome.console', 'org.gnome.terminal', 'ptyxis',
    'org.gnome.ptyxis', 'tilix', 'kitty', 'alacritty', 'xterm', 'konsole', 'terminator',
    'foot', 'wezterm', 'org.wezfurlong.wezterm', 'xfce4-terminal', 'urxvt', 'st-256color',
    'guake', 'yakuake', 'terminology', 'cool-retro-term', 'blackbox', 'com.raggesilver.blackbox',
    'contour', 'rio', 'ghostty', 'com.mitchellh.ghostty',
];

/** Which paste chord the previous focus wants: terminals use Ctrl+Shift+V. */
export function pasteChordFor(wmClass) {
    const k = appKey(wmClass);
    return k && TERMINAL_HINTS.some(t => k === t || k.endsWith(`.${t}`)) ? 'ctrl-shift-v' : 'ctrl-v';
}

/** "2 min ago" style age as [unit, n] so the view can translate it. */
export function ageOf(then, now) {
    const s = Math.max(0, Math.floor((now - then) / 1000));
    if (s < 45)
        return ['now', 0];
    if (s < 3600)
        return ['minutes', Math.max(1, Math.round(s / 60))];
    if (s < 86400)
        return ['hours', Math.round(s / 3600)];
    return ['days', Math.round(s / 86400)];
}
