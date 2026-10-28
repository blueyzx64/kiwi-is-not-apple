// SPDX-License-Identifier: GPL-3.0-or-later
// Hover Text, Hover Typing, Hover Color and the Full Keyboard Access highlight (macOS
// Accessibility > Hover Text; Keyboard > Full Keyboard Access). Each part has its own key; the
// feature runs while any of them is on (features.js).
//
//   Hover Text   hold the activation modifier (hover-modifier, Super = ⌘) and point: the text of
//                the element under the pointer, large, in a glass panel by the pointer, with an
//                outline around the element. Press the modifier three times quickly to lock it on.
//   Hover Color  the same activation: a large swatch and the hex of the pixel under the pointer.
//   Hover Typing while you type in a field: the line being typed, large, by the caret or in a
//                corner, with the field outlined. Never for password fields.
//   Focus ring   a ring around the app element that has the keyboard focus, as it moves.
//
// Shell API (checked on 50):
// - the modifier: the seat keymap's 'state-changed' fires on every modifier change (also used
//   by features/inputIndicator); the mask comes from global.get_pointer();
// - the pointer: Meta.CursorTracker 'position-invalidated' (per motion: the handler only arms
//   a debounce timer), queries coalesced to one in flight;
// - the pixel: Shell.Screenshot.pick_color (async);
// - app text and focus: AT-SPI over async GDBus (atspiSource.js);
// - Super taps: mutter emits Meta.Display 'overlay-key' on a bare Super release (Spotlight or
//   the overview). While Super is the activation modifier, a release after a hover, and the
//   second and third press of a triple press, are kept from it by blocking the signal's
//   handlers until just after that release (a counted block, undone exactly). The first press of
//   a triple press is an ordinary tap.

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Caret } from '../../lib/caret.js';
import { KiwiSettings } from '../../lib/settings.js';
import { AtspiSource } from './atspiSource.js';
import { HoverPanel, Outline, caretMarkup } from './view.js';
import {
    MODIFIERS, ModifierLock, POINTER_DEBOUNCE_MS, colorHex, contains, isFocusGained, isSecret, placePanel,
    readConfig, textWindow, typingWindow,
} from './model.js';

const KEYS = [
    'hover-text', 'hover-modifier', 'hover-text-size', 'hover-text-color', 'hover-background-color',
    'hover-highlight-color', 'hover-typing', 'hover-typing-size', 'hover-typing-position',
    'hover-insertion-point-color', 'hover-color', 'hover-focus-highlight', 'hover-focus-color',
    'hover-focus-width', 'hover-focus-contrast', 'hover-focus-autohide',
];
const TAP_UNBLOCK_MS = 250;
const HIGHLIGHT_WIDTH = 3;

export class HoverText {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._gen = 0;
        this._lock = null;
        this._modifier = null;
        this._config = null;
        this._source = null;
        this._debounce = 0;
        this._typingDebounce = 0;
        this._inFlight = false;
        this._again = false;
        this._focused = null;      // {name, path} of the app object with the focus
        this._tapBlocked = false;
        this._tapUnblock = 0;
        this._hoveredThisHold = false;
        this._ringHide = 0;
        /** Test seam: (point) => ?{text, offset, rect}, used instead of AT-SPI when set. */
        this.testTextAt = null;
    }

    enable() {
        const cleanup = this._cleanup;
        const gen = ++this._gen;
        const ks = new KiwiSettings(this._ctx.settings);
        ks.attach(cleanup);
        this._ks = ks;

        this._source = new AtspiSource();
        this._source.start();
        cleanup.add(() => {
            this._source?.stop();
            this._source = null;
        });

        const motion = this._ctx.motion;
        this._textPanel = new HoverPanel(cleanup, motion, 'text');
        this._typingPanel = new HoverPanel(cleanup, motion, 'typing');
        this._hoverOutline = new Outline(cleanup, 'element');
        this._fieldOutline = new Outline(cleanup, 'field');
        this._ring = new Outline(cleanup, 'focus');
        this._caret = Caret.acquire(cleanup);

        const backend = global.stage.context?.get_backend?.() ?? global.backend;
        const keymap = backend.get_default_seat().get_keymap();
        cleanup.connect(keymap, 'state-changed', () => this._modifiersChanged());
        cleanup.connect(global.backend.get_cursor_tracker(), 'position-invalidated', () => this._pointerMoved());
        cleanup.connect(global.display, 'notify::focus-window', () => {
            this._hideTyping();
            this._ring.setRect(null);
        });
        cleanup.add(() => this._unblockTaps());

        ks.watch(KEYS, () => this._applyConfig(gen));
        this._applyConfig(gen);
    }

    disable() {
        // Everything is in the cleanup registry; late async results see the new generation
        this._gen++;
        this._lock = null;
        this._focused = null;
        this._debounce = this._typingDebounce = this._tapUnblock = this._ringHide = 0;
        this._inFlight = false;
        this._again = false;
    }

    /** What is on screen, for tests and the harness. */
    get state() {
        return {
            held: !!this._lock?.held, locked: !!this._lock?.locked, active: !!this._lock?.active,
            text: this._textPanel?.text ?? null, color: this._textPanel?.color ?? null,
            typing: this._typingPanel?.text ?? null, ring: this._ring?.rect ?? null,
            element: this._hoverOutline?.rect ?? null, field: this._fieldOutline?.rect ?? null,
            tapBlocked: this._tapBlocked,
        };
    }

    _applyConfig(gen) {
        if (gen !== this._gen)
            return;
        const c = readConfig(this._ks);
        this._config = c;
        if (c.modifier !== this._modifier) {
            this._modifier = c.modifier;
            this._lock = new ModifierLock(MODIFIERS[c.modifier]);
            this._unblockTaps();
        }
        const monitor = Main.layoutManager.primaryMonitor;
        const maxWidth = Math.max(320, (monitor?.width ?? 1280) * 0.6);
        this._textPanel.setLook({ size: c.textSize, color: c.textColor, background: c.backgroundColor, maxWidth });
        this._typingPanel.setLook({ size: c.typingSize, color: c.textColor, background: c.backgroundColor, maxWidth });
        this._hoverOutline.setLook({ color: c.highlightColor, width: HIGHLIGHT_WIDTH });
        this._fieldOutline.setLook({ color: c.highlightColor, width: HIGHLIGHT_WIDTH });
        this._ring.setLook({ color: c.focusColor, width: c.focusWidth, contrast: c.focusContrast });
        if (!c.text && !c.color)
            this._hideHover();
        if (!c.typing)
            this._hideTyping();
        if (!c.focus)
            this._ring.setRect(null);
        if (c.typing || c.focus) {
            this._source.listen(e => this._a11yEvent(e, gen)).catch(e => {
                if (!e?.matches?.(GLib.quark_from_string('g-io-error-quark'), 19 /* CANCELLED */))
                    console.debug(`[Kiwi] hover text: no accessibility events (${e?.message ?? e})`);
            });
        }
    }

    // ---- the activation modifier ---------------------------------------------------------

    _modifiersChanged() {
        if (!this._lock)
            return;
        const [, , mods] = global.get_pointer();
        const r = this._lock.update(mods, GLib.get_monotonic_time() / 1000);
        const superKey = this._modifier === 'super';
        if (r.pressed) {
            this._hoveredThisHold = false;
            // The second and third press of a triple press are not Super taps
            if (superKey && this._lock.repeating)
                this._blockTaps();
        }
        if (r.released && this._tapBlocked)
            this._armUnblock();
        if (!r.changed)
            return;
        const c = this._config;
        if (this._lock.active && (c.text || c.color))
            this._requery();
        else
            this._hideHover();
    }

    _blockTaps() {
        if (this._tapBlocked)
            return;
        this._tapBlocked = true;
        GObject.signal_handlers_block_matched(global.display, { signalId: 'overlay-key' });
    }

    _armUnblock() {
        if (this._tapUnblock)
            this._cleanup.release(this._tapUnblock);
        this._tapUnblock = this._cleanup.timeout(TAP_UNBLOCK_MS, () => {
            this._tapUnblock = 0;
            if (!this._lock?.held)
                this._unblockTaps();
        }, { name: 'hover-text-tap-unblock' });
    }

    _unblockTaps() {
        if (!this._tapBlocked)
            return;
        this._tapBlocked = false;
        GObject.signal_handlers_unblock_matched(global.display, { signalId: 'overlay-key' });
    }

    // ---- Hover Text and Hover Color ------------------------------------------------------

    _pointerMoved() {
        if (!this._lock?.active || this._debounce)
            return;
        const c = this._config;
        if (!c.text && !c.color)
            return;
        this._debounce = this._cleanup.timeout(POINTER_DEBOUNCE_MS, () => {
            this._debounce = 0;
            this._requery();
        }, { name: 'hover-text-pointer' });
    }

    _requery() {
        this._query().catch(e => console.error('[Kiwi] hover text: query failed:', e));
    }

    async _query() {
        if (this._inFlight) {
            this._again = true;
            return;
        }
        const gen = this._gen;
        this._inFlight = true;
        try {
            const [x, y] = global.get_pointer();
            const point = { x, y };
            const c = this._config;
            const [found, color] = await Promise.all([
                c.text ? this._textAt(point) : null,
                c.color ? this._pickColor(x, y) : null,
            ]);
            if (gen !== this._gen)
                return;
            if (!this._lock?.active)
                this._hideHover();
            else
                this._showHover(found, color, point);
        } finally {
            if (gen === this._gen) {
                this._inFlight = false;
                if (this._again) {
                    this._again = false;
                    if (this._lock?.active)
                        this._requery();
                }
            }
        }
    }

    async _textAt(point) {
        if (this.testTextAt)
            return this.testTextAt(point);
        const win = windowAt(point);
        if (!win || !this._source?.running)
            return null;
        try {
            return await this._source.textAt(win, point);
        } catch (e) {
            return null;
        }
    }

    _pickColor(x, y) {
        return new Promise(resolve => {
            try {
                new Shell.Screenshot().pick_color(x, y, (shot, res) => {
                    try {
                        const [ok, color] = shot.pick_color_finish(res);
                        resolve(ok && color ? colorHex(color) : null);
                    } catch (e) {
                        resolve(null);
                    }
                });
            } catch (e) {
                resolve(null);
            }
        });
    }

    _showHover(found, color, point) {
        const text = found ? textWindow(found.text, found.offset) : '';
        if (!text && !color) {
            this._hideHover();
            return;
        }
        const panel = this._textPanel;
        panel.setContent({ text: text || null, color });
        const area = monitorAt(point);
        const at = placePanel({ position: 'pointer', pointer: point, size: panel.size, area });
        panel.moveTo(at.x, at.y);
        panel.show(this._cleanup);
        this._hoverOutline.setRect(text ? found.rect : null);
        // One large panel at a time: Hover Typing comes back with the next keystroke
        this._hideTyping();
        this._hoveredThisHold = true;
        if (this._modifier === 'super' && this._lock?.held)
            this._blockTaps();
    }

    _hideHover() {
        this._textPanel?.hide(this._cleanup);
        this._hoverOutline?.setRect(null);
    }

    // ---- Hover Typing and the focus ring --------------------------------------------------

    _a11yEvent(e, gen) {
        if (gen !== this._gen)
            return;
        if (e.kind === 'focus') {
            if (!isFocusGained(e.detail, e.detail1))
                return;
            this._focused = { name: e.name, path: e.path };
            this._hideTyping();
            if (this._config.focus)
                this._showFocus(e.name, e.path, gen);
            return;
        }
        if (!this._config.typing)
            return;
        const f = this._focused;
        if (f && (f.name !== e.name || f.path !== e.path))
            return;
        this._focused = { name: e.name, path: e.path };
        if (this._typingDebounce)
            return;
        // A burst of keystrokes is one read
        this._typingDebounce = this._cleanup.timeout(POINTER_DEBOUNCE_MS, () => {
            this._typingDebounce = 0;
            this._readTyping(gen);
        }, { name: 'hover-typing' });
    }

    async _showFocus(name, path, gen) {
        const info = await this._source?.describe(name, path, { windowFor }).catch(() => null);
        if (gen !== this._gen || !info)
            return;
        this.showFocusRing(info.rect);
    }

    async _readTyping(gen) {
        const f = this._focused;
        if (!f)
            return;
        const info = await this._source?.describe(f.name, f.path, { withText: true, windowFor }).catch(() => null);
        if (gen !== this._gen)
            return;
        if (!info || isSecret(info.role) || info.text === undefined) {
            this._hideTyping();
            return;
        }
        this.showTyping(info.text, info.caret, info.rect);
    }

    /**
     * Draw the focus ring around a stage rect (null hides it); restarts the auto-hide timer.
     * Also the test seam for the focus path.
     */
    showFocusRing(rect) {
        const c = this._config;
        this._ring.setRect(c.focus ? rect : null);
        if (this._ringHide) {
            this._cleanup.release(this._ringHide);
            this._ringHide = 0;
        }
        if (rect && c.focus && c.focusAutohide > 0) {
            this._ringHide = this._cleanup.timeout(c.focusAutohide * 1000, () => {
                this._ringHide = 0;
                this._ring.setRect(null);
            }, { name: 'hover-focus-autohide' });
        }
    }

    /**
     * Show the Hover Typing panel for a field's text and caret (rect: the field, stage
     * coordinates, or null). Also the test seam for the typing path.
     */
    showTyping(text, caret, rect) {
        const c = this._config;
        if (!c.typing)
            return;
        const { before, after } = typingWindow(text, caret);
        if (!before && !after) {
            this._hideTyping();
            return;
        }
        const panel = this._typingPanel;
        panel.setContent({ markup: caretMarkup(before, after, c.caretColor), plain: `${before}${after}` });
        const anchor = this._caret.rect ?? rect;
        const [px, py] = global.get_pointer();
        const area = monitorAt(anchor ?? { x: px, y: py });
        const at = placePanel({ position: c.typingPosition, anchor, pointer: { x: px, y: py }, size: panel.size, area });
        panel.moveTo(at.x, at.y);
        panel.show(this._cleanup);
        this._fieldOutline.setRect(rect);
    }

    _hideTyping() {
        this._typingPanel?.hide(this._cleanup);
        this._fieldOutline?.setRect(null);
    }
}

// The top-most normal window under a stage point on the active workspace
function windowAt(point) {
    const actors = global.get_window_actors();
    const ws = global.workspace_manager.get_active_workspace();
    for (let i = actors.length - 1; i >= 0; i--) {
        const win = actors[i].meta_window;
        if (!win || win.minimized || !win.showing_on_its_workspace?.() || !win.located_on_workspace(ws))
            continue;
        if (win.get_window_type() === Meta.WindowType.DESKTOP)
            continue;
        if (contains(win.get_frame_rect(), point.x, point.y))
            return win;
    }
    return null;
}

// The window of a process for its accessible's coordinates: the focused one, else its top-most
function windowFor(pid) {
    const focus = global.display.focus_window;
    if (focus?.get_pid() === pid)
        return focus;
    const actors = global.get_window_actors();
    for (let i = actors.length - 1; i >= 0; i--) {
        const win = actors[i].meta_window;
        if (win?.get_pid() === pid && !win.minimized)
            return win;
    }
    return null;
}

// The work area of the monitor a stage point is on
function monitorAt(point) {
    const lm = Main.layoutManager;
    const index = lm.monitors.findIndex(m => contains(m, point.x, point.y));
    const monitor = index >= 0 ? index : lm.primaryIndex;
    return Main.layoutManager.getWorkAreaForMonitor(monitor);
}
