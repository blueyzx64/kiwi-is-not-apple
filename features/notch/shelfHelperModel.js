// SPDX-License-Identifier: GPL-3.0-or-later
// The shelf drag-out helper (helpers/kiwi-shelf-helper): the pure parts of talking to it.
// No gi:// imports. Tested by tests/shelfHelperModel.test.js.

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

/**
 * `outer` minus `hole`, as up to four boxes (top, bottom, left, right) that tile the rest. With no
 * hole it is `outer` alone. Used for the input layers around and inside the notch, which must
 * leave the hole to the helper's window below.
 * @param {{x: number, y: number, w: number, h: number}} outer
 * @param {{x: number, y: number, w: number, h: number}|null} hole
 * @returns {Array<{x: number, y: number, w: number, h: number}>}
 */
export function surround(outer, hole) {
    if (!hole)
        return [outer];
    const x1 = Math.max(outer.x, Math.min(outer.x + outer.w, hole.x));
    const x2 = Math.max(x1, Math.min(outer.x + outer.w, hole.x + hole.w));
    const y1 = Math.max(outer.y, Math.min(outer.y + outer.h, hole.y));
    const y2 = Math.max(y1, Math.min(outer.y + outer.h, hole.y + hole.h));
    const right = outer.x + outer.w;
    const bottom = outer.y + outer.h;
    return [
        { x: outer.x, y: outer.y, w: outer.w, h: y1 - outer.y },
        { x: outer.x, y: y2, w: outer.w, h: bottom - y2 },
        { x: outer.x, y: y1, w: x1 - outer.x, h: y2 - y1 },
        { x: x2, y: y1, w: right - x2, h: y2 - y1 },
    ].filter(r => r.w > 0 && r.h > 0);
}

/** The icon name the helper puts on the drag (a themed icon's first name), or ''. */
export function dragIconName(gicon) {
    if (!gicon)
        return '';
    const names = typeof gicon.get_names === 'function' ? gicon.get_names() : null;
    return names?.length ? names[0] : '';
}
