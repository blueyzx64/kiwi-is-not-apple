// SPDX-License-Identifier: GPL-3.0-or-later
// Filters minimized windows out of overview and switcher lists.
//
// Which ones is WindowState.hideFromSwitcher(): with the user's "hide minimized windows" switch
// on, every minimized window except the ones Stage Manager staged; when only minimize-to-dock
// turned this module on, just the windows parked in the dock (the rest behave as stock).

import { InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js';
import { Workspace } from 'resource:///org/gnome/shell/ui/workspace.js';
import {
    GroupCyclerPopup,
    WindowCyclerPopup,
    WindowSwitcherPopup,
} from 'resource:///org/gnome/shell/ui/altTab.js';

import { WindowState } from '../coordinators/windowState.js';

let _injectionManager = null;
let _settings = null;

// No settings handed in (older features.js entry): keep the old "every minimized window" rule
const _hideAll = () => _settings?.get_boolean('hide-minimized-windows') ?? true;
const _hidden = w => WindowState.hideFromSwitcher(w, { hideAllMinimized: _hideAll() });

function _filterMinimized(original) {
    return function (...args) {
        return original.apply(this, args).filter(w => !_hidden(w));
    };
}

/** @param {?Gio.Settings} [settings] Kiwi's settings (ctx.settings) */
export function enable(settings = null) {
    _settings = settings;
    if (_injectionManager) return;
    _injectionManager = new InjectionManager();

    _injectionManager.overrideMethod(Workspace.prototype, '_isOverviewWindow',
        original => function (win) {
            return original.call(this, win) && !_hidden(win);
        });
    _injectionManager.overrideMethod(WindowCyclerPopup.prototype, '_getWindows', _filterMinimized);
    _injectionManager.overrideMethod(GroupCyclerPopup.prototype, '_getWindows', _filterMinimized);
    _injectionManager.overrideMethod(WindowSwitcherPopup.prototype, '_getWindowList', _filterMinimized);
}

export function disable() {
    _injectionManager?.clear();
    _injectionManager = null;
    _settings = null;
}
