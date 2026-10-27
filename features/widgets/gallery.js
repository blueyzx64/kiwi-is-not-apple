// SPDX-License-Identifier: GPL-3.0-or-later
// The widget gallery ("Edit Widgets…", Sonoma): a faux-glass panel at the bottom of the
// primary monitor with a search field, categories and a live preview of every widget at the
// size chosen under it. "+" (or a click on the preview) adds the widget in the first free
// place; Done closes it. While it is open the desktop layer is in edit mode (remove badges)
// and the feature brings the desktop forward.
//
// Not modal: the desktop widgets stay draggable while the gallery is open. It closes with
// Done, Esc in the search field, the overview, or the feature's disable.

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { CleanupRegistry } from '../../lib/disposables.js';
import { Glass } from '../../lib/glass.js';
import { pixelSize } from '../../core/widgets/view.js';
import { galleryRect } from './model.js';

const SIZE_NAMES = { small: 'S', medium: 'M', large: 'L', extraLarge: 'XL' };
const PREVIEW_SCALE = 0.5;

export class Gallery {
    /** @param {object} feature DesktopWidgets: host, ctx, _, add(kind, size), addDefaults(), closeGallery() */
    constructor(feature) {
        this._feature = feature;
        this._ = feature._;
        this._cleanup = null;
        this._query = '';
        this._category = null;
        this._sizes = new Map(); // kind -> chosen size
        this.panel = null;
    }

    get isOpen() {
        return this._cleanup !== null;
    }

    open() {
        if (this._cleanup)
            return;
        const cleanup = this._cleanup = new CleanupRegistry();
        const _ = this._;
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const area = this._feature.workArea(Main.layoutManager.primaryIndex);
        const rect = galleryRect(area, scale);

        const panel = this.panel = new St.BoxLayout({
            name: 'kiwi-widgets-gallery',
            style_class: 'kiwi-widgets-gallery',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: true,
            x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        });
        Main.layoutManager.addTopChrome(panel);
        cleanup.add(() => {
            Main.layoutManager.removeChrome(panel);
            panel.destroy();
            this.panel = null;
        });
        const glass = Glass.attach(panel, { surface: 'overlays', role: 'content', radius: 26 * scale });
        cleanup.add(() => glass.destroy());

        // Header: title, search, add defaults, Done
        const header = new St.BoxLayout({ style_class: 'kiwi-widgets-gallery-header' });
        header.add_child(new St.Label({ text: _('Widgets'), style_class: 'kiwi-widgets-gallery-title', y_align: Clutter.ActorAlign.CENTER }));
        const search = new St.Entry({
            style_class: 'kiwi-widgets-gallery-search',
            hint_text: _('Search Widgets'),
            can_focus: true,
            x_expand: true,
            primary_icon: new St.Icon({ icon_name: 'edit-find-symbolic', style_class: 'kiwi-widgets-gallery-search-icon' }),
        });
        header.add_child(search);
        this._defaults = new St.Button({
            style_class: 'kiwi-widgets-gallery-pill',
            label: _('Add Default Widgets'),
            can_focus: true,
        });
        cleanup.connect(this._defaults, 'clicked', () => this._feature.addDefaults());
        header.add_child(this._defaults);
        const done = new St.Button({ style_class: 'kiwi-widgets-gallery-pill kiwi-widgets-gallery-done', label: _('Done'), can_focus: true });
        cleanup.connect(done, 'clicked', () => this._feature.closeGallery());
        header.add_child(done);
        panel.add_child(header);

        // Categories
        const chips = new St.BoxLayout({ style_class: 'kiwi-widgets-gallery-categories' });
        const all = [null, ...this._feature.host.registry.categories()];
        this._chips = all.map(cat => {
            const b = new St.Button({
                style_class: 'kiwi-widgets-gallery-chip',
                label: cat ? _(cat) : _('All Widgets'),
                toggle_mode: true,
                can_focus: true,
            });
            cleanup.connect(b, 'clicked', () => {
                this._category = cat;
                this._fill(cleanup);
            });
            chips.add_child(b);
            return { cat, b };
        });
        panel.add_child(chips);

        // The previews
        this._scroll = new St.ScrollView({
            style_class: 'kiwi-widgets-gallery-scroll',
            hscrollbar_policy: St.PolicyType.AUTOMATIC,
            vscrollbar_policy: St.PolicyType.NEVER,
            x_expand: true,
            y_expand: true,
        });
        this._row = new St.BoxLayout({ style_class: 'kiwi-widgets-gallery-row' });
        this._scroll.set_child(this._row);
        panel.add_child(this._scroll);
        this._tiles = new CleanupRegistry();
        cleanup.add(() => this._tiles.dispose());

        cleanup.connect(search.clutter_text, 'text-changed', () => {
            this._query = search.get_text();
            this._fill(cleanup);
        });
        cleanup.connect(search.clutter_text, 'key-press-event', (_a, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            this._feature.closeGallery();
            return Clutter.EVENT_STOP;
        });
        cleanup.connect(Main.overview, 'showing', () => this._feature.closeGallery());

        this._fill(cleanup);
        this.sync();
        search.grab_key_focus();
        panel.set_pivot_point(0.5, 1);
        panel.set({ opacity: 0, translation_y: 40 * scale });
        this._feature.ctx.motion.ease(panel, { opacity: 255, translation_y: 0 }, { duration: 'medium', curve: 'emphasized' }, cleanup);
    }

    /** Show "Add Default Widgets" only while no widget is placed. */
    sync() {
        if (this._defaults)
            this._defaults.visible = this._feature.items.length === 0;
    }

    _fill() {
        const _ = this._;
        this._tiles.dispose();
        this._row.destroy_all_children();
        for (const { cat, b } of this._chips)
            b.checked = cat === this._category;
        const registry = this._feature.host.registry;
        const kinds = registry.find({ query: this._query, category: this._category, translate: _ });
        if (!kinds.length) {
            this._row.add_child(new St.Label({ text: _('No Widgets'), style_class: 'kiwi-widgets-gallery-empty', y_align: Clutter.ActorAlign.CENTER }));
            return;
        }
        for (const def of kinds)
            this._row.add_child(this._tile(def));
    }

    _tile(def) {
        const _ = this._;
        const tiles = this._tiles;
        const sizes = this._feature.host.registry.sizesFor(def.id, 'desktop');
        let size = this._sizes.get(def.id) ?? def.defaultSize;
        const tile = new St.BoxLayout({ style_class: 'kiwi-widgets-gallery-tile', orientation: Clutter.Orientation.VERTICAL });
        // The largest preview sets the slot, so switching sizes does not jump the row
        const big = pixelSize(sizes[sizes.length - 1], PREVIEW_SCALE);
        const slot = new St.Button({
            style_class: 'kiwi-widgets-gallery-preview',
            accessible_name: `${_('Add')} ${_(def.title)}`,
            width: Math.max(big.width, pixelSize('medium', PREVIEW_SCALE).width),
            height: big.height,
            can_focus: true,
        });
        tile.add_child(slot);
        // Live previews at full size, drawn at half scale (so text keeps its proportions)
        const holder = new St.Widget({ layout_manager: new Clutter.BinLayout() });
        slot.set_child(holder);
        let preview = null;
        let box = null;
        const show = () => {
            box?.destroy();
            preview = this._feature.host.createView(def.id, { size, config: {} }, tiles);
            const px = pixelSize(size, PREVIEW_SCALE);
            box = new St.Widget({
                width: px.width, height: px.height,
                x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
            });
            preview.actor.reactive = false;
            preview.actor.set_scale(PREVIEW_SCALE, PREVIEW_SCALE);
            box.add_child(preview.actor);
            holder.add_child(box);
            preview.setActive(true);
        };
        show();
        tiles.connect(slot, 'clicked', () => this._feature.add(def.id, size));

        const caption = new St.BoxLayout({ style_class: 'kiwi-widgets-gallery-caption' });
        caption.add_child(new St.Label({ text: _(def.title), style_class: 'kiwi-widgets-gallery-name', x_expand: true, y_align: Clutter.ActorAlign.CENTER }));
        const add = new St.Button({
            style_class: 'kiwi-widgets-gallery-add',
            accessible_name: `${_('Add')} ${_(def.title)}`,
            child: new St.Icon({ icon_name: 'list-add-symbolic', icon_size: 14 }),
            can_focus: true,
        });
        tiles.connect(add, 'clicked', () => this._feature.add(def.id, size));
        caption.add_child(add);
        tile.add_child(caption);

        const picker = new St.BoxLayout({ style_class: 'kiwi-widgets-gallery-sizes' });
        const buttons = sizes.map(s => {
            const b = new St.Button({
                style_class: 'kiwi-widgets-gallery-size',
                label: SIZE_NAMES[s],
                accessible_name: { small: _('Small'), medium: _('Medium'), large: _('Large'), extraLarge: _('Extra Large') }[s],
                toggle_mode: true,
                checked: s === size,
                can_focus: true,
            });
            tiles.connect(b, 'clicked', () => {
                size = s;
                this._sizes.set(def.id, s);
                for (const [o, ob] of buttons)
                    ob.checked = o === s;
                show();
            });
            picker.add_child(b);
            return [s, b];
        });
        tile.add_child(picker);
        return tile;
    }

    close() {
        const cleanup = this._cleanup;
        if (!cleanup)
            return;
        this._cleanup = null;
        this._defaults = null;
        cleanup.dispose();
    }
}
