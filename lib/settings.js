// SPDX-License-Identifier: GPL-3.0-or-later
// Typed access to Kiwi's GSettings, change-scoped dispatch and key migrations.
//
// No gi:// imports: it only calls methods on the Gio.Settings object it is given,
// so it also runs under plain `gjs -m` with a fake settings object.

export class KiwiSettings {
    /**
     * @param {Gio.Settings} gsettings the extension's settings (this.getSettings())
     */
    constructor(gsettings) {
        this._gs = gsettings;
        this._watchers = new Map();   // key ('*' = all) -> Set<fn>
        this._token = 0;
        this._handlerId = 0;
    }

    /** The wrapped Gio.Settings, for code that still needs it. */
    get raw() {
        return this._gs;
    }

    has(key) {
        return this._gs.settings_schema?.has_key(key) ?? true;
    }

    bool(key) { return this._gs.get_boolean(key); }
    int(key) { return this._gs.get_int(key); }
    double(key) { return this._gs.get_double(key); }
    string(key) { return this._gs.get_string(key); }
    strv(key) { return this._gs.get_strv(key); }
    enum(key) { return this._gs.get_enum(key); }

    setBool(key, v) { return this._gs.set_boolean(key, v); }
    setInt(key, v) { return this._gs.set_int(key, v); }
    setDouble(key, v) { return this._gs.set_double(key, v); }
    setString(key, v) { return this._gs.set_string(key, v); }
    setStrv(key, v) { return this._gs.set_strv(key, v); }

    /**
     * Call fn(key) when one of `keys` changes. Use '*' for every key. One 'changed'
     * connection serves all watchers, and only the watchers of that key run.
     *
     * @param {string|string[]} keys
     * @param {Function} fn
     * @returns {Function} call it to stop watching
     */
    watch(keys, fn) {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const key of list) {
            if (!this._watchers.has(key))
                this._watchers.set(key, new Set());
            this._watchers.get(key).add(fn);
        }
        return () => {
            for (const key of list)
                this._watchers.get(key)?.delete(fn);
        };
    }

    _dispatch(key) {
        const targets = new Set([
            ...(this._watchers.get(key) ?? []),
            ...(this._watchers.get('*') ?? []),
        ]);
        for (const fn of targets) {
            try {
                fn(key);
            } catch (e) {
                console.error(`[Kiwi] settings watcher for '${key}' failed:`, e);
            }
        }
    }

    /**
     * Start dispatching 'changed' to watchers. Undone by the registry on dispose().
     *
     * @param {CleanupRegistry} registry
     */
    attach(registry) {
        if (this._handlerId)
            return;
        this._handlerId = this._gs.connect('changed', (_s, key) => this._dispatch(key));
        registry.add(() => {
            this._gs.disconnect(this._handlerId);
            this._handlerId = 0;
            this._watchers.clear();
        });
    }

    /** Run key migrations (see runMigrations). */
    migrate(migrations) {
        return runMigrations(this._gs, migrations);
    }
}

const SETTERS = {
    b: (gs, k, v) => gs.set_boolean(k, !!v),
    i: (gs, k, v) => gs.set_int(k, v),
    u: (gs, k, v) => gs.set_uint(k, v),
    d: (gs, k, v) => gs.set_double(k, v),
    s: (gs, k, v) => gs.set_string(k, v),
    as: (gs, k, v) => gs.set_strv(k, v),
};

const GETTERS = {
    b: (gs, k) => gs.get_boolean(k),
    i: (gs, k) => gs.get_int(k),
    u: (gs, k) => gs.get_uint(k),
    d: (gs, k) => gs.get_double(k),
    s: (gs, k) => gs.get_string(k),
    as: (gs, k) => gs.get_strv(k),
};

/**
 * Copy a user's old key into its replacement. Idempotent and rollback-safe:
 * - it runs only when the user set `from` and has not set `to`;
 * - after it runs, `to` is user-set, so a second run does nothing;
 * - `from` is left alone, so an older Kiwi still finds its value.
 *
 * Both keys must have the same GVariant type unless `map` converts the value.
 * Supported types: b i u d s as.
 *
 * @param {Gio.Settings} gs
 * @param {{from: string, to: string, map?: Function}[]} migrations
 * @returns {string[]} the `to` keys that were written
 */
export function runMigrations(gs, migrations) {
    const done = [];
    for (const { from, to, map } of migrations) {
        try {
            const schema = gs.settings_schema;
            if (schema && (!schema.has_key(from) || !schema.has_key(to)))
                continue;
            if (gs.get_user_value(from) === null || gs.get_user_value(to) !== null)
                continue;
            const fromType = gs.get_value(from).get_type_string();
            const toType = gs.get_value(to).get_type_string();
            const getter = GETTERS[fromType];
            const setter = SETTERS[toType];
            if (!getter || !setter)
                throw new Error(`unsupported type ${fromType} -> ${toType}`);
            let value = getter(gs, from);
            if (map)
                value = map(value);
            setter(gs, to, value);
            done.push(to);
        } catch (e) {
            console.error(`[Kiwi] migration ${from} -> ${to} failed:`, e);
        }
    }
    return done;
}
