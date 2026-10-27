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
// show while none is registered.

import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { NotificationRouter } from '../../core/notificationRouter.js';
import { MENU_CLOSE_ARGS } from '../../lib/compat.js';
import { ModalSurface } from '../../lib/modalSurface.js';
import { KiwiSettings } from '../../lib/settings.js';
import { groupByApp, orderWidgets, pruneExpanded } from './model.js';
import { buildDateWidget, buildNotifications, buildWidgets } from './view.js';

const WIDTH = 380;

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
        this._content = null;
    }

    enable() {
        const cleanup = this._cleanup;
        this._ks = new KiwiSettings(this._ctx.settings);
        this._ks.attach(cleanup);
        this._modal = new ModalSurface(cleanup, {
            id: 'notification-center', position: 'right', width: WIDTH, radius: 22, dim: false,
            styleClass: 'kiwi-nc',
            build: frame => this._build(frame),
            onClosed: () => this._onClosed(),
        });
        this._ctx.events.on('notification-center-requested', () => this.open(), cleanup);
        NotificationRouter.watchHistory(cleanup, () => this._queueRefresh());
        this._ks.watch('notification-center-widgets', () => this._rebuild());
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
        if (!this.isOpen)
            this._modal.open();
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
        this._fillNotifications();
        if (this._ks.bool('notification-center-widgets'))
            content.add_child(buildWidgets(_, orderWidgets(this._widgets)));
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
        if (this._refreshIdle) {
            this._cleanup.release(this._refreshIdle);
            this._refreshIdle = 0;
        }
        this._content = null;
        this._section = null;
        this._showAll = false;
    }
}
