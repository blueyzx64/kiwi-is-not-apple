// SPDX-License-Identifier: GPL-3.0-or-later
// Stage Manager geometry: where the strip, its entries and the flying windows go. Pure maths,
// no gi imports (tests: tests/stageManagerGeometry.test.js).
//
//   rect  {x, y, width, height}, absolute pixels

export const METRICS = Object.freeze({
    stripWidth: 200,      // the band the strip owns at the screen edge
    thumbW: 180,          // an entry's box at scale 1
    thumbH: 130,
    gap: 18,
    padTop: 24,
    padBottom: 24,
    minScale: 0.55,       // entries shrink to this at most; then fewer are listed
    floorPad: 14,         // the glass floor around the entries
    cardPad: 14,          // between an entry's box and the window inside it (scaled)
    badge: 34,            // app icon badge at scale 1
    stackMax: 3,          // windows drawn per entry
    tilt: 22,             // degrees: windows turn to face the stage
});

export function overlaps(a, b) {
    return !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width &&
        a.y < b.y + b.height && b.y < a.y + a.height;
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

/**
 * The strip's side. It goes opposite a dock on the left or right edge (macOS); otherwise
 * where the user put it.
 * @param {'left'|'right'} preferred stage-manager-side
 * @param {?string} dockEdge the edge of the dock's layout claim, null without a dock
 */
export function stripSide(preferred, dockEdge) {
    if (dockEdge === 'left')
        return 'right';
    if (dockEdge === 'right')
        return 'left';
    return preferred === 'right' ? 'right' : 'left';
}

/** How many entries fit before they would shrink under minScale. */
export function fitCount(workAreaHeight, wanted, m = METRICS) {
    const avail = workAreaHeight - m.padTop - m.padBottom;
    for (let n = Math.max(0, Math.floor(wanted)); n > 0; n--) {
        if (avail / (n * m.thumbH + (n - 1) * m.gap) >= m.minScale)
            return n;
    }
    return 0;
}

/**
 * Where the strip band, its entries and the glass floor under them go.
 * @param {{workArea: rect, side: 'left'|'right', count: number}} args
 * @returns {{band: rect, slots: rect[], floor: ?rect, scale: number}}
 */
export function stripLayout({ workArea, side, count }, m = METRICS) {
    const x0 = side === 'right' ? workArea.x + workArea.width - m.stripWidth : workArea.x;
    const band = { x: x0, y: workArea.y, width: m.stripWidth, height: workArea.height };
    const n = Math.max(0, Math.floor(count));
    if (n === 0)
        return { band, slots: [], floor: null, scale: 1 };
    const avail = Math.max(1, workArea.height - m.padTop - m.padBottom);
    const scale = Math.min(1, avail / (n * m.thumbH + (n - 1) * m.gap));
    const w = Math.round(m.thumbW * scale);
    const h = Math.round(m.thumbH * scale);
    const gap = Math.round(m.gap * scale);
    const total = n * h + (n - 1) * gap;
    const top = Math.round(workArea.y + m.padTop + (avail - total) / 2);
    const x = Math.round(x0 + (m.stripWidth - w) / 2);
    const slots = [];
    for (let i = 0; i < n; i++)
        slots.push({ x, y: top + i * (h + gap), width: w, height: h });
    const pad = m.floorPad;
    const floor = { x: x - pad / 2, y: top - pad, width: w + pad, height: total + 2 * pad };
    return { band, slots, floor, scale };
}

/**
 * A window's size in an entry: its own aspect, about the same visual weight whatever its
 * shape (scaled toward `fill` of the box area, then fitted in the box).
 */
export function balancedFit(w, h, maxW, maxH, fill = 0.6) {
    if (!(w > 0) || !(h > 0) || !(maxW > 0) || !(maxH > 0))
        return { width: 0, height: 0, scale: 0 };
    let scale = Math.sqrt(clamp(fill, 0, 1) * maxW * maxH / (w * h));
    scale = Math.min(scale, maxW / w, maxH / h);
    return { width: w * scale, height: h * scale, scale };
}

/**
 * Layers of an entry, front first. Back layers peek out toward the screen edge; a set of
 * different apps fans out more and stays opaque.
 */
export function stackLayers(count, side, { set = false } = {}, m = METRICS) {
    const n = clamp(Math.floor(count) || 0, 0, m.stackMax);
    const dir = side === 'right' ? 1 : -1;
    const step = set ? { dx: 16, dy: -12, scale: 0.05, fade: 0.08, tilt: 3 }
        : { dx: 7, dy: -6, scale: 0.06, fade: 0.28, tilt: 0 };
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push({
            index: i, dx: dir * i * step.dx, dy: i * step.dy, scale: 1 - i * step.scale,
            opacity: Math.round(255 * (1 - i * step.fade)), tilt: -dir * i * step.tilt,
        });
    }
    return out;
}

/** Y rotation in degrees: the window's far edge turns away on the stage side. */
export function tiltAngle(side, degrees) {
    return side === 'right' ? -degrees : degrees;
}

/**
 * Where one layer draws its window's frame inside an entry box (box-relative).
 * @param {{width, height}} frame
 * @param {rect} box the entry's slot, padded
 * @param {object} layer from stackLayers()
 * @param {number} scale the strip's scale
 */
export function layerRect(frame, box, layer, scale) {
    const fit = balancedFit(frame.width, frame.height, box.width, box.height);
    const width = fit.width * layer.scale;
    const height = fit.height * layer.scale;
    return {
        x: box.x + (box.width - width) / 2 + layer.dx * scale,
        y: box.y + (box.height - height) / 2 + layer.dy * scale,
        width, height,
    };
}

/** The padded box windows are drawn in, inside a slot (slot-relative). */
export function slotBox(slot, scale, m = METRICS) {
    // Room on the sides for the tilt's near edge, so windows stay on the floor
    const padX = Math.max(6, Math.round(m.cardPad * 1.7 * scale));
    const padY = Math.max(4, Math.round(m.cardPad * 0.7 * scale));
    return { x: padX, y: padY, width: slot.width - 2 * padX, height: slot.height - 2 * padY };
}

/**
 * Pose of a window clone (sized like the buffer) whose frame is drawn in `rect`, centred,
 * aspect kept, turned about the frame centre. Because the pivot is the frame centre, x and y
 * do not depend on scale or angle, so a flight can tween all of them at once.
 * @returns {?{x, y, pivotX, pivotY, scale}} pivot normalised to the buffer size
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

/** A small rect on a point (where a window shrinks to when its entry is not shown). */
export function pointRect(point, frame, width = 24) {
    const h = frame.width > 0 ? width * frame.height / frame.width : width;
    return { x: point.x - width / 2, y: point.y - h / 2, width, height: h };
}

/**
 * The pressure barrier on the strip's screen edge that reveals a hidden strip. Null when
 * another monitor continues past that edge (a barrier would block the pointer crossing).
 * @returns {?{x1, x2, y1, y2, direction: 'positive'|'negative'}}
 */
export function edgeBarrier(workArea, monitor, others, side) {
    const right = side === 'right';
    const x = right ? monitor.x + monitor.width : monitor.x;
    const y1 = workArea.y;
    const y2 = workArea.y + workArea.height;
    const neighbour = others.some(o => {
        const touches = right ? o.x === monitor.x + monitor.width : o.x + o.width === monitor.x;
        return touches && o.y < y2 && o.y + o.height > y1;
    });
    if (neighbour || y2 <= y1)
        return null;
    return { x1: x, x2: x, y1, y2, direction: right ? 'negative' : 'positive' };
}

/**
 * Is the strip shown?
 * @param {object} s
 * @param {boolean} s.showRecent "Show recent apps": off keeps it hidden until revealed
 * @param {boolean} s.autohide steps aside while a stage window overlaps it
 * @param {boolean} s.overlapped a visible stage window overlaps the strip's floor
 * @param {boolean} s.revealed the pointer pushed the edge or is on the strip, or a drag needs it
 * @param {boolean} s.suppressed Mission Control, a full-screen window, nothing to list
 */
export function stripVisible({ showRecent, autohide, overlapped, revealed, suppressed }) {
    if (suppressed)
        return false;
    if (revealed)
        return true;
    if (!showRecent)
        return false;
    return !(autohide && overlapped);
}

/** A duration under the user's animation speed (1 normal, 2 twice as fast). */
export function scaleMs(ms, speed = 1) {
    const s = Number.isFinite(speed) && speed > 0 ? clamp(speed, 0.25, 4) : 1;
    return Math.max(0, Math.round(ms / s));
}

/** +1 when moving to a later workspace, -1 back, 0 none. */
export function workspaceDirection(from, to) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from === to)
        return 0;
    return to > from ? 1 : -1;
}

/** Index of the slot under a point, or -1. */
export function slotAt(slots, point) {
    return slots.findIndex(s => point.x >= s.x && point.x < s.x + s.width &&
        point.y >= s.y && point.y < s.y + s.height);
}
