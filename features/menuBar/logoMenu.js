// SPDX-License-Identifier: GPL-3.0-or-later
// The logo menu, macOS's Apple menu (research UI "Menu bar"): About This PC, System
// Settings…, Kiwi Settings…, App Store…, Recent Items, Force Quit…, Sleep, Restart…,
// Shut Down…, Lock Screen, Log Out. Holding Option (Alt) turns About This PC into System
// Information… (lib/optionKey.js, menubar-option-alternates).
//
// The power and session items call the Shell's own SystemActions, so they follow logind and
// the lockdown settings exactly like the system menu (and appear only when allowed). Recent
// Items is filled when its submenu opens: the most used apps (Shell.AppUsage) and the newest
// documents of recently-used.xbel, read asynchronously.
//
// Shell API: misc/systemActions.js, Shell.AppSystem, Shell.AppUsage, PanelMenu.Button.

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

import { CleanupRegistry } from '../../lib/disposables.js';
import { OptionAlternates } from '../../lib/optionKey.js';
import { fillPlaceholders, parseOsRelease, parseRecentXbel, systemLogoNames } from './model.js';
import { menuHeading, menuItem } from './menuItems.js';
import { tintWithText } from './logoTint.js';
import { readText } from './systemInfo.js';

const KIWI_LOGO = 'icons/kiwi-logo-symbolic.svg';
const DEFAULT_SYSTEM_LOGO = 'fedora-logo-icon';
const RECENT_APPS = 5;
const RECENT_DOCS = 8;
const SETTINGS_APP = 'org.gnome.Settings.desktop';
const SOFTWARE_APP = 'org.gnome.Software.desktop';
// macOS's System Information: GNOME Settings, System > About (its detailed system details)
const SYSTEM_INFO_ARGV = ['gnome-control-center', 'system', 'about'];

function spawnSystemInfo() {
    try {
        Util.spawn(SYSTEM_INFO_ARGV);
    } catch (e) {
        console.error('[Kiwi] System Information failed:', e);
    }
}

export const LogoMenu = GObject.registerClass(
class KiwiLogoMenu extends PanelMenu.Button {
    /**
     * @param {object} p
     * @param {object} p.ctx the feature ctx (extension, gettext)
     * @param {CleanupRegistry} p.cleanup lives as long as the button
     * @param {{about: Function, forceQuit: Function}} p.actions
     * @param {() => object} p.keys shortcut label options
     * @param {() => ?string} p.forceQuitAccel
     * @param {() => boolean} [p.optionAlternates] whether Alt shows the alternates
     */
    _init({ ctx, cleanup, actions, keys, forceQuitAccel, optionAlternates = () => true }) {
        const _ = ctx.gettext;
        super._init(0.0, _('Logo Menu'), false);
        this.add_style_class_name('kiwi-menubar-logo');
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._icon = new St.Icon({ style_class: 'kiwi-menubar-logo-icon' });
        this.add_child(this._icon);
        this._cancellable = new Gio.Cancellable();
        cleanup.add(() => this._cancellable.cancel());
        this._tint = null;
        cleanup.add(() => this._untint());

        const sys = SystemActions.getDefault();
        const appSystem = Shell.AppSystem.get_default();
        const media = new Gio.Settings({ schema_id: 'org.gnome.settings-daemon.plugins.media-keys' });
        const accel = key => media.get_strv(key)[0] ?? null;
        const add = (label, onActivate, opts = {}) => {
            const item = menuItem(label, { keys: keys(), onActivate: () => onActivate(), ...opts });
            this.menu.addMenuItem(item);
            return item;
        };
        const sep = () => this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const launch = id => appSystem.lookup_app(id)?.activate();

        // Option: About This PC becomes System Information… (GNOME Settings' About page)
        this._aboutItem = add(_('About This PC'), actions.about, {
            alternate: { label: _('System Information…'), onActivate: () => spawnSystemInfo() },
        });
        OptionAlternates.attach(this.menu, cleanup, { enabled: optionAlternates });
        sep();
        add(_('System Settings…'), () => launch(SETTINGS_APP));
        add(_('Kiwi Settings…'), () => ctx.extension.openPreferences());
        const store = add(_('App Store…'), () => launch(SOFTWARE_APP));
        const syncStore = () => (store.visible = !!appSystem.lookup_app(SOFTWARE_APP));
        cleanup.connect(appSystem, 'installed-changed', syncStore);
        syncStore();
        sep();
        this._recent = new PopupMenu.PopupSubMenuMenuItem(_('Recent Items'));
        this._recent.add_style_class_name('kiwi-menubar-menu-item');
        this.menu.addMenuItem(this._recent);
        // Filled as the logo menu opens: a submenu with no items cannot open
        cleanup.connect(this.menu, 'open-state-changed', (_m, open) => {
            if (open)
                this._fillRecent();
        });
        sep();
        this._forceQuitItem = add(_('Force Quit…'), actions.forceQuit, { accel: forceQuitAccel() });
        sep();
        const power = [
            [add(_('Sleep'), () => sys.activateSuspend()), 'can-suspend'],
            [add(_('Restart…'), () => sys.activateRestart()), 'can-restart'],
            [add(_('Shut Down…'), () => sys.activatePowerOff()), 'can-power-off'],
        ];
        sep();
        const userName = GLib.get_real_name() || GLib.get_user_name();
        const session = [
            [add(_('Lock Screen'), () => sys.activateLockScreen(), { accel: accel('screensaver') }), 'can-lock-screen'],
            [add(fillPlaceholders(_('Log Out %s…'), userName), () => sys.activateLogout(), { accel: accel('logout') }), 'can-logout'],
        ];
        for (const [item, prop] of [...power, ...session]) {
            const sync = () => (item.visible = !!sys[prop.replace(/-(.)/g, (_m, c) => c.toUpperCase())]);
            cleanup.connect(sys, `notify::${prop}`, sync);
            sync();
        }
    }

    /** The About This PC item (Option shows System Information…; tests, the harness). */
    get aboutItem() {
        return this._aboutItem;
    }

    /** @param {string} logo 'fedora' | 'kiwi' */
    setLogo(logo) {
        if (logo === 'kiwi') {
            this._setKiwiLogo();
            return;
        }
        // The system's own logo (os-release LOGO), the Kiwi mark when the theme has none
        this._setSystemLogo(DEFAULT_SYSTEM_LOGO);
        readText('/etc/os-release', this._cancellable).then(text => {
            const named = parseOsRelease(text ?? '').LOGO;
            if (named && named !== DEFAULT_SYSTEM_LOGO && !this._cancellable.is_cancelled() && this._icon)
                this._setSystemLogo(named);
        });
    }

    _setKiwiLogo() {
        this._untint();
        this._icon.icon_name = null;
        this._icon.gicon = Gio.FileIcon.new(this._ctx.extension.dir.resolve_relative_path(KIWI_LOGO));
    }

    _untint() {
        this._tint?.dispose();
        this._tint = null;
    }

    _setSystemLogo(logo) {
        this._untint();
        const theme = new St.IconTheme();
        const name = systemLogoNames(logo).find(n => theme.has_icon(n));
        if (!name) {
            this._setKiwiLogo();
            return;
        }
        this._icon.gicon = null;
        this._icon.icon_name = name;
        if (!name.endsWith('-symbolic')) {
            this._tint = new CleanupRegistry();
            tintWithText(this._icon, this._tint);
        }
    }

    _fillRecent() {
        const _ = this._ctx.gettext;
        const sub = this._recent.menu;
        sub.removeAll();
        const apps = Shell.AppUsage.get_default().get_most_used().slice(0, RECENT_APPS);
        if (apps.length) {
            sub.addMenuItem(menuHeading(_('Applications')));
            for (const app of apps)
                sub.addMenuItem(menuItem(app.get_name(), { onActivate: () => app.activate() }));
        }
        const docsAt = sub.numMenuItems;
        const path = GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']);
        readText(path, this._cancellable).then(text => {
            if (this._cancellable.is_cancelled() || !this.menu.isOpen)
                return;
            const docs = parseRecentXbel(text ?? '', RECENT_DOCS);
            if (!docs.length && !apps.length) {
                sub.addMenuItem(menuItem(_('No Recent Items'), { enabled: false }));
                return;
            }
            if (!docs.length)
                return;
            if (apps.length)
                sub.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), docsAt);
            sub.addMenuItem(menuHeading(_('Documents')));
            for (const doc of docs) {
                sub.addMenuItem(menuItem(doc.name, {
                    onActivate: () => Gio.AppInfo.launch_default_for_uri_async(doc.uri,
                        global.create_app_launch_context(0, -1), null, (_o, res) => {
                            try {
                                Gio.AppInfo.launch_default_for_uri_finish(res);
                            } catch (e) {
                                Main.notifyError(fillPlaceholders(_('Could not open %s'), doc.name), e.message);
                            }
                        }),
                }));
            }
        });
    }
});
