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

import Cairo from 'cairo';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

import { Glass } from '../../lib/glass.js';
import { SIZES } from './stateMachine.js';
import {
    dashboardLayout, cardSize, trackProgress, seekTarget, formatClock, moreCount, spring,
} from './dashboardModel.js';

// Motion. The shape moves on a damped spring (a little overshoot when it grows, none when it
// shrinks); the new content fades in once the shape is most of the way there, and the old
// content fades out at once so it never shows squeezed.
const GROW_SPRING = { bounce: 0.18, response: 0.42 };  // seconds
const SHRINK_SPRING = { bounce: 0, response: 0.3 };
const GROW_SETTLE_MS = 720;
const SHRINK_SETTLE_MS = 400;
const CONTENT_DELAY_MS = 190;    // ~ 90 % of the grow
const FADE_IN_MS = 200;
const FADE_OUT_MS = 90;
const LIVE_TICK_MS = 1000;       // clock and scrubber while the dashboard is open
const BARS = 4;
const BAR_TICK_MS = 300;
const BAR_REST = [6, 12, 9, 5];   // waveform heights when paused or without motion
const EAR_RADIUS = 10;   // the fillet where the notch meets the top edge, logical px

const label = (text, styleClass, opts = {}) => {
    const l = new St.Label({
        text: text ?? '',
        style_class: styleClass,
        y_align: Clutter.ActorAlign.CENTER,
        ...opts,
    });
    l.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return l;
};

const icon = (gicon, size, styleClass = 'kiwi-notch-icon', fallback = null) =>
    new St.Icon({
        gicon, icon_size: size, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER,
        // Shown if gicon cannot load (a remote cover art URL without GVfs, a missing file)
        fallback_gicon: fallback,
    });

function themed(name) {
    return new Gio.ThemedIcon({ name });
}

// Cover art: local files and http(s) URLs. St loads a FileIcon asynchronously through GIO
// (GVfs handles http/https), so nothing is downloaded on the main loop here.
function artIcon(url) {
    if (typeof url === 'string' && /^(file|https?):\/\//.test(url))
        return new Gio.FileIcon({ file: Gio.File.new_for_uri(url) });
    return null;
}

// Lays its one child out from the left edge at `fraction` of the width. Sizing the fill here,
// inside the allocation, avoids a relayout queued from an allocation handler.
const FractionLayout = GObject.registerClass(
class KiwiNotchFractionLayout extends Clutter.LayoutManager {
    constructor() {
        super();
        this.fraction = 0;
    }

    vfunc_get_preferred_width(_container, _forHeight) {
        return [0, 0];
    }

    vfunc_get_preferred_height(_container, _forWidth) {
        return [0, 0];
    }

    vfunc_allocate(container, box) {
        const f = Math.max(0, Math.min(1, this.fraction));
        const child = new Clutter.ActorBox();
        child.set_origin(box.x1, box.y1);
        child.set_size(Math.round(box.get_width() * f), box.get_height());
        for (const actor of container.get_children())
            actor.allocate(child);
    }
});

export class NotchView {
    /**
     * @param {CleanupRegistry} cleanup everything made here is released on dispose
     * @param {object} handlers {onClick, onDismiss, onHover(bool), onAction(id, index),
     *   onMedia('previous'|'toggle'|'next'), onToggleDnd, onCopy(entryId), onCollapse,
     *   onOpenNotification(notification), onOpenList, onSeek(fraction 0..1),
     *   getPosition(): Promise<number|null>}
     * @param {function(string): string} gettext
     */
    constructor(cleanup, handlers, gettext) {
        this._cleanup = cleanup;
        this._h = handlers;
        this._ = gettext;
        this._destroyed = false;
        this._signature = null;
        this._kind = null;
        this._page = null;
        this._barTimer = 0;
        this._liveTimer = 0;         // clock and scrubber refresh while the dashboard is open
        this._timeline = null;       // the spring of the shape
        this._timelineId = 0;
        this._size = SIZES.idle;
        this._glass = null;
        this._ears = null;
        this._glassShown = false;
        this._grab = null;          // Main.pushModal grab while the dashboard is open
        this._wantGrab = false;
        this._captureId = 0;
        this._pressOnSurface = false;

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
            // Pages keep the size of their target shape and stay centred while the island
            // springs around them (it clips), so text never reflows mid-animation.
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
            this._stopSpring();
            this._stopTimers();
            this._interface = null;
            this._releaseGrab();
            Main.layoutManager.removeChrome(this._island);
            this._island.destroy();
        });

        cleanup.connect(this._island, 'notify::hover', () => this._h.onHover(this._island.hover));
        cleanup.connect(this._island, 'notify::width', () => this._centerPages());
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
            if (event.get_button() === Clutter.BUTTON_SECONDARY)
                this._h.onDismiss();
            else
                this._h.onClick();
            return Clutter.EVENT_STOP;
        });
        cleanup.connect(Main.layoutManager, 'monitors-changed', () => this._place(this._size, false));

        this._addEars();
        this._attachGlass();
        this._place(SIZES.idle, false);
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

    /** Glass blur behind the large cards; the small pill is plain black. */
    _attachGlass() {
        try {
            this._glass = Glass.attach(this._island, {
                surface: 'overlays',
                parent: this._island.get_parent(),
                below: this._island,
                layers: 'blur',
                radius: 32,
                name: 'kiwi-notch-glass',
            });
            this._glass.setVisible(false);
            this._cleanup.add(() => {
                this._glass?.destroy();
                this._glass = null;
            });
        } catch (e) {
            console.error('[Kiwi] notch glass unavailable:', e);
        }
    }

    _monitor() {
        return Main.layoutManager.primaryMonitor;
    }

    /** Animations are on (GNOME setting, or forced by the Shell) and reduced motion is off */
    _motion() {
        return Glass.motion && (St.Settings.get().enable_animations || !!global.force_animations);
    }

    _stopSpring() {
        const tl = this._timeline;
        this._timeline = null;
        if (!tl)
            return;
        tl.disconnect(this._timelineId);
        this._timelineId = 0;
        tl.stop();
    }

    // Centred on the monitor, glued to its top edge
    // Centre the island at the top of its monitor. Called on every frame of the spring, so it
    // sets the actor directly and allocates nothing.
    _setGeometry(island, w, h) {
        const monitor = this._monitor();
        w = Math.round(w);
        island.set_position(monitor.x + Math.round((monitor.width - w) / 2), monitor.y);
        island.set_size(w, Math.round(h));
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
        island.remove_all_transitions();
        this._stopSpring();
        if (!animate || !this._motion() || !island.mapped) {
            this._setGeometry(island, size.w, size.h);
            return;
        }
        // A spring on a timeline (Clutter's easing modes have no spring). Each frame sets the
        // size from the curve; the ears follow through their snap constraints.
        const from = { w: island.width, h: island.height };
        const growing = size.w * size.h > from.w * from.h;
        const params = growing ? GROW_SPRING : SHRINK_SPRING;
        const settle = growing ? GROW_SETTLE_MS : SHRINK_SETTLE_MS;
        const tl = new Clutter.Timeline({ actor: island, duration: settle });
        this._timeline = tl;
        this._timelineId = tl.connect('new-frame', () => {
            const elapsed = tl.get_elapsed_time();
            const k = elapsed >= settle ? 1 : spring(elapsed / 1000, params);
            this._setGeometry(island, from.w + (size.w - from.w) * k, from.h + (size.h - from.h) * k);
            if (elapsed >= settle)
                this._stopSpring();
        });
        tl.connect('completed', () => {
            if (this._timeline === tl) {
                this._stopSpring();
                this._setGeometry(island, size.w, size.h);
            }
        });
        tl.start();
    }

    /** @param {boolean} show the island is on screen at all (bar visible, not hidden by fullscreen) */
    setShown(show) {
        if (this._destroyed)
            return;
        this._island.visible = show;
        this._syncGrab();
        this._glass?.setVisible(show && this._glassShown);
    }


    /**
     * @param {object} vm stateMachine.view(state)
     * @param {object} ctx {notification, media, dnd, count, recent, clipboard}
     */
    render(vm, ctx) {
        if (this._destroyed)
            return;
        const n = ctx.notification;
        const mediaPlain = ctx.media ? { ...ctx.media, appIcon: undefined } : null; // icons are not JSON
        const dashboard = vm.kind === 'expanded' && vm.content === 'dashboard';
        const signature = JSON.stringify([
            vm.kind, vm.content, vm.notificationId, vm.badge,
            vm.activity?.data ?? null, vm.osd?.kind, vm.osd?.level, vm.osd?.label,
            dashboard
                ? [mediaPlain, ctx.dnd, ctx.count, ctx.clipboard,
                    (ctx.recent ?? []).map(r => [r.title, r.app, r.when, r.body])]
                : null,
            n ? [n.title, n.body, n.actions?.length ?? 0] : null,
        ]);
        if (signature === this._signature)
            return;
        const shapeChanged = this._kind !== vm.kind || this._content !== vm.content;
        this._signature = signature;
        this._kind = vm.kind;
        this._content = vm.content;

        const layout = dashboard ? this._dashboardLayout(ctx) : null;
        let size = layout?.size ?? vm.size;
        if (vm.kind === 'expanded' && !dashboard && n)
            size = cardSize({ actions: (n.actions?.length ?? 0) > 0 });
        const growing = size.w * size.h > this._island.width * this._island.height;
        const motion = this._motion();

        this._glassShown = vm.kind === 'expanded';
        this._glass?.setVisible(this._island.visible && this._glassShown);
        this._place(size, true);
        this._wantGrab = dashboard;
        this._syncGrab();

        const old = this._page;
        this._page = null;
        this._stopTimers();
        if (old)
            this._retire(old, motion && shapeChanged);
        let page;
        try {
            page = this._build(vm, ctx, layout);
        } catch (e) {
            // Never leave a half-built page behind; draw an empty pill and retry next time.
            console.error('[Kiwi] notch page failed:', e);
            this._stopTimers();
            this._signature = null;
            page = new St.Widget();
        }
        this._page = page;
        page.set_size(size.w, size.h);
        this._island.add_child(page);
        this._centerPages();
        if (motion && shapeChanged) {
            // The content arrives once the shape is nearly there; a slight drop from above
            // reads as coming out of the notch.
            page.opacity = 0;
            page.translation_y = growing ? -6 : 0;
            page.ease({
                opacity: 255,
                translation_y: 0,
                delay: growing ? CONTENT_DELAY_MS : 40,
                duration: FADE_IN_MS,
                mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            });
        }
    }

    _dashboardLayout(ctx) {
        const rows = (ctx.recent ?? []).length;
        return dashboardLayout({
            media: !!ctx.media,
            rows,
            more: moreCount(ctx.count, rows) > 0,
            clipboard: !!ctx.clipboard,
            clipRows: ctx.clipboard?.length ?? 0,
        });
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
    _retire(old, fade) {
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
        let gone = false;
        old.connect('destroy', () => {
            gone = true;
        });
        old.ease({
            opacity: 0,
            duration: FADE_OUT_MS,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => {
                if (!gone && !this._destroyed)
                    old.destroy();
            },
        });
    }

    _build(vm, ctx, layout) {
        switch (vm.kind) {
        case 'live-activity': return this._activityPage(vm.activity.data, ctx);
        case 'osd': return this._osdPage(vm.osd);
        case 'compact': return this._compactPage(ctx.notification, vm.badge);
        case 'expanded':
            return vm.content === 'dashboard'
                ? this._dashboardPage(ctx, layout)
                : this._cardPage(vm.notificationId, ctx.notification, vm.badge);
        default:
            return new St.Widget();
        }
    }

    // ---- small pieces --------------------------------------------------------------------

    _row(styleClass) {
        return new St.BoxLayout({ style_class: `kiwi-notch-row ${styleClass}` });
    }

    _notificationIcon(notification) {
        return notification.gicon ?? notification.source?.icon ?? themed('dialog-information-symbolic');
    }

    /**
     * Cover art with rounded corners. A local file is drawn as the background of a rounded
     * box (St clips a background image to its border radius); a remote URL loads through GIO
     * as an icon; without art the app icon sits on a soft tile.
     */
    _artwork(media, size, styleClass) {
        const url = media?.art;
        const bin = new St.Bin({
            style_class: `kiwi-notch-artwork ${styleClass}`,
            width: size, height: size,
            y_align: Clutter.ActorAlign.CENTER,
        });
        if (typeof url === 'string' && url.startsWith('file://') && !/["\\]/.test(url)) {
            bin.style = `background-image: url("${url}"); background-size: cover;`;
            return bin;
        }
        const plain = media?.appIcon ?? themed('audio-x-generic-symbolic');
        const remote = artIcon(url);
        if (remote) {
            bin.add_style_class_name('kiwi-notch-artwork-remote');
            bin.set_child(icon(remote, size, 'kiwi-notch-art', plain));
        } else {
            bin.add_style_class_name('kiwi-notch-artwork-empty');
            bin.set_child(icon(plain, Math.round(size * 0.5), 'kiwi-notch-icon'));
        }
        return bin;
    }

    // The live-activity waveform: bars that move while playing (only with motion allowed)
    _bars(playing) {
        const box = new St.BoxLayout({
            style_class: 'kiwi-notch-bars', y_align: Clutter.ActorAlign.CENTER,
        });
        const bars = [];
        for (let i = 0; i < BARS; i++) {
            const bar = new St.Widget({
                style_class: 'kiwi-notch-bar', height: BAR_REST[i], y_align: Clutter.ActorAlign.CENTER,
            });
            bars.push(bar);
            box.add_child(bar);
        }
        if (playing && this._motion()) {
            const peak = [10, 16, 14, 9];
            this._barTimer = this._cleanup.timeout(BAR_TICK_MS, () => {
                for (let i = 0; i < bars.length; i++) {
                    const bar = bars[i];
                    if (bar.get_stage() === null)
                        return GLib.SOURCE_REMOVE;
                    bar.ease({
                        height: 4 + Math.round(Math.random() * (peak[i] - 4)),
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

    // Runs every function in `fns` now and then every second while `page` is on screen.
    _startLive(page, fns) {
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
        this._liveTimer = this._cleanup.timeout(LIVE_TICK_MS, () => {
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

    // Like a compact live activity: tiny art at the left, the waveform at the right, the
    // title between them (ellipsized, so it shows only as far as there is room).
    _activityPage(data, ctx) {
        const row = this._row('kiwi-notch-activity');
        row.add_child(this._artwork({ art: data.art, appIcon: ctx.media?.appIcon }, 20, 'kiwi-notch-artwork-small'));
        row.add_child(label(data.title, 'kiwi-notch-pill-title', { x_expand: true }));
        row.add_child(this._bars(data.playing));
        return row;
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
        row.add_child(this._track('kiwi-notch-track', 'kiwi-notch-fill', 6, fraction));
        row.add_child(label(`${Math.round(level * 100)}`, 'kiwi-notch-value'));
        return row;
    }

    /** A bar with a fill. Returns the track; `track.kiwiSetFraction(f)` moves the fill. */
    _track(trackClass, fillClass, height, fraction) {
        const layout = new FractionLayout();
        layout.fraction = fraction;
        const track = new St.Widget({
            style_class: trackClass, x_expand: true, y_align: Clutter.ActorAlign.CENTER, height,
            layout_manager: layout,
        });
        track.add_child(new St.Widget({ style_class: fillClass }));
        track.kiwiSetFraction = f => {
            layout.fraction = f;
            layout.layout_changed();
        };
        return track;
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

    // ---- dashboard ---------------------------------------------------------------------------
    // A 32px header level with the top bar (date at the left, Do Not Disturb at the right),
    // then the columns on one grid: equal outer padding, tops aligned. See dashboardModel.js.

    _dashboardPage(ctx, layout) {
        const page = new St.BoxLayout({
            style_class: 'kiwi-notch-dash',
            orientation: Clutter.Orientation.VERTICAL,
        });
        const live = [];

        const header = new St.BoxLayout({ style_class: 'kiwi-notch-dash-header' });
        const date = label('', 'kiwi-notch-dash-date', { x_expand: true });
        if (layout.mode === 'media')
            live.push(() => (date.text = GLib.DateTime.new_now_local().format('%a %e %b').replace(/\s+/g, ' ')));
        header.add_child(date);
        header.add_child(this._dndButton(ctx.dnd));
        page.add_child(header);

        const body = new St.BoxLayout({ style_class: 'kiwi-notch-dash-body', y_expand: true });
        body.add_child(layout.mode === 'media'
            ? this._mediaColumn(ctx.media, layout.widths.media, live)
            : this._clockColumn(layout.widths.clock, live));
        body.add_child(this._listColumn(ctx, layout.widths.list));
        if (ctx.clipboard)
            body.add_child(this._clipboardColumn(ctx.clipboard, layout.widths.clipboard));
        page.add_child(body);

        this._startLive(page, live);
        return page;
    }

    // A small moon in the corner; the look follows the state, the behaviour is the router's.
    _dndButton(on) {
        const button = new St.Button({
            style_class: 'kiwi-notch-dnd',
            child: new St.Icon({ icon_name: 'weather-clear-night-symbolic', icon_size: 16 }),
            can_focus: true,
            toggle_mode: true,
            checked: !!on,
            accessible_name: this._('Do Not Disturb'),
            y_align: Clutter.ActorAlign.CENTER,
        });
        button.connect('clicked', () => this._h.onToggleDnd());
        return button;
    }

    _column(styleClass, width) {
        return new St.BoxLayout({
            style_class: `kiwi-notch-col ${styleClass}`,
            orientation: Clutter.Orientation.VERTICAL,
            width,
        });
    }

    _mediaColumn(media, width, live) {
        const col = this._column('kiwi-notch-media', width);
        let alive = true;
        col.connect('destroy', () => {
            alive = false;
        });

        // Art, title and artist, the app icon in the top-right corner
        const top = new St.BoxLayout({ style_class: 'kiwi-notch-media-top' });
        top.add_child(this._artwork(media, 68, 'kiwi-notch-artwork-large'));
        const text = new St.BoxLayout({
            style_class: 'kiwi-notch-media-text',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        text.add_child(label(media.title || this._('Unknown title'), 'kiwi-notch-media-title'));
        if (media.artist)
            text.add_child(label(media.artist, 'kiwi-notch-media-artist'));
        top.add_child(text);
        if (media.appIcon) {
            top.add_child(new St.Icon({
                gicon: media.appIcon, icon_size: 16,
                style_class: 'kiwi-notch-media-app', y_align: Clutter.ActorAlign.START,
            }));
        }
        col.add_child(top);

        // The scrubber, when the player reports a length (and then a position)
        const hasLength = Number.isFinite(media.length) && media.length > 0;
        const scrub = new St.BoxLayout({ style_class: 'kiwi-notch-scrub', visible: hasLength, opacity: 0 });
        const elapsed = label('', 'kiwi-notch-scrub-time');
        const remaining = label('', 'kiwi-notch-scrub-time kiwi-notch-scrub-remaining');
        const track = this._track('kiwi-notch-scrub-track', 'kiwi-notch-scrub-fill', 4, 0);
        // A click on the bar seeks there. It is a button so the press stays with it and does
        // not count as a click on the notch (which would close the dashboard).
        const seekable = hasLength && !!media.canSeek && !!this._h.onSeek;
        const hit = new St.Button({
            style_class: 'kiwi-notch-scrub-hit',
            child: track,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            reactive: seekable,
            can_focus: false,
            accessible_name: this._('Seek'),
        });
        hit.connect('clicked', () => {
            const [px] = global.get_pointer();
            const [tx] = track.get_transformed_position();
            const [tw] = track.get_transformed_size();
            if (!(tw > 0))
                return;
            const fraction = (px - tx) / tw;
            if (seekTarget(fraction, media.length) === null)
                return;
            track.kiwiSetFraction(Math.max(0, Math.min(1, fraction)));
            this._h.onSeek(fraction);
        });
        scrub.add_child(elapsed);
        scrub.add_child(hit);
        scrub.add_child(remaining);
        col.add_child(scrub);
        if (hasLength && this._h.getPosition) {
            live.push(() => {
                this._h.getPosition().then(position => {
                    if (!alive || this._destroyed)
                        return;
                    const p = trackProgress(position, media.length);
                    scrub.opacity = p ? 255 : 0;
                    if (!p)
                        return;
                    elapsed.text = p.elapsed;
                    remaining.text = p.remaining;
                    track.kiwiSetFraction(p.fraction);
                }).catch(() => {});
            });
        }

        // Previous, play / pause, next
        const controls = new St.BoxLayout({
            style_class: 'kiwi-notch-controls', x_align: Clutter.ActorAlign.CENTER,
        });
        const control = (name, symbolic, command, enabled, size) => {
            const button = new St.Button({
                style_class: 'kiwi-notch-control',
                child: new St.Icon({ icon_name: symbolic, icon_size: size }),
                can_focus: enabled,
                reactive: enabled,
                opacity: enabled ? 255 : 90,
                accessible_name: name,
            });
            button.connect('clicked', () => this._h.onMedia(command));
            controls.add_child(button);
        };
        control(this._('Previous'), 'media-skip-backward-symbolic', 'previous', media.canPrevious, 20);
        control(media.playing ? this._('Pause') : this._('Play'),
            media.playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic',
            'toggle', true, 24);
        control(this._('Next'), 'media-skip-forward-symbolic', 'next', media.canNext, 20);
        col.add_child(controls);
        return col;
    }

    // Nothing is playing: a large clock and the date in place of the player
    _clockColumn(width, live) {
        const col = this._column('kiwi-notch-clock', width);
        const row = new St.BoxLayout({ style_class: 'kiwi-notch-clock-row' });
        const time = new St.Label({ style_class: 'kiwi-notch-clock-time' });
        const suffix = new St.Label({ style_class: 'kiwi-notch-clock-suffix', y_align: Clutter.ActorAlign.END });
        row.add_child(time);
        row.add_child(suffix);
        col.add_child(row);
        const day = label('', 'kiwi-notch-clock-date');
        col.add_child(day);
        live.push(() => {
            const now = GLib.DateTime.new_now_local();
            const c = formatClock(now.get_hour(), now.get_minute(), this._clockFormat());
            time.text = c.time;
            suffix.text = c.suffix;
            suffix.visible = !!c.suffix;
            day.text = now.format('%A, %e %B').replace(/\s+/g, ' ');
        });
        return col;
    }

    _listColumn(ctx, width) {
        const col = this._column('kiwi-notch-list', width);
        const recent = ctx.recent ?? [];
        if (!recent.length) {
            col.add_child(label(this._('No notifications'), 'kiwi-notch-empty-text kiwi-notch-list-empty', {
                x_align: Clutter.ActorAlign.CENTER,
            }));
        }
        for (const item of recent) {
            const button = new St.Button({
                style_class: 'kiwi-notch-recent',
                can_focus: true,
                x_expand: true,
                x_align: Clutter.ActorAlign.FILL,
                accessible_name: item.title,
            });
            const row = new St.BoxLayout({ style_class: 'kiwi-notch-recent-row', x_expand: true });
            row.add_child(icon(item.gicon ?? themed('dialog-information-symbolic'), 20, 'kiwi-notch-recent-icon'));
            const text = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER,
            });
            const line = new St.BoxLayout({ style_class: 'kiwi-notch-recent-line' });
            line.add_child(label(item.title, 'kiwi-notch-recent-title', { x_expand: true }));
            if (item.when)
                line.add_child(label(item.when, 'kiwi-notch-recent-time'));
            text.add_child(line);
            const body = (item.body ?? '').replace(/\s+/g, ' ').trim();
            if (body || item.app) {
                const sub = label('', 'kiwi-notch-recent-sub');
                // Like the card: the body may carry markup (Rhythmbox sends
                // "by <i>Artist</i>"); fixMarkup keeps the allowed tags and escapes the rest.
                try {
                    sub.clutter_text.set_markup(body
                        ? Util.fixMarkup(body, !!item.markup)
                        : Util.fixMarkup(item.app, false));
                } catch (_e) {
                    sub.text = body || item.app;
                }
                text.add_child(sub);
            }
            row.add_child(text);
            button.set_child(row);
            button.connect('clicked', () => this._h.onOpenNotification?.(item.notification));
            col.add_child(button);
        }
        const more = moreCount(ctx.count, recent.length);
        if (more > 0) {
            const button = new St.Button({
                style_class: 'kiwi-notch-more',
                label: this._('%d more').format(more),
                can_focus: true,
                x_align: Clutter.ActorAlign.START,
            });
            button.connect('clicked', () => this._h.onOpenList?.());
            col.add_child(button);
        }
        return col;
    }

    // Clipboard history (null while the clipboard feature or its notch option is off)
    _clipboardColumn(entries, width) {
        const col = this._column('kiwi-notch-clipboard', width);
        col.add_child(label(this._('Clipboard'), 'kiwi-notch-caption'));
        if (!entries.length)
            col.add_child(label(this._('Nothing copied yet'), 'kiwi-notch-empty-text'));
        for (const entry of entries) {
            const button = new St.Button({
                style_class: 'kiwi-notch-clip',
                accessible_name: entry.text,
                can_focus: true,
                x_expand: true,
                x_align: Clutter.ActorAlign.FILL,
                child: label(entry.text, 'kiwi-notch-clip-text'),
            });
            button.connect('clicked', () => this._h.onCopy(entry.id));
            col.add_child(button);
        }
        return col;
    }
}
