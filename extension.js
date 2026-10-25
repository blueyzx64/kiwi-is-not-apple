/*
 * Kiwi is not Apple – macOS-inspired enhancements for GNOME Shell.
 * Copyright (C) 2025  Arnis Kemlers
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { CleanupRegistry } from './lib/disposables.js';
import { FeatureRegistry } from './lib/featureRegistry.js';
import { FEATURES } from './features.js';
import { Glass } from './lib/glass.js';
import { isDockExtension, resetDockSettings } from './apps/dockUtils.js';
import { restoreStaleColors } from './apps/dockColors.js';

// Keys Kiwi writes itself at run time. No `when` or restartOn reads them, and a write made
// during a refresh would re-enter the registry, so they do not trigger a pass.
const KEYS_THAT_NEVER_AFFECT_FEATURES = new Set(['dock-colors-saved', 'clipboard-recording', 'migrations-done']);

export default class KiwiExtension extends Extension {
    enable() {
        this._cleanup = new CleanupRegistry();
        this._settings = this.getSettings();
        this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        Glass.configure(this._settings);

        this._features = new FeatureRegistry(CleanupRegistry);
        this._features.registerAll(FEATURES);

        this._cleanup.connect(this._settings, 'changed',
            (_settings, key) => {
                if (!KEYS_THAT_NEVER_AFFECT_FEATURES.has(key))
                    this._features.refresh(key);
            });
        this._cleanup.connect(this._interfaceSettings, 'changed::show-battery-percentage',
            () => this._features.apply('battery-percentage'));

        // The dock is a separate extension the user can turn on and off under
        // us, and the dock features follow it either way
        this._cleanup.connect(Main.extensionManager, 'extension-state-changed',
            (_manager, extension) => {
                if (!isDockExtension(extension))
                    return;
                resetDockSettings();
                this._features.refresh(null);
            });

        // A crash or hard logout can leave Dash to Dock colours Kiwi changed; put them back first
        try {
            restoreStaleColors(this._settings);
        } catch (err) {
            console.error('[Kiwi] could not restore dock colours:', err);
        }

        this._features.start({
            extension: this,
            settings: this._settings,
            gettext: this.gettext.bind(this),
            interfaceSettings: this._interfaceSettings,
        });
    }

    disable() {
        this._cleanup?.dispose();
        this._cleanup = null;
        this._features?.stop();
        this._features = null;
        Glass.configure(null);
        this._interfaceSettings = null;
        resetDockSettings();
        this._settings = null;
    }
}
