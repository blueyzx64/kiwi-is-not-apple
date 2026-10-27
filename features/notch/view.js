// SPDX-License-Identifier: GPL-3.0-or-later
// The notch actors. No state logic: index.js feeds render() the view model from
// stateMachine.view() plus what the pages need to show, and gets clicks back through handlers.
//
//   - `placeholder` sits in the panel's centre box (PanelLayout) and only reserves room.
//   - `island` is the black pill. It lives in the top chrome so it can grow below the bar and
//     take input there. It is centred on the primary monitor and glued to its top edge.
//   - two `ears` flank the island's top corners: the small concave fillets where a MacBook
//     notch flares into the screen's top edge. They are siblings of the island (it clips to its
//     allocation), pinned to its edges by snap constraints so they follow every frame of the
//     grow and shrink animations, and painted in the island's own background colour.
//
// Motion (core/motion): the shape springs (a little overshoot growing, none shrinking); the new
// content fades in once the shape is most of the way there and the old one fades out at once,
// so text never shows squeezed. Pages keep the size of their target shape and stay centred
// while the island springs around them (it clips), so nothing reflows mid-animation. Tabs of
// the expanded view share one shape; switching slides the body in from the side of the tab.
//
// Idle cost: no timers or animations run unless something is shown that moves (the playing
// waveform, a countdown, the open dashboard's clock and scrubber).

import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

import { CleanupRegistry } from '../../lib/disposables.js';
import { SIZES } from './stateMachine.js';
import { cardSize } from './dashboardModel.js';
import { tabDirection, TABS } from './model.js';
import { label, icon, themed, button, artwork, track } from './ui.js';
import { pill, tickMs } from './pills.js';
import { nowTab, trayTab, widgetsTab, DASH_SIZE } from './tabs.js';

// Springs in SwiftUI terms (core/motionModel.js): grow with a slight overshoot, shrink without
const GROW_SPRING = Object.freeze({ response: 0.42, damping: 0.8 });
const SHRINK_SPRING = Object.freeze({ response: 0.32, damping: 1 });
const CONTENT_DELAY_MS = 150;    // the shape is ~85 % there
const LIVE_TICK_MS = 1000;       // clocks, countdowns and the scrubber while shown
const BARS = 4;
const BAR_HEIGHT = 16;
const BAR_TICK_MS = 300;
const BAR_REST = [0.38, 0.75, 0.56, 0.31];   // waveform scale when paused or without motion
const BAR_PEAK = [0.62, 1, 0.88, 0.56];
const BAR_FLOOR = 0.25;
const EAR_RADIUS = 10;   // the fillet where the notch meets the top edge, logical px
const TAB_SLIDE = 24;    // px the tab body travels when switching

export class NotchView {
    /**
     * @param {CleanupRegistry} cleanup everything made here is released on dispose
     * @param {object} handlers {onClick, onDismiss, onHover(bool), onExpand, onAction(id, index),
     *   onMedia('previous'|'toggle'|'next'), onToggleDnd, onToggleMic, onCopy(entryId), onCollapse,
     *   onOpenNotification(notification), onOpenList, onSeek(fraction 0..1), onTab(tab),
     *   onActivityAction(activity, id), onShelf(action, uri), onTimerPreset(minutes),
     *   onOpenWeather, onOpenCalendar, getPosition(): Promise<number|null>}
     * @param {function(string): string} gettext
     * @param {import('../../core/motion.js').Motion} motion
     */
    constructor(cleanup, handlers, gettext, motion) {
        this._cleanup = cleanup;
        this._h = handlers;
        this._ = gettext;
        this._motion = motion;
        this._destroyed = false;
        this._signature = null;
        this._kind = null;
        this._content = null;
        this._page = null;
        this._dash = null;           // {page, tabs: Map(tab -> button), body, tab, bodySig}
        this._barTimer = 0;
        this._liveTimer = 0;
        this._liveMs = null;         // the current pill's refresh interval (pills.js tickMs)
        this._springs = [];          // core/motion handles of the shape
        this._fade = null;
        this._size = SIZES.idle;
        this._ears = null;
        this._grab = null;           // Main.pushModal grab while a clicked dashboard is open
        this._wantGrab = false;
        this._captureId = 0;
        this._pressOnSurface = false;
        this._hoverIntent = { enabled: true, delayMs: 300 };
        this._hoverTimer = 0;
        this._anim = new CleanupRegistry();   // owner of running animations, disposed with the view
        cleanup.add(() => this._anim.dispose());

        this.placeholder = new St.Widget({
            style_class: 'kiwi-notch-placeholder',
            width: SIZES.idle.w + 8,
            height: 1,
            y_expand: true,
            reactive: false,
        });
        cleanup.add(() => this.placeholder.destroy());

        this._island = new St.Widget({
            name: 'kiwi-notch',
            style_class: 'kiwi-notch',
            layout_manager: new Clutter.FixedLayout(),
            reactive: true,
            track_hover: true,
            clip_to_allocation: true,
            width: SIZES.idle.w,
            height: SIZES.idle.h,
        });
        this._island.set_accessible_name?.(gettext('Notch'));
        Main.layoutManager.addTopChrome(this._island);
        cleanup.add(() => {
            this._destroyed = true;
            this._page = null;
            this._dash = null;
            this._stopShape();
            this._stopTimers();
            this._cancelHoverIntent();
            this._interface = null;
            this._releaseGrab();
            Main.layoutManager.removeChrome(this._island);
            this._island.destroy();
        });

        cleanup.connect(this._island, 'notify::hover', () => {
            const hover = this._island.hover;
            this._h.onHover(hover);
            if (hover)
                this._startHoverIntent();
            else
                this._cancelHoverIntent();
        });
        // The spring changes the width; keep the island centred and the pages in its middle
        cleanup.connect(this._island, 'notify::width', () => {
            const monitor = this._monitor();
            if (monitor)
                this._island.x = monitor.x + (monitor.width - this._island.width) / 2;
            this._centerPages();
        });
        // A press or release on a button inside the card belongs to that button. Bubbling up
        // here it used to count as a click on the notch too, which collapsed the dashboard
        // and destroyed the button before it could emit 'clicked'.
        cleanup.connect(this._island, 'button-press-event', (_a, event) => {
            this._pressOnSurface = !this._onControl(this._eventActor(event));
            return this._pressOnSurface ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
        });
        cleanup.connect(this._island, 'button-release-event', (_a, event) => {
            const own = this._pressOnSurface && !this._onControl(this._eventActor(event));
            this._pressOnSurface = false;
            if (!own)
                return Clutter.EVENT_PROPAGATE;
            this._cancelHoverIntent();
            if (event.get_button() === Clutter.BUTTON_SECONDARY)
                this._h.onDismiss();
            else
                this._h.onClick();
            return Clutter.EVENT_STOP;
        });
        cleanup.connect(Main.layoutManager, 'monitors-changed', () => this._place(this._size, false));

        this._addEars();
        this._place(SIZES.idle, false);
    }

    /** @param {{enabled: boolean, delayMs: number}} intent hover-to-expand settings */
    setHoverIntent(intent) {
        this._hoverIntent = { ...intent };
        if (!intent.enabled)
            this._cancelHoverIntent();
    }

    _startHoverIntent() {
        this._cancelHoverIntent();
        if (!this._hoverIntent.enabled)
            return;
        this._hoverTimer = this._cleanup.timeout(Math.max(1, this._hoverIntent.delayMs), () => {
            this._hoverTimer = 0;
            if (!this._destroyed && this._island.hover)
                this._h.onExpand();
            return GLib.SOURCE_REMOVE;
        }, { name: 'notch hover intent' });
    }

    _cancelHoverIntent() {
        if (this._hoverTimer)
            this._cleanup.release(this._hoverTimer);
        this._hoverTimer = 0;
    }

    get actor() {
        return this._island;
    }

    // The actor the pointer is on. Clutter.Event.get_source() is gone since GNOME 45.
    _eventActor(event) {
        return global.stage.get_event_actor?.(event) ?? event.get_source?.() ?? null;
    }

    /** True if `actor` is, or sits inside, a reactive button of the current page. */
    _onControl(actor) {
        for (let a = actor; a && a !== this._island; a = a.get_parent()) {
            if (a instanceof St.Button && a.reactive)
                return true;
        }
        return false;
    }

    // ---- outside click and Escape ---------------------------------------------------------
    // While the dashboard is open the notch holds a Shell grab (like a panel menu): every
    // pointer and key event comes to the island first, so a press anywhere outside it, on a
    // window or the desktop, and Escape collapse it. The grab goes with the dashboard.

    _syncGrab() {
        if (this._wantGrab && this._island.visible)
            this._takeGrab();
        else
            this._releaseGrab();
    }

    _takeGrab() {
        if (this._grab || this._destroyed)
            return;
        let grab = null;
        try {
            grab = Main.pushModal(this._island, { actionMode: Shell.ActionMode.POPUP });
        } catch (e) {
            console.warn(`[Kiwi] notch: no grab for the dashboard: ${e.message}`);
        }
        if (!grab)
            return; // another grab is active; the dashboard still closes on leave
        this._grab = grab;
        this._captureId = this._island.connect('captured-event', (_a, event) => this._onCaptured(event));
        this._island.grab_key_focus();
    }

    _releaseGrab() {
        if (this._captureId) {
            this._island.disconnect(this._captureId);
            this._captureId = 0;
        }
        const grab = this._grab;
        this._grab = null;
        if (!grab)
            return;
        try {
            Main.popModal(grab);
        } catch (e) {
            console.warn(`[Kiwi] notch: popModal failed: ${e.message}`);
        }
    }

    _contains(x, y) {
        const [ok, lx, ly] = this._island.transform_stage_point(x, y);
        return ok && lx >= 0 && ly >= 0 && lx < this._island.width && ly < this._island.height;
    }

    _onCaptured(event) {
        const type = event.type();
        if (type === Clutter.EventType.KEY_PRESS && event.get_key_symbol() === Clutter.KEY_Escape) {
            this._h.onCollapse?.();
            return Clutter.EVENT_STOP;
        }
        if (type === Clutter.EventType.BUTTON_PRESS || type === Clutter.EventType.TOUCH_BEGIN) {
            const [x, y] = event.get_coords();
            if (!this._contains(x, y)) {
                this._h.onCollapse?.();
                return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_PROPAGATE;
    }

    // ---- ears -----------------------------------------------------------------------------
    // Each ear is an EAR_RADIUS square just outside one top corner of the island, filled with
    // the island's background colour minus a quarter circle centred on the ear's outer bottom
    // corner. The island's top corners are square, so ear and island share one straight edge
    // and the black runs from the island's side into the top edge along a smooth arc.
    // The ears touch the island but never overlap it, so a translucent fill is not doubled
    // along the seam. Snap constraints put both edges of each ear on the island's allocation
    // (fractional while it eases), so there is no gap at any width.

    _addEars() {
        const parent = this._island.get_parent();
        const edge = Clutter.SnapEdge;
        const snap = (ear, from, to, offset) => ear.add_constraint(new Clutter.SnapConstraint({
            source: this._island, from_edge: from, to_edge: to, offset,
        }));
        this._ears = ['left', 'right'].map(side => {
            const ear = new St.DrawingArea({
                name: `kiwi-notch-ear-${side}`,
                style_class: 'kiwi-notch-ear',
                reactive: false,
            });
            ear.connect('repaint', () => this._paintEar(ear, side));
            parent.insert_child_below(ear, this._island);
            if (side === 'left') {
                snap(ear, edge.RIGHT, edge.LEFT, 0);
                snap(ear, edge.LEFT, edge.LEFT, -EAR_RADIUS);
            } else {
                snap(ear, edge.LEFT, edge.RIGHT, 0);
                snap(ear, edge.RIGHT, edge.RIGHT, EAR_RADIUS);
            }
            snap(ear, edge.TOP, edge.TOP, 0);
            snap(ear, edge.BOTTOM, edge.TOP, EAR_RADIUS);
            // Shown, hidden and faded with the island
            this._island.bind_property('visible', ear, 'visible', GObject.BindingFlags.SYNC_CREATE);
            this._island.bind_property('opacity', ear, 'opacity', GObject.BindingFlags.SYNC_CREATE);
            return ear;
        });
        // A theme or Glass change to the island's fill repaints the ears in the same colour
        this._cleanup.connect(this._island, 'style-changed', () => this._ears?.forEach(e => e.queue_repaint()));
        this._cleanup.add(() => {
            this._ears?.forEach(e => e.destroy());
            this._ears = null;
        });
    }

    _paintEar(ear, side) {
        const cr = ear.get_context();
        try {
            const [w, h] = ear.get_surface_size();
            const c = this._island.get_theme_node().get_background_color();
            cr.setOperator(Cairo.Operator.CLEAR);
            cr.paint();
            cr.setOperator(Cairo.Operator.OVER);
            // The square, minus the circle of radius w centred on the outer bottom corner
            const cx = side === 'left' ? 0 : w;
            cr.newPath();
            cr.rectangle(0, 0, w, h);
            cr.arc(cx, h, w, 0, 2 * Math.PI);
            cr.setFillRule(Cairo.FillRule.EVEN_ODD);
            cr.setSourceRGBA(c.red / 255, c.green / 255, c.blue / 255, c.alpha / 255);
            cr.fill();
        } finally {
            cr.$dispose();
        }
    }


    _monitor() {
        return Main.layoutManager.primaryMonitor;
    }

    _stopShape() {
        const springs = this._springs;
        this._springs = [];
        springs.forEach(s => s.cancel());
    }

    _place(size, animate) {
        if (this._destroyed)
            return;
        this._size = size;
        const monitor = this._monitor();
        if (!monitor)
            return;
        const island = this._island;
        island.style = `border-radius: 0 0 ${size.r}px ${size.r}px;`;
        this._stopShape();
        island.y = monitor.y;
        if (!animate || !island.mapped) {
            island.set_size(size.w, size.h);
            island.x = monitor.x + Math.round((monitor.width - size.w) / 2);
            return;
        }
        // Two springs on one curve (core/motion: reduced motion and animations-off jump to the
        // end); notify::width keeps the island centred on every frame.
        const growing = size.w * size.h > island.width * island.height;
        const request = { spring: growing ? GROW_SPRING : SHRINK_SPRING };
        this._springs = [
            this._motion.spring(island, 'width', size.w, request, this._anim),
            this._motion.spring(island, 'height', size.h, request, this._anim),
        ];
    }

    /** @param {boolean} show the island is on screen at all (bar visible, not hidden by fullscreen) */
    setShown(show) {
        if (this._destroyed)
            return;
        this._island.visible = show;
        this._syncGrab();
    }

    /**
     * @param {object} vm stateMachine.view(state)
     * @param {object} ctx {notification, media, dnd, count, recent, clipboard, shelf, selected,
     *   widgets: {events, weather, mic, timersEnabled}}
     */
    render(vm, ctx) {
        if (this._destroyed)
            return;
        const n = ctx.notification;
        const dashboard = vm.kind === 'expanded' && vm.content === 'dashboard';
        const signature = this._signatureOf(vm, ctx, dashboard);
        if (signature === this._signature)
            return;
        this._signature = signature;

        // The dashboard stays and only its body changes: a tab switch, or new data in a tab
        if (dashboard && this._dash && this._page === this._dash.page) {
            this._wantGrab = !!vm.pinned;
            this._syncGrab();
            this._updateDashboard(vm, ctx);
            return;
        }

        const shapeChanged = this._kind !== vm.kind || this._content !== vm.content ||
            (vm.kind === 'live-activity' && this._size.w !== vm.size.w);
        this._kind = vm.kind;
        this._content = vm.content;

        let size = dashboard ? DASH_SIZE : vm.size;
        if (vm.kind === 'expanded' && !dashboard && n)
            size = cardSize({ actions: (n.actions?.length ?? 0) > 0 });
        const growing = size.w * size.h > this._island.width * this._island.height;

        this._place(size, true);
        this._wantGrab = dashboard && !!vm.pinned;
        this._syncGrab();

        const old = this._page;
        this._page = null;
        this._dash = null;
        this._liveMs = null;
        this._stopTimers();
        if (old)
            this._retire(old, shapeChanged);
        let page;
        const live = [];
        try {
            page = this._build(vm, ctx, live);
        } catch (e) {
            // Never leave a half-built page behind; draw an empty pill and retry next time.
            console.error('[Kiwi] notch page failed:', e);
            this._stopTimers();
            this._signature = null;
            this._dash = null;
            page = new St.Widget();
        }
        this._page = page;
        page.set_size(size.w, size.h);
        this._island.add_child(page);
        this._centerPages();
        // A dashboard's refreshers live with its tab body (_fillDashboard)
        if (this._dash)
            this._startLive(page, this._dash.live);
        else
            this._startLive(page, live, this._liveMs ?? LIVE_TICK_MS);
        if (shapeChanged) {
            // The content arrives once the shape is nearly there; a slight drop from above
            // reads as coming out of the notch.
            page.opacity = 0;
            page.translation_y = growing ? -6 : 0;
            this._motion.ease(page, { opacity: 255, translation_y: 0 }, {
                duration: 'short', curve: 'standard', delay: growing ? CONTENT_DELAY_MS : 40,
            }, this._anim);
        }
    }

    // What the current page depends on, as one string (render() skips an identical frame)
    _signatureOf(vm, ctx, dashboard) {
        const n = ctx.notification;
        const media = ctx.media ? { ...ctx.media, appIcon: undefined } : null; // icons are not JSON
        let dash = null;
        if (dashboard) {
            const acts = (vm.activities ?? []).map(a => [a.key, a.kind, a.data]);
            const tab = vm.tab;
            dash = [tab, vm.pinned, vm.dropping, ctx.dnd];
            if (tab === 'now')
                dash.push(media, acts, ctx.count, (ctx.recent ?? []).map(r => [r.title, r.app, r.when, r.body]));
            else if (tab === 'tray')
                dash.push(ctx.clipboard, ctx.selected, ctx.shelf.clipboardHasFiles,
                    ctx.shelf.uris.map(u => [u, ctx.shelf.info(u).name, ctx.shelf.info(u).missing, !!ctx.shelf.info(u).gicon]));
            else
                dash.push(ctx.widgets);
        }
        return JSON.stringify([
            vm.kind, vm.content, vm.notificationId, vm.badge,
            dashboard ? null : vm.activity?.key ?? null, dashboard ? null : vm.activity?.data ?? null,
            vm.kind === 'live-activity' ? vm.activity?.kind : null,
            vm.osd?.kind, vm.osd?.level, vm.osd?.label,
            dash,
            n ? [n.title, n.body, n.actions?.length ?? 0] : null,
        ]);
    }

    // Pages are as wide as their target shape; keep them centred in the moving island.
    _centerPages() {
        const w = this._island.width;
        for (const child of this._island.get_children())
            child.set_position(Math.round((w - child.width) / 2), 0);
    }

    _stopTimers() {
        for (const key of ['_barTimer', '_liveTimer']) {
            if (this[key])
                this._cleanup.release(this[key]);
            this[key] = 0;
        }
    }

    // The old page fades out quickly while the shape changes, and takes no more clicks.
    _retire(old, fade, extra = {}) {
        const walk = a => {
            if (a instanceof St.Button)
                a.reactive = false;
            a.get_children().forEach(walk);
        };
        walk(old);
        if (!fade) {
            old.destroy();
            return;
        }
        this._motion.ease(old, { opacity: 0, ...extra }, {
            duration: 'micro', curve: 'enter',
            onDone: () => {
                if (!this._destroyed && old.get_parent())
                    old.destroy();
            },
        }, this._anim);
    }

    _build(vm, ctx, live) {
        switch (vm.kind) {
        case 'live-activity': return this._activityPage(vm.activity, ctx, live);
        case 'osd': return this._osdPage(vm.osd);
        case 'compact': return this._compactPage(ctx.notification, vm.badge);
        case 'expanded':
            return vm.content === 'dashboard'
                ? this._dashboardPage(vm, ctx)
                : this._cardPage(vm.notificationId, ctx.notification, vm.badge);
        default:
            return new St.Widget();
        }
    }

    // ---- dashboard: header with tabs, then the body of the current tab --------------------

    _dashboardPage(vm, ctx) {
        const page = new St.BoxLayout({
            style_class: 'kiwi-notch-dash',
            orientation: Clutter.Orientation.VERTICAL,
        });
        const header = new St.BoxLayout({ style_class: 'kiwi-notch-dash-header' });
        const tabs = new St.BoxLayout({ style_class: 'kiwi-notch-tabs', x_expand: true });
        const names = { now: this._('Now'), tray: this._('Tray'), widgets: this._('Widgets') };
        const buttons = new Map();
        for (const tab of TABS) {
            const b = button({
                styleClass: 'kiwi-notch-tab', text: names[tab], accessibleName: names[tab],
                toggle: tab === vm.tab, onClick: () => this._h.onTab(tab),
            });
            buttons.set(tab, b);
            tabs.add_child(b);
        }
        header.add_child(tabs);
        header.add_child(label(GLib.DateTime.new_now_local().format('%a %e %b').replace(/\s+/g, ' '), 'kiwi-notch-dash-date'));
        page.add_child(header);
        const holder = new St.Widget({
            style_class: 'kiwi-notch-dash-holder', layout_manager: new Clutter.BinLayout(),
            x_expand: true, y_expand: true, clip_to_allocation: true,
        });
        page.add_child(holder);
        this._dash = { page, buttons, holder, body: null, tab: null };
        this._fillDashboard(vm, ctx, false);
        return page;
    }

    _updateDashboard(vm, ctx) {
        this._stopTimers();
        this._fillDashboard(vm, ctx, vm.tab !== this._dash.tab);
        this._startLive(this._dash.page, this._dash.live);
    }

    // Build the tab body; on a tab switch the old body slides out and the new one in
    _fillDashboard(vm, ctx, animate) {
        const dash = this._dash;
        const from = dash.tab;
        dash.tab = vm.tab;
        for (const [tab, b] of dash.buttons)
            b.checked = tab === vm.tab;
        dash.live = [];
        const env = {
            _: this._, h: this._h, live: dash.live, alive: () => !this._destroyed,
            clockFormat: () => this._clockFormat(),
        };
        let body;
        try {
            body = vm.tab === 'tray' ? trayTab(env, { ...ctx, dropping: !!vm.dropping })
                : vm.tab === 'widgets' ? widgetsTab(env, ctx.widgets)
                    : nowTab(env, { ...ctx, activities: vm.activities });
        } catch (e) {
            console.error('[Kiwi] notch tab failed:', e);
            this._signature = null;
            body = new St.Widget();
        }
        const old = dash.body;
        dash.body = body;
        dash.holder.add_child(body);
        if (!old)
            return;
        const dir = tabDirection(from, vm.tab);
        if (!animate || dir === 0) {
            old.destroy();
            return;
        }
        this._retire(old, true, { translation_x: -dir * TAB_SLIDE });
        body.opacity = 0;
        body.translation_x = dir * TAB_SLIDE;
        this._motion.ease(body, { opacity: 255, translation_x: 0 }, { duration: 'medium', curve: 'emphasized' }, this._anim);
    }

    // ---- small pieces --------------------------------------------------------------------

    _row(styleClass) {
        return new St.BoxLayout({ style_class: `kiwi-notch-row ${styleClass}` });
    }

    _notificationIcon(notification) {
        return notification.gicon ?? notification.source?.icon ?? themed('dialog-information-symbolic');
    }

    // The music waveform: fixed-height bars scaled about their centre (transforms only, no
    // relayout), moving while playing when motion is allowed.
    _bars(playing) {
        const box = new St.BoxLayout({
            style_class: 'kiwi-notch-bars', y_align: Clutter.ActorAlign.CENTER,
        });
        const bars = [];
        for (let i = 0; i < BARS; i++) {
            const bar = new St.Widget({
                style_class: 'kiwi-notch-bar', height: BAR_HEIGHT, y_align: Clutter.ActorAlign.CENTER,
                pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
                scale_y: BAR_REST[i],
            });
            bars.push(bar);
            box.add_child(bar);
        }
        const env = this._motion.env;
        if (playing && env.animations && !env.reducedMotion) {
            this._barTimer = this._cleanup.timeout(BAR_TICK_MS, () => {
                for (let i = 0; i < bars.length; i++) {
                    const bar = bars[i];
                    if (bar.get_stage() === null)
                        return GLib.SOURCE_REMOVE;
                    bar.ease({
                        scale_y: BAR_FLOOR + Math.random() * (BAR_PEAK[i] - BAR_FLOOR),
                        duration: BAR_TICK_MS,
                        mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
                    });
                }
                return GLib.SOURCE_CONTINUE;
            }, { name: 'notch bars' });
        } else if (!playing) {
            box.add_style_class_name('kiwi-notch-bars-paused');
        }
        return box;
    }

    // Runs every function in `fns` now and then every `ms` (default a second) while `page` is
    // on screen.
    _startLive(page, fns, ms = LIVE_TICK_MS) {
        if (!fns.length)
            return;
        const run = () => fns.forEach(fn => {
            try {
                fn();
            } catch (e) {
                console.error('[Kiwi] notch refresh failed:', e);
            }
        });
        run();
        this._liveTimer = this._cleanup.timeout(ms, () => {
            if (this._destroyed || this._page !== page)
                return GLib.SOURCE_REMOVE;
            run();
            return GLib.SOURCE_CONTINUE;
        }, { name: 'notch live' });
    }

    _clockFormat() {
        try {
            this._interface ??= new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
            return this._interface.get_string('clock-format');
        } catch (_e) {
            return '24h';
        }
    }

    // ---- pills -----------------------------------------------------------------------------

    // Music like a compact Dynamic Island: tiny art at the left, the waveform at the right, the
    // title between them. Every other kind comes from pills.js.
    _activityPage(activity, ctx, live) {
        if (activity.kind === 'media' || activity.kind === 'media-paused' || !activity.kind) {
            const data = activity.data;
            const row = this._row('kiwi-notch-activity kiwi-notch-pill-media');
            row.add_child(artwork({ art: data.art, appIcon: ctx.media?.appIcon }, 20, 'kiwi-notch-artwork-small'));
            row.add_child(label(data.title, 'kiwi-notch-pill-title', { x_expand: true }));
            row.add_child(this._bars(data.playing));
            return row;
        }
        const page = pill(activity, { _: this._, live, onAction: this._h.onActivityAction });
        this._liveMs = tickMs(activity);
        if (this._liveMs === null)
            live.length = 0;
        return page;
    }

    _osdPage(osd) {
        const row = this._row('kiwi-notch-osd');
        const fallback = osd.kind === 'copied' ? 'edit-paste-symbolic' : 'audio-volume-high-symbolic';
        row.add_child(icon(osd.icon ?? themed(fallback), 16));
        const level = osd.level;
        if (level === null || level === undefined) {
            row.add_child(label(osd.label ?? '', 'kiwi-notch-pill-title', { x_expand: true }));
            return row;
        }
        const max = osd.maxLevel && osd.maxLevel > 0 ? osd.maxLevel : 1;
        const fraction = Math.max(0, Math.min(1, level / max));
        row.add_child(track('kiwi-notch-track', 'kiwi-notch-fill', 6, fraction));
        row.add_child(label(`${Math.round(level * 100)}`, 'kiwi-notch-value'));
        return row;
    }

    _compactPage(notification, badge) {
        const row = this._row('kiwi-notch-compact');
        if (!notification)
            return row;
        row.add_child(icon(this._notificationIcon(notification), 18));
        row.add_child(label(notification.title, 'kiwi-notch-pill-title', { x_expand: true }));
        if (badge > 0)
            row.add_child(label(`+${badge}`, 'kiwi-notch-badge'));
        return row;
    }

    // ---- notification card -------------------------------------------------------------------

    _cardPage(id, notification, badge) {
        const card = new St.BoxLayout({
            style_class: 'kiwi-notch-card',
            orientation: Clutter.Orientation.VERTICAL,
        });
        if (!notification)
            return card;

        const header = new St.BoxLayout({ style_class: 'kiwi-notch-card-header' });
        header.add_child(icon(this._notificationIcon(notification), 20, 'kiwi-notch-card-icon'));
        const app = notification.source?.title ?? '';
        const when = notification.datetime?.format?.('%H:%M') ?? '';
        header.add_child(label(app, 'kiwi-notch-card-app', { x_expand: true }));
        if (badge > 0)
            header.add_child(label(`+${badge}`, 'kiwi-notch-badge'));
        if (when)
            header.add_child(label(when, 'kiwi-notch-card-time'));
        const close = new St.Button({
            style_class: 'kiwi-notch-close',
            child: new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 12 }),
            can_focus: true,
            accessible_name: this._('Dismiss'),
            y_align: Clutter.ActorAlign.CENTER,
        });
        close.connect('clicked', () => this._h.onDismiss());
        header.add_child(close);
        card.add_child(header);

        card.add_child(label(notification.title, 'kiwi-notch-card-title'));
        const body = new St.Label({ style_class: 'kiwi-notch-card-body', x_expand: true, y_expand: true });
        body.clutter_text.line_wrap = true;
        body.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        const text = notification.body ?? '';
        // Same as the stock banner (messageList.js URLHighlighter, 48-51): fixMarkup keeps only
        // the tags notifications may use when the sender asked for markup, and escapes everything
        // otherwise, so the result is always safe for set_markup().
        try {
            body.clutter_text.set_markup(Util.fixMarkup(text, !!notification.useBodyMarkup));
        } catch (_e) {
            body.text = text;
        }
        card.add_child(body);

        const actions = (notification.actions ?? []).slice(0, 2);
        if (actions.length) {
            const row = new St.BoxLayout({ style_class: 'kiwi-notch-actions' });
            actions.forEach((action, index) => {
                const button = new St.Button({
                    style_class: 'kiwi-notch-action',
                    label: action.label,
                    can_focus: true,
                    x_expand: true,
                });
                button.connect('clicked', () => this._h.onAction(id, index));
                row.add_child(button);
            });
            card.add_child(row);
        }
        return card;
    }
}
