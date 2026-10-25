// SPDX-License-Identifier: GPL-3.0-or-later
// Stage Manager feature entry (features.js: `cls: StageManager`).
//
// One stage per workspace model. The focused app's windows are the stage; every other stage is
// hidden (windowHider.js: opacity 0, never minimize) and listed as a card in the strip. Focus
// changes switch the stage, a strip click does too, and the panel minimize button sends the
// window to the strip (WindowState.interceptMinimize). Disabling restores every window.
//
// Pieces: model.js (pure state + maths), shellAdapter.js (windows), windowHider.js (hide and
// restore), strip.js (view). Registered in the entry's CleanupRegistry; disable() is empty.
//
// TODO(keybindings): toggle shortcut `stage-manager-shortcut` waits for lib/keybindings.js
// (S4, feat/clipboard). Control Center and Spotlight toggles belong to S7/S5: they flip the
// `stage-manager` key. A top bar toggle would vanish with the feature, so it rides on the
// Control Center tile instead of its own indicator.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { WindowState } from '../../coordinators/windowState.js';
import { Glass } from '../../lib/glass.js';
import { KiwiSettings } from '../../lib/settings.js';
import { StageModel, fitToStage, stageArea } from './model.js';
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
    }

    enable() {
        const cleanup = this._cleanup;
        const ks = new KiwiSettings(this._ctx.settings);
        ks.attach(cleanup);
        this._ks = ks;

        this._strip = new StageStrip(cleanup, { onActivate: id => this._activate(id) });
        this._hider = new WindowHider(cleanup, {
            motion: () => Glass.motion,
            towards: () => this._strip?.anchor() ?? null,
        });
        this._source = new WindowSource(cleanup, {
            onChange: () => this._sync(),
            onGeometry: () => this._strip?.setStageRects(this._stageRects()),
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
            this._hider.revealAll();
            this._sync();
        });
        cleanup.connect(Main.overview, 'hidden', () => {
            this._overview = false;
            this._sync();
        });
        cleanup.connect(global.display, 'workareas-changed', () => this._sync());

        // Last in, first out: stop intercepting and drop the stage mode, then everything else
        cleanup.add(() => {
            WindowState.setMinimizeInterceptor(null);
            WindowState.setStageActive(false);
            this._models.clear();
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

    _model() {
        const ws = global.workspace_manager.get_active_workspace();
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

    // ---- sync ------------------------------------------------------------------------------

    _sync() {
        if (!this._source)
            return;
        const ks = this._ks;
        const model = this._model();
        const list = this._source.windows();
        const byId = new Map(list.map(w => [w.id, w]));

        model.sync(list.map(({ id, appId }) => ({ id, appId })));
        const focused = this._source.focusedId();
        for (const id of [...this._parked]) {
            if (focused !== id || !byId.has(id))
                this._parked.delete(id);
        }
        if (focused !== null && byId.has(focused) && !byId.get(focused).minimized && !this._parked.has(focused))
            model.focus(focused);
        this._ensureStage(model, byId);

        if (!this._overview)
            this._applyVisibility(model, byId, this._first);

        const cards = model.strip().map(stage => {
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
    }

    /** A stage with nothing visible in it is no stage: move to the most recent one that has a window to show. */
    _ensureStage(model, byId) {
        const current = model.current;
        const visible = current?.windows.some(id => !byId.get(id)?.minimized);
        if (visible)
            return;
        const next = model.strip().find(st => st.windows.some(id => !byId.get(id)?.minimized));
        if (!next)
            return;
        model.activateStage(next.id);
        const lead = byId.get(next.windows.find(id => !byId.get(id).minimized));
        if (lead && !this._overview)
            this._cleanup.idle(() => Main.activateWindow(lead.win), { name: 'stage-manager-focus' });
    }

    _applyVisibility(model, byId, instant) {
        const vis = model.visibility();
        const pick = ids => ids.map(id => byId.get(id)).filter(Boolean).map(w => w.win);
        const show = pick(vis.show);
        this._hider.apply({ show, hide: pick(vis.hide), animate: !instant });

        const current = model.current;
        const key = current ? current.id : null;
        if (key !== this._stageKey) {
            this._stageKey = key;
            this._layoutStage(show);
        }
    }

    /** Keep the user's window size; only move a window that would sit under the strip. */
    _layoutStage(wins) {
        const ks = this._ks;
        if (ks.bool('stage-manager-autohide'))
            return;
        const area = stageArea(this._workArea(), { side: this._side(), autohide: false });
        for (const win of wins) {
            if (win.minimized || win.is_fullscreen() || win.maximized_horizontally || win.maximized_vertically)
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
     * @returns {boolean} true when handled
     */
    _unstage(win) {
        const model = this._model();
        const entries = this._source.windows();
        const byId = new Map(entries.map(e => [e.id, e]));
        const me = entries.find(e => e.win === win);
        if (!me || model.current?.windows.includes(me.id) !== true)
            return false;

        this._hider.markUserMinimized(win);
        this._parked.add(me.id);
        const others = model.current.windows.filter(id => id !== me.id && !byId.get(id).minimized);
        const before = model.current.id;
        model.split(me.id);

        // Who gets the stage now: the rest of the group, else the most recent other stage
        let target = null;
        if (others.length > 0) {
            model.activateStage(before);
            target = byId.get(model.current.lead === me.id ? others[0] : model.current.lead);
        } else {
            const next = model.strip().find(st => st.windows.some(id => !byId.get(id).minimized));
            if (next) {
                model.activateStage(next.id);
                target = byId.get(next.windows.find(id => !byId.get(id).minimized));
            } else {
                model.unfocus();
            }
        }
        if (target)
            this._cleanup.idle(() => Main.activateWindow(target.win), { name: 'stage-manager-focus' });
        this._sync();
        return true;
    }
}
