// SPDX-License-Identifier: GPL-3.0-or-later
// PanelVisibility: the one owner of "is the top bar on screen".
//
// Modes (settings panel-autohide + panel-autohide-fullscreen-only, see the model):
//   always            stock behaviour; the feature is not running
//   fullscreen-hover  stock off fullscreen; over a fullscreen window the bar hides and
//                     comes back when the pointer pushes against the top edge
//   autohide          the bar always hides; no strut, so windows get the full height
//
// Public API for other features (stable):
//
//   import { PanelVisibility } from '../coordinators/panelVisibility.js';
//   const hold = PanelVisibility.hold(cleanup, 'notch');   // requiresVisibility: bar stays up
//   hold.release();                                         // also runs on cleanup.dispose()
//   PanelVisibility.reveal();                               // show now, normal hide delay after
//   PanelVisibility.isVisible();  PanelVisibility.autoHiding();  PanelVisibility.mode();
//   PanelVisibility.connect(cleanup, ({visible, autoHiding, mode}) => ...);
//
// holds work whether or not the controller is running: they are remembered and applied when it
// starts, and they are no-ops for the bar in `always` mode.
//
// Shell API used (checked against layout.js 48.0, 49.0, 50.0, main):
//   LayoutManager.untrackChrome/trackChrome (public) to flip affectsStruts / trackFullscreen
//   Layout.PressureBarrier + Meta.Barrier({backend, ...}), same constructor in 48 to 51
// Private, guarded: Main.overview._overview.controls.layout_manager._updateWorkAreaBox, to keep
// the overview below the bar once the strut is gone (same private surface as
// apps/overviewSeamlessZoom.js). Not run on a real shell yet.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';

import { KiwiSettings } from '../lib/settings.js';
import { watchReducedMotion, setUnredirectAllowed, STOCK_PANEL_CHROME } from '../lib/compat.js';
import {
    initialState, step, visible, wantsStrut, modeFromSettings,
    edgeSegments, hasMonitorAbove, chromeFlagsFor,
} from './panelVisibilityModel.js';

const SHOW_MS = 320;
const HIDE_MS = 320;
const PRESSURE_THRESHOLD = 50;   // px of push against the edge
const PRESSURE_TIMEOUT = 600;    // ms window for that push
const STYLE_CLASS = 'kiwi-panel-autohide';

// --- module-level service state ------------------------------------------------------------
const holds = new Map();         // token -> name
const listeners = new Set();
let nextHold = 1;
let controller = null;

function emit() {
    const info = {
        visible: PanelVisibility.isVisible(),
        autoHiding: PanelVisibility.autoHiding(),
        mode: PanelVisibility.mode(),
    };
    for (const fn of [...listeners]) {
        try {
            fn(info);
        } catch (e) {
            console.error('[Kiwi] PanelVisibility listener failed:', e);
        }
    }
}

export const PanelVisibility = {
    /**
     * requiresVisibility: keep the bar on screen until released.
     * @param {CleanupRegistry} cleanup released on dispose
     * @param {string} name label for debugging
     * @returns {{release: function(): void}}
     */
    hold(cleanup, name) {
        const token = `${name}#${nextHold++}`;
        holds.set(token, name);
        controller?._dispatch({ type: 'hold', id: token });
        let done = false;
        const handle = {
            release() {
                if (done)
                    return;
                done = true;
                holds.delete(token);
                controller?._dispatch({ type: 'release', id: token });
            },
        };
        cleanup?.add(() => handle.release());
        return handle;
    },

    /** Show the bar now; it hides again after the hide delay unless held. */
    reveal() {
        controller?._dispatch({ type: 'reveal-now' });
    },

    /** @returns {boolean} the bar is (or is animating to being) on screen */
    isVisible() {
        return controller ? controller._shown : true;
    },

    /** @returns {boolean} the bar hides itself everywhere (mode autohide) */
    autoHiding() {
        return controller?.mode() === 'autohide';
    },

    /** @returns {'always'|'fullscreen-hover'|'autohide'} */
    mode() {
        return controller ? controller.mode() : 'always';
    },

    /**
     * @param {CleanupRegistry} cleanup
     * @param {function({visible: boolean, autoHiding: boolean, mode: string}): void} fn
     */
    connect(cleanup, fn) {
        listeners.add(fn);
        cleanup?.add(() => listeners.delete(fn));
    },
};

/** features.js `when:` helper: should the controller run for these settings? */
export function wantsController(gsettings) {
    return modeFromSettings({
        autohide: gsettings.get_boolean('panel-autohide'),
        fullscreenOnly: gsettings.get_boolean('panel-autohide-fullscreen-only'),
    }) !== 'always';
}

// --- the controller (one per enable) ------------------------------------------------------
export class PanelVisibilityFeature {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
    }

    mode() {
        return this._s.mode;
    }

    enable() {
        const cleanup = this._cleanup;
        const ks = new KiwiSettings(this._ctx.settings);
        this._ks = ks;
        ks.attach(cleanup);

        this._box = Main.layoutManager.panelBox;
        this._timers = { reveal: 0, hide: 0 };
        this._shown = true;
        this._strut = true;
        this._unredirectHeld = false;
        this._reduced = false;
        this._height = 0;
        this._menus = new Set();
        this._menuSeq = 1;
        this._focusHeld = false;
        this._barriers = [];
        this._pressure = null;
        this._desktopQueued = 0;
        this._dead = false;

        const box = this._box;
        // The public chrome API has no getter, so read the layout manager's tracking record
        // (private _trackedActors, guarded; falls back to the stock flags if it is gone).
        const saved = {
            trackHover: box.track_hover,
            reactive: box.reactive,
            visible: box.visible,
            chrome: chromeFlagsFor(Main.layoutManager._trackedActors, box, STOCK_PANEL_CHROME),
        };
        // Registered first, so it runs last on dispose: put the bar back exactly as the stock
        // shell has it.
        cleanup.add(() => this._restore(saved));

        this._readConfig();
        this._s = initialState({
            mode: this._mode,
            keepOnDesktop: this._keepOnDesktop,
            fullscreen: this._primaryFullscreen(),
            overview: Main.overview.visible,
            desktop: false,
            holds: [...holds.keys()],
        });

        watchReducedMotion(cleanup, reduced => (this._reduced = reduced));

        box.track_hover = true;
        box.reactive = true;
        cleanup.connect(box, 'notify::hover', () =>
            this._dispatch({ type: 'pointer', inside: box.hover }));
        cleanup.connect(box, 'notify::height', () => {
            if (box.height > 0)
                this._height = box.height;
            this._rebuildBarrier();
        });

        cleanup.connect(global.display, 'in-fullscreen-changed', () => this._refreshEnv());
        cleanup.connect(Main.layoutManager, 'monitors-changed', () => {
            this._rebuildBarrier();
            this._refreshEnv();
            this._repark();
        });
        cleanup.connect(Main.overview, 'showing', () =>
            this._dispatch({ type: 'set', patch: { overview: true } }));
        cleanup.connect(Main.overview, 'hiding', () =>
            this._dispatch({ type: 'set', patch: { overview: false } }));
        cleanup.connect(this._ctx.interfaceSettings, 'changed::enable-hot-corners', () =>
            this._rebuildBarrier());

        this._watchDesktop();
        this._watchMenus();
        this._watchPanelFocus();
        this._patchOverviewInset();

        ks.watch(['panel-autohide', 'panel-autohide-fullscreen-only', 'panel-autohide-keep-on-desktop',
            'panel-autohide-reveal-delay', 'panel-autohide-hide-delay'], () => this._onSettings());

        this._buildPressure();
        this._rebuildBarrier();
        Main.panel.add_style_class_name(STYLE_CLASS);
        this._queueDesktop();

        controller = this;
        cleanup.add(() => {
            // Runs first on dispose: from here on no handler may touch the bar again.
            this._dead = true;
            if (controller === this)
                controller = null;
            emit();
        });

        // First pass without animation: the bar starts in the state the model wants.
        this._sync(false);
        emit();
    }

    disable() {
        // Everything is undone by the cleanup registry the registry disposes next.
    }

    // -- config ------------------------------------------------------------------------------
    _readConfig() {
        const ks = this._ks;
        this._mode = modeFromSettings({
            autohide: ks.bool('panel-autohide'),
            fullscreenOnly: ks.bool('panel-autohide-fullscreen-only'),
        });
        this._keepOnDesktop = ks.bool('panel-autohide-keep-on-desktop');
        this._cfg = {
            revealDelay: ks.int('panel-autohide-reveal-delay'),
            hideDelay: ks.int('panel-autohide-hide-delay'),
        };
    }

    _onSettings() {
        const previous = this._mode;
        this._readConfig();
        this._dispatch({ type: 'set', patch: { mode: this._mode, keepOnDesktop: this._keepOnDesktop } });
        if (previous !== this._mode) {
            this._rebuildBarrier();
            this._refreshOverviewLayout();
            emit();
        }
        this._queueDesktop();
    }

    // -- the state machine loop -------------------------------------------------------------
    _dispatch(event) {
        if (!this._s || this._dead)
            return;
        const { state, effects } = step(this._s, event, this._cfg);
        this._s = state;
        for (const eff of effects) {
            if (eff.type === 'timer')
                this._startTimer(eff.name, eff.ms);
            else
                this._stopTimer(eff.name);
        }
        this._sync(true);
    }

    _startTimer(name, ms) {
        this._stopTimer(name);
        this._timers[name] = this._cleanup.timeout(ms, () => {
            this._timers[name] = 0;
            this._dispatch({ type: `${name}-timer` });
            return GLib.SOURCE_REMOVE;
        }, { name: `panel-${name}` });
    }

    _stopTimer(name) {
        if (this._timers[name]) {
            this._cleanup.release(this._timers[name]);
            this._timers[name] = 0;
        }
    }

    _sync(animate) {
        const want = visible(this._s);
        const strut = wantsStrut(this._s);
        const changed = want !== this._shown;
        if (strut !== this._strut) {
            // A strut is only wanted while the bar is shown in place (wantsStrut implies
            // visible). The Shell computes the strut from the transformed rect, translation
            // included, and does not redo it when an ease ends, so land the bar at its resting
            // place first, then re-track.
            if (strut) {
                this._shown = true;
                this._animate(true, false);
            }
            this._applyChrome(strut);
        }
        if (changed || !animate) {
            this._shown = want;
            this._animate(want, animate && !(strut && changed));
        }

        const wantUnredirectOff = want && this._s.fullscreen && this._s.mode !== 'always';
        if (wantUnredirectOff !== this._unredirectHeld) {
            this._unredirectHeld = wantUnredirectOff;
            setUnredirectAllowed(!wantUnredirectOff);
        }
        if (changed)
            emit();
    }

    // -- chrome and motion --------------------------------------------------------------------
    // Struts and fullscreen tracking go through the public (un)trackChrome. affectsInputRegion
    // is never passed (see lib/compat.js STOCK_PANEL_CHROME).
    _applyChrome(strut) {
        const lm = Main.layoutManager;
        // Set first: the overview inset and any workareas-changed handler read it.
        this._strut = strut;
        lm.untrackChrome(this._box);
        lm.trackChrome(this._box, { affectsStruts: strut, trackFullscreen: false });
        // trackChrome already queues a region update; make sure one is pending (private,
        // guarded: same name in layout.js 48.0 to main).
        lm._queueUpdateRegions?.();
        this._refreshOverviewLayout();
    }

    // Monitors changed while parked: the bar may now sit over a new monitor above the primary
    // (hide it), or no longer (keep it mapped for keyboard reach), and its height may differ.
    _repark() {
        if (this._shown)
            return;
        const box = this._box;
        box.remove_all_transitions();
        box.translation_y = -this._panelHeight();
        box.opacity = 0;
        if (this._monitorAbove())
            box.hide();
        else
            box.show();
    }

    _panelHeight() {
        const h = this._box.height || Main.panel.height;
        if (h > 0)
            this._height = h;
        return this._height || 40;
    }

    _monitorAbove() {
        const lm = Main.layoutManager;
        const primary = lm.primaryMonitor;
        return !!primary && hasMonitorAbove(primary, lm.monitors.filter(m => m !== primary));
    }

    _animate(show, animate) {
        const box = this._box;
        const h = this._panelHeight();
        box.remove_all_transitions();
        const duration = animate && !this._reduced ? (show ? SHOW_MS : HIDE_MS) : 0;

        if (show) {
            // Shown synchronously, so keyboard focus can land in the bar straight away.
            box.show();
            if (!duration) {
                box.translation_y = 0;
                box.opacity = 255;
                return;
            }
            box.ease({
                translation_y: 0,
                opacity: 255,
                duration,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
            return;
        }

        const park = () => {
            if (this._shown)
                return;
            box.translation_y = -h;
            box.opacity = 0;
            // A monitor above the primary would show the parked bar at its bottom edge.
            // Hiding the actor costs keyboard reach (Ctrl+Alt+Tab skips unmapped actors).
            if (this._monitorAbove())
                box.hide();
        };
        if (!duration) {
            park();
            return;
        }
        box.ease({
            translation_y: -h,
            opacity: 0,
            duration,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: park,
        });
    }

    _restore(saved) {
        const box = this._box;
        Main.panel.remove_style_class_name(STYLE_CLASS);
        box.remove_all_transitions();
        box.translation_y = 0;
        box.opacity = 255;
        box.track_hover = saved.trackHover;
        box.reactive = saved.reactive;
        if (this._unredirectHeld) {
            this._unredirectHeld = false;
            setUnredirectAllowed(true);
        }
        const lm = Main.layoutManager;
        lm.untrackChrome(box);
        // _trackActor re-evaluates visibility itself: hidden again over a fullscreen window.
        box.visible = saved.visible;
        lm.trackChrome(box, { ...saved.chrome });
        this._strut = true;
    }

    // -- pressure barrier -----------------------------------------------------------------------
    _buildPressure() {
        const pressure = new Layout.PressureBarrier(PRESSURE_THRESHOLD, PRESSURE_TIMEOUT,
            Shell.ActionMode.NORMAL);
        // A held button means a drag (window to the top edge to tile, a game): not a reveal.
        pressure.setEventFilter(() => {
            const [, , mods] = global.get_pointer();
            return (mods & Clutter.ModifierType.BUTTON1_MASK) !== 0;
        });
        pressure.connect('trigger', () => this._dispatch({ type: 'edge-pressure' }));
        this._pressure = pressure;
        this._cleanup.add(() => {
            this._destroyBarriers();
            this._pressure?.destroy();
            this._pressure = null;
        });
    }

    _destroyBarriers() {
        for (const b of this._barriers) {
            this._pressure?.removeBarrier(b);
            b.destroy();
        }
        this._barriers = [];
    }

    _rebuildBarrier() {
        if (!this._pressure)
            return;
        this._destroyBarriers();
        if (this._mode === 'always')
            return;
        const lm = Main.layoutManager;
        const primary = lm.primaryMonitor;
        if (!primary)
            return;
        const others = lm.monitors.filter(m => m !== primary);
        // The stock hot corner is a panel-height square; keep clear of it.
        const hotCornerSize = this._ctx.interfaceSettings.get_boolean('enable-hot-corners')
            ? this._panelHeight() : 0;
        const rtl = Clutter.get_default_text_direction() === Clutter.TextDirection.RTL;
        for (const [x1, x2] of edgeSegments(primary, others, { hotCornerSize, rtl })) {
            const barrier = new Meta.Barrier({
                backend: global.backend,
                x1, x2, y1: primary.y, y2: primary.y,
                directions: Meta.BarrierDirection.POSITIVE_Y,
            });
            barrier.connect('left', () => this._dispatch({ type: 'edge-left' }));
            this._pressure.addBarrier(barrier);
            this._barriers.push(barrier);
        }
    }

    // -- environment ------------------------------------------------------------------------------
    _primaryFullscreen() {
        return !!Main.layoutManager.primaryMonitor?.inFullscreen;
    }

    _refreshEnv() {
        this._dispatch({ type: 'set', patch: { fullscreen: this._primaryFullscreen() } });
        this._queueDesktop();
    }

    _watchDesktop() {
        const cleanup = this._cleanup;
        const queue = () => this._queueDesktop();
        cleanup.connect(global.display, 'restacked', queue);
        cleanup.connect(global.workspace_manager, 'active-workspace-changed', queue);
        for (const sig of ['minimize', 'unminimize', 'map', 'destroy'])
            cleanup.connect(global.window_manager, sig, queue);
    }

    _queueDesktop() {
        if (this._desktopQueued || !this._keepOnDesktop)
            return;
        this._desktopQueued = this._cleanup.idle(() => {
            this._desktopQueued = 0;
            const ws = global.workspace_manager.get_active_workspace();
            const types = [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG];
            const empty = !ws.list_windows().some(w =>
                w.is_on_primary_monitor() && w.showing_on_its_workspace() &&
                !w.is_hidden() && types.includes(w.get_window_type()));
            if (empty !== this._s.desktop)
                this._dispatch({ type: 'set', patch: { desktop: empty } });
        }, { name: 'panel-desktop' });
    }

    // -- holds from the panel itself --------------------------------------------------------------
    _watchMenus() {
        const cleanup = this._cleanup;
        for (const indicator of Object.values(Main.panel.statusArea ?? {})) {
            if (indicator?.menu)
                this._trackMenu(indicator.menu);
        }
        // Any menu added later goes through the manager's public addMenu().
        const self = this;
        cleanup.inject(Main.panel.menuManager, 'addMenu', function (orig, menu, ...rest) {
            const result = orig.call(this, menu, ...rest);
            self._trackMenu(menu);
            return result;
        });
    }

    _trackMenu(menu) {
        if (this._dead || !menu || this._menus.has(menu) || typeof menu.connect !== 'function')
            return;
        this._menus.add(menu);
        const id = `menu:${this._menuSeq++}`;
        const hold = () => this._dispatch({ type: 'hold', id });
        const release = () => this._dispatch({ type: 'release', id });
        const cleanup = this._cleanup;
        const openToken = cleanup.connect(menu, 'open-state-changed', (_m, open) => (open ? hold() : release()));
        const destroyToken = cleanup.connect(menu, 'destroy', () => {
            release();
            this._menus.delete(menu);
            cleanup.release(openToken);
            cleanup.release(destroyToken);
        });
        if (menu.isOpen)
            hold();
    }

    _watchPanelFocus() {
        this._cleanup.connect(global.stage, 'notify::key-focus', () => {
            const focus = global.stage.key_focus;
            const inPanel = !!focus && Main.panel.contains(focus);
            if (inPanel === this._focusHeld)
                return;
            this._focusHeld = inPanel;
            this._dispatch({ type: inPanel ? 'hold' : 'release', id: 'panel-focus' });
        });
    }

    // -- overview ---------------------------------------------------------------------------------
    // The overview lays itself out inside the work area. Without the strut that starts at the
    // very top, under the bar (which the overview always shows), so push it down by the bar
    // height whenever the strut is off: autohide, and fullscreen-hover over a fullscreen window.
    _overviewLayout() {
        const layout = Main.overview?._overview?.controls?.layout_manager;
        return typeof layout?._updateWorkAreaBox === 'function' ? layout : null;
    }

    _patchOverviewInset() {
        const layout = this._overviewLayout();
        if (!layout)
            return;
        const self = this;
        // Registered before the injection, so it runs after the injection is removed.
        this._cleanup.add(() => this._refreshOverviewLayout(layout));
        this._cleanup.inject(layout, '_updateWorkAreaBox', function (orig, ...args) {
            orig.apply(this, args);
            const inset = self._strut ? 0 : self._panelHeight();
            const box = this._workAreaBox;
            if (inset > 0 && box) {
                const [x, y] = box.get_origin();
                const [w, h] = box.get_size();
                box.set_origin(x, y + inset);
                box.set_size(w, Math.max(0, h - inset));
            }
        });
        this._refreshOverviewLayout(layout);
    }

    _refreshOverviewLayout(layout = this._overviewLayout()) {
        if (!layout)
            return;
        layout._updateWorkAreaBox();
        layout.layout_changed();
    }
}
