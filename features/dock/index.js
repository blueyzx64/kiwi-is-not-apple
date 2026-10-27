// SPDX-License-Identifier: GPL-3.0-or-later
// Kiwi's own dock (overhaul plan §5.2): pinned apps (GNOME favourites are the source of truth),
// running apps, the recent section, minimized windows, the Downloads stack and the Trash, on
// the bottom, left or right edge.
//
// Where things come from:
//   - windows, apps and focus: core/desktop (ctx.desktop) and its events; no tracker of its own
//   - the edge and the work area: a core/layout claim whose chrome actor makes the strut, so
//     windows keep off the dock (none while it auto-hides); the Shell hides it over full screen
//   - motion: ctx.motion (hover label, slide, bounce, poof), which honours reduced motion
//   - Dash to Dock: kept off while the dock runs, through core/originals (dashToDock.js)
// Decisions are in model.js; the actors in view.js, items.js, stack.js, trash.js.
//
// API for other features (ctx.features.instance('dock')):
//   iconRect(appId)        where the app's icon is on screen (Genie, P2), or null
//   minimizeTarget(win)    where a window minimizes to: its app icon, or the minimized-window
//                          slot ("Minimize windows into application icon" off)
//
// Shell API: ui/appFavorites.js (getAppFavorites; the private _addFavorite / _removeFavorite
// skip the "pinned to the dash" notification, macOS has none), ui/layout.js PressureBarrier,
// Meta.Barrier, Main.activateWindow, Main.overview showing/hidden, Meta.Window
// set_icon_geometry (the Shell's minimize animation aims at it); checked on GNOME 50.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Mtk from 'gi://Mtk';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { CleanupRegistry } from '../../lib/disposables.js';
import { KiwiSettings } from '../../lib/settings.js';
import { WindowState } from '../../core/windowState.js';
import {
    Reveal, STACK_VIEWS, clickAction, dockItems, dockMetrics, isHorizontal, menuEntries,
    pinPosition, pushRecent, readConfig, stableOrder,
} from './model.js';
import { DockView } from './view.js';
import { AppItem, SeparatorItem, WindowItem } from './items.js';
import { DownloadsItem, installerFor } from './stack.js';
import { TrashItem } from './trash.js';
import { DockMenu, altHeld, fillAppMenu, isAltKey } from './appMenu.js';
import { readAutostart, setAutostart } from './autostart.js';
import { keepOtherDocksOff } from './dashToDock.js';

const LAYOUT_KEYS = ['dock-position', 'dock-icon-size'];
const CONTENT_KEYS = ['dock-show-recents', 'dock-running-dots', 'dock-minimize-to-app', 'dock-downloads'];
const HIDE_KEYS = ['dock-autohide', 'dock-autohide-delay'];
// Pushing against the edge reveals an auto-hidden dock: the same pressure as the Shell's hot
// corner (ui/layout.js HOT_CORNER_PRESSURE_THRESHOLD / _TIMEOUT)
const PRESSURE_THRESHOLD = 100;   // px of pointer travel into the barrier
const PRESSURE_TIMEOUT = 1000;    // ms in which it must happen
// Window fields whose change can add, remove or move a dock item
const ITEM_FIELDS = ['appId', 'minimized', 'skipTaskbar', 'type'];

export class Dock {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
    }

    enable() {
        const ctx = this._ctx;
        const cleanup = this._cleanup;
        this.motion = ctx.motion;
        this.gettext = ctx.gettext;
        this.ngettext = (s, p, n) => ctx.extension.ngettext(s, p, n);
        this._ks = new KiwiSettings(ctx.settings);
        this._ks.attach(cleanup);
        this.config = readConfig(this._ks);
        this.metrics = dockMetrics(this.config.iconSize);
        this._desktop = ctx.desktop.acquire(cleanup);
        this._layout = ctx.layout.acquire(cleanup);
        this._appSystem = Shell.AppSystem.get_default();
        this._tracker = Shell.WindowTracker.get_default();
        this._favorites = AppFavorites.getAppFavorites();
        this._running = [];
        this._minimized = [];
        this._recents = this._ks.strv('dock-recent-apps');
        this._reveal = new Reveal(this.config.autohide);
        this._revealTimer = 0;
        this._dragging = null;
        this._menuOpen = 0;
        this._menuManager = new PopupMenu.PopupMenuManager(this);
        this._fileMenus = new WeakMap();   // stack row -> its menu owner

        keepOtherDocksOff(ctx.originals, cleanup);

        this._view = new DockView(this, cleanup);
        this._claim = this._layout.claim(cleanup, {
            id: 'dock', edge: this.config.position, size: this.metrics.size,
            reserve: this.config.autohide ? 'none' : 'strut', actor: this._view.band,
        });
        this._build();

        const { events } = ctx;
        events.on('window-added', ({ window }) => {
            this._noteRecent(window.appId);
            this._queueSync();
        }, cleanup);
        events.on('window-removed', () => this._queueSync(), cleanup);
        events.on('window-changed', ({ fields }) => {
            if (fields.some(f => ITEM_FIELDS.includes(f)))
                this._queueSync();
        }, cleanup);
        events.on('app-focused', ({ appId }) => this._noteRecent(appId), cleanup);
        events.on('work-area-changed', () => this._place(), cleanup);
        events.on('monitors-changed', () => {
            this._place();
            this._syncBarrier();
        }, cleanup);
        WindowState.watch(cleanup, () => this._queueSync());
        cleanup.connect(this._favorites, 'changed', () => this._queueSync());
        cleanup.connect(this._appSystem, 'installed-changed', () => this._queueSync());
        cleanup.connect(Main.overview, 'showing', () => this._syncOverview());
        cleanup.connect(Main.overview, 'hidden', () => this._syncOverview());

        this._ks.watch(LAYOUT_KEYS, () => this._relayout());
        this._ks.watch(CONTENT_KEYS, () => {
            this.config = readConfig(this._ks);
            this._sync();
        });
        this._ks.watch(HIDE_KEYS, () => this._syncAutohide());
        this._ks.watch('dock-downloads-view', () => {
            this.config = readConfig(this._ks);
        });
        cleanup.add(() => {
            this._barrierCleanup?.dispose();
            if (this._dragMonitor)
                DND.removeDragMonitor(this._dragMonitor);
            if (this._geometryLater)
                global.compositor.get_laters().remove(this._geometryLater);
        });
    }

    disable() {
        // Everything is in the cleanup registry, disposed right after this returns
    }

    // ---- public API ------------------------------------------------------------------------

    get horizontal() {
        return isHorizontal(this.config.position);
    }

    get position() {
        return this.config.position;
    }

    /** @returns {?{x,y,width,height}} the app's icon on screen (as shown), or null */
    iconRect(appId) {
        return this._view.rectOf(this._view.item(appId));
    }

    /** @returns {?{x,y,width,height}} where `win` (a Meta.Window) minimizes to */
    minimizeTarget(win) {
        if (this.config.minimizeToApp) {
            const app = this._tracker.get_window_app(win);
            return app ? this.iconRect(app.get_id()) : null;
        }
        // The minimized-window tiles start right after the separator before the stack
        const sep = this._view.rectOf(this._view.item('separator-system'));
        if (!sep)
            return null;
        const t = this.metrics.tile;
        return this.horizontal
            ? { x: sep.x + sep.width, y: sep.y + Math.round(sep.height / 2 - t / 2), width: t, height: t }
            : { x: sep.x + Math.round(sep.width / 2 - t / 2), y: sep.y + sep.height, width: t, height: t };
    }

    rectOf(item) {
        return this._view.rectOf(item);
    }

    // ---- build and sync --------------------------------------------------------------------

    _build() {
        this._view.build();
        this._view.setEdgeActive(this.config.autohide);
        this._place();
        this._syncOverview();
        this._sync();
        this._syncBarrier();
        this._settle();
    }

    _relayout() {
        this.config = readConfig(this._ks);
        this.metrics = dockMetrics(this.config.iconSize);
        this._claim.update({ edge: this.config.position, size: this.metrics.size });
        this._build();
    }

    _place() {
        this._view.setRect(this._claim.rect());
        this._queueGeometry();
    }

    _syncOverview() {
        // GNOME's overview has its own dash; Mission Control (phase 3) hides the dock too
        if (this._view.frame)
            this._view.frame.visible = !Main.overview.visible;
    }

    _queueSync() {
        if (this._syncQueued)
            return;
        this._syncQueued = true;
        this._cleanup.idle(() => {
            this._syncQueued = false;
            this._sync();
        }, { name: 'dock sync' });
    }

    _pinned() {
        return this._favorites.getFavorites().map(app => app.get_id());
    }

    _sync() {
        const model = this._desktop.model;
        this._running = stableOrder(this._running, model.apps());
        const minimized = this.config.minimizeToApp ? [] : model.windows()
            .filter(w => w.minimized && !this._flagged(w.id)).map(w => w.id);
        this._minimized = stableOrder(this._minimized, minimized);
        const items = dockItems({
            pinned: this._pinned(),
            running: this._running,
            recents: this._recents.filter(id => this._appSystem.lookup_app(id)),
            showRecents: this.config.showRecents,
            minimized: this._minimized,
            downloads: this.config.downloads,
        });
        this._view.setItems(items, spec => this._createItem(spec));
        this._queueGeometry();
    }

    // Windows another feature has set aside (Stage Manager's stage, ...) get no tile
    _flagged(windowId) {
        const win = this._desktop.metaWindow(windowId);
        return !win || WindowState.flags(win).length > 0;
    }

    _createItem(spec) {
        switch (spec.kind) {
        case 'app': {
            const app = this._appFor(spec.id);
            return app ? new AppItem(this, spec, app) : null;
        }
        case 'separator':
            return new SeparatorItem(this, spec);
        case 'window': {
            const win = this._desktop.metaWindow(spec.windowId);
            return win ? new WindowItem(this, spec, win, this._tracker.get_window_app(win)) : null;
        }
        case 'downloads':
            return new DownloadsItem(this, spec);
        case 'trash':
            return new TrashItem(this, spec);
        default:
            return null;
        }
    }

    /** The Shell.App of an id; window-backed apps (no .desktop file) come from their window. */
    _appFor(id) {
        const app = this._appSystem.lookup_app(id);
        if (app)
            return app;
        const [w] = this._desktop.model.windows({ appId: id });
        const win = w ? this._desktop.metaWindow(w.id) : null;
        return win ? this._tracker.get_window_app(win) : null;
    }

    canPin(app) {
        return !!app && !app.is_window_backed() && !!this._appSystem.lookup_app(app.get_id());
    }

    _noteRecent(appId) {
        if (!appId || this._favorites.isFavorite(appId) || !this._appSystem.lookup_app(appId))
            return;
        const next = pushRecent(this._recents, appId);
        if (next.join('\n') === this._recents.join('\n'))
            return;
        this._recents = next;
        this._ks.setStrv('dock-recent-apps', next);
    }

    // The Shell's minimize animation flies to a window's icon geometry: point every window at
    // its dock tile (or the minimized-window slot). Coalesced, after the dock is laid out.
    _queueGeometry() {
        if (this._geometryLater)
            return;
        this._geometryLater = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._geometryLater = 0;
            this._syncGeometry();
            return GLib.SOURCE_REMOVE;
        });
    }

    _syncGeometry() {
        for (const w of this._desktop.model.windows()) {
            const win = this._desktop.metaWindow(w.id);
            const rect = win && (this.config.minimizeToApp || !w.minimized
                ? this.minimizeTarget(win) : this._view.rectOf(this._view.item(`window-${w.id}`)));
            if (rect)
                win.set_icon_geometry(new Mtk.Rectangle(rect));
        }
    }

    dockRelayout() {
        this._queueGeometry();
    }

    // ---- clicks ------------------------------------------------------------------------------

    clickApp(item, button) {
        const model = this._desktop.model;
        const id = item.spec.id;
        const windows = model.windows({ appId: id });
        const action = clickAction({
            windows,
            focused: model.focusedApp === id,
            focusedWindow: model.focusedWindow?.id ?? null,
            button,
            canNewWindow: item.app.can_open_new_window(),
        });
        switch (action.type) {
        case 'launch':
            this._launch(item.app);
            break;
        case 'new-window':
            item.app.open_new_window(-1);
            break;
        case 'activate':
            this.activateWindow(this._desktop.metaWindow(action.windowId));
            break;
        }
    }

    _launch(app) {
        this._noteRecent(app.get_id());
        app.activate();
    }

    activateWindow(win) {
        if (win)
            Main.activateWindow(win);
    }

    openUri(uri) {
        try {
            Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
        } catch (e) {
            console.error(`[Kiwi] dock: cannot open ${uri}:`, e.message);
        }
    }

    opensFiles(app) {
        const info = app.get_app_info();
        return !!info && (info.supports_uris() || info.supports_files());
    }

    openFileWith(app, file) {
        try {
            app.get_app_info().launch([file], global.create_app_launch_context(0, -1));
        } catch (e) {
            console.error('[Kiwi] dock: cannot open the file:', e.message);
        }
    }

    /** One spring of a tile away from the edge and back (a download finished). */
    bounce(item) {
        const lift = Math.round(this.metrics.tile * 0.45);
        const prop = this.horizontal ? 'translation_y' : 'translation_x';
        item.content[prop] = this.horizontal ? -lift : this.position === 'left' ? lift : -lift;
        this.motion.spring(item.content, prop, 0, { spring: 'bouncy' }, item.cleanup);
    }

    // ---- hover and auto-hide -------------------------------------------------------------------

    itemHovered(item, hovered) {
        if (hovered && !this._menuOpen && !this._dragging)
            this._view.showLabel(item);
        else if (!hovered)
            this._view.hideLabel();
    }

    itemRenamed(item) {
        if (item.actor.hover && !this._menuOpen)
            this._view.showLabel(item);
    }

    dockHovered(hovered) {
        this._reveal.dock(hovered);
        this._queueSettle();
    }

    edgeHovered(hovered) {
        this._reveal.edge(hovered);
        this._queueSettle();
    }

    /** Keep the dock up while a menu, the stack or a drag is open. */
    hold() {
        this._reveal.hold();
    }

    unhold() {
        this._reveal.unhold();
        this._queueSettle();
    }

    _queueSettle() {
        if (this._settleQueued)
            return;
        this._settleQueued = true;
        this._cleanup.idle(() => {
            this._settleQueued = false;
            this._settle();
        }, { name: 'dock reveal' });
    }

    _settle() {
        this._view.setShown(this._reveal.settle());
        if (this._reveal.wantsTimer && !this._revealTimer) {
            this._revealTimer = this._cleanup.timeout(this.config.autohideDelay, () => {
                this._revealTimer = 0;
                this._reveal.reveal();
                this._settle();
            }, { name: 'dock reveal delay' });
        } else if (!this._reveal.wantsTimer && this._revealTimer) {
            this._cleanup.release(this._revealTimer);
            this._revealTimer = 0;
        }
    }

    _syncAutohide() {
        this.config = readConfig(this._ks);
        this._claim.update({ reserve: this.config.autohide ? 'none' : 'strut' });
        this._reveal.setAutohide(this.config.autohide);
        this._view.setEdgeActive(this.config.autohide);
        this._syncBarrier();
        this._settle();
    }

    // A pressure barrier along the dock's edge of the primary monitor, while it auto-hides
    _syncBarrier() {
        this._barrierCleanup?.dispose();
        this._barrierCleanup = null;
        const monitor = Main.layoutManager.primaryMonitor;
        if (!this.config.autohide || !monitor)
            return;
        const reg = this._barrierCleanup = new CleanupRegistry();
        const { x, y, width, height } = monitor;
        const edge = {
            bottom: { x1: x, x2: x + width, y1: y + height, y2: y + height, directions: Meta.BarrierDirection.NEGATIVE_Y },
            left: { x1: x, x2: x, y1: y, y2: y + height, directions: Meta.BarrierDirection.POSITIVE_X },
            right: { x1: x + width, x2: x + width, y1: y, y2: y + height, directions: Meta.BarrierDirection.NEGATIVE_X },
        }[this.config.position];
        const pressure = new Layout.PressureBarrier(PRESSURE_THRESHOLD, PRESSURE_TIMEOUT, Shell.ActionMode.NORMAL);
        const barrier = new Meta.Barrier({ backend: global.backend, ...edge });
        pressure.addBarrier(barrier);
        reg.connect(pressure, 'trigger', () => {
            this._reveal.reveal();
            this._settle();
        });
        reg.add(() => {
            pressure.destroy();
            barrier.destroy();
        });
    }

    // ---- menus -------------------------------------------------------------------------------

    // One menu per source actor, kept with the item; it holds the dock up while open
    _menuFor(owner, source) {
        if (owner.menu)
            return owner.menu;
        const menu = new DockMenu(source, this.position);
        this._menuManager.addMenu(menu);
        // Alt (Option) pressed or released while an app menu is open: Quit <-> Force Quit
        owner.cleanup.connect(menu.actor, 'captured-event', (_a, event) => {
            const type = event.type();
            if ((type === Clutter.EventType.KEY_PRESS || type === Clutter.EventType.KEY_RELEASE) && isAltKey(event))
                owner.menuControl?.setAlt(type === Clutter.EventType.KEY_PRESS);
            return Clutter.EVENT_PROPAGATE;
        });
        owner.cleanup.connect(menu, 'open-state-changed', (_m, open) => {
            this._menuOpen += open ? 1 : -1;
            if (open) {
                this._view.hideLabel();
                this.hold();
            } else {
                this.unhold();
            }
        });
        owner.cleanup.add(() => {
            if (menu.isOpen) {
                this._menuOpen--;
                this.unhold();
            }
            menu.destroy();
        });
        owner.menu = menu;
        return menu;
    }

    openAppMenu(item) {
        const app = item.app;
        const id = item.spec.id;
        const info = app.get_app_info();
        const menu = this._menuFor(item, item.actor);
        const hasDesktopFile = this.canPin(app);
        const build = autostart => {
            const model = this._desktop.model;
            const windows = model.windows({ appId: id });
            const entries = menuEntries({
                windows: windows.map(w => ({ id: w.id, title: w.title, minimized: w.minimized })),
                focusedWindow: model.focusedApp === id ? model.focusedWindow?.id ?? null : null,
                actions: info ? info.list_actions().map(a => ({ id: a, name: info.get_action_name(a) })) : [],
                canNewWindow: app.can_open_new_window(),
                pinned: this._favorites.isFavorite(id),
                hasDesktopFile,
                autostart,
                alt: altHeld(),
            });
            const metaWindows = () => this._desktop.model.windows({ appId: id })
                .map(w => this._desktop.metaWindow(w.id)).filter(Boolean);
            return fillAppMenu(menu, entries, {
                window: wid => this.activateWindow(this._desktop.metaWindow(wid)),
                action: name => app.launch_action(name, global.get_current_time(), -1),
                newWindow: () => app.open_new_window(-1),
                open: () => this._launch(app),
                keepInDock: on => this._keepInDock(id, on),
                openAtLogin: on => setAutostart(id, info?.get_filename() ?? null, on)
                    .catch(e => console.error('[Kiwi] dock: Open at Login failed:', e)),
                showInFiles: () => this._showInFiles(info?.get_filename()),
                quit: () => app.request_quit(),
                forceQuit: () => metaWindows().forEach(w => w.kill()),
            }, this.gettext);
        };
        const show = autostart => {
            if (!item.actor.mapped)
                return;
            item.menuControl = build(autostart);
            menu.popup();
        };
        if (!hasDesktopFile) {
            show({ enabled: false, editable: false });
            return;
        }
        readAutostart(id).catch(() => ({ enabled: false, editable: false })).then(show);
    }

    _keepInDock(id, on) {
        const fav = this._favorites;
        if (on)
            (fav._addFavorite ?? fav.addFavorite).call(fav, id, -1);
        else
            (fav._removeFavorite ?? fav.removeFavorite).call(fav, id);
    }

    _showInFiles(path) {
        if (!path)
            return;
        Gio.DBus.session.call('org.freedesktop.FileManager1', '/org/freedesktop/FileManager1',
            'org.freedesktop.FileManager1', 'ShowItems',
            new GLib.Variant('(ass)', [[Gio.File.new_for_path(path).get_uri()], '']),
            null, Gio.DBusCallFlags.NONE, -1, null, (conn, res) => {
                try {
                    conn.call_finish(res);
                } catch (e) {
                    console.warn('[Kiwi] dock: Show in Files failed:', e.message);
                }
            });
    }

    openTrashMenu(item) {
        const _ = this.gettext;
        const menu = this._menuFor(item, item.actor);
        menu.removeAll();
        menu.addAction(_('Open'), () => this.openUri('trash:///'));
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const empty = menu.addAction(_('Empty Trash…'), () => item.confirmEmpty());
        empty.setSensitive(item.count > 0);
        menu.popup();
    }

    openStackMenu(item) {
        const _ = this.gettext;
        const menu = this._menuFor(item, item.actor);
        menu.removeAll();
        menu.addAction(_('Open in Files'), () => this.openUri(item.dir.get_uri()));
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_('View content as')));
        const labels = { automatic: _('Automatic'), fan: _('Fan'), grid: _('Grid'), list: _('List') };
        for (const view of STACK_VIEWS) {
            const entry = menu.addAction(labels[view], () => this._ks.setString('dock-downloads-view', view));
            entry.setOrnament(this.config.stackView === view ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NO_DOT);
        }
        menu.popup();
    }

    /** The menu of one file in the open stack. */
    openFileMenu(button, f, stack) {
        const _ = this.gettext;
        let owner = this._fileMenus.get(button);
        if (!owner) {
            owner = { cleanup: new CleanupRegistry() };
            this._fileMenus.set(button, owner);
            button.connect('destroy', () => owner.cleanup.dispose());
        }
        const menu = this._menuFor(owner, button);
        menu.removeAll();
        menu.addAction(_('Open'), () => {
            this.openUri(f.file.get_uri());
            stack.closePopup();
        });
        const installer = f.entry.badge ? installerFor(f.contentType) : null;
        if (installer) {
            menu.addAction(_('Open with Installer'), () => {
                installer.launch([f.file], global.create_app_launch_context(0, -1));
                stack.closePopup();
            });
        }
        menu.addAction(_('Show in Files'), () => {
            this._showInFiles(f.file.get_path());
            stack.closePopup();
        });
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        menu.addAction(_('Move to Trash'), () => {
            f.file.trash_async(GLib.PRIORITY_DEFAULT, null)
                .catch(e => console.error('[Kiwi] dock: could not move to the trash:', e));
        });
        menu.popup();
    }

    // ---- drag and drop -------------------------------------------------------------------------

    dragBegin(item) {
        this._dragging = item;
        this.hold();
        this._view.hideLabel();
        item.actor.hide();
        if (this.canRemove(item))
            this._view.showRemoveCatcher((x, y) => this.removeFromDock(item, [x, y]));
        // The pointer leaving the dock takes the drop gap with it
        this._dragMonitor = {
            dragMotion: event => {
                if (!this._view.frame.contains(event.targetActor))
                    this._view.hidePlaceholder();
                return DND.DragMotionResult.CONTINUE;
            },
        };
        DND.addDragMonitor(this._dragMonitor);
    }

    dragEnd(item) {
        if (this._dragMonitor)
            DND.removeDragMonitor(this._dragMonitor);
        this._dragMonitor = null;
        this._dragging = null;
        this._view.hidePlaceholder();
        this._view.hideRemoveCatcher();
        item.actor.show();
        this.unhold();
        this._queueSync();
    }

    /** Can this drag source leave the dock (pinned, or a recent app that is not running)? */
    canRemove(source) {
        if (!(source instanceof AppItem) || this._view.item(source.id) !== source)
            return false;
        return source.spec.section === 'pinned' || (source.spec.section === 'recent' && !source.spec.running);
    }

    // Apps (from the dock or the Shell's app grid) can be dropped among the pinned apps
    _pinnedItemsWithout(id) {
        return [...this._view.items()].filter(i => i instanceof AppItem && i.spec.section === 'pinned' && i.id !== id);
    }

    dragOverDock(source, coord) {
        const app = source?.app;
        if (!app || !this.canPin(app))
            return DND.DragMotionResult.CONTINUE;
        const pinned = this._pinnedItemsWithout(app.get_id());
        const index = this._view.dropIndexAmong(pinned, coord);
        this._view.showPlaceholder(pinned[index] ?? null, pinned[index - 1] ?? pinned[pinned.length - 1] ?? null);
        return DND.DragMotionResult.MOVE_DROP;
    }

    dropOnDock(source, coord) {
        const app = source?.app;
        if (!app || !this.canPin(app))
            return false;
        const id = app.get_id();
        const pinned = this._pinnedItemsWithout(id);
        const pos = pinPosition(pinned.map(i => i.id), this._view.dropIndexAmong(pinned, coord));
        this._view.hidePlaceholder();
        const fav = this._favorites;
        if (fav.isFavorite(id))
            fav.moveFavoriteToPos(id, pos);
        else
            (fav._addFavorite ?? fav.addFavoriteAtPos).call(fav, id, pos);
        return true;
    }

    /** Take an item off the dock with a poof where it was dropped. */
    removeFromDock(item, point) {
        const id = item.spec.id;
        if (item.spec.section === 'pinned') {
            this._keepInDock(id, false);
        } else {
            this._recents = this._recents.filter(r => r !== id);
            this._ks.setStrv('dock-recent-apps', this._recents);
            this._queueSync();
        }
        const [x, y] = point ?? global.get_pointer();
        this._view.poof(x, y);
    }
}
