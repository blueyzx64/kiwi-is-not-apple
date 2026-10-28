// SPDX-License-Identifier: GPL-3.0-or-later
// Trackpad gestures (macOS Trackpad ▸ More Gestures): following one 3+ finger touchpad
// gesture, naming it when the fingers lift, and deciding which Kiwi action it runs and which
// of GNOME's own swipes it must keep from the Shell.
//
// GNOME's swipes (js/ui/swipeTracker.js, GNOME 50) take every 3+ finger touchpad swipe: up
// opens the overview (Mission Control), left and right switch workspaces (Spaces). Kiwi
// leaves them alone and adds what GNOME lacks: 3/4-finger swipe down (App Exposé), pinch with
// the thumb and three fingers (Launchpad) and spread (Show Desktop). A GNOME swipe turned off
// in prefs is held back the way the Shell itself picks a direction: the summed unaccelerated
// motion reaches DRAG_THRESHOLD, and the larger axis wins.
//
// libinput decides early whether 3+ fingers swipe or pinch, from how the distance between
// them changes. Fingers drawing together as they swipe up are often taken for a pinch: GNOME's
// trackers never see that swipe (they only follow swipes), and its scale can fall below
// PINCH_IN, which opened Launchpad instead of Mission Control. A thumb-and-three-finger pinch
// barely moves the fingers' centre; such a swipe moves it a long way. So a "pinch" whose centre
// travelled further than its fingers closed or opened is named a swipe (classify), and Kiwi
// runs what GNOME's swipe would have (routeGesture with stock: false).
//
// Pure JS (no gi imports); tests/gesturesModel.test.js.

/** px of summed unaccelerated motion before a direction is picked (SwipeTracker's value). */
export const DRAG_THRESHOLD = 16;
/** px along the main axis a finished swipe needs: 20 % of SwipeTracker's 300 px touchpad. */
export const SWIPE_DISTANCE = 60;
/** Pinch scale at the end: below PINCH_IN is a pinch, above SPREAD_OUT a spread. */
export const PINCH_IN = 0.75;
export const SPREAD_OUT = 1.35;
/** Fewer fingers than this are scrolling and app gestures (2-finger pinch is zoom). */
export const MIN_FINGERS = 3;
/**
 * A pinch is a swipe when its centre travelled at least PINCH_SWIPE_TRAVEL px, and further
 * than its fingers closed or opened: |1 - scale| x PINCH_SPAN (px across a resting hand on the
 * touchpad, in unaccelerated units).
 */
export const PINCH_SWIPE_TRAVEL = 2 * SWIPE_DISTANCE;
export const PINCH_SPAN = 400;

/** Gesture settings, as the adapter reads them (schema keys gestures-*). */
export const DEFAULT_CONFIG = Object.freeze({
    missionControl: true,   // 3/4-finger swipe up (GNOME's own)
    spaces: true,           // 3/4-finger swipe left/right (GNOME's own)
    appExpose: true,        // 3/4-finger swipe down
    launchpad: true,        // pinch with thumb and three fingers
    showDesktop: true,      // spread with thumb and three fingers
});

/** Follows one gesture from BEGIN to END. */
export class GestureTracker {
    constructor() {
        this.reset();
    }

    reset() {
        this.kind = null;        // 'swipe' | 'pinch'
        this.fingers = 0;
        this.dx = 0;
        this.dy = 0;
        this.scale = 1;
        this.orientation = null; // 'horizontal' | 'vertical' once picked
        this._pending = { x: 0, y: 0 };
    }

    get active() {
        return this.kind !== null;
    }

    /** @param {'swipe'|'pinch'} kind @param {number} fingers */
    begin(kind, fingers) {
        this.reset();
        this.kind = kind;
        this.fingers = fingers;
    }

    /**
     * @returns {?string} the orientation when this update picked it, else null
     */
    update(dx, dy, scale = 1) {
        if (!this.active)
            return null;
        this.dx += dx;
        this.dy += dy;
        if (this.kind === 'pinch')
            this.scale = scale;
        if (this.orientation)
            return null;
        this._pending.x += dx;
        this._pending.y += dy;
        if (Math.hypot(this._pending.x, this._pending.y) < DRAG_THRESHOLD)
            return null;
        this.orientation = Math.abs(this._pending.x) > Math.abs(this._pending.y) ? 'horizontal' : 'vertical';
        return this.orientation;
    }

    /** The finished gesture as plain values, and a reset. */
    finish() {
        const sample = {
            kind: this.kind, fingers: this.fingers, dx: this.dx, dy: this.dy,
            scale: this.scale, orientation: this.orientation,
        };
        this.reset();
        return sample;
    }
}

/**
 * Whether a pinch is really a swipe: its fingers' centre travelled far, and further than the
 * fingers closed or opened (see the header).
 *
 * @param {{dx: number, dy: number, scale: number}} sample
 */
export function pinchIsSwipe({ dx, dy, scale }) {
    const travel = Math.hypot(dx, dy);
    return travel >= PINCH_SWIPE_TRAVEL && travel > Math.abs(1 - scale) * PINCH_SPAN;
}

function swipeDirection(dx, dy, naturalScroll) {
    const sign = naturalScroll ? 1 : -1;
    const x = dx * sign;
    const y = dy * sign;
    if (Math.abs(x) > Math.abs(y)) {
        if (Math.abs(x) < SWIPE_DISTANCE)
            return null;
        return x < 0 ? 'swipe-left' : 'swipe-right';
    }
    if (Math.abs(y) < SWIPE_DISTANCE)
        return null;
    return y < 0 ? 'swipe-up' : 'swipe-down';
}

/**
 * Name a finished gesture.
 *
 * Swipe directions follow GNOME: with natural scrolling (the default) fingers moving up are
 * "up" and open Mission Control; without it, the content direction flips, as the Shell's
 * trackers do, so "down" is always the opposite of what opens Mission Control. A pinch that
 * was a swipe (pinchIsSwipe) gets the swipe's name.
 *
 * @param {{kind, fingers, dx, dy, scale}} sample
 * @param {{naturalScroll?: boolean}} [opts]
 * @returns {?('swipe-up'|'swipe-down'|'swipe-left'|'swipe-right'|'pinch-in'|'spread-out')}
 */
export function classify(sample, { naturalScroll = true } = {}) {
    if (!sample || sample.fingers < MIN_FINGERS)
        return null;
    if (sample.kind === 'pinch') {
        if (pinchIsSwipe(sample))
            return swipeDirection(sample.dx, sample.dy, naturalScroll);
        if (sample.scale <= PINCH_IN)
            return 'pinch-in';
        if (sample.scale >= SPREAD_OUT)
            return 'spread-out';
        return null;
    }
    if (sample.kind !== 'swipe')
        return null;
    return swipeDirection(sample.dx, sample.dy, naturalScroll);
}

/**
 * The action a gesture runs, or null when GNOME's own swipe does it or it is turned off.
 * Desktop actions are core/desktopActionsModel.js ids; three more are the gesture adapter's
 * own: 'close-overview', 'space-next' and 'space-previous'.
 *
 * Stock swipes (GNOME's trackers followed them): up and, in Mission Control, down move the
 * overview; left and right switch Spaces. Kiwi only adds App Exposé on a swipe down from the
 * desktop. A swipe that came as a pinch (stock: false) reached no GNOME tracker, so Kiwi runs
 * all of it, with the same rules: up opens Mission Control (and does nothing in it: it never
 * goes on to the app grid or Launchpad), down closes it, left and right switch Spaces.
 *
 * @param {?string} gesture classify()'s result
 * @param {number} fingers
 * @param {object} config DEFAULT_CONFIG's shape
 * @param {{overview: boolean, stock?: boolean}} state stock: false for a swipe that came as a pinch
 * @returns {?string}
 */
export function routeGesture(gesture, fingers, config, { overview, stock = true }) {
    if (fingers < MIN_FINGERS)
        return null;
    switch (gesture) {
    case 'swipe-up':
        return !stock && !overview && config.missionControl ? 'mission-control' : null;
    case 'swipe-down':
        if (overview)
            return !stock && config.missionControl ? 'close-overview' : null;
        return config.appExpose ? 'app-expose' : null;
    case 'swipe-left':
        return !stock && config.spaces ? 'space-next' : null;
    case 'swipe-right':
        return !stock && config.spaces ? 'space-previous' : null;
    case 'pinch-in':
        return config.launchpad && !overview ? 'launchpad' : null;
    case 'spread-out':
        return config.showDesktop && !overview ? 'desktop' : null;
    }
    return null;
}

/**
 * Whether Kiwi keeps the rest of a swipe from GNOME's trackers: the user turned that GNOME
 * gesture off, or the swipe goes down on the desktop. GNOME's overview tracker can't go below
 * hidden: it would end at 0 and throw "Invalid overview shown transition from HIDDEN to
 * HIDING", and with four fingers close the App Exposé Kiwi just opened. Only on the desktop:
 * in Mission Control the swipes move inside it.
 *
 * @param {?string} orientation the picked orientation
 * @param {{kind: string, fingers: number, dy?: number}} gesture dy: the motion so far
 * @param {object} config
 * @param {{overview: boolean, naturalScroll?: boolean}} state
 * @returns {boolean}
 */
export function blocksStock(orientation, { kind, fingers, dy = 0 }, config, { overview, naturalScroll = true }) {
    if (kind !== 'swipe' || fingers < MIN_FINGERS || overview)
        return false;
    if (orientation === 'vertical')
        return !config.missionControl || dy * (naturalScroll ? 1 : -1) > 0;
    if (orientation === 'horizontal')
        return !config.spaces;
    return false;
}

/** Whether a pinch is Kiwi's (an app never sees a 3+ finger pinch then). */
export function ownsPinch(fingers, config) {
    return fingers >= MIN_FINGERS && (config.launchpad || config.showDesktop);
}
