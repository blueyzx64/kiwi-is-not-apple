// SPDX-License-Identifier: GPL-3.0-or-later
// The notch actors. No state logic: index.js feeds render() the view model from
// stateMachine.view() plus what the pages need to show, and gets clicks back through handlers.
//
//   - `placeholder` sits in the panel's centre box (PanelLayout) and only reserves room.
//   - `island` is the black pill. It lives in the top chrome so it can grow below the bar and
//     take input there. It is centred on the primary monitor and glued to its top edge.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

import { Glass } from '../../lib/glass.js';
import { SIZES } from './stateMachine.js';

const GROW_MS = 450;     // spring with a little overshoot
const SHRINK_MS = 260;   // ease-out
const FADE_MS = 160;
const BARS = 3;
const BAR_TICK_MS = 380;

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

export class NotchView {
    /**
     * @param {CleanupRegistry} cleanup everything made here is released on dispose
     * @param {object} handlers {onClick, onDismiss, onHover(bool), onAction(id, index),
     *   onMedia('previous'|'toggle'|'next'), onToggleDnd, onCopy(entryId), onCollapse,
     *   onOpenNotification(notification)}
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
        this._size = SIZES.idle;
        this._glass = null;
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
            layout_manager: new Clutter.BinLayout(),
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
            this._releaseGrab();
            Main.layoutManager.removeChrome(this._island);
            this._island.destroy();
        });

        cleanup.connect(this._island, 'notify::hover', () => this._h.onHover(this._island.hover));
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

    _place(size, animate) {
        if (this._destroyed)
            return;
        this._size = size;
        const monitor = this._monitor();
        if (!monitor)
            return;
        const x = Math.round(monitor.x + (monitor.width - size.w) / 2);
        const y = monitor.y;
        const island = this._island;
        island.style = `border-radius: 0 0 ${size.r}px ${size.r}px;`;
        island.remove_all_transitions();
        if (!animate || !Glass.motion || !island.mapped) {
            island.set({ x, y, width: size.w, height: size.h });
            return;
        }
        const growing = size.w * size.h > island.width * island.height;
        island.ease({
            x, y, width: size.w, height: size.h,
            duration: growing ? GROW_MS : SHRINK_MS,
            mode: growing ? Clutter.AnimationMode.EASE_OUT_BACK : Clutter.AnimationMode.EASE_OUT_QUAD,
        });
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
     * @param {object} ctx {notification, media, dnd, count}
     */
    render(vm, ctx) {
        if (this._destroyed)
            return;
        const n = ctx.notification;
        const mediaPlain = ctx.media ? { ...ctx.media, appIcon: undefined } : null; // icons are not JSON
        const signature = JSON.stringify([
            vm.kind, vm.content, vm.notificationId, vm.badge,
            vm.activity?.data ?? null, vm.osd?.kind, vm.osd?.level, vm.osd?.label,
            vm.content === 'dashboard'
                ? [mediaPlain, ctx.dnd, ctx.count, ctx.clipboard, (ctx.recent ?? []).map(r => [r.title, r.app, r.when])]
                : null,
            n ? [n.title, n.body, n.actions?.length ?? 0] : null,
        ]);
        if (signature === this._signature)
            return;
        const kindChanged = this._kind !== vm.kind;
        this._signature = signature;
        this._kind = vm.kind;

        this._glassShown = vm.kind === 'expanded';
        this._glass?.setVisible(this._island.visible && this._glassShown);
        this._place(vm.size, true);
        this._wantGrab = vm.kind === 'expanded' && vm.content === 'dashboard';
        this._syncGrab();

        const old = this._page;
        this._page = null;
        old?.destroy();
        if (this._barTimer)
            this._cleanup.release(this._barTimer);
        this._barTimer = 0;
        let page;
        try {
            page = this._build(vm, ctx);
        } catch (e) {
            // Never leave a half-built page behind; draw an empty pill and retry next time.
            console.error('[Kiwi] notch page failed:', e);
            if (this._barTimer)
                this._cleanup.release(this._barTimer);
            this._barTimer = 0;
            this._signature = null;
            page = new St.Widget({ x_expand: true, y_expand: true });
        }
        this._page = page;
        this._island.add_child(page);
        if (Glass.motion && kindChanged) {
            page.opacity = 0;
            page.ease({
                opacity: 255,
                delay: Math.round(GROW_MS * 0.4),
                duration: FADE_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
    }

    _build(vm, ctx) {
        switch (vm.kind) {
        case 'live-activity': return this._activityPage(vm.activity.data, ctx);
        case 'osd': return this._osdPage(vm.osd);
        case 'compact': return this._compactPage(ctx.notification, vm.badge);
        case 'expanded':
            return vm.content === 'dashboard'
                ? this._dashboardPage(ctx)
                : this._cardPage(vm.notificationId, ctx.notification, vm.badge);
        default:
            return new St.Widget({ x_expand: true, y_expand: true });
        }
    }

    // ---- pages ---------------------------------------------------------------------------

    _row(styleClass) {
        return new St.BoxLayout({
            style_class: `kiwi-notch-row ${styleClass}`,
            x_expand: true, y_expand: true,
            y_align: Clutter.ActorAlign.FILL,
        });
    }

    _activityPage(data, ctx) {
        const row = this._row('kiwi-notch-activity');
        const art = artIcon(data.art);
        const plain = ctx.media?.appIcon ?? themed('audio-x-generic-symbolic');
        row.add_child(icon(art ?? plain, 20, 'kiwi-notch-art', art ? plain : null));
        row.add_child(label(data.title, 'kiwi-notch-title', { x_expand: true }));
        row.add_child(this._bars(data.playing));
        return row;
    }

    // Equalizer glyph; the bars move only while playing and only when animations are allowed.
    _bars(playing) {
        const box = new St.BoxLayout({
            style_class: 'kiwi-notch-bars', y_align: Clutter.ActorAlign.CENTER,
        });
        const bars = [];
        for (let i = 0; i < BARS; i++) {
            const bar = new St.Widget({ style_class: 'kiwi-notch-bar', height: 6 + i * 3 % 9 });
            bars.push(bar);
            box.add_child(bar);
        }
        if (playing && Glass.motion) {
            this._barTimer = this._cleanup.timeout(BAR_TICK_MS, () => {
                for (const bar of bars) {
                    if (bar.get_stage() === null)
                        return GLib.SOURCE_REMOVE;
                    bar.ease({
                        height: 4 + Math.floor(Math.random() * 12),
                        duration: BAR_TICK_MS,
                        mode: Clutter.AnimationMode.EASE_IN_OUT_QUAD,
                    });
                }
                return GLib.SOURCE_CONTINUE;
            }, { name: 'notch bars' });
        }
        return box;
    }

    _osdPage(osd) {
        const row = this._row('kiwi-notch-osd');
        const fallback = osd.kind === 'copied' ? 'edit-paste-symbolic' : 'audio-volume-high-symbolic';
        row.add_child(icon(osd.icon ?? themed(fallback), 16));
        const level = osd.level;
        if (level === null || level === undefined) {
            row.add_child(label(osd.label ?? '', 'kiwi-notch-title', { x_expand: true }));
            return row;
        }
        const max = osd.maxLevel && osd.maxLevel > 0 ? osd.maxLevel : 1;
        const fraction = Math.max(0, Math.min(1, level / max));
        const track = new St.Widget({
            style_class: 'kiwi-notch-track', x_expand: true, y_align: Clutter.ActorAlign.CENTER, height: 6,
        });
        const fill = new St.Widget({ style_class: 'kiwi-notch-fill', height: 6 });
        track.add_child(fill);
        const sync = () => fill.set_size(Math.round(track.width * fraction), track.height);
        track.connect('notify::allocation', sync);
        row.add_child(track);
        row.add_child(label(`${Math.round(level * 100)}`, 'kiwi-notch-value'));
        return row;
    }

    _compactPage(notification, badge) {
        const row = this._row('kiwi-notch-compact');
        if (!notification)
            return row;
        row.add_child(icon(this._notificationIcon(notification), 18));
        row.add_child(label(notification.title, 'kiwi-notch-title', { x_expand: true }));
        if (badge > 0)
            row.add_child(label(`+${badge}`, 'kiwi-notch-badge'));
        return row;
    }

    _notificationIcon(notification) {
        return notification.gicon ?? notification.source?.icon ?? themed('dialog-information-symbolic');
    }

    _cardPage(id, notification, badge) {
        const card = new St.BoxLayout({
            style_class: 'kiwi-notch-card',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, y_expand: true,
        });
        if (!notification)
            return card;

        const header = new St.BoxLayout({ style_class: 'kiwi-notch-card-header' });
        header.add_child(icon(this._notificationIcon(notification), 20));
        const app = notification.source?.title ?? '';
        const when = notification.datetime?.format?.('%H:%M') ?? '';
        header.add_child(label([app, when].filter(Boolean).join(' · '), 'kiwi-notch-meta', { x_expand: true }));
        if (badge > 0)
            header.add_child(label(`+${badge}`, 'kiwi-notch-badge'));
        const close = new St.Button({
            style_class: 'kiwi-notch-close',
            child: new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 12 }),
            can_focus: true,
            accessible_name: this._('Dismiss'),
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

    _dashboardPage(ctx) {
        const page = new St.BoxLayout({ style_class: 'kiwi-notch-dashboard', x_expand: true, y_expand: true });

        const media = new St.BoxLayout({ style_class: 'kiwi-notch-panel', orientation: Clutter.Orientation.VERTICAL, x_expand: true });
        media.add_child(label(this._('Now Playing'), 'kiwi-notch-meta'));
        if (ctx.media) {
            const head = new St.BoxLayout({ style_class: 'kiwi-notch-nowplaying' });
            const art = artIcon(ctx.media.art);
            const plain = ctx.media.appIcon ?? themed('audio-x-generic-symbolic');
            head.add_child(icon(art ?? plain, 48, 'kiwi-notch-art-large', art ? plain : null));
            const text = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER });
            text.add_child(label(ctx.media.title, 'kiwi-notch-card-title'));
            text.add_child(label(ctx.media.artist, 'kiwi-notch-meta'));
            head.add_child(text);
            media.add_child(head);
            const controls = new St.BoxLayout({ style_class: 'kiwi-notch-controls', x_align: Clutter.ActorAlign.CENTER });
            const control = (name, symbolic, command, enabled) => {
                const button = new St.Button({
                    style_class: 'kiwi-notch-control',
                    child: new St.Icon({ icon_name: symbolic, icon_size: 18 }),
                    can_focus: true,
                    reactive: enabled,
                    opacity: enabled ? 255 : 90,
                    accessible_name: name,
                });
                button.connect('clicked', () => this._h.onMedia(command));
                controls.add_child(button);
            };
            control(this._('Previous'), 'media-skip-backward-symbolic', 'previous', ctx.media.canPrevious);
            control(ctx.media.playing ? this._('Pause') : this._('Play'),
                ctx.media.playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic',
                'toggle', true);
            control(this._('Next'), 'media-skip-forward-symbolic', 'next', ctx.media.canNext);
            media.add_child(controls);
        } else {
            media.add_child(label(this._('Nothing is playing'), 'kiwi-notch-title'));
        }
        page.add_child(media);

        const notifications = new St.BoxLayout({ style_class: 'kiwi-notch-panel', orientation: Clutter.Orientation.VERTICAL, x_expand: true });
        notifications.add_child(label(this._('Notifications'), 'kiwi-notch-meta'));
        const recent = ctx.recent ?? [];
        if (!recent.length)
            notifications.add_child(label(this._('No notifications'), 'kiwi-notch-title'));
        for (const item of recent) {
            const button = new St.Button({
                style_class: 'kiwi-notch-clip kiwi-notch-recent',
                can_focus: true,
                x_expand: true,
                x_align: Clutter.ActorAlign.FILL,
                accessible_name: item.title,
            });
            const row = new St.BoxLayout({ style_class: 'kiwi-notch-recent-row', x_expand: true });
            row.add_child(icon(item.gicon ?? themed('dialog-information-symbolic'), 16));
            const text = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
            text.add_child(label(item.title, 'kiwi-notch-title'));
            text.add_child(label([item.app, item.when].filter(Boolean).join(' · '), 'kiwi-notch-meta'));
            row.add_child(text);
            button.set_child(row);
            button.connect('clicked', () => this._h.onOpenNotification?.(item.notification));
            notifications.add_child(button);
        }
        if (ctx.count > recent.length) {
            notifications.add_child(label(
                this._('%d more in the message list').format(ctx.count - recent.length), 'kiwi-notch-meta'));
        }
        const dnd = new St.Button({
            style_class: 'kiwi-notch-action',
            label: ctx.dnd ? this._('Do Not Disturb: on') : this._('Do Not Disturb: off'),
            can_focus: true,
            x_align: Clutter.ActorAlign.START,
            toggle_mode: true,
            checked: ctx.dnd,
        });
        dnd.connect('clicked', () => this._h.onToggleDnd());
        notifications.add_child(dnd);
        page.add_child(notifications);

        // Clipboard history (null while the clipboard feature is off: no panel)
        if (ctx.clipboard) {
            const clip = new St.BoxLayout({ style_class: 'kiwi-notch-panel', orientation: Clutter.Orientation.VERTICAL, x_expand: true });
            clip.add_child(label(this._('Clipboard'), 'kiwi-notch-meta'));
            if (!ctx.clipboard.length)
                clip.add_child(label(this._('Nothing copied yet'), 'kiwi-notch-title'));
            for (const entry of ctx.clipboard) {
                const button = new St.Button({
                    style_class: 'kiwi-notch-clip',
                    can_focus: true,
                    x_expand: true,
                    x_align: Clutter.ActorAlign.FILL,
                    child: label(entry.text, 'kiwi-notch-title'),
                });
                button.connect('clicked', () => this._h.onCopy(entry.id));
                clip.add_child(button);
            }
            page.add_child(clip);
        }
        return page;
    }
}
