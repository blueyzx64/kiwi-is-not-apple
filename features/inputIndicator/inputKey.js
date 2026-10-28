// SPDX-License-Identifier: GPL-3.0-or-later
// One key, one action (macOS Keyboard > "Press fn key to"): change the input source or show
// Emoji & Symbols. Linux keyboards have no Globe key that reaches the compositor, so the user
// picks the key (input-key-shortcut: a single key such as Menu or F13, or a chord).
//
// Shell API: ui/status/keyboard.js getInputSourceManager() (currentSource, inputSources,
// _mruSources: private, most recent first, checked on 50.6). Emoji & Symbols is Kiwi's
// emoji-picker feature, looked up when the key is pressed (it may be off).

import { getInputSourceManager } from 'resource:///org/gnome/shell/ui/status/keyboard.js';

import { Keybindings, MODAL_MODES } from '../../lib/keybindings.js';
import { nextSource } from './model.js';

export class InputKeyAction {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
    }

    enable() {
        Keybindings.add(this._cleanup, 'input-key-shortcut', this._ctx.settings, () => this.run(), { modes: MODAL_MODES });
    }

    disable() {
        // Everything is in the cleanup registry
    }

    /** Do what input-key-action says. @returns {string} what happened (for the harness) */
    run() {
        const action = this._ctx.settings.get_string('input-key-action');
        if (action === 'emoji') {
            const picker = this._ctx.features.instance('emoji-picker');
            picker?.toggle();
            return picker ? 'emoji' : 'none';
        }
        if (action === 'input-source') {
            const manager = getInputSourceManager();
            const list = Object.values(manager.inputSources ?? {});
            const target = nextSource(manager._mruSources ?? list, list, manager.currentSource);
            target?.activate(true);
            return target ? 'input-source' : 'none';
        }
        return 'none';
    }
}
