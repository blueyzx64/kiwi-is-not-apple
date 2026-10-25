// SPDX-License-Identifier: GPL-3.0-or-later
// CleanupRegistry: one place that remembers everything a feature sets up
// (signals, timers, idle callbacks, prototype injections, actors, files) so
// that disable() is a single dispose() call.
//
// Pure GLib/Gio only: no Shell imports, so it also runs under plain `gjs -m`.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const LOG = '[Kiwi]';

export class CleanupRegistry {
    constructor() {
        this._next = 1;
        // token -> cleanup function. Map keeps insertion order; dispose runs it backwards.
        this._entries = new Map();
    }

    /** Number of live registrations (useful in tests and leak checks). */
    get size() {
        return this._entries.size;
    }

    _add(fn) {
        const token = this._next++;
        this._entries.set(token, fn);
        return token;
    }

    /**
     * Run any cleanup callback on dispose().
     *
     * @param {Function} fn called once, with no arguments
     * @returns {number} token for release()
     */
    add(fn) {
        return this._add(fn);
    }

    /**
     * Connect a GObject signal; disconnected on dispose().
     *
     * @param {GObject.Object} obj
     * @param {string} signal e.g. 'notify::minimized'
     * @param {Function} fn handler
     * @returns {number} token for release()
     */
    connect(obj, signal, fn) {
        const id = obj.connect(signal, fn);
        return this._add(() => {
            try {
                obj.disconnect(id);
            } catch (_e) {
                // Object already finalised; nothing left to disconnect.
            }
        });
    }

    _source(sourceId, name) {
        if (name)
            GLib.Source.set_name_by_id(sourceId, `[kiwi] ${name}`);
        return sourceId;
    }

    /**
     * Repeating or one-shot timer. Return true / GLib.SOURCE_CONTINUE from fn to repeat.
     * A one-shot (fn returns anything else) is forgotten automatically.
     *
     * @param {number} ms
     * @param {Function} fn
     * @param {{name?: string, priority?: number}} [opts] name shows in Looking Glass
     * @returns {number} token for release()
     */
    timeout(ms, fn, opts = {}) {
        let token = 0;
        const sourceId = GLib.timeout_add(opts.priority ?? GLib.PRIORITY_DEFAULT, ms, () => {
            let again = false;
            try {
                again = fn() === GLib.SOURCE_CONTINUE;
            } catch (e) {
                console.error(`${LOG} timeout callback failed:`, e);
            }
            if (!again)
                this._entries.delete(token);
            return again ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE;
        });
        this._source(sourceId, opts.name);
        token = this._add(() => GLib.Source.remove(sourceId));
        return token;
    }

    /**
     * Run fn once when the main loop is idle.
     *
     * @param {Function} fn
     * @param {{name?: string}} [opts]
     * @returns {number} token for release()
     */
    idle(fn, opts = {}) {
        let token = 0;
        const sourceId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._entries.delete(token);
            try {
                fn();
            } catch (e) {
                console.error(`${LOG} idle callback failed:`, e);
            }
            return GLib.SOURCE_REMOVE;
        });
        this._source(sourceId, opts.name);
        token = this._add(() => GLib.Source.remove(sourceId));
        return token;
    }

    /**
     * Replace obj[name] (usually a prototype method); the original is put back on dispose().
     * fn receives the original as its first argument and keeps `this`:
     *   inject(Panel.prototype, 'foo', function (orig, ...args) { return orig.apply(this, args); })
     *
     * @param {object} obj
     * @param {string} name
     * @param {Function} fn
     * @returns {number} token for release()
     */
    inject(obj, name, fn) {
        const had = Object.prototype.hasOwnProperty.call(obj, name);
        const descriptor = Object.getOwnPropertyDescriptor(obj, name);
        const original = obj[name];
        const replacement = function (...args) {
            return fn.call(this, original, ...args);
        };
        Object.defineProperty(obj, name, {
            value: replacement,
            writable: true,
            configurable: true,
            enumerable: descriptor?.enumerable ?? false,
        });
        return this._add(() => {
            if (had)
                Object.defineProperty(obj, name, descriptor);
            else
                delete obj[name];
        });
    }

    /**
     * Destroy an actor (anything with destroy()) on dispose(). If the actor is destroyed
     * earlier by someone else, the registration drops itself.
     *
     * @param {{destroy: Function, connect?: Function, disconnect?: Function}} actor
     * @returns {object} the same actor, so you can write `parent.add_child(reg.actor(new St.Label()))`
     */
    actor(actor) {
        let destroyed = false;
        let destroyId = 0;
        let token = 0;
        if (typeof actor.connect === 'function') {
            try {
                destroyId = actor.connect('destroy', () => {
                    destroyed = true;
                    destroyId = 0;
                    this._entries.delete(token);
                });
            } catch (_e) {
                destroyId = 0;
            }
        }
        token = this._add(() => {
            if (destroyed)
                return;
            if (destroyId) {
                try {
                    actor.disconnect(destroyId);
                } catch (_e) {
                    // already gone
                }
            }
            actor.destroy();
        });
        return actor;
    }

    /**
     * Delete a file that Kiwi created, on dispose(). Only register paths Kiwi wrote itself;
     * never a user's file. A missing file is fine. The delete is asynchronous so dispose()
     * never blocks the shell on disk I/O: the file is gone shortly after dispose() returns.
     * Use it for unique paths (temp files, per-run names): a file re-created at the same path
     * right after dispose() could be removed by the pending delete.
     *
     * @param {string|Gio.File} file
     * @returns {number} token for release()
     */
    file(file) {
        const gfile = typeof file === 'string' ? Gio.File.new_for_path(file) : file;
        return this._add(() => {
            gfile.delete_async(GLib.PRIORITY_DEFAULT, null, (source, res) => {
                try {
                    source.delete_finish(res);
                } catch (e) {
                    if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                        console.error(`${LOG} could not remove ${gfile.get_path()}:`, e);
                }
            });
        });
    }

    /**
     * Run one cleanup now and forget it. Unknown or already-released tokens are ignored.
     *
     * @param {number} token
     */
    release(token) {
        const fn = this._entries.get(token);
        if (!fn)
            return;
        this._entries.delete(token);
        this._run(fn);
    }

    _run(fn) {
        try {
            fn();
        } catch (e) {
            console.error(`${LOG} cleanup failed:`, e);
        }
    }

    /**
     * Run every cleanup, newest first. An error in one is logged and does not stop the rest.
     * Safe to call twice; the registry can be reused afterwards.
     */
    dispose() {
        const fns = [...this._entries.values()].reverse();
        this._entries.clear();
        for (const fn of fns)
            this._run(fn);
    }
}
