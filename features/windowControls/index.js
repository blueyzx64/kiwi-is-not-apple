// SPDX-License-Identifier: GPL-3.0-or-later
// macOS-style close / minimize / maximize buttons in the top bar. They act on the focused
// window. Setting window-controls-scope, default 'maximized': a window with no controls of its
// own (Mutter draws its title bar) always has them here; one with its own (a header bar) keeps
// them there until it is maximized, full screen or touching the top bar (a tile whose top is the
// work area's top, or a window dragged against the bar). Then they move here and the app's own
// are taken off, for the window that has focus.
// Uses the PNG icon sets when app window buttons are enabled, otherwise system symbolic
// icons. Where they sit comes from PanelLayout.
//
// Minimize and maximize are offered for every window, whatever it advertises (owner request):
// see _minimize() / _maximize() for what is done when mutter would refuse.
//
// The apps' own titlebars: ButtonLayoutOwner owns the WM button-layout while this runs (the
// user's layout is saved by core/originals and restored exactly on disable). It holds the apps'
// buttons on the chosen side (window-controls-side), or the layout without buttons where the
// top bar has them instead (remove-titlebar-buttons): always for scope 'all'; for the maximized
// and fullscreen scopes only while the focused window has a server-side frame (Mutter draws
// it from the global layout). The GTK CSS in gtkTheme.js hides the buttons of client-side
// windows in those states (see titlebarHideSheet for why not for 'all').
//
// The green button (macOS): a click goes full screen (windows-green-click 'fullscreen', the
// macOS default, in its own Space while that feature runs) or zooms ('zoom'); Alt-click does
// the other one. Hovering over it or pressing and holding it (the menu opens on release) opens the Fill & Arrange menu
// (greenMenu.js); its tiles go to the tiling engine through the 'window-tile-requested' event.
//
// Look (windows-traffic-style): 'glass' draws the macOS 27 glass beads in CSS (a gradient bead,
// a catchlight, a rim, the glyphs on hover, a small press); 'flat' keeps the classic PNG set.

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import { CleanupRegistry } from '../../lib/disposables.js';
import { KiwiSettings } from '../../lib/settings.js';
import { isMaximized, maximizeWindow, unmaximizeWindow } from '../../lib/compat.js';
import { PanelLayout } from '../../core/panelLayout.js';
import { isHelperWindowInfo } from '../../core/desktopModel.js';
import { WindowState } from '../../core/windowState.js';
import { zoneTouchesTop } from '../../core/tileActions.js';

import { IconCatalog } from './icons.js';
import {
    placementFor, shouldShow, resolveIcon, hidesTitlebarButtons, titlebarLayout, touchesTopBar, planMinimize, planMaximize, planGreenClick, centerIn, sameRect,
} from './model.js';
import { GreenMenu } from './greenMenu.js';
import { X11Titlebars } from './x11Titlebars.js';
import { ButtonLayoutOwner, WM_SCHEMA } from './buttonLayout.js';

const BUTTONS = ['minimize', 'maximize', 'close'];

// Normal windows and dialogs: GTK dialogs lose their own buttons too, so they need the panel ones.
const CONTROL_WINDOW_TYPES = [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG];

const SYMBOLIC_ICONS = {
    close: 'window-close-symbolic',
    minimize: 'window-minimize-symbolic',
    maximize: 'window-maximize-symbolic',
    restore: 'window-restore-symbolic',
};

// Close stays inert for this long after a window goes fullscreen (guards against a stray click).
const FULLSCREEN_CLOSE_DELAY_MS = 3000;

// The green-button menu opens after this much hover, or this long a press (macOS: a short
// rest on the button, or a click-and-hold)
const GREEN_HOVER_MS = 600;
const GREEN_HOLD_MS = 450;

// Glyphs on the glass beads (shown while the cluster is hovered)
const BEAD_GLYPHS = {
    close: 'window-close-symbolic',
    minimize: 'window-minimize-symbolic',
    fullscreen: 'view-fullscreen-symbolic',
    restore: 'view-restore-symbolic',
    zoom: 'list-add-symbolic',
    unzoom: 'list-remove-symbolic',
};

const WindowControlsIndicator = GObject.registerClass(
class WindowControlsIndicator extends PanelMenu.Button {
    /**
     * The view: three buttons, their icons and hover look. It owns no policy; the feature
     * tells it what to show.
     */
    _init({ catalog, settings, cleanup, motion, onAction, onGreenMenu, onHover, gettext: _ }) {
        super._init(0.0, _('Window Controls'), true);
        this.add_style_class_name('kiwi-window-controls-indicator');
        this._catalog = catalog;
        this._settings = settings;
        this._cleanup = cleanup;
        this._motion = motion;
        this._onAction = onAction;
        this._onGreenMenu = onGreenMenu;
        this._useMacosIcons = true;
        this._glass = true;
        this._greenMode = 'fullscreen';
        this._greenMenu = true;
        this._greenTimer = 0;
        this._skipClick = false;
        this._holdReached = false;
        this._order = [];
        this._state = { maximized: false, fullscreen: false, can: { minimize: true, maximize: true, close: true } };
        this._closeLocked = false;
        this._isContainerHovered = false;
        this._suppressHover = false;

        this._box = new St.BoxLayout({ style_class: 'window-controls-box' });
        this.add_child(this._box);

        this._buttons = {};
        for (const name of BUTTONS) {
            const button = new St.Button({
                style_class: `window-control-button ${name}`,
                track_hover: true,
                can_focus: true,
                accessible_name: { close: _('Close'), minimize: _('Minimize'), maximize: _('Maximize') }[name],
            });
            this._buttons[name] = button;
            // Shell shutdown destroys the buttons before the box gets its last leave-event
            cleanup.connect(button, 'destroy', () => {
                this._buttons[name] = null;
            });
            cleanup.connect(button, 'notify::hover', () => {
                this._updateIcon(name);
                if (name === 'maximize')
                    onHover?.(button, button.hover);
            });
            // St.Button's click gesture takes the release, so button-release-event never
            // arrives (GNOME 50): follow its pressed state instead (it sets :active itself)
            cleanup.connect(button, 'notify::pressed', () => {
                const down = button.pressed;
                this._updateIcon(name);
                this._press(button, down);
                if (name !== 'maximize')
                    return;
                if (down) {
                    // A new press: only a hold that opens the menu swallows its click
                    this._skipClick = false;
                    this._armGreenMenu(GREEN_HOLD_MS);
                } else {
                    this._disarmGreenMenu();
                    if (this._holdReached) {
                        this._holdReached = false;
                        this._onGreenMenu(false);
                    }
                }
            });
            // macOS mode: hovering one button shows the glyphs on all three
            cleanup.connect(button, 'enter-event', () => {
                this._suppressHover = false;
                if (this._useMacosIcons) {
                    this._isContainerHovered = true;
                    this._updateAllIcons();
                }
                if (name === 'maximize')
                    this._armGreenMenu(GREEN_HOVER_MS);
                return Clutter.EVENT_PROPAGATE;
            });
            cleanup.connect(button, 'leave-event', () => {
                if (this._useMacosIcons) {
                    this._isContainerHovered = false;
                    this._updateAllIcons();
                }
                if (name === 'maximize')
                    this._disarmGreenMenu();
                return Clutter.EVENT_PROPAGATE;
            });
            cleanup.connect(button, 'clicked', () => {
                // The press that opened the menu is not also a click
                if (name === 'maximize' && this._skipClick) {
                    this._skipClick = false;
                    return;
                }
                this._onAction(name);
            });
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

    /** 'glass' (macOS 27 beads) or 'flat' (the classic PNG set); macOS icons mode only. */
    setTrafficStyle(style) {
        this._glass = style !== 'flat';
        this._rebuild();
    }

    /** What the green button does on click ('fullscreen' | 'zoom'), for its glyph. */
    setGreenMode(mode) {
        this._greenMode = mode;
        this._updateAllIcons();
    }

    /** Whether hovering / holding the green button opens the menu. */
    setGreenMenu(on) {
        this._greenMenu = on;
        if (!on)
            this._disarmGreenMenu();
    }

    /** The green button, the menu's anchor. */
    get greenButton() {
        return this._buttons.maximize;
    }

    _armGreenMenu(ms) {
        this._disarmGreenMenu();
        if (!this._greenMenu || this._isDisabled('maximize'))
            return;
        const viaHold = ms === GREEN_HOLD_MS;
        this._greenTimer = this._cleanup.timeout(ms, () => {
            this._greenTimer = 0;
            // Crossing events can be missed while the top bar hides and comes back (full
            // screen): open only if the pointer is still on the button, or still pressing it
            const button = this._buttons.maximize;
            if (!button || !(viaHold ? button.pressed : button.hover))
                return GLib.SOURCE_REMOVE;
            if (viaHold) {
                // Opened on release: a menu grab taken in the middle of the press leaves the
                // button's click gesture waiting for a release that never comes, and it then
                // ignores every later press (GNOME 50.6). The release is not a click.
                this._holdReached = true;
                this._skipClick = true;
                return GLib.SOURCE_REMOVE;
            }
            this._onGreenMenu(true);
            return GLib.SOURCE_REMOVE;
        }, { name: 'kiwi green menu' });
    }

    _disarmGreenMenu() {
        if (this._greenTimer) {
            this._cleanup.release(this._greenTimer);
            this._greenTimer = 0;
        }
    }

    // A small press on the glass beads (scale 0.94), through core/motion
    _press(button, down) {
        const bead = button.child?._kiwiBead ? button.child : null;
        if (!bead || !this._motion)
            return;
        this._motion.ease(bead, { scale_x: down ? 0.94 : 1, scale_y: down ? 0.94 : 1 },
            { duration: 'micro', curve: 'enter' }, this._cleanup);
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
            BUTTONS.forEach(n => {
                if (this._buttons[n])
                    this._buttons[n].hover = false;
            });
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
            if (!button)
                continue;
            if (button.get_parent() === this._box)
                this._box.remove_child(button);
            button._currentSystemIcon = null;
            button._currentPng = null;
        }
        for (const name of this._order) {
            if (this._buttons[name])
                this._box.add_child(this._buttons[name]);
        }
        if (this._useMacosIcons)
            this._box.remove_style_class_name('system-mode');
        else
            this._box.add_style_class_name('system-mode');
        if (this._useMacosIcons && this._glass)
            this._box.add_style_class_name('glass-mode');
        else
            this._box.remove_style_class_name('glass-mode');
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
        if (!button)
            return;
        const { maximized, fullscreen } = this._state;
        const disabled = this._isDisabled(name);
        button.reactive = !disabled;
        if (disabled)
            button.remove_style_pseudo_class('active');

        const shown = (name === 'maximize' && (maximized || fullscreen)) ? 'restore' : name;

        if (this._useMacosIcons && this._glass) {
            button.opacity = 255;
            const hovered = !disabled && !this._suppressHover && (button.hover || this._isContainerHovered);
            this._setBead(button, name, this._glyphFor(name), disabled, hovered);
        } else if (this._useMacosIcons) {
            button.opacity = 255;
            let state = '';
            if (disabled) {
                state = '-backdrop';
            } else {
                const hovered = !this._suppressHover && (button.hover || this._isContainerHovered);
                state = button.pressed ? '-active' : hovered ? '-hover' : '';
            }
            this._setPngIcon(button, `button-${shown}${state}.png`);
        } else {
            button.opacity = disabled ? 100 : 255;
            this._setSystemIcon(button, shown);
        }
    }

    _glyphFor(name) {
        if (name !== 'maximize')
            return BEAD_GLYPHS[name];
        const { maximized, fullscreen } = this._state;
        if (fullscreen)
            return BEAD_GLYPHS.restore;
        if (this._greenMode === 'zoom')
            return maximized ? BEAD_GLYPHS.unzoom : BEAD_GLYPHS.zoom;
        return BEAD_GLYPHS.fullscreen;
    }

    // The bead: a gradient circle with a catchlight and a glyph shown on hover (CSS in
    // style.css). Built once per button and kept while the glass style is on.
    _setBead(button, name, glyph, disabled, hovered) {
        let bead = button.child?._kiwiBead ? button.child : null;
        if (!bead) {
            bead = new St.Widget({
                style_class: `kiwi-tl-bead ${name}`,
                layout_manager: new Clutter.BinLayout(),
                pivot_point: new Graphene.Point({ x: 0.5, y: 0.5 }),
            });
            bead._kiwiBead = true;
            bead.add_child(new St.Widget({
                style_class: 'kiwi-tl-catchlight',
                x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.START,
                x_expand: true, y_expand: true,
            }));
            bead._glyph = new St.Icon({
                style_class: 'kiwi-tl-glyph', icon_name: glyph,
                x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
                x_expand: true, y_expand: true,
            });
            bead.add_child(bead._glyph);
            button._currentPng = null;
            button._currentSystemIcon = null;
            button.child = bead;
        }
        if (bead._glyph.icon_name !== glyph)
            bead._glyph.icon_name = glyph;
        bead._glyph.opacity = hovered ? 255 : 0;
        if (disabled)
            bead.add_style_class_name('backdrop');
        else
            bead.remove_style_class_name('backdrop');
    }

    _setPngIcon(button, iconName) {
        const scale = Main.layoutManager.primaryMonitor?.geometry_scale ?? 1;
        const { folder, name } = resolveIcon({
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
        this._layoutOwner = null;
        this._hidden = false;   // the layout Kiwi holds has no buttons
        this._onPanel = false;  // the focused window's controls belong in the top bar
        this._touching = false; // the focused window's top edge is against the top bar
        this._moving = false;   // the focused window is being dragged: its state waits for the drop
        this._filled = new Map(); // window -> frame rect before Kiwi filled the work area
    }

    enable() {
        const { extension, settings } = this._ctx;
        const cleanup = this._cleanup;
        const ks = new KiwiSettings(settings);
        this._ks = ks;
        ks.attach(cleanup);

        this._wm = new Gio.Settings({ schema_id: WM_SCHEMA });
        cleanup.add(() => (this._wm = null));

        // The cleanup registry runs LIFO: this release runs after the indicator is gone and
        // before this._wm is dropped.
        this._layoutOwner = new ButtonLayoutOwner(this._ctx.originals, this._wm, () => {},
            original => titlebarLayout(original, {
                hide: this._hidden,
                side: ks.string('window-controls-side'),
                set: ks.string('app-buttons-set'),
            }));
        cleanup.add(() => {
            this._layoutOwner.release();
            this._layoutOwner = null;
        });
        cleanup.add(() => this._filled.clear());

        const catalog = new IconCatalog(extension.path);
        cleanup.add(() => catalog.destroy());
        catalog.load().then(ok => {
            if (ok && this._indicator)
                this._indicator.refreshIcons();
        });

        const gettext = this._ctx.gettext ?? (s => s);
        this._indicator = new WindowControlsIndicator({
            catalog, settings: ks, cleanup, motion: this._ctx.motion,
            // After the click has finished: full screen hides the top bar, and a button
            // hidden in the middle of its own click gesture stops taking presses (seen on
            // GNOME 50.6 with the green button)
            onAction: name => cleanup.idle(() => this._act(name), { name: 'kiwi window control' }),
            onGreenMenu: viaHover => this._openGreenMenu(viaHover),
            // With the green menu off, the green button's hover goes out as an event so Split
            // View can offer its own menu; with it on, the green menu offers Split View itself
            onHover: (actor, hovered) => {
                if (!ks.bool('windows-green-menu'))
                    this._ctx.events?.emit('green-button-hover',
                        { window: global.display.focus_window ?? null, actor, hovered });
            },
            gettext,
        });
        cleanup.add(() => {
            this._indicator.destroy();
            this._indicator = null;
        });
        // Added to the status area so the panel tracks (and removes) it; PanelLayout places it.
        Main.panel.addToStatusArea('window-controls', this._indicator, 0, 'left');
        // The indicator is no menu source, but the panel put its dummy menu in the menu manager,
        // and it shares its source actor with the green menu: with the green menu open, the
        // pointer entering the button made the manager "switch" to the dummy menu, whose grab
        // nothing ever closed (Main.modalCount stuck at 1, shortcuts dead)
        Main.panel.menuManager.removeMenu(this._indicator.menu);

        // Disposed before the indicator (LIFO): the menu is anchored to its green button
        this._greenMenu = new GreenMenu({
            source: this._indicator, target: this._indicator.greenButton, gettext, cleanup,
            onAction: (action, arg) => this._greenMenuAction(action, arg),
        });
        cleanup.add(() => (this._greenMenu = null));

        this._hidden = this._wantsHidden();
        this._layoutOwner.sync(true);
        new X11Titlebars(ks, cleanup).enable();
        this._indicator.setMacosIcons(ks.bool('enable-app-window-buttons'));
        this._indicator.setSmall(ks.string('button-size') === 'small');
        this._indicator.setTrafficStyle(ks.string('windows-traffic-style'));
        this._indicator.setGreenMode(ks.string('windows-green-click'));
        this._indicator.setGreenMenu(ks.bool('windows-green-menu'));
        this._applyPlacement(true);

        ks.watch('windows-traffic-style', () => this._indicator.setTrafficStyle(ks.string('windows-traffic-style')));
        ks.watch('windows-green-click', () => this._indicator.setGreenMode(ks.string('windows-green-click')));
        ks.watch('windows-green-menu', () => this._indicator.setGreenMenu(ks.bool('windows-green-menu')));

        ks.watch('enable-app-window-buttons', () => this._indicator.setMacosIcons(ks.bool('enable-app-window-buttons')));
        ks.watch('button-size', () => this._indicator.setSmall(ks.string('button-size') === 'small'));
        ks.watch('window-controls-side', () => {
            this._layoutOwner.reapply();
            this._applyPlacement(false);
        });
        ks.watch('app-buttons-set', () => this._layoutOwner.reapply());
        ks.watch('window-controls-scope', () => this._update());
        ks.watch('remove-titlebar-buttons', () => this._update());
        // A tile changes whether the window touches the top bar
        this._ctx.events.on('window-tiled', () => this._onGeometry(), cleanup);
        // A window being dragged keeps the controls it had until it is dropped
        cleanup.connect(global.display, 'grab-op-begin', (_d, win, op) => {
            if (win === this._win && (op === Meta.GrabOp.MOVING || op === Meta.GrabOp.MOVING_UNCONSTRAINED))
                this._moving = true;
        });
        cleanup.connect(global.display, 'grab-op-end', () => {
            if (!this._moving)
                return;
            this._moving = false;
            this._onGeometry();
        });

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

    // Should the WM button-layout have no buttons for the focused window now?
    _wantsHidden() {
        return hidesTitlebarButtons({
            remove: this._ks.bool('remove-titlebar-buttons'),
            scope: this._ks.string('window-controls-scope'),
            onPanel: this._onPanel,
        });
    }

    _syncTitlebars() {
        const hidden = this._wantsHidden();
        if (hidden === this._hidden)
            return;
        this._hidden = hidden;
        this._layoutOwner?.reapply();
    }

    _applyPlacement(initial) {
        if (!this._indicator)
            return;
        const layout = placementFor(this._ks.string('window-controls-side'));
        this._indicator.setOrder(layout.buttons);

        // Left: just before the menu bar's app name and menus. Right: the far right of the bar,
        // after the clock
        const spec = layout.side === 'left'
            ? { box: 'left', anchor: { before: ['kiwi-menubar-apps'], fallback: 'last' } }
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
        for (const w of [...this._filled.keys()]) {
            if (!w.get_compositor_private())
                this._filled.delete(w);
        }
        const win = global.display.focus_window ?? null;
        this._win = win;
        if (win) {
            for (const sig of ['notify::maximized-horizontally', 'notify::maximized-vertically',
                'notify::fullscreen', 'notify::title'])
                this._winCleanup.connect(win, sig, () => this._update());
            for (const sig of ['position-changed', 'size-changed'])
                this._winCleanup.connect(win, sig, () => this._onGeometry());
        }
        this._moving = false;
        this._touching = this._touchesTopBar(win);
        this._update();
    }

    // Does the window's top edge sit against the top bar? A tile of the engine whose top is the
    // work area's top counts even with margins between tile and bar.
    _touchesTopBar(win) {
        if (!win || win.minimized)
            return false;
        const tiling = this._ctx.features.instance('window-tiling');
        return zoneTouchesTop(tiling?.zoneOf(win)) ||
            touchesTopBar(win.get_frame_rect(), win.get_work_area_current_monitor());
    }

    _onGeometry() {
        if (this._moving)
            return;
        const touching = this._touchesTopBar(this._win);
        if (touching === this._touching)
            return;
        this._touching = touching;
        this._update();
    }

    _update() {
        const indicator = this._indicator;
        if (!indicator)
            return;
        const win = this._win;
        const normal = !!win && CONTROL_WINDOW_TYPES.includes(win.get_window_type());
        const maximized = normal && isMaximized(win);
        const fullscreen = normal && win.is_fullscreen();

        let excluded = false;
        if (normal) {
            const app = Shell.WindowTracker.get_default().get_window_app(win);
            excluded = isHelperWindowInfo({ title: win.get_title(), appName: app?.get_name() ?? null });
        }

        const state = {
            scope: this._ks.string('window-controls-scope'),
            hasWindow: normal,
            maximized,
            fullscreen,
            touching: normal && this._touching,
            noOwnControls: normal && win.decorated,
            excluded,
        };
        // The overview hides the controls but does not give the apps' buttons back
        this._onPanel = shouldShow({ ...state, overview: false });
        const visible = this._onPanel && !Main.overview.visible;

        // Minimize and maximize are forced for every window (see _minimize / _maximize).
        indicator.setWindowState({
            maximized,
            fullscreen,
            can: {
                minimize: normal,
                maximize: normal,
                close: normal && win.can_close(),
            },
        });
        indicator.visible = visible;
        this._syncTitlebars();

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
            this._minimize(win);
            break;
        case 'maximize':
            this._green(win);
            break;
        case 'close':
            win.delete(global.get_current_time());
            break;
        }
    }

    // Click: full screen or zoom (windows-green-click); Alt-click the other one
    _green(win) {
        const [, , mods] = global.get_pointer();
        const plan = planGreenClick({
            mode: this._ks.string('windows-green-click'),
            alt: (mods & Clutter.ModifierType.MOD1_MASK) !== 0,
            fullscreen: win.is_fullscreen(),
        });
        if (plan === 'zoom')
            this._maximize(win);
        else
            this._fullscreen(win);
    }

    // Toggle full screen. A window that cannot go full screen (fixed size) zooms instead.
    _fullscreen(win) {
        if (win.is_fullscreen()) {
            win.unmake_fullscreen();
            return;
        }
        if (!win.resizeable) {
            this._maximize(win);
            return;
        }
        win.make_fullscreen();
    }

    _openGreenMenu(viaHover) {
        const win = global.display.focus_window;
        if (!win || !this._greenMenu || this._greenMenu.isOpen)
            return;
        const tiling = this._ctx.features.instance('window-tiling');
        const wm = global.workspace_manager;
        this._greenMenu.open({
            tiling: !!tiling,
            canRestore: !!tiling?.canRestore(win),
            fullscreen: win.is_fullscreen(),
            canFullscreen: win.resizeable,
            workspaces: {
                count: wm.get_n_workspaces(),
                current: win.get_workspace()?.index() ?? wm.get_active_workspace_index(),
                dynamic: Meta.prefs_get_dynamic_workspaces(),
            },
            monitors: { count: global.display.get_n_monitors(), current: win.get_monitor() },
        }, { closeOnLeave: viaHover });
    }

    _greenMenuAction(action, arg) {
        const win = global.display.focus_window;
        if (!win)
            return;
        switch (action) {
        case 'fullscreen':
            this._fullscreen(win);
            break;
        case 'zoom':
            this._maximize(win);
            break;
        case 'workspace':
            win.change_workspace_by_index(arg, false);
            break;
        case 'monitor':
            win.move_to_monitor(arg);
            break;
        default:
            // A full-screen window's halves are Split View's (it picks the partner window)
            if (win.is_fullscreen() && (action === 'left' || action === 'right') &&
                this._ctx.features.instance('split-view'))
                this._ctx.events.emit('split-view-requested', { window: win, side: action });
            else
                this._ctx.events.emit('window-tile-requested', { window: win, mode: action });
        }
    }

    // mutter's meta_window_minimize() refuses windows without the capability: every window
    // that is not NORMAL (dialogs, modal dialogs) and skip-taskbar windows, which includes
    // dialogs with a parent. It hides transients whose ancestor is minimized, though, and
    // shows them again with it. So a dialog is minimized together with its parent: an attached
    // dialog cannot live on its own anyway, and restoring the parent brings both back.
    _minimize(win) {
        const chain = [];
        for (let w = win; w && chain.length < 16; w = w.get_transient_for())
            chain.push(w);
        const plan = planMinimize(chain.map(w => ({ canMinimize: w.can_minimize() })));
        if (plan.action === 'lower') {
            // Nothing in the chain can be minimized: send it behind the other windows.
            win.lower();
            global.display.focus_default_window?.(global.get_current_time());
            return;
        }
        const target = chain[plan.index];
        // Stage Manager sends the window to its strip instead
        if (!WindowState.interceptMinimize(target))
            target.minimize();
    }

    // meta_window_maximize() does not check can_maximize(), so a resizable window is maximized
    // even when it does not offer it (dialogs, windows whose minimum size beats the work area).
    // If mutter still did not take it, the frame is resized to the work area and remembered, so
    // the next click restores it. A fixed-size window (min == max) cannot grow: it is centred.
    _maximize(win) {
        const area = win.get_work_area_current_monitor();
        const rect = win.get_frame_rect();
        const saved = this._filled.get(win);
        const filled = !!saved && sameRect(rect, area);
        if (saved && !filled)
            this._filled.delete(win);

        switch (planMaximize({
            fullscreen: win.is_fullscreen(),
            maximized: isMaximized(win),
            filled,
            resizable: win.resizeable,
        })) {
        case 'unfullscreen':
            win.unmake_fullscreen();
            break;
        case 'unmaximize':
            unmaximizeWindow(win);
            break;
        case 'unfill':
            this._filled.delete(win);
            win.move_resize_frame(true, saved.x, saved.y, saved.width, saved.height);
            break;
        case 'maximize':
            maximizeWindow(win);
            if (!isMaximized(win)) {
                this._filled.set(win, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
                win.move_resize_frame(true, area.x, area.y, area.width, area.height);
            }
            break;
        case 'center': {
            const c = centerIn(area, rect.width, rect.height);
            win.move_frame(true, c.x, c.y);
            break;
        }
        }
    }
}
