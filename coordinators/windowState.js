// SPDX-License-Identifier: GPL-3.0-or-later
// WindowState: the one place that records WHY a window is not in its normal place.
//
// Stage Manager, fullscreen isolation, tiling and minimize-to-dock all move or hide windows.
// Instead of each module guessing what the others did (tech-debt 1.6), each one sets a flag
// here and every module reads the flags of the others before it acts.
//
//   staged              Stage Manager put it off the stage (hidden, or minimized by Kiwi)
//   isolatedFullscreen  moveFullscreenWindow moved it to its own workspace
//   tiled               windowTiling holds a restore stash for it
//   parkedInDock        minimizedToDock owns its minimize (it is a dock thumbnail)
//
//   import { WindowState } from '../coordinators/windowState.js';
//   WindowState.set(win, 'staged', true);          // true if the flag changed
//   WindowState.has(win, 'staged');
//   WindowState.watch(cleanup, (win, flag, on) => ...);
//
// Rules for consumers (the policy; the registry only stores):
//   - minimizedToDock must skip a window that is `staged`: no icon geometry, no dock thumbnail.
//   - hideMinimizedWindows hides a window from the overview and alt-tab only when
//     WindowState.hiddenFromSwitcher(win); a staged window stays visible there.
//   - windowControls: minimize on a staged-capable window calls Stage Manager, see WindowState.stageActive.
//   - moveFullscreenWindow and windowTiling pause while WindowState.stageActive is true.
//
// No gi imports: runs under `gjs -m` in tests. A window is any object; if it has
// connect/disconnect, its flags are dropped on 'unmanaged' by track().

export const FLAGS = Object.freeze(['staged', 'isolatedFullscreen', 'tiled', 'parkedInDock']);

export class WindowStateRegistry {
    constructor() {
        this._flags = new Map();      // window -> Set<flag>
        this._unmanaged = new Map();  // window -> signal id
        this._listeners = new Set();
        this._stageActive = false;
    }

    /** Set or clear a flag. Returns true when it changed. */
    set(win, flag, on = true) {
        if (!win)
            return false;
        if (!FLAGS.includes(flag))
            throw new Error(`WindowState: unknown flag "${flag}"`);
        let set = this._flags.get(win);
        const had = set?.has(flag) ?? false;
        if (had === !!on)
            return false;
        if (on) {
            if (!set) {
                set = new Set();
                this._flags.set(win, set);
                this._track(win);
            }
            set.add(flag);
        } else {
            set.delete(flag);
            if (set.size === 0)
                this._forget(win);
        }
        if (flag === 'staged')
            this._mirrorStaged(win, !!on);
        this._emit(win, flag, !!on);
        return true;
    }

    has(win, flag) {
        return this._flags.get(win)?.has(flag) ?? false;
    }

    /** Flags of one window, in FLAGS order. */
    flags(win) {
        const set = this._flags.get(win);
        return set ? FLAGS.filter(f => set.has(f)) : [];
    }

    /** Every window that carries the flag (insertion order). */
    list(flag) {
        const out = [];
        for (const [win, set] of this._flags) {
            if (set.has(flag))
                out.push(win);
        }
        return out;
    }

    /** Drop every flag of one window (call when it goes away). */
    clear(win) {
        const set = this._flags.get(win);
        if (!set)
            return;
        for (const flag of FLAGS) {
            if (set.has(flag))
                this.set(win, flag, false);
        }
    }

    /** Clear one flag on every window that has it. A feature calls this in disable(). */
    clearFlag(flag) {
        for (const win of this.list(flag))
            this.set(win, flag, false);
    }

    // ---- policy helpers (so consumers do not repeat the rules) --------------------------

    /** minimizedToDock must leave this window alone. */
    skipsDock(win) {
        return this.has(win, 'staged');
    }

    /** hideMinimizedWindows may hide this window from overview and alt-tab. */
    hiddenFromSwitcher(win) {
        return this.has(win, 'parkedInDock') && !this.has(win, 'staged');
    }

    // ---- Stage Manager on/off -----------------------------------------------------------

    /** True while Stage Manager owns window placement. */
    get stageActive() {
        return this._stageActive;
    }

    setStageActive(on) {
        on = !!on;
        if (on === this._stageActive)
            return;
        this._stageActive = on;
        this._emit(null, 'stageActive', on);
    }

    // ---- change signal ------------------------------------------------------------------

    /**
     * fn(win, flag, on) runs after every change. For setStageActive: (null, 'stageActive', on).
     * `owner` is a CleanupRegistry (the callback is removed on dispose) or omitted.
     * @returns {Function} call it to stop watching
     */
    watch(owner, fn) {
        if (typeof owner === 'function') {
            fn = owner;
            owner = null;
        }
        this._listeners.add(fn);
        const stop = () => this._listeners.delete(fn);
        owner?.add(stop);
        return stop;
    }

    /** Drop everything (tests, extension teardown). Flags are cleared with change signals. */
    reset() {
        for (const win of [...this._flags.keys()])
            this.clear(win);
        this.setStageActive(false);
    }

    // ---- internals ----------------------------------------------------------------------

    _emit(win, flag, on) {
        for (const fn of [...this._listeners]) {
            try {
                fn(win, flag, on);
            } catch (e) {
                console.error(`[Kiwi] windowState listener: ${e.message}`);
            }
        }
    }

    // Spec fallback: modules that cannot import the registry can read win._kiwiStaged.
    _mirrorStaged(win, on) {
        try {
            if (on)
                win._kiwiStaged = true;
            else
                delete win._kiwiStaged;
        } catch (_e) {
            // frozen or destroyed object: the registry stays the source of truth
        }
    }

    _track(win) {
        if (typeof win.connect !== 'function' || this._unmanaged.has(win))
            return;
        try {
            this._unmanaged.set(win, win.connect('unmanaged', () => this.clear(win)));
        } catch (_e) {
            // not a GObject with that signal
        }
    }

    _forget(win) {
        this._flags.delete(win);
        const id = this._unmanaged.get(win);
        this._unmanaged.delete(win);
        if (id !== undefined && typeof win.disconnect === 'function') {
            try {
                win.disconnect(id);
            } catch (_e) {
                // window already gone
            }
        }
    }
}

export const WindowState = new WindowStateRegistry();
