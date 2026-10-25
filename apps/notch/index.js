// SPDX-License-Identifier: GPL-3.0-or-later
// Notification notch: a black pill in the centre of the top bar that grows to show
// notifications, live activities (media) and volume / brightness confirmations, and opens a
// small dashboard on click.
//
// This file is the imperative shell. The decisions live in stateMachine.js (pure, tested);
// the actors in view.js. What this file wires:
//   - NotificationRouter.setBannerSink  stock banners go to the notch, history stays in the
//                                       calendar menu (key notch-notifications)
//   - MprisWatcher                      media live activity + dashboard (notch-live-activities)
//   - Main.osdWindowManager._showOsdWindow  volume / brightness OSD (notch-osd)
//   - PanelLayout.claim 'notch'         room in the centre box
// Every part undoes itself through the CleanupRegistry; stock banners and OSD come back.

import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import { CleanupRegistry } from '../../lib/disposables.js';
import { KiwiSettings } from '../../lib/settings.js';
import { canDivertOsd, setUnredirectAllowed, requeueBanner, kickTray } from '../../lib/compat.js';
import { PanelLayout } from '../../coordinators/panelLayout.js';
import { NotificationRouter } from '../../coordinators/notificationRouter.js';
import { MprisWatcher } from '../../coordinators/mprisWatcher.js';
import { clipboardService } from '../clipboard/index.js';
import {
    initialState, step, view, nextDeadline, wantsBar, recentNotifications, URGENCY,
} from './stateMachine.js';
import { NotchView } from './view.js';

const MEDIA_KEY = 'media';
const HIGH_FACTOR = 1.6;     // high-urgency cards stay this much longer than normal ones
const RECENT_LIMIT = 2;      // notifications listed in the dashboard

const nowMs = () => Math.floor(GLib.get_monotonic_time() / 1000);

function mediaInfo(player) {
    return {
        busName: player.busName,
        title: player.trackTitle ?? '',
        artist: (player.trackArtists ?? []).join(', '),
        art: player.trackCoverUrl,
        length: player.length ?? null,
        playing: player.isPlaying(),
        canPrevious: player.canGoPrevious,
        canNext: player.canGoNext,
    };
}

export class NotchFeature {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._state = initialState(nowMs());
        this._alive = false;
        this._overFullscreen = false;
        this._deadlineToken = 0;
        this._parts = { sink: null, osd: null, media: null };
        this._watch = null;
    }

    enable() {
        const { settings, gettext } = this._ctx;
        const cleanup = this._cleanup;
        this._alive = true;
        cleanup.add(() => this._teardown());

        const ks = this._ks = new KiwiSettings(settings);
        ks.attach(cleanup);

        this._notifications = new Map();       // id -> Notification
        this._notificationIds = new WeakMap();  // Notification -> id
        this._notificationSignals = new Map();  // Notification -> handler id
        this._shown = new Set();                // ids that have been on screen
        this._nextId = 1;
        cleanup.add(() => this._forgetNotifications());

        this._view = new NotchView(cleanup, {
            onClick: () => this._dispatch({ type: 'click' }),
            onDismiss: () => this._dispatch({ type: 'dismiss' }),
            onHover: value => this._dispatch({ type: 'hover', value }),
            onAction: (id, index) => this._action(id, index),
            onMedia: command => this._media(command),
            onCopy: id => {
                const service = clipboardService();
                const entry = service?.get(id);
                if (entry)
                    service.copy(entry);
            },
            onToggleDnd: () => NotificationRouter.setDnd(!NotificationRouter.state().dnd),
            onCollapse: () => this._dispatch({ type: 'collapse' }),
            onOpenNotification: notification => this._openNotification(notification),
            onOpenList: () => this._openMessageList(),
            getPosition: () => this._bestPlayer()?.position ?? Promise.resolve(null),
        }, gettext);

        // Room in the centre of the bar so the clock and others keep clear of the pill
        PanelLayout.claim(cleanup, { id: 'notch', actor: this._view.placeholder, box: 'center' });

        // Shared inputs
        NotificationRouter.connect(cleanup, () => this._syncExternal());
        cleanup.connect(global.display, 'in-fullscreen-changed', () => this._syncExternal());
        this._syncExternal(true);

        // The clipboard feature can start or stop after the notch
        this._clipSvc = null;
        this._clipOff = [];
        ks.watch('notch-show-clipboard', () => this._sync());
        ks.watch('clipboard-history', () => cleanup.idle(() => this._syncClipboard(), { name: 'notch clipboard' }));
        cleanup.add(() => this._dropClipboard());
        this._syncClipboard();

        // The three features can be switched one by one
        // Each part has its own registry, so switching one never touches the others.
        this._applySink();
        this._applyOsd();
        this._applyMedia();
        const part = (key, apply) => ks.watch(key, () => {
            apply();
            this._dispatch({ type: 'set', patch: {} });
        });
        part('notch-notifications', () => this._applySink());
        part('notch-osd', () => this._applyOsd());
        part('notch-live-activities', () => this._applyMedia());
        // The timeout is read from settings on every event; nothing to rebuild.
        ks.watch('notch-timeout', () => this._dispatch({ type: 'set', patch: {} }));

        // Runs first on dispose (newest first): stop reacting, then give everything back
        cleanup.add(() => this._teardown());
        this._sync();
    }

    // Idempotent. Registered twice: last in enable() (runs first on a normal dispose) and first
    // (runs last), so a throw half-way through enable() still restores banners, OSD and holds.
    _teardown() {
        if (!this._alive && !this._parts.sink && !this._parts.osd && !this._parts.media)
            return;
        // Collect sticky cards first, give the banners back to the stock tray, then queue
        // them there; queued while the sink still existed they would be diverted again.
        const critical = this._notifications ? this._criticalNotifications() : [];
        this._alive = false;
        this._deadlineToken = 0;
        for (const key of ['sink', 'osd', 'media']) {
            this._parts[key]?.dispose();
            this._parts[key] = null;
        }
        this._requeue(critical);
        this._watch = null;
        if (this._overFullscreen)
            setUnredirectAllowed(true);
        this._overFullscreen = false;
    }

    disable() {
        // The CleanupRegistry given to the constructor undoes everything, newest first.
    }

    // ---- state ----------------------------------------------------------------------------

    _config() {
        const ks = this._ks;
        const normalMs = Math.max(1, ks.int('notch-timeout')) * 1000;
        return {
            notifications: ks.bool('notch-notifications'),
            activities: ks.bool('notch-live-activities'),
            osd: ks.bool('notch-osd'),
            normalMs,
            highMs: Math.round(normalMs * HIGH_FACTOR),
        };
    }

    _dispatch(ev) {
        if (!this._alive)
            return;
        const before = this._state.current?.id;
        const pendingBefore = this._state.pending.map(n => n.id);
        const { state, effects } = step(this._state, { now: nowMs(), ...ev }, this._config());
        this._state = state;
        // A card that ran out of time (not clicked, not dismissed, not waiting in the queue)
        if (ev.type === 'tick' && before !== undefined && state.current?.id !== before &&
            !state.pending.some(n => n.id === before))
            this._expire(before);
        // Queued cards pruned by the queue cap or by DnD / fullscreen never get their turn.
        // Only ones that were already on screen expire; never-shown ones keep their place in
        // the message list as the stock tray would.
        if (ev.type !== 'notify-removed') {
            for (const id of pendingBefore) {
                if (id !== state.current?.id && !state.pending.some(n => n.id === id) &&
                    this._shown.has(id))
                    this._expire(id);
            }
        }
        for (const effect of effects)
            this._run(effect);
        this._sync();
    }

    _run(effect) {
        const notification = this._notifications.get(effect.id);
        if (!notification)
            return;
        try {
            if (effect.type === 'activate')
                notification.activate();
            else if (effect.type === 'dismiss')
                notification.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
        } catch (e) {
            console.error('[Kiwi] notch notification action failed:', e);
        }
    }

    // Transient notifications leave the message list once their banner time is over
    _expire(id) {
        const notification = this._notifications.get(id);
        if (!notification?.isTransient)
            return;
        try {
            notification.destroy(MessageTray.NotificationDestroyedReason.EXPIRED);
        } catch (e) {
            console.error('[Kiwi] notch could not expire a notification:', e);
        }
    }

    _action(id, index) {
        const notification = this._notifications.get(id);
        const action = notification?.actions?.[index];
        if (!action)
            return;
        // Running the action destroys a non-resident notification; the destroy signal
        // takes the card off the screen.
        try {
            action.activate();
        } catch (e) {
            console.error('[Kiwi] notch action failed:', e);
        }
        if (this._notifications.has(id))
            this._dispatch({ type: 'notify-removed', id });
    }

    // Inputs that come from outside: Do Not Disturb and fullscreen
    _syncExternal(initial = false) {
        const patch = {
            dnd: NotificationRouter.state().dnd,
            fullscreen: Main.layoutManager.primaryMonitor?.inFullscreen ?? false,
        };
        if (initial) {
            this._state = { ...this._state, ...patch };
            return;
        }
        this._dispatch({ type: 'set', patch });
    }

    // Draw, move the clock for the next deadline, hold the bar
    _sync() {
        if (!this._alive)
            return;
        const state = this._state;
        const vm = view(state);
        const wants = wantsBar(state);
        const fullscreen = state.fullscreen;

        const media = this._bestPlayer();
        const notification = vm.notificationId === null ? null : this._notifications.get(vm.notificationId) ?? null;
        if (notification)
            this._shown.add(vm.notificationId);
        this._view.render(vm, {
            notification,
            media: media ? { ...mediaInfo(media), appIcon: media.app?.get_icon() ?? null } : null,
            dnd: state.dnd,
            count: NotificationRouter.state().count,
            recent: vm.content === 'dashboard' ? this._recentNotifications() : null,
            clipboard: this._clipboardEntries(),
        });

        // Only the pill over a fullscreen window; no bar there.
        this._view.setShown(wants || !fullscreen);
        // A pill drawn over a fullscreen window needs the compositor to stop direct scanout
        const overFullscreen = wants && fullscreen;
        if (overFullscreen !== this._overFullscreen) {
            this._overFullscreen = overFullscreen;
            setUnredirectAllowed(!overFullscreen);
        }

        this._schedule(nextDeadline(state));
    }

    _schedule(deadline) {
        if (this._deadlineToken) {
            this._cleanup.release(this._deadlineToken);
            this._deadlineToken = 0;
        }
        if (deadline === null)
            return;
        const wait = Math.max(1, deadline - nowMs());
        this._deadlineToken = this._cleanup.timeout(wait, () => {
            this._deadlineToken = 0;
            this._dispatch({ type: 'tick' });
            return GLib.SOURCE_REMOVE;
        }, { name: 'notch deadline' });
    }

    // ---- banners ---------------------------------------------------------------------------

    _present(notification) {
        let id = this._notificationIds.get(notification);
        if (id === undefined) {
            id = this._nextId++;
            this._notificationIds.set(notification, id);
            this._notificationSignals.set(notification, notification.connect('destroy', () => {
                this._notificationSignals.delete(notification);
                this._notifications.delete(id);
                this._shown.delete(id);
                this._dispatch({ type: 'notify-removed', id });
            }));
        }
        this._notifications.set(id, notification);
        this._dispatch({
            type: 'notify',
            id,
            urgency: notification.urgency,
            forFeedback: !!notification.forFeedback,
        });
    }

    _forgetNotifications() {
        for (const [notification, handlerId] of this._notificationSignals) {
            try {
                notification.disconnect(handlerId);
            } catch (_e) {
                // Destroyed already.
            }
        }
        this._notificationSignals.clear();
        this._notifications.clear();
    }

    // ---- parts that can be switched on and off ----------------------------------------------

    // A critical card is sticky; if the notch stops taking banners it must not vanish with it.
    _criticalNotifications() {
        const { current, pending } = this._state;
        const list = [];
        for (const entry of [current, ...pending]) {
            if (!entry || entry.urgency < URGENCY.CRITICAL)
                continue;
            const notification = this._notifications.get(entry.id);
            if (notification)
                list.push(notification);
        }
        return list;
    }

    // Call only after the banner sink is released, so the stock tray takes them.
    _requeue(notifications) {
        if (!notifications.length)
            return;
        // Oldest last, so the head of the queue ends up as the one that was on screen
        for (const notification of [...notifications].reverse())
            requeueBanner(Main.messageTray, notification);
        kickTray(Main.messageTray);
    }

    // Replace one part's registry; returns the fresh one
    _renew(key) {
        this._parts[key]?.dispose();
        this._parts[key] = new CleanupRegistry();
        return this._parts[key];
    }

    _applySink() {
        const critical = this._ks.bool('notch-notifications') ? [] : this._criticalNotifications();
        const parts = this._renew('sink');
        if (this._ks.bool('notch-notifications'))
            NotificationRouter.setBannerSink(parts, { present: n => this._present(n) });
        this._requeue(critical);
    }

    _applyOsd() {
        const parts = this._renew('osd');
        if (this._ks.bool('notch-osd') && canDivertOsd(Main.osdWindowManager)) {
            const self = this;
            parts.inject(Main.osdWindowManager, '_showOsdWindow',
                function (orig, monitorIndex, icon, label, level, maxLevel) {
                    // Other monitors keep the stock OSD; the notch lives on the primary one.
                    if (!self._alive || !self._view || monitorIndex !== Main.layoutManager.primaryIndex)
                        return orig.call(this, monitorIndex, icon, label, level, maxLevel);
                    try {
                        self._dispatch({
                            type: 'osd',
                            icon,
                            label,
                            level: Number.isFinite(level) && level >= 0 ? level : null,
                            maxLevel: Number.isFinite(maxLevel) && maxLevel > 0 ? maxLevel : null,
                        });
                    } catch (e) {
                        console.error('[Kiwi] notch OSD failed, using the stock one:', e);
                        return orig.call(this, monitorIndex, icon, label, level, maxLevel);
                    }
                    return undefined;
                });
        }
    }

    _applyMedia() {
        const parts = this._renew('media');
        this._watch = null;
        if (this._ks.bool('notch-live-activities')) {
            this._watch = MprisWatcher.acquire(parts, this._ctx.gettext);
            this._playerSignals = new Map();
            const track = player => {
                if (this._playerSignals.has(player))
                    return;
                this._playerSignals.set(player, player.connect('changed', () => this._syncMedia()));
            };
            this._watch.on('player-added', player => {
                track(player);
                this._syncMedia();
            });
            this._watch.on('player-removed', player => {
                const id = this._playerSignals.get(player);
                if (id !== undefined)
                    player.disconnect(id);
                this._playerSignals.delete(player);
                this._syncMedia();
            });
            this._watch.players.forEach(track);
            parts.add(() => {
                for (const [player, id] of this._playerSignals ?? []) {
                    try {
                        player.disconnect(id);
                    } catch (_e) {
                        // The player is gone.
                    }
                }
                this._playerSignals = null;
                this._watch = null;
            });
            this._syncMedia();
        }
    }

    // What the calendar's message list holds, newest first
    _recentNotifications() {
        const entries = [];
        for (const source of Main.messageTray.getSources()) {
            for (const notification of source.notifications ?? []) {
                const datetime = notification.datetime ?? null;
                entries.push({
                    notification,
                    title: notification.title ?? '',
                    body: notification.body ?? '',
                    app: source.title ?? '',
                    when: datetime?.format?.('%H:%M') ?? '',
                    time: datetime?.to_unix?.() ?? null,
                    gicon: notification.gicon ?? source.icon ?? null,
                });
            }
        }
        return recentNotifications(entries, RECENT_LIMIT);
    }

    _openNotification(notification) {
        this._dispatch({ type: 'collapse' });
        try {
            notification?.activate();
        } catch (e) {
            console.error('[Kiwi] notch could not open a notification:', e);
        }
    }

    // The full list: in Quick Settings while the notch is on (calendarRight), else the
    // calendar menu.
    _openMessageList() {
        this._dispatch({ type: 'collapse' });
        const area = Main.panel.statusArea;
        const menu = area.quickSettings?.menu ?? area.dateMenu?.menu;
        try {
            menu?.open();
        } catch (e) {
            console.error('[Kiwi] notch could not open the message list:', e);
        }
    }

    // ---- clipboard -------------------------------------------------------------------------

    _dropClipboard() {
        this._clipOff?.forEach(off => off());
        this._clipOff = [];
        this._clipSvc = null;
    }

    // Follow the clipboard service as it appears and disappears
    _syncClipboard() {
        if (!this._alive)
            return;
        const service = clipboardService();
        if (service === this._clipSvc)
            return;
        this._dropClipboard();
        this._clipSvc = service;
        if (service) {
            this._clipOff = [
                service.connectChanged(() => this._sync()),
                service.connectCopied(() => this._dispatch({
                    type: 'confirm', kind: 'copied', label: this._ctx.gettext('Copied'),
                })),
            ];
        }
        this._sync();
    }

    _clipboardEntries() {
        if (!this._clipSvc || !this._ks.bool('notch-show-clipboard'))
            return null;
        return this._clipSvc.latest(3).map(e => ({
            id: e.id,
            text: e.kind === 'image' ? this._ctx.gettext('Image') : String(e.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
        }));
    }

    // ---- media -----------------------------------------------------------------------------

    // The player to show: one that is playing, else the first that can play
    _bestPlayer() {
        const players = this._watch?.players ?? [];
        return players.find(p => p.isPlaying()) ?? players[0] ?? null;
    }

    _syncMedia() {
        if (!this._alive)
            return;
        const playing = (this._watch?.players ?? []).find(p => p.isPlaying()) ?? null;
        this._dispatch({
            type: 'activity',
            key: MEDIA_KEY,
            data: playing ? mediaInfo(playing) : null,
        });
    }

    _media(command) {
        const player = this._bestPlayer();
        if (!player)
            return;
        if (command === 'previous')
            player.previous();
        else if (command === 'next')
            player.next();
        else
            player.playPause();
    }
}
