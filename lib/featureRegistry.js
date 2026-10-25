// SPDX-License-Identifier: GPL-3.0-or-later
// FeatureRegistry: decides which features run and calls their enable/disable.
// The list of features lives in ../features.js; this file is the engine.
//
// No gi:// imports, so it runs under plain `gjs -m` for tests. It only needs a
// CleanupRegistry-like class, which it gets from the constructor.
//
// Entry shape (all fields optional except id and a way to enable):
//   id            unique string
//   setting       boolean settings key; shorthand for when: ctx => ctx.settings.get_boolean(key)
//   when(ctx)     true when the feature should run (default: the `setting` shorthand, else true)
//   enable(ctx, cleanup) / disable(ctx, cleanup)   plain functions, or
//   cls           a class: new cls(ctx, cleanup), then .enable() / .disable()
//   restartOn     setting keys that force disable() before the next evaluation
//   needs         ids that must be wanted too, else this one is held off
//   conflictsWith ids this entry beats: while this entry is wanted, they are held off
//   reapply       legacy: call enable() on every refresh while wanted and disable() on every
//                 refresh while not wanted. Without it, calls happen only when the state flips.
//   startOnly     evaluated by start() only, never by refresh()
//   keys          extra settings keys of this entry: a change retries it after a failed enable()
//
// `cleanup` is a CleanupRegistry owned by the entry; the registry disposes it right after
// disable(), so a feature that registers everything there needs no manual teardown.

export class FeatureRegistry {
    /**
     * @param {typeof CleanupRegistry} CleanupClass class used for each entry's own registry
     */
    constructor(CleanupClass) {
        this._Cleanup = CleanupClass;
        this._entries = [];
        this._byId = new Map();
        this._state = new Map();   // id -> { active, cleanup, instance }
        this._ctx = null;
        this._status = new Map();  // id -> 'active' | 'paused' | 'off'
    }

    /**
     * Add a feature. Order of registration is order of start and refresh; stop runs in reverse.
     *
     * @param {object} entry see the file header
     */
    register(entry) {
        if (!entry?.id)
            throw new Error('feature entry needs an id');
        if (this._byId.has(entry.id))
            throw new Error(`duplicate feature id '${entry.id}'`);
        if (!entry.cls && !entry.enable)
            throw new Error(`feature '${entry.id}' needs enable() or cls`);
        this._entries.push(entry);
        this._byId.set(entry.id, entry);
        this._state.set(entry.id, { active: false, cleanup: null, instance: null, failed: false });
        this._status.set(entry.id, 'off');
    }

    /** @param {object[]} entries */
    registerAll(entries) {
        entries.forEach(e => this.register(e));
    }

    /** 'active' (running), 'paused' (wanted but held off by needs/conflictsWith) or 'off'. */
    status(id) {
        return this._status.get(id) ?? 'off';
    }

    isActive(id) {
        return this._state.get(id)?.active ?? false;
    }

    /**
     * First pass over every entry, including startOnly ones.
     *
     * @param {object} ctx passed to every when/enable/disable
     */
    start(ctx) {
        this._ctx = ctx;
        this._pass(null, true);
    }

    /**
     * Re-evaluate after a settings key changed (or null: something else changed, such as the
     * dock extension). startOnly entries are skipped.
     *
     * @param {string|null} key
     */
    refresh(key) {
        if (!this._ctx)
            return;
        this._pass(key, false);
    }

    /**
     * Re-evaluate one entry only (for state outside the settings, e.g. another GSettings key).
     * startOnly entries are never enabled by this.
     *
     * @param {string} id
     */
    apply(id) {
        if (!this._ctx)
            return;
        this._pass(null, false, id);
    }

    /** Disable everything, newest registration first. Entries with reapply are always called. */
    stop() {
        const ctx = this._ctx;
        for (const entry of [...this._entries].reverse()) {
            if (entry.reapply || this._state.get(entry.id).active)
                this._disable(entry, ctx);
        }
        for (const id of this._status.keys())
            this._status.set(id, 'off');
        for (const st of this._state.values())
            st.failed = false;
        this._ctx = null;
    }

    _wanted(entry, ctx) {
        try {
            if (entry.when)
                return !!entry.when(ctx);
            if (entry.setting)
                return !!ctx.settings.get_boolean(entry.setting);
            return true;
        } catch (e) {
            console.error(`[Kiwi] feature '${entry.id}' when() failed:`, e);
            return false;
        }
    }

    // Wanted by settings, then reduced by needs/conflicts until stable.
    _effective(wanted) {
        const eff = new Map(wanted);
        let changed = true;
        for (let guard = this._entries.length + 1; changed && guard > 0; guard--) {
            changed = false;
            for (const entry of this._entries) {
                if (!eff.get(entry.id))
                    continue;
                const missing = (entry.needs ?? []).some(id => !eff.get(id));
                const beaten = this._entries.some(o =>
                    o !== entry && eff.get(o.id) && (o.conflictsWith ?? []).includes(entry.id));
                if (missing || beaten) {
                    eff.set(entry.id, false);
                    changed = true;
                }
            }
        }
        return eff;
    }

    _pass(key, isStart, onlyId = null) {
        const ctx = this._ctx;

        if (key !== null) {
            for (const entry of this._entries) {
                if (entry.restartOn?.includes(key) &&
                    (entry.reapply || this._state.get(entry.id).active))
                    this._disable(entry, ctx);
            }
        }

        const wanted = new Map();
        for (const entry of this._entries)
            wanted.set(entry.id, this._wanted(entry, ctx));

        // A feature whose enable() threw is left out until it is turned off, or one of its own
        // keys changes: it does not pause its conflict losers or satisfy `needs`, and it is not
        // retried (and logged) on every unrelated refresh.
        for (const entry of this._entries) {
            const st = this._state.get(entry.id);
            if (st.failed && (!wanted.get(entry.id) || (key !== null && this._ownKeys(entry).includes(key))))
                st.failed = false;
        }
        const candidates = new Map();
        for (const entry of this._entries)
            candidates.set(entry.id, wanted.get(entry.id) && !this._state.get(entry.id).failed);
        const effective = this._effective(candidates);
        let newlyFailed = false;

        const skip = entry => (onlyId && entry.id !== onlyId) || (entry.startOnly && !isStart);

        // Edge-triggered features that must stop go first, so a loser of a conflict is
        // gone before its winner starts. Legacy (reapply) features keep their place below.
        for (const entry of this._entries) {
            if (skip(entry) || entry.reapply)
                continue;
            if (!effective.get(entry.id) && this._state.get(entry.id).active)
                this._disable(entry, ctx);
        }

        for (const entry of this._entries) {
            if (skip(entry))
                continue;
            const st = this._state.get(entry.id);
            // A dependency that failed earlier in this same pass holds this one off right away
            const on = effective.get(entry.id) &&
                !(entry.needs ?? []).some(id => this._state.get(id)?.failed);
            if (on) {
                if (entry.reapply || !st.active) {
                    this._enable(entry, ctx);
                    newlyFailed ||= st.failed;
                }
            } else if (entry.reapply) {
                this._disable(entry, ctx);
            }
            const paused = wanted.get(entry.id) && !on && !st.failed;
            this._status.set(entry.id, on && st.active ? 'active' : (paused ? 'paused' : 'off'));
        }

        // Losers paused for a winner that just failed come back now. Bounded: failed entries
        // are excluded from the next pass, so it can only shrink.
        if (newlyFailed)
            this._pass(null, isStart, onlyId);
    }

    // Settings keys that belong to an entry: its `setting`, `restartOn` and optional `keys`.
    _ownKeys(entry) {
        return [entry.setting, ...(entry.restartOn ?? []), ...(entry.keys ?? [])].filter(Boolean);
    }

    _enable(entry, ctx) {
        const st = this._state.get(entry.id);
        if (!st.cleanup)
            st.cleanup = new this._Cleanup();
        try {
            if (entry.cls) {
                if (!st.instance) {
                    st.instance = new entry.cls(ctx, st.cleanup);
                    st.instance.enable();
                }
            } else {
                entry.enable(ctx, st.cleanup);
            }
            st.active = true;
            st.failed = false;
        } catch (e) {
            console.error(`[Kiwi] feature '${entry.id}' enable failed:`, e);
            this._disable(entry, ctx);
            st.failed = true;
        }
    }

    _disable(entry, ctx) {
        const st = this._state.get(entry.id);
        try {
            if (entry.cls) {
                st.instance?.disable();
                st.instance = null;
            } else {
                entry.disable?.(ctx, st.cleanup);
            }
        } catch (e) {
            console.error(`[Kiwi] feature '${entry.id}' disable failed:`, e);
        }
        try {
            st.cleanup?.dispose();
        } catch (e) {
            console.error(`[Kiwi] feature '${entry.id}' cleanup failed:`, e);
        }
        st.active = false;
    }
}
