// SPDX-License-Identifier: GPL-3.0-or-later
// AppMenuService: the menus of the focused app, for the menu bar now and Spotlight's menu
// search later (plan §5.1, P6). It owns the providers, a cache, and command activation.
//
//   const menus = ctx.appMenus.acquire(cleanup);
//   const target = menus.targetFor(metaWindow);      // plain description of the window
//   menus.peek(target);                              // cached provider result, or null
//   await menus.results(target);                     // fetch if missing or stale
//   menus.build(target, results, { generic, accels, _ });   // -> menus (core/appMenus/model.js)
//   menus.activate(target, item.command);
//   menus.registerProvider(cleanup, provider);       // P6: GTK menu bars, DBusMenu, AT-SPI
//
// Providers: {id, supports(target), fetch(target, cancellable) -> Promise<{actions?, menus?}>,
// activate(target, command) -> Promise<boolean>}. Every provider that supports a target is
// asked; their results are concatenated (actions) and merged (menus).
//
// Cache: one entry per window (its app.* and win.* actions), dropped when the window goes and
// marked stale when it gains focus, so a menu opened later re-reads the app's actions. Nothing
// is fetched while menus are closed, except once for a window never seen before (the menu
// titles depend on what the app exports). Pending calls are cancelled when the last user
// releases the service.
//
// Shell API: Shell.WindowTracker, Meta.Window get_gtk_* (through targetFor()).

import Gio from 'gi://Gio';
import Shell from 'gi://Shell';

import { CleanupRegistry } from '../../lib/disposables.js';
import { buildMenus, mergeNativeMenus } from './model.js';
import { GtkActionsProvider } from './gtkActions.js';
import { GenericCommands } from './commands.js';

const EMPTY = Object.freeze({ actions: Object.freeze([]), menus: Object.freeze([]) });

export class AppMenuService {
    /**
     * @param {{events, desktop, layout}} core the core services
     */
    constructor({ events, desktop, layout }) {
        this._core = { events, desktop, layout };
        this._refs = 0;
        this._cleanup = null;
        this._providers = [GtkActionsProvider];
        this._cache = new Map(); // windowId -> {value, promise, stale}
        this._cancellable = null;
        this._commands = null;
    }

    acquire(owner) {
        this._refs++;
        if (this._refs === 1)
            this._start();
        let released = false;
        owner.add(() => {
            if (released)
                return;
            released = true;
            if (--this._refs === 0)
                this._stopTracking();
        });
        return this;
    }

    stop() {
        this._refs = 0;
        this._stopTracking();
    }

    /**
     * Add a provider (asked after the built-in ones) while `owner` lives.
     *
     * @returns {Function} remove it
     */
    registerProvider(owner, provider) {
        this._providers.push(provider);
        this._cache.clear();
        const remove = () => {
            const i = this._providers.indexOf(provider);
            if (i >= 0) {
                this._providers.splice(i, 1);
                this._cache.clear();
            }
        };
        owner.add(remove);
        return remove;
    }

    /**
     * The plain description of a window every provider reads.
     *
     * @param {?Meta.Window} win null for the desktop (no focused window)
     * @param {?Shell.App} [fallbackApp] the app to describe when there is no window
     * @returns {?object} {windowId, appId, appName, gtk: {busName, appPath, windowPath}|null}
     */
    targetFor(win, fallbackApp = null) {
        const app = win ? Shell.WindowTracker.get_default().get_window_app(win) : fallbackApp;
        if (!app)
            return null;
        const busName = win?.get_gtk_unique_bus_name?.() ?? null;
        const gtk = busName ? {
            busName,
            appPath: win.get_gtk_application_object_path() || null,
            windowPath: win.get_gtk_window_object_path() || null,
        } : null;
        return {
            windowId: win ? win.get_stable_sequence() : null,
            appId: app.get_id(),
            appName: app.get_name(),
            gtk,
        };
    }

    /** @returns {?{actions, menus}} the cached result, without fetching */
    peek(target) {
        return target ? this._cache.get(this._key(target))?.value ?? null : null;
    }

    /** @returns {boolean} true when the cached result should be re-read */
    isStale(target) {
        const entry = target ? this._cache.get(this._key(target)) : null;
        return !entry?.value || entry.stale;
    }

    /**
     * The providers' result for a window: cached, or fetched when missing or stale.
     *
     * @returns {Promise<{actions: object[], menus: object[]}>}
     */
    results(target) {
        if (!target || !this._cleanup)
            return Promise.resolve(EMPTY);
        const key = this._key(target);
        const entry = this._cache.get(key) ?? { value: null, promise: null, stale: true };
        this._cache.set(key, entry);
        if (entry.value && !entry.stale)
            return Promise.resolve(entry.value);
        if (entry.promise)
            return entry.promise;
        const cancellable = this._cancellable;
        entry.promise = this._fetch(target, cancellable).then(value => {
            if (this._cache.get(key) === entry && !cancellable.is_cancelled()) {
                entry.value = value;
                entry.stale = false;
            }
            entry.promise = null;
            return value;
        });
        return entry.promise;
    }

    /** Forget a window's cached result. */
    invalidate(target) {
        if (target)
            this._cache.delete(this._key(target));
    }

    /**
     * The menus for a window from a provider result (see core/appMenus/model.js buildMenus).
     *
     * @param {object} target
     * @param {?{actions, menus}} results
     * @param {{generic: object, accels: object, _: Function}} opts
     */
    build(target, results, { generic, accels, _ }) {
        const built = buildMenus({
            appName: target.appName, actions: results?.actions ?? [], generic, accels, _,
        });
        return mergeNativeMenus(built, results?.menus ?? []);
    }

    /**
     * Run a menu item's command.
     *
     * @returns {Promise<boolean>} false when it could not run
     */
    async activate(target, command) {
        if (!target || !command || !this._commands)
            return false;
        if (command.provider === 'generic')
            return this._commands.run(command.name, target, command.target);
        const provider = this._providers.find(p => p.id === command.provider);
        return provider ? provider.activate(target, command) : false;
    }

    // ---- internals ----------------------------------------------------------------------

    _key(target) {
        return target.windowId ?? `app:${target.appId}`;
    }

    async _fetch(target, cancellable) {
        const parts = await Promise.all(this._providers
            .filter(p => p.supports(target))
            .map(p => p.fetch(target, cancellable).catch(e => {
                console.warn(`[Kiwi] app menus: provider ${p.id} failed: ${e.message}`);
                return null;
            })));
        const actions = [];
        const menus = [];
        for (const part of parts) {
            for (const a of part?.actions ?? [])
                actions.push(a);
            for (const m of part?.menus ?? [])
                menus.push(m);
        }
        return Object.freeze({ actions, menus });
    }

    _start() {
        const cleanup = new CleanupRegistry();
        this._cleanup = cleanup;
        const { events, desktop, layout } = this._core;
        desktop.acquire(cleanup);
        layout.acquire(cleanup);
        this._cancellable = new Gio.Cancellable();
        this._commands = new GenericCommands({ events, desktop, layout });
        events.on('window-removed', ({ window }) => this._cache.delete(window.id), cleanup);
        events.on('window-focused', ({ window }) => {
            const entry = window ? this._cache.get(window.id) : null;
            if (entry)
                entry.stale = true;
        }, cleanup);
    }

    _stopTracking() {
        if (!this._cleanup)
            return;
        this._cancellable.cancel();
        this._cancellable = null;
        this._commands.stop();
        this._commands = null;
        this._cache.clear();
        this._providers = [GtkActionsProvider];
        const cleanup = this._cleanup;
        this._cleanup = null;
        cleanup.dispose();
    }
}
