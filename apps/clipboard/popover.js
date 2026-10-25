// SPDX-License-Identifier: GPL-3.0-or-later
// Top-bar popover: title + count, search, filter buttons, Pinned and Recent, footer with the
// Recording switch, the shortcut hint and Clear History. Mouse first; Quick Paste is the
// keyboard surface.

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { Glass } from '../../lib/glass.js';
import { tintColor } from '../../lib/glassParams.js';
import { ModalSurface } from '../../lib/modalSurface.js';
import { accelLabel, buildRow, sectionLabel } from './view.js';

const WIDTH = 380;
const LIST_HEIGHT = 360;
const MAX_ROWS = 80;
const GLASS_RADIUS = 18;

export class ClipboardPopover {
    /**
     * @param {PopupMenu.PopupMenu} menu the indicator's menu
     * @param {object} ctl controller (index.js)
     * @param {object} cleanup CleanupRegistry
     * @param {Function} _ gettext
     */
    constructor(menu, ctl, cleanup, _) {
        this._menu = menu;
        this._ctl = ctl;
        this._ = _;
        this._filter = 'all';
        this._query = '';
        this._glass = null;
        this._savedStyle = null;

        this._build();
        cleanup.connect(menu, 'open-state-changed', (_m, open) => this._onOpen(open));
        cleanup.add(ctl.connectChanged(() => this._menu.isOpen && this._refresh()));
        cleanup.add(() => this._detachGlass());
        this._attachGlass(cleanup);
    }

    _build() {
        const _ = this._;
        const item = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false, activate: false });
        item.add_style_class_name('kiwi-clip-popover-item');
        const root = new St.BoxLayout({
            style_class: 'kiwi-clip-popover', orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, width: WIDTH,
        });
        item.add_child(root);

        const head = new St.BoxLayout({ style_class: 'kiwi-clip-head' });
        head.add_child(new St.Label({ text: _('Clipboard'), style_class: 'kiwi-clip-heading', x_expand: true }));
        this._count = new St.Label({ style_class: 'kiwi-clip-count', y_align: Clutter.ActorAlign.CENTER });
        head.add_child(this._count);
        root.add_child(head);

        this._entry = new St.Entry({
            style_class: 'kiwi-clip-search', hint_text: _('Search'), can_focus: true, x_expand: true,
        });
        this._entry.clutter_text.connect('text-changed', () => {
            this._query = this._entry.get_text();
            this._refresh();
        });
        root.add_child(this._entry);

        const filters = new St.BoxLayout({ style_class: 'kiwi-clip-filters' });
        this._filterButtons = new Map();
        for (const [id, label] of [['all', _('All')], ['text', _('Text')], ['links', _('Links')], ['images', _('Images')]]) {
            const b = new St.Button({ label, style_class: 'kiwi-clip-filter', can_focus: true, toggle_mode: true });
            b.connect('clicked', () => {
                this._filter = id;
                this._syncFilters();
                this._refresh();
            });
            this._filterButtons.set(id, b);
            filters.add_child(b);
        }
        root.add_child(filters);

        this._scroll = new St.ScrollView({
            style_class: 'kiwi-clip-scroll', height: LIST_HEIGHT, overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
        });
        this._list = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, x_expand: true });
        this._scroll.set_child(this._list);
        root.add_child(this._scroll);

        const foot = new St.BoxLayout({ style_class: 'kiwi-clip-foot' });
        this._switch = new PopupMenu.Switch(this._ctl.recording);
        const toggle = new St.Button({
            style_class: 'kiwi-clip-recording', can_focus: true, reactive: true, child: this._switch,
        });
        toggle.connect('clicked', () => this._ctl.setRecording(!this._ctl.recording));
        this._recLabel = new St.Label({ style_class: 'kiwi-clip-recording-label', y_align: Clutter.ActorAlign.CENTER });
        foot.add_child(toggle);
        foot.add_child(this._recLabel);
        this._hint = new St.Label({ style_class: 'kiwi-clip-hint', x_expand: true, y_align: Clutter.ActorAlign.CENTER });
        this._hint.x_align = Clutter.ActorAlign.END;
        foot.add_child(this._hint);
        const clear = new St.Button({ label: _('Clear History'), style_class: 'kiwi-clip-clear', can_focus: true });
        clear.connect('clicked', () => this._ctl.clear());
        foot.add_child(clear);
        root.add_child(foot);

        this._menu.addMenuItem(item);
        this._syncFilters();
    }

    _syncFilters() {
        for (const [id, b] of this._filterButtons)
            b.checked = id === this._filter;
    }

    _onOpen(open) {
        this._glass?.setVisible(open);
        if (!open)
            return;
        // One Kiwi modal at a time
        ModalSurface.closeAll();
        this._refresh();
        this._entry.clutter_text.grab_key_focus();
    }

    _refresh() {
        const _ = this._;
        const ctl = this._ctl;
        const { pinned, recent } = ctl.view({ filter: this._filter, query: this._query });
        this._list.destroy_all_children();
        const now = Date.now();
        let shown = 0;
        const add = rows => {
            for (const e of rows) {
                if (shown++ >= MAX_ROWS)
                    return;
                this._list.add_child(buildRow(e, ctl, _, { onActivate: en => ctl.copy(en, { close: true }), now }));
            }
        };
        if (pinned.length) {
            this._list.add_child(sectionLabel(_('Pinned')));
            add(pinned);
        }
        if (recent.length) {
            this._list.add_child(sectionLabel(_('Recent')));
            add(recent);
        }
        if (!pinned.length && !recent.length) {
            this._list.add_child(new St.Label({
                text: ctl.count ? _('No matches') : _('Nothing copied yet'),
                style_class: 'kiwi-clip-empty', x_align: Clutter.ActorAlign.CENTER,
            }));
        }
        this._count.text = String(ctl.count);
        this._switch.state = ctl.recording;
        this._recLabel.text = ctl.recording ? _('Recording') : _('Paused');
        const hint = accelLabel(ctl.shortcut);
        this._hint.text = hint ? _('Quick Paste %s').replace('%s', hint) : '';
    }

    // ---- glass: same recipe as apps/liquidGlass for the Shell's own menus ----

    _attachGlass(cleanup) {
        const bp = this._menu.actor;
        if (!bp?.get_parent())
            return;
        try {
            this._glass = Glass.attach(bp.bin ?? bp, {
                surface: 'overlays', parent: bp.get_parent(), below: bp, layers: 'blur',
                role: 'large', radius: GLASS_RADIUS, name: 'kiwi-glass-clipboard-popover',
            });
        } catch (e) {
            console.warn(`[Kiwi] clipboard popover glass failed: ${e.message}`);
            return;
        }
        this._savedStyle = bp.get_style();
        this._glass.setVisible(this._menu.isOpen);
        Glass.watch(cleanup, () => this._styleBubble());
    }

    _styleBubble() {
        const bp = this._menu.actor;
        const params = this._glass?.params;
        if (!bp)
            return;
        if (!params || params.tier === 'off') {
            bp.set_style(this._savedStyle);
            return;
        }
        const tint = params.tier === 'opaque'
            ? tintColor({ ...params, dim: false, alpha: 1 }) : tintColor(params);
        bp.set_style(`${this._savedStyle ?? ''} -arrow-background-color: ${tint};`);
    }

    _detachGlass() {
        this._glass?.destroy();
        this._glass = null;
        const bp = this._menu.actor;
        if (bp && this._savedStyle !== null)
            bp.set_style(this._savedStyle);
    }
}
