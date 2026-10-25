// SPDX-License-Identifier: GPL-3.0-or-later
// Pure logic for the auto-hide top bar. No gi imports, so it runs under `gjs -m` tests.
//
// The Shell adapter (coordinators/panelVisibility.js) feeds events into step() and runs the
// timer effects it returns. visible(state) says whether the bar should be on screen.

export const MODES = ['always', 'fullscreen-hover', 'autohide'];

/** Old key -> new keys. Run through runMigrations (idempotent, never resets the old key). */
export const MIGRATIONS = [
    // The old fullscreen-hover toggle becomes the master switch ...
    { from: 'panel-hover-fullscreen', to: 'panel-autohide' },
    // ... and a user who had it on keeps the old "fullscreen only" behaviour.
    { from: 'panel-hover-fullscreen', to: 'panel-autohide-fullscreen-only' },
];

/**
 * @param {{autohide: boolean, fullscreenOnly: boolean}} cfg
 * @returns {'always'|'fullscreen-hover'|'autohide'}
 */
export function modeFromSettings({ autohide, fullscreenOnly }) {
    if (!autohide)
        return 'always';
    return fullscreenOnly ? 'fullscreen-hover' : 'autohide';
}

export function initialState(patch = {}) {
    return {
        mode: 'autohide',
        keepOnDesktop: false,
        fullscreen: false,
        overview: false,
        desktop: false,       // no real window is showing on the primary monitor
        holds: [],            // tokens from requiresVisibility holds
        revealed: false,      // the user asked for the bar (edge push) and the hide timer is pending
        edgePending: false,   // a reveal timer is running
        pointerInside: false, // pointer is over the bar
        hideTimer: false,
        ...patch,
    };
}

/** Should the bar be on screen? */
export function visible(s) {
    if (s.mode === 'always')
        return true;
    if (s.overview || s.holds.length > 0)
        return true;
    if (s.mode === 'fullscreen-hover')
        return !s.fullscreen || s.revealed;
    return (s.keepOnDesktop && s.desktop) || s.revealed;
}

/** The strut is kept only while the stock layout is wanted (always, or fullscreen-hover off fullscreen). */
export function wantsStrut(s) {
    if (s.mode === 'always')
        return true;
    if (s.mode === 'fullscreen-hover')
        return !s.fullscreen;
    return false;
}

function scheduleHide(s, cfg, effects) {
    s.hideTimer = true;
    effects.push({ type: 'timer', name: 'hide', ms: cfg.hideDelay });
}

function cancelTimer(s, name, effects) {
    if (name === 'hide') {
        if (!s.hideTimer)
            return;
        s.hideTimer = false;
    } else {
        if (!s.edgePending)
            return;
        s.edgePending = false;
    }
    effects.push({ type: 'cancel', name });
}

function reveal(s, cfg, effects) {
    s.revealed = true;
    cancelTimer(s, 'reveal', effects);
    if (!s.pointerInside && s.holds.length === 0)
        scheduleHide(s, cfg, effects);
    else
        cancelTimer(s, 'hide', effects);
}

function dropReveal(s, effects) {
    s.revealed = false;
    cancelTimer(s, 'reveal', effects);
    cancelTimer(s, 'hide', effects);
}

/**
 * @param {object} state previous state (not mutated)
 * @param {object} event {type: 'edge-pressure'|'edge-left'|'reveal-now'|'reveal-timer'|'hide-timer'}
 *   | {type:'pointer', inside} | {type:'hold', id} | {type:'release', id} | {type:'set', patch}
 * @param {{revealDelay: number, hideDelay: number}} cfg
 * @returns {{state: object, effects: object[]}}
 */
export function step(state, event, cfg) {
    const s = { ...state, holds: [...state.holds] };
    const effects = [];

    switch (event.type) {
    case 'edge-pressure':
        if (s.mode === 'always' || s.revealed || s.edgePending)
            break;
        if (cfg.revealDelay <= 0) {
            reveal(s, cfg, effects);
        } else {
            s.edgePending = true;
            effects.push({ type: 'timer', name: 'reveal', ms: cfg.revealDelay });
        }
        break;
    case 'edge-left':
        cancelTimer(s, 'reveal', effects);
        break;
    case 'reveal-now':
        if (s.mode !== 'always')
            reveal(s, cfg, effects);
        break;
    case 'reveal-timer':
        s.edgePending = false;
        if (s.mode !== 'always')
            reveal(s, cfg, effects);
        break;
    case 'hide-timer':
        s.hideTimer = false;
        if (!s.pointerInside && s.holds.length === 0)
            s.revealed = false;
        break;
    case 'pointer':
        s.pointerInside = !!event.inside;
        if (s.pointerInside)
            cancelTimer(s, 'hide', effects);
        else if (s.revealed && s.holds.length === 0)
            scheduleHide(s, cfg, effects);
        break;
    case 'hold':
        if (!s.holds.includes(event.id))
            s.holds.push(event.id);
        cancelTimer(s, 'hide', effects);
        break;
    case 'release':
        s.holds = s.holds.filter(h => h !== event.id);
        if (s.holds.length === 0 && s.revealed && !s.pointerInside)
            scheduleHide(s, cfg, effects);
        break;
    case 'set': {
        const before = state;
        Object.assign(s, event.patch);
        // Leaving always-on, the overview, or fullscreen starts from a clean slate.
        if (s.mode === 'always' ||
            (before.overview && !s.overview) ||
            (before.fullscreen !== s.fullscreen))
            dropReveal(s, effects);
        break;
    }
    default:
        break;
    }
    return { state: s, effects };
}

/**
 * Horizontal runs of the primary monitor's top edge where a barrier may sit.
 * Left out: the hot corner, and any stretch with another monitor directly above (a barrier
 * there would stop the pointer moving up to that monitor).
 *
 * @param {{x:number,y:number,width:number,height:number}} primary
 * @param {{x:number,y:number,width:number,height:number}[]} others
 * @param {{hotCornerSize?: number, rtl?: boolean}} opts hotCornerSize 0 = no hot corner
 * @returns {[number, number][]} [x1, x2] pairs, sorted, non-empty
 */
export function edgeSegments(primary, others, { hotCornerSize = 0, rtl = false } = {}) {
    let start = primary.x;
    let end = primary.x + primary.width;
    if (hotCornerSize > 0) {
        if (rtl)
            end -= hotCornerSize;
        else
            start += hotCornerSize;
    }
    const blocked = others
        .filter(m => m.y + m.height === primary.y && m.x < end && m.x + m.width > start)
        .map(m => [Math.max(m.x, start), Math.min(m.x + m.width, end)])
        .sort((a, b) => a[0] - b[0]);

    const out = [];
    let cursor = start;
    for (const [bx1, bx2] of blocked) {
        if (bx1 > cursor)
            out.push([cursor, bx1]);
        cursor = Math.max(cursor, bx2);
    }
    if (cursor < end)
        out.push([cursor, end]);
    return out;
}

/** True when another monitor sits directly above any part of the primary monitor. */
export function hasMonitorAbove(primary, others) {
    return others.some(m => m.y + m.height === primary.y &&
        m.x < primary.x + primary.width && m.x + m.width > primary.x);
}
