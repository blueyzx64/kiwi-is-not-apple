// SPDX-License-Identifier: GPL-3.0-or-later
// Notch state machine. Pure: no gi:// imports, no clocks, no timers. The caller passes `now`
// (ms, any monotonic base) in every event, runs the deadline from nextDeadline() and sends a
// 'tick' when it fires. Tested by tests/notchStateMachine.test.js.
//
// What the notch shows (kind of view(state)):
//   idle           190x32   nothing
//   live-activity  250x32   a persistent activity (media), lowest priority above idle
//   osd            270x32   a volume / brightness / "Copied" confirmation, 1.5 s, preempts everything
//   compact        290x32   a one-line notification (feedback, low urgency, fullscreen)
//   expanded       430x140  a notification card, or 640x200 for the dashboard
//
// Priority, highest first: osd, critical notification, dashboard, other notification,
// live activity, idle. While an osd shows, the timers of what is underneath are paused and
// resume with the time they had left. Critical notifications are sticky (no timeout).
// A newer notification of the same or higher urgency replaces the one on screen (which goes
// back to the queue) unless the pointer is over it. The queue badge counts what is waiting.

export const URGENCY = Object.freeze({ LOW: 0, NORMAL: 1, HIGH: 2, CRITICAL: 3 });

export const SIZES = Object.freeze({
    'idle': { w: 190, h: 32, r: 16 },
    'live-activity': { w: 250, h: 32, r: 16 },
    'osd': { w: 270, h: 32, r: 16 },
    'compact': { w: 290, h: 32, r: 16 },
    'notification': { w: 430, h: 140, r: 32 },
    'dashboard': { w: 640, h: 200, r: 36 },
});

export const DEFAULT_CONFIG = Object.freeze({
    notifications: true,
    activities: true,
    osd: true,
    normalMs: 5000,
    highMs: 8000,
    compactMs: 3000,
    osdMs: 1500,
    hoverGraceMs: 1500,     // minimum time left after the pointer leaves a card
    dashboardLeaveMs: 2500, // dashboard closes this long after the pointer leaves it
    maxPending: 8,
});

export function initialState(now = 0) {
    return {
        now,
        dnd: false,
        fullscreen: false,
        hover: false,
        current: null,      // {id, urgency, forFeedback, at, compact, until, hovered, remaining}
        pending: [],        // same shape without timing, newest first within an urgency
        activities: [],     // [{key, priority, data, at}] in insertion order
        osd: null,          // {kind, level, maxLevel, icon, startedAt, until}
        dashboard: null,    // null | {until: number|null}
    };
}

const clone = s => ({
    ...s,
    pending: s.pending.slice(),
    activities: s.activities.slice(),
});

const isCritical = n => n.urgency >= URGENCY.CRITICAL;

// Newest first within the same urgency; higher urgency first.
function compareQueue(a, b) {
    if (a.urgency !== b.urgency)
        return b.urgency - a.urgency;
    return b.at - a.at;
}

function timeoutFor(entry, cfg) {
    if (isCritical(entry))
        return null;
    if (entry.compact)
        return cfg.compactMs;
    return entry.urgency >= URGENCY.HIGH ? cfg.highMs : cfg.normalMs;
}

function startShowing(s, entry, cfg) {
    const ms = timeoutFor(entry, cfg);
    s.current = {
        ...entry,
        until: ms === null ? null : s.now + ms,
        hovered: false,
        remaining: null,
    };
    // A card appearing under a pointer that already rests on the notch counts as hover only
    // after the pointer moves (the view reports it), so start un-hovered.
}

// Fill `current` from the queue unless a dashboard is open (critical ones skip the queue).
function promote(s, cfg) {
    if (s.current || s.dashboard || !s.pending.length)
        return;
    const entry = s.pending.shift();
    startShowing(s, entry, cfg);
}

function capPending(s, cfg) {
    while (s.pending.length > cfg.maxPending)
        s.pending.pop();    // the lowest urgency, oldest; it stays in the message list
}

function admits(s, ev, cfg) {
    if (!cfg.notifications)
        return false;
    const critical = ev.urgency >= URGENCY.CRITICAL;
    if (critical)
        return true;
    if (s.dnd)
        return false;
    if (s.fullscreen && !ev.forFeedback)
        return false;
    return true;
}

function onNotify(s, ev, cfg) {
    if (!admits(s, ev, cfg))
        return;
    const urgency = ev.urgency ?? URGENCY.NORMAL;
    const forFeedback = !!ev.forFeedback;
    const entry = {
        id: ev.id,
        urgency,
        forFeedback,
        at: ev.now,
        compact: forFeedback || urgency <= URGENCY.LOW || s.fullscreen,
    };
    // Same id again: the notification was updated. Refresh in place.
    if (s.current?.id === entry.id) {
        const keep = s.current;
        startShowing(s, entry, cfg);
        s.current.hovered = keep.hovered;
        s.current.remaining = keep.remaining;
        if (keep.hovered)
            s.current.until = null;
        return;
    }
    s.pending = s.pending.filter(n => n.id !== entry.id);

    const critical = isCritical(entry);
    if (!s.current && (!s.dashboard || critical)) {
        startShowing(s, entry, cfg);
    } else if (s.current && (!s.current.hovered || critical) && entry.urgency >= s.current.urgency &&
               (!s.dashboard || critical)) {
        const { id, urgency, forFeedback, at, compact } = s.current;
        s.pending.push({ id, urgency, forFeedback, at, compact });
        startShowing(s, entry, cfg);
    } else {
        s.pending.push(entry);
    }
    s.pending.sort(compareQueue);
    capPending(s, cfg);
}

function dropCurrent(s, cfg) {
    s.current = null;
    promote(s, cfg);
}

function onTick(s, ev, cfg) {
    if (s.osd && s.now >= s.osd.until) {
        // Whatever sat underneath had its clock stopped for the osd's whole life.
        const paused = s.osd.until - s.osd.startedAt;
        s.osd = null;
        if (s.current && s.current.until !== null)
            s.current = { ...s.current, until: s.current.until + paused };
        if (s.dashboard && s.dashboard.until !== null)
            s.dashboard = { until: s.dashboard.until + paused };
    }
    if (s.osd)
        return;
    if (s.current && !s.current.hovered && s.current.until !== null && s.now >= s.current.until)
        dropCurrent(s, cfg);
    if (s.dashboard && s.dashboard.until !== null && s.now >= s.dashboard.until) {
        s.dashboard = null;
        promote(s, cfg);
    }
}

function onHover(s, ev, cfg) {
    const hover = !!ev.value;
    s.hover = hover;
    if (s.current) {
        const cur = { ...s.current };
        if (hover && !cur.hovered) {
            cur.hovered = true;
            cur.remaining = cur.until === null ? null : Math.max(0, cur.until - s.now);
            cur.until = null;
        } else if (!hover && cur.hovered) {
            cur.hovered = false;
            const timeout = timeoutFor(cur, cfg);
            cur.until = timeout === null ? null
                : s.now + Math.max(cur.remaining ?? 0, cfg.hoverGraceMs);
            cur.remaining = null;
        }
        s.current = cur;
    }
    if (s.dashboard)
        s.dashboard = { until: hover ? null : s.now + cfg.dashboardLeaveMs };
}

function onClick(s, ev, cfg, effects) {
    if (s.osd)
        return;
    if (s.current && (isCritical(s.current) || !s.dashboard)) {
        effects.push({ type: 'activate', id: s.current.id });
        dropCurrent(s, cfg);
        return;
    }
    if (s.dashboard) {
        s.dashboard = null;
        promote(s, cfg);
        return;
    }
    // Opening the dashboard sends what is waiting back to the queue.
    s.dashboard = { until: s.hover ? null : s.now + cfg.dashboardLeaveMs };
}

function onOsd(s, ev, cfg) {
    if (!cfg.osd)
        return;
    const started = s.osd ? s.osd.startedAt : ev.now;
    s.osd = {
        kind: ev.kind,
        level: ev.level ?? null,
        maxLevel: ev.maxLevel ?? null,
        icon: ev.icon ?? null,
        label: ev.label ?? null,
        startedAt: started,
        until: ev.now + cfg.osdMs,
    };
}

function onActivity(s, ev, cfg) {
    if (!cfg.activities)
        return;
    const rest = s.activities.filter(a => a.key !== ev.key);
    if (ev.data === null || ev.data === undefined) {
        s.activities = rest;
        return;
    }
    const old = s.activities.find(a => a.key === ev.key);
    s.activities = [...rest, { key: ev.key, priority: ev.priority ?? 0, data: ev.data, at: old?.at ?? ev.now }];
}

function applyConfig(s, cfg) {
    if (!cfg.notifications) {
        s.current = null;
        s.pending = [];
    }
    if (!cfg.activities)
        s.activities = [];
    if (!cfg.osd)
        s.osd = null;
}

function onSet(s, ev, cfg) {
    const patch = ev.patch ?? {};
    if ('dnd' in patch)
        s.dnd = !!patch.dnd;
    if ('fullscreen' in patch)
        s.fullscreen = !!patch.fullscreen;
    applyConfig(s, cfg);
    // Non-critical notifications that would no longer be admitted leave the queue; one that is
    // already on screen finishes its time.
    const blocked = n => !isCritical(n) && (s.dnd || (s.fullscreen && !n.forFeedback));
    s.pending = s.pending.filter(n => !blocked(n));
}

/**
 * @param {object} state from initialState()/step()
 * @param {object} ev {type, now, ...}: notify, notify-removed, activity, osd, hover, click,
 *   dismiss, tick, set
 * @param {object} [config] DEFAULT_CONFIG overrides
 * @returns {{state: object, effects: object[]}} effects: {type:'activate'|'dismiss', id}
 */
export function step(state, ev, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const s = clone(state);
    const effects = [];
    if (typeof ev.now === 'number')
        s.now = Math.max(s.now, ev.now);
    ev = { ...ev, now: s.now };

    switch (ev.type) {
    case 'notify':
        onNotify(s, ev, cfg);
        break;
    case 'notify-removed':
        s.pending = s.pending.filter(n => n.id !== ev.id);
        if (s.current?.id === ev.id)
            dropCurrent(s, cfg);
        break;
    case 'activity':
        onActivity(s, ev, cfg);
        break;
    case 'osd':
    case 'confirm': // "Copied" and the like: an osd without a level
        onOsd(s, ev, cfg);
        break;
    case 'hover':
        onHover(s, ev, cfg);
        break;
    case 'click':
        onClick(s, ev, cfg, effects);
        break;
    case 'dismiss':
        if (s.current) {
            effects.push({ type: 'dismiss', id: s.current.id });
            dropCurrent(s, cfg);
        }
        break;
    case 'tick':
        onTick(s, ev, cfg);
        break;
    case 'set':
        onSet(s, ev, cfg);
        break;
    default:
        break;
    }
    return { state: s, effects };
}

function topActivity(s) {
    let best = null;
    for (const a of s.activities) {
        if (!best || a.priority > best.priority || (a.priority === best.priority && a.at >= best.at))
            best = a;
    }
    return best;
}

/**
 * What to draw.
 * @returns {{kind: 'idle'|'live-activity'|'osd'|'compact'|'expanded', content: string|null,
 *   size: {w:number,h:number,r:number}, notificationId: any, badge: number, activity: object|null,
 *   osd: object|null}}
 */
export function view(state) {
    const badge = state.pending.length;
    const make = (kind, content, sizeKey, extra = {}) => ({
        kind, content, size: SIZES[sizeKey], notificationId: null, badge: 0,
        activity: null, osd: null, ...extra,
    });
    if (state.osd)
        return make('osd', null, 'osd', { osd: state.osd });
    if (state.current && isCritical(state.current)) {
        return make('expanded', 'notification', 'notification',
            { notificationId: state.current.id, badge });
    }
    if (state.dashboard)
        return make('expanded', 'dashboard', 'dashboard', { badge, activity: topActivity(state) });
    if (state.current) {
        return state.current.compact
            ? make('compact', 'notification', 'compact', { notificationId: state.current.id, badge })
            : make('expanded', 'notification', 'notification', { notificationId: state.current.id, badge });
    }
    const activity = topActivity(state);
    if (activity)
        return make('live-activity', 'activity', 'live-activity', { activity });
    return make('idle', null, 'idle');
}

/** The next time a 'tick' is due, or null. While an osd shows, only the osd's end counts. */
export function nextDeadline(state) {
    if (state.osd)
        return state.osd.until;
    const times = [];
    if (state.current && !state.current.hovered && state.current.until !== null)
        times.push(state.current.until);
    if (state.dashboard && state.dashboard.until !== null)
        times.push(state.dashboard.until);
    return times.length ? Math.min(...times) : null;
}

/**
 * Should the top bar be held on screen? True while the notch shows something transient. A
 * live activity alone does not hold: it would pin an auto-hidden bar for as long as music plays.
 */
export function wantsBar(state) {
    const kind = view(state).kind;
    return kind === 'osd' || kind === 'compact' || kind === 'expanded';
}
