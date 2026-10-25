// SPDX-License-Identifier: GPL-3.0-or-later
// GlassService: the one blur + tint + highlight implementation in Kiwi.
//
// Features call Glass.attach(actor, {surface, ...}) and get a handle. The service
// owns everything else: reading the liquid-glass-* settings, the colour scheme,
// high contrast, reduced motion, Power Saver, throttled repaints of the backdrop blur
// (GNOME Shell #2857) and the legacy panel-blur / dock-blur keys while Liquid Glass is
// off. The API is the exported Glass object below.
//
// Layer structure per attached target (the "layers: 'glass'" form):
//
//   Meta.BackgroundGroup (0x0, out of layout)          inserted into opts.parent
//    +- wrapper St.Widget .kiwi-glass  (drop shadow)   follows the target's rectangle
//        +- backdrop  live: St.Widget + Shell.BlurEffect BACKGROUND
//        |            still: clipped wallpaper copy + Shell.BlurEffect ACTOR (+ refraction)
//        +- tint      St.Widget .kiwi-glass-tint (tint colour, 1px rim, inset highlight)
//
// St draws one box-shadow per element, hence the separate shadow and highlight actors.
// With layers: 'blur' the wrapper is just the blur widget (the caller keeps its own tint).

import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Background from 'resource:///org/gnome/shell/ui/background.js';

import { CleanupRegistry } from './disposables.js';
import { KiwiSettings, runMigrations } from './settings.js';
import { watchReducedMotion } from './compat.js';
import { connectPaintSignal } from './blurPaintSignal.js';
import { RefractionEffect } from './glassRefraction.js';
import {
    SETTING_FIELDS, readSnapshot, wantsSurface, resolve, tintColor, legacySurfaces,
} from './glassParams.js';

const BLUR_EFFECT = 'kiwi-glass-blur';
const REFRACTION_EFFECT = 'kiwi-glass-refraction';
const FADE_MS = 150;
const FOLLOW_SIGNALS = ['notify::position', 'notify::size', 'notify::allocation'];

class GlassHandle {
    constructor(entry, opts) {
        this._entry = entry;
        this._visible = true;
        this.layers = opts.layers ?? 'glass';
    }

    get visible() { return this._visible; }

    /** 'off' | 'blur' | 'light' | 'opaque' as currently resolved for this surface. */
    get tier() { return this._entry?.params?.tier ?? 'off'; }

    /** The resolved numbers (alpha, radius, dark, ...) or null. Read-only. */
    get params() { return this._entry?.params ?? null; }

    /** Caller-side hide (overview, fullscreen). The layer shows only if every handle is visible. */
    setVisible(visible) {
        if (!this._entry || this._visible === visible)
            return;
        this._visible = visible;
        this._entry.syncVisible();
    }

    /** Rectangle in parent coordinates, for attach(..., {follow: false}). */
    setRect(x, y, width, height) {
        this._entry?.setRect(x, y, width, height);
    }

    /** Re-resolve now (call after something the isDark callback reads has changed). */
    refresh() {
        this._entry?.apply();
    }

    /** Resync geometry and repaint now. */
    invalidate() {
        this._entry?.syncGeometry();
        this._entry?.repaint();
    }

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
        this._sig = '';
        this._dead = false;
        this._group = null;
        this._groupDestroyId = 0;
        this._wrapper = null;
        this._tint = null;
        this._effect = null;
        this._still = null;
        this._refraction = null;
        this._rect = null;
        this._chain = [];       // [actor, id] follow-the-target signals
        this._shown = false;
        this._destroyId = target.connect('destroy', () => {
            this._destroyId = 0;
            this._dead = true;  // skip any sync/repaint still queued; chain entries of live ancestors are disconnected in _teardown
            this.destroy();
        });
    }

    get layers() {
        for (const h of this.handles) {
            if (h.layers === 'glass')
                return 'glass';
        }
        return 'blur';
    }

    get _backdrop() { return this.opts.mode !== 'self'; }

    // ---- lifecycle ------------------------------------------------------

    release(handle) {
        this.handles.delete(handle);
        if (this.handles.size === 0)
            this.destroy();
        else
            this.apply();
    }

    destroy() {
        this._teardown();
        if (this._destroyId) {
            this.target.disconnect(this._destroyId);
            this._destroyId = 0;
        }
        for (const h of this.handles)
            h._entry = null;
        this.handles.clear();
        this._svc.forget(this);
    }

    // ---- settings -> actors ---------------------------------------------

    apply() {
        if (this._dead)
            return;
        const params = this._svc.resolveFor(this);
        this.params = params;

        if (!this._backdrop) {
            this._applySelf(params);
            return;
        }

        const sig = [params.tier, params.still, params.refraction, this.layers].join('|');
        if (sig !== this._sig) {
            this._teardown();
            this._sig = sig;
            this._build(params);
        }
        this._update(params);
        this.syncVisible();
    }

    _applySelf(params) {
        // 'self' mode: a cached ACTOR-mode blur on the target (static content only).
        const want = (params.tier === 'blur' || params.tier === 'light') && this._allVisible();
        if (want && !this._effect) {
            try {
                this._effect = new Shell.BlurEffect({
                    mode: Shell.BlurMode.ACTOR,
                    radius: params.radius,
                    brightness: params.brightness,
                });
                this.target.add_effect_with_name(BLUR_EFFECT, this._effect);
            } catch (e) {
                console.error('[Kiwi] glass blur unavailable:', e);
                this._effect = null;
                this._svc.blurFailed();
            }
        } else if (!want && this._effect) {
            this.target.remove_effect_by_name(BLUR_EFFECT);
            this._effect = null;
        }
        if (this._effect) {
            this._effect.radius = params.radius;
            this._effect.brightness = params.brightness;
        }
    }

    _allVisible() {
        for (const h of this.handles) {
            if (!h.visible)
                return false;
        }
        return true;
    }

    _build(params) {
        const opts = this.opts;
        const parent = opts.parent ?? this.target.get_parent();
        const glassy = this.layers === 'glass';
        const blurred = params.tier === 'blur';
        // Nothing to draw: glass is off, or the caller keeps its own tint and there is no blur.
        if (!parent || params.tier === 'off' || (!glassy && !blurred))
            return;

        this._group = new Meta.BackgroundGroup({
            name: `kiwi-glass-group-${opts.name ?? this.surface}`,
            width: 0,
            height: 0,
        });
        // The Shell can destroy the group from C (e.g. when it rebuilds backgrounds).
        // Forget everything under it; never touch the disposed objects afterwards.
        const group = this._group;
        this._groupDestroyId = group.connect('destroy', () => {
            this._groupDestroyId = 0;
            this._still?.manager?.destroy();   // children are still alive during 'destroy'
            this._still = null;
            this._refraction = null;
            this._effect = null;
            this._tint = null;
            this._wrapper = null;
            this._group = null;
            this._shown = false;
            this._sig = '';
        });

        let backdrop = null;
        if (blurred) {
            if (params.still) {
                backdrop = this._buildStill(params);
            } else {
                backdrop = new St.Widget({
                    name: glassy ? null : (opts.name ?? `kiwi-glass-${this.surface}`),
                    x_expand: true,
                    y_expand: true,
                });
                try {
                    this._effect = new Shell.BlurEffect({
                        mode: Shell.BlurMode.BACKGROUND,
                        radius: params.radius,
                        brightness: params.brightness,
                    });
                    backdrop.add_effect_with_name(BLUR_EFFECT, this._effect);
                    // Shell.BlurEffect does not repaint when content above or below it changes
                    connectPaintSignal(backdrop, () => this._svc.scheduleRepaint());
                } catch (e) {
                    console.error('[Kiwi] glass blur unavailable:', e);
                    this._effect = null;
                    this._svc.blurFailed();
                }
            }
        }

        if (glassy) {
            this._wrapper = new St.Widget({
                name: opts.name ?? `kiwi-glass-${this.surface}`,
                style_class: 'kiwi-glass',
                layout_manager: new Clutter.BinLayout(),
            });
            if (backdrop)
                this._wrapper.add_child(backdrop);
            this._tint = new St.Widget({
                style_class: 'kiwi-glass-tint',
                x_expand: true,
                y_expand: true,
                reactive: false,
            });
            this._wrapper.add_child(this._tint);
        } else {
            this._wrapper = backdrop;
        }
        this._wrapper.hide();   // syncVisible() shows it
        this._group.add_child(this._wrapper);

        if (opts.below && opts.below.get_parent() === parent)
            parent.insert_child_below(this._group, opts.below);
        else
            parent.insert_child_at_index(this._group, 0);

        if (opts.follow !== false) {
            this._followTarget(parent);
            this.syncGeometry();
        } else {
            this._applyRect();
        }
        this._svc.scheduleRepaint();
    }

    _buildStill(params) {
        // Performance mode: blur a still copy of the wallpaper once (ACTOR mode caches the
        // offscreen) instead of re-blurring the live screen every frame.
        const clip = new St.Widget({ x_expand: true, y_expand: true, clip_to_allocation: true });
        const holder = new St.Widget();
        this._effect = new Shell.BlurEffect({
            mode: Shell.BlurMode.ACTOR,
            radius: params.radius,
            brightness: params.brightness,
        });
        holder.add_effect_with_name(BLUR_EFFECT, this._effect);
        clip.add_child(holder);
        this._still = { holder, manager: null, monitor: -1 };

        if (params.refraction) {
            this._refraction = RefractionEffect.create();
            if (this._refraction)
                clip.add_effect_with_name(REFRACTION_EFFECT, this._refraction.effect);
        }
        return clip;
    }

    _syncStill() {
        const still = this._still;
        const parent = this._group?.get_parent();
        if (!still || !this._rect || !parent)
            return;
        const [px, py] = parent.get_transformed_position();
        const absX = px + this._rect.x;
        const absY = py + this._rect.y;
        const cx = absX + this._rect.width / 2;
        const cy = absY + this._rect.height / 2;
        const monitors = Main.layoutManager.monitors;
        let index = monitors.findIndex(m => cx >= m.x && cx < m.x + m.width && cy >= m.y && cy < m.y + m.height);
        if (index < 0)
            index = Main.layoutManager.primaryIndex;
        const monitor = monitors[index];
        if (!monitor)
            return;
        if (still.monitor !== index) {
            still.manager?.destroy();
            still.holder.set_size(monitor.width, monitor.height);
            // BackgroundManager keeps the wallpaper (and its light/dark variant) current;
            // controlPosition:false skips its own layout pass (see overviewWallpaper.js).
            still.manager = new Background.BackgroundManager({
                container: still.holder,
                monitorIndex: index,
                controlPosition: false,
            });
            still.monitor = index;
        }
        still.holder.set_position(Math.round(monitor.x - absX), Math.round(monitor.y - absY));
    }

    rebuildForMonitors() {
        if (this._still) {
            this._still.monitor = -1;
            this._syncStill();
        }
    }

    _teardown() {
        for (const [actor, id] of this._chain) {
            try {
                actor.disconnect(id);
            } catch (_e) {
                // ancestor already destroyed
            }
        }
        this._chain = [];
        this._still?.manager?.destroy();
        this._still = null;
        this._refraction = null;
        if (!this._backdrop && !this._dead && this.target.get_effect(BLUR_EFFECT))
            this.target.remove_effect_by_name(BLUR_EFFECT);
        this._effect = null;
        this._tint = null;
        this._wrapper = null;
        if (this._group) {
            // destroy() unparents the group and destroys its children
            const group = this._group;
            this._group = null;
            if (this._groupDestroyId) {
                group.disconnect(this._groupDestroyId);
                this._groupDestroyId = 0;
            }
            group.destroy();
        }
        this._sig = '';
        if (this.opts.follow !== false)
            this._rect = null;
        this._shown = false;
    }

    // ---- appearance -----------------------------------------------------

    _update(params) {
        if (!this._group)
            return;
        if (this._effect) {
            this._effect.radius = params.radius;
            this._effect.brightness = params.brightness;
        }
        if (!this._tint)
            return;

        const opts = this.opts;
        const radius = opts.radius ?? 0;
        const classes = ['kiwi-glass', params.dark ? 'kiwi-glass-dark' : 'kiwi-glass-light',
            this._svc.snapshot.style === 'clear' ? 'kiwi-glass-clear' : 'kiwi-glass-tinted'];
        if (params.tier === 'opaque')
            classes.push('kiwi-glass-opaque');
        if (!params.motion)
            classes.push('kiwi-glass-static');
        if (opts.shadow ?? !(this.surface === 'panel' || this.surface === 'dock'))
            classes.push('kiwi-glass-shadowed');
        this._wrapper.style_class = classes.join(' ');
        this._wrapper.set_style(`border-radius: ${radius}px;`);

        this._tint.style_class = params.highlight && params.tier !== 'opaque'
            ? 'kiwi-glass-tint kiwi-glass-highlight' : 'kiwi-glass-tint';
        this._tint.set_style(`background-color: ${tintColor(params)}; border-radius: ${radius}px;`);

        if (this._refraction && this._rect)
            this._refraction.update(this._rect.width, this._rect.height, radius, 1);
    }

    syncVisible() {
        if (this._dead)
            return;
        if (!this._backdrop) {
            this.apply();
            return;
        }
        const wrapper = this._wrapper;
        if (!wrapper)
            return;
        let want = this._allVisible();
        // The opaque tier draws no blur; for blur-only layers there is then nothing to show.
        if (this.params.tier === 'opaque' && this.layers === 'blur')
            want = false;
        if (want === this._shown)
            return;
        this._shown = want;

        wrapper.remove_all_transitions();
        if (this.params.motion && wrapper.get_stage()) {
            if (want) {
                wrapper.opacity = 0;
                wrapper.show();
                wrapper.ease({ opacity: 255, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            } else {
                wrapper.ease({
                    opacity: 0,
                    duration: FADE_MS,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    onComplete: () => {
                        if (!this._shown)
                            wrapper.hide();
                    },
                });
            }
        } else {
            wrapper.opacity = 255;
            wrapper.visible = want;
        }
        if (want)
            this._svc.scheduleRepaint();
    }

    // ---- geometry -------------------------------------------------------

    setRect(x, y, width, height) {
        this._rect = { x, y, width, height };
        this._applyRect();
    }

    _followTarget(parent) {
        // The target moves when it, or any ancestor below `parent`, moves or resizes.
        const watch = actor => {
            for (const sig of FOLLOW_SIGNALS)
                this._chain.push([actor, actor.connect(sig, () => this.syncGeometry())]);
            // A destroyed ancestor is gone with its handlers: drop its entries
            const id = actor.connect('destroy', () => {
                this._chain = this._chain.filter(([a]) => a !== actor);
            });
            this._chain.push([actor, id]);
        };
        for (let a = this.target; a && a !== parent; a = a.get_parent())
            watch(a);
        watch(parent);
    }

    syncGeometry() {
        if (this._dead || !this._group || this.opts.follow === false)
            return;
        const parent = this._group.get_parent();
        if (!parent)
            return;
        const target = this.target;
        let x = target.x;
        let y = target.y;
        if (target.get_parent() !== parent) {
            const [tx, ty] = target.get_transformed_position();
            const [px, py] = parent.get_transformed_position();
            x = tx - px;
            y = ty - py;
        }
        this.setRect(x, y, target.width, target.height);
    }

    _applyRect() {
        if (!this._wrapper || !this._rect)
            return;
        const { x, y, width, height } = this._rect;
        this._wrapper.set_position(x, y);
        this._wrapper.set_size(width, height);
        this._syncStill();
        this._refraction?.update(width, height, this.opts.radius ?? 0, 1);
        this._svc.scheduleRepaint();
    }

    repaint() {
        if (!this._dead && this._effect && this._backdrop && this._wrapper?.visible && !this._still)
            this._effect.queue_repaint();
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
        this._env = { highContrast: false, reducedMotion: false, powerSaver: false, dark: true, blurOk: true };
        this._repaintId = 0;
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
        const gs = gsettings ?? this._settingsObject();
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
     * resolves (settings, colour scheme, high contrast, reduced motion, Power Saver).
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
        if (entry.opts.isDark)
            env.dark = !!entry.opts.isDark();
        if (entry.surface === 'wallpaper') {
            // A plain cached blur of the wallpaper: not a glass surface, no tint, no legacy key.
            return { tier: 'blur', legacy: false, radius: entry.opts.radius ?? 60,
                brightness: entry.opts.brightness ? entry.opts.brightness(env.dark) : 1, alpha: 0,
                dim: false, highlight: false, still: false, refraction: false, dark: env.dark,
                motion: !env.reducedMotion };
        }
        return resolve(this._snap, env, entry.surface, entry.opts.role ?? 'small');
    }

    blurFailed() {
        if (this._env.blurOk) {
            this._env.blurOk = false;
            // Not inside the entry's apply(): let the current pass finish first
            // (registry idle: dropped on stop, so it cannot outlive disable)
            this._reg?.idle(() => this._refresh());
        }
    }

    scheduleRepaint() {
        if (this._repaintId || !this._reg)
            return;
        // Registry idle: removed by dispose() on stop, so it cannot outlive disable
        this._repaintId = this._reg.idle(() => {
            this._repaintId = 0;
            this._forEach(e => e.repaint());
        });
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
        return { ...readSnapshot(null), liquid: false, panelBlur: false, dockBlur: false };
    }

    _start() {
        if (this._reg)
            return;
        const reg = new CleanupRegistry();
        this._reg = reg;
        const gs = this._settingsObject();

        if (gs) {
            this._migrate(gs);
            const ks = new KiwiSettings(gs);
            ks.attach(reg);
            ks.watch(Object.keys(SETTING_FIELDS), () => this._refresh());
        }
        this._snap = readSnapshot(gs);

        const st = St.Settings.get();
        const syncSt = () => {
            this._env.dark = st.colorScheme === St.SystemColorScheme.PREFER_DARK;
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

        this._watchPower(reg);
        this._connectRepaintSources(reg);
        reg.connect(Main.layoutManager, 'monitors-changed', () => this._forEach(e => e.rebuildForMonitors()));
        reg.add(() => { this._repaintId = 0; });
    }

    _maybeStop() {
        if (!this._reg || this._entries.size > 0 || this._listeners.size > 0)
            return;
        const reg = this._reg;
        this._reg = null;
        this._snap = null;
        reg.dispose();
    }

    _migrate(gs) {
        // panel-blur / dock-blur -> liquid-glass-surfaces. One combined list, written once
        // (runMigrations skips the second entry because `to` is then user-set).
        const userBool = key => {
            if (!gs.settings_schema?.has_key(key))
                return null;
            const v = gs.get_user_value(key);
            return v === null ? null : v.get_boolean();
        };
        const map = () => legacySurfaces({ panelBlur: userBool('panel-blur'), dockBlur: userBool('dock-blur') }) ?? [];
        runMigrations(gs, [
            { from: 'panel-blur', to: 'liquid-glass-surfaces', map },
            { from: 'dock-blur', to: 'liquid-glass-surfaces', map },
        ]);
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

    _watchPower(reg) {
        // Power Saver (power-profiles-daemon) can switch glass to the cheap still-wallpaper path.
        const cancellable = new Gio.Cancellable();
        reg.add(() => cancellable.cancel());
        Gio.DBusProxy.new_for_bus(Gio.BusType.SYSTEM, Gio.DBusProxyFlags.DO_NOT_AUTO_START,
            null, 'net.hadess.PowerProfiles', '/net/hadess/PowerProfiles', 'net.hadess.PowerProfiles',
            cancellable, (_o, res) => {
                let proxy;
                try {
                    proxy = Gio.DBusProxy.new_for_bus_finish(res);
                } catch (_e) {
                    return;     // no power-profiles-daemon: Power Saver never triggers
                }
                if (this._reg !== reg)
                    return;
                const sync = () => {
                    const profile = proxy.get_cached_property('ActiveProfile')?.get_string()[0];
                    const saver = profile === 'power-saver';
                    if (saver !== this._env.powerSaver) {
                        this._env.powerSaver = saver;
                        this._refresh();
                    }
                };
                reg.connect(proxy, 'g-properties-changed', sync);
                sync();
            });
    }

    _connectRepaintSources(reg) {
        const repaint = () => this.scheduleRepaint();
        reg.connect(global.display, 'restacked', repaint);
        for (const sig of ['map', 'destroy', 'minimize', 'unminimize', 'switch-workspace'])
            reg.connect(global.window_manager, sig, repaint);
        reg.connect(Main.overview, 'showing', repaint);
        reg.connect(Main.overview, 'hidden', repaint);

        // Wallpaper changes
        const bgGroup = Main.layoutManager._backgroundGroup;
        if (!bgGroup)
            return;
        const tokens = new Map();
        const watchBg = bg => {
            tokens.set(bg, reg.connect(bg, 'notify::content', repaint));
        };
        for (const bg of bgGroup)
            watchBg(bg);
        reg.connect(bgGroup, 'child-added', (_g, child) => watchBg(child));
        reg.connect(bgGroup, 'child-removed', (_g, child) => {
            const token = tokens.get(child);
            if (token !== undefined)
                reg.release(token);
            tokens.delete(child);
        });
    }
}

export const Glass = new GlassService();
