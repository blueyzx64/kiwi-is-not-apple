// SPDX-License-Identifier: GPL-3.0-or-later
// GlassService: the one Liquid Glass implementation in Kiwi.
//
// Liquid Glass is plain transparency: a translucent fill, no blur and no shader. The fill is
// the target actor's own background (style classes from lib/glassParams.js fillClasses(),
// rules in the Liquid Glass section of stylesheet.css), so it follows the target's own
// border-radius exactly. No layer is ever inserted next to or behind the target: a separate
// layer cannot clip to rounded corners, which is where the rectangles behind rounded menus,
// the notch and the Stage Manager strip came from.
//
// Features call Glass.attach(actor, {surface, ...}) and get a handle. The service owns the
// liquid-glass-* settings, the colour scheme, high contrast (solid fill) and reduced motion.
//
//   layers: 'glass' (default)  the target gets the fill classes while every handle is visible
//   layers: 'blur'             the caller keeps its own background; nothing is drawn (the old
//                              blur-only form), but params/tier still resolve for the caller
//   radius                     optional corner radius for targets whose CSS has none
//                              (ModalSurface frames); appended to the target's inline style

import St from 'gi://St';

import { CleanupRegistry } from './disposables.js';
import { KiwiSettings } from './settings.js';
import { watchReducedMotion } from './compat.js';
import { SETTING_FIELDS, readSnapshot, wantsSurface, resolve, fillClasses } from './glassParams.js';

class GlassHandle {
    constructor(entry, opts) {
        this._entry = entry;
        this._visible = true;
        this.layers = opts.layers ?? 'glass';
    }

    get visible() { return this._visible; }

    /** 'off' | 'blur' | 'light' | 'opaque' as currently resolved ('blur' = translucent). */
    get tier() { return this._entry?.params?.tier ?? 'off'; }

    /** The resolved numbers (alpha, dark, ...) or null. Read-only. */
    get params() { return this._entry?.params ?? null; }

    /** Caller-side hide (overview, fullscreen). The fill shows only if every handle is visible. */
    setVisible(visible) {
        if (!this._entry || this._visible === visible)
            return;
        this._visible = visible;
        this._entry.sync();
    }

    /** Kept for callers: the fill is the target's own background, so geometry needs nothing. */
    setRect(_x, _y, _width, _height) {}

    /** Re-resolve now (call after something the isDark callback reads has changed). */
    refresh() {
        this._entry?.apply();
    }

    /** Kept for callers: nothing to repaint. */
    invalidate() {}

    destroy() {
        const entry = this._entry;
        this._entry = null;
        entry?.release(this);
    }
}

class GlassEntry {
    constructor(service, target, opts) {
        this._svc = service;
        this.target = target;
        this.surface = opts.surface;
        this.opts = opts;
        this.handles = new Set();
        this.params = null;
        this._classes = [];     // fill classes currently on the target
        this._radiusStyle = ''; // inline fragment we appended, '' when none
        this._dead = false;
        this._destroyId = target.connect('destroy', () => {
            this._destroyId = 0;
            this._dead = true;  // never touch the disposed actor again
            this.destroy();
        });
        // Without an isDark callback the glass follows the text colour the theme gives the
        // target, which is known only once it is styled (a menu on its first open)
        this._styleId = opts.isDark ? 0 : target.connect('style-changed', () => {
            if (this.params && this._svc.textIsLight(target) !== this.params.dark)
                this.apply();
        });
    }

    get _glassy() {
        for (const h of this.handles) {
            if (h.layers === 'glass')
                return true;
        }
        return false;
    }

    release(handle) {
        this.handles.delete(handle);
        if (this.handles.size === 0)
            this.destroy();
        else
            this.apply();
    }

    destroy() {
        this._setClasses([]);
        this._setRadius(false);
        if (this._styleId && !this._dead)
            this.target.disconnect(this._styleId);
        this._styleId = 0;
        if (this._destroyId) {
            this.target.disconnect(this._destroyId);
            this._destroyId = 0;
        }
        for (const h of this.handles)
            h._entry = null;
        this.handles.clear();
        this._svc.forget(this);
    }

    apply() {
        if (this._dead)
            return;
        this.params = this._svc.resolveFor(this);
        this.sync();
    }

    sync() {
        if (this._dead || !this.params)
            return;
        let visible = true;
        for (const h of this.handles)
            visible &&= h.visible;
        const glassy = this._glassy;
        this._setRadius(glassy && this.opts.radius !== undefined);
        this._setClasses(glassy && visible ? fillClasses(this.params, this.surface) : []);
    }

    _setClasses(wanted) {
        if (this._dead) {
            this._classes = [];
            return;
        }
        for (const c of this._classes) {
            if (!wanted.includes(c))
                this.target.remove_style_class_name(c);
        }
        for (const c of wanted) {
            if (!this._classes.includes(c))
                this.target.add_style_class_name(c);
        }
        this._classes = wanted;
    }

    _setRadius(on) {
        if (this._dead) {
            this._radiusStyle = '';
            return;
        }
        const fragment = on ? ` border-radius: ${Math.round(this.opts.radius)}px;` : '';
        if (fragment === this._radiusStyle)
            return;
        let style = this.target.get_style() ?? '';
        if (this._radiusStyle && style.endsWith(this._radiusStyle))
            style = style.slice(0, -this._radiusStyle.length);
        style += fragment;
        this.target.set_style(style || null);
        this._radiusStyle = fragment;
    }
}

class GlassService {
    constructor() {
        this._entries = new Map();      // target -> Map(surface -> GlassEntry)
        this._listeners = new Set();
        this._reg = null;               // CleanupRegistry while running
        this._gsOverride = null;
        this._warned = false;
        this._snap = null;
        // blurOk / powerSaver stay for resolve(): there is no blur to fail or to save power on
        this._env = { highContrast: false, reducedMotion: false, powerSaver: false, dark: true, blurOk: true };
    }

    // ---- public API -----------------------------------------------------

    /** Optional: hand the service the extension's Gio.Settings (default: looked up). */
    configure(gsettings) {
        this._gsOverride = gsettings;
    }

    /**
     * Should this surface be glass right now? Pass the raw Gio.Settings you already
     * hold (ctx.settings) when calling before the service is running.
     */
    wants(surface, gsettings = null) {
        // Settings passed in are read fresh: a caller's 'changed' handler can run before
        // the service has refreshed its own snapshot.
        if (gsettings)
            return wantsSurface(readSnapshot(gsettings), surface);
        const gs = this._settingsObject();
        if (!this._snap && !gs)
            return false;
        return wantsSurface(this._snap ?? readSnapshot(gs), surface);
    }

    /** False under reduced motion: do not animate glass in that case. */
    get motion() {
        return !this._env.reducedMotion;
    }

    /** Current settings snapshot (liquid, style, ...). */
    get snapshot() {
        if (this._snap)
            return this._snap;
        const gs = this._settingsObject();
        return gs ? readSnapshot(gs) : this._offSnapshot();
    }

    /**
     * Call fn({snapshot, env}) now and after any change that can alter how glass
     * resolves (settings, colour scheme, high contrast, reduced motion).
     */
    watch(registry, fn) {
        if (!this._settingsObject()) {
            fn({ snapshot: this._offSnapshot(), env: { ...this._env } });
            return;
        }
        this._start();
        this._listeners.add(fn);
        registry.add(() => {
            this._listeners.delete(fn);
            this._maybeStop();
        });
        fn({ snapshot: this._snap, env: { ...this._env } });
    }

    /** @returns {GlassHandle} */
    attach(target, opts = {}) {
        const options = { surface: 'overlays', ...opts };
        if (!this._settingsObject())
            return new GlassHandle(null, options);   // inert: tier 'off', every call is a no-op
        this._start();
        let bySurface = this._entries.get(target);
        if (!bySurface) {
            bySurface = new Map();
            this._entries.set(target, bySurface);
        }
        let entry = bySurface.get(options.surface);
        if (!entry) {
            entry = new GlassEntry(this, target, options);
            bySurface.set(options.surface, entry);
        }
        const handle = new GlassHandle(entry, options);
        entry.handles.add(handle);
        entry.apply();
        return handle;
    }

    // ---- internals used by entries ---------------------------------------

    resolveFor(entry) {
        const env = { ...this._env };
        env.dark = entry.opts.isDark ? !!entry.opts.isDark() : this.textIsLight(entry.target);
        return resolve(this._snap, env, entry.surface, entry.opts.role ?? 'small');
    }

    /** Light text on this actor means dark glass behind it. Falls back to the shell scheme. */
    textIsLight(actor) {
        const node = actor.peek_theme_node?.();
        if (!node)
            return this._env.dark;
        const c = node.get_foreground_color();
        return (0.2126 * c.red + 0.7152 * c.green + 0.0722 * c.blue) / 255 > 0.5;
    }

    forget(entry) {
        const bySurface = this._entries.get(entry.target);
        bySurface?.delete(entry.surface);
        if (bySurface?.size === 0)
            this._entries.delete(entry.target);
        this._maybeStop();
    }

    _forEach(fn) {
        for (const bySurface of [...this._entries.values()]) {
            for (const entry of [...bySurface.values()])
                fn(entry);
        }
    }

    // ---- lifecycle ------------------------------------------------------

    // Settings come only from Glass.configure() (extension.js). Unconfigured: log once, act as off.
    _settingsObject() {
        if (!this._gsOverride && !this._warned) {
            this._warned = true;
            console.warn('[Kiwi] Glass used before Glass.configure(); glass stays off');
        }
        return this._gsOverride;
    }

    _offSnapshot() {
        return { ...readSnapshot(null), liquid: false };
    }

    _start() {
        if (this._reg)
            return;
        const reg = new CleanupRegistry();
        this._reg = reg;
        const gs = this._settingsObject();

        if (gs) {
            const ks = new KiwiSettings(gs);
            ks.attach(reg);
            ks.watch(Object.keys(SETTING_FIELDS), () => this._refresh());
        }
        this._snap = readSnapshot(gs);

        const st = St.Settings.get();
        const syncSt = () => {
            // The Shell uses its dark stylesheet unless the scheme asks for light
            this._env.dark = st.colorScheme !== St.SystemColorScheme.PREFER_LIGHT;
            this._env.highContrast = !!st.highContrast;
        };
        syncSt();
        reg.connect(st, 'notify::color-scheme', () => { syncSt(); this._refresh(); });
        reg.connect(st, 'notify::high-contrast', () => { syncSt(); this._refresh(); });

        let started = false;
        watchReducedMotion(reg, reduced => {
            this._env.reducedMotion = reduced;
            if (started)
                this._refresh();
        });
        started = true;
    }

    _maybeStop() {
        if (!this._reg || this._entries.size > 0 || this._listeners.size > 0)
            return;
        const reg = this._reg;
        this._reg = null;
        this._snap = null;
        reg.dispose();
    }

    _refresh() {
        if (!this._reg)
            return;
        this._snap = readSnapshot(this._settingsObject());
        this._forEach(e => e.apply());
        for (const fn of [...this._listeners]) {
            try {
                fn({ snapshot: this._snap, env: { ...this._env } });
            } catch (e) {
                console.error('[Kiwi] glass listener failed:', e);
            }
        }
    }
}

export const Glass = new GlassService();
