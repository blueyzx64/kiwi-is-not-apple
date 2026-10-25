// SPDX-License-Identifier: GPL-3.0-or-later
// Control Center: the stock Quick Settings grid, re-laid out like macOS Control Center.
//
// Nothing GNOME builds is replaced. The grid becomes 4 columns wide, the stock items are
// reordered into blocks (connectivity, focus, display, sound, media, toggles, footer) and
// given new column spans, and a style class lets stylesheet.css restyle them. Items from
// other extensions go under a "More" heading. Kiwi adds Stage Manager and Liquid Glass tiles
// (bound to their settings keys), Now Playing, the user row, and Do Not Disturb on GNOME 48.
//
// Disable puts the order, spans and column count back from a snapshot of the actors, so a
// grid rebuilt in between never receives stale {parent, index} pairs.
// Glass: the menu bubble's blur layer belongs to apps/liquidGlass (surface 'menus'); this
// feature only reacts to Glass.watch with style classes, so there is no second layer.

import GLib from 'gi://GLib';
import St from 'gi://St';

import { Glass } from '../../lib/glass.js';
import { runMigrations } from '../../lib/settings.js';
import {
    restoreBuiltinDndToggle,
    setControlCenterOwnsDnd,
    suppressBuiltinDndToggle,
} from '../quickSettingsDnDRemoval.js';
import { MORE_HEADER_ID, planLayout } from './model.js';
import { NowPlaying } from './nowPlaying.js';
import {
    applyPlan, columnSpan, hideLegacyDndButton, managedChildren, readyQuickSettings, restoreGrid,
    snapshotGrid, stockKeys,
} from './shell.js';
import { createDndToggle, createSettingTile } from './tiles.js';
import { PanelBattery, UserRow } from './userRow.js';

const MENU_CLASS = 'kiwi-control-center';
const GLASS_CLASS = 'kiwi-cc-glass';

// The stock panel builds its items a moment after the shell starts (async imports); GNOME
// emits no signal for it, so wait for it with a bounded poll.
const WAIT_MS = 200;
const WAIT_ATTEMPTS = 50;

export const MIGRATIONS = [
    { from: 'add-username-to-quick-menu', to: 'control-center-user-row' },
];

export class ControlCenter {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._qs = null;
        this._grid = null;
        this._snapshot = null;
        this._stockKeys = null;
        this._stockSpans = new Map();   // actor -> span it had in the 2-column grid
        this._own = new Map();          // actor -> model key, for the actors Kiwi added
        this._visibleTokens = new Map();
        this._idle = 0;
        this._userRow = null;
        this._battery = null;
        this._nowPlaying = null;
        this._header = null;
    }

    enable() {
        this._cleanup.add(() => this._teardown());
        runMigrations(this._ctx.settings, MIGRATIONS);

        const qs = readyQuickSettings();
        if (qs) {
            this._build(qs);
            return;
        }
        let attempts = 0;
        this._cleanup.timeout(WAIT_MS, () => {
            const ready = readyQuickSettings();
            if (ready) {
                this._build(ready);
                return GLib.SOURCE_REMOVE;
            }
            if (++attempts >= WAIT_ATTEMPTS) {
                console.error('[Kiwi] Control Center: Quick Settings never finished building');
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        }, { name: 'control-center wait' });
    }

    disable() {
        // The cleanup registry runs _teardown() after this returns
    }

    _flag(key, fallback) {
        const { settings } = this._ctx;
        return settings.settings_schema?.has_key(key) ? settings.get_boolean(key) : fallback;
    }

    // ---- build -------------------------------------------------------------

    _build(qs) {
        const { settings } = this._ctx;
        const cleanup = this._cleanup;
        this._qs = qs;
        this._grid = qs.menu._grid;

        // The legacy notifications module may have taken the stock DND toggle out of the grid;
        // it goes back first so the snapshot and the plan see it. Do Not Disturb is ours now.
        restoreBuiltinDndToggle();
        setControlCenterOwnsDnd(true);
        cleanup.add(hideLegacyDndButton(qs));

        this._snapshot = snapshotGrid(this._grid);
        this._stockKeys = stockKeys(qs);
        for (const [actor, span] of this._snapshot.spans)
            this._stockSpans.set(actor, span);

        this._addOwnActors(qs);

        qs.menu.box.add_style_class_name(MENU_CLASS);
        Glass.watch(cleanup, ({ env }) => {
            const box = this._qs?.menu.box;
            if (!box)
                return;
            // High contrast keeps the stock solid tiles
            this._toggleClass(box, GLASS_CLASS, Glass.wants('menus', settings) && !env.highContrast);
        });

        cleanup.connect(this._grid, 'child-added', (_g, actor) => {
            this._watchVisible(actor);
            this._queueRelayout();
        });
        cleanup.connect(this._grid, 'child-removed', (_g, actor) => {
            this._unwatchVisible(actor);
            this._stockSpans.delete(actor);
            this._queueRelayout();
        });
        for (const actor of managedChildren(this._grid))
            this._watchVisible(actor);

        cleanup.connect(settings, 'changed::control-center-user-row', () => this._syncUserRow());
        cleanup.connect(settings, 'changed::battery-percentage-always', () => this._syncBattery());
        this._syncUserRow();
        this._syncBattery();

        this._nowPlaying.start().catch(e => console.error('[Kiwi] Control Center: Now Playing failed:', e));
        this._relayout();
    }

    _addOwnActors(qs) {
        const { settings, gettext } = this._ctx;
        const grid = this._grid;
        const add = (actor, key) => {
            if (!actor)
                return;
            this._own.set(actor, key);
            grid.add_child(actor);
        };

        this._header = new St.Label({
            text: gettext('More'),
            style_class: 'kiwi-cc-section-title',
            visible: false,
        });
        grid.add_child(this._header);

        // GNOME 49 added the stock toggle; on 48 the Control Center brings its own
        if (!qs._doNotDisturb)
            add(createDndToggle(gettext), 'dnd');

        add(createSettingTile({
            settings, key: 'stage-manager', iconName: 'view-paged-symbolic',
            name: gettext('Stage Manager'),
        }), 'stage-manager');
        add(createSettingTile({
            settings, key: 'liquid-glass', iconName: 'weather-fog-symbolic',
            name: gettext('Liquid Glass'),
        }), 'liquid-glass');

        this._nowPlaying = new NowPlaying({ gettext, cleanup: this._cleanup });
        add(this._nowPlaying.actor, 'now-playing');
    }

    _toggleClass(actor, name, on) {
        if (on)
            actor.add_style_class_name(name);
        else
            actor.remove_style_class_name(name);
    }

    // ---- footer ------------------------------------------------------------

    _syncUserRow() {
        this._userRow?.destroy();
        this._userRow = new UserRow({
            qs: this._qs, gettext: this._ctx.gettext, cleanup: this._cleanup,
        });
        this._userRow.enable(this._flag('control-center-user-row', true));
        this._queueRelayout();
    }

    _syncBattery() {
        this._battery?.destroy();
        this._battery = null;
        if (!this._flag('battery-percentage-always', false))
            return;
        this._battery = new PanelBattery({ qs: this._qs, cleanup: this._cleanup });
        this._battery.enable(this._ctx.interfaceSettings);
    }

    // ---- layout ------------------------------------------------------------

    _watchVisible(actor) {
        if (this._visibleTokens.has(actor) || actor === this._header)
            return;
        this._visibleTokens.set(actor,
            this._cleanup.connect(actor, 'notify::visible', () => this._queueRelayout()));
    }

    _unwatchVisible(actor) {
        const token = this._visibleTokens.get(actor);
        if (token === undefined)
            return;
        this._cleanup.release(token);
        this._visibleTokens.delete(actor);
    }

    _queueRelayout() {
        if (this._idle || !this._grid)
            return;
        this._idle = this._cleanup.idle(() => {
            this._idle = 0;
            this._relayout();
        }, { name: 'control-center layout' });
    }

    _keyOf(actor) {
        const key = this._own.get(actor) ?? this._stockKeys.get(actor);
        if (key)
            return key;
        // The legacy notification list of apps/quickSettingsNotifications.js
        return actor.style_class?.includes('kiwi-notifications') ? 'notifications' : null;
    }

    _relayout() {
        const grid = this._grid;
        if (!grid)
            return;

        const children = managedChildren(grid).filter(actor => actor !== this._header);
        const byId = new Map();
        const entries = children.map((actor, i) => {
            if (!this._stockSpans.has(actor))
                this._stockSpans.set(actor, columnSpan(grid, actor));
            byId.set(`item-${i}`, actor);
            return {
                id: `item-${i}`,
                key: this._keyOf(actor),
                stockSpan: this._stockSpans.get(actor),
                visible: actor.visible,
            };
        });
        byId.set(MORE_HEADER_ID, this._header);

        const plan = planLayout(entries);
        this._header.visible = plan.find(p => p.id === MORE_HEADER_ID).visible;
        applyPlan(grid, plan.map(p => ({ actor: byId.get(p.id), span: p.span })));
    }

    // ---- teardown ------------------------------------------------------------

    _teardown() {
        if (!this._qs)
            return;
        const { settings } = this._ctx;

        this._userRow?.destroy();
        this._battery?.destroy();
        // Destroys its own actor too
        this._nowPlaying?.destroy();
        for (const actor of this._own.keys()) {
            if (actor !== this._nowPlaying?.actor)
                actor.destroy();
        }
        this._userRow = this._battery = this._nowPlaying = null;
        this._own.clear();
        this._header?.destroy();
        this._header = null;

        const box = this._qs.menu.box;
        box.remove_style_class_name(MENU_CLASS);
        box.remove_style_class_name(GLASS_CLASS);

        restoreGrid(this._grid, this._snapshot);

        // Hand Do Not Disturb back: if the legacy module is configured to replace the stock
        // toggle, it does so again
        setControlCenterOwnsDnd(false);
        if (this._flag('custom-dnd-button', false) && settings.get_boolean('move-calendar-right') &&
            !settings.get_boolean('keep-notification-panel'))
            suppressBuiltinDndToggle();

        this._qs = this._grid = this._snapshot = this._stockKeys = null;
        this._stockSpans.clear();
        this._visibleTokens.clear();
    }
}
