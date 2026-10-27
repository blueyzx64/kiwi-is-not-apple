// SPDX-License-Identifier: GPL-3.0-or-later
// The macOS menu bar on GNOME's top bar (plan §5.1, matrix §1):
//
//   [logo] [traffic lights] [App name] [File] [Edit] … [Help]   (notch)   … [privacy dots]
//   [Control Center] [clock]
//
// Parts, each with its own CleanupRegistry so its setting turns it on and off live:
//   logo         logoMenu.js         menubar-logo ('fedora' | 'kiwi' | 'none')
//   app menus    appMenuBar.js       menubar-app-menu; menus from core/appMenus (ctx.appMenus);
//                                    menubar-native-menus (GTK menu bars, DBusMenu),
//                                    menubar-atspi-menus / -popovers (experimental)
//   look         adaptiveBar.js      menubar-transparent (transparent bar, adaptive text)
//   full screen  fullscreenReveal.js menubar-fullscreen-visible
//   privacy      privacyDots.js      menubar-privacy-dots
//   clock        here                emits 'notification-center-requested'; Alt-click toggles
//                                    Do Not Disturb (menubar-clock-option-dnd)
//   dialogs      aboutDialog.js, forceQuit.js (menubar-force-quit-shortcut)
//   keyboard     menubar-focus-shortcut opens the app menu (F10)
//   menubar-show-activities          GNOME's Activities button (off: macOS has none)
//
// Places: PanelLayout claims 'kiwi-menubar-logo' (left, first) and 'kiwi-menubar-apps'
// (left, after the window controls, which claim the slot before the apps). The privacy dots
// sit before the Control Center; the clock stays where the calendar feature put it.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';

import { PanelLayout } from '../../core/panelLayout.js';
import { NotificationRouter } from '../../core/notificationRouter.js';
import { CleanupRegistry } from '../../lib/disposables.js';
import { Keybindings, MODAL_MODES } from '../../lib/keybindings.js';
import { KiwiSettings } from '../../lib/settings.js';
import { AboutThisPc } from './aboutDialog.js';
import { AdaptiveBar } from './adaptiveBar.js';
import { AppMenuBar } from './appMenuBar.js';
import { ForceQuit } from './forceQuit.js';
import { FullscreenReveal } from './fullscreenReveal.js';
import { LogoMenu } from './logoMenu.js';
import { MenuGlass } from './menuGlass.js';
import { PrivacyDots } from './privacyDots.js';

export const LOGO_ROLE = 'kiwi-menubar-logo';
const BAR_CLASS = 'kiwi-menubar';
const SWAP_OPTION = 'ctrl:swap_lwin_lctl';

export class MenuBar {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._parts = new Map(); // name -> {registry, instance}
        this._activities = null;
    }

    /** A running part: 'logo' | 'apps' | 'look' | 'fullscreen' | 'privacy' (tests, harness). */
    part(name) {
        return this._parts.get(name)?.instance ?? null;
    }

    get about() {
        return this._about;
    }

    get forceQuit() {
        return this._forceQuit;
    }

    enable() {
        const cleanup = this._cleanup;
        const ks = new KiwiSettings(this._ctx.settings);
        ks.attach(cleanup);
        const _ = this._ctx.gettext;

        Main.panel.add_style_class_name(BAR_CLASS);
        cleanup.add(() => Main.panel.remove_style_class_name(BAR_CLASS));
        cleanup.add(() => {
            for (const name of [...this._parts.keys()])
                this._stopPart(name);
        });

        const inputSources = new Gio.Settings({ schema_id: 'org.gnome.desktop.input-sources' });
        const keys = () => ({
            glyphs: ks.bool('menubar-command-glyphs'),
            ctrlIsCommand: inputSources.get_strv('xkb-options').includes(SWAP_OPTION),
        });

        this._about = new AboutThisPc(cleanup, _);
        this._forceQuit = new ForceQuit(cleanup, {
            _, keys, shortcut: () => ks.strv('menubar-force-quit-shortcut')[0] ?? null,
        });
        Keybindings.add(cleanup, 'menubar-force-quit-shortcut', this._ctx.settings,
            () => this._forceQuit.toggle(), { modes: MODAL_MODES });
        Keybindings.add(cleanup, 'menubar-focus-shortcut', this._ctx.settings,
            () => this.focus(), { modes: Shell.ActionMode.NORMAL | Shell.ActionMode.POPUP });

        // GNOME's Activities button: hidden unless asked for
        cleanup.add(() => this._showActivities());
        ks.watch('menubar-show-activities', () => this._syncActivities(ks));
        this._syncActivities(ks);

        // The parts, left to right
        const part = (name, wanted, make, keysToWatch) => {
            const sync = () => {
                this._stopPart(name);
                if (wanted())
                    this._startPart(name, make);
            };
            ks.watch(keysToWatch, sync);
            sync();
        };
        part('logo', () => ks.string('menubar-logo') !== 'none', reg => {
            const logo = new LogoMenu({
                ctx: this._ctx, cleanup: reg, keys,
                actions: { about: () => this._about.open(), forceQuit: () => this._forceQuit.open() },
                forceQuitAccel: () => ks.strv('menubar-force-quit-shortcut')[0] ?? null,
            });
            reg.add(() => logo.destroy());
            new MenuGlass(reg).add(logo.menu);
            logo.setLogo(ks.string('menubar-logo'));
            Main.panel.addToStatusArea(LOGO_ROLE, logo, 0, 'left');
            PanelLayout.claim(reg, { id: LOGO_ROLE, actor: logo.container, box: 'left', anchor: { first: true } });
            return logo;
        }, ['menubar-logo', 'menubar-command-glyphs', 'menubar-force-quit-shortcut']);
        part('apps', () => ks.bool('menubar-app-menu'), reg => {
            const apps = new AppMenuBar(this._ctx, reg, {
                keys,
                providers: {
                    native: ks.bool('menubar-native-menus'),
                    atspi: ks.bool('menubar-atspi-menus'),
                    popovers: ks.bool('menubar-atspi-popovers'),
                },
            });
            apps.start();
            return apps;
        }, ['menubar-app-menu', 'menubar-native-menus', 'menubar-atspi-menus', 'menubar-atspi-popovers']);
        part('look', () => ks.bool('menubar-transparent'), reg => {
            const look = new AdaptiveBar(this._ctx, reg);
            look.start();
            return look;
        }, ['menubar-transparent']);
        part('fullscreen', () => true, reg => {
            const fs = new FullscreenReveal(this._ctx, reg, { always: ks.bool('menubar-fullscreen-visible') });
            fs.start();
            return fs;
        }, ['menubar-fullscreen-visible']);
        part('privacy', () => ks.bool('menubar-privacy-dots'), reg => {
            const dots = new PrivacyDots(this._ctx, reg);
            dots.start();
            return dots;
        }, ['menubar-privacy-dots']);

        this._hookClock(ks);
    }

    disable() {
        // The cleanup registry, disposed right after this, stops every part
    }

    /** Keyboard access (F10): the app menu, or the logo menu when app menus are off. */
    focus() {
        if (this.part('apps')?.focus())
            return;
        const logo = this.part('logo');
        if (!logo)
            return;
        if (logo.menu.isOpen) {
            logo.menu.close(BoxPointer.PopupAnimation.FULL);
            return;
        }
        logo.menu.open(BoxPointer.PopupAnimation.FULL);
        logo.menu.actor.navigate_focus(null, St.DirectionType.TAB_FORWARD, false);
    }

    _startPart(name, make) {
        const registry = new CleanupRegistry();
        try {
            this._parts.set(name, { registry, instance: make(registry) });
        } catch (e) {
            console.error(`[Kiwi] menu bar: ${name} failed to start:`, e);
            registry.dispose();
        }
    }

    _stopPart(name) {
        const part = this._parts.get(name);
        if (!part)
            return;
        this._parts.delete(name);
        part.registry.dispose();
    }

    _syncActivities(ks) {
        if (ks.bool('menubar-show-activities')) {
            this._showActivities();
        } else if (!this._activities) {
            this._activities = new CleanupRegistry();
            PanelLayout.hide(this._activities, 'activities');
        }
    }

    _showActivities() {
        this._activities?.dispose();
        this._activities = null;
    }

    // The clock opens the Notification Center (P5 listens to the event; until then the
    // calendar card opens as before). Alt-click turns Do Not Disturb on or off instead.
    _hookClock(ks) {
        const dateMenu = Main.panel.statusArea.dateMenu;
        if (!dateMenu?.menu)
            return;
        this._cleanup.connect(dateMenu.menu, 'open-state-changed', (menu, open) => {
            if (!open)
                return;
            const [, , mods] = global.get_pointer();
            if (ks.bool('menubar-clock-option-dnd') && (mods & Clutter.ModifierType.MOD1_MASK)) {
                menu.close(BoxPointer.PopupAnimation.NONE);
                NotificationRouter.setDnd(!NotificationRouter.state().dnd);
                return;
            }
            this._ctx.events.emit('notification-center-requested', { source: 'clock' });
        });
    }
}
