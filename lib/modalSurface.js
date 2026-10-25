// SPDX-License-Identifier: GPL-3.0-or-later
// ModalSurface: the one glass modal used by Quick Paste and Spotlight.
//
//   const modal = new ModalSurface(cleanup, {
//       id: 'quick-paste', width: 760, height: 440, position: 'center',
//       build: (frame, modal) => { frame.add_child(...); return entry; },   // returns the key-focus actor
//       onKeyPress: (event, modal) => Clutter.EVENT_PROPAGATE,        // bubble phase, after the focus actor
//       onCapturedKey: (event, modal) => Clutter.EVENT_PROPAGATE,     // capture phase, before St.Entry sees it
//       onClosed: () => {},
//   });
//   modal.toggle();
//
// Only one Kiwi modal is open at a time: opening one closes the other one and every overlay
// registered with ModalSurface.registerForeign (the Downloads fan). Esc and a click outside
// the frame close it. The glass comes from Glass.attach (surface 'overlays'); content is the
// frame, which sits above the glass layer as its sibling.

import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Glass } from './glass.js';
import { ModalArbiter } from './modalModel.js';

const LOG = '[Kiwi]';
const SHOW_MS = 150;
const HIDE_MS = 100;
const MARGIN = 32;
const TOP_FRACTION = 0.16;     // default top offset, as a share of the monitor height

const arbiter = new ModalArbiter();

export class ModalSurface {
    /** Register another Kiwi overlay to be closed whenever a modal opens. Returns unregister. */
    static registerForeign(id, close) {
        return arbiter.registerForeign(id, close);
    }

    /** Close the open Kiwi modal and every registered overlay. */
    static closeAll() {
        arbiter.closeAll();
    }

    /** id of the open modal or null. */
    static get openId() {
        return arbiter.current;
    }

    /**
     * @param {object} cleanup CleanupRegistry; the modal closes on dispose
     * @param {object} opts
     * @param {string} opts.id unique name
     * @param {Function} opts.build (frame, modal) -> Clutter.Actor|undefined; runs on every open
     * @param {number} [opts.width] logical px (clamped to the monitor)
     * @param {number} [opts.height]
     * @param {'center'|'top'} [opts.position]
     * @param {number} [opts.offsetTop] px from the monitor top for position 'top' (default 16 % of its height)
     * @param {number} [opts.radius] glass corner radius
     * @param {string} [opts.styleClass] extra class on the frame
     * @param {Function} [opts.onKeyPress] (event, modal) -> Clutter.EVENT_*, bubble phase
     * @param {Function} [opts.onCapturedKey] (event, modal) -> Clutter.EVENT_*, capture phase: use for
     *   Up/Down, which a focused St.Entry swallows before the bubble phase
     * @param {Function} [opts.onClosed]
     */
    constructor(cleanup, opts) {
        this._opts = { position: 'center', radius: 24, ...opts };
        this._overlay = null;
        this._frame = null;
        this._glass = null;
        this._grab = null;
        this._closing = false;
        cleanup.add(() => this.close({ immediate: true }));
    }

    get id() {
        return this._opts.id;
    }

    get isOpen() {
        return !!this._overlay;
    }

    /** The content box of the open modal, null when closed. */
    get frame() {
        return this._frame;
    }

    toggle() {
        if (this.isOpen && !this._closing)
            this.close();
        else
            this.open();
    }

    /** @returns {boolean} false when it was already open or the Shell refused the grab */
    open() {
        const { id, build, width, height, position, radius, styleClass, offsetTop } = this._opts;
        if (this._overlay && !this._closing)
            return false;
        if (this._overlay)
            this.close({ immediate: true });
        if (!arbiter.request(id))
            return false;

        const monitor = Main.layoutManager.primaryMonitor;
        const overlay = new St.Widget({
            name: `kiwi-modal-${id}`,
            style_class: 'kiwi-modal-overlay',
            reactive: true,
            can_focus: true,
            layout_manager: new Clutter.BinLayout(),
        });
        overlay.add_constraint(new Clutter.BindConstraint({
            source: global.stage, coordinate: Clutter.BindCoordinate.ALL,
        }));
        const frame = new St.BoxLayout({
            style_class: `kiwi-modal ${styleClass ?? ''}`.trim(),
            orientation: Clutter.Orientation.VERTICAL,
            reactive: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: position === 'top' ? Clutter.ActorAlign.START : Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });
        if (width)
            frame.set_width(Math.min(width, monitor.width - 2 * MARGIN));
        if (height)
            frame.set_height(Math.min(height, monitor.height - 2 * MARGIN));
        if (position === 'top')
            frame.set_style(`margin-top: ${Math.round(offsetTop ?? monitor.height * TOP_FRACTION)}px;`);
        overlay.add_child(frame);
        Main.layoutManager.addTopChrome(overlay);

        let grab = null;
        try {
            grab = Main.pushModal(overlay, { actionMode: Shell.ActionMode.POPUP });
        } catch (e) {
            console.warn(`${LOG} modal ${id}: pushModal failed: ${e.message}`);
        }
        if (!grab) {
            console.warn(`${LOG} modal ${id}: could not open, pushModal gave no grab (another grab is active?)`);
            Main.layoutManager.removeChrome(overlay);
            overlay.destroy();
            return false;
        }

        this._overlay = overlay;
        this._frame = frame;
        this._grab = grab;
        this._closing = false;

        // Glass goes in under the frame (index 0 of the overlay); the frame stays above it
        try {
            this._glass = Glass.attach(frame, {
                surface: 'overlays', parent: overlay, below: frame,
                radius, role: 'large', name: `kiwi-glass-${id}`,
            });
        } catch (e) {
            console.warn(`${LOG} modal ${id}: glass failed: ${e.message}`);
        }

        overlay.connect('button-press-event', (actor, event) => {
            if (global.stage.get_event_actor(event) !== actor)
                return Clutter.EVENT_PROPAGATE;
            this.close();
            return Clutter.EVENT_STOP;
        });
        overlay.connect('captured-event', (_actor, event) => {
            if (event.type() !== Clutter.EventType.KEY_PRESS)
                return Clutter.EVENT_PROPAGATE;
            return this._opts.onCapturedKey?.(event, this) ?? Clutter.EVENT_PROPAGATE;
        });
        overlay.connect('key-press-event', (_actor, event) => {
            const r = this._opts.onKeyPress?.(event, this);
            if (r === Clutter.EVENT_STOP)
                return r;
            if (event.get_key_symbol() === Clutter.KEY_Escape) {
                this.close();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        overlay.connect('destroy', () => {
            if (this._overlay === overlay)
                this._teardown();
        });

        arbiter.opened(id, () => this.close({ immediate: true }));

        let focus = null;
        try {
            focus = build?.(frame, this);
        } catch (e) {
            console.warn(`${LOG} modal ${id}: build failed: ${e.message}`);
            this.close({ immediate: true });
            return false;
        }
        (focus ?? overlay).grab_key_focus();

        if (Glass.motion) {
            // Fade the overlay, so the glass layer and the frame come in together
            overlay.opacity = 0;
            overlay.ease({
                opacity: 255, duration: SHOW_MS, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        }
        return true;
    }

    /** @param {{immediate?: boolean}} [opts] */
    close({ immediate = false } = {}) {
        if (!this._overlay)
            return;
        if (this._closing && !immediate)
            return;
        if (immediate || !Glass.motion) {
            this._teardown();
            return;
        }
        this._closing = true;
        // The grab is released at once so keys and focus go back; only the fade is deferred
        this._popGrab();
        this._overlay.ease({
            opacity: 0, duration: HIDE_MS, mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => this._teardown(),
        });
    }

    _popGrab() {
        const grab = this._grab;
        this._grab = null;
        if (!grab)
            return;
        try {
            Main.popModal(grab);
        } catch (e) {
            console.warn(`${LOG} popModal failed: ${e.message}`);
        }
    }

    _teardown() {
        const overlay = this._overlay;
        if (!overlay)
            return;
        this._overlay = null;
        overlay.remove_all_transitions();
        this._frame = null;
        this._closing = false;
        arbiter.closed(this._opts.id);
        this._popGrab();
        this._glass?.destroy();
        this._glass = null;
        try {
            Main.layoutManager.removeChrome(overlay);
        } catch (_e) {
            // already gone
        }
        overlay.destroy();
        try {
            this._opts.onClosed?.();
        } catch (e) {
            console.warn(`${LOG} modal onClosed failed: ${e.message}`);
        }
    }
}
