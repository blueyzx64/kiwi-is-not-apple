// SPDX-License-Identifier: GPL-3.0-or-later
// WindowHider: takes windows off the stage and puts them back, without minimize().
//
// A hidden window keeps running and keeps its place, size and workspace. Only its actor is
// changed: opacity 0 (not visible=false, so the app keeps getting frame callbacks and the strip
// clone keeps painting), and hidden from pick so the pointer goes through it. Every change is
// recorded the first time it is made, and restoreAll() puts back exactly what was recorded.
//
// Side by side (a tiled set): tile() moves and resizes a window's frame, remembering the frame
// and maximized state it had; untile() and restoreAll() put both back. Mutter's own tiling has
// no public API on 50 (meta_window_tile is not introspected), so it is move_resize_frame.
//
// The hider never scales or moves an actor: the visible trip to and from the strip is a clone
// flown by flight.js (index.js wires the two). Under reduced motion it is a short opacity fade.
//
// Private API: none. Shell.util_set_hidden_from_pick (same in 48-51, used by windowPreview.js).
// Checked on GNOME Shell 50.6: a Clutter.Clone of an opacity-0 actor paints.

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import { WindowState } from '../../core/windowState.js';
import { maximizeWindow, unmaximizeWindow } from '../../lib/compat.js';

const FADE_MS = 160;

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
     * @param {object} env
     * @param {() => boolean} env.motion  false under reduced motion
     * @param {(win: Meta.Window) => void} env.land  a flight of this window must end now
     * @param {(win: Meta.Window) => void} env.leaving  the window just went off the stage (animated)
     * @param {(win: Meta.Window, opacity: number) => boolean} env.arriving  it comes back
     *   (animated): true when a flight took over and will give the actor `opacity` when it lands
     */
    constructor(cleanup, { motion, land, leaving, arriving }) {
        this._cleanup = cleanup;
        this._motion = motion;
        this._land = land;
        this._leaving = leaving;
        this._arriving = arriving;
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

    /**
     * Lay a window out at `rect` for a side-by-side set. The first call remembers where it was
     * (and whether it was maximized); later calls only move it.
     */
    tile(win, rect) {
        const rec = this._record(win);
        if (!rec.tile) {
            rec.tile = {
                orig: rectOf(win),
                maximized: !!(win.maximized_horizontally || win.maximized_vertically),
            };
        }
        if (win.maximized_horizontally || win.maximized_vertically)
            unmaximizeWindow(win);
        win.move_resize_frame(true, rect.x, rect.y, rect.width, rect.height);
    }

    isTiled(win) {
        return !!this._records.get(win)?.tile;
    }

    tiledWindows() {
        return [...this._records].filter(([, rec]) => rec.tile).map(([win]) => win);
    }

    /** Put a tiled window back where it was before its set was laid out. */
    untile(win) {
        const rec = this._records.get(win);
        if (!rec?.tile)
            return;
        const t = rec.tile;
        rec.tile = null;
        this._restoreTile(win, t);
    }

    _restoreTile(win, t) {
        try {
            if (win.minimized)
                return;
            const o = t.orig;
            win.move_resize_frame(true, o.x, o.y, o.width, o.height);
            if (t.maximized)
                maximizeWindow(win);
        } catch (e) {
            console.error(`[Kiwi] stage restore tile: ${e.message}`);
        }
    }

    /** Window is gone: drop its record. */
    forget(win) {
        const rec = this._records.get(win);
        if (!rec)
            return;
        this._cleanup.release(rec.guard);
        this._cleanup.release(rec.token);
        this._records.delete(win);
        WindowState.set(win, 'staged', false);
    }

    /** Windows this hider keeps hidden right now. */
    hiddenWindows() {
        return [...this._records].filter(([, rec]) => rec.hidden).map(([win]) => win);
    }

    /** Put every window back exactly as found. Sync, safe to call twice. */
    restoreAll() {
        const minimizeAfter = [];
        for (const [win, rec] of [...this._records]) {
            rec.hidden = false;
            try {
                this._cleanup.release(rec.guard);    // before the opacity write it would undo
            } catch (_e) {
                // already released
            }
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
            if (rec.tile) {
                this._restoreTile(win, rec.tile);
                rec.tile = null;
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
            tile: null,          // {orig, maximized} while the window is laid out in a side-by-side set
            userMinimized: false,
            token: 0,
            guard: 0,          // notify::opacity on the actor while hidden
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
        this._watchOpacity(win, rec, actor);
        if (rec.hidden) {
            // The Shell's minimize/unminimize effects end by writing opacity 255: assert again
            this._reassert(rec, actor);
            return;
        }
        // Remember what "shown" looks like unless a fade is in the middle of it
        if (actor.opacity > 0 && !actor.get_transition('opacity'))
            rec.opacity = actor.opacity;
        this._land(win);
        rec.hidden = true;
        WindowState.set(win, 'staged', true);
        this._pick(actor, true);
        actor.remove_all_transitions();

        if (animate && actor.mapped && !this._motion()) {
            // Reduced motion: a short crossfade in place
            actor.ease({ opacity: 0, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            return;
        }
        actor.opacity = 0;
        if (animate && actor.mapped)
            this._leaving(win);
    }

    _reassert(rec, actor) {
        if (!rec.hidden || actor.get_transition('opacity'))
            return;
        if (actor.opacity !== 0)
            actor.opacity = 0;
        this._pick(actor, true);
    }

    _watchOpacity(win, rec, actor) {
        if (rec.guard)
            return;
        rec.guard = this._cleanup.connect(actor, 'notify::opacity', () => this._reassert(rec, actor));
    }

    _showOne(win, animate) {
        const rec = this._records.get(win);
        if (!rec?.hidden)
            return;
        rec.hidden = false;
        rec.userMinimized = false;  // it is back on a stage: the user chose that
        WindowState.set(win, 'staged', false);
        const actor = win.get_compositor_private();
        if (!actor)
            return;
        this._land(win);
        actor.remove_all_transitions();
        this._pick(actor, false);
        actor.set_scale(rec.scale[0], rec.scale[1]);
        actor.set_pivot_point(rec.pivot[0], rec.pivot[1]);
        const opacity = rec.opacity || 255;
        if (animate && actor.mapped && this._motion() && this._arriving(win, opacity))
            return;
        if (animate && actor.mapped) {
            actor.opacity = 0;
            actor.ease({ opacity, duration: FADE_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        } else {
            actor.opacity = opacity;
        }
    }
}
