// SPDX-License-Identifier: GPL-3.0-or-later
// Notes data: the text of Kiwi's own notes, kept in the Kiwi key widgets-notes ({notes: {id:
// text}}, data.js parseNotes). Kiwi owns every byte of it: no user file is read or written.
// Every view of a note (desktop, Notification Center) follows the key, so an edit in one shows
// in the others. saveNote() is what the widget's text field calls; it needs no running
// provider, so an edit made just before the widget is covered is still written.

import { parseNotes, serializeNotes } from '../data.js';
import { Provider } from './base.js';

const KEY = 'widgets-notes';

/** Store a note's text in Kiwi's settings (the key only changes when the text does). */
export function saveNote(settings, id, text) {
    if (!settings)
        return;
    const current = settings.get_string(KEY);
    const next = serializeNotes(parseNotes(current), id, text);
    if (next !== current)
        settings.set_string(KEY, next);
}

export class NotesProvider extends Provider {
    initial() {
        return { available: false, notes: {} };
    }

    run(cleanup) {
        const settings = this._env.settings;
        this._settings = settings;
        cleanup.add(() => {
            this._settings = null;
        });
        if (!settings) {
            this.publish({ available: false, notes: {} });
            return;
        }
        cleanup.connect(settings, `changed::${KEY}`, () => this._read());
        this._read();
    }

    _read() {
        this.publish({ available: true, notes: parseNotes(this._settings.get_string(KEY)) });
    }
}
