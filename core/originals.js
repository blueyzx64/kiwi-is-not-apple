// SPDX-License-Identifier: GPL-3.0-or-later
// Saved originals: the user's own value of every GNOME setting Kiwi takes over.
//
// Kiwi sometimes has to write a setting that belongs to GNOME (the window button-layout today;
// later edge-tiling, dynamic-workspaces, hot corners, dock and keybinding keys). Each such key
// is owned through a SettingOwner, which first stores the user's value in Kiwi's own key
// `saved-originals` and only then writes Kiwi's value. Giving the key back writes the stored
// value and forgets it.
//
// Crash safety: the store lives in GSettings, so a value saved by a session that crashed, or
// that was killed before disable(), is still there. extension.js calls restoreStale() once,
// before any feature runs; every stored value is written back. Nothing depends on disable().
//
//   const owner = new SettingOwner(ctx.originals, wmSettings, 'button-layout', {
//       type: 's', transform: original => stripButtons(original),
//       onOriginalChanged: () => ...,   // the user changed the key while Kiwi held it
//   });
//   owner.sync(true);    // take it (saves the original once)
//   owner.reapply();     // Kiwi's inputs changed: write transform(original) again
//   owner.release();     // the user's value back
//
// A string list shared with the Shell and the user (org.gnome.shell enabled-extensions) is not
// owned whole: a ListMembersOwner takes only some members out (Dash to Dock while Kiwi's dock
// runs) and puts back just those, so every other change made meanwhile is kept. Its store entry
// has mode 'members' and holds the members that were present; restoreStale() adds them back.
//
// No gi imports: settings objects are passed in (Gio.Settings in the Shell, fakes in tests).

/** Kiwi key holding the store: JSON {"<schema>::<key>": {"type": "s", "value": ...}}. */
export const STORE_KEY = 'saved-originals';

const GETTERS = {
    b: (gs, k) => gs.get_boolean(k),
    i: (gs, k) => gs.get_int(k),
    u: (gs, k) => gs.get_uint(k),
    d: (gs, k) => gs.get_double(k),
    s: (gs, k) => gs.get_string(k),
    as: (gs, k) => gs.get_strv(k),
};

const SETTERS = {
    b: (gs, k, v) => gs.set_boolean(k, !!v),
    i: (gs, k, v) => gs.set_int(k, v),
    u: (gs, k, v) => gs.set_uint(k, v),
    d: (gs, k, v) => gs.set_double(k, v),
    s: (gs, k, v) => gs.set_string(k, String(v)),
    as: (gs, k, v) => gs.set_strv(k, Array.isArray(v) ? v : []),
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Store id of one key of one schema. */
export function originalId(schemaId, key) {
    return `${schemaId}::${key}`;
}

/** Parse a store id back: {schemaId, key}, or null. */
export function parseOriginalId(id) {
    const i = id.lastIndexOf('::');
    return i > 0 ? { schemaId: id.slice(0, i), key: id.slice(i + 2) } : null;
}

/**
 * The store. Reads and writes the whole JSON text through the Kiwi settings object, so two
 * owners of different keys never lose each other's entry.
 */
export class OriginalsStore {
    /** @param {{get_string: Function, set_string: Function}} kiwiSettings */
    constructor(kiwiSettings) {
        this._gs = kiwiSettings;
    }

    _read() {
        try {
            const data = JSON.parse(this._gs.get_string(STORE_KEY) || '{}');
            return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        } catch (e) {
            console.error('[Kiwi] saved originals unreadable, starting empty:', e);
            return {};
        }
    }

    _write(data) {
        const text = Object.keys(data).length ? JSON.stringify(data) : '';
        if (this._gs.get_string(STORE_KEY) !== text)
            this._gs.set_string(STORE_KEY, text);
    }

    /** @returns {string[]} stored ids */
    ids() {
        return Object.keys(this._read());
    }

    /** @returns {?{type: string, value: *}} */
    get(id) {
        return this._read()[id] ?? null;
    }

    /**
     * Save a value, replacing any stored one.
     *
     * @param {string} id
     * @param {string} type GVariant type
     * @param {*} value
     * @param {string} [mode] 'members' for a ListMembersOwner entry (value: the members to add
     *   back), omitted for a whole value
     */
    set(id, type, value, mode = undefined) {
        if (!GETTERS[type])
            throw new Error(`originals: unsupported type '${type}'`);
        const data = this._read();
        const entry = mode ? { type, value, mode } : { type, value };
        if (same(data[id], entry))
            return;
        data[id] = entry;
        this._write(data);
    }

    forget(id) {
        const data = this._read();
        if (!(id in data))
            return;
        delete data[id];
        this._write(data);
    }
}

/** `list` with every one of `members` it lacks appended (order of `list` kept). */
export function withMembers(list, members) {
    const out = [...list];
    for (const m of members ?? []) {
        if (!out.includes(m))
            out.push(m);
    }
    return out;
}

/**
 * Write back every stored original and empty the store. Used once at startup: anything still
 * stored was not given back by the last session.
 *
 * @param {OriginalsStore} store
 * @param {(schemaId: string) => ?object} openSettings a Gio.Settings for a schema, or null
 *   when the schema is not installed (the entry is then dropped)
 * @returns {string[]} ids written back
 */
export function restoreStale(store, openSettings) {
    const restored = [];
    for (const id of store.ids()) {
        const entry = store.get(id);
        const parsed = parseOriginalId(id);
        try {
            const gs = parsed ? openSettings(parsed.schemaId) : null;
            if (gs && entry && SETTERS[entry.type]) {
                const live = GETTERS[entry.type](gs, parsed.key);
                const value = entry.mode === 'members' ? withMembers(live, entry.value) : entry.value;
                if (!same(live, value))
                    SETTERS[entry.type](gs, parsed.key, value);
                restored.push(id);
            }
        } catch (e) {
            console.error(`[Kiwi] could not restore ${id}:`, e);
        }
        store.forget(id);
    }
    return restored;
}

export class SettingOwner {
    /**
     * @param {OriginalsStore} store
     * @param {object} settings the Gio.Settings that has `key` (it needs schema_id)
     * @param {string} key
     * @param {object} opts
     * @param {string} opts.type GVariant type: b i u d s as
     * @param {(original: *) => *} [opts.transform] Kiwi's value for a given original
     *   (default: a fixed opts.value)
     * @param {*} [opts.value] the value Kiwi sets when there is no transform
     * @param {() => void} [opts.onOriginalChanged] the user changed the key while Kiwi owned it
     */
    constructor(store, settings, key, { type, transform, value, onOriginalChanged = () => {} }) {
        if (!GETTERS[type])
            throw new Error(`SettingOwner: unsupported type '${type}'`);
        this._store = store;
        this._gs = settings;
        this._key = key;
        this._type = type;
        this._transform = transform ?? (() => value);
        this._onOriginalChanged = onOriginalChanged;
        this._id = originalId(settings.schema_id, key);
        this._owning = false;
        this._forced = undefined;
        this._changedId = 0;
    }

    get owning() {
        return this._owning;
    }

    _live() {
        return GETTERS[this._type](this._gs, this._key);
    }

    _set(v) {
        if (!same(this._live(), v))
            SETTERS[this._type](this._gs, this._key, v);
    }

    /** The user's own value: the stored one while Kiwi owns the key, else the live one. */
    get original() {
        if (this._owning) {
            const saved = this._store.get(this._id);
            if (saved)
                return saved.value;
        }
        return this._live();
    }

    /** Take (true) or give back (false) the key. */
    sync(want) {
        if (want && !this._owning)
            this._take();
        else if (!want && this._owning)
            this.release();
    }

    _take() {
        // An entry already stored (another owner instance of a crashed session) is the
        // user's real value: never overwrite it with Kiwi's.
        let saved = this._store.get(this._id);
        if (!saved) {
            this._store.set(this._id, this._type, this._live());
            saved = this._store.get(this._id);
        }
        this._owning = true;
        this._forced = this._transform(saved.value);
        this._set(this._forced);
        this._changedId = this._gs.connect(`changed::${this._key}`, () => this._onChanged());
    }

    /** The transform's inputs changed (e.g. a Kiwi setting): write Kiwi's value again. */
    reapply() {
        if (!this._owning)
            return;
        this._forced = this._transform(this.original);
        this._set(this._forced);
    }

    // Someone else (Tweaks, gsettings) wrote the key while Kiwi owns it: that is the user's
    // new choice. Store it as the original and keep Kiwi's value applied.
    _onChanged() {
        const live = this._live();
        if (!this._owning || same(live, this._forced))
            return;
        this._store.set(this._id, this._type, live);
        this._forced = this._transform(live);
        this._set(this._forced);
        this._onOriginalChanged();
    }

    /** Put the user's value back exactly and forget it. Safe to call when not owning. */
    release() {
        if (this._changedId) {
            this._gs.disconnect(this._changedId);
            this._changedId = 0;
        }
        if (!this._owning)
            return;
        this._owning = false;
        this._forced = undefined;
        const saved = this._store.get(this._id);
        if (saved)
            this._set(saved.value);
        this._store.forget(this._id);
    }
}

/**
 * Keeps some members out of a string-list key while Kiwi runs, and puts back only those.
 *
 *   const owner = new ListMembersOwner(ctx.originals, shellSettings, 'enabled-extensions',
 *       ['dash-to-dock@micxgx.gmail.com']);
 *   owner.sync(true);    // the members present are saved, then removed from the list
 *   owner.release();     // the saved members are added back to the list as it is now
 *
 * A member the user adds back while Kiwi holds the key is saved too and taken out again: it
 * returns with the rest on release. Entries other than the members are never touched.
 */
export class ListMembersOwner {
    /**
     * @param {OriginalsStore} store
     * @param {object} settings the Gio.Settings that has `key` (it needs schema_id)
     * @param {string} key a string-list ('as') key
     * @param {string[]} members
     */
    constructor(store, settings, key, members) {
        this._store = store;
        this._gs = settings;
        this._key = key;
        this._members = [...members];
        this._id = originalId(settings.schema_id, key);
        this._owning = false;
        this._changedId = 0;
    }

    get owning() {
        return this._owning;
    }

    /** @returns {string[]} the members Kiwi took out and will add back */
    get held() {
        return this._store.get(this._id)?.value ?? [];
    }

    _live() {
        return this._gs.get_strv(this._key);
    }

    /** Take (true) or give back (false). */
    sync(want) {
        if (want && !this._owning)
            this._take();
        else if (!want && this._owning)
            this.release();
    }

    _take() {
        this._owning = true;
        this._strip();
        this._changedId = this._gs.connect(`changed::${this._key}`, () => this._strip());
    }

    // Save the members now in the list (added to any already stored), then take them out.
    // Runs on take and whenever the key changes; the write re-enters it with nothing to do.
    _strip() {
        const live = this._live();
        const present = this._members.filter(m => live.includes(m));
        if (!present.length)
            return;
        this._store.set(this._id, 'as', withMembers(this.held, present), 'members');
        this._gs.set_strv(this._key, live.filter(m => !this._members.includes(m)));
    }

    /**
     * Add the saved members back to the list and forget them.
     *
     * @param {{keepStored?: boolean}} [opts] keepStored: leave the list and the store as they
     *   are (Kiwi is only being restarted, e.g. by the Shell re-basing its extension order); the
     *   next take, or restoreStale() at the next start, finds the entry
     */
    release({ keepStored = false } = {}) {
        if (this._changedId) {
            this._gs.disconnect(this._changedId);
            this._changedId = 0;
        }
        if (!this._owning)
            return;
        this._owning = false;
        if (keepStored)
            return;
        const held = this.held;
        const live = this._live();
        const next = withMembers(live, held);
        if (!same(live, next))
            this._gs.set_strv(this._key, next);
        this._store.forget(this._id);
    }
}
