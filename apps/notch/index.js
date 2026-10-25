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
//   - PanelVisibility.hold 'notch'      keeps an auto-hidden bar up while something shows
// Every part undoes itself through the CleanupRegistry; stock banners and OSD come back.

import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import { CleanupRegistry } from '../../lib/disposables.js';
import { KiwiSettings } from '../../lib/settings.js';
import { canDivertOsd, setUnredirectAllowed, requeueBanner } from '../../lib/compat.js';
import { PanelLayout } from '../../coordinators/panelLayout.js';
import { PanelVisibility } from '../../coordinators/panelVisibility.js';
import { NotificationRouter } from '../../coordinators/notificationRouter.js';
import { MprisWatcher } from '../../coordinators/mprisWatcher.js';
import { initialState, step, view, nextDeadline, wantsBar, URGENCY } from './stateMachine.js';
import { NotchView } from './view.js';

const MEDIA_KEY = 'media';
const HIGH_FACTOR = 1.6;     // high-urgency cards stay this much longer than normal ones

const nowMs = () => Math.floor(GLib.get_monotonic_time() / 1000);

function mediaInfo(player) {
    return {
        busName: player.busName,
        title: player.trackTitle ?? '',
        artist: (player.trackArtists ?? []).join(', '),
        art: player.trackCoverUrl,
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
        this._hold = null;
        this._deadlineToken = 0;
        this._parts = null;
        this._watch = null;
    }

    enable() {
        const { settings, gettext } = this._ctx;
        const cleanup = this._cleanup;
        this._alive = true;

        const ks = this._ks = new KiwiSettings(settings);
        ks.attach(cleanup);

        this._notifications = new Map();       // id -> Notification
        this._notificationIds = new WeakMap();  // Notification -> id
        this._notificationSignals = new Map();  // Notification -> handler id
        this._nextId = 1;
        cleanup.add(() => this._forgetNotifications());

        this._view = new NotchView(cleanup, {
            onClick: () => this._dispatch({ type: 'click' }),
            onDismiss: () => this._dispatch({ type: 'dismiss' }),
            onHover: value => this._dispatch({ type: 'hover', value }),
            onAction: (id, index) => this._action(id, index),
            onMedia: command => this._media(command),
            onToggleDnd: () => NotificationRouter.setDnd(!NotificationRouter.state().dnd),
        }, gettext);

        // Room in the centre of the bar so the clock and others keep clear of the pill
        PanelLayout.claim(cleanup, { id: 'notch', actor: this._view.placeholder, box: 'center' });

        // Shared inputs
        NotificationRouter.connect(cleanup, () => this._syncExternal());
        cleanup.connect(Main.layoutManager, 'in-fullscreen-changed', () => this._syncExternal());
        PanelVisibility.connect(cleanup, () => this._sync());
        this._syncExternal(true);

        // The three features can be switched one by one
        this._sink = null;
        this._mpris = null;
        this._osd = null;
        this._applyParts();
        ks.watch(['notch-notifications', 'notch-live-activities', 'notch-osd'], () => {
            this._applyParts();
            this._dispatch({ type: 'set', patch: {} });
        });
        // The timeout is read from settings on every event; nothing to rebuild.
        ks.watch('notch-timeout', () => this._dispatch({ type: 'set', patch: {} }));

        // Runs first on dispose (newest first): stop reacting, then give everything back
        cleanup.add(() => {
            this._requeueCritical();
            this._alive = false;
            this._deadlineToken = 0;
            this._release();
            this._parts?.dispose();
            this._parts = null;
            this._watch = null;
            if (this._overFullscreen)
                setUnredirectAllowed(true);
            this._overFullscreen = false;
        });
        this._sync();
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
        const { state, effects } = step(this._state, { now: nowMs(), ...ev }, this._config());
        this._state = state;
        // A card that ran out of time (not clicked, not dismissed, not waiting in the queue)
        if (ev.type === 'tick' && before !== undefined && state.current?.id !== before &&
            !state.pending.some(n => n.id === before))
            this._expire(before);
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
        this._view.render(vm, {
            notification,
            media: media ? { ...mediaInfo(media), appIcon: media.app?.get_icon() ?? null } : null,
            dnd: state.dnd,
            count: NotificationRouter.state().count,
        });

        // Only the pill over a fullscreen window; no bar there. Otherwise keep the bar up.
        const barHidden = PanelVisibility.autoHiding() && !PanelVisibility.isVisible();
        const shown = wants || (!fullscreen && !barHidden);
        this._view.setShown(shown);
        const wantsHold = wants && !fullscreen;
        if (wantsHold && !this._hold)
            this._hold = PanelVisibility.hold(null, 'notch');
        else if (!wantsHold && this._hold)
            this._release();
        // A pill drawn over a fullscreen window needs the compositor to stop direct scanout
        const overFullscreen = wants && fullscreen;
        if (overFullscreen !== this._overFullscreen) {
            this._overFullscreen = overFullscreen;
            setUnredirectAllowed(!overFullscreen);
        }

        this._schedule(nextDeadline(state));
    }

    _release() {
        this._hold?.release();
        this._hold = null;
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
    _requeueCritical() {
        const current = this._state.current;
        if (!current || current.urgency < URGENCY.CRITICAL)
            return;
        const notification = this._notifications.get(current.id);
        if (notification)
            requeueBanner(Main.messageTray, notification);
    }

    _applyParts() {
        if (!this._ks.bool('notch-notifications'))
            this._requeueCritical();
        this._parts?.dispose();
        this._parts = new CleanupRegistry();
        const parts = this._parts;
        const cfg = this._config();

        if (cfg.notifications)
            NotificationRouter.setBannerSink(parts, { present: n => this._present(n) });

        if (cfg.osd && canDivertOsd(Main.osdWindowManager)) {
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

        if (cfg.activities) {
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
