// SPDX-License-Identifier: GPL-3.0-or-later
// Motion: one animation service for every Kiwi surface (the Shell side of motionModel.js).
//
//   const anim = ctx.motion.ease(actor, { opacity: 255, scale_x: 1, scale_y: 1 },
//       { duration: 'medium', curve: 'emphasized', onDone: finished => ... }, cleanup);
//   anim.cancel();                      // stops where it is; onDone(false)
//   ctx.motion.spring(actor, 'translation_y', 0, { spring: 'bouncy' }, cleanup);
//   ctx.motion.env;                     // {reducedMotion, animations}
//
// Every animation goes through motionModel.resolve(), so animations-off and reduced motion
// are honoured here and nowhere else: features never read those settings themselves. With
// an `owner` (a CleanupRegistry) the animation is cancelled when the owner is disposed, so
// disable() never leaves a transition running on an actor.
//
// Hot path: ease() hands the work to Clutter (actor.ease); spring() runs one Clutter.Timeline
// whose new-frame handler interpolates a table computed once, and allocates nothing per frame.
//
// Shell API: actor.ease (js/ui/environment.js), St.Settings (enable-animations,
// slow-down-factor), lib/compat.js watchReducedMotion.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { CleanupRegistry } from '../lib/disposables.js';
import { watchReducedMotion } from '../lib/compat.js';
import { resolve, splitProps, springKeyframes } from './motionModel.js';

const NOOP_HANDLE = Object.freeze({ cancel() {}, get running() { return false; } });

// Clutter names transitions after the property's canonical (dashed) name
const transitionName = prop => prop.replace(/_/g, '-');

export class Motion {
    /** @param {import('./events.js').EventHub} events */
    constructor(events) {
        this._events = events;
        this._env = { reducedMotion: false, animations: true };
        this._cleanup = null;
    }

    /** Start following the system preferences (extension enable). */
    start() {
        if (this._cleanup)
            return;
        const cleanup = new CleanupRegistry();
        this._cleanup = cleanup;
        const st = St.Settings.get();
        const sync = () => {
            const next = { reducedMotion: this._reduced, animations: !!st.enable_animations };
            if (next.reducedMotion === this._env.reducedMotion && next.animations === this._env.animations)
                return;
            this._env = next;
            this._events.emit('motion-changed', { ...next });
        };
        this._reduced = false;
        watchReducedMotion(cleanup, reduced => {
            this._reduced = reduced;
            sync();
        });
        cleanup.connect(st, 'notify::enable-animations', sync);
        sync();
    }

    /** Stop following them (extension disable). */
    stop() {
        this._cleanup?.dispose();
        this._cleanup = null;
    }

    /** @returns {{reducedMotion: boolean, animations: boolean}} a copy */
    get env() {
        return { ...this._env };
    }

    /** The resolved duration (ms) of a request, e.g. to time a follow-up. */
    duration(request) {
        return resolve(request, this._env).duration;
    }

    /**
     * Animate actor properties with a named duration and curve (or a spring preset, which
     * then only sets the duration; use spring() for real overshoot).
     *
     * @param {Clutter.Actor} actor
     * @param {object} props target values (GObject property names, e.g. scale_x)
     * @param {{duration?: number|string, curve?: string, spring?: string|object,
     *   delay?: number, onDone?: (finished: boolean) => void}} [request]
     * @param {{add: Function, release?: Function}} [owner] cancels it on dispose
     * @returns {{cancel: Function, running: boolean}}
     */
    ease(actor, props, request = {}, owner = null) {
        const plan = resolve(request, this._env);
        const { animate, jump } = splitProps(props, plan.transforms);
        if (Object.keys(jump).length)
            actor.set(jump);
        const names = Object.keys(animate);
        if (!names.length || plan.duration === 0) {
            if (names.length)
                actor.set(animate);
            request.onDone?.(true);
            return NOOP_HANDLE;
        }
        let running = true;
        let token = 0;
        const finish = finished => {
            if (!running)
                return;
            running = false;
            if (token)
                owner?.release?.(token);
            request.onDone?.(finished);
        };
        const handle = {
            cancel: () => {
                if (!running)
                    return;
                for (const n of names)
                    actor.remove_transition(transitionName(n));
                finish(false);
            },
            get running() {
                return running;
            },
        };
        token = owner?.add(() => handle.cancel()) ?? 0;
        actor.ease({
            ...animate,
            duration: plan.duration,
            delay: request.delay ?? 0,
            mode: Clutter.AnimationMode[plan.mode],
            onStopped: isFinished => finish(isFinished),
        });
        return handle;
    }

    /**
     * Spring one numeric property to `to`. Under reduced motion or with animations off it
     * becomes ease() (a short fade for opacity, a jump for transforms).
     *
     * @param {Clutter.Actor} actor
     * @param {string} prop e.g. 'translation_y', 'scale_x', 'opacity'
     * @param {number} to
     * @param {{spring?: string|object, onDone?: Function}} [request] spring defaults to 'snappy'
     * @param {{add: Function, release?: Function}} [owner]
     * @returns {{cancel: Function, running: boolean}}
     */
    spring(actor, prop, to, request = {}, owner = null) {
        const plan = resolve({ spring: request.spring ?? 'snappy' }, this._env);
        if (!plan.spring)
            return this.ease(actor, { [prop]: to }, { duration: plan.duration, onDone: request.onDone }, owner);

        const { duration, keys, values } = springKeyframes(plan.spring);
        const from = actor[prop];
        const span = to - from;
        const last = keys.length - 1;
        actor.remove_transition(transitionName(prop));
        const timeline = new Clutter.Timeline({
            actor,
            duration: Math.round(duration * (St.Settings.get().slow_down_factor || 1)),
        });
        let running = true;
        let token = 0;
        const finish = finished => {
            if (!running)
                return;
            running = false;
            timeline.disconnect(frameId);
            timeline.disconnect(doneId);
            if (destroyId)
                actor.disconnect(destroyId);
            timeline.stop();
            if (token)
                owner?.release?.(token);
            request.onDone?.(finished);
        };
        const frameId = timeline.connect('new-frame', () => {
            const p = timeline.get_progress();
            // Keys are evenly spaced: index straight into the table, then interpolate
            const pos = p * last;
            const i = Math.min(last - 1, Math.floor(pos));
            const v = values[i] + (values[i + 1] - values[i]) * (pos - i);
            actor[prop] = from + span * v;
        });
        const doneId = timeline.connect('completed', () => {
            actor[prop] = to;
            finish(true);
        });
        // The owner may destroy the actor mid-flight: stop before the next frame touches it
        let destroyId = actor.connect('destroy', () => {
            destroyId = 0;
            finish(false);
        });
        const handle = {
            cancel: () => finish(false),
            get running() {
                return running;
            },
        };
        token = owner?.add(() => handle.cancel()) ?? 0;
        timeline.start();
        return handle;
    }
}
