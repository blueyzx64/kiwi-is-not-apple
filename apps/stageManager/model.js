// SPDX-License-Identifier: GPL-3.0-or-later
// Stage Manager model: pure maths and state, no gi imports (tests: tests/stageManagerModel.test.js).
//
// Vocabulary
//   window   {id, appId}                       a plain description; the shell adapter maps real windows to these
//   stage    {id, appId, windows: [id], lead}  one or more windows shown together (grouped by app)
//   rect     {x, y, width, height}             pixels, absolute
//
// The model answers: which stage is on the stage, which ones go to the strip and in what order,
// which windows to show or hide after a switch, and where everything is drawn.

export const DEFAULTS = Object.freeze({
    stripWidth: 200,
    thumbW: 180,
    thumbH: 130,
    gap: 18,
    padTop: 24,
    padBottom: 24,
    minScale: 0.55,       // cards shrink to this at most, then the strip stops listing more
    rotation: 22,         // degrees, see cardTilt(); windows turn to face the stage
    cardPad: 14,          // px between the card's edge and the window inside it (scaled with the card)
    badge: 34,
    stackMax: 3,
    edgeZone: 2,
});

// ---- rect helpers ----------------------------------------------------------------------

export function overlaps(a, b) {
    return a.x < b.x + b.width && b.x < a.x + a.width &&
        a.y < b.y + b.height && b.y < a.y + a.height;
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

// ---- thumbnails ------------------------------------------------------------------------

/**
 * Fit a source into a box, keeping the aspect ratio, never upscaling past 1.
 * @returns {{scale: number, width: number, height: number, x: number, y: number}}
 *   x, y: offset that centres the result in the box.
 */
export function thumbFit(srcW, srcH, boxW, boxH) {
    if (!(srcW > 0) || !(srcH > 0) || !(boxW > 0) || !(boxH > 0))
        return { scale: 0, width: 0, height: 0, x: 0, y: 0 };
    const scale = Math.min(1, boxW / srcW, boxH / srcH);
    const width = srcW * scale;
    const height = srcH * scale;
    return { scale, width, height, x: (boxW - width) / 2, y: (boxH - height) / 2 };
}

/**
 * Thumbnail of a window: the clone shows the whole buffer (client shadows included), so the
 * holder clips it to the frame. `frame` and `buffer` are rects from Meta.Window
 * (get_frame_rect, get_buffer_rect).
 * @returns {{scale, width, height, x, y, cloneX, cloneY, cloneW, cloneH}}
 *   width/height: size of the clipping holder; x/y: its offset in the box;
 *   clone*: place and size of the Clutter.Clone inside the holder.
 */
export function cropThumb(frame, buffer, boxW, boxH) {
    const fit = thumbFit(frame.width, frame.height, boxW, boxH);
    if (fit.scale === 0)
        return { ...fit, cloneX: 0, cloneY: 0, cloneW: 0, cloneH: 0 };
    const s = fit.scale;
    return {
        ...fit,
        cloneX: (buffer.x - frame.x) * s,
        cloneY: (buffer.y - frame.y) * s,
        cloneW: buffer.width * s,
        cloneH: buffer.height * s,
    };
}

/**
 * Size of a window in a strip slot: true aspect ratio, similar visual weight for every window.
 * The window is scaled toward `area` (a share of the slot), then shrunk to fit the slot's
 * max width and height. A tall window ends up as tall as the slot, a wide one as wide, and a
 * normal one in between; none becomes a sliver.
 * @param {number} w  window width
 * @param {number} h  window height
 * @param {number} maxW  slot width
 * @param {number} maxH  slot height
 * @param {number} [fill]  share of the slot's area to aim for (0..1)
 * @returns {{width: number, height: number, scale: number}} scale: from window to slot pixels
 */
export function balancedFit(w, h, maxW, maxH, fill = 0.6) {
    if (!(w > 0) || !(h > 0) || !(maxW > 0) || !(maxH > 0))
        return { width: 0, height: 0, scale: 0 };
    const target = Math.max(0, Math.min(1, fill)) * maxW * maxH;
    let scale = Math.sqrt(target / (w * h));
    scale = Math.min(scale, maxW / w, maxH / h);
    return { width: w * scale, height: h * scale, scale };
}

/**
 * Pose of a window clone (the clone has the buffer's size) whose frame is drawn in `rect`
 * (centred, aspect kept), turned about the frame's centre. The pivot is the frame centre, so
 * position does not depend on scale or rotation and a flight can tween x, y, scale and angle.
 * @param {rect} frame
 * @param {rect} buffer
 * @param {rect} rect
 * @returns {?{x: number, y: number, pivotX: number, pivotY: number, scale: number}}
 *   pivot normalised to the buffer size; x, y: clone position in rect's coordinate space
 */
export function clonePose(frame, buffer, rect) {
    if (!(frame.width > 0) || !(frame.height > 0) || !(buffer.width > 0) || !(buffer.height > 0) ||
        !(rect.width > 0) || !(rect.height > 0))
        return null;
    const px = frame.x - buffer.x + frame.width / 2;
    const py = frame.y - buffer.y + frame.height / 2;
    return {
        x: rect.x + rect.width / 2 - px,
        y: rect.y + rect.height / 2 - py,
        pivotX: px / buffer.width,
        pivotY: py / buffer.height,
        scale: Math.min(rect.width / frame.width, rect.height / frame.height),
    };
}

/**
 * A small rect centred on a point: where a window shrinks to when it has no card to land on.
 * @param {{x: number, y: number}} point
 * @param {rect} frame keeps its aspect ratio
 * @param {number} width
 */
export function pointRect(point, frame, width = 24) {
    const h = frame.width > 0 ? width * frame.height / frame.width : width;
    return { x: point.x - width / 2, y: point.y - h / 2, width, height: h };
}

/**
 * Layers of a stacked card, front first. A stage of one window has one layer.
 * dx points toward the screen edge, so the stack peeks out away from the stage.
 */
export function stackLayers(count, side = 'left', max = DEFAULTS.stackMax) {
    const n = clamp(Math.floor(count) || 0, 0, max);
    const dir = side === 'right' ? 1 : -1;
    const layers = [];
    for (let i = 0; i < n; i++) {
        layers.push({
            index: i,
            dx: dir * i * 7,
            dy: -i * 6,
            scale: 1 - i * 0.06,
            opacity: Math.round(255 * (1 - i * 0.28)),
        });
    }
    return layers;
}

/** Y-rotation of a card in degrees; positive turns the card's far edge away from the viewer on the stage side. */
export function cardTilt(side, degrees = DEFAULTS.rotation) {
    return side === 'right' ? -degrees : degrees;
}

// ---- strip layout ------------------------------------------------------------------------

/**
 * How many cards fit before they would drop under minScale.
 */
export function fitCount(workAreaHeight, wanted, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const avail = workAreaHeight - o.padTop - o.padBottom;
    let n = Math.max(0, Math.floor(wanted));
    while (n > 0) {
        const natural = n * o.thumbH + (n - 1) * o.gap;
        if (avail / natural >= o.minScale)
            return n;
        n--;
    }
    return 0;
}

/**
 * Where the strip and its cards go.
 * @param {{workArea: rect, side: 'left'|'right', count: number}} args (+ DEFAULTS overrides)
 * @returns {{strip: rect, cards: rect[], scale: number}}
 *   cards are absolute rects (card box = thumbW×thumbH × scale), centred vertically.
 */
export function stripLayout({ workArea, side = 'left', count, ...opts }) {
    const o = { ...DEFAULTS, ...opts };
    const stripX = side === 'right' ? workArea.x + workArea.width - o.stripWidth : workArea.x;
    const strip = { x: stripX, y: workArea.y, width: o.stripWidth, height: workArea.height };
    const n = Math.max(0, Math.floor(count));
    if (n === 0)
        return { strip, cards: [], scale: 1 };

    const avail = Math.max(1, workArea.height - o.padTop - o.padBottom);
    const natural = n * o.thumbH + (n - 1) * o.gap;
    const scale = Math.min(1, avail / natural);
    const cardW = o.thumbW * scale;
    const cardH = o.thumbH * scale;
    const gap = o.gap * scale;
    const total = n * cardH + (n - 1) * gap;
    const top = workArea.y + o.padTop + (avail - total) / 2;
    const x = stripX + (o.stripWidth - cardW) / 2;

    const cards = [];
    for (let i = 0; i < n; i++)
        cards.push({ x, y: top + i * (cardH + gap), width: cardW, height: cardH });
    return { strip, cards, scale };
}

/** Thin rect at the screen edge that reveals an auto-hidden strip. */
export function edgeZone(workArea, side = 'left', width = DEFAULTS.edgeZone) {
    const x = side === 'right' ? workArea.x + workArea.width - width : workArea.x;
    return { x, y: workArea.y, width, height: workArea.height };
}

/**
 * Vertical pressure barrier on the strip's screen edge (reveals an auto-hidden strip without a
 * reactive actor over the windows). Null when another monitor continues past that edge, since a
 * barrier there would stop the pointer crossing over.
 * @param {rect} workArea  of the primary monitor
 * @param {rect} monitor   the primary monitor
 * @param {rect[]} others  the other monitors
 * @returns {{x1, x2, y1, y2, direction: 'positive'|'negative'}|null}
 *   direction: the Meta.BarrierDirection that lets the pointer move away from the edge
 */
export function edgeBarrier(workArea, monitor, others = [], side = 'left') {
    const right = side === 'right';
    const x = right ? monitor.x + monitor.width : monitor.x;
    const y1 = workArea.y;
    const y2 = workArea.y + workArea.height;
    const neighbour = others.some(m => {
        const touches = right ? m.x === monitor.x + monitor.width : m.x + m.width === monitor.x;
        return touches && m.y < y2 && m.y + m.height > y1;
    });
    if (neighbour || y2 <= y1)
        return null;
    return { x1: x, x2: x, y1, y2, direction: right ? 'negative' : 'positive' };
}

// ---- stage area ---------------------------------------------------------------------------

/** The part of the work area the stage may use. An auto-hide strip reserves nothing. */
export function stageArea(workArea, { side = 'left', stripWidth = DEFAULTS.stripWidth, autohide = false, stripShown = true } = {}) {
    if (autohide || !stripShown)
        return { ...workArea };
    const x = side === 'right' ? workArea.x : workArea.x + stripWidth;
    return { x, y: workArea.y, width: Math.max(0, workArea.width - stripWidth), height: workArea.height };
}

/**
 * Keep the window's size; only move it (and shrink it if it cannot fit) so it stays inside
 * the stage area. A window already inside is returned unchanged.
 */
export function fitToStage(rect, area) {
    const width = Math.min(rect.width, area.width);
    const height = Math.min(rect.height, area.height);
    return {
        x: clamp(rect.x, area.x, area.x + area.width - width),
        y: clamp(rect.y, area.y, area.y + area.height - height),
        width,
        height,
    };
}

/** A window of this size centred in the stage area (new windows, or after a switch). */
export function centerOnStage(size, area) {
    const width = Math.min(size.width, area.width);
    const height = Math.min(size.height, area.height);
    return {
        x: area.x + (area.width - width) / 2,
        y: area.y + (area.height - height) / 2,
        width,
        height,
    };
}

// ---- auto-hide ----------------------------------------------------------------------------

/**
 * @param {{autohide, overview, stageOverlapsStrip, pointerAtEdge, pointerOnStrip}} s
 * @returns {boolean} true: the strip is shown
 */
export function stripShown({ autohide, overview, stageOverlapsStrip, pointerAtEdge, pointerOnStrip }) {
    if (overview)
        return false;
    if (!autohide)
        return true;
    if (!stageOverlapsStrip)
        return true;
    return !!(pointerAtEdge || pointerOnStrip);
}

// ---- which windows Stage Manager leaves alone ---------------------------------------------

const PIP_TITLE = /picture[\s-]*in[\s-]*picture/i;

/**
 * Windows that float over every stage: always-on-top, on all workspaces, picture-in-picture,
 * or on another monitor than the strip. They are never hidden, moved or listed.
 * @param {{above: boolean, sticky: boolean, title: ?string, monitor: number, primary: number}} w
 */
export function isExempt({ above, sticky, title, monitor, primary }) {
    if (above || sticky)
        return true;
    if (title && PIP_TITLE.test(title))
        return true;
    return monitor !== primary;
}

// ---- focus ------------------------------------------------------------------------------

/**
 * The window that owns a focused dialog: follow transient-for up to the first window the stage
 * manager lists. Returns the window itself when it is listed, null when the chain has none.
 * @param {T} win
 * @param {(w: T) => T|null} parentOf  e.g. w => w.get_transient_for()
 * @param {(w: T) => boolean} isListed
 * @template T
 */
export function focusRoot(win, parentOf, isListed, maxDepth = 16) {
    const seen = new Set();
    for (let w = win, depth = 0; w && depth <= maxDepth && !seen.has(w); depth++) {
        if (isListed(w))
            return w;
        seen.add(w);
        w = parentOf(w);
    }
    return null;
}

// ---- stages and focus ---------------------------------------------------------------------

export class StageModel {
    /**
     * @param {{groupByApp?: boolean, recentCount?: number}} opts
     */
    constructor({ groupByApp = true, recentCount = 6 } = {}) {
        this._group = !!groupByApp;
        this._recent = Math.max(1, Math.floor(recentCount));
        this._wins = new Map();     // id -> {id, appId, stamp}
        this._order = [];           // stage ids, most recent first
        this._current = null;       // stage id on the stage
        this._clock = 0;
    }

    get groupByApp() {
        return this._group;
    }

    get recentCount() {
        return this._recent;
    }

    setRecentCount(n) {
        this._recent = Math.max(1, Math.floor(n));
    }

    /** Regroup all known windows. MRU order of the stages is kept by first appearance. */
    setGroupByApp(on) {
        on = !!on;
        if (on === this._group)
            return;
        const before = this._stages();
        const currentWin = this._current ? this._lead(this._stageById(this._current)) : null;
        this._group = on;
        const seen = [];
        for (const st of before) {
            for (const id of st.windows) {
                const sid = this._stageKey(this._wins.get(id));
                if (!seen.includes(sid))
                    seen.push(sid);
            }
        }
        this._order = seen;
        this._current = currentWin !== null ? this._stageKey(this._wins.get(currentWin)) : null;
        if (this._current)
            this._moveFront(this._current);
    }

    /**
     * Replace the set of live windows. New windows join the stage of their app (when grouping)
     * or get a stage of their own, at the back of the order. Gone windows leave; an empty
     * stage disappears. Order of existing stages is kept.
     * @param {{id: string|number, appId: string|null}[]} windows
     */
    sync(windows) {
        const live = new Map(windows.map(w => [w.id, w]));
        for (const id of [...this._wins.keys()]) {
            if (!live.has(id))
                this._wins.delete(id);
        }
        for (const w of windows) {
            const known = this._wins.get(w.id);
            if (known) {
                known.appId = w.appId ?? null;
            } else {
                this._wins.set(w.id, { id: w.id, appId: w.appId ?? null, stamp: 0 });
            }
        }
        this._rebuildOrder();
    }

    /** Make the stage holding this window the current one. Unknown ids do nothing. */
    focus(id) {
        const win = this._wins.get(id);
        if (!win)
            return { changed: false, stage: this.current };
        win.stamp = ++this._clock;
        const key = this._stageKey(win);
        const changed = this._current !== key;
        this._current = key;
        this._moveFront(key);
        return { changed, stage: this.current };
    }

    /** Switch to a stage by its id. */
    activateStage(stageId) {
        const stage = this._stageById(stageId);
        if (!stage)
            return null;
        this._current = stageId;
        this._moveFront(stageId);
        return this._view(stage);
    }

    /** Take one window out of its group into a stage of its own, right after its old stage in the order. */
    split(id) {
        const win = this._wins.get(id);
        if (!win)
            return null;
        const oldKey = this._stageKey(win);
        win.solo = true;
        const key = this._stageKey(win);
        const wasCurrent = this._current === oldKey;
        const at = this._order.indexOf(oldKey);
        if (!this._order.includes(key))
            this._order.splice(at < 0 ? this._order.length : at + 1, 0, key);
        this._prune();
        if (wasCurrent && !this._stageById(this._current))
            this._current = this._order[0] ?? null;
        return this._view(this._stageById(key));
    }

    /** Nothing is on the stage (e.g. the last window was sent to the strip). */
    unfocus() {
        this._current = null;
    }

    get current() {
        const st = this._current ? this._stageById(this._current) : null;
        return st ? this._view(st) : null;
    }

    stageOf(id) {
        const win = this._wins.get(id);
        const st = win ? this._stageById(this._stageKey(win)) : null;
        return st ? this._view(st) : null;
    }

    /** Stages for the strip: not the current one, most recent first, at most recentCount. */
    strip() {
        return this._stages()
            .filter(st => st.id !== this._current)
            .slice(0, this._recent)
            .map(st => this._view(st));
    }

    /**
     * Is this window parked in the strip: in a stage that has a card (not the current one)?
     * @param {string|number} id
     * @param {number} [stripLimit] cards the strip really shows
     */
    inStrip(id, stripLimit = Infinity) {
        return this.strip().slice(0, Math.max(0, stripLimit)).some(st => st.windows.includes(id));
    }

    /** Every stage, most recent first (current included). */
    stages() {
        return this._stages().map(st => this._view(st));
    }

    /**
     * What to do after a switch: show the current stage's windows, hide the windows of the
     * stages that have a card in the strip. A stage without a card (past recentCount, or past
     * what fits on screen: pass that as stripLimit) is never hidden, or it would be unreachable.
     * @param {number} [stripLimit] cards the strip really shows
     * @returns {{show: (string|number)[], hide: (string|number)[]}}
     */
    visibility(stripLimit = Infinity) {
        const hidden = new Set(this.strip().slice(0, Math.max(0, stripLimit)).map(st => st.id));
        const show = [];
        const hide = [];
        for (const st of this._stages())
            (hidden.has(st.id) ? hide : show).push(...st.windows);
        return { show, hide };
    }

    /** Lead window of the stage holding this app's windows (most recent first), or null. */
    leadForApp(appId) {
        if (appId === null || appId === undefined)
            return null;
        const st = this._stages().find(s => s.appId === appId);
        return st ? this._lead(st) : null;
    }

    get size() {
        return this._wins.size;
    }

    // ---- internals --------------------------------------------------------------------

    _stageKey(win) {
        if (!this._group || win.solo || win.appId === null)
            return `win:${win.id}`;
        return `app:${win.appId}`;
    }

    _stages() {
        const by = new Map();
        for (const win of this._wins.values()) {
            const key = this._stageKey(win);
            if (!by.has(key))
                by.set(key, { id: key, appId: win.appId, windows: [] });
            by.get(key).windows.push(win.id);
        }
        return this._order.filter(k => by.has(k)).map(k => by.get(k));
    }

    _stageById(id) {
        return this._stages().find(st => st.id === id) ?? null;
    }

    _lead(stage) {
        let best = stage.windows[0];
        for (const id of stage.windows) {
            if (this._wins.get(id).stamp > this._wins.get(best).stamp)
                best = id;
        }
        return best;
    }

    _view(stage) {
        return { id: stage.id, appId: stage.appId, windows: [...stage.windows], lead: this._lead(stage) };
    }

    _moveFront(key) {
        const i = this._order.indexOf(key);
        if (i > 0)
            this._order.splice(i, 1);
        if (i !== 0)
            this._order.unshift(key);
    }

    _prune() {
        const keys = new Set([...this._wins.values()].map(w => this._stageKey(w)));
        this._order = this._order.filter(k => keys.has(k));
    }

    _rebuildOrder() {
        const keys = [];
        for (const win of this._wins.values()) {
            const k = this._stageKey(win);
            if (!keys.includes(k))
                keys.push(k);
        }
        const kept = this._order.filter(k => keys.includes(k));
        const fresh = keys.filter(k => !kept.includes(k));
        this._order = [...kept, ...fresh];
        if (this._current && !keys.includes(this._current))
            this._current = null;
    }
}
