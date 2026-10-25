// SPDX-License-Identifier: GPL-3.0-or-later
// WindowHider: takes windows off the stage and puts them back, without minimize().
//
// A hidden window keeps running and keeps its place, size and workspace. Only its actor is
// changed: opacity 0 (not visible=false, so the app keeps getting frame callbacks and the strip
// clone keeps painting), and hidden from pick so the pointer goes through it. Every change is
// recorded the first time it is made, and restoreAll() puts back exactly what was recorded.
//
// Private API: none. Shell.util_set_hidden_from_pick (same in 48-51, used by windowPreview.js).
// Not run on a real shell yet: whether a Clutter.Clone of an opacity-0 actor paints is the
// first thing to check (skill ref windows-workspaces-and-actors.md section 5 says it does).

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import { WindowState } from '../../coordinators/windowState.js';

const SHRINK = 0.22;
const HIDE_MS = 500;
const SHOW_MS = 220;

function sameRect(a, b) {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function rectOf(win) {
    const r = win.get_frame_rect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
}

export class WindowHider {
    /**
     * @param {import('../../lib/disposables.js').CleanupRegistry} cleanup
     * @param {{motion: () => boolean, towards: () => ({x: number, y: number}|null)}} env
     */
    constructor(cleanup, { motion, towards }) {
        this._cleanup = cleanup;
        this._motion = motion;
        this._towards = towards;
        this._records = new Map();   // Meta.Window -> record
        cleanup.add(() => this.restoreAll());
    }

    isHidden(win) {
        return this._records.get(win)?.hidden ?? false;
    }

    /** Hide a window and the dialogs attached to it. */
    hide(win, { animate = true } = {}) {
        for (const w of this._family(win))
            this._hideOne(w, animate && w === win);
    }

    /** Bring a hidden window (and its dialogs) back. */
    show(win, { animate = true } = {}) {
        for (const w of this._family(win))
            this._showOne(w, animate);
    }

    /**
     * Show these and hide those. Windows already in the right state are left alone.
     * Minimized windows are never touched: mutter owns their visibility.
     */
    apply({ show, hide, animate = true }) {
        for (const win of show)
            this.show(win, { animate });
        for (const win of hide) {
            if (!win.minimized)
                this.hide(win, { animate });
        }
    }

    /** Reveal everything now but keep the records (overview). */
    revealAll() {
        for (const win of [...this._records.keys()])
            this._showOne(win, false, true);
    }

    /** The user asked to minimize this window while Stage Manager is on: remember the intent. */
    markUserMinimized(win) {
        this._record(win).userMinimized = true;
    }

    /**
     * Move a window, remembering where it was. The record is dropped if the user moves the
     * window afterwards, so restoreAll() never drags it back from a place they chose.
     */
    moveTo(win, rect) {
        const rec = this._record(win);
        const now = rectOf(win);
        if (sameRect(now, rect))
            return;
        if (!rec.frame || !sameRect(rec.frame.set, now))
            rec.frame = { orig: now, set: rect };
        else
            rec.frame.set = rect;
        win.move_resize_frame(true, rect.x, rect.y, rect.width, rect.height);
    }

    /** Window is gone: drop its record. */
    forget(win) {
        const rec = this._records.get(win);
        if (!rec)
            return;
        this._cleanup.release(rec.token);
        this._records.delete(win);
        WindowState.set(win, 'staged', false);
    }

    /** Put every window back exactly as found. Sync, safe to call twice. */
    restoreAll() {
        const minimizeAfter = [];
        for (const [win, rec] of [...this._records]) {
            try {
                const actor = win.get_compositor_private();
                if (actor) {
                    actor.remove_all_transitions();
                    actor.opacity = rec.opacity || 255;
                    actor.set_scale(rec.scale[0], rec.scale[1]);
                    actor.set_pivot_point(rec.pivot[0], rec.pivot[1]);
                    this._pick(actor, false);
                }
            } catch (e) {
                console.error(`[Kiwi] stage restore actor: ${e.message}`);
            }
            try {
                if (rec.frame && !win.minimized && sameRect(rectOf(win), rec.frame.set)) {
                    const o = rec.frame.orig;
                    win.move_resize_frame(true, o.x, o.y, o.width, o.height);
                }
            } catch (e) {
                console.error(`[Kiwi] stage restore frame: ${e.message}`);
            }
            try {
                this._cleanup.release(rec.token);
            } catch (_e) {
                // already released
            }
            if (rec.userMinimized)
                minimizeAfter.push(win);
        }
        this._records.clear();
        WindowState.clearFlag('staged');
        // The user pressed minimize on these: keep that, now that the actor is whole again
        for (const win of minimizeAfter) {
            try {
                if (!win.minimized)
                    win.minimize();
            } catch (e) {
                console.error(`[Kiwi] stage restore minimize: ${e.message}`);
            }
        }
    }

    _pick(actor, hidden) {
        try {
            Shell.util_set_hidden_from_pick(actor, hidden);
        } catch (_e) {
            // actor already disposed
        }
    }

    // ---- internals -----------------------------------------------------------------------

    _family(win) {
        const out = [win];
        for (const other of global.display.list_all_windows()) {
            if (out.includes(other) || other.get_window_type() === Meta.WindowType.NORMAL)
                continue;
            let parent = other.get_transient_for();
            for (let depth = 0; parent && depth < 8; depth++, parent = parent.get_transient_for()) {
                if (parent === win) {
                    out.push(other);
                    break;
                }
            }
        }
        return out;
    }

    _record(win) {
        let rec = this._records.get(win);
        if (rec)
            return rec;
        const actor = win.get_compositor_private();
        // A baseline taken mid-animation or at opacity 0 would restore an invisible window
        const clean = actor && actor.opacity > 0 && !actor.get_transition('opacity') &&
            !actor.get_transition('scale-x');
        rec = {
            hidden: false,
            opacity: clean ? actor.opacity : 255,
            scale: clean ? [actor.scale_x, actor.scale_y] : [1, 1],
            pivot: clean ? actor.get_pivot_point() : [0, 0],
            frame: null,
            userMinimized: false,
            token: 0,
        };
        rec.token = this._cleanup.connect(win, 'unmanaged', () => this.forget(win));
        this._records.set(win, rec);
        return rec;
    }

    _hideOne(win, animate) {
        const actor = win.get_compositor_private();
        if (!actor)
            return;
        const rec = this._record(win);
        if (rec.hidden)
            return;
        // Remember what "shown" looks like unless a fade is in the middle of it
        if (actor.opacity > 0 && !actor.get_transition('opacity'))
            rec.opacity = actor.opacity;
        rec.hidden = true;
        WindowState.set(win, 'staged', true);
        this._pick(actor, true);
        actor.remove_all_transitions();

        const target = this._towards();
        if (!animate || !this._motion() || !target || !actor.mapped || actor.width === 0) {
            actor.opacity = 0;
            return;
        }
        actor.set_pivot_point((target.x - actor.x) / actor.width, (target.y - actor.y) / actor.height);
        actor.ease({
            scale_x: SHRINK, scale_y: SHRINK, opacity: 0, duration: HIDE_MS,
            mode: Clutter.AnimationMode.EASE_IN_OUT_CUBIC,
            onComplete: () => {
                // Still hidden: leave it whole but invisible so a later show starts clean
                if (this._records.get(win)?.hidden) {
                    actor.set_scale(rec.scale[0], rec.scale[1]);
                    actor.set_pivot_point(rec.pivot[0], rec.pivot[1]);
                }
            },
        });
    }

    _showOne(win, animate, keepIntent = false) {
        const rec = this._records.get(win);
        if (!rec?.hidden)
            return;
        rec.hidden = false;
        if (!keepIntent)
            rec.userMinimized = false;  // it is back on a stage: the user chose that
        WindowState.set(win, 'staged', false);
        const actor = win.get_compositor_private();
        if (!actor)
            return;
        actor.remove_all_transitions();
        this._pick(actor, false);
        actor.set_scale(rec.scale[0], rec.scale[1]);
        actor.set_pivot_point(rec.pivot[0], rec.pivot[1]);
        if (animate && this._motion() && actor.mapped) {
            actor.opacity = 0;
            actor.ease({
                opacity: rec.opacity || 255, duration: SHOW_MS,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            actor.opacity = rec.opacity || 255;
        }
    }
}
