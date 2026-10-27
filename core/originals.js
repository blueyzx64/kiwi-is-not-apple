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

    /** Save a value, replacing any stored one. */
    set(id, type, value) {
        if (!GETTERS[type])
            throw new Error(`originals: unsupported type '${type}'`);
        const data = this._read();
        if (same(data[id], { type, value }))
            return;
        data[id] = { type, value };
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
                if (!same(GETTERS[entry.type](gs, parsed.key), entry.value))
                    SETTERS[entry.type](gs, parsed.key, entry.value);
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
