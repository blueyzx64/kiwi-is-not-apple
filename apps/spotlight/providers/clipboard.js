// SPDX-License-Identifier: GPL-3.0-or-later
// Clipboard rows from the clipboard feature's history (through ClipboardPort). Text entries
// are matched on their text; images only show in the empty-query list.

import { rank } from '../model.js';
import { ClipboardPort } from '../clipboardPort.js';

const MAX_SCAN = 200;
const MAX_RESULTS = 6;

function toItem(entry, _) {
    const isImage = entry.kind === 'image';
    return {
        id: `clip:${entry.id}`,
        kind: 'clipboard',
        title: isImage ? _('Image') : (entry.preview ?? entry.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
        subtitle: entry.app ? `${_('Clipboard')} · ${entry.app}` : _('Clipboard'),
        keywords: isImage ? [] : [entry.text?.slice(0, 400) ?? ''],
        iconName: isImage ? 'image-x-generic-symbolic' : 'edit-paste-symbolic',
        entry,
    };
}

export class ClipboardProvider {
    constructor(gettext) {
        this._ = gettext;
    }

    get available() {
        return !!ClipboardPort.source;
    }

    searchSync(query) {
        const source = ClipboardPort.source;
        if (!source)
            return [];
        const items = source.items().slice(0, MAX_SCAN)
            .filter(e => e.kind === 'text' && typeof e.text === 'string')
            .map(e => toItem(e, this._));
        // Newest first is the tie-break; rank() is stable
        return rank(items, query, MAX_RESULTS);
    }

    recent(limit = 4) {
        const source = ClipboardPort.source;
        return source ? source.items().slice(0, limit).map(e => toItem(e, this._)) : [];
    }

    /** Copy (never paste: Spotlight is not a paste target). */
    activate(item) {
        ClipboardPort.source?.copy(item.entry);
        return true;
    }
}
