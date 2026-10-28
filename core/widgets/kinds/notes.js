// SPDX-License-Identifier: GPL-3.0-or-later
// Note: a sticky note you write on in place (macOS Stickies' yellow, or glass). The text is
// Kiwi's own, kept in the widgets-notes key (core/widgets/providers/notes.js), so the same note
// shows on the desktop and in the Notification Center. Typing saves after a short pause and
// when the note loses focus; Esc leaves the note.

import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { CleanupRegistry } from '../../../lib/disposables.js';
import { NOTE_MAX } from '../data.js';
import { saveNote } from '../providers/notes.js';
import { N_, label } from './common.js';

const SAVE_MS = 600;
const COLORS = [
    ['yellow', N_('Yellow')], ['blue', N_('Blue')], ['green', N_('Green')], ['pink', N_('Pink')],
    ['purple', N_('Purple')], ['glass', N_('Glass')],
];
const colorOf = view => (COLORS.some(([c]) => c === view.config.color) ? view.config.color : 'yellow');
const noteId = view => (typeof view.config.note === 'string' && view.config.note ? view.config.note : 'default');

export default {
    id: 'note',
    title: N_('Note'),
    category: N_('Notes'),
    sizes: ['small', 'medium', 'large', 'extraLarge'],
    defaultSize: 'small',
    provider: 'notes',
    bleed: true,

    build(view) {
        const _ = view._;
        const cleanup = new CleanupRegistry();
        const id = noteId(view);
        const root = view.content;
        root.add_style_class_name('kiwi-widget-note');
        root.add_style_class_name(`kiwi-widget-note-${colorOf(view)}`);

        const entry = new St.Entry({
            style_class: 'kiwi-widget-note-text',
            hint_text: _('Write a note…'),
            accessible_name: _('Note'),
            can_focus: true,
            x_expand: true,
            // As tall as its text, from the top: St.Entry centres its text in any extra height
            y_align: Clutter.ActorAlign.START,
        });
        const text = entry.clutter_text;
        text.single_line_mode = false;
        text.activatable = false;
        text.line_wrap = true;
        text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        text.max_length = NOTE_MAX;
                root.add_child(entry);
        const off = label(_('Notes are not available'), 'kiwi-widget-caption kiwi-secondary-text', { visible: false });
        root.add_child(off);

        let saveId = 0;
        let typed = false;
        const save = () => {
            if (saveId)
                cleanup.release(saveId);
            saveId = 0;
            if (!typed)
                return;
            typed = false;
            saveNote(view.env.settings, id, text.text);
        };
        let setting = false;
        cleanup.connect(text, 'text-changed', () => {
            if (setting)
                return;
            typed = true;
            if (saveId)
                cleanup.release(saveId);
            saveId = cleanup.timeout(SAVE_MS, () => {
                saveId = 0;
                save();
            }, { name: 'kiwi-widgets-note-save' });
        });
        cleanup.connect(text, 'key-focus-out', () => save());
        // A press on the entry outside its text (an empty note shows only the hint) focuses
        // it too: St.Entry leaves that to its ClutterText
        cleanup.connect(entry, 'button-press-event', () => {
            if (global.stage.get_key_focus() !== text)
                text.grab_key_focus();
            return Clutter.EVENT_PROPAGATE;
        });
        cleanup.connect(text, 'key-press-event', (_a, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            save();
            global.stage.set_key_focus(null);
            return Clutter.EVENT_STOP;
        });
        // A pending edit is written before the note goes away (view destroyed, colour changed)
        cleanup.add(() => save());

        return {
            update(d) {
                entry.visible = d?.available !== false;
                off.visible = d?.available === false;
                if (!d?.available)
                    return;
                const stored = d.notes?.[id] ?? '';
                // Never overwrite what is being typed
                if (typed || global.stage.get_key_focus() === text || text.text === stored)
                    return;
                setting = true;
                try {
                    text.text = stored;
                } finally {
                    setting = false;
                }
            },
            destroy() {
                cleanup.dispose();
            },
        };
    },

    // A click on the note's margin puts the cursor in it
    open(view) {
        const entry = view.content.get_first_child();
        if (entry instanceof St.Entry)
            entry.clutter_text.grab_key_focus();
    },

    options(view) {
        const current = colorOf(view);
        return COLORS.map(([c, name]) => ({
            label: view._(name),
            active: c === current,
            apply: () => ({ color: c }),
        }));
    },
};
