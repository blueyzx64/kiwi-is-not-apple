// SPDX-License-Identifier: GPL-3.0-or-later
// Stage Manager feature entry (features.js: `cls: StageManager`).
//
// ROUND C SCOPE (strip only, non-destructive): the strip shows live thumbnails of the other
// stages and a click activates that stage's lead window. Nothing is hidden, moved or
// minimized, and WindowState is not touched, so disabling leaves no state behind.
// Round D adds: hiding non-stage windows (actor opacity + skip flags, tagged in WindowState),
// restore on disable, the stage layout (fitToStage / centerOnStage), minimize -> strip,
// WindowState.setStageActive(true), the toggle shortcut and the pause of minimize-to-dock.
//
// Everything is registered in the entry's CleanupRegistry; disable() has nothing left to do.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { KiwiSettings } from '../../lib/settings.js';
import { StageModel } from './model.js';
import { StageStrip } from './strip.js';
import { WindowSource } from './shellAdapter.js';

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
        this._model = null;
        this._strip = null;
        this._source = null;
        this._overview = false;
    }

    enable() {
        const cleanup = this._cleanup;
        const ks = new KiwiSettings(this._ctx.settings);
        ks.attach(cleanup);
        this._ks = ks;

        this._model = new StageModel({
            groupByApp: ks.bool('stage-manager-group-by-app'),
            recentCount: ks.int('stage-manager-recent-count'),
        });
        this._strip = new StageStrip(cleanup, { onActivate: id => this._activate(id) });
        this._source = new WindowSource(cleanup, {
            onChange: () => this._sync(),
            onGeometry: () => this._strip?.setStageRects(this._stageRects()),
        });

        cleanup.add(ks.watch(KEYS, () => {
            this._model.setGroupByApp(ks.bool('stage-manager-group-by-app'));
            this._model.setRecentCount(ks.int('stage-manager-recent-count'));
            this._sync();
        }));
        cleanup.connect(Main.overview, 'showing', () => this._setOverview(true));
        cleanup.connect(Main.overview, 'hiding', () => this._setOverview(false));
        cleanup.connect(global.display, 'workareas-changed', () => this._sync());
        cleanup.add(() => {
            this._source = null;
            this._strip = null;
            this._model = null;
            this._ks = null;
        });

        this._overview = Main.overview.visible;
        this._source.start();
        this._sync();
    }

    disable() {
        // The cleanup registry destroys the strip and drops every signal and timer.
    }

    // ---- sync ------------------------------------------------------------------------------

    _setOverview(on) {
        this._overview = on;
        this._sync();
    }

    _workArea() {
        const index = Main.layoutManager.primaryIndex;
        const r = Main.layoutManager.getWorkAreaForMonitor(index);
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }

    _frame(win) {
        const r = win.get_frame_rect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    }

    _stageRects() {
        const current = this._model?.current;
        if (!current || !this._source)
            return [];
        const byId = new Map(this._source.windows().map(w => [w.id, w]));
        return current.windows.map(id => byId.get(id)).filter(Boolean).map(w => this._frame(w.win));
    }

    _sync() {
        if (!this._model)
            return;
        const ks = this._ks;
        const list = this._source.windows();
        const byId = new Map(list.map(w => [w.id, w]));

        this._model.sync(list.map(({ id, appId }) => ({ id, appId })));
        const focused = this._source.focusedId();
        if (focused !== null && byId.has(focused))
            this._model.focus(focused);

        const cards = this._model.strip().map(stage => {
            const rest = stage.windows.filter(id => id !== stage.lead);
            const ordered = [stage.lead, ...rest].map(id => byId.get(id));
            return { id: stage.id, app: ordered[0].app, windows: ordered.map(w => w.win) };
        });

        const side = ks.string('stage-manager-side') === 'right' ? 'right' : 'left';
        this._strip.update({
            side,
            autohide: ks.bool('stage-manager-autohide'),
            overview: this._overview,
            workArea: this._workArea(),
            stageRects: this._stageRects(),
            cards,
        });
    }

    _activate(stageId) {
        const stage = this._model?.stages().find(s => s.id === stageId);
        const entry = stage && this._source.windows().find(w => w.id === stage.lead);
        if (entry)
            Main.activateWindow(entry.win);
    }
}
