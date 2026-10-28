// SPDX-License-Identifier: GPL-3.0-or-later
// The Genie: an offscreen effect that draws the window as thin strips, one per line of the
// window across the funnel. Each strip is a textured rectangle whose width, centre and place
// come from model.genieRow(), so the window's edge nearest the dock narrows into a funnel and
// slides into the icon. The window is painted once into the effect's buffer; per frame only the
// strips move (the arrays are reused, nothing is allocated).
//
// The effect sits on a container exactly as big as `reach` (the window and its target, plus a
// transparent border of GENIE_PAD px) holding a clone of the window: the funnel never leaves
// the container's box, which is what Clutter's offscreen effects can draw into (on GNOME 50
// the window actor itself cuts the funnel off at the window's own edges).
//
// No breaks in the edges:
//   - strips: enough that none is taller than about one device pixel, even where the funnel
//     stretches the window most (genieStrips), so the curved sides have no visible steps;
//   - no gaps: neighbouring strips share their edge exactly (the same number, no rounding);
//   - linear filtering with mipmaps (the buffer is shrunk up to ~15x into the icon) instead of
//     the nearest-pixel sampling Clutter picks for an untransformed actor;
//   - soft sides: each strip reaches one texel into the transparent border, so the funnel's
//     outline is filtered (anti-aliased) instead of cut on whole pixels.
//
// Shell API: Clutter.OffscreenEffect (get_pipeline, get_target_size, vfunc_paint_target),
// Clutter.PipelineNode (add_texture_rectangle), Cogl.Pipeline.set_color (premultiplied),
// set_layer_filters, set_layer_wrap_mode; checked on GNOME 50.

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GObject from 'gi://GObject';

import { genieRow, genieStrips } from './model.js';

/** Transparent border around the window in the container (px). */
export const GENIE_PAD = 2;

export const GenieEffect = GObject.registerClass({
    GTypeName: 'KiwiGenieEffect',
}, class GenieEffect extends Clutter.OffscreenEffect {
    /**
     * @param {object} frame model.genieFrame()
     * @param {{x,y,width,height}} reach the container's stage rect (whole pixels)
     * @param {number} [scale] device pixels per logical pixel (the monitor's scale)
     */
    _init(frame, reach, scale = 1) {
        super._init();
        this._frame = frame;
        this._reach = reach;
        // Where the window sits in the container
        this._offX = frame.winX - reach.x;
        this._offY = frame.winY - reach.y;
        this._strips = genieStrips(frame, scale);
        // Per edge between strips: where it falls; per strip: its centre and width along the dock
        this._edge = new Float64Array(this._strips + 1);
        this._centre = new Float64Array(this._strips);
        this._width = new Float64Array(this._strips);
        this._row = { s: 0, centre: 0, width: 0 };
        this._box = new Clutter.ActorBox();
        this._color = new Cogl.Color();
        this.progress = 0;
        this._layout();
    }

    setProgress(p) {
        if (p === this.progress)
            return;
        this.progress = p;
        this._layout();
        this.queue_repaint();
    }

    // The funnel at the current progress, in the canonical frame (stage px)
    _layout() {
        const f = this._frame;
        const n = this._strips;
        const row = this._row;
        for (let i = 0; i <= n; i++)
            this._edge[i] = genieRow(f, i / n, this.progress, row).s;
        for (let i = 0; i < n; i++) {
            genieRow(f, (i + 0.5) / n, this.progress, row);
            this._centre[i] = row.centre;
            this._width[i] = row.width;
        }
    }

    vfunc_paint_target(node, _paintContext) {
        const [ok, texWidth] = this.get_target_size();
        if (!ok)
            return;
        const reach = this._reach;
        const f = this._frame;
        // Buffer pixels per logical pixel (the monitor's scale)
        const k = texWidth / reach.width;
        const texel = 1 / k;
        const pipeline = this.get_pipeline();
        pipeline.set_layer_filters(0, Cogl.PipelineFilter.LINEAR_MIPMAP_LINEAR, Cogl.PipelineFilter.LINEAR);
        pipeline.set_layer_wrap_mode(0, Cogl.PipelineWrapMode.CLAMP_TO_EDGE);
        const a = this.get_actor().get_paint_opacity() / 255;
        this._color.init_from_4f(a, a, a, a);
        pipeline.set_color(this._color);
        const strips = Clutter.PipelineNode.new(pipeline);
        node.add_child(strips);

        const n = this._strips;
        const box = this._box;
        const position = f.position;
        const bottom = position === 'bottom';
        // Across the funnel (s): the window's lines; along the dock (l): each line's span
        const across0 = bottom ? this._offY : this._offX;
        const acrossLen = bottom ? f.winH : f.winW;
        const acrossFull = bottom ? reach.height : reach.width;
        const along0 = bottom ? this._offX : this._offY;
        const alongLen = bottom ? f.winW : f.winH;
        const alongFull = bottom ? reach.width : reach.height;
        const alongOrigin = bottom ? reach.x : reach.y;
        // One texel past the window on each side, into the transparent border: the sides fade
        // over the last pixel instead of ending on a pixel boundary
        const u0 = (along0 - texel) / alongFull;
        const u1 = (along0 + alongLen + texel) / alongFull;
        const alongGrow = texel / alongLen;
        // The same at the far edge (first strip) and the edge facing the dock (last strip)
        const dGrow = texel / acrossLen;
        for (let i = 0; i < n; i++) {
            let d0 = i / n;
            let d1 = (i + 1) / n;
            let s0 = this._edge[i];
            let s1 = this._edge[i + 1];
            if (i === 0 || i === n - 1) {
                const slope = (s1 - s0) * n;
                if (i === 0) {
                    s0 -= slope * dGrow;
                    d0 -= dGrow;
                }
                if (i === n - 1) {
                    s1 += slope * dGrow;
                    d1 += dGrow;
                }
            }
            const half = this._width[i] * (0.5 + alongGrow);
            const l0 = this._centre[i] - half - alongOrigin;
            const l1 = this._centre[i] + half - alongOrigin;
            if (position === 'left') {
                // s grows to the left (s = -x): the strip's x runs from -s1 to -s0, and the
                // window's lines run the other way
                box.init((-s1 - reach.x) * k, l0 * k, (-s0 - reach.x) * k, l1 * k);
                strips.add_texture_rectangle(box,
                    (across0 + (1 - d1) * acrossLen) / acrossFull, u0,
                    (across0 + (1 - d0) * acrossLen) / acrossFull, u1);
            } else if (position === 'right') {
                box.init((s0 - reach.x) * k, l0 * k, (s1 - reach.x) * k, l1 * k);
                strips.add_texture_rectangle(box,
                    (across0 + d0 * acrossLen) / acrossFull, u0,
                    (across0 + d1 * acrossLen) / acrossFull, u1);
            } else {
                box.init(l0 * k, (s0 - reach.y) * k, l1 * k, (s1 - reach.y) * k);
                strips.add_texture_rectangle(box,
                    u0, (across0 + d0 * acrossLen) / acrossFull,
                    u1, (across0 + d1 * acrossLen) / acrossFull);
            }
        }
    }
});
