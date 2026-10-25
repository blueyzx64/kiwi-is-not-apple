// SPDX-License-Identifier: GPL-3.0-or-later
// Stage Manager drop target: while a strip entry is dragged, the stage becomes a drop target.
// The left or right part lays the dropped windows side by side with the stage; the middle band
// adds them to the set as they are (macOS: drag a thumbnail onto the centre window).
// A rounded highlight shows where the windows will go.
//
// Hit testing is model.dropZone(); index.js does the joining. Shell DND (ui/dnd.js, public:
// a `_delegate` with handleDragOver/acceptDrop on the actor under the pointer, picked with
// PickMode.ALL, so the actor needs no reactive flag; same in 48-51).

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { dropZone, dropZoneRect, scaleMs } from './model.js';

const ZONE_MS = 180;

export class StageDropTarget {
    /**
     * @param {import('../../lib/disposables.js').CleanupRegistry} cleanup
     * @param {object} env
     * @param {(stageId: string, zone: string) => boolean} env.onDrop
     * @param {() => boolean} env.motion
     * @param {() => number} env.speed
     * @param {(zone: string) => string} env.hint  text for the highlight
     */
    constructor(cleanup, { onDrop, motion, speed, hint }) {
        this._onDrop = onDrop;
        this._motion = motion;
        this._speed = speed;
        this._hint = hint;
        this._area = null;
        this._zone = null;

        this._actor = cleanup.actor(new St.Widget({ style_class: 'kiwi-stage-drop', visible: false }));
        this._highlight = new St.Widget({
            style_class: 'kiwi-stage-drop-zone', opacity: 0,
            layout_manager: new Clutter.BinLayout(),
        });
        this._label = new St.Label({
            style_class: 'kiwi-stage-drop-label',
            x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
        });
        this._highlight.add_child(this._label);
        this._actor.add_child(this._highlight);
        this._actor._delegate = {
            handleDragOver: (source, _actor, x, y) => {
                if (!source?.stageId)
                    return DND.DragMotionResult.CONTINUE;
                this._setZone(this._zoneAt(x, y));
                return this._zone ? DND.DragMotionResult.MOVE_DROP : DND.DragMotionResult.NO_DROP;
            },
            acceptDrop: (source, _actor, x, y) => {
                const zone = this._zoneAt(x, y);
                if (!source?.stageId || !zone)
                    return false;
                return this._onDrop(source.stageId, zone);
            },
        };
        Main.layoutManager.uiGroup.add_child(this._actor);
    }

    get zone() {
        return this._zone;
    }

    /** Cover the stage area while a drag is on. */
    show(area) {
        this._area = area;
        this._zone = null;
        const a = this._actor;
        a.set_position(area.x, area.y);
        a.set_size(area.width, area.height);
        Main.layoutManager.uiGroup.set_child_above_sibling(a, null);
        this._highlight.opacity = 0;
        a.visible = true;
    }

    hide() {
        this._zone = null;
        this._area = null;
        this._actor.visible = false;
        this._highlight.remove_all_transitions();
        this._highlight.opacity = 0;
    }

    /** For probes: the zone a stage point would drop into. */
    zoneAtPoint(x, y) {
        return this._area ? dropZone({ x, y }, this._area) : null;
    }

    _zoneAt(x, y) {
        // x, y are local to the actor, which sits at the area origin
        return this._area ? dropZone({ x: x + this._area.x, y: y + this._area.y }, this._area) : null;
    }

    _setZone(zone) {
        if (zone === this._zone)
            return;
        this._zone = zone;
        const h = this._highlight;
        h.remove_all_transitions();
        if (!zone) {
            h.opacity = 0;
            return;
        }
        const r = dropZoneRect(this._area, zone);
        const local = { x: r.x - this._area.x, y: r.y - this._area.y, width: r.width, height: r.height };
        this._label.text = this._hint(zone);
        const animate = this._motion() && h.opacity > 0;
        const duration = scaleMs(ZONE_MS, this._speed());
        if (animate) {
            h.ease({ ...local, duration, mode: Clutter.AnimationMode.EASE_OUT_CUBIC });
        } else {
            h.set_position(local.x, local.y);
            h.set_size(local.width, local.height);
        }
        if (this._motion())
            h.ease({ opacity: 255, duration, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        else
            h.opacity = 255;
    }
}
