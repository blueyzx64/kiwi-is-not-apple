// SPDX-License-Identifier: GPL-3.0-or-later
// The Genie mesh: a Clutter.DeformEffect whose vertices follow model.genieVertex(). The window
// is painted once into an offscreen buffer, then drawn as a tiled mesh; only `progress`
// changes per frame (no allocation: the output point is reused).
//
// Shell API: Clutter.DeformEffect (vfunc_deform_vertex gets the vertex in the actor's own
// coordinates and the paint box size; checked on GNOME 50), Clutter.PaintVolume.union_box.

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import { GENIE_TILES, genieVertex } from './model.js';

export const GenieEffect = GObject.registerClass({
    GTypeName: 'KiwiGenieEffect',
}, class GenieEffect extends Clutter.DeformEffect {
    /**
     * @param {object} frame model.genieFrame()
     * @param {{x,y,width,height}} reach stage rect the mesh may cover (window and target)
     */
    _init(frame, reach) {
        super._init();
        this._frame = frame;
        // In the actor's coordinates; made once, read by every paint
        this._reachBox = new Clutter.ActorBox({
            x1: reach.x - frame.winX, y1: reach.y - frame.winY,
            x2: reach.x + reach.width - frame.winX, y2: reach.y + reach.height - frame.winY,
        });
        this._point = { x: 0, y: 0 };
        this.progress = 0;
        // Rows run along the dock: few tiles across them, many along the funnel
        if (frame.position === 'bottom')
            this.set_n_tiles(GENIE_TILES.across, GENIE_TILES.along);
        else
            this.set_n_tiles(GENIE_TILES.along, GENIE_TILES.across);
    }

    setProgress(p) {
        if (p === this.progress)
            return;
        this.progress = p;
        this.invalidate();
    }

    vfunc_deform_vertex(width, height, vertex) {
        genieVertex(this._frame, vertex.x, vertex.y, width, height, this.progress, this._point);
        vertex.x = this._point.x;
        vertex.y = this._point.y;
    }

    // The funnel reaches the dock, outside the window's own box: grow the paint volume so the
    // Shell redraws (and does not cull) all of it
    vfunc_modify_paint_volume(volume) {
        volume.union_box(this._reachBox);
        return true;
    }
});
