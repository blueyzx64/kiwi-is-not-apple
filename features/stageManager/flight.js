// SPDX-License-Identifier: GPL-3.0-or-later
// Stage Manager flights: the window visibly travels between its frame on the stage and its card
// in the strip, and back.
//
// A flight never transforms the real window actor. It flies a Clutter.Clone of it (a clone
// paints its source even at opacity 0 or unmapped) on top of the UI, from one pose to another:
// translate, uniform scale and the Y tilt of the strip, all about the window's frame centre. While a window flies *to* the stage its actor is kept at opacity 0
// and gets its opacity back when the clone lands, so the clone and the window never show twice.
// Under reduced motion a flight is a short crossfade in place (from === to, fade in or out).
//
// Private API: none. Main.layoutManager.uiGroup (public field).

import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { clonePose } from './model.js';

export const FLIGHT_MS = 330;
export const FADE_MS = 160;

function rectOf(r) {
    return { x: r.x, y: r.y, width: r.width, height: r.height };
}

export class Flights {
    /**
     * @param {import('../../lib/disposables.js').CleanupRegistry} cleanup
     * @param {{onLanded?: (win: Meta.Window) => void, ms?: (ms: number) => number}} [handlers]
     *   ms: a duration under the user's animation speed
     */
    constructor(cleanup, { onLanded = () => {}, ms = d => d } = {}) {
        this._onLanded = onLanded;
        this._ms = ms;
        this._active = new Map();   // Meta.Window -> flight
        cleanup.add(() => this.cancelAll());
    }

    isFlying(win) {
        return this._active.has(win);
    }

    /**
     * Fly a clone of the window's actor.
     * @param {Meta.Window} win
     * @param {object} p
     * @param {rect} p.from   where the window's frame is drawn at the start (+ optional `angle`, degrees of Y tilt)
     * @param {rect} p.to     where it is drawn at the end (+ optional `angle`)
     * @param {?number} [p.reveal]  set: keep the real actor at opacity 0 while flying, then give it this opacity
     * @param {'in'|'out'|null} [p.fade]  fade the clone in or out on the way
     * @param {number} [p.duration]
     * @param {number} [p.mode]  Clutter.AnimationMode
     * @returns {boolean} false when there is nothing to fly (no actor, empty rects)
     */
    fly(win, { from, to, reveal = null, fade = null, duration = FLIGHT_MS, mode = Clutter.AnimationMode.EASE_OUT_CUBIC }) {
        // A window already in the air starts its new trip from where its clone is now
        const prev = this._active.get(win);
        if (prev) {
            from = this._visibleRect(prev) ?? from;
            this._finish(win, prev, false);
        }

        const actor = win.get_compositor_private();
        if (!actor || !from || !to)
            return false;
        const frame = rectOf(win.get_frame_rect());
        const buffer = rectOf(win.get_buffer_rect());
        const a = clonePose(frame, buffer, from);
        const b = clonePose(frame, buffer, to);
        if (!a || !b)
            return false;

        const clone = new Clutter.Clone({ source: actor, reactive: false });
        clone.set_size(buffer.width, buffer.height);
        clone.set_pivot_point(a.pivotX, a.pivotY);
        clone.set_position(a.x, a.y);
        clone.set_scale(a.scale, a.scale);
        clone.scale_z = a.scale;   // keep the depth of the tilt in proportion (see strip.js)
        clone.rotation_angle_y = from.angle ?? 0;
        clone.opacity = fade === 'in' ? 0 : 255;
        Main.layoutManager.uiGroup.add_child(clone);

        const flight = { clone, frame, buffer, actor, reveal, to };
        this._active.set(win, flight);
        if (reveal !== null) {
            actor.remove_transition('opacity');
            actor.opacity = 0;
        }

        clone.ease({
            x: b.x, y: b.y, scale_x: b.scale, scale_y: b.scale, scale_z: b.scale,
            rotation_angle_y: to.angle ?? 0,
            opacity: fade === 'out' ? 0 : 255,
            duration: this._ms(duration), mode,
            onStopped: finished => {
                if (this._active.get(win) === flight)
                    this._finish(win, flight, finished);
            },
        });
        return true;
    }

    /**
     * Land a window now: drop its clone and give its actor the opacity the flight promised.
     * Callers do this before they change the actor themselves.
     * @returns {?rect} where the clone was drawn, to start the next flight from there
     */
    land(win) {
        const f = this._active.get(win);
        if (!f)
            return null;
        const rect = this._visibleRect(f);
        this._finish(win, f, false);
        return rect;
    }

    /** Drop every clone and give every flying actor its opacity back. Sync; safe twice. */
    cancelAll() {
        for (const [win, f] of [...this._active])
            this._finish(win, f, false, true);
        this._active.clear();
    }

    // ---- internals -----------------------------------------------------------------------

    _visibleRect(f) {
        const c = f.clone;
        if (!c || c.scale_x <= 0)
            return null;
        // The pivot is the frame centre: it sits at clone position + pivot offset
        const s = c.scale_x;
        const cx = c.x + f.frame.x - f.buffer.x + f.frame.width / 2;
        const cy = c.y + f.frame.y - f.buffer.y + f.frame.height / 2;
        const width = f.frame.width * s;
        const height = f.frame.height * s;
        return { x: cx - width / 2, y: cy - height / 2, width, height, angle: c.rotation_angle_y };
    }

    _finish(win, f, _finished, quiet = false) {
        this._active.delete(win);
        try {
            f.clone.remove_all_transitions();
            f.clone.destroy();
        } catch (_e) {
            // already gone with its source
        }
        if (f.reveal !== null) {
            try {
                f.actor.opacity = f.reveal;
            } catch (_e) {
                // actor disposed (window closed mid-flight)
            }
        }
        if (!quiet) {
            try {
                this._onLanded(win);
            } catch (e) {
                console.error(`[Kiwi] stage flight landed: ${e.message}`);
            }
        }
    }
}
