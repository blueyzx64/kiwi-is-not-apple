// SPDX-License-Identifier: GPL-3.0-or-later
// Keyboard accessibility, macOS style (System Settings > Accessibility > Keyboard):
//
//   Sticky Keys HUD   "Display pressed keys on screen": while GNOME's Sticky Keys is on, the
//                     latched (outlined) and locked (filled) modifiers show as ⌃ ⌥ ⇧ ⌘ in a
//                     corner. The modifier beep is GNOME's own stickykeys-modifier-beep
//                     (Mutter rings the bell); the prefs only mirror it.
//   Slow Keys         an optional "Slow Keys" chip in the same HUD while Slow Keys is on. Mutter
//                     gives no signal when a key is accepted or rejected (only its bell, through
//                     slowkeys-beep-*), so Kiwi cannot show the acceptance progress.
//   Shortcuts panel   macOS Option-Command-F5 (Kiwi: Super+Alt+F5): a glass panel of
//                     accessibility switches (lib/a11ySettingsModel.js), each one a GNOME key
//                     the user flips.
//   Zoom follows      macOS "Follow keyboard focus" (always / only when typing / never) on the
//                     magnifier's focus-tracking and caret-tracking, owned through
//                     core/originals while not 'system'.
//   Keyboard Viewer   viewer.js; opened from the input-source menu, a shortcut or toggleViewer().
//
// Shell API (checked on 50): Clutter.Seat ::kbd-a11y-mods-state-changed (latched, locked XKB
// masks; Mutter emits it only while Sticky Keys is on), Main.panel.statusArea.keyboard (GNOME's
// input-source menu).

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import * as A11y from '../../lib/a11y.js';
import { a11ySwitches, isOn, valueFor } from '../../lib/a11ySettingsModel.js';
import { RADIUS } from '../../lib/designTokens.js';
import { CleanupRegistry } from '../../lib/disposables.js';
import { Glass } from '../../lib/glass.js';
import { Keybindings, MODAL_MODES } from '../../lib/keybindings.js';
import { ModalSurface } from '../../lib/modalSurface.js';
import { KiwiSettings } from '../../lib/settings.js';
import { SettingOwner } from '../../core/originals.js';
import { PANEL_SWITCHES, hudContent, hudPosition, readConfig, zoomTracking } from './model.js';
import { KeyboardViewer } from './viewer.js';

const KEYS = ['kbd-a11y-sticky-display', 'kbd-a11y-sticky-corner', 'kbd-a11y-slowkeys-indicator', 'kbd-a11y-zoom-follow'];
const PANEL_WIDTH = 340;
const ROW_HEIGHT = 40;

export class KeyboardAccess {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._hud = null;
        this._mods = { latched: 0, locked: 0 };
        this._shown = null;     // hudContent() on screen
    }

    enable() {
        const cleanup = this._cleanup;
        const ks = new KiwiSettings(this._ctx.settings);
        ks.attach(cleanup);
        this._ks = ks;
        this._config = readConfig(ks);
        this._a11yKeyboard = new Gio.Settings({ schema_id: 'org.gnome.desktop.a11y.keyboard' });

        this._enableHud();
        this._enableZoomFollow();
        this._enablePanel();
        this._viewer = new KeyboardViewer(this._ctx, cleanup);
        Keybindings.add(cleanup, 'kbd-a11y-viewer-shortcut', this._ctx.settings, () => this.toggleViewer());
        this._addInputMenuItem();

        ks.watch(KEYS, () => {
            this._config = readConfig(ks);
            this._syncZoom();
            this._syncHud();
        });
    }

    disable() {
        // Everything is in the cleanup registry
        this._hud = null;
        this._shown = null;
    }

    /** For the harness. */
    get state() {
        return {
            hud: this._shown && this._hud?.visible ? { ...this._shown } : null,
            mods: { ...this._mods },
            panel: this._panel?.isOpen ?? false,
            viewer: this._viewer?.state ?? null,
            zoomOwned: !!this._zoomOwners?.[0].owning,
        };
    }

    toggleViewer() {
        this._viewer.toggle();
    }

    toggleShortcutsPanel() {
        this._panel.toggle();
    }

    // ---- Sticky Keys HUD -------------------------------------------------------------------

    _enableHud() {
        const c = this._cleanup;
        const seat = (global.stage.context?.get_backend?.() ?? Clutter.get_default_backend()).get_default_seat();
        c.connect(seat, 'kbd-a11y-mods-state-changed', (_s, latched, locked) => {
            this._mods = { latched, locked };
            this._syncHud();
        });
        c.connect(this._a11yKeyboard, 'changed', (_s, key) => {
            if (key === 'stickykeys-enable' && !this._a11yKeyboard.get_boolean(key))
                this._mods = { latched: 0, locked: 0 };
            if (key === 'stickykeys-enable' || key === 'slowkeys-enable')
                this._syncHud();
        });
        c.connect(Main.layoutManager, 'monitors-changed', () => this._placeHud());
        this._syncHud();
    }

    _syncHud() {
        const content = hudContent({
            stickyKeys: this._a11yKeyboard.get_boolean('stickykeys-enable'),
            slowKeys: this._a11yKeyboard.get_boolean('slowkeys-enable'),
            ...this._mods,
        }, this._config);
        if (!content) {
            this._hideHud();
            return;
        }
        const hud = this._ensureHud();
        hud.destroy_all_children();
        for (const g of content.glyphs) {
            hud.add_child(new St.Label({
                text: g.glyph, style_class: `kiwi-sticky-glyph kiwi-sticky-${g.state}`,
                y_align: Clutter.ActorAlign.CENTER,
            }));
        }
        if (content.slowKeys) {
            hud.add_child(new St.Label({
                text: this._ctx.gettext('Slow Keys'), style_class: 'kiwi-sticky-chip', y_align: Clutter.ActorAlign.CENTER,
            }));
        }
        const _ = this._ctx.gettext;
        const names = content.glyphs.map(g => `${g.glyph} ${g.state === 'locked' ? _('locked') : _('latched')}`);
        if (content.slowKeys)
            names.push(_('Slow Keys'));
        A11y.name(hud, names.join(', '), A11y.Role.STATUSBAR);
        this._shown = content;
        this._placeHud();
        if (!hud.visible) {
            hud.opacity = 0;
            hud.visible = true;
        }
        hud.get_parent()?.set_child_above_sibling(hud, null);
        this._ctx.motion.ease(hud, { opacity: 255 }, { duration: 'micro', curve: 'standard' }, this._cleanup);
    }

    _ensureHud() {
        if (this._hud)
            return this._hud;
        const hud = this._cleanup.actor(new St.BoxLayout({
            style_class: 'kiwi-sticky-hud', visible: false, opacity: 0, reactive: false,
        }));
        Main.layoutManager.uiGroup.add_child(hud);
        const glass = Glass.attach(hud, {
            surface: 'overlays', role: 'overlay', radius: RADIUS.menu,
            isDark: () => St.Settings.get().color_scheme !== St.SystemColorScheme.PREFER_LIGHT,
        });
        this._cleanup.add(() => glass.destroy());
        this._hud = hud;
        return hud;
    }

    _placeHud() {
        const hud = this._hud;
        if (!hud || !this._shown)
            return;
        const area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        const [, w] = hud.get_preferred_width(-1);
        const [, h] = hud.get_preferred_height(w);
        const { x, y } = hudPosition({
            corner: this._config.corner, size: { width: w, height: h },
            area: { x: area.x, y: area.y, width: area.width, height: area.height },
        });
        hud.set_position(x, y);
    }

    _hideHud() {
        const hud = this._hud;
        this._shown = null;
        if (!hud?.visible)
            return;
        this._ctx.motion.ease(hud, { opacity: 0 }, {
            duration: 'short', curve: 'exit',
            onDone: finished => {
                if (finished && !this._shown)
                    hud.visible = false;
            },
        }, this._cleanup);
    }

    // ---- Zoom follows keyboard focus -------------------------------------------------------

    _enableZoomFollow() {
        const mag = new Gio.Settings({ schema_id: 'org.gnome.desktop.a11y.magnifier' });
        const owner = key => new SettingOwner(this._ctx.originals, mag, key, {
            type: 's',
            transform: original => {
                const t = zoomTracking(this._config.zoomFollow);
                return t ? (key === 'focus-tracking' ? t.focus : t.caret) : original;
            },
        });
        this._zoomOwners = [owner('focus-tracking'), owner('caret-tracking')];
        this._cleanup.add(() => this._zoomOwners.forEach(o => o.release()));
        this._syncZoom();
    }

    _syncZoom() {
        const want = !!zoomTracking(this._config.zoomFollow);
        for (const o of this._zoomOwners) {
            if (want && o.owning)
                o.reapply();
            else
                o.sync(want);
        }
    }

    // ---- Accessibility Shortcuts panel -----------------------------------------------------

    _enablePanel() {
        const _ = this._ctx.gettext;
        const switches = a11ySwitches(PANEL_SWITCHES).filter(s => this._schemaHas(s.binding));
        this._panelSwitches = switches;
        let openReg = null;
        this._panel = new ModalSurface(this._cleanup, {
            id: 'a11y-shortcuts',
            accessibleName: _('Accessibility Shortcuts'),
            width: PANEL_WIDTH,
            height: 64 + switches.length * ROW_HEIGHT,
            position: 'center',
            radius: RADIUS.panel,
            styleClass: 'kiwi-a11y-panel',
            build: frame => {
                openReg = new CleanupRegistry();
                return this._buildPanel(frame, openReg);
            },
            onClosed: () => {
                openReg?.dispose();
                openReg = null;
            },
        });
        this._cleanup.add(() => openReg?.dispose());
        Keybindings.add(this._cleanup, 'kbd-a11y-panel-shortcut', this._ctx.settings,
            () => this.toggleShortcutsPanel(), { modes: MODAL_MODES });
    }

    _schemaHas({ schema, key }) {
        const s = Gio.SettingsSchemaSource.get_default()?.lookup(schema, true);
        return !!s?.has_key(key);
    }

    _buildPanel(frame, reg) {
        const _ = this._ctx.gettext;
        frame.orientation = Clutter.Orientation.VERTICAL;
        frame.add_child(new St.Label({ text: _('Accessibility Shortcuts'), style_class: 'kiwi-a11y-panel-title kiwi-text-title' }));
        const list = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, style_class: 'kiwi-a11y-panel-list' });
        frame.add_child(list);
        const settings = new Map();
        let first = null;
        for (const sw of this._panelSwitches) {
            const { schema, key, type } = sw.binding;
            if (!settings.has(schema))
                settings.set(schema, new Gio.Settings({ schema_id: schema }));
            const gs = settings.get(schema);
            const read = () => (type === 'd' ? gs.get_double(key) : gs.get_boolean(key));
            const check = new St.Icon({ icon_name: 'object-select-symbolic', icon_size: 16, style_class: 'kiwi-a11y-panel-check' });
            const row = new St.BoxLayout({ style_class: 'kiwi-a11y-panel-row-box', x_expand: true });
            row.add_child(new St.Icon({ icon_name: sw.icon, icon_size: 16, style_class: 'kiwi-a11y-panel-icon' }));
            row.add_child(new St.Label({ text: _(sw.title), x_expand: true, y_align: Clutter.ActorAlign.CENTER }));
            row.add_child(check);
            const button = new St.Button({
                style_class: 'kiwi-a11y-panel-row kiwi-row', child: row, x_expand: true, accessible_name: _(sw.title),
            });
            A11y.toggle(button, _(sw.title));
            const sync = () => {
                const on = isOn(sw.binding, read());
                button.checked = on;
                check.opacity = on ? 255 : 0;
            };
            sync();
            reg.connect(gs, `changed::${key}`, sync);
            button.connect('clicked', () => {
                const on = !isOn(sw.binding, read());
                if (type === 'd')
                    gs.set_double(key, valueFor(sw.binding, on));
                else
                    gs.set_boolean(key, valueFor(sw.binding, on));
            });
            button._kiwiSwitch = sw.id;
            list.add_child(button);
            first ??= button;
        }
        A11y.keyNavGroup(reg, list);
        this._panelList = list;
        reg.add(() => (this._panelList = null));
        return first;
    }

    /** For the harness: flip a panel switch by id as a click would. */
    clickPanelSwitch(id) {
        const button = this._panelList?.get_children().find(b => b._kiwiSwitch === id);
        button?.emit('clicked', 0);
        return !!button;
    }

    // ---- input-source menu -----------------------------------------------------------------

    _addInputMenuItem() {
        const menu = Main.panel.statusArea.keyboard?.menu;
        if (!menu?.addAction)
            return;
        const item = menu.addAction(this._ctx.gettext('Show Keyboard Viewer'), () => this.toggleViewer());
        this._cleanup.add(() => item.destroy());
    }
}
