// SPDX-License-Identifier: GPL-3.0-or-later
// Stage Manager feature entry (features.js: `cls: StageManager`).
//
// One stage per workspace model. The focused app's windows are the stage; every other stage is
// hidden (windowHider.js: opacity 0, never minimize) and listed as a card in the strip. Focus
// changes switch the stage, a strip click does too, and the panel minimize button sends the
// window to the strip (WindowState.interceptMinimize). Disabling restores every window.
//
// Pieces: model.js (pure state + maths), shellAdapter.js (windows), windowHider.js (hide and
// restore), strip.js (view), flight.js (the window's trip to its card and back). Registered in
// the entry's CleanupRegistry; disable() is empty.
//
// Motion: when a window leaves the stage (stage switch, panel minimize, a real minimize) a clone
// of it flies from its frame to its card; when it comes back it flies from the card to its frame.
// The Shell's own minimize/unminimize effect is skipped for these windows (Main.wm.skipNextEffect,
// public), so only one animation plays. Reduced motion: a short crossfade in place.
//
// Overview: parked windows (in a strip card) get no preview in the Activities overview or its
// workspace thumbnails: Workspace/WorkspaceThumbnail._isOverviewWindow (private, same in 48-51)
// are wrapped while the feature is on. Alt-Tab still lists them, as on macOS.
//
// The toggle shortcut lives in shortcut.js (its own entry, so it still works while this is off).
// Control Center and Spotlight toggles belong to the Control Center and Spotlight and flip the same key.
// A top bar icon would vanish when the feature is off, so none is built here.

import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as WorkspaceThumbnail from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';

import { WindowState } from '../../coordinators/windowState.js';
import { watchReducedMotion } from '../../lib/compat.js';
import { KiwiSettings } from '../../lib/settings.js';
import { FADE_MS, Flights } from './flight.js';
import { StageModel, fitCount, fitToStage, pointRect, stageArea } from './model.js';
import { StageStrip } from './strip.js';
import { WindowSource } from './shellAdapter.js';
import { WindowHider } from './windowHider.js';

const KEYS = [
    'stage-manager-side',
    'stage-manager-autohide',
    'stage-manager-group-by-app',
    'stage-manager-recent-count',
];

export class StageManager {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._ks = null;
        this._models = new Map();   // Meta.Workspace -> StageModel
        this._strip = null;
        this._source = null;
        this._hider = null;
        this._overview = false;
        this._stageKey = null;      // id of the stage last laid out
        this._first = true;
        this._parked = new Set();   // ids sent to the strip by the minimize button, still holding focus
        this._flights = null;
        this._leaving = new Map();  // Meta.Window -> frame rect it left from, flown after the strip is rebuilt
        this._skipped = new Set();  // actors handed to Main.wm.skipNextEffect
        this._reduced = false;
    }

    _motion() {
        return !this._reduced && St.Settings.get().enable_animations;
    }

    enable() {
        const cleanup = this._cleanup;
        const ks = new KiwiSettings(this._ctx.settings);
        ks.attach(cleanup);
        this._ks = ks;

        watchReducedMotion(cleanup, reduced => {
            this._reduced = reduced;
        });
        this._strip = new StageStrip(cleanup, {
            onActivate: id => this._activate(id),
            motion: () => this._motion(),
        });
        // Created after the strip and the hider's records go after it: on disable the hider
        // restores the windows first, then the clones go, then the strip.
        this._flights = new Flights(cleanup, { onLanded: win => this._strip?.setFlying(win, false) });
        this._hider = new WindowHider(cleanup, {
            motion: () => this._motion(),
            land: win => this._flights?.land(win),
            leaving: win => this._leaving.set(win, this._frame(win)),
            arriving: (win, opacity) => this._flyFromCard(win, opacity),
        });
        this._source = new WindowSource(cleanup, {
            onChange: () => this._sync(),
            onGeometry: () => this._strip?.setStageRects(this._stageRects()),
            onMinimized: win => this._minimizedChanged(win),
        });
        cleanup.add(() => {
            // Effects we asked the Shell to skip that never came must not skip someone else's
            for (const actor of this._skipped)
                Main.wm._skippedActors?.delete?.(actor);
            this._skipped.clear();
            this._leaving.clear();
        });

        // Parked windows get no overview preview (the overview builds them on each opening)
        const self = this;
        cleanup.inject(Workspace.Workspace.prototype, '_isOverviewWindow', function (orig, win) {
            return orig.call(this, win) && !self._isParked(win);
        });
        cleanup.inject(WorkspaceThumbnail.WorkspaceThumbnail.prototype, '_isOverviewWindow', function (orig, actor) {
            return orig.call(this, actor) && !self._isParked(actor?.get_meta_window?.());
        });

        cleanup.add(ks.watch(KEYS, () => {
            for (const model of this._models.values()) {
                model.setGroupByApp(ks.bool('stage-manager-group-by-app'));
                model.setRecentCount(ks.int('stage-manager-recent-count'));
            }
            this._stageKey = null;      // lay the stage out again for the new side / auto-hide
            this._sync();
        }));
        cleanup.connect(Main.overview, 'showing', () => {
            this._overview = true;
            // Parked windows stay hidden: the overview gives them no preview (_isParked)
            this._flights?.cancelAll();
            this._leaving.clear();
            this._sync();
        });
        cleanup.connect(Main.overview, 'hidden', () => {
            this._overview = false;
            this._reapplyOtherWorkspaces();
            this._sync();
        });
        cleanup.connect(global.display, 'workareas-changed', () => this._sync());

        // Last in, first out: stop intercepting and drop the stage mode, then everything else
        cleanup.add(() => {
            WindowState.setMinimizeInterceptor(null);
            WindowState.setStageActive(false);
            WindowState.clearFlag('staged');
            this._models.clear();
            this._flights = null;
            this._source = null;
            this._strip = null;
            this._hider = null;
            this._ks = null;
        });
        WindowState.setMinimizeInterceptor(win => this._unstage(win));
        WindowState.setStageActive(true);

        this._overview = Main.overview.visible;
        this._source.start();
        this._sync();
    }

    disable() {
        // The cleanup registry restores the windows, destroys the strip, drops signals and timers.
    }

    // ---- state -----------------------------------------------------------------------------

    _model(ws = global.workspace_manager.get_active_workspace()) {
        let model = this._models.get(ws);
        if (!model) {
            model = new StageModel({
                groupByApp: this._ks.bool('stage-manager-group-by-app'),
                recentCount: this._ks.int('stage-manager-recent-count'),
            });
            this._models.set(ws, model);
        }
        // Forget models of workspaces that no longer exist
        const live = new Set();
        for (let i = 0; i < global.workspace_manager.n_workspaces; i++)
            live.add(global.workspace_manager.get_workspace_by_index(i));
        for (const key of [...this._models.keys()]) {
            if (!live.has(key))
                this._models.delete(key);
        }
        return model;
    }

    _workArea() {
        const index = Main.layoutManager.primaryIndex;
        const r = Main.layoutManager.getWorkAreaForMonitor(index);
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }

    _side() {
        return this._ks.string('stage-manager-side') === 'right' ? 'right' : 'left';
    }

    _frame(win) {
        const r = win.get_frame_rect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }

    _stageRects() {
        if (!this._source)
            return [];
        const current = this._model().current;
        if (!current)
            return [];
        const byId = new Map(this._source.windows().map(w => [w.id, w]));
        return current.windows.map(id => byId.get(id)).filter(w => w && !w.minimized)
            .map(w => this._frame(w.win));
    }

    /** Cards the strip can really show: never hide a stage that would get no card. */
    _cap(model) {
        return fitCount(this._workArea().height, model.recentCount);
    }

    /** True when a window can stand on the stage now (not minimized, not just sent to the strip). */
    _canShow(entry) {
        return !!entry && !entry.minimized && !this._parked.has(entry.id);
    }

    // ---- sync ------------------------------------------------------------------------------

    _sync() {
        if (!this._source)
            return;
        const ks = this._ks;
        const model = this._model();
        const list = this._source.windows();
        const byId = new Map(list.map(w => [w.id, w]));
        const idOf = new Map(list.map(w => [w.win, w.id]));

        model.sync(list.map(({ id, appId }) => ({ id, appId })));

        // A focused dialog stands for the window that owns it (or, orphaned, for its app)
        const target = this._source.focusTarget(new Set(idOf.keys()));
        const focused = target.win ? idOf.get(target.win) ?? null : model.leadForApp(target.appId);
        for (const id of [...this._parked]) {
            if (focused !== id || !byId.has(id))
                this._parked.delete(id);
        }
        if (focused !== null && this._canShow(byId.get(focused)))
            model.focus(focused);
        this._ensureStage(model, byId);
        this._revealIneligible();

        const cap = this._cap(model);
        if (!this._overview)
            this._applyVisibility(model, byId, this._first, cap);

        const cards = model.strip().slice(0, cap).map(stage => {
            const rest = stage.windows.filter(id => id !== stage.lead);
            const ordered = [stage.lead, ...rest].map(id => byId.get(id));
            return { id: stage.id, app: ordered[0].app, windows: ordered.map(w => w.win) };
        });
        this._strip.update({
            side: this._side(),
            autohide: ks.bool('stage-manager-autohide'),
            overview: this._overview,
            workArea: this._workArea(),
            stageRects: this._stageRects(),
            cards,
        });
        this._first = false;
        this._launchLeaving();
    }

    // ---- motion ----------------------------------------------------------------------------

    /** Windows that just left the stage fly to their (new) card, or shrink into the strip. */
    _launchLeaving() {
        const leaving = [...this._leaving];
        this._leaving.clear();
        if (this._overview || !this._motion())
            return;
        for (const [win, from] of leaving) {
            try {
                if (!win.get_compositor_private())
                    continue;
                let to = this._strip.thumbRect(win);
                let fade = null;
                if (!to) {
                    const anchor = this._strip.anchor();
                    if (!anchor)
                        continue;
                    to = pointRect(anchor, from);
                    fade = 'out';
                }
                if (!fade)
                    this._strip.setFlying(win, true);
                if (!this._flights.fly(win, { from, to, fade }) && !fade)
                    this._strip.setFlying(win, false);
            } catch (e) {
                console.error(`[Kiwi] stage flight out: ${e.message}`);
            }
        }
    }

    /**
     * A window comes back to the stage: fly it from its card (the strip still shows the old
     * cards here) to its frame. The flight gives the actor `opacity` when it lands.
     * @returns {boolean} true when a flight took over
     */
    _flyFromCard(win, opacity) {
        if (this._overview)
            return false;
        const from = this._strip?.thumbRect(win);
        if (!from)
            return false;
        this._strip.setFlying(win, true);
        if (this._flights.fly(win, { from, to: this._frame(win), reveal: opacity }))
            return true;
        this._strip.setFlying(win, false);
        return false;
    }

    /** Is this window parked in the strip (hidden, or minimized with a card)? For the overview. */
    _isParked(win) {
        try {
            if (!win || !this._source || !this._hider)
                return false;
            if (this._hider.isHidden(win))
                return true;
            if (!win.minimized || !this._source.eligible(win))
                return false;
            const model = this._models.get(win.get_workspace());
            return !!model && model.inStrip(win.get_stable_sequence(), this._cap(model));
        } catch (e) {
            console.error(`[Kiwi] stage overview filter: ${e.message}`);
            return false;
        }
    }

    _skipEffect(actor) {
        Main.wm.skipNextEffect(actor);
        this._skipped.add(actor);
        // The effect comes within a frame or two; forget it after that either way
        this._cleanup.timeout(1000, () => {
            this._skipped.delete(actor);
            Main.wm._skippedActors?.delete?.(actor);
            return false;
        }, { name: 'stage-manager-skip' });
    }

    /**
     * A real minimize or unminimize of a window on this stage: our flight replaces the Shell's
     * effect. Called synchronously from notify::minimized, before mutter runs the effect.
     */
    _minimizedChanged(win) {
        if (!this._source || this._overview || Main.overview.visible)
            return;
        const actor = win.get_compositor_private();
        const active = global.workspace_manager.get_active_workspace();
        if (!actor || !win.located_on_workspace(active) || !this._source.eligible(win) ||
            this._hider.isHidden(win))
            return;
        const motion = this._motion();
        if (win.minimized) {
            if (!actor.mapped)
                return;
            const from = this._flights.land(win) ?? this._frame(win);
            this._skipEffect(actor);
            if (!motion) {
                this._flights.fly(win, { from, to: from, fade: 'out', duration: FADE_MS });
                return;
            }
            // Lay the strip out now so the window has a card to land on
            this._leaving.set(win, from);
            this._sync();
        } else {
            const frame = this._frame(win);
            const from = motion ? this._strip.thumbRect(win) : frame;
            if (!from)
                return;     // no card: the Shell's own effect plays
            this._flights.land(win);
            this._skipEffect(actor);
            if (motion)
                this._strip.setFlying(win, true);
            const ok = this._flights.fly(win, {
                from, to: frame, reveal: 255,
                fade: motion ? null : 'in',
                duration: motion ? undefined : FADE_MS,
            });
            if (!ok)
                this._strip.setFlying(win, false);
        }
    }

    /** A window that became always-on-top, sticky, moved to another monitor, ...: give it back. */
    _revealIneligible() {
        for (const win of this._hider.hiddenWindows()) {
            if (!this._source.eligible(win))
                this._hider.show(win, { animate: false });
        }
    }

    /**
     * After the overview (windows may have been dragged to another workspace there): apply each
     * other workspace's model again.
     */
    _reapplyOtherWorkspaces() {
        const active = global.workspace_manager.get_active_workspace();
        for (const [ws, model] of this._models) {
            if (ws === active)
                continue;
            const list = this._source.windows(ws);
            model.sync(list.map(({ id, appId }) => ({ id, appId })));
            const byId = new Map(list.map(w => [w.id, w]));
            const vis = model.visibility(this._cap(model));
            const pick = ids => ids.map(id => byId.get(id)).filter(Boolean).map(w => w.win);
            this._hider.apply({ show: pick(vis.show), hide: pick(vis.hide), animate: false });
        }
    }

    /** A stage with nothing visible in it is no stage: move to the most recent one that has a window to show. */
    _ensureStage(model, byId) {
        const current = model.current;
        if (current?.windows.some(id => this._canShow(byId.get(id))))
            return;
        const next = model.strip().find(st => st.windows.some(id => this._canShow(byId.get(id))));
        if (!next) {
            // Everything is minimized: nothing on the stage, the strip lists them all
            if (current && !current.windows.some(id => this._parked.has(id)))
                model.unfocus();
            return;
        }
        model.activateStage(next.id);
        const lead = byId.get(next.windows.find(id => this._canShow(byId.get(id))));
        if (lead && !this._overview)
            this._cleanup.idle(() => Main.activateWindow(lead.win), { name: 'stage-manager-focus' });
    }

    _applyVisibility(model, byId, instant, cap) {
        const vis = model.visibility(cap);
        const pick = ids => ids.map(id => byId.get(id)).filter(Boolean).map(w => w.win);
        const show = pick(vis.show);
        this._hider.apply({ show, hide: pick(vis.hide), animate: !instant });

        const current = model.current;
        const key = current ? current.id : null;
        if (key !== this._stageKey) {
            this._stageKey = key;
            this._layoutStage(current ? pick(current.windows) : []);
        }
    }

    /**
     * Keep the user's window size; only move a window that would sit under the strip.
     * Only listed windows get here, so windows on other monitors are never moved.
     */
    _layoutStage(wins) {
        const ks = this._ks;
        if (ks.bool('stage-manager-autohide'))
            return;
        const area = stageArea(this._workArea(), { side: this._side(), autohide: false });
        for (const win of wins) {
            if (win.minimized || win.is_fullscreen() || win.maximized_horizontally || win.maximized_vertically)
                continue;
            if (win.get_monitor() !== Main.layoutManager.primaryIndex)
                continue;
            const frame = this._frame(win);
            const fitted = fitToStage(frame, area);
            if (fitted.x !== frame.x || fitted.y !== frame.y ||
                fitted.width !== frame.width || fitted.height !== frame.height)
                this._hider.moveTo(win, fitted);
        }
    }

    // ---- actions ---------------------------------------------------------------------------

    _activate(stageId) {
        // Focus the stage's lead window; the focus change switches the stage (one code path)
        const stage = this._model().stages().find(st => st.id === stageId);
        const entry = stage && this._source.windows().find(w => w.id === stage.lead);
        if (entry)
            Main.activateWindow(entry.win);
    }

    /**
     * The panel minimize button on a staged window: send it to the strip instead of minimizing.
     * With no other stage to bring forward, it is a real minimize (returns false).
     * @returns {boolean} true when handled
     */
    _unstage(win) {
        const model = this._model();
        const entries = this._source.windows();
        const byId = new Map(entries.map(e => [e.id, e]));
        const me = entries.find(e => e.win === win);
        if (!me || model.current?.windows.includes(me.id) !== true)
            return false;

        const usable = id => id !== me.id && this._canShow(byId.get(id));
        const others = model.current.windows.filter(usable);
        const next = others.length > 0 ? null
            : model.strip().find(st => st.windows.some(usable));
        if (others.length === 0 && !next)
            return false;

        this._hider.markUserMinimized(win);
        this._parked.add(me.id);
        const before = model.current.id;
        model.split(me.id);

        // Who gets the stage now: the rest of the group, else the most recent other stage
        let target;
        if (others.length > 0) {
            model.activateStage(before);
            const lead = model.current.lead;
            target = byId.get(usable(lead) ? lead : others[0]);
        } else {
            model.activateStage(next.id);
            target = byId.get(next.windows.find(usable));
        }
        this._cleanup.idle(() => Main.activateWindow(target.win), { name: 'stage-manager-focus' });
        this._sync();
        return true;
    }
}
