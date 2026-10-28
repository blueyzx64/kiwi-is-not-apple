// SPDX-License-Identifier: GPL-3.0-or-later
// The shelf drag-out helper (helpers/kiwi-shelf-helper): the pure parts of talking to it.
// No gi:// imports. Tested by tests/dragHelperModel.test.js.

export const HELPER = Object.freeze({
    command: 'kiwi-shelf-helper',
    appId: 'org.kiwi.ShelfHelper',
    title: 'Kiwi Shelf',
});

/** True for the helper's own window (matched by class and title, never by title alone). */
export function isHelperWindow(wmClass, title) {
    return wmClass === HELPER.appId && title === HELPER.title;
}

const whole = n => Math.round(n);

/**
 * The layout message: the helper window's box and each item's box inside it.
 * @param {{x: number, y: number, w: number, h: number}} box where the window goes (stage px)
 * @param {Array<{uri: string, icon: string, x: number, y: number, w: number, h: number}>} tiles stage px
 * @returns {{box: object, line: string}} the window's frame and the JSON line to send
 */
export function layoutOf(box, tiles) {
    const frame = { x: whole(box.x), y: whole(box.y), w: Math.max(1, whole(box.w)), h: Math.max(1, whole(box.h)) };
    const items = tiles.map(t => ({
        uri: t.uri,
        icon: t.icon ?? '',
        x: whole(t.x - frame.x),
        y: whole(t.y - frame.y),
        w: Math.max(1, whole(t.w)),
        h: Math.max(1, whole(t.h)),
    }));
    return { box: frame, line: JSON.stringify({ type: 'layout', w: frame.w, h: frame.h, items }) };
}

/** The line that closes the window. */
export const CLEAR_LINE = JSON.stringify({ type: 'layout', w: 1, h: 1, items: [] });

/**
 * One line from the helper, or null when it is not a known event.
 * @returns {{event: 'click', uri: string}|{event: 'drag', state: 'begin'|'end', uri: string, ok: boolean}|
 *   {event: 'hover', value: boolean}|{event: 'ready'}|null}
 */
export function parseEvent(line) {
    let m;
    try {
        m = JSON.parse(line);
    } catch (_e) {
        return null;
    }
    if (!m || typeof m !== 'object')
        return null;
    switch (m.event) {
    case 'ready':
        return { event: 'ready' };
    case 'hover':
        return typeof m.value === 'boolean' ? { event: 'hover', value: m.value } : null;
    case 'click':
        return typeof m.uri === 'string' ? { event: 'click', uri: m.uri } : null;
    case 'drag':
        return (m.state === 'begin' || m.state === 'end') && typeof m.uri === 'string'
            ? { event: 'drag', state: m.state, uri: m.uri, ok: m.ok !== false } : null;
    default:
        return null;
    }
}

/**
 * Whether the pointer counts as being on the notch through the helper: over its window, or while
 * a drag from the shelf is running (the pointer is then far away and the dashboard must stay).
 */
export function pointerOnNotch({ helper, dragging }) {
    return !!(helper || dragging);
}

/** The icon name the helper puts on the drag (a themed icon's first name), or ''. */
export function dragIconName(gicon) {
    if (!gicon)
        return '';
    const names = typeof gicon.get_names === 'function' ? gicon.get_names() : null;
    return names?.length ? names[0] : '';
}

/** How the helper hands a file to an app at a drop point (lib/dragOut.js). */
export const DROP = Object.freeze({
    size: 24,        // the helper's window, px
    offset: 40,      // from the drop point to the press: well past GTK's drag threshold (8 px)
    steps: 6,        // pointer moves from the press back to the drop point
});

/**
 * The plan for dropping a file at a point through the helper: its window goes beside the drop
 * point (on the side with room, inside the monitor), the press lands on it, and the pointer
 * moves back to the drop point in a few steps, which starts the helper's drag; the release
 * then drops on whatever lies under the point.
 *
 * @param {{x: number, y: number}} at the drop point (stage px)
 * @param {{x: number, y: number, width: number, height: number}} monitor the drop point's monitor
 * @param {object} [o] DROP overrides
 * @returns {{box: {x, y, w, h}, press: number[], path: number[][]}} the path ends on the drop point
 */
export function dropPlan(at, monitor, o = DROP) {
    const { size, offset, steps } = { ...DROP, ...o };
    const x = Math.round(at.x);
    const y = Math.round(at.y);
    const half = Math.floor(size / 2);
    // Beside the drop point: to its right, or to its left at the monitor's right edge
    const right = x + offset + half < monitor.x + monitor.width;
    const cx = Math.max(monitor.x + half, Math.min(monitor.x + monitor.width - size + half, right ? x + offset : x - offset));
    const cy = Math.max(monitor.y + half, Math.min(monitor.y + monitor.height - size + half, y));
    const box = { x: cx - half, y: cy - half, w: size, h: size };
    const press = [cx, cy];
    const path = [];
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        path.push([Math.round(cx + (x - cx) * t), Math.round(cy + (y - cy) * t)]);
    }
    return { box, press, path };
}
