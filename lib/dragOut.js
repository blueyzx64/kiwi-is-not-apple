// SPDX-License-Identifier: GPL-3.0-or-later
// Dropping a file from a Shell drag into an app (the dock's stacks).
//
// Why it is done at the drop. Only a Wayland client can start a drag that other apps accept,
// and only from a press on its own window (the press serial). A stack is a Shell overlay, so the
// user's press is the Shell's and stays the Shell's until the release: no client can take the
// drag over while the button is down (mutter counts buttons per seat, so a virtual press on top
// of the held one is dropped as a duplicate). So the drag runs as a Shell drag (the dock's icons
// and the Trash take it as before), and when it is released over an app window, the drag-out
// helper (lib/dragHelper.js, helpers/kiwi-shelf-helper) replays it there:
//
//   1. its small transparent window goes beside the drop point (dragHelperModel.dropPlan);
//   2. a virtual pointer moves onto it and, once the helper says the pointer is in (mutter
//      gives a surface the pointer only after it has picked it under the new position),
//      presses and moves back to the drop point, which starts the helper's GTK drag with the
//      file's text/uri-list;
//   3. once the helper says the drag began, the pointer wiggles on the drop point (the app
//      gets enter and motion and says whether it takes the file) and releases: a real drop.
//
// The cursor visits the helper's window for a few frames. Every step has a deadline, the
// virtual button is always released, and the helper stops when the drag ends: nothing is ever
// left pressed or covering the screen. prepare() starts the helper while the Shell drag runs,
// so the drop does not wait for the process to start.
//
// Shell API: Clutter virtual input device (notify_absolute_motion, notify_button),
// global.get_window_actors (windowAt).

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { WindowState } from '../core/windowState.js';
import { CleanupRegistry } from './disposables.js';
import { DragHelper } from './dragHelper.js';
import { dropPlan } from './dragHelperModel.js';

const PLACE_MS = 1500;     // the helper's window placed beside the drop point
const ENTER_WAIT_MS = 300; // the helper sees the pointer come in (pressed anyway after it)
const STEP_MS = 30;        // between pointer moves
const BEGIN_MS = 1000;     // the helper's drag began
const ENTER_MS = 60;       // the app sees the drag arrive...
const SETTLE_MS = 160;     // ...and answers whether it takes the file, before the release
const END_MS = 3000;       // the drop finished

export class DragOut {
    /** @param {CleanupRegistry} cleanup */
    constructor(cleanup) {
        this._run = null;
        this._helper = new DragHelper(cleanup, {
            onClick: () => {},
            onHover: on => this._run?.hover(on),
            onDrag: on => this._run?.drag(on),
            onActive: on => this._run?.active(on),
        });
        cleanup.add(() => this._end());
    }

    /** Is the helper installed? */
    get available() {
        return this._helper.available;
    }

    /** Is a drop being handed over now? */
    get busy() {
        return this._run !== null;
    }

    /**
     * A Shell drag of a file began: start the helper now, its window parked on one pixel in a
     * corner of the primary monitor (a Shell drag holds the pointer, so it takes no press).
     */
    prepare() {
        if (this._run || !this._helper.available || this._helper.running)
            return;
        const m = Main.layoutManager.primaryMonitor;
        if (!m)
            return;
        const x = m.x + m.width - 1;
        const y = m.y + m.height - 1;
        this._helper.show({ x, y, w: 1, h: 1 }, [{ uri: 'file:///', icon: '', x, y, w: 1, h: 1 }]);
    }

    /** The Shell drag ended without a drop for an app: stop the helper. */
    cancel() {
        if (!this._run)
            this._helper.hide();
    }

    /**
     * Hand `uri` to whatever app window lies at stage point (x, y).
     *
     * @param {number} x
     * @param {number} y
     * @param {string} uri
     * @param {string} [icon] themed icon name for the drag
     * @returns {boolean} false when the helper is not installed or a drop is running
     */
    dropAt(x, y, uri, icon = '') {
        if (this._run || !this._helper.available)
            return false;
        const monitor = Main.layoutManager.monitors.find(m =>
            x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height) ?? Main.layoutManager.primaryMonitor;
        if (!monitor)
            return false;
        const plan = dropPlan({ x, y }, monitor);
        this._run = new DropRun(this._helper, plan, () => this._end());
        this._helper.show(plan.box, [{ uri, icon, ...plan.box }]);
        this._run.start();
        return true;
    }

    _end() {
        const run = this._run;
        this._run = null;
        run?.dispose();
        this._helper.hide();
    }
}

// One handover: place, press, move, wait for the drag, wiggle, release, wait for the end
class DropRun {
    constructor(helper, plan, onEnd) {
        this._helper = helper;
        this._plan = plan;
        this._onEnd = onEnd;
        this._cleanup = new CleanupRegistry();
        this._pointer = Clutter.get_default_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        this._pressed = false;
        this._phase = 'placing';
        this._ready = false;
        this._deadline = 0;
    }

    // Called from the Shell's drop handler: the Shell drag still holds the pointer until it
    // returns, so nothing is pressed before the main loop comes round
    start() {
        this._wait(PLACE_MS);
        this._cleanup.idle(() => {
            this._ready = true;
            if (this._helper.active)
                this.active(true);
        }, { name: 'kiwi drag-out start' });
    }

    // ---- helper events ----

    active(on) {
        if (on && this._ready && this._phase === 'placing')
            this._enter();
    }

    hover(on) {
        if (on && this._phase === 'entering')
            this._press();
    }

    drag(began) {
        if (began && this._phase === 'moving')
            this._drop();
        else if (!began && this._phase !== 'placing')
            this._finish();
    }

    // ---- steps ----

    // Onto the helper's window: the press must find its surface under the pointer
    _enter() {
        this._phase = 'entering';
        const [px, py] = this._plan.press;
        this._motion(px, py);
        this._clearWait();
        this._deadline = this._cleanup.timeout(ENTER_WAIT_MS, () => {
            this._deadline = 0;
            this._press();
        }, { name: 'kiwi drag-out enter' });
    }

    _press() {
        if (this._phase !== 'entering')
            return;
        this._phase = 'moving';
        this._clearWait();
        this._button(true);
        let i = 0;
        const path = this._plan.path;
        const step = () => {
            if (this._phase !== 'moving')
                return;
            const [x, y] = path[i++];
            this._motion(x, y);
            if (i < path.length)
                this._cleanup.timeout(STEP_MS, step, { name: 'kiwi drag-out step' });
            else
                this._wait(BEGIN_MS);
        };
        this._cleanup.timeout(STEP_MS, step, { name: 'kiwi drag-out step' });
    }

    _drop() {
        this._phase = 'dropping';
        this._clearWait();
        const [x, y] = this._plan.path[this._plan.path.length - 1];
        // Enter, a move inside (some apps decide on motion), then the release
        this._motion(x + 1, y);
        this._cleanup.timeout(ENTER_MS, () => {
            this._motion(x, y);
            this._cleanup.timeout(SETTLE_MS, () => {
                this._button(false);
                this._phase = 'ending';
                this._wait(END_MS);
            }, { name: 'kiwi drag-out release' });
        }, { name: 'kiwi drag-out arrive' });
    }

    // A step took too long: give up (the button is released in dispose)
    _wait(ms) {
        this._clearWait();
        this._deadline = this._cleanup.timeout(ms, () => {
            this._deadline = 0;
            this._finish();
        }, { name: 'kiwi drag-out deadline' });
    }

    _clearWait() {
        if (this._deadline)
            this._cleanup.release(this._deadline);
        this._deadline = 0;
    }

    _finish() {
        if (this._phase === 'done')
            return;
        this._phase = 'done';
        this._onEnd();
    }

    // ---- virtual pointer ----

    _motion(x, y) {
        this._pointer?.notify_absolute_motion(GLib.get_monotonic_time(), x, y);
    }

    _button(down) {
        if (!this._pointer || down === this._pressed)
            return;
        this._pressed = down;
        this._pointer.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY,
            down ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
    }

    dispose() {
        this._phase = 'done';
        this._cleanup.dispose();
        // Never leave the button down (a held virtual button would block every later click)
        this._button(false);
        this._pointer = null;
    }
}

/**
 * The app window under stage point (x, y), topmost first, or null: one that shows on the
 * active workspace and is drawn (Stage Manager and Hide hide windows by opacity). Kiwi's helper
 * windows do not count.
 *
 * @returns {?Meta.Window}
 */
export function windowAt(x, y) {
    const workspace = global.workspace_manager.get_active_workspace();
    const actors = global.get_window_actors();
    for (let i = actors.length - 1; i >= 0; i--) {
        const actor = actors[i];
        const win = actor.meta_window;
        if (!win || !actor.visible || actor.opacity === 0 || win.minimized || WindowState.has(win, 'kiwiHelper'))
            continue;
        if (!win.is_on_all_workspaces() && win.get_workspace() !== workspace)
            continue;
        const r = win.get_frame_rect();
        if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height)
            return win;
    }
    return null;
}
