// SPDX-License-Identifier: GPL-3.0-or-later
// Volume and brightness OSD: a compact glass pill that drops from under the menu bar, in place
// of GNOME's centred OSD. Two looks (osd-style, see model.js):
//   golden-gate  macOS 27.2: one larger icon, a segmented bar, under the matching menu-bar item
//   tahoe        macOS 26: icon, caption and a track, under the Control Center button
//
// core/osd.js decides who shows a change (osd-location; the notch while it runs and the
// setting is 'notch'); this feature registers as its 'pill' sink and only draws. The pill is
// built on the first change and is never reactive, so clicks go through to what is under it.
//
// Shell API: status/volume.js getMixerControl() (the Shell's shared Gvc.MixerControl) for the
// output's name and mute state; Main.panel.statusArea.quickSettings (the Control Center
// button) and Main.layoutManager.panelBox for the place. Golden Gate anchors also use the
// quick settings indicators _volumeOutput, _brightness and _backlight (private, ui/panel.js
// QuickSettings, checked on 50) and the menu bar's pinned items, found by their
// kiwi-menubar-pin-<id> style class (no import of menuBarItems).

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { getMixerControl } from 'resource:///org/gnome/shell/ui/status/volume.js';

import * as A11y from '../../lib/a11y.js';
import { Glass } from '../../lib/glass.js';
import { CleanupRegistry } from '../../lib/disposables.js';
import { KiwiSettings } from '../../lib/settings.js';
import {
    GG_PILL, PILL, SEGMENTS, TRACK_WIDTH, VISIBLE_MS, deviceLabel, ggPosition, pickAnchor, pillContent,
    pillPosition, segmentFill,
} from './model.js';

const DROP_PX = 14;     // the pill drops this far from under the bar
const SEARCH_DEPTH = 8; // how deep to look for a pinned item in the panel

/** The first descendant of `actor` with style class `cls`, or null. */
function findByClass(actor, cls, depth = SEARCH_DEPTH) {
    if (!actor || depth < 0)
        return null;
    if (actor.has_style_class_name?.(cls))
        return actor;
    for (const child of actor.get_children()) {
        const hit = findByClass(child, cls, depth - 1);
        if (hit)
            return hit;
    }
    return null;
}

/** The on-screen x extent of an actor that is shown in the bar, or null. */
function rectOf(actor) {
    if (!actor?.mapped || !actor.visible)
        return null;
    const [x] = actor.get_transformed_position();
    const [width] = actor.get_transformed_size();
    return width > 0 ? { x, width } : null;
}

export class OsdPill {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._view = null;
        this._hideToken = 0;
        this._anim = null;       // CleanupRegistry of the running show / hide animations
        this._hiding = false;
    }

    enable() {
        const ks = new KiwiSettings(this._ctx.settings);
        ks.attach(this._cleanup);
        this._style = ks.string('osd-style');
        // A new look is built on the next change
        ks.watch('osd-style', () => {
            this._style = ks.string('osd-style');
            this._destroyView();
        });
        this._ctx.osd.setSink(this._cleanup, 'pill', osd => this._show(osd));
        this._cleanup.add(() => this._destroyView());
    }

    /** What is on screen, for tests and the harness. */
    get state() {
        const v = this._view;
        if (!v)
            return null;
        return {
            style: v.style,
            visible: v.root.visible && !this._hiding,
            x: v.root.x, y: v.root.y, width: v.root.width,
            anchor: v.anchorName ?? null,
            caption: v.caption.text,
            icons: v.pill.get_children().filter(c => c instanceof St.Icon).length,
            segments: v.segments?.length ?? 0,
            lit: v.segments?.filter(seg => seg.has_style_class_name('kiwi-osd-seg-lit')).length ?? 0,
            fill: v.fill?.width ?? null,
            accessibleName: v.pill.accessible_name,
        };
    }

    disable() {
        // Everything is in the cleanup registry
    }

    // ---- the default output, read when a change arrives -----------------------------------

    _audio() {
        const sink = getMixerControl()?.get_default_sink?.() ?? null;
        if (!sink)
            return { device: null, deviceMuted: false };
        // get_port() asserts on a stream without ports (a virtual or null sink)
        const port = sink.get_ports?.()?.length ? sink.get_port() : null;
        return {
            device: deviceLabel(sink.description, port?.human_port),
            deviceMuted: !!sink.is_muted,
        };
    }

    // ---- view -----------------------------------------------------------------------------

    _build() {
        if (this._style === 'tahoe')
            this._buildTahoe();
        else
            this._buildGoldenGate();
    }

    _buildGoldenGate() {
        const reg = new CleanupRegistry();
        const root = new St.Widget({ style_class: 'kiwi-osd-shadow kiwi-osd-gg', reactive: false, visible: false });
        const pill = new St.BoxLayout({ style_class: 'kiwi-osd-pill', reactive: false });
        pill.set_size(GG_PILL.width, GG_PILL.height);
        root.add_child(pill);
        const icon = new St.Icon({ style_class: 'kiwi-osd-icon', icon_size: GG_PILL.icon, y_align: Clutter.ActorAlign.CENTER });
        pill.add_child(icon);
        const column = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, style_class: 'kiwi-osd-column',
            x_expand: true, y_align: Clutter.ActorAlign.CENTER,
        });
        const caption = new St.Label({ style_class: 'kiwi-osd-caption' });
        const bar = new St.BoxLayout({ style_class: 'kiwi-osd-segments', x_expand: true });
        const segments = [];
        for (let i = 0; i < SEGMENTS; i++) {
            const seg = new St.Widget({ style_class: 'kiwi-osd-seg', x_expand: true });
            bar.add_child(seg);
            segments.push(seg);
        }
        column.add_child(caption);
        column.add_child(bar);
        pill.add_child(column);
        Main.uiGroup.add_child(root);
        reg.actor(root);
        const glass = Glass.attach(pill, { surface: 'overlays', role: 'overlay', shadow: root });
        reg.add(() => glass.destroy());
        this._view = { style: 'golden-gate', reg, root, pill, icon, caption, segments, fill: null, anchorName: null };
    }

    _buildTahoe() {
        const reg = new CleanupRegistry();
        const root = new St.Widget({ style_class: 'kiwi-osd-shadow', reactive: false, visible: false });
        const pill = new St.BoxLayout({ style_class: 'kiwi-osd-pill', reactive: false });
        pill.set_size(PILL.width, PILL.height);
        root.add_child(pill);
        const icon = new St.Icon({ style_class: 'kiwi-osd-icon', icon_size: PILL.icon, y_align: Clutter.ActorAlign.CENTER });
        pill.add_child(icon);
        const column = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, style_class: 'kiwi-osd-column',
            x_expand: true, y_align: Clutter.ActorAlign.CENTER,
        });
        const caption = new St.Label({ style_class: 'kiwi-osd-caption' });
        const track = new St.Widget({ style_class: 'kiwi-osd-track' });
        track.set_width(TRACK_WIDTH);
        const fill = new St.Widget({ style_class: 'kiwi-osd-fill' });
        track.add_child(fill);
        column.add_child(caption);
        column.add_child(track);
        pill.add_child(column);
        // The OSD sits above the bar and every window, like the stock one
        Main.uiGroup.add_child(root);
        reg.actor(root);
        const glass = Glass.attach(pill, { surface: 'overlays', role: 'overlay', shadow: root });
        reg.add(() => glass.destroy());
        this._view = { style: 'tahoe', reg, root, pill, icon, caption, track, fill, segments: null };
    }

    _destroyView() {
        this._anim?.dispose();
        this._anim = null;
        this._view?.reg.dispose();
        this._view = null;
        // The pending hide belongs to the old view (a style change rebuilds it)
        if (this._hideToken)
            this._cleanup.release(this._hideToken);
        this._hideToken = 0;
        this._hiding = false;
    }

    _placeGoldenGate(kind) {
        const v = this._view;
        const qs = Main.panel.statusArea.quickSettings;
        const rects = {
            pinnedSound: rectOf(findByClass(Main.panel, 'kiwi-menubar-pin-sound')),
            pinnedKeyboard: rectOf(findByClass(Main.panel, 'kiwi-menubar-pin-keyboard-brightness')),
            stockVolume: rectOf(qs?._volumeOutput),
            stockBrightness: rectOf(qs?._brightness),
            stockBacklight: rectOf(qs?._backlight),
            controlCenter: rectOf(qs),
        };
        const anchor = pickAnchor(kind, rects);
        const box = Main.layoutManager.panelBox;
        const { x, y } = ggPosition(Main.layoutManager.primaryMonitor, box.y + box.height, anchor?.rect ?? null);
        v.root.set_position(x, y);
        v.root.set_size(GG_PILL.width, GG_PILL.height);
        v.anchorName = anchor?.name ?? null;
    }

    _place() {
        const { root } = this._view;
        const monitor = Main.layoutManager.primaryMonitor;
        const box = Main.layoutManager.panelBox;
        const button = Main.panel.statusArea.quickSettings;
        let anchor = null;
        if (button?.mapped) {
            const [x] = button.get_transformed_position();
            anchor = { x, width: button.width };
        }
        const { x, y } = pillPosition(monitor, box.y + box.height, anchor);
        root.set_position(x, y);
        root.set_size(PILL.width, PILL.height);
    }

    _show(osd) {
        if (!this._view)
            this._build();
        const v = this._view;
        const content = pillContent(osd, osd.kind === 'volume' ? this._audio() : { device: null, deviceMuted: false },
            this._ctx.gettext);
        if (osd.kind === 'volume' || !osd.icon)
            v.icon.icon_name = content.iconName;
        else
            v.icon.gicon = osd.icon;
        v.caption.text = content.caption;
        // An alert: a screen reader speaks the new level without the focus moving
        A11y.name(v.pill, content.accessibleName, A11y.Role.ALERT);
        v.pill.set_style_class_name(content.muted ? 'kiwi-osd-pill kiwi-osd-muted' : 'kiwi-osd-pill');
        const gg = v.style === 'golden-gate';
        const width = Math.round(TRACK_WIDTH * content.fill);
        const { motion } = this._ctx;
        if (gg) {
            const lit = segmentFill(content.fill, content.muted);
            v.segments.forEach((seg, i) => {
                if (i < lit)
                    seg.add_style_class_name('kiwi-osd-seg-lit');
                else
                    seg.remove_style_class_name('kiwi-osd-seg-lit');
            });
            // Volume and brightness hang from different items: follow the kind on every change
            if (v.root.visible && !this._hiding)
                this._placeGoldenGate(osd.kind);
        }

        if (!v.root.visible || this._hiding) {
            this._anim?.dispose();
            this._anim = new CleanupRegistry();
            this._hiding = false;
            if (gg)
                this._placeGoldenGate(osd.kind);
            else
                this._place();
            Main.uiGroup.set_child_above_sibling(v.root, null);
            if (!gg)
                v.fill.width = width;
            if (!v.root.visible) {
                v.root.opacity = 0;
                v.root.translation_y = -DROP_PX;
                v.root.show();
            }
            motion.ease(v.root, { opacity: 255 }, { duration: 'short', curve: 'enter' }, this._anim);
            motion.spring(v.root, 'translation_y', 0, { spring: 'snappy' }, this._anim);
        } else if (!gg) {
            motion.ease(v.fill, { width }, { duration: 'micro', curve: 'standard' }, this._cleanup);
        }

        if (this._hideToken)
            this._cleanup.release(this._hideToken);
        this._hideToken = this._cleanup.timeout(VISIBLE_MS, () => {
            this._hideToken = 0;
            this._hide();
        }, { name: 'osd pill hide' });
    }

    _hide() {
        const v = this._view;
        if (!v?.root.visible)
            return;
        this._anim?.dispose();
        this._anim = new CleanupRegistry();
        this._hiding = true;
        this._ctx.motion.ease(v.root, { opacity: 0, translation_y: -DROP_PX / 2 }, {
            duration: 'short', curve: 'exit',
            onDone: finished => {
                if (!finished || !this._hiding)
                    return;
                this._hiding = false;
                v.root.hide();
            },
        }, this._anim);
    }
}
