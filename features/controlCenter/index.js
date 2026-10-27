// SPDX-License-Identifier: GPL-3.0-or-later
// Control Center: the stock Quick Settings grid, re-laid out like macOS Control Center.
//
// Nothing GNOME builds is replaced. The grid becomes 4 columns wide, the stock items are
// reordered into blocks (connectivity, focus, display, sound, media, toggles, footer) and
// given new column spans, and a style class lets stylesheet.css restyle them. Items from
// other extensions go under a "More" heading. Secondary on/off toggles (Dark Style, Night
// Light, Airplane Mode, ...) become 1x1 icon-only squares. Kiwi adds a "Kiwi" module with a
// tile per Kiwi feature (bound to its settings key), Now Playing, the user row, and Do Not
// Disturb on GNOME 48.
//
// Disable puts the order, spans and column count back from a snapshot of the actors, so a
// grid rebuilt in between never receives stale {parent, index} pairs.
// Glass: the menu bubble is Kiwi glass, attached by features/liquidGlass (surface 'menus');
// this feature only adds .kiwi-cc-glass for the glass platters of its modules (style.css).

import Gio from 'gi://Gio';
import St from 'gi://St';

import { Glass } from '../../lib/glass.js';
import { SHELL_HAS_SYSTEM_DND } from '../../lib/compat.js';
import {
    DISPLAY_HEADER_ID, MORE_HEADER_ID, SOUND_HEADER_ID, SPACER_PREFIX, planLayout,
} from './model.js';
import { NowPlaying } from './nowPlaying.js';
import {
    ITEM_CLASS, JOIN_NEXT_CLASS, JOIN_PREV_CLASS,
    applyPlan, centerToggleIcon, columnSpan, compactable, gridAlive, managedChildren,
    restoreCompact, restoreGrid, restoreLayoutClasses, restoreToggleIcons, setCompact,
    setLayoutClasses, snapshotGrid, stockKeys,
} from './shell.js';
import { keepHidden } from '../../lib/keepHidden.js';
import { whenQuickSettingsReady } from '../../lib/quickSettings.js';
import { createDndToggle, createKiwiModule } from './tiles.js';
import { PanelBattery, UserRow } from './userRow.js';

const MENU_CLASS = 'kiwi-control-center';
const GLASS_CLASS = 'kiwi-cc-glass';
const CALM_CLASS = 'kiwi-cc-calm';
const LIGHT_CLASS = 'kiwi-cc-light';

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
        this._compact = new Map();      // stock toggle made icon-only -> what to put back
        this._icons = new Map();        // stock toggle whose icon circle is centred -> its old align
        this._visibleTokens = new Map();
        this._idle = 0;
        this._userRow = null;
        this._battery = null;
        this._interface = null;     // org.gnome.desktop.interface, made on first use
        this._nowPlaying = null;
        this._header = null;
        this._captions = new Map();     // plan id -> caption label (Display, Sound, More)
        this._spacers = [];             // blank half cells of the top block
        this._classed = new Set();      // actors carrying layout classes
        this._notifUndo = null;         // the hidden notification list, while the notch is on
    }

    enable() {
        this._cleanup.add(() => this._teardown());

        whenQuickSettingsReady(this._cleanup, qs => this._build(qs), 'Control Center');
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

        // Do Not Disturb is ours: the registry stopped the calendar's dnd-button first
        // (conflictsWith in features.js), so the stock toggle is back in the grid.
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
            // High contrast keeps the stock solid tiles and colours
            this._toggleClass(box, CALM_CLASS, !env.highContrast);
            this._toggleClass(box, GLASS_CLASS, Glass.wants('menus', settings) && !env.highContrast);
            this._toggleClass(box, LIGHT_CLASS, !env.dark);
        });

        // A destroyed grid (Shell shutdown, rebuilt menu) is never touched again
        cleanup.connect(this._grid, 'destroy', () => this._forgetGrid());
        cleanup.connect(this._grid, 'child-added', (_g, actor) => {
            this._watchVisible(actor);
            this._queueRelayout();
        });
        cleanup.connect(this._grid, 'child-removed', (_g, actor) => {
            this._unwatchVisible(actor);
            this._classed.delete(actor);
            this._stockSpans.delete(actor);
            // A toggle that leaves the grid gets its label and icon back on the way out
            setCompact(actor, false, this._compact);
            restoreToggleIcons(this._icons, actor);
            this._queueRelayout();
        });
        for (const actor of managedChildren(this._grid))
            this._watchVisible(actor);

        // The notch owns notifications: the Control Center shows no list of its own then
        cleanup.connect(settings, 'changed::notch', () => this._queueRelayout());
        cleanup.connect(settings, 'changed::control-center-user-row', () => this._syncUserRow());
        cleanup.connect(settings, 'changed::battery-percentage-always', () => this._syncBattery());
        // The footer extras are optional: a failure there must not stop the layout
        for (const sync of [() => this._syncUserRow(), () => this._syncBattery()]) {
            try {
                sync();
            } catch (e) {
                console.error('[Kiwi] Control Center footer extra failed:', e);
            }
        }

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

        for (const [id, text] of [
            [DISPLAY_HEADER_ID, gettext('Display')],
            [SOUND_HEADER_ID, gettext('Sound')],
            [MORE_HEADER_ID, gettext('More')],
        ]) {
            const label = new St.Label({
                text,
                style_class: id === MORE_HEADER_ID ? 'kiwi-cc-section-title' : 'kiwi-cc-caption',
                visible: false,
            });
            this._captions.set(id, label);
            grid.add_child(label);
        }
        this._header = this._captions.get(MORE_HEADER_ID);

        // GNOME 49 added the stock toggle; on 48 the Control Center brings its own
        if (!SHELL_HAS_SYSTEM_DND || !qs._doNotDisturb)
            add(createDndToggle(gettext), 'dnd');

        add(createKiwiModule({
            settings, gettext, extensionDir: this._ctx.extension?.dir,
        }), 'kiwi-toggles');

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
        this._interface = null;     // org.gnome.desktop.interface, made on first use
        if (!this._flag('battery-percentage-always', false))
            return;
        this._battery = new PanelBattery({ qs: this._qs, cleanup: this._cleanup });
        // GNOME's own "show battery percentage" decides whether ours is needed
        this._interface ??= new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        this._battery.enable(this._interface);
    }

    // ---- layout ------------------------------------------------------------

    _watchVisible(actor) {
        if (this._visibleTokens.has(actor) || this._isLayoutActor(actor))
            return;
        this._visibleTokens.set(actor,
            this._cleanup.connect(actor, 'notify::visible', () => this._queueRelayout()));
    }

    /** Captions and spacers: shown and hidden by the plan itself. */
    _isLayoutActor(actor) {
        return [...this._captions.values()].includes(actor) || this._spacers.includes(actor);
    }

    _spacer(n) {
        while (this._spacers.length <= n) {
            const spacer = new St.Widget({ style_class: 'kiwi-cc-spacer', visible: false });
            this._spacers.push(spacer);
            this._grid.add_child(spacer);
        }
        return this._spacers[n];
    }

    /** The calendar's notification list stays hidden while the notch owns notifications. */
    _syncNotifications(actor) {
        const hide = !!actor && this._flag('notch', false);
        if (hide && !this._notifUndo) {
            this._notifUndo = keepHidden(actor, { resync: a => a._syncEmpty?.() });
        } else if (!hide && this._notifUndo) {
            this._notifUndo();
            this._notifUndo = null;
        }
    }

    _unwatchVisible(actor) {
        const token = this._visibleTokens.get(actor);
        if (token === undefined)
            return;
        this._cleanup.release(token);
        this._visibleTokens.delete(actor);
    }

    _forgetGrid() {
        if (this._idle) {
            this._cleanup.release(this._idle);
            this._idle = 0;
        }
        this._grid = null;
        this._snapshot = null;
        this._classed.clear();
    }

    _queueRelayout() {
        if (this._idle || !gridAlive(this._grid))
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
        // The Focus tile of features/focus takes Do Not Disturb's place
        if (actor.style_class?.includes('kiwi-focus-toggle'))
            return 'dnd';
        // The notification list of features/calendar/notificationList.js
        return actor.style_class?.includes('kiwi-notifications') ? 'notifications' : null;
    }

    _relayout() {
        const grid = this._grid;
        if (!gridAlive(grid))
            return;

        const children = managedChildren(grid).filter(actor => !this._isLayoutActor(actor));
        this._syncNotifications(children.find(actor => this._keyOf(actor) === 'notifications'));
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
                compactable: !this._own.has(actor) && compactable(actor),
            };
        });
        for (const [id, label] of this._captions)
            byId.set(id, label);

        const plan = planLayout(entries);
        const usedSpacers = new Set();
        const placed = [];
        for (const p of plan) {
            let actor = byId.get(p.id);
            if (p.id.startsWith(SPACER_PREFIX)) {
                actor = this._spacer(Number(p.id.slice(SPACER_PREFIX.length)));
                usedSpacers.add(actor);
            }
            if (!actor)
                continue;
            if (this._isLayoutActor(actor))
                actor.visible = p.visible;
            if (p.compact || this._compact.has(actor))
                setCompact(actor, p.compact, this._compact);
            centerToggleIcon(actor, this._icons);
            setLayoutClasses(actor, [
                ITEM_CLASS,
                ...p.joinPrev ? [JOIN_PREV_CLASS] : [],
                ...p.joinNext ? [JOIN_NEXT_CLASS] : [],
            ], this._classed);
            placed.push({ actor, span: p.span });
        }
        for (const spacer of this._spacers) {
            if (!usedSpacers.has(spacer)) {
                spacer.visible = false;
                placed.push({ actor: spacer, span: 2 });
            }
        }
        applyPlan(grid, placed);
    }

    // ---- teardown ------------------------------------------------------------

    _teardown() {
        if (!this._qs)
            return;
        try {
            this._notifUndo?.();
            this._notifUndo = null;
            restoreLayoutClasses(this._classed);
            this._userRow?.destroy();
            this._battery?.destroy();
            // Destroys its own actor too
            this._nowPlaying?.destroy();
            for (const actor of this._own.keys()) {
                if (actor !== this._nowPlaying?.actor)
                    actor.destroy();
            }
            this._userRow = this._battery = this._nowPlaying = null;
            this._interface = null;
            this._own.clear();
            for (const actor of [...this._captions.values(), ...this._spacers])
                actor.destroy();
            this._captions.clear();
            this._spacers = [];
            this._header = null;

            const box = this._qs.menu?.box;
            box?.remove_style_class_name(MENU_CLASS);
            box?.remove_style_class_name(GLASS_CLASS);
            box?.remove_style_class_name(CALM_CLASS);
            box?.remove_style_class_name(LIGHT_CLASS);

            restoreCompact(this._compact);
            restoreToggleIcons(this._icons);
            restoreGrid(this._grid, this._snapshot, this._stockSpans);
        } finally {
            this._qs = this._grid = this._snapshot = this._stockKeys = null;
            this._stockSpans.clear();
            this._compact.clear();
            this._icons.clear();
            this._visibleTokens.clear();
        }
    }
}
