// SPDX-License-Identifier: GPL-3.0-or-later
// EventHub: the typed signal hub features use to hear about each other and about the desktop.
//
// Every event is declared once in EVENTS with the fields of its payload. Emitting or listening
// to an undeclared event throws, and a payload missing a declared field throws, so a typo shows
// up in the first test run instead of as a silent no-op.
//
//   const off = ctx.events.on('window-focused', ({ window }) => ..., cleanup);
//   ctx.events.emit('minimize-requested', { window, source: 'controls' });
//
// Listeners run synchronously in subscription order; one that throws is logged and the rest
// still run. Payloads are plain objects owned by the emitter: do not keep or mutate them.
//
// Pure JS (no gi imports): runs under `gjs -m` in tests.

/**
 * Declared events and their payload fields. Add an event here before emitting it.
 * Values are documentation for the reader; the hub checks the field names only.
 */
export const EVENTS = Object.freeze({
    // core/desktop.js (DesktopService)
    'window-added': { window: 'WindowInfo' },
    'window-changed': { window: 'WindowInfo', fields: 'string[] changed field names' },
    'window-removed': { window: 'WindowInfo' },
    'window-focused': { window: 'WindowInfo|null' },
    'app-focused': { appId: 'string|null' },
    'workspaces-changed': { count: 'number', active: 'number' },
    'monitors-changed': { monitors: 'MonitorInfo[]', primary: 'number' },
    // core/layout.js (LayoutService)
    'work-area-changed': { monitor: 'number' },
    // core/motion.js (Motion)
    'motion-changed': { reducedMotion: 'boolean', animations: 'boolean' },
    // lib/featureRegistry.js, through extension.js: a feature started or stopped
    'feature-changed': { id: 'string', active: 'boolean' },
    // Requests between features (the owner of the policy listens, see features.js)
    'minimize-requested': { window: 'Meta.Window', source: 'string' },
    // The menu bar (features/menuBar): the clock was clicked. The Notification Center (P5)
    // opens on it; until then the stock calendar card opens as well.
    'notification-center-requested': { source: "string ('clock')" },
    // App-menu commands for the window manager (core/appMenus/commands.js). The owner of the
    // policy listens; with no listener the app menu runs a plain fallback itself.
    'app-hide-requested': { appId: 'string|null', mode: "'hide' | 'others' | 'all'" },
    'window-tile-requested': { window: 'Meta.Window', mode: "'left' | 'right'" },
    // Open or close Launchpad (features/launchpad listens): the dock tile ('dock'), the pinch
    // gesture ('pinch'), a hot corner ('hot-corner')
    'launchpad-requested': { source: 'string' },
    // The green button of the top-bar controls (features/windowControls) was hovered or left;
    // Split View (features/splitView) offers its menu for a full-screen window
    'green-button-hover': { window: 'Meta.Window|null', actor: 'Clutter.Actor', hovered: 'boolean' },
    // Split View: tile a full-screen window to one half and pick its partner (the green menu
    // emits it; features/splitView acts)
    'split-view-requested': { window: 'Meta.Window', side: "'left' | 'right'" },
    // A Split View pair formed (active) or ended (features/splitView)
    'split-view-changed': { windows: 'Meta.Window[]', active: 'boolean' },
});

export class EventHub {
    /**
     * @param {object} [spec] event name -> payload field map (default EVENTS)
     */
    constructor(spec = EVENTS) {
        this._spec = spec;
        this._listeners = new Map(); // name -> Set<fn>
    }

    _check(name) {
        if (!Object.prototype.hasOwnProperty.call(this._spec, name))
            throw new Error(`EventHub: unknown event '${name}'`);
    }

    /**
     * Listen to an event.
     *
     * @param {string} name a key of EVENTS
     * @param {Function} fn called with the payload
     * @param {{add: Function}} [owner] a CleanupRegistry; the listener is removed on dispose
     * @returns {Function} call it to stop listening (idempotent)
     */
    on(name, fn, owner = null) {
        this._check(name);
        let set = this._listeners.get(name);
        if (!set) {
            set = new Set();
            this._listeners.set(name, set);
        }
        // Wrap so the same fn can be subscribed twice and removed independently
        const entry = payload => fn(payload);
        set.add(entry);
        let done = false;
        const off = () => {
            if (done)
                return;
            done = true;
            set.delete(entry);
        };
        owner?.add(off);
        return off;
    }

    /** Like on(), but the listener runs at most once. */
    once(name, fn, owner = null) {
        const off = this.on(name, payload => {
            off();
            fn(payload);
        }, owner);
        return off;
    }

    /**
     * Emit an event to its listeners.
     *
     * @param {string} name a key of EVENTS
     * @param {object} payload must carry every field declared for the event
     */
    emit(name, payload = {}) {
        this._check(name);
        for (const field of Object.keys(this._spec[name])) {
            if (!(field in payload))
                throw new Error(`EventHub: '${name}' payload lacks '${field}'`);
        }
        const set = this._listeners.get(name);
        if (!set?.size)
            return;
        for (const fn of [...set]) {
            try {
                fn(payload);
            } catch (e) {
                console.error(`[Kiwi] '${name}' listener failed:`, e);
            }
        }
    }

    /** Number of listeners of one event (tests, leak checks). */
    listenerCount(name) {
        return this._listeners.get(name)?.size ?? 0;
    }

    /** Drop every listener (extension teardown). */
    clear() {
        this._listeners.clear();
    }
}
