// SPDX-License-Identifier: GPL-3.0-or-later
// Makes windows semi-transparent while being moved or resized for visual feedback.

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

const TRANSPARENT_ON_MOVING = true;
const TRANSPARENT_ON_RESIZING = true;
const TRANSITION_TIME = 0.2; // in seconds
const WINDOW_OPACITY = 230; // Opacity value (0-255)

const GRAB_MOVING_OPERATIONS = [
    Meta.GrabOp.MOVING,
    Meta.GrabOp.KEYBOARD_MOVING,
    Meta.GrabOp.MOVING_UNCONSTRAINED,
];

const GRAB_RESIZING_OPERATIONS = [
    Meta.GrabOp.RESIZING_NW,
    Meta.GrabOp.RESIZING_N,
    Meta.GrabOp.RESIZING_NE,
    Meta.GrabOp.RESIZING_E,
    Meta.GrabOp.RESIZING_SW,
    Meta.GrabOp.RESIZING_S,
    Meta.GrabOp.RESIZING_SE,
    Meta.GrabOp.RESIZING_W,
    Meta.GrabOp.KEYBOARD_RESIZING_UNKNOWN,
    Meta.GrabOp.KEYBOARD_RESIZING_NW,
    Meta.GrabOp.KEYBOARD_RESIZING_N,
    Meta.GrabOp.KEYBOARD_RESIZING_NE,
    Meta.GrabOp.KEYBOARD_RESIZING_E,
    Meta.GrabOp.KEYBOARD_RESIZING_SW,
    Meta.GrabOp.KEYBOARD_RESIZING_S,
    Meta.GrabOp.KEYBOARD_RESIZING_SE,
    Meta.GrabOp.KEYBOARD_RESIZING_W,
];

export class TransparentMove {
    constructor() {
        // Original opacity per Meta.Window; keyed on the window (not the pid, which
        // several windows of one app share) and weak so closed windows drop out.
        this._windowOpacity = new WeakMap();
    }

    initGrabOperations() {
        this._allowedGrabOperations = [];
        if (TRANSPARENT_ON_MOVING) {
            this._allowedGrabOperations.push(...GRAB_MOVING_OPERATIONS);
        }
    
        if (TRANSPARENT_ON_RESIZING) {
            this._allowedGrabOperations.push(...GRAB_RESIZING_OPERATIONS);
        }
    }

    isGrabOperationAllowed(grabOp) {
        return this._allowedGrabOperations.indexOf(grabOp) > -1;
    }

    setOpacity(windowSurfaces, targetOpacity, onComplete) {
        const completeFunc = () => {
            if (onComplete)
                onComplete();
        };

        if (windowSurfaces.length === 0) {
            completeFunc();
            return;
        }

        if (TRANSITION_TIME < 0.001) {
            windowSurfaces.forEach(surface => {
                surface.opacity = targetOpacity;
            });
            completeFunc();
        } else {
            windowSurfaces.forEach(surface => {
                surface.ease({
                    duration: TRANSITION_TIME * 1000,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    opacity: targetOpacity,
                    onComplete: completeFunc,
                });
            });
        }
    }

    getWindowSurfaces(metaWindow) {
        const windowActor = metaWindow.get_compositor_private();
        if (!windowActor)
            return [];

        const surfaces = this.findMetaSurfaceActors(windowActor);
        if (surfaces.length > 0)
            return surfaces;

        return [windowActor];
    }

    findMetaSurfaceActors(metaActor) {
        if (metaActor.constructor.name.indexOf('MetaSurfaceActor') > -1) {
            return [metaActor];
        }
        
        const surfaces = [];
        for (const child of metaActor.get_children()) {
            const result = this.findMetaSurfaceActors(child);
            if (result.length > 0) {
                surfaces.push(...result);
            }
        }

        return surfaces;
    }

    windowGrabBegin(metaDisplay, metaWindow, metaGrabOp, gpointer) {
        if (!metaWindow || !this.isGrabOperationAllowed(metaGrabOp)) {
            return;
        }
    
        const windowSurfaces = this.getWindowSurfaces(metaWindow);
        if (windowSurfaces.length === 0)
            return;

        if (!this._windowOpacity.has(metaWindow))
            this._windowOpacity.set(metaWindow, windowSurfaces[0].opacity);

        this.setOpacity(windowSurfaces, WINDOW_OPACITY);
    }

    windowGrabEnd(metaDisplay, metaWindow, metaGrabOp, gpointer) {
        if (!metaWindow || !this.isGrabOperationAllowed(metaGrabOp)) {
            return;
        }
    
        const windowSurfaces = this.getWindowSurfaces(metaWindow);
        if (windowSurfaces.length === 0)
            return;

        const opacity = this._windowOpacity.get(metaWindow);
        if (opacity === undefined)
            return;

        this.setOpacity(windowSurfaces, opacity, () => this._windowOpacity?.delete(metaWindow));
    }

    enable() {
        this.initGrabOperations();
        this._onWindowGrabBegin = global.display.connect('grab-op-begin', this.windowGrabBegin.bind(this));
        this._onWindowGrabEnd = global.display.connect('grab-op-end', this.windowGrabEnd.bind(this));
    }

    disable() {
        global.display.disconnect(this._onWindowGrabBegin);
        global.display.disconnect(this._onWindowGrabEnd);

        // A window mid-move or mid-fade would stay dimmed; stopping the fade also
        // skips its onComplete, which would touch the state deleted below
        for (const actor of global.get_window_actors()) {
            const opacity = this._windowOpacity.get(actor.meta_window);
            if (opacity === undefined)
                continue;
            for (const surface of this.getWindowSurfaces(actor.meta_window)) {
                surface.remove_all_transitions();
                surface.opacity = opacity;
            }
        }

        delete this._windowOpacity;
        delete this._allowedGrabOperations;
        delete this._onWindowGrabBegin;
        delete this._onWindowGrabEnd;
    }
}

let transparentMoveInstance = null;

export function enable() {
    if (!transparentMoveInstance) {
        transparentMoveInstance = new TransparentMove();
        transparentMoveInstance.enable();
    }
}

export function disable() {
    if (transparentMoveInstance) {
        transparentMoveInstance.disable();
        transparentMoveInstance = null;
    }
}
