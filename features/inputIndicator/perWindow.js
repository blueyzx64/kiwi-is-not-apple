// SPDX-License-Identifier: GPL-3.0-or-later
// "Automatically switch to a document's input source" (macOS Keyboard > Input Sources). GNOME
// has the same behaviour per window (org.gnome.desktop.input-sources per-window, honoured by
// ui/status/keyboard.js). Kiwi owns that key through core/originals while input-per-window is
// 'document' or 'global', and gives the user's own value back when it is 'system' (the
// default: Kiwi does not touch it) or on disable.

import Gio from 'gi://Gio';

import { SettingOwner } from '../../core/originals.js';
import { KiwiSettings } from '../../lib/settings.js';

const SCHEMA = 'org.gnome.desktop.input-sources';
const KEY = 'per-window';

export class InputPerWindow {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
    }

    enable() {
        const ks = new KiwiSettings(this._ctx.settings);
        ks.attach(this._cleanup);
        const owner = new SettingOwner(this._ctx.originals, new Gio.Settings({ schema_id: SCHEMA }), KEY, {
            type: 'b',
            transform: () => this._ctx.settings.get_string('input-per-window') === 'document',
        });
        const sync = () => {
            owner.sync(this._ctx.settings.get_string('input-per-window') !== 'system');
            owner.reapply();
        };
        ks.watch(['input-per-window'], sync);
        sync();
        this._cleanup.add(() => owner.release());
    }

    disable() {
        // Everything is in the cleanup registry
    }
}
