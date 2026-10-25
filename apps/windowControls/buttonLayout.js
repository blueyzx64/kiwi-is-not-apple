// SPDX-License-Identifier: GPL-3.0-or-later
// Owns org.gnome.desktop.wm.preferences button-layout, so every titlebar follows Kiwi: GTK 3,
// GTK 4 and libadwaita, Chromium/Electron (GTK titlebar) and Mutter's server-side frames.
// Two users, never at the same time (the feature registry stops one before starting the other):
// - the panel window controls, for every window: the layout without its buttons;
// - AppButtonsFeature (appButtons.js), while the top-bar controls are off: the apps' own
//   buttons on the chosen side (appButtonsLayout).
//
// Crash safety: the user's value is saved in the Kiwi key `saved-button-layout` before the
// layout is replaced, and cleared after it is written back. A non-empty saved value when Kiwi
// starts means the last session did not get to restore it; extension.js calls
// restoreStaleButtonLayout() once, before any feature runs.
//
// No gi imports: both settings objects are passed in (Gio.Settings in the Shell, fakes in tests).

import { stripControlButtons } from './model.js';

export const SAVED_KEY = 'saved-button-layout';
const WM_KEY = 'button-layout';

/** Write back a layout saved by a session that ended without restoring it. Returns true if it did. */
export function restoreStaleButtonLayout(kiwiSettings, wmSettings) {
    const saved = kiwiSettings.get_string(SAVED_KEY);
    if (!saved)
        return false;
    if (wmSettings.get_string(WM_KEY) !== saved)
        wmSettings.set_string(WM_KEY, saved);
    kiwiSettings.set_string(SAVED_KEY, '');
    return true;
}

export class ButtonLayoutOwner {
    /**
     * @param {object} kiwiSettings Gio.Settings of Kiwi (get_string / set_string)
     * @param {object} wmSettings Gio.Settings of org.gnome.desktop.wm.preferences
     * @param {() => void} [onOriginalChanged] the user changed the layout while Kiwi owns it
     * @param {(original: string) => string} [transform] the layout Kiwi sets for a given
     *   original; default: the original without its buttons (top-bar controls)
     */
    constructor(kiwiSettings, wmSettings, onOriginalChanged = () => {}, transform = stripControlButtons) {
        this._kiwi = kiwiSettings;
        this._wm = wmSettings;
        this._onOriginalChanged = onOriginalChanged;
        this._transform = transform;
        this._owning = false;
        this._forced = null;
        this._changedId = 0;
    }

    get owning() {
        return this._owning;
    }

    /** The user's own layout: the saved one while Kiwi owns the key, else the live one. */
    get original() {
        if (this._owning) {
            const saved = this._kiwi.get_string(SAVED_KEY);
            if (saved)
                return saved;
        }
        return this._wm.get_string(WM_KEY);
    }

    /** Take or give back the layout. */
    sync(want) {
        if (want && !this._owning)
            this._take();
        else if (!want && this._owning)
            this.release();
    }

    _take() {
        const live = this._wm.get_string(WM_KEY);
        let saved = this._kiwi.get_string(SAVED_KEY);
        if (!saved) {
            saved = live;
            this._kiwi.set_string(SAVED_KEY, saved);
        }
        this._owning = true;
        this._forced = this._transform(saved);
        if (live !== this._forced)
            this._wm.set_string(WM_KEY, this._forced);
        this._changedId = this._wm.connect(`changed::${WM_KEY}`, () => this._onChanged());
    }

    /** The transform's inputs changed (e.g. a Kiwi setting): set the layout again. */
    reapply() {
        if (!this._owning)
            return;
        this._forced = this._transform(this.original);
        if (this._wm.get_string(WM_KEY) !== this._forced)
            this._wm.set_string(WM_KEY, this._forced);
    }

    // Someone else (Tweaks, gsettings) wrote the layout while Kiwi owns it: that is the user's
    // new choice. Save it as the original and keep the buttons out of the titlebars.
    _onChanged() {
        const live = this._wm.get_string(WM_KEY);
        if (!this._owning || live === this._forced)
            return;
        this._kiwi.set_string(SAVED_KEY, live);
        this._forced = this._transform(live);
        if (live !== this._forced)
            this._wm.set_string(WM_KEY, this._forced);
        this._onOriginalChanged();
    }

    /** Put the user's layout back exactly and forget it. Safe to call when not owning. */
    release() {
        if (this._changedId) {
            this._wm.disconnect(this._changedId);
            this._changedId = 0;
        }
        if (!this._owning)
            return;
        this._owning = false;
        this._forced = null;
        restoreStaleButtonLayout(this._kiwi, this._wm);
    }
}
