// SPDX-License-Identifier: GPL-3.0-or-later
// The pure half of core/desktopLayers.js (tests/desktopLayersModel.test.js). No gi:// imports.

/**
 * The order the desktop layers stack in, bottom first: lower rank first, the one added first
 * when ranks are equal.
 *
 * @param {Array<{id: string, rank: number}>} layers in the order they were added
 */
export function stackOrder(layers) {
    return layers
        .map((layer, seq) => ({ layer, seq }))
        .sort((a, b) => a.layer.rank - b.layer.rank || a.seq - b.seq)
        .map(x => x.layer);
}

/**
 * Screen rectangles that layers keep clear for each other (the widgets' cards, which the
 * desktop icons flow around). Each owner replaces its own list.
 */
export class ReserveStore {
    constructor() {
        this._byOwner = new Map();
    }

    /** @returns {boolean} true when the owner's rectangles changed */
    set(owner, rects) {
        const next = rects.map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
        const prev = this._byOwner.get(owner) ?? [];
        if (JSON.stringify(prev) === JSON.stringify(next))
            return false;
        if (next.length)
            this._byOwner.set(owner, next);
        else
            this._byOwner.delete(owner);
        return true;
    }

    /** Every owner's rectangles except `except`'s own. */
    all(except = null) {
        const out = [];
        for (const [owner, rects] of this._byOwner) {
            if (owner !== except)
                out.push(...rects);
        }
        return out;
    }
}

/**
 * Whether a layer (a stage rectangle) shows on a monitor.
 *
 * @param {{x: number, y: number, width: number, height: number}} r
 * @param {{x: number, y: number, width: number, height: number}} m
 */
export function overlapsMonitor(r, m) {
    return r.x < m.x + m.width && r.x + r.width > m.x && r.y < m.y + m.height && r.y + r.height > m.y;
}

/**
 * Where a layer goes in a mirror of its monitor scaled by (sx, sy): its place on the monitor,
 * scaled (core/desktopLayers.js MirrorLayout; Mission Control's workspace cards).
 *
 * @param {{x: number, y: number, width: number, height: number}} layer stage px
 * @param {{x: number, y: number}} monitor stage px
 * @param {number} sx
 * @param {number} sy
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function mirrorRect(layer, monitor, sx, sy) {
    return {
        x: (layer.x - monitor.x) * sx,
        y: (layer.y - monitor.y) * sy,
        width: layer.width * sx,
        height: layer.height * sy,
    };
}
