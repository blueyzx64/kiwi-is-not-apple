// SPDX-License-Identifier: GPL-3.0-or-later
// Press and hold for accents: the key state machine of the Kiwi input engine. Pure.
//
// Why the engine types the letter itself: on Wayland the app repeats a held key on its own, so
// a key the engine lets through would turn into "eeee". The engine therefore takes a press of
// an accentable letter, commits the letter, and starts a timer; a release before the timer
// ends is an ordinary keystroke. When the timer fires while the key is still down, the variants
// open (macOS shows them after the key-repeat delay). Repeated presses of the held key are
// swallowed. In the open menu:
//   1..9          pick that variant (the typed letter is replaced)
//   ← →           move the highlight; Return picks the highlighted one
//   Esc           close, keep the letter
//   any other key close, keep the letter, and handle the key as usual
//
// Events in, {handled, effects} out. A key is described by the adapter as
//   {keyval, ch, name, mods}   ch: the character it types or '', name: 'Escape' | 'Return' |
//                              'Left' | 'Right' | 'other', mods: true when Ctrl/Alt/Super is held
// Effects: {type: 'commit', text} | {type: 'delete', count} | {type: 'start-timer'} |
//          {type: 'cancel-timer'} | {type: 'show', variants, cursor} | {type: 'cursor', index} |
//          {type: 'hide'}

import { pickByDigit, variantsFor } from './accentsModel.js';

export class HoldMachine {
    /** @param {{enabled?: boolean}} opts */
    constructor({ enabled = true } = {}) {
        this.enabled = enabled;
        this._state = 'idle';
        this._held = null;      // {keyval, ch, variants}
        this._cursor = -1;
    }

    get state() {
        return this._state;
    }

    get variants() {
        return this._held?.variants ?? [];
    }

    press(key) {
        if (this._state === 'open')
            return this._pressOpen(key);
        if (this._state === 'holding') {
            if (key.keyval === this._held.keyval)
                return { handled: true, effects: [] };     // auto-repeat of the held key
            const effects = [{ type: 'cancel-timer' }];
            this._toIdle();
            const next = this._pressIdle(key);
            return { handled: next.handled, effects: [...effects, ...next.effects] };
        }
        return this._pressIdle(key);
    }

    release(key) {
        if (this._state === 'holding' && key.keyval === this._held.keyval) {
            this._toIdle();
            return { handled: true, effects: [{ type: 'cancel-timer' }] };
        }
        if (this._state === 'open' && key.keyval === this._held.keyval)
            return { handled: true, effects: [] };      // the menu stays after the key is let go
        return { handled: false, effects: [] };
    }

    /** The hold delay ended with the key still down. */
    timeout() {
        if (this._state !== 'holding')
            return { handled: false, effects: [] };
        this._state = 'open';
        this._cursor = -1;
        return { handled: true, effects: [{ type: 'show', variants: this._held.variants, cursor: -1 }] };
    }

    /** A variant was clicked in the popup (0-based). */
    pick(index) {
        if (this._state !== 'open' || index < 0 || index >= this._held.variants.length)
            return { handled: false, effects: [] };
        return this._choose(this._held.variants[index]);
    }

    /** Focus left the field, or the engine was reset: close without typing anything. */
    reset() {
        const effects = [];
        if (this._state === 'holding')
            effects.push({ type: 'cancel-timer' });
        if (this._state === 'open')
            effects.push({ type: 'hide' });
        this._toIdle();
        return { handled: false, effects };
    }

    _pressIdle(key) {
        if (!this.enabled || key.mods || !key.ch)
            return { handled: false, effects: [] };
        const variants = variantsFor(key.ch);
        if (!variants.length)
            return { handled: false, effects: [] };
        this._state = 'holding';
        this._held = { keyval: key.keyval, ch: key.ch, variants };
        return { handled: true, effects: [{ type: 'commit', text: key.ch }, { type: 'start-timer' }] };
    }

    _pressOpen(key) {
        if (key.keyval === this._held.keyval)
            return { handled: true, effects: [] };
        if (!key.mods && key.ch >= '1' && key.ch <= '9') {
            const v = pickByDigit(this._held.variants, key.ch);
            if (v)
                return this._choose(v);
            return { handled: true, effects: [] };      // a number past the list does nothing
        }
        const n = this._held.variants.length;
        if (key.name === 'Right' || key.name === 'Left') {
            const step = key.name === 'Right' ? 1 : -1;
            this._cursor = this._cursor < 0 ? (step > 0 ? 0 : n - 1) : (this._cursor + step + n) % n;
            return { handled: true, effects: [{ type: 'cursor', index: this._cursor }] };
        }
        if (key.name === 'Return' && this._cursor >= 0)
            return this._choose(this._held.variants[this._cursor]);
        if (key.name === 'Escape') {
            this._toIdle();
            return { handled: true, effects: [{ type: 'hide' }] };
        }
        // Any other key: close, keep the letter, then the key itself
        this._toIdle();
        const next = this._pressIdle(key);
        return { handled: next.handled, effects: [{ type: 'hide' }, ...next.effects] };
    }

    _choose(variant) {
        this._toIdle();
        return {
            handled: true,
            effects: [{ type: 'hide' }, { type: 'delete', count: 1 }, { type: 'commit', text: variant }],
        };
    }

    _toIdle() {
        this._state = 'idle';
        this._held = null;
        this._cursor = -1;
    }
}
