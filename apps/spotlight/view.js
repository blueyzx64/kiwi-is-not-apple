// SPDX-License-Identifier: GPL-3.0-or-later
// Spotlight view: the search field and the grouped result list inside a ModalSurface frame.
// It holds no search policy. The feature (index.js) feeds it sections and handles activation.
// Keys are read on the entry's own clutter_text, so they work whatever the Shell does with
// the modal's event stream. Selection changes are instant (no animation to reduce).

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

import { flatten, jumpGroup, locate, moveSelection, reselect } from './model.js';

const ROW_ICON = 28;
const TOP_ICON = 40;
const ENTRY_ICON = 22;
const MAX_LIST_HEIGHT = 440;

const SECTION_TITLES = {
    apps: N_('Applications'),
    settings: N_('Settings'),
    documents: N_('Documents'),
    clipboard: N_('Clipboard'),
    calculator: N_('Calculator'),
    other: N_('Other Results'),
    web: N_('Web'),
    suggestions: N_('Suggestions'),
};

function N_(s) {
    return s;
}

function makeIcon(item, size) {
    const props = { icon_size: size, style_class: 'kiwi-spotlight-icon' };
    if (item.gicon)
        return new St.Icon({ ...props, gicon: item.gicon });
    return new St.Icon({ ...props, icon_name: item.iconName ?? 'application-x-executable' });
}

export class SpotlightView {
    /**
     * @param {object} p
     * @param {Function} p.gettext
     * @param {(text:string)=>void} p.onQuery text changed
     * @param {(item:object, opts:{reveal:boolean})=>void} p.onActivate
     * @param {(item:object)=>void} p.onCopy
     * @param {()=>void} p.onClose a Super tap while open
     */
    constructor({ gettext, onQuery, onActivate, onCopy, onClose }) {
        this._ = gettext;
        this._onQuery = onQuery;
        this._onActivate = onActivate;
        this._onCopy = onCopy;
        this._onClose = onClose;
        this._sections = [];
        this._index = -1;
        this._moved = false;
        this._rows = [];
        this._superDown = false;
        this._superTainted = false;
        this._ui = null;
    }

    /** Build into the modal frame. @returns {Clutter.Actor} the key-focus actor */
    build(frame) {
        const _ = this._;
        const bar = new St.BoxLayout({ style_class: 'kiwi-spotlight-bar', y_align: Clutter.ActorAlign.CENTER });
        const glyph = new St.Icon({
            icon_name: 'system-search-symbolic', icon_size: ENTRY_ICON, style_class: 'kiwi-spotlight-glass-icon',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const entry = new St.Entry({
            style_class: 'kiwi-spotlight-entry', hint_text: _('Search'), can_focus: true, x_expand: true,
            accessible_name: _('Search'),
        });
        bar.add_child(glyph);
        bar.add_child(entry);

        const list = new St.BoxLayout({ style_class: 'kiwi-spotlight-list', orientation: Clutter.Orientation.VERTICAL });
        const scroll = new St.ScrollView({
            style_class: 'kiwi-spotlight-scroll', overlay_scrollbars: true, visible: false,
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
            style: `max-height: ${MAX_LIST_HEIGHT}px;`,
        });
        scroll.set_child(list);
        frame.add_child(bar);
        frame.add_child(scroll);

        const text = entry.clutter_text;
        text.connect('text-changed', () => {
            this._moved = false;
            this._onQuery(entry.get_text());
        });
        text.connect('key-press-event', (_a, event) => this._keyPress(event));
        text.connect('key-release-event', (_a, event) => this._keyRelease(event));
        this._ui = { entry, text, list, scroll };
        return text;
    }

    get text() {
        return this._ui?.entry.get_text() ?? '';
    }

    /** Replace the sections. Keeps the selection on the same item once the user moved. */
    setSections(sections) {
        if (!this._ui)
            return;
        this._index = reselect(this._sections, this._index, sections, this._moved);
        this._sections = sections;
        this._render();
    }

    get selected() {
        return locate(this._sections, this._index)?.item ?? null;
    }

    destroy() {
        this._ui = null;
        this._rows = [];
        this._sections = [];
    }

    // ---- rendering

    _render() {
        const { list, scroll } = this._ui;
        const _ = this._;
        list.destroy_all_children();
        this._rows = [];
        let flatIndex = 0;
        for (const section of this._sections) {
            const isTop = section.id === 'top';
            const label = isTop
                ? `${_('Top hit')} · ${section.items[0].title}`
                : _(SECTION_TITLES[section.id] ?? section.id);
            list.add_child(new St.Label({ text: label, style_class: 'kiwi-spotlight-section' }));
            for (const item of section.items) {
                const row = this._makeRow(item, isTop, flatIndex);
                this._rows.push(row);
                list.add_child(row);
                flatIndex++;
            }
        }
        scroll.visible = this._sections.length > 0;
        this._paintSelection(false);
    }

    _makeRow(item, isTop, index) {
        const row = new St.BoxLayout({
            style_class: `kiwi-spotlight-row${isTop ? ' kiwi-spotlight-top' : ''}${item.kind === 'calc' ? ' kiwi-spotlight-calc' : ''}`,
            reactive: true, track_hover: true, x_expand: true,
            accessible_name: item.subtitle ? `${item.title}, ${item.subtitle}` : item.title,
        });
        row.add_child(makeIcon(item, isTop ? TOP_ICON : ROW_ICON));
        const texts = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER,
            style_class: 'kiwi-spotlight-texts',
        });
        const title = new St.Label({ text: item.title, style_class: 'kiwi-spotlight-title' });
        title.clutter_text.ellipsize = 3; // Pango.EllipsizeMode.END
        texts.add_child(title);
        if (item.subtitle) {
            const sub = new St.Label({ text: item.subtitle, style_class: 'kiwi-spotlight-subtitle' });
            sub.clutter_text.ellipsize = 3;
            texts.add_child(sub);
        }
        row.add_child(texts);
        row.add_child(new St.Label({
            text: '↵', style_class: 'kiwi-spotlight-return', y_align: Clutter.ActorAlign.CENTER,
        }));
        row.connect('enter-event', () => {
            // Pointer movement only: a list that re-renders under a still pointer must not steal the selection
            if (this._index !== index && this._pointerMoved(row)) {
                this._index = index;
                this._moved = true;
                this._paintSelection(false);
            }
            return Clutter.EVENT_PROPAGATE;
        });
        row.connect('button-release-event', (_a, event) => {
            if (event.get_button() !== 1)
                return Clutter.EVENT_PROPAGATE;
            this._index = index;
            this._onActivate(item, { reveal: false });
            return Clutter.EVENT_STOP;
        });
        return row;
    }

    _pointerMoved(row) {
        // A row that just appeared under the pointer fires enter-event without a move; ignore
        // the first enter after a render.
        if (row._kiwiSeen)
            return true;
        row._kiwiSeen = true;
        return false;
    }

    _paintSelection(scroll = true) {
        this._rows.forEach((row, i) => {
            if (i === this._index)
                row.add_style_pseudo_class('selected');
            else
                row.remove_style_pseudo_class('selected');
        });
        const row = this._rows[this._index];
        if (row && scroll)
            Util.ensureActorVisibleInScrollView(this._ui.scroll, row);
    }

    // ---- keys

    _keyPress(event) {
        const sym = event.get_key_symbol();
        const ctrl = (event.get_state() & Clutter.ModifierType.CONTROL_MASK) !== 0;
        if (sym === Clutter.KEY_Super_L || sym === Clutter.KEY_Super_R) {
            this._superDown = true;
            this._superTainted = false;
            return Clutter.EVENT_PROPAGATE;
        }
        this._superTainted = true;

        switch (sym) {
        case Clutter.KEY_Down:
            return this._move(1);
        case Clutter.KEY_Up:
            return this._move(-1);
        case Clutter.KEY_Tab:
            return this._jump(false);
        case Clutter.KEY_ISO_Left_Tab:
            return this._jump(true);
        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter:
        case Clutter.KEY_ISO_Enter: {
            const item = this.selected;
            if (item)
                this._onActivate(item, { reveal: ctrl });
            return Clutter.EVENT_STOP;
        }
        case Clutter.KEY_c:
        case Clutter.KEY_C: {
            // Ctrl+C copies the result unless the user selected text in the field
            if (!ctrl || this._ui.text.get_selection())
                return Clutter.EVENT_PROPAGATE;
            const item = this.selected;
            if (!item)
                return Clutter.EVENT_PROPAGATE;
            this._onCopy(item);
            return Clutter.EVENT_STOP;
        }
        default:
            return Clutter.EVENT_PROPAGATE;
        }
    }

    _keyRelease(event) {
        const sym = event.get_key_symbol();
        if (sym !== Clutter.KEY_Super_L && sym !== Clutter.KEY_Super_R)
            return Clutter.EVENT_PROPAGATE;
        const tap = this._superDown && !this._superTainted;
        this._superDown = false;
        if (tap) {
            // A Super tap toggles Spotlight (the overlay-key signal is not delivered in a popup grab)
            this._onClose();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _move(delta) {
        if (flatten(this._sections).length === 0)
            return Clutter.EVENT_PROPAGATE;
        this._index = moveSelection(this._sections, this._index, delta);
        this._moved = true;
        this._paintSelection();
        return Clutter.EVENT_STOP;
    }

    _jump(backwards) {
        if (this._sections.length === 0)
            return Clutter.EVENT_STOP;
        this._index = jumpGroup(this._sections, this._index, backwards);
        this._moved = true;
        this._paintSelection();
        return Clutter.EVENT_STOP;
    }
}
