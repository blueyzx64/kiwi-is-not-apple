// SPDX-License-Identifier: GPL-3.0-or-later
// Adds Caps Lock and Num Lock indicators to the top panel.

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { PanelLayout } from '../coordinators/panelLayout.js';

export const LockIcon = GObject.registerClass(
class LockIcon extends PanelMenu.Button {
    _init(dir) {
        super._init(0.0, 'Lock Indicator', false);

        // GNOME 51 dropped Clutter.get_default_backend(); go through the context.
        this.keymap = global.stage.get_context().get_backend().get_default_seat().get_keymap();


        // Create icons
        this._numLockIcon = new St.Icon({
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(dir.get_child('icons/num-lock-symbolic.svg').get_path())),
            style_class: 'system-status-icon',
        });

        this._capsLockIcon = new St.Icon({
            gicon: Gio.FileIcon.new(Gio.File.new_for_path(dir.get_child('icons/caps-lock-symbolic.svg').get_path())),
            style_class: 'system-status-icon',
        });

        // Create a layout container to hold both icons. GNOME 51 removed the
        // `vertical` property from StBoxLayout; use `orientation` instead.
        this._lockKeysLayout = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'lockkeys-container',
        });
        this._lockKeysLayout.add_child(this._numLockIcon);
        this._lockKeysLayout.add_child(this._capsLockIcon);
        this.add_child(this._lockKeysLayout);

        // The keymap reports its state through state-changed, so there is no
        // fixed delay: read it now and follow every change after.
        this._keymapChangedId = this.keymap.connect('state-changed', () => {
            this._updateLockState();
        });
        this._updateLockState();
    }

    _updateLockState() {
        const capsLockEnabled = this.keymap.get_caps_lock_state();
        const numLockEnabled = this.keymap.get_num_lock_state();
        
        if (capsLockEnabled !== this._capsLockEnabled) {
            this._capsLockEnabled = capsLockEnabled;
            this._animateIcon(this._capsLockIcon, capsLockEnabled);
        }
        if (numLockEnabled !== this._numLockEnabled) {
            this._numLockEnabled = numLockEnabled;
            this._animateIcon(this._numLockIcon, numLockEnabled);
        }
    }

    _animateIcon(icon, show) {
        icon.remove_all_transitions();

        const [, naturalWidth] = icon.get_preferred_width(-1);

        if (show) {
            icon.visible = true;
            icon.opacity = 0;
            icon.translation_x = naturalWidth;

            icon.ease({
                opacity: 255,
                translation_x: 0,
                duration: 200,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        } else {
            icon.opacity = 255;
            icon.translation_x = 0;

            icon.ease({
                opacity: 0,
                translation_x: naturalWidth,
                duration: 200,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    icon.visible = false;
                },
            });
        }
    }

    destroy() {
        if (this._keymapChangedId) {
            this.keymap.disconnect(this._keymapChangedId);
            this._keymapChangedId = null;
        }
        super.destroy();
    }
});

let lockIcon = null;
let lockSlot = null;

/**
 * @param extension the Extension object (optional); its icons/ folder is used.
 *   Without it the folder next to this file's parent is used.
 */
export function enable(extension) {
    if (!lockIcon) {
        const dir = extension?.dir ??
            Gio.File.new_for_uri(import.meta.url).get_parent().get_parent();
        lockIcon = new LockIcon(dir);
        Main.panel.addToStatusArea('lock-indicator', lockIcon, 0, 'right');
        // Leftmost of the right box, whatever else is enabled (see coordinators/panelLayout.js)
        lockSlot = PanelLayout.claim(null, {
            id: 'lock-indicator', actor: lockIcon.container, box: 'right', anchor: { first: true },
        });
    }
}

export function disable() {
    if (lockIcon) {
        lockSlot?.release();
        lockSlot = null;
        lockIcon.destroy();
        lockIcon = null;
    }
}
