// SPDX-License-Identifier: GPL-3.0-or-later
// ⇪ inside the password field of a Shell dialog while Caps Lock is on (macOS login window and
// password sheets), in place of the Shell's "Caps lock is on" line under the field.
//
// Shell API (js/ui/shellEntry.js CapsLockWarning, an St.Label `.caps-lock-warning-label` that
// polkitAgent.js, keyring.js, networkAgent.js and shellMountOperation.js put under their
// St.PasswordEntry; checked on 50.6). The label is kept hidden (lib/keepHidden.js) while the
// dialog is dressed and gets its own visibility back when it is undressed. The ⇪ is a child of
// the ModalDialog itself (a full-stage actor without a layout manager), placed over the
// focused password entry, so the entry's own layout and its show-password button are untouched.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

import * as A11y from '../../lib/a11y.js';
import { keepHidden } from '../../lib/keepHidden.js';
import { capsIconField, capsIconPosition } from './model.js';

const CAPS_ICON = 'icons/kiwi-caps-lock-symbolic.svg';
const ICON_SIZE = 16;
const WARNING_CLASS = 'caps-lock-warning-label';

function descendants(actor, out = []) {
    for (const child of actor.get_children()) {
        out.push(child);
        descendants(child, out);
    }
    return out;
}

function isPasswordEntry(actor) {
    return actor instanceof St.PasswordEntry ||
        (actor instanceof St.Entry && (actor.clutter_text?.password_char ?? 0) !== 0);
}

/**
 * Put the ⇪ into the password fields of a dialog that is being dressed.
 *
 * @param {ModalDialog} dialog
 * @param {CleanupRegistry} reg the dialog's dress registry
 * @param {{extension: object, gettext: Function}} ctx
 * @returns {?{icon: St.Icon}} null when the dialog has no password field
 */
export function dressCapsLock(dialog, reg, ctx) {
    const all = descendants(dialog);
    const entries = all.filter(isPasswordEntry);
    if (!entries.length)
        return null;

    for (const label of all.filter(a => a.has_style_class_name?.(WARNING_CLASS)))
        reg.add(keepHidden(label));

    const icon = new St.Icon({
        gicon: Gio.FileIcon.new(ctx.extension.dir.resolve_relative_path(CAPS_ICON)),
        icon_size: ICON_SIZE, style_class: 'kiwi-dialog-caps-lock', reactive: false, visible: false,
    });
    A11y.name(icon, ctx.gettext('Caps Lock is on'), A11y.Role.ALERT);
    dialog.add_child(icon);
    reg.actor(icon);

    const backend = global.stage.context?.get_backend?.() ?? Clutter.get_default_backend();
    const keymap = backend.get_default_seat().get_keymap();
    const sync = () => {
        const focus = global.stage.key_focus;
        const fields = entries.map(e => ({
            focused: focus === e || focus === e.clutter_text,
            shown: e.is_mapped() && e.visible,
        }));
        const i = keymap.get_caps_lock_state() ? capsIconField(fields) : -1;
        if (i < 0) {
            icon.visible = false;
            return;
        }
        const entry = entries[i];
        const [dx, dy] = dialog.get_transformed_position();
        const [ex, ey] = entry.get_transformed_position();
        const [ew, eh] = entry.get_transformed_size();
        const button = entry.get_secondary_icon?.();
        let buttonRect = null;
        if (button?.visible && button.is_mapped()) {
            const [bx, by] = button.get_transformed_position();
            const [bw, bh] = button.get_transformed_size();
            buttonRect = { x: bx - dx, y: by - dy, width: bw, height: bh };
        }
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const size = ICON_SIZE * scale;
        const pos = capsIconPosition({ x: ex - dx, y: ey - dy, width: ew, height: eh }, buttonRect,
            { width: size, height: size }, 8 * scale);
        icon.set_position(pos.x, pos.y);
        icon.visible = true;
        dialog.set_child_above_sibling(icon, null);
    };

    // Allocation changes arrive during a layout pass: place the ⇪ once, right after it
    let pending = 0;
    const syncLater = () => {
        if (pending)
            return;
        pending = reg.idle(() => {
            pending = 0;
            sync();
        }, { name: 'dialog-caps-lock' });
    };

    reg.connect(keymap, 'state-changed', sync);
    reg.connect(global.stage, 'notify::key-focus', sync);
    // The card moves when its content changes size (an error line appears): follow every box
    // between the entries and the dialog
    const watched = new Set();
    for (const entry of entries) {
        for (let a = entry; a && a !== dialog; a = a.get_parent()) {
            if (watched.has(a))
                continue;
            watched.add(a);
            reg.connect(a, 'notify::allocation', syncLater);
            reg.connect(a, 'notify::mapped', syncLater);
        }
    }
    syncLater();
    return { icon };
}
