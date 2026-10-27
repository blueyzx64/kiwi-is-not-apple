// SPDX-License-Identifier: GPL-3.0-or-later
// The tiling layout glyphs (a small frame with the panes of a layout) shared by everything that
// offers a layout: the green-button menu (features/windowControls) and the drag picker
// (features/windows). A view helper: the layouts themselves are core/tileActions.js.
// CSS: styles/base.css (.kiwi-tile-glyph, .kiwi-tile-pane, .kiwi-tile-glyph-button).
//
// Shell API: St, Clutter.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { ARRANGEMENTS, ZONES } from '../core/tileActions.js';

export const GLYPH_W = 26;
export const GLYPH_H = 18;
const GLYPH_INSET = 2;   // border (1px) + 1px air inside the glyph frame
const PANE_GAP = 2;

/** The panes a glyph draws: the first is the window, the others ghosts of the next windows. */
export function panesOf(action) {
    if (action in ZONES)
        return [ZONES[action]];
    const name = action.replace(/^arrange-/, '');
    return (ARRANGEMENTS[name] ?? []).map(z => ZONES[z]);
}

/** The glyph of a tiling action (a zone name or `arrange-<name>`), `width` x `height` px. */
export function buildGlyph(action, width = GLYPH_W, height = GLYPH_H) {
    const frame = new St.Widget({
        style_class: 'kiwi-tile-glyph', width, height,
        layout_manager: new Clutter.FixedLayout(),
    });
    const iw = width - 2 * GLYPH_INSET;
    const ih = height - 2 * GLYPH_INSET;
    // Inner edges give up half a gap each, so neighbouring panes stay apart
    const edge = (frac, len, end) =>
        Math.round(GLYPH_INSET + frac * len + (frac > 0 && frac < 1 ? (end ? -PANE_GAP / 2 : PANE_GAP / 2) : 0));
    panesOf(action).forEach((f, i) => {
        const x0 = edge(f.x, iw, false);
        const x1 = edge(f.x + f.w, iw, true);
        const y0 = edge(f.y, ih, false);
        const y1 = edge(f.y + f.h, ih, true);
        const pane = new St.Widget({ style_class: i === 0 ? 'kiwi-tile-pane' : 'kiwi-tile-pane ghost' });
        pane.set_position(x0, y0);
        pane.set_size(Math.max(1, x1 - x0), Math.max(1, y1 - y0));
        frame.add_child(pane);
    });
    return frame;
}
