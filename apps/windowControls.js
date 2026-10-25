// SPDX-License-Identifier: GPL-3.0-or-later
// macOS-style close / minimize / maximize buttons in the top bar. They act on the focused
// window and show for every focused window by default (setting: window-controls-scope).
// Uses the PNG icon sets when app window buttons are enabled, otherwise system symbolic
// icons. Where they sit comes from PanelLayout.
//
// Titlebar-button removal for real windows is done by the GTK CSS in gtkThemeManager.js.
// This file never changes the WM button-layout.

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import { CleanupRegistry } from '../lib/disposables.js';
import { KiwiSettings } from '../lib/settings.js';
import { maximizeWindow, unmaximizeWindow } from '../lib/compat.js';
import { PanelLayout } from '../coordinators/panelLayout.js';
import { isMaximized } from './windowTiling.js';
import { IconCatalog } from './windowControls/icons.js';
import {
    MIGRATIONS, parseButtonLayout, resolvePlacement, isExcludedWindow, shouldShow, resolveIcon,
} from './windowControls/model.js';

const BUTTONS = ['minimize', 'maximize', 'close'];

const SYMBOLIC_ICONS = {
    close: 'window-close-symbolic',
    minimize: 'window-minimize-symbolic',
    maximize: 'window-maximize-symbolic',
    restore: 'window-restore-symbolic',
};

// Close stays inert for this long after a window goes fullscreen (guards against a stray click).
const FULLSCREEN_CLOSE_DELAY_MS = 3000;

const WindowControlsIndicator = GObject.registerClass(
class WindowControlsIndicator extends PanelMenu.Button {
    /**
     * The view: three buttons, their icons and hover look. It owns no policy; the feature
     * tells it what to show.
     */
    _init({ catalog, settings, cleanup, onAction }) {
        super._init(0.0, 'window-controls', true);
        this._catalog = catalog;
        this._settings = settings;
        this._onAction = onAction;
        this._useMacosIcons = true;
        this._order = [];
        this._state = { maximized: false, fullscreen: false, can: { minimize: true, maximize: true, close: true } };
        this._closeLocked = false;
        this._isContainerHovered = false;
        this._suppressHover = false;

        this._box = new St.BoxLayout({ style_class: 'window-controls-box' });
        this.add_child(this._box);

        this._buttons = {};
        for (const name of BUTTONS) {
            const button = new St.Button({ style_class: `window-control-button ${name}`, track_hover: true });
            this._buttons[name] = button;
            cleanup.connect(button, 'notify::hover', () => this._updateIcon(name));
            cleanup.connect(button, 'button-press-event', () => {
                button.add_style_pseudo_class('active');
                this._updateIcon(name);
                return Clutter.EVENT_PROPAGATE;
            });
            cleanup.connect(button, 'button-release-event', () => {
                button.remove_style_pseudo_class('active');
                this._updateIcon(name);
                return Clutter.EVENT_PROPAGATE;
            });
            // macOS mode: hovering one button shows the glyphs on all three
            cleanup.connect(button, 'enter-event', () => {
                this._suppressHover = false;
                if (this._useMacosIcons) {
                    this._isContainerHovered = true;
                    this._updateAllIcons();
                }
                return Clutter.EVENT_PROPAGATE;
            });
            cleanup.connect(button, 'leave-event', () => {
                if (this._useMacosIcons) {
                    this._isContainerHovered = false;
                    this._updateAllIcons();
                }
                return Clutter.EVENT_PROPAGATE;
            });
            cleanup.connect(button, 'clicked', () => this._onAction(name));
        }
        cleanup.connect(this._box, 'motion-event', () => {
            if (this._suppressHover) {
                this._suppressHover = false;
                this._updateAllIcons();
            }
            return Clutter.EVENT_PROPAGATE;
        });
        cleanup.connect(this._box, 'leave-event', () => {
            this._isContainerHovered = false;
            this._updateAllIcons();
            return Clutter.EVENT_PROPAGATE;
        });
    }

    setMacosIcons(on) {
        this._useMacosIcons = on;
        this._rebuild();
    }

    setSmall(small) {
        if (small)
            this._box.add_style_class_name('small-size');
        else
            this._box.remove_style_class_name('small-size');
    }

    /** @param {string[]} order button names, left to right */
    setOrder(order) {
        this._order = order;
        this._rebuild();
    }

    /** Window state for the focused window (maximized, fullscreen, can: {minimize, maximize, close}). */
    setWindowState(state) {
        const resetHover = state.maximized !== this._state.maximized || state.fullscreen !== this._state.fullscreen;
        this._state = state;
        if (resetHover) {
            this._isContainerHovered = false;
            BUTTONS.forEach(n => (this._buttons[n].hover = false));
        }
        this._updateAllIcons();
    }

    setCloseLocked(locked) {
        this._closeLocked = locked;
        this._updateAllIcons();
    }

    /** After entering fullscreen, hover looks wait for the pointer to move. */
    suppressHoverUntilMotion(on) {
        if (this._suppressHover === on)
            return;
        this._suppressHover = on;
        this._updateAllIcons();
    }

    refreshIcons() {
        this._updateAllIcons();
    }

    _rebuild() {
        for (const name of BUTTONS) {
            const button = this._buttons[name];
            if (button.get_parent() === this._box)
                this._box.remove_child(button);
            button._currentSystemIcon = null;
        }
        for (const name of this._order)
            this._box.add_child(this._buttons[name]);
        if (this._useMacosIcons)
            this._box.remove_style_class_name('system-mode');
        else
            this._box.add_style_class_name('system-mode');
        this._updateAllIcons();
    }

    _isDisabled(name) {
        if (name === 'close')
            return this._closeLocked || !this._state.can.close;
        if (name === 'minimize')
            return this._state.fullscreen || !this._state.can.minimize;
        return !this._state.can.maximize && !this._state.fullscreen;
    }

    _updateAllIcons() {
        BUTTONS.forEach(n => this._updateIcon(n));
    }

    _updateIcon(name) {
        const button = this._buttons[name];
        const { maximized, fullscreen } = this._state;
        const disabled = this._isDisabled(name);
        button.reactive = !disabled;
        if (disabled)
            button.remove_style_pseudo_class('active');

        const shown = (name === 'maximize' && (maximized || fullscreen)) ? 'restore' : name;

        if (this._useMacosIcons) {
            button.opacity = 255;
            let state = '';
            if (disabled) {
                state = '-backdrop';
            } else {
                const hovered = !this._suppressHover && (button.hover || this._isContainerHovered);
                state = button.has_style_pseudo_class('active') ? '-active' : hovered ? '-hover' : '';
            }
            this._setPngIcon(button, `button-${shown}${state}.png`);
            // Glass icons are edge to edge, so the press zoom comes from scaling
            if (state === '-active' && this._settings.string('button-type') === 'titlebuttons-glass' && button.child) {
                button.child.set_pivot_point(0.5, 0.5);
                button.child.set_scale(1.125, 1.125);
            }
        } else {
            button.opacity = disabled ? 100 : 255;
            this._setSystemIcon(button, shown);
        }
    }

    _setPngIcon(button, iconName) {
        const scale = Main.layoutManager.primaryMonitor?.geometry_scale ?? 1;
        const { folder, name } = resolveIcon({
            buttonType: this._settings.string('button-type'),
            iconName,
            scale,
            has: (f, n) => this._catalog.has(f, n),
        });
        const file = this._catalog.file(folder, name);
        const key = file.get_path();
        if (button._currentPng === key && button.child)
            return;
        button._currentPng = key;
        button.child = new St.Icon({
            gicon: new Gio.FileIcon({ file }),
            style_class: 'window-control-icon',
        });
    }

    _setSystemIcon(button, name) {
        const iconName = SYMBOLIC_ICONS[name];
        if (button._currentSystemIcon === iconName && button.child)
            return;
        button._currentSystemIcon = iconName;
        button._currentPng = null;
        button.child = new St.Icon({ icon_name: iconName, style_class: 'window-control-icon' });
    }
});

/** The feature: settings, focus tracking, actions, placement. Entry: `cls: WindowControlsFeature`. */
export class WindowControlsFeature {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._winCleanup = new CleanupRegistry();
        this._win = null;
        this._indicator = null;
        this._slot = null;
        this._closeDelayToken = 0;
        this._wasFullscreen = false;
    }

    enable() {
        const { extension, settings } = this._ctx;
        const cleanup = this._cleanup;
        const ks = new KiwiSettings(settings);
        this._ks = ks;
        ks.migrate(MIGRATIONS);
        ks.attach(cleanup);

        this._wm = new Gio.Settings({ schema_id: 'org.gnome.desktop.wm.preferences' });
        cleanup.add(() => (this._wm = null));

        const catalog = new IconCatalog(extension.path);
        cleanup.add(() => catalog.destroy());
        catalog.load().then(ok => {
            if (ok && this._indicator)
                this._indicator.refreshIcons();
        });

        this._indicator = new WindowControlsIndicator({
            catalog, settings: ks, cleanup, onAction: name => this._act(name),
        });
        cleanup.add(() => {
            this._indicator.destroy();
            this._indicator = null;
        });
        // Added to the status area so the panel tracks (and removes) it; PanelLayout places it.
        Main.panel.addToStatusArea('window-controls', this._indicator, 0, 'left');

        this._indicator.setMacosIcons(ks.bool('enable-app-window-buttons'));
        this._indicator.setSmall(ks.string('button-size') === 'small');
        this._applyPlacement(true);

        ks.watch('enable-app-window-buttons', () => this._indicator.setMacosIcons(ks.bool('enable-app-window-buttons')));
        ks.watch('button-type', () => this._indicator.refreshIcons());
        ks.watch('button-size', () => this._indicator.setSmall(ks.string('button-size') === 'small'));
        ks.watch('window-controls-position', () => this._applyPlacement(false));
        ks.watch('window-controls-scope', () => this._update());
        cleanup.connect(this._wm, 'changed::button-layout', () => this._applyPlacement(false));

        cleanup.connect(global.display, 'notify::focus-window', () => this._onFocusChanged());
        cleanup.connect(Main.overview, 'showing', () => this._update());
        cleanup.connect(Main.overview, 'hidden', () => this._update());
        cleanup.add(() => this._winCleanup.dispose());

        this._onFocusChanged();
    }

    disable() {
        // Everything is in the cleanup registry, which is disposed right after this.
        this._closeDelayToken = 0;
        this._win = null;
    }

    _applyPlacement(initial) {
        const layout = resolvePlacement(this._ks.string('window-controls-position'),
            parseButtonLayout(this._wm.get_string('button-layout')));
        this._indicator.setOrder(layout.buttons);

        // Left: just before the app icon + name. Right: the last slot of the panel.
        const spec = layout.side === 'left'
            ? { box: 'left', anchor: { before: ['window-title'], fallback: 'last' } }
            : { box: 'right', anchor: { last: true } };
        if (initial || !this._slot) {
            this._slot = PanelLayout.claim(this._cleanup, {
                id: 'window-controls', actor: this._indicator.container, ...spec,
            });
        } else {
            this._slot.update(spec);
        }
    }

    _onFocusChanged() {
        this._winCleanup.dispose();
        const win = global.display.focus_window ?? null;
        this._win = win;
        if (win) {
            for (const sig of ['notify::maximized-horizontally', 'notify::maximized-vertically',
                'notify::fullscreen', 'notify::title'])
                this._winCleanup.connect(win, sig, () => this._update());
        }
        this._update();
    }

    _update() {
        const indicator = this._indicator;
        if (!indicator)
            return;
        const win = this._win;
        const normal = !!win && win.get_window_type() === Meta.WindowType.NORMAL;
        const maximized = normal && isMaximized(win);
        const fullscreen = normal && win.is_fullscreen();

        let excluded = false;
        if (normal) {
            const app = Shell.WindowTracker.get_default().get_window_app(win);
            excluded = isExcludedWindow({ title: win.get_title(), appName: app?.get_name() ?? null });
        }

        const visible = shouldShow({
            scope: this._ks.string('window-controls-scope'),
            hasWindow: normal,
            maximized,
            fullscreen,
            overview: Main.overview.visible,
            excluded,
        });

        indicator.setWindowState({
            maximized,
            fullscreen,
            can: {
                minimize: normal && win.can_minimize(),
                maximize: normal && win.can_maximize(),
                close: normal && win.can_close(),
            },
        });
        indicator.visible = visible;

        if (visible && fullscreen) {
            if (!this._wasFullscreen)
                this._lockCloseTemporarily();
            indicator.suppressHoverUntilMotion(true);
        } else {
            this._unlockClose();
            indicator.suppressHoverUntilMotion(false);
        }
        this._wasFullscreen = visible && fullscreen;
    }

    _lockCloseTemporarily() {
        this._unlockClose();
        this._indicator.setCloseLocked(true);
        this._closeDelayToken = this._cleanup.timeout(FULLSCREEN_CLOSE_DELAY_MS, () => {
            this._closeDelayToken = 0;
            this._indicator?.setCloseLocked(false);
            return GLib.SOURCE_REMOVE;
        }, { name: 'window-controls close delay' });
    }

    _unlockClose() {
        if (this._closeDelayToken) {
            this._cleanup.release(this._closeDelayToken);
            this._closeDelayToken = 0;
        }
        this._indicator?.setCloseLocked(false);
    }

    _act(name) {
        const win = global.display.focus_window;
        if (!win)
            return;
        switch (name) {
        case 'minimize':
            win.minimize();
            break;
        case 'maximize':
            if (win.is_fullscreen())
                win.unmake_fullscreen();
            else if (isMaximized(win))
                unmaximizeWindow(win);
            else
                maximizeWindow(win);
            break;
        case 'close':
            win.delete(global.get_current_time());
            break;
        }
    }
}

// Legacy pair, used while features.js still lists this module as a plain enable/disable entry.
let _legacy = null;

export function enable(ext) {
    if (_legacy)
        return;
    const settings = ext.getSettings();
    const cleanup = new CleanupRegistry();
    const feature = new WindowControlsFeature({ extension: ext, settings }, cleanup);
    feature.enable();
    _legacy = { feature, cleanup };
}

export function disable() {
    if (!_legacy)
        return;
    _legacy.feature.disable();
    _legacy.cleanup.dispose();
    _legacy = null;
}
