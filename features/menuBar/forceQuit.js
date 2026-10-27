// SPDX-License-Identifier: GPL-3.0-or-later
// Force Quit Applications (logo menu, Super+Alt+Esc): the running apps with windows, the ones
// that stopped answering flagged "not responding", and Force Quit / Relaunch buttons
// (research UI "Activity Monitor").
//
// Responsiveness is Mutter's own: opening the dialog pings every window (Meta.Window
// check_alive), and the rows follow each window's is-alive property while it is open.
// Force Quit asks first, like macOS, then kills the app's windows' clients
// (Meta.Window.kill(), SIGKILL); Relaunch does the same and starts the app again once the
// Shell sees it stopped.
//
// Shell API: Shell.AppSystem (get_running, app-state-changed), Shell.App, Meta.Window
// (check_alive, is-alive, kill).

import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';

import { CleanupRegistry } from '../../lib/disposables.js';
import { formatAccel } from '../../core/appMenus/model.js';
import { ModalSurface } from '../../lib/modalSurface.js';
import { forceQuitRows } from './model.js';

export class ForceQuit {
    /**
     * @param {CleanupRegistry} cleanup
     * @param {object} opts
     * @param {Function} opts._ gettext
     * @param {() => ?string} opts.shortcut the dialog's shortcut (shown in its footer)
     * @param {() => object} opts.keys {glyphs, ctrlIsCommand} for formatAccel
     */
    constructor(cleanup, { _, shortcut, keys }) {
        this._ = _;
        this._shortcut = shortcut;
        this._keys = keys;
        this._cleanup = cleanup;
        this._open = null;       // CleanupRegistry of the open dialog
        this._relaunch = new Map(); // Shell.App -> signal token, waiting for it to stop
        cleanup.add(() => this._relaunch.clear());
        this._modal = new ModalSurface(cleanup, {
            id: 'force-quit', width: 420, height: 460, position: 'center', radius: 22,
            styleClass: 'kiwi-force-quit',
            build: frame => this._build(frame),
            onClosed: () => {
                this._open?.dispose();
                this._open = null;
                this._list = null;
                this._rows = [];
            },
            onKeyPress: (event) => {
                const sym = event.get_key_symbol();
                if (sym === Clutter.KEY_Return || sym === Clutter.KEY_KP_Enter) {
                    this._forceQuit(false);
                    return Clutter.EVENT_STOP;
                }
                if (sym === Clutter.KEY_Up || sym === Clutter.KEY_Down) {
                    this._move(sym === Clutter.KEY_Up ? -1 : 1);
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            },
        });
    }

    get isOpen() {
        return this._modal.isOpen;
    }

    /** Rows shown now: [{id, name, notResponding, selected}] (tests, the harness). */
    get rows() {
        return (this._rows ?? []).map(r => ({ ...r.info, selected: r.id === this._selected }));
    }

    open() {
        this._modal.open();
    }

    toggle() {
        this._modal.toggle();
    }

    close() {
        this._modal.close();
    }

    /** Select an app by id (tests, keyboard). */
    select(id) {
        this._selected = id;
        this._paint();
    }

    _build(frame) {
        const _ = this._;
        this._open = new CleanupRegistry();
        this._watched = new Set();
        this._selected = null;
        this._confirming = false;

        frame.add_child(new St.Label({ text: _('Force Quit Applications'), style_class: 'kiwi-force-quit-title' }));
        frame.add_child(this._wrap(new St.Label({
            text: _('If an app doesn’t respond for a while, select its name and click Force Quit.'),
            style_class: 'kiwi-force-quit-hint',
        })));

        this._list = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, style_class: 'kiwi-force-quit-list' });
        const scroll = new St.ScrollView({
            style_class: 'kiwi-force-quit-scroll', x_expand: true, y_expand: true,
            hscrollbar_policy: St.PolicyType.NEVER, vscrollbar_policy: St.PolicyType.AUTOMATIC,
            child: this._list,
        });
        frame.add_child(scroll);

        const accel = this._shortcut();
        const text = accel ? formatAccel(accel, this._keys()) : '';
        if (text) {
            frame.add_child(new St.Label({
                text: _('You can open this window by pressing %s.').replace('%s', text),
                style_class: 'kiwi-force-quit-footer',
            }));
        }

        this._question = this._wrap(new St.Label({ text: '', style_class: 'kiwi-force-quit-question', visible: false }));
        frame.add_child(this._question);

        const buttons = new St.BoxLayout({ style_class: 'kiwi-force-quit-buttons', x_align: Clutter.ActorAlign.END });
        this._cancelButton = this._button(_('Cancel'), () => this._setConfirm(false));
        this._relaunchButton = this._button(_('Relaunch'), () => this._forceQuit(true));
        this._quitButton = this._button(_('Force Quit'), () => this._forceQuit(false), true);
        for (const b of [this._cancelButton, this._relaunchButton, this._quitButton])
            buttons.add_child(b);
        frame.add_child(buttons);

        const appSystem = Shell.AppSystem.get_default();
        this._open.connect(appSystem, 'app-state-changed', () => this._refill());
        this._refill(true);
        return this._list;
    }

    _wrap(label) {
        label.clutter_text.line_wrap = true;
        return label;
    }

    _button(label, onClick, isDefault = false) {
        const b = new St.Button({
            label, can_focus: true,
            style_class: `button kiwi-force-quit-button${isDefault ? ' default' : ''}`,
        });
        b.connect('clicked', onClick);
        return b;
    }

    // Rebuild the rows from the running apps; ping their windows the first time
    _refill(ping = false) {
        if (!this._list)
            return;
        const apps = Shell.AppSystem.get_default().get_running();
        const byId = new Map(apps.map(a => [a.get_id(), a]));
        // Mutter refuses a ping without a real timestamp (CurrentTime)
        const now = global.display.get_current_time_roundtrip();
        const described = apps.map(app => ({
            id: app.get_id(),
            name: app.get_name(),
            windows: app.get_windows().map(w => {
                if (!this._watched.has(w)) {
                    this._watched.add(w);
                    this._open.connect(w, 'notify::is-alive', () => this._refill());
                    if (ping)
                        w.check_alive(now);
                }
                return { alive: w.is_alive !== false };
            }),
        }));
        const rows = forceQuitRows(described);
        this._list.destroy_all_children();
        this._rows = rows.map(info => {
            const app = byId.get(info.id);
            const box = new St.BoxLayout({ style_class: 'kiwi-force-quit-row-box', x_expand: true, x_align: Clutter.ActorAlign.START });
            box.add_child(app.create_icon_texture(24));
            box.add_child(new St.Label({ text: info.name, y_align: Clutter.ActorAlign.CENTER, style_class: 'kiwi-force-quit-name' }));
            if (info.notResponding) {
                box.add_child(new St.Label({
                    text: this._('(not responding)'), y_align: Clutter.ActorAlign.CENTER,
                    style_class: 'kiwi-force-quit-hung',
                }));
            }
            const button = new St.Button({
                child: box, can_focus: true, x_expand: true, x_align: Clutter.ActorAlign.FILL,
                style_class: 'kiwi-force-quit-row', accessible_name: info.name,
            });
            button.connect('clicked', () => this.select(info.id));
            button.connect('key-focus-in', () => this.select(info.id));
            this._list.add_child(button);
            return { id: info.id, info, button, app };
        });
        if (!this._rows.some(r => r.id === this._selected))
            this._selected = this._rows.find(r => r.info.notResponding)?.id ?? this._rows[0]?.id ?? null;
        this._setConfirm(false);
    }

    _paint() {
        for (const r of this._rows ?? []) {
            if (r.id === this._selected)
                r.button.add_style_pseudo_class('checked');
            else
                r.button.remove_style_pseudo_class('checked');
        }
        const any = !!this._selected;
        this._quitButton.reactive = this._relaunchButton.reactive = any;
    }

    _move(step) {
        const rows = this._rows ?? [];
        if (!rows.length)
            return;
        const i = rows.findIndex(r => r.id === this._selected);
        const next = rows[Math.max(0, Math.min(rows.length - 1, i + step))];
        this.select(next.id);
        next.button.grab_key_focus();
    }

    // The macOS confirmation: "Do you want to force “X” to quit?"
    _setConfirm(on, relaunch = false) {
        this._confirming = on;
        this._relaunchAfter = relaunch;
        const row = this._rows?.find(r => r.id === this._selected);
        this._question.visible = on && !!row;
        if (on && row) {
            this._question.text = this._('Do you want to force “%s” to quit? You will lose any unsaved changes.')
                .replace('%s', row.info.name);
        }
        this._cancelButton.visible = on;
        this._relaunchButton.visible = !on;
        this._quitButton.label = on ? (relaunch ? this._('Relaunch') : this._('Force Quit')) : this._('Force Quit');
        this._paint();
    }

    _forceQuit(relaunch) {
        if (!this._confirming) {
            this._setConfirm(true, relaunch);
            return;
        }
        const row = this._rows?.find(r => r.id === this._selected);
        if (!row)
            return;
        this.kill(row.app, this._relaunchAfter);
        this._setConfirm(false);
    }

    /**
     * Kill an app's windows' clients; with relaunch, start it again once it stopped.
     *
     * @param {Shell.App} app
     * @param {boolean} relaunch
     */
    kill(app, relaunch = false) {
        if (relaunch && !this._relaunch.has(app)) {
            const token = this._cleanup.connect(app, 'notify::state', () => {
                if (app.state !== Shell.AppState.STOPPED)
                    return;
                this._cleanup.release(token);
                this._relaunch.delete(app);
                app.activate();
            });
            this._relaunch.set(app, token);
        }
        for (const w of app.get_windows())
            w.kill();
    }
}
