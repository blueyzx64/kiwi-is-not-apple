// SPDX-License-Identifier: GPL-3.0-or-later
// WidgetView: one live widget on any surface (desktop layer, Notification Center, notch).
//
// It is the card (a St.BoxLayout of the size class's pixel size) plus the kind's content. On
// the desktop (surface 'desktop', the default) the card is faux glass with a 24 px corner; in a
// panel (surface 'center' or 'notch') it is a design-system .kiwi-card, radius 18, so its
// corners match the panel's other cards. Data comes from the kind's shared provider, held only while the view is ACTIVE:
// a surface calls setActive(false) whenever the widget cannot be seen (overview, covered,
// hidden panel), and the provider stops once no active view needs it.
//
//   const view = host.createView('weather', { size: 'small', config: {}, surface: 'center' }, cleanup);
//   parent.add_child(view.actor);
//   view.setActive(true);
//   view.activate();           // what a plain click does (opens the app)
//   view.menuItems();          // the kind's own options for a right-click menu
//
// Kind definition (core/widgets/kinds/*.js):
//   {id, title, category, sizes, defaultSize, provider, bleed?,
//    build(view) -> {update(data), destroy?()}, open?(view), options?(view) -> [{label, active, apply()}]}
// bleed: the content fills the card edge to edge (Photos, Notes); it gets the card's radius
// and pads itself. destroy() runs when the content is rebuilt or the view goes (cancel work).
// Controls inside a widget that act in place (Sonoma's interactive widgets) are St.Buttons or
// St.Entries, or carry the kiwi-widget-interactive class: a surface never drags or opens the
// widget from a press on them (features/widgets/layer.js).

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import { RADIUS as DS_RADIUS } from '../../lib/designTokens.js';
import { CleanupRegistry } from '../../lib/disposables.js';
import { Glass } from '../../lib/glass.js';
import { SIZE_PX } from './model.js';

/** Card radius at scale 1 on the desktop: a macOS widget's corner is about 24 pt on a 170 pt card. */
export const RADIUS = 24;
/** Inner padding (macOS 16 pt); content corners are concentric (RADIUS - PADDING). */
export const PADDING = 16;

/** Pixel size of a size class. */
export function pixelSize(size, scale = 1) {
    const s = SIZE_PX[size];
    return { width: s.width * scale, height: s.height * scale };
}

export class WidgetView {
    /**
     * @param {object} host the WidgetHost (core/widgets/index.js)
     * @param {object} def the kind
     * @param {{size: string, config?: object, scale?: number}} opts
     */
    constructor(host, def, { size, config = {}, scale = 1, surface = 'desktop' }) {
        this._host = host;
        this.def = def;
        this.size = size;
        this.config = { ...config };
        this.scale = scale;
        this.surface = surface;
        // The card's corner, scaled: a floating glass card on the desktop, a .kiwi-card tile
        // (design system radius) inside a panel (Notification Center, notch)
        this.radius = (surface === 'desktop' ? RADIUS : DS_RADIUS.card) * scale;
        const floating = surface === 'desktop';
        this._ = host.gettext;
        this.cleanup = new CleanupRegistry();
        this._handle = null;
        this._off = null;
        this._destroyed = false;

        const { width, height } = pixelSize(size, scale);
        this.actor = new St.BoxLayout({
            style_class: `kiwi-widget kiwi-widget-${def.id} kiwi-widget-${size} ${
                floating ? 'kiwi-widget-floating' : 'kiwi-widget-embedded kiwi-card'}`,
            orientation: Clutter.Orientation.VERTICAL,
            width,
            height,
            reactive: true,
            accessible_name: this._(def.title),
        });
        const pad = def.bleed ? 0 : PADDING * scale;
        this.actor.set_style(`border-radius: ${this.radius}px; padding: ${pad}px;`);
        this.content = new St.BoxLayout({
            style_class: 'kiwi-widget-content',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            y_expand: true,
        });
        if (def.bleed)
            this.content.set_style(`border-radius: ${this.radius}px;`);
        this.actor.add_child(this.content);
        // Glass only on the desktop: inside a glass panel a card is a fill (no glass on glass).
        // Above the wallpaper the cards take the overlay legibility level, as every Kiwi
        // surface that can sit over busy content (lib/glassParams.js).
        if (floating) {
            const glass = Glass.attach(this.actor, { surface: 'overlays', role: 'overlay', radius: this.radius });
            this.cleanup.add(() => glass.destroy());
        }
        this.cleanup.add(() => this._endRenderer());
        this._actorGone = false;
        this.cleanup.connect(this.actor, 'destroy', () => {
            this._actorGone = true;
            this.destroy();
        });

        // null until the provider has data: each kind shows its empty state
        this._renderer = def.build(this);
        this._renderer.update(null);
    }

    /** The host's services: {gettext, settings, timers, events} (core/widgets/index.js). */
    get env() {
        return this._host.env;
    }

    /** The running provider while active, else null (for buttons that act in place). */
    get provider() {
        return this._handle?.provider ?? null;
    }

    get active() {
        return this._handle !== null;
    }

    /** Start or stop following the data. Idempotent. */
    setActive(on) {
        if (this._destroyed || on === this.active)
            return;
        if (on) {
            this._handle = this._host.pool.acquire(this.def.provider);
            const provider = this._handle.provider;
            this._off = provider.onChange(data => this._renderer?.update(data));
            this._renderer.update(provider.snapshot());
        } else {
            this._off?.();
            this._off = null;
            this._handle.release();
            this._handle = null;
        }
    }

    /** A plain click: open the app behind the widget. */
    activate() {
        try {
            this.def.open?.(this);
        } catch (e) {
            console.error(`[Kiwi] widget ${this.def.id} could not open its app:`, e);
        }
    }

    /** The kind's own choices for the widget's menu: [{label, active, apply()}]. */
    menuItems() {
        return this.def.options?.(this) ?? [];
    }

    _endRenderer() {
        const r = this._renderer;
        this._renderer = null;
        try {
            r?.destroy?.();
        } catch (e) {
            console.error(`[Kiwi] widget ${this.def.id} failed to clean up:`, e);
        }
    }

    /** Change config (the caller persists it) and rebuild the content. */
    setConfig(config) {
        this.config = { ...this.config, ...config };
        this._endRenderer();
        this.content.destroy_all_children();
        this._renderer = this.def.build(this);
        this._renderer.update(this.provider?.snapshot() ?? null);
    }

    destroy() {
        if (this._destroyed)
            return;
        // The content first, while its provider still runs (a note writes its last edit)
        this._endRenderer();
        this.setActive(false);
        this._destroyed = true;
        this.cleanup.dispose();
        if (!this._actorGone)
            this.actor.destroy();
    }
}
