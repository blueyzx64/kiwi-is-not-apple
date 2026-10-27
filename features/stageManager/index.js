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
// Window sets (UX round 2, macOS behaviour): drag a strip entry onto the stage, or Shift-click
// it, to add it to the set on the stage. The outer parts of the stage lay the two side by side
// (dropTarget.js; the frames are put back when the set breaks up). Drag a set window by its
// titlebar onto the strip, or press the remove shortcut, to take it out. A set goes to the strip
// as one entry and comes back with its layout. A new app window takes the stage and the old set
// goes to the strip (or joins the set: stage-manager-new-windows). Sets live in memory, per
// workspace, for the session.
//
// Show the desktop: toggleDesktop() sends the whole stage to the strip and back (the top bar
// button calls it), as does a click on the wallpaper (stage-manager-wallpaper-click).
//
// The toggle shortcut lives in shortcut.js (its own entry, so it still works while this is off).
// Control Center and Spotlight toggles belong to the Control Center and Spotlight and flip the same key.
// A top bar icon would vanish when the feature is off, so none is built here.

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';
import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Workspace from 'resource:///org/gnome/shell/ui/workspace.js';
import * as WorkspaceThumbnail from 'resource:///org/gnome/shell/ui/workspaceThumbnail.js';

import { WindowState } from '../../core/windowState.js';
import { watchReducedMotion } from '../../lib/compat.js';
import { Keybindings } from '../../lib/keybindings.js';
import { KiwiSettings } from '../../lib/settings.js';
import { StageDropTarget } from './dropTarget.js';
import { FADE_MS, Flights } from './flight.js';
import {
    StageModel, fitCount, fitToStage, isClick, overlaps, pointRect, scaleMs, settleTiles, stageArea, tileOrder,
    tilePlan, workspaceDirection,
} from './model.js';
import { StageStrip } from './strip.js';
import { WindowSource } from './shellAdapter.js';
import { WindowHider } from './windowHider.js';

const KEYS = [
    'stage-manager-side',
    'stage-manager-autohide',
    'stage-manager-group-by-app',
    'stage-manager-recent-count',
    'stage-manager-tilt',
    'stage-manager-animation-speed',
];

const WINDOW_DRAG_POLL_MS = 60;
// Side by side: how long the apps get to answer a resize before the second pass, and how many
const SETTLE_MS = 250;
const SETTLE_TRIES = 4;


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
        this._drop = null;
        this._desktops = new Map(); // Meta.Workspace -> {stageId, focus}: the desktop is shown there
        this._seen = new WeakSet(); // models synced once (their first windows are not "new")
        this._tileSig = new Map();  // StageModel -> layout last applied to its current set
        this._wsIndex = -1;
        this._windowDrag = null;    // {win, frame, token} while a set window is dragged
        this._press = null;         // a press on the wallpaper, waiting for its release
        this._settle = 0;           // timeout of the side-by-side second pass
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
            onActivate: (id, { add }) => (add ? this._addToStage(id, 'center') : this._activate(id)),
            motion: () => this._motion(),
            onDragBegin: () => this._drop?.show(this._dropArea()),
            onDragEnd: () => this._drop?.hide(),
        });
        this._drop = new StageDropTarget(cleanup, {
            onDrop: (id, zone) => this._addToStage(id, zone),
            motion: () => this._motion(),
            speed: () => this._speed(),
            hint: zone => (zone === 'center' ? _('Add to set') : _('Side by side')),
        });
        // Created after the strip and the hider's records go after it: on disable the hider
        // restores the windows first, then the clones go, then the strip.
        this._flights = new Flights(cleanup, {
            onLanded: win => this._strip?.setFlying(win, false),
            ms: d => scaleMs(d, this._speed()),
        });
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

        // A set window dragged by its titlebar onto the strip leaves the set
        cleanup.connect(global.display, 'grab-op-begin', (_d, win, op) => this._windowDragBegin(win, op));
        cleanup.connect(global.display, 'grab-op-end', (_d, win) => this._windowDragEnd(win));
        // A click on the wallpaper shows the desktop (and brings the stage back)
        cleanup.connect(global.stage, 'captured-event', (_s, event) => this._wallpaperEvent(event));
        Keybindings.add(cleanup, 'stage-manager-remove-shortcut', this._ctx.settings,
            () => this._removeFocused());

        // Last in, first out: stop intercepting and drop the stage mode, then everything else
        cleanup.add(() => {
            WindowState.setMinimizeInterceptor(null);
            WindowState.setStageActive(false);
            WindowState.clearFlag('staged');
            this._models.clear();
            this._desktops.clear();
            this._tileSig.clear();
            this._windowDrag = null;
            this._press = null;
            this._settle = 0;
            this._drop = null;
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

    _speed() {
        const v = this._ks?.double('stage-manager-animation-speed');
        return Number.isFinite(v) && v > 0 ? v : 1;
    }

    _tilt() {
        return this._ks?.int('stage-manager-tilt') ?? 22;
    }

    /** Where a dragged entry may land: the stage, never the strip's own column. */
    _dropArea() {
        return stageArea(this._workArea(), { side: this._side(), autohide: false });
    }

    /** Where a side-by-side set is laid out: the stage, the strip's column too when it auto-hides. */
    _tileArea() {
        return stageArea(this._workArea(), { side: this._side(), autohide: this._ks.bool('stage-manager-autohide') });
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
        // covers: Kiwi does not move it out of the strip's way (maximized, half-tiled, fullscreen)
        return current.windows.map(id => byId.get(id)).filter(w => w && !w.minimized)
            .map(({ win }) => ({
                ...this._frame(win),
                covers: !!(win.maximized_horizontally || win.maximized_vertically || win.is_fullscreen()),
            }));
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

        const ws = global.workspace_manager.get_active_workspace();
        const { added } = model.sync(list.map(({ id, appId }) => ({ id, appId })));
        const fresh = this._seen.has(model) ? added.filter(id => this._canShow(byId.get(id))) : [];
        this._seen.add(model);
        this._newWindows(model, fresh, ws);

        // A focused dialog stands for the window that owns it (or, orphaned, for its app)
        const target = this._source.focusTarget(new Set(idOf.keys()));
        const focused = target.win ? idOf.get(target.win) ?? null : model.leadForApp(target.appId);
        for (const id of [...this._parked]) {
            if (focused !== id || !byId.has(id))
                this._parked.delete(id);
        }
        // The desktop is shown: only a window the user brings forward ends it
        const desk = this._desktops.get(ws);
        if (desk && focused !== null && focused !== desk.focus && this._canShow(byId.get(focused)))
            this._desktops.delete(ws);
        const showingDesktop = this._desktops.has(ws);
        if (!showingDesktop && focused !== null && this._canShow(byId.get(focused)))
            model.focus(focused);
        if (!showingDesktop)
            this._ensureStage(model, byId);
        this._revealIneligible();
        this._syncTiles(model, byId);

        const cap = this._cap(model);
        if (!this._overview)
            this._applyVisibility(model, byId, this._first, cap);

        const cards = model.strip().slice(0, cap).map(stage => {
            const rest = stage.windows.filter(id => id !== stage.lead);
            const ordered = [stage.lead, ...rest].map(id => byId.get(id));
            const names = [...new Set(ordered.map(w => w.app?.get_name?.()).filter(Boolean))];
            return { id: stage.id, app: ordered[0].app, windows: ordered.map(w => w.win), set: !!stage.set, names };
        });
        const wsIndex = ws.index();
        const slide = this._wsIndex >= 0 ? workspaceDirection(this._wsIndex, wsIndex) : 0;
        this._wsIndex = wsIndex;
        this._strip.update({
            slide,
            tilt: this._tilt(),
            speed: this._speed(),
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
            if (this._hider.isTiled(win))
                continue;
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

    /**
     * Windows seen for the first time on this workspace. macOS: a new app takes the stage and
     * the previous set goes to the strip as one entry. With 'join', it joins the set instead.
     */
    _newWindows(model, fresh, ws) {
        if (fresh.length === 0)
            return;
        this._desktops.delete(ws);
        const join = this._ks.string('stage-manager-new-windows') === 'join';
        for (const id of fresh) {
            const current = model.current;
            const own = model.stageOf(id);
            // Only a window that came with a stage of its own (not one that joined its app's)
            const alone = own && own.windows.every(w => fresh.includes(w));
            if (join && current && alone && own.id !== current.id)
                model.join(own.id, current.id);
            else if (alone)
                model.focus(id);
        }
    }

    /**
     * Lay the current set out side by side when its layout changed, and give windows back their
     * old frames once they leave a side-by-side set.
     */
    _syncTiles(model, byId) {
        const current = model.current;
        const tiles = current ? model.tilesOf(current.id) : null;
        const usable = tiles?.filter(id => byId.get(id) && !byId.get(id).minimized) ?? [];
        const sig = usable.length >= 2 ? `${current.id}:${usable.join(',')}` : null;
        if (sig && sig !== this._tileSig.get(model)) {
            const plan = tilePlan(this._tileArea(), usable.length);
            usable.forEach((id, i) => {
                if (plan[i])
                    this._hider.tile(byId.get(id).win, plan[i]);
            });
            this._scheduleSettle(model, sig);
        }
        this._tileSig.set(model, sig);

        // Untile windows whose set is gone or no longer side by side (any workspace)
        for (const win of this._hider.tiledWindows()) {
            const m = this._models.get(win.get_workspace());
            const id = win.get_stable_sequence();
            const stage = m?.stageOf(id);
            const keep = stage && m.tilesOf(stage.id)?.includes(id);
            if (!keep)
                this._hider.untile(win);
        }
    }

    /**
     * Second pass of a side-by-side layout: an app that keeps a minimum size wider than its
     * column also keeps its old position (mutter applies a move only with the size it asked
     * for), so it could overlap its neighbours or hang off the screen. Once the apps have
     * answered, place the windows at the sizes they took (settleTiles), until they hold.
     */
    _scheduleSettle(model, sig) {
        this._cleanup.release(this._settle);
        let tries = 0;
        this._settle = this._cleanup.timeout(SETTLE_MS, () => {
            const again = ++tries < SETTLE_TRIES && this._settleTiles(model, sig);
            if (!again)
                this._settle = 0;
            return again;
        }, { name: 'stage-manager-settle' });
    }

    /** @returns {boolean} true when a window had to be moved (check again later) */
    _settleTiles(model, sig) {
        if (!this._source || this._tileSig.get(model) !== sig)
            return false;
        const current = model.current;
        const tiles = current ? model.tilesOf(current.id) : null;
        if (!tiles)
            return false;
        const byId = new Map(this._source.windows(this._workspaceOf(model)).map(w => [w.id, w]));
        const wins = tiles.map(id => byId.get(id)).filter(w => w && !w.minimized).map(w => w.win);
        if (wins.length < 2 || wins.some(w => !this._hider.isTiled(w)))
            return false;
        const frames = wins.map(w => this._frame(w));
        const spots = settleTiles(this._tileArea(), frames);
        let moved = false;
        wins.forEach((win, i) => {
            const spot = spots[i];
            const f = frames[i];
            if (!spot || (Math.abs(spot.x - f.x) <= 1 && Math.abs(spot.y - f.y) <= 1))
                return;
            moved = true;
            try {
                win.move_frame(true, spot.x, spot.y);
            } catch (e) {
                console.error(`[Kiwi] stage settle tile: ${e.message}`);
            }
        });
        return moved;
    }

    _workspaceOf(model) {
        for (const [ws, m] of this._models) {
            if (m === model)
                return ws;
        }
        return global.workspace_manager.get_active_workspace();
    }

    // ---- actions ---------------------------------------------------------------------------

    /** Bring a strip entry (a stage or a whole set) to the stage. */
    _activate(stageId) {
        const ws = global.workspace_manager.get_active_workspace();
        const stage = this._model().stages().find(st => st.id === stageId);
        const entries = new Map(this._source.windows().map(w => [w.id, w]));
        const entry = stage && entries.get(stage.lead);
        if (!entry)
            return;
        this._desktops.delete(ws);
        // A set comes back whole: its other windows first, so the lead ends on top
        for (const id of stage.windows) {
            const w = entries.get(id);
            if (!w || id === stage.lead)
                continue;
            if (w.win.minimized)
                w.win.unminimize();
            w.win.raise();
        }
        // Focusing the lead switches the stage (the focus path); sync for a lead that had the focus
        Main.activateWindow(entry.win);
        this._sync();
    }

    /**
     * Add a strip entry to the set on the stage (drag and drop, or Shift-click). zone 'left' or
     * 'right' lays them out side by side; 'center' keeps the frames.
     * @returns {boolean} true when it joined
     */
    _addToStage(stageId, zone) {
        if (!this._source)
            return false;
        const model = this._model();
        const current = model.current;
        if (!current || this._desktops.has(global.workspace_manager.get_active_workspace())) {
            this._activate(stageId);
            return true;
        }
        const src = model.stages().find(st => st.id === stageId);
        if (!src || src.id === current.id)
            return false;
        const entries = new Map(this._source.windows().map(w => [w.id, w]));
        // Windows on the stage left to right: the set's layout, else where they stand
        const staged = model.tilesOf(current.id) ??
            [...current.windows].filter(id => entries.has(id))
                .sort((a, b) => entries.get(a).win.get_frame_rect().x - entries.get(b).win.get_frame_rect().x);
        const set = model.join(src.id, current.id);
        if (!set)
            return false;
        const order = tileOrder(zone, src.windows, staged);
        if (order)
            model.setTiles(set.id, order);
        for (const id of src.windows) {
            const w = entries.get(id);
            if (w?.win.minimized)
                w.win.unminimize();
        }
        this._sync();
        const lead = entries.get(src.lead);
        if (lead)
            this._cleanup.idle(() => Main.activateWindow(lead.win), { name: 'stage-manager-focus' });
        return true;
    }

    /** The remove shortcut: the focused window leaves its set for the strip. */
    _removeFocused() {
        const win = global.display.focus_window;
        if (win)
            this._removeFromSet(win);
    }

    /**
     * Take a window out of the set on the stage and put it in the strip (the rest stays).
     * @returns {boolean} true when it was in a set
     */
    _removeFromSet(win) {
        if (!this._source)
            return false;
        const model = this._model();
        const id = win.get_stable_sequence();
        if (!model.current?.set || !model.current.windows.includes(id))
            return false;
        return this._unstage(win, { minimize: false });
    }

    // ---- show the desktop ------------------------------------------------------------------

    /** True while the stage of the active workspace is in the strip to show the desktop. */
    get isDesktopShown() {
        return this._desktops.has(global.workspace_manager.get_active_workspace());
    }

    /**
     * Show the desktop: every window on the stage flies into the strip as one entry. Called
     * again (or with the desktop shown), the stage comes back. Safe in any state; the top bar
     * show-desktop button calls it.
     * @returns {boolean} true when the desktop is shown afterwards
     */
    toggleDesktop() {
        if (!this._source)
            return false;
        const ws = global.workspace_manager.get_active_workspace();
        if (this._desktops.has(ws)) {
            this._restoreDesktop(ws);
            return false;
        }
        const model = this._model();
        const current = model.current;
        if (!current || this._overview)
            return false;
        const focus = global.display.focus_window;
        this._desktops.set(ws, { stageId: current.id, focus: focus ? focus.get_stable_sequence() : null });
        model.unfocus();
        try {
            global.display.unset_input_focus(global.get_current_time());
        } catch (_e) {
            // the stage stays empty either way: only a new focus ends the desktop
        }
        this._sync();
        return true;
    }

    _restoreDesktop(ws) {
        const desk = this._desktops.get(ws);
        this._desktops.delete(ws);
        const model = this._model(ws);
        const stage = model.stages().find(st => st.id === desk?.stageId) ?? model.strip()[0];
        if (stage)
            this._activate(stage.id);
        else
            this._sync();
    }

    _wallpaperEvent(event) {
        try {
            const type = event.type();
            if (type !== Clutter.EventType.BUTTON_PRESS && type !== Clutter.EventType.BUTTON_RELEASE)
                return Clutter.EVENT_PROPAGATE;
            if (event.get_button() !== Clutter.BUTTON_PRIMARY || Main.overview.visible || Main.modalCount > 0 ||
                !this._ks.bool('stage-manager-wallpaper-click') ||
                this._ks.string('click-wallpaper-reveals-desktop') === 'never') {
                this._press = null;
                return Clutter.EVENT_PROPAGATE;
            }
            const [x, y] = event.get_coords();
            const point = { x, y, time: event.get_time() };
            if (type === Clutter.EventType.BUTTON_PRESS) {
                this._press = global.stage.get_event_actor(event) instanceof Meta.BackgroundActor ? point : null;
                return Clutter.EVENT_PROPAGATE;
            }
            const press = this._press;
            this._press = null;
            if (!press || !isClick(press, point) ||
                !(global.stage.get_event_actor(event) instanceof Meta.BackgroundActor))
                return Clutter.EVENT_PROPAGATE;
            // Only a stage to hide, or a desktop to bring the stage back from
            if (this.isDesktopShown || this._model().current)
                this._cleanup.idle(() => this.toggleDesktop(), { name: 'stage-manager-wallpaper' });
        } catch (e) {
            console.error(`[Kiwi] stage wallpaper click: ${e.message}`);
        }
        return Clutter.EVENT_PROPAGATE;
    }

    // ---- a set window dragged to the strip -------------------------------------------------

    _windowDragBegin(win, op) {
        if (!this._source || !win || this._overview)
            return;
        const moving = op === Meta.GrabOp.MOVING || op === Meta.GrabOp.MOVING_UNCONSTRAINED ||
            op === Meta.GrabOp.KEYBOARD_MOVING;
        const model = this._model();
        const id = win.get_stable_sequence();
        if (!moving || !model.current?.set || !model.current.windows.includes(id))
            return;
        this._endWindowDrag();
        const drag = { win, frame: this._frame(win), token: 0, over: false };
        this._windowDrag = drag;
        this._strip.setDropHint('near');
        drag.token = this._cleanup.timeout(WINDOW_DRAG_POLL_MS, () => {
            const floor = this._strip?.floorRect();
            const [px, py] = global.get_pointer();
            drag.over = !!floor && overlaps({ x: px, y: py, width: 1, height: 1 }, floor);
            this._strip?.setDropHint(drag.over ? 'over' : 'near');
            return true;
        }, { name: 'stage-manager-window-drag' });
    }

    _windowDragEnd(win) {
        const drag = this._windowDrag;
        if (!drag || drag.win !== win)
            return;
        const floor = this._strip?.floorRect();
        const [px, py] = global.get_pointer();
        const over = !!floor && overlaps({ x: px, y: py, width: 1, height: 1 }, floor);
        this._endWindowDrag();
        if (!over)
            return;
        // It goes to the strip from where it was picked up, so it comes back there
        const f = drag.frame;
        try {
            win.move_frame(true, f.x, f.y);
        } catch (_e) {
            // closed meanwhile
        }
        this._removeFromSet(win);
    }

    _endWindowDrag() {
        const drag = this._windowDrag;
        if (!drag)
            return;
        this._windowDrag = null;
        this._cleanup.release(drag.token);
        this._strip?.setDropHint(null);
    }

    /**
     * The panel minimize button on a staged window: send it to the strip instead of minimizing.
     * With no other stage to bring forward, it is a real minimize (returns false).
     * @returns {boolean} true when handled
     */
    _unstage(win, { minimize = true } = {}) {
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

        if (minimize)
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
