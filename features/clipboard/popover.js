// SPDX-License-Identifier: GPL-3.0-or-later
// Top-bar popover, minimal like the macOS clipboard managers: a compact search field, small
// category tabs, one-line rows (type icon, preview, time) with the first row selected, a
// centred empty state, and a quiet footer (Recording switch, Clear). The search field keeps
// key focus: typing filters, Up/Down move the selection (the list scrolls to keep it in
// view), Left/Right switch the tabs, Enter copies, Esc closes. Super+V opens Quick Paste,
// the full keyboard surface (paste into the previous window, pin, remove).

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as A11y from '../../lib/a11y.js';
import { MENU_CLOSE_ARGS } from '../../lib/compat.js';
import { Glass } from '../../lib/glass.js';
import { ModalSurface } from '../../lib/modalSurface.js';
import { stepFilter, stepSelection } from './model.js';
import { ListScroller, addRow, buildFilterTabs, navAction, sectionLabel } from './view.js';

const WIDTH = 340;
const MAX_ROWS = 80;
const ROW_TILE = 'M';      // icon well size (lib/designTokens.js)
const PAGE_ROWS = 5;

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
        this._entries = [];
        this._selected = -1;

        this._build();
        cleanup.connect(menu, 'open-state-changed', (_m, open) => this._onOpen(open));
        cleanup.add(ctl.connectChanged(() => this._menu.isOpen && this._refresh()));
        cleanup.add(() => this._detachGlass());
        this._attachGlass();
        // The design system's light marker, so secondary text, pills and the search capsule take
        // their light shade on a light popover whether or not the glass is on
        Glass.watch(cleanup, ({ env }) => {
            if (env.dark)
                this._root.remove_style_class_name('kiwi-light');
            else
                this._root.add_style_class_name('kiwi-light');
        });
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
        this._root = root;

        this._entry = new St.Entry({
            style_class: 'kiwi-clip-search kiwi-search-field kiwi-search-capsule-filled kiwi-text-body', hint_text: _('Search'), accessible_name: _('Search Clipboard'), can_focus: true, x_expand: true,
            primary_icon: new St.Icon({ icon_name: 'edit-find-symbolic', style_class: 'kiwi-clip-search-icon' }),
        });
        this._entry.clutter_text.connect('text-changed', () => {
            this._query = this._entry.get_text();
            this._refresh();
        });
        this._entry.clutter_text.connect('key-press-event', (_a, event) => this._onKey(event));
        root.add_child(this._entry);

        this._tabs = buildFilterTabs(_, id => this._setFilter(id));
        root.add_child(this._tabs.actor);
        this._filters = this._tabs.actor;

        // Natural height up to a cap (stylesheet max-height): three rows make a short list.
        // Overlay scrollbar, thin and only while scrolling; the list's right padding is its
        // gutter, so it never covers the time labels or the selection (ListScroller).
        this._scroll = new St.ScrollView({
            style_class: 'kiwi-clip-scroll', overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
        });
        this._list = new St.BoxLayout({
            style_class: 'kiwi-clip-list', orientation: Clutter.Orientation.VERTICAL, x_expand: true,
        });
        this._scroll.set_child(this._list);
        root.add_child(this._scroll);
        this._scroller = new ListScroller(this._scroll, this._ctl.motion);

        const foot = new St.BoxLayout({ style_class: 'kiwi-clip-foot' });
        this._switch = new PopupMenu.Switch(this._ctl.recording);
        const toggle = this._recToggle = new St.Button({
            style_class: 'kiwi-clip-recording', can_focus: true, reactive: true, child: this._switch,
            accessible_name: _('Recording'), accessible_role: A11y.Role.TOGGLE_BUTTON, toggle_mode: true,
            checked: this._ctl.recording, y_align: Clutter.ActorAlign.CENTER,
        });
        toggle.connect('clicked', () => this._ctl.setRecording(!this._ctl.recording));
        this._recLabel = new St.Label({
            style_class: 'kiwi-clip-recording-label kiwi-secondary-text kiwi-text-caption', x_expand: true, y_align: Clutter.ActorAlign.CENTER,
        });
        foot.add_child(toggle);
        foot.add_child(this._recLabel);
        const clear = new St.Button({
            label: _('Clear'), accessible_name: _('Clear Clipboard History'), style_class: 'kiwi-clip-clear kiwi-pill-button', can_focus: true, y_align: Clutter.ActorAlign.CENTER,
        });
        clear.connect('clicked', () => this._ctl.clear());
        foot.add_child(clear);
        root.add_child(foot);

        this._menu.addMenuItem(item);
        this._syncFilters();
    }

    _syncFilters() {
        this._tabs.sync(this._filter, this._ctl.filterTabs());
    }

    _setFilter(id) {
        if (id === this._filter)
            return;
        this._filter = id;
        this._refresh();
    }

    _onOpen(open) {
        if (!open)
            return;
        // One Kiwi modal at a time
        ModalSurface.closeAll();
        this._refresh();
        this._entry.clutter_text.grab_key_focus();
    }

    // ---- keyboard: the search field keeps focus and forwards the navigation keys ----

    _rows() {
        return this._list.get_children().filter(child => child.entryId !== undefined);
    }

    _select(index) {
        const rows = this._rows();
        this._selected = rows.length ? Math.max(0, Math.min(index, rows.length - 1)) : -1;
        rows.forEach((row, i) => {
            if (i === this._selected)
                row.add_style_pseudo_class('selected');
            else
                row.remove_style_pseudo_class('selected');
        });
        const row = rows[this._selected];
        A11y.describeSelection(this._entry, row?.accessible_name);
        this._scroller.reveal(row);
    }

    _onKey(event) {
        // While an input method is composing (preedit), its keys belong to the entry
        if (this._entry.clutter_text.has_preedit?.())
            return Clutter.EVENT_PROPAGATE;
        const count = this._rows().length;
        const action = navAction(event);
        switch (action) {
        case 'up':
        case 'down':
        case 'pageUp':
        case 'pageDown': {
            const step = { up: -1, down: 1, pageUp: -PAGE_ROWS, pageDown: PAGE_ROWS }[action];
            this._select(stepSelection(this._selected, step, count));
            return Clutter.EVENT_STOP;
        }
        case 'left':
        case 'right':
            if (!this._filters.visible)
                return Clutter.EVENT_PROPAGATE;
            this._setFilter(stepFilter(this._filter, action === 'left' ? -1 : 1));
            return Clutter.EVENT_STOP;
        case 'enter': {
            const row = this._rows()[this._selected];
            const entry = row && this._entries.find(e => e.id === row.entryId);
            if (entry)
                this._ctl.copy(entry, { close: true });
            return Clutter.EVENT_STOP;
        }
        case 'escape':
            this._menu.close(MENU_CLOSE_ARGS);
            return Clutter.EVENT_STOP;
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }

    _refresh() {
        const _ = this._;
        const ctl = this._ctl;
        // Header and footer first: they must be right even if a row fails
        this._switch.state = ctl.recording;
        this._recToggle.checked = ctl.recording;
        this._recLabel.text = ctl.recording ? _('Recording') : _('Paused');
        this._entry.hint_text = ctl.count
            ? _('Search %d items').replace('%d', ctl.count)
            : _('Search');

        const { pinned, recent } = ctl.view({ filter: this._filter, query: this._query });
        this._entries = [...pinned, ...recent];
        this._list.destroy_all_children();
        const now = Date.now();
        let shown = 0;
        const add = rows => {
            for (const e of rows) {
                if (shown++ >= MAX_ROWS)
                    return;
                addRow(this._list, e, ctl, _, {
                    onActivate: en => ctl.copy(en, { close: true }), now, compact: true, tile: ROW_TILE,
                });
            }
        };
        if (pinned.length) {
            this._list.add_child(sectionLabel(_('Pinned')));
            add(pinned);
        }
        if (pinned.length && recent.length)
            this._list.add_child(sectionLabel(_('Recent')));
        add(recent);
        if (!pinned.length && !recent.length)
            this._list.add_child(this._emptyState(ctl.count > 0));
        // Nothing to filter yet: the chips would only be clutter around the empty state
        this._filters.visible = ctl.count > 0;
        this._tabs.sync(this._filter, ctl.filterTabs());
        this._select(0);
    }

    /** A centred, gentle message: nothing copied yet, or no match for the search. */
    _emptyState(searching) {
        const _ = this._;
        const box = new St.BoxLayout({
            style_class: 'kiwi-clip-empty', orientation: Clutter.Orientation.VERTICAL,
            x_expand: true, x_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(new St.Icon({
            icon_name: searching ? 'edit-find-symbolic' : 'edit-paste-symbolic',
            style_class: 'kiwi-clip-empty-icon kiwi-tertiary-text', x_align: Clutter.ActorAlign.CENTER,
        }));
        box.add_child(new St.Label({
            text: searching ? _('No matches') : _('Nothing copied yet'),
            style_class: 'kiwi-clip-empty-title kiwi-text-headline', x_align: Clutter.ActorAlign.CENTER,
        }));
        box.add_child(new St.Label({
            text: searching ? _('Try another word or filter.') : _('Text, links and images you copy appear here.'),
            style_class: 'kiwi-clip-empty-hint kiwi-secondary-text kiwi-text-caption', x_align: Clutter.ActorAlign.CENTER,
        }));
        return box;
    }

    // ---- glass: the rounded menu box, its BoxPointer bin carries the shadow (lib/glass.js) ----

    _attachGlass() {
        if (!this._menu.box)
            return;
        try {
            this._glass = Glass.attachMenu(this._menu, { surface: 'overlays' });
        } catch (e) {
            console.warn(`[Kiwi] clipboard popover glass failed: ${e.message}`);
        }
    }

    _detachGlass() {
        this._glass?.destroy();
        this._glass = null;
    }
}
