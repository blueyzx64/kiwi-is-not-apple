// SPDX-License-Identifier: GPL-3.0-or-later
// Notification Center (features.js `notification-center`; macOS Big Sur, research BM
// "Clicking the clock opens Notification Center" and "Notification Center redesign").
//
// The menu bar emits 'notification-center-requested' when the clock is clicked; the column
// then replaces the calendar card (closed at once) with a right-side glass column: the date
// and a small month, the notification history grouped by app, and the widgets area.
// With this feature off the clock opens the calendar card as before.
//
//   model.js   grouping, stacks, "N more", ages, the month (tested)
//   view.js    the St widgets
//   here       life cycle; the history comes from NotificationRouter (the stock message tray
//              sources, the same list the notch's banners leave behind)
//
// Widgets (L11's widget model): ctx.features.instance('notification-center')
//   .addWidget(owner, {id, order, create: () => Clutter.Actor}) -> {release()}
// create() runs on every open; the actor is destroyed when the column closes. Placeholders
// show while none is registered. The feature registers its own widgets: core/widgets views
// (any kind, small, medium or large) from notification-center-widget-list, two smalls or one
// medium per row. "Edit Widgets…" turns the area into the chooser (core/widgets/chooser.js).
//
// Banners: while the column is open a router filter holds back every new banner (stock or
// notch); it lands in the history list below instead. (The stock tray's bannerBlocked would
// only queue them, and they would pop up when the column closes.)

import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { NotificationRouter } from '../../core/notificationRouter.js';
import { Widgets } from '../../core/widgets/index.js';
import { buildChooser } from '../../core/widgets/chooser.js';
import { packRows, parseWidgetList, serializeWidgetList } from '../../core/widgets/model.js';
import { MENU_CLOSE_ARGS } from '../../lib/compat.js';
import { RADIUS } from '../../lib/designTokens.js';
import { ModalSurface } from '../../lib/modalSurface.js';
import { KiwiSettings } from '../../lib/settings.js';
import { groupByApp, orderWidgets, pruneExpanded } from './model.js';
import { buildDateWidget, buildNotifications, buildWidgets } from './view.js';

// Wide enough for a Medium widget (364) between the column's 12 px paddings
const WIDTH = 392;
const KEY_LIST = 'notification-center-widget-list';
// Two Small widgets or one Medium fill the column's width
const COLUMNS = 2;

export class NotificationCenter {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._modal = null;
        this._expanded = new Set();
        this._showAll = false;
        this._widgets = [];
        this._refreshIdle = 0;
        this._section = null;
        this._widgetsSection = null;
        this._editing = false;
        this._content = null;
        this._host = null;
        this._bannerFilter = null;
    }

    enable() {
        const cleanup = this._cleanup;
        this._ks = new KiwiSettings(this._ctx.settings);
        this._ks.attach(cleanup);
        this._modal = new ModalSurface(cleanup, {
            id: 'notification-center', accessibleName: this._ctx.gettext('Notification Center'), position: 'right', width: WIDTH, radius: RADIUS.panel, dim: false,
            styleClass: 'kiwi-nc',
            // the same glass as Control Center and the calendar card, which open beside it
            glass: { surface: 'menus', role: 'content' },
            build: frame => this._build(frame),
            onClosed: () => this._onClosed(),
        });
        this._ctx.events.on('notification-center-requested', () => this.open(), cleanup);
        NotificationRouter.watchHistory(cleanup, () => this._queueRefresh());
        this._ks.watch('notification-center-widgets', () => this._rebuild());
        this._ks.watch(KEY_LIST, () => this._fillWidgets());
        this._host = Widgets.acquire(cleanup, this._ctx.gettext, this._ctx);
        this.addWidget(cleanup, { id: 'kiwi-widgets', order: 0, create: () => this._ownWidgets() });
        cleanup.add(() => this._showBanners());
    }

    disable() {
        // Everything is in the cleanup registry, disposed right after this returns
    }

    // ---- public ----------------------------------------------------------------------------

    get isOpen() {
        return !!this._modal?.isOpen;
    }

    open() {
        // The calendar card opened with the click: the column takes its place
        const dateMenu = Main.panel.statusArea.dateMenu;
        if (dateMenu?.menu?.isOpen)
            dateMenu.menu.close(MENU_CLOSE_ARGS);
        if (this.isOpen)
            return;
        this._modal.open();
        if (this.isOpen)
            this._hideBanners();
    }

    close() {
        this._modal?.close();
    }

    toggle() {
        if (this.isOpen)
            this.close();
        else
            this.open();
    }

    /**
     * @param {object} owner CleanupRegistry; the widget goes when it is disposed
     * @param {{id: string, order?: number, create: function(): Clutter.Actor}} widget
     */
    addWidget(owner, widget) {
        this._widgets = this._widgets.filter(w => w.id !== widget.id).concat(widget);
        this._rebuild();
        let done = false;
        const handle = {
            release: () => {
                if (done)
                    return;
                done = true;
                this._widgets = this._widgets.filter(w => w !== widget);
                this._rebuild();
            },
        };
        owner?.add(() => handle.release());
        return handle;
    }

    /** Plain description of what the column shows (tests, the harness). */
    snapshot() {
        const groups = groupByApp(this._items());
        return {
            open: this.isOpen,
            groups: groups.map(g => ({ key: g.key, name: g.appName, count: g.items.length, expanded: this._expanded.has(g.key) })),
        };
    }

    expand(key) {
        this._expanded.add(key);
        this._refreshNow();
    }

    collapse(key) {
        this._expanded.delete(key);
        this._refreshNow();
    }

    // ---- banners ---------------------------------------------------------------------------

    _hideBanners() {
        if (this._bannerFilter)
            return;
        this._bannerFilter = NotificationRouter.setBannerFilter(null, () => false);
    }

    _showBanners() {
        if (!this._bannerFilter)
            return;
        this._bannerFilter.release();
        this._bannerFilter = null;
    }

    // ---- widgets ---------------------------------------------------------------------------

    /** The column's own widget list (notification-center-widget-list), parsed. */
    widgetList() {
        const registry = this._host.registry;
        return parseWidgetList(this._ks.strv(KEY_LIST), {
            sizesFor: kind => registry.sizesFor(kind, 'center'),
            defaultSize: kind => registry.get(kind)?.defaultSize,
        });
    }

    setWidgetList(list) {
        this._ks.setStrv(KEY_LIST, serializeWidgetList(list));
    }

    // The list's widgets, row by row (null while it is empty: the placeholders show)
    _ownWidgets() {
        const rows = packRows(this.widgetList(), COLUMNS);
        if (!rows.length)
            return null;
        const box = new St.BoxLayout({ style_class: 'kiwi-nc-widget-rows', orientation: Clutter.Orientation.VERTICAL, x_expand: true });
        for (const row of rows)
            box.add_child(this._widgetRow(row));
        return box;
    }

    // One row of live core/widgets views. They follow their data while the column is open
    // (the column's actors, and with them the views, are destroyed when it closes).
    _widgetRow(specs) {
        const row = new St.BoxLayout({ style_class: 'kiwi-nc-widget-row', x_align: Clutter.ActorAlign.CENTER });
        for (const { kind, size } of specs) {
            const view = this._host.createView(kind, { size, config: {}, surface: 'center' });
            const click = new Clutter.ClickGesture();
            click.connect('recognize', () => {
                this.close();
                view.activate();
            });
            view.actor.add_action(click);
            row.add_child(view.actor);
            view.setActive(true);
        }
        return row;
    }

    // "Edit Widgets…": the area becomes the chooser until Done
    _chooser() {
        const registry = this._host.registry;
        return buildChooser({
            _: this._ctx.gettext,
            entries: registry.kinds().map(k => ({ kind: k.id, title: k.title })),
            list: this.widgetList(),
            sizesFor: kind => registry.sizesFor(kind, 'center'),
            onChange: list => this.setWidgetList(list),
        });
    }

    _setEditing(on) {
        this._editing = on;
        this._fillWidgets();
    }

    // ---- history ---------------------------------------------------------------------------

    _items() {
        const items = [];
        for (const source of NotificationRouter.sources()) {
            const appId = NotificationRouter.appIdOf(source);
            for (const notification of source.notifications) {
                items.push({
                    key: `${items.length}`,
                    appId,
                    appName: source.title ?? '',
                    title: notification.title ?? '',
                    body: notification.body ?? '',
                    time: (notification.datetime?.to_unix() ?? 0) * 1000,
                    urgency: notification.urgency,
                    actions: notification.actions.map(a => a.label),
                    gicon: notification.gicon ?? source.icon ?? null,
                    notification,
                });
            }
        }
        return items;
    }

    _controller(groups) {
        const _ = this._ctx.gettext;
        const run = fn => {
            try {
                fn();
            } catch (e) {
                console.error('[Kiwi] Notification Center action failed:', e);
            }
        };
        return {
            _, now: Date.now(), expanded: this._expanded, showAll: this._showAll,
            expand: group => this.expand(group.key),
            collapse: group => this.collapse(group.key),
            showMore: () => {
                this._showAll = true;
                this._refreshNow();
            },
            activate: item => run(() => {
                this.close();
                item.notification.activate();
            }),
            action: (item, index) => run(() => {
                this.close();
                item.notification.actions[index]?.activate();
            }),
            clear: item => run(() => item.notification.destroy()),
            clearGroup: group => run(() => {
                this._expanded.delete(group.key);
                group.items.forEach(item => item.notification.destroy());
            }),
            clearAll: () => run(() => {
                for (const group of groups) {
                    for (const item of group.items) {
                        if (!item.notification.resident)
                            item.notification.destroy();
                    }
                }
            }),
        };
    }

    // ---- building --------------------------------------------------------------------------

    _build(frame) {
        const scroll = new St.ScrollView({
            style_class: 'kiwi-nc-scroll', x_expand: true, y_expand: true,
            accessible_name: this._ctx.gettext('Notifications'),
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
        });
        const content = new St.BoxLayout({ style_class: 'kiwi-nc-content', orientation: Clutter.Orientation.VERTICAL, x_expand: true });
        scroll.set_child(content);
        frame.add_child(scroll);
        this._content = content;
        this._fill();
        return scroll;
    }

    _fill() {
        const content = this._content;
        if (!content)
            return;
        content.destroy_all_children();
        const _ = this._ctx.gettext;
        content.add_child(buildDateWidget(_, Date.now(), Shell.util_get_week_start()));
        this._section = null;
        this._widgetsSection = null;
        this._fillNotifications();
        this._fillWidgets();
    }

    _fillWidgets() {
        const content = this._content;
        if (!content)
            return;
        const old = this._widgetsSection;
        this._widgetsSection = null;
        if (this._ks.bool('notification-center-widgets')) {
            const _ = this._ctx.gettext;
            this._widgetsSection = buildWidgets(_, orderWidgets(this._widgets), {
                editing: this._editing,
                editor: () => this._chooser(),
                onEdit: () => this._setEditing(!this._editing),
            });
        }
        if (old && this._widgetsSection)
            content.replace_child(old, this._widgetsSection);
        else if (this._widgetsSection)
            content.add_child(this._widgetsSection);
        old?.destroy();
    }

    _fillNotifications() {
        const groups = groupByApp(this._items());
        this._expanded = pruneExpanded(this._expanded, groups);
        const section = buildNotifications(groups, this._controller(groups));
        if (this._section) {
            this._content.replace_child(this._section, section);
            this._section.destroy();
        } else {
            this._content.insert_child_at_index(section, 1);
        }
        this._section = section;
    }

    _refreshNow() {
        if (this._refreshIdle) {
            this._cleanup.release(this._refreshIdle);
            this._refreshIdle = 0;
        }
        if (this._content)
            this._fillNotifications();
    }

    // Several notifications can come and go in one go (Clear All): one rebuild per main-loop turn
    _queueRefresh() {
        if (!this._content || this._refreshIdle)
            return;
        this._refreshIdle = this._cleanup.idle(() => {
            this._refreshIdle = 0;
            if (this._content)
                this._fillNotifications();
        }, { name: 'notification center refresh' });
    }

    _rebuild() {
        if (this._content)
            this._fill();
    }

    _onClosed() {
        this._showBanners();
        if (this._refreshIdle) {
            this._cleanup.release(this._refreshIdle);
            this._refreshIdle = 0;
        }
        this._content = null;
        this._section = null;
        this._widgetsSection = null;
        this._editing = false;
        this._showAll = false;
    }
}
