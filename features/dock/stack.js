// SPDX-License-Identifier: GPL-3.0-or-later
// The Downloads stack: a dock tile showing a pile of the newest files, kept current by a file
// monitor, that opens as a Fan, a Grid or a List (model.stackView). Files sort by Date Added;
// packages (.rpm, .flatpakref, .AppImage) carry a badge; partial downloads show greyed, and the
// tile bounces when one finishes. Files can be opened, dragged onto app icons or the Trash, or
// opened with the installer from their menu (installer-and-app-lifecycle.md §4.2).
//
// Shell API: Main.pushModal/popModal, ui/dnd.js, lib/modalSurface.js registerForeign (one
// Kiwi overlay at a time).

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as DND from 'resource:///org/gnome/shell/ui/dnd.js';

import { CleanupRegistry } from '../../lib/disposables.js';
import { DesktopAppInfo } from '../../lib/compat.js';
import { Glass } from '../../lib/glass.js';
import { ModalSurface } from '../../lib/modalSurface.js';
import { INSTALLER_DESKTOP_ID as INSTALLER_ID } from '../../core/installerModel.js';
import { DockItem } from './items.js';
import { FAN_MAX, downloadEntry, downloadFinished, fanLayout, isHorizontal, sortDownloads, stackView } from './model.js';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'close_async', 'close_finish');

const ATTRIBUTES = ['standard::name', 'standard::display-name', 'standard::is-hidden', 'standard::is-backup',
    'standard::icon', 'standard::content-type', 'time::modified', 'time::changed', 'time::created',
    'thumbnail::path'].join(',');
const BATCH = 64;
const PILE = 3;               // files drawn in the dock tile
const GRID_COLUMNS = 5;
const GRID_ROWS_VISIBLE = 3;
const PARTIAL_OPACITY = 128;  // a download still running shows greyed

const cancelled = e => e?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
const BADGES = { rpm: 'RPM', flatpak: 'Flatpak', appimage: 'AppImage' };

/** The user's Downloads folder (XDG), or ~/Downloads. */
export function downloadsDir() {
    const path = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD) ??
        GLib.build_filenamev([GLib.get_home_dir(), 'Downloads']);
    return Gio.File.new_for_path(path);
}

export class DownloadsItem extends DockItem {
    constructor(host, spec) {
        super(host, spec, host.gettext('Downloads'));
        this.dir = downloadsDir();
        this.files = [];             // [{entry, file, gicon}] newest first
        this._reading = false;
        this._dirty = false;
        this._cancellable = new Gio.Cancellable();
        this.cleanup.add(() => this._cancellable.cancel());
        this._pile = new St.Widget({ layout_manager: new Clutter.BinLayout(), x_expand: true, y_expand: true });
        this.content.add_child(this._pile);
        this._popup = null;
        this.cleanup.add(() => this.closePopup());
        try {
            const monitor = this.dir.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, this._cancellable);
            this.cleanup.connect(monitor, 'changed', () => this.refresh());
            this.cleanup.add(() => monitor.cancel());
        } catch (e) {
            console.warn('[Kiwi] dock: cannot watch Downloads:', e.message);
        }
        this._drawPile();
        this.refresh();
    }

    get iconActor() {
        return this._pile;
    }

    /** Re-read the folder (one read at a time, one more if it changed meanwhile). */
    refresh() {
        if (this._reading) {
            this._dirty = true;
            return;
        }
        this._reading = true;
        this._read().catch(e => {
            if (!cancelled(e))
                console.warn('[Kiwi] dock: reading Downloads failed:', e.message);
        }).finally(() => {
            this._reading = false;
            if (this._dirty && !this._cancellable.is_cancelled()) {
                this._dirty = false;
                this.refresh();
            }
        });
    }

    async _read() {
        let enumerator;
        try {
            enumerator = await this.dir.enumerate_children_async(ATTRIBUTES, Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT, this._cancellable);
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                throw e;
        }
        const found = [];
        if (enumerator) {
            for (;;) {
                const infos = await enumerator.next_files_async(BATCH, GLib.PRIORITY_DEFAULT, this._cancellable);
                if (!infos.length)
                    break;
                for (const info of infos) {
                    const entry = downloadEntry({
                        name: info.get_name(), displayName: info.get_display_name(),
                        hidden: info.get_is_hidden(), backup: info.get_is_backup(),
                        changed: info.get_attribute_uint64('time::changed'),
                        created: info.get_attribute_uint64('time::created'),
                        modified: info.get_attribute_uint64('time::modified'),
                    });
                    if (!entry)
                        continue;
                    const thumb = info.get_attribute_byte_string('thumbnail::path');
                    found.push({
                        entry, file: enumerator.get_child(info), contentType: info.get_content_type(),
                        gicon: thumb ? Gio.FileIcon.new(Gio.File.new_for_path(thumb)) : info.get_icon(),
                    });
                }
            }
            await enumerator.close_async(GLib.PRIORITY_DEFAULT, null);
        }
        const order = sortDownloads(found.map(f => f.entry));
        const byName = new Map(found.map(f => [f.entry.name, f]));
        const before = this.files.map(f => f.entry);
        this.files = order.map(e => byName.get(e.name));
        if (downloadFinished(before, order))
            this._host.bounce(this);
        this._drawPile();
    }

    // The tile: the newest files on top of each other, each turned a little; the folder icon
    // when there are none
    _drawPile() {
        const m = this._host.metrics;
        this._pile.destroy_all_children();
        const top = this.files.filter(f => !f.entry.partial).slice(0, PILE).reverse();
        if (!top.length) {
            this._pile.add_child(new St.Icon({
                icon_name: 'folder-download', icon_size: m.icon,
                x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
            }));
            return;
        }
        const size = Math.round(m.icon * 0.86);
        top.forEach((f, i) => {
            const depth = top.length - 1 - i;
            this._pile.add_child(new St.Icon({
                gicon: f.gicon, icon_size: size,
                x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER,
                translation_y: -depth * Math.round(m.icon * 0.05),
                rotation_angle_z: depth * -4,
                pivot_point: new Graphene.Point({ x: 0.5, y: 1 }),
            }));
        });
    }

    activate() {
        if (this._popup)
            this.closePopup();
        else
            this.openPopup();
    }

    openMenu() {
        this._host.openStackMenu(this);
    }

    openPopup() {
        this.closePopup();
        ModalSurface.closeAll();
        this._popup = new StackPopup(this._host, this);
        if (!this._popup.open())
            this.closePopup();
    }

    closePopup() {
        const popup = this._popup;
        this._popup = null;
        popup?.destroy();
    }

    get popupOpen() {
        return this._popup !== null;
    }
}

/** The opened stack: a modal overlay with the files as a fan, a grid or a list. */
class StackPopup {
    constructor(host, stack) {
        this._host = host;
        this._stack = stack;
        this._cleanup = new CleanupRegistry();
        this._grab = null;
        const monitor = Main.layoutManager.primaryMonitor;
        this.actor = this._cleanup.actor(new St.Widget({
            name: 'kiwi-dock-stack', reactive: true, can_focus: true,
            x: monitor.x, y: monitor.y, width: monitor.width, height: monitor.height,
        }));
        Main.layoutManager.uiGroup.add_child(this.actor);
        // A click beside the files (the stack icon included) closes it; the files get theirs
        this._cleanup.connect(this.actor, 'button-press-event', (_a, event) => {
            if (event.get_source() !== this.actor)
                return Clutter.EVENT_PROPAGATE;
            stack.closePopup();
            return Clutter.EVENT_STOP;
        });
        this._cleanup.connect(this.actor, 'key-press-event', (_a, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            stack.closePopup();
            return Clutter.EVENT_STOP;
        });
        this._cleanup.add(ModalSurface.registerForeign('dock-stack', () => stack.closePopup()));
        host.hold();
        this._cleanup.add(() => host.unhold());
    }

    open() {
        const files = this._stack.files;
        const view = stackView(this._host.config.stackView, this._host.config.position, files.length);
        const anchor = this._host.rectOf(this._stack);
        if (!anchor)
            return false;
        if (view === 'fan')
            this._buildFan(files, anchor);
        else
            this._buildPanel(files, anchor, view);
        this._grab = Main.pushModal(this.actor, { actionMode: Shell.ActionMode.POPUP });
        if (!this._grab)
            return false;
        this._cleanup.add(() => this._popModal());
        this.actor.grab_key_focus();
        return true;
    }

    _popModal() {
        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }
    }

    // ---- rows ----

    _fileButton(f, { iconSize, vertical, label = true }) {
        const _ = this._host.gettext;
        const button = new St.Button({
            style_class: `kiwi-dock-stack-file${f.entry.partial ? ' kiwi-dock-stack-partial' : ''}`,
            accessible_name: f.entry.partial ? _('%s (downloading)').format(f.entry.label) : f.entry.label,
            reactive: true, can_focus: true, track_hover: true,
            button_mask: St.ButtonMask.ONE | St.ButtonMask.THREE,
        });
        const box = new St.BoxLayout({
            orientation: vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL,
            style_class: 'kiwi-dock-stack-file-box',
        });
        const iconBin = new St.Widget({ layout_manager: new Clutter.BinLayout() });
        const icon = new St.Icon({ gicon: f.gicon, icon_size: iconSize });
        iconBin.add_child(icon);
        if (f.entry.badge) {
            iconBin.add_child(new St.Label({
                style_class: 'kiwi-dock-stack-badge', text: BADGES[f.entry.badge],
                x_expand: true, y_expand: true,
                x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.END,
            }));
        }
        if (label) {
            const text = new St.Label({ style_class: 'kiwi-dock-stack-name', text: f.entry.label, y_align: Clutter.ActorAlign.CENTER });
            text.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            box.add_child(text);
        }
        box.add_child(iconBin);
        button.set_child(box);
        if (f.entry.partial)
            button.opacity = PARTIAL_OPACITY;
        button.connect('clicked', (_b, clicked) => {
            if (clicked === Clutter.BUTTON_SECONDARY)
                this._host.openFileMenu(button, f, this._stack);
            else
                this._open(f);
        });
        if (!f.entry.partial) {
            button._delegate = {
                kiwiFile: f.file,
                getDragActor: () => new St.Icon({ gicon: f.gicon, icon_size: iconSize }),
                getDragActorSource: () => icon,
            };
            const drag = DND.makeDraggable(button);
            drag.connect('drag-begin', () => this._dragBegin());
            drag.connect('drag-end', () => this._stack.closePopup());
        }
        return button;
    }

    _open(f) {
        if (f.entry.partial)
            return;
        this._host.openUri(f.file.get_uri());
        this._stack.closePopup();
    }

    // A row being dragged: the overlay steps aside (no modal, hidden, so the drop's pick
    // reaches the dock under it); it goes away when the drag ends
    _dragBegin() {
        this._popModal();
        this.actor.hide();
    }

    _openFolderButton(text) {
        const button = new St.Button({
            style_class: 'kiwi-dock-stack-open', label: text, reactive: true, can_focus: true,
        });
        button.connect('clicked', () => {
            this._host.openUri(this._stack.dir.get_uri());
            this._stack.closePopup();
        });
        return button;
    }

    // ---- fan (bottom dock, a short stack) ----

    _buildFan(files, anchor) {
        const m = this._host.metrics;
        const _ = this._host.gettext;
        const shown = files.slice(0, FAN_MAX);
        const iconSize = Math.round(m.icon * 1.15);
        const step = Math.round(iconSize * 1.25);
        const rows = fanLayout(shown.length + 1, step);
        const origin = [anchor.x + anchor.width / 2 - this.actor.x, anchor.y - this.actor.y];
        shown.forEach((f, i) => {
            this._place(this._fileButton(f, { iconSize, vertical: false }), origin, rows[i], i);
        });
        const more = files.length - shown.length;
        const open = this._openFolderButton(more > 0
            ? this._host.ngettext('%d more in Files', '%d more in Files', more).format(more)
            : _('Open in Files'));
        this._place(open, origin, rows[shown.length], shown.length);
    }

    // A fan row: right-aligned on the stack's centre line, so the icons form the column and
    // the names sit to their left
    _place(row, origin, at, index) {
        this.actor.add_child(row);
        const [, , w, h] = row.get_preferred_size();
        const iconHalf = Math.round(this._host.metrics.icon * 0.6);
        row.set_position(Math.round(origin[0] + at.dx - w + iconHalf), Math.round(origin[1] + at.dy - h / 2));
        row.pivot_point = new Graphene.Point({ x: 1, y: 0.5 });
        row.rotation_angle_z = at.angle;
        row.opacity = 0;
        row.translation_y = -at.dy;
        this._host.motion.ease(row, { opacity: 255, translation_y: 0 },
            { duration: 'short', curve: 'emphasized', delay: index * 12 }, this._cleanup);
    }

    // ---- grid and list: a glass panel beside the stack ----

    _buildPanel(files, anchor, view) {
        const m = this._host.metrics;
        const _ = this._host.gettext;
        const panel = new St.BoxLayout({ style_class: `kiwi-dock-stack-panel kiwi-dock-stack-panel-${view}`, orientation: Clutter.Orientation.VERTICAL });
        const glass = Glass.attach(panel, { surface: 'menus', role: 'content' });
        this._cleanup.add(() => glass.destroy());
        panel.add_child(new St.Label({ style_class: 'kiwi-dock-stack-title', text: this._stack.dir.get_basename() }));

        const scroll = new St.ScrollView({ style_class: 'kiwi-dock-stack-scroll', hscrollbar_policy: St.PolicyType.NEVER });
        const iconSize = view === 'grid' ? Math.round(m.icon * 1.1) : Math.round(m.icon * 0.6);
        let body;
        if (view === 'grid') {
            const layout = new Clutter.GridLayout({ orientation: Clutter.Orientation.HORIZONTAL, row_spacing: 6, column_spacing: 6 });
            body = new St.Widget({ layout_manager: layout, style_class: 'kiwi-dock-stack-grid' });
            files.forEach((f, i) => {
                const button = this._fileButton(f, { iconSize, vertical: true });
                // Name under the icon in a grid
                const box = button.get_child();
                box.set_child_at_index(box.get_last_child(), 0);
                layout.attach(button, i % GRID_COLUMNS, Math.floor(i / GRID_COLUMNS), 1, 1);
            });
        } else {
            body = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL, style_class: 'kiwi-dock-stack-list' });
            files.forEach(f => {
                const button = this._fileButton(f, { iconSize, vertical: false });
                const box = button.get_child();
                box.set_child_at_index(box.get_last_child(), 0);
                button.x_expand = true;
                box.x_expand = true;
                box.x_align = Clutter.ActorAlign.START;
                body.add_child(button);
            });
        }
        if (!files.length)
            body = new St.Label({ style_class: 'kiwi-dock-stack-empty', text: _('No downloads') });
        // A ScrollView needs a scrollable child: a box around the grid, list or note
        const content = new St.BoxLayout({ orientation: Clutter.Orientation.VERTICAL });
        content.add_child(body);
        scroll.set_child(content);
        panel.add_child(scroll);
        panel.add_child(this._openFolderButton(_('Open in Files')));
        this.actor.add_child(panel);

        // Size: the content, capped to a few rows with the rest scrolling
        const [, natW] = body.get_preferred_width(-1);
        const [, natH] = body.get_preferred_height(natW);
        const rowH = view === 'grid' ? iconSize * 2.2 : iconSize * 1.6;
        scroll.set_size(Math.round(natW + 12), Math.round(Math.min(natH, rowH * (view === 'grid' ? GRID_ROWS_VISIBLE : 8))));

        const [, , pw, ph] = panel.get_preferred_size();
        const gap = m.padding * 2;
        const { position } = this._host.config;
        const mon = { x: this.actor.x, y: this.actor.y, width: this.actor.width, height: this.actor.height };
        let x, y;
        if (isHorizontal(position)) {
            x = anchor.x + anchor.width / 2 - pw / 2;
            y = anchor.y - m.padding - gap - ph;
        } else {
            x = position === 'left' ? anchor.x + anchor.width + m.padding + gap : anchor.x - m.padding - gap - pw;
            y = anchor.y + anchor.height / 2 - ph / 2;
        }
        x = Math.max(mon.x + gap, Math.min(x, mon.x + mon.width - pw - gap));
        y = Math.max(mon.y + gap, Math.min(y, mon.y + mon.height - ph - gap));
        panel.set_position(Math.round(x - mon.x), Math.round(y - mon.y));
        panel.opacity = 0;
        panel.set_pivot_point(0.5, 1);
        panel.scale_x = panel.scale_y = 0.96;
        this._host.motion.ease(panel, { opacity: 255, scale_x: 1, scale_y: 1 },
            { duration: 'short', curve: 'emphasized' }, this._cleanup);
    }

    destroy() {
        this._cleanup.dispose();
    }
}

/**
 * "Open with Installer" for a package of this type: offered when the installer is there (its
 * Installer1 API, or its desktop file) and is not already the default handler (then Open does
 * it). `api` says whether to call Installer1.Open; `info` is the desktop file to launch.
 *
 * @param {?string} contentType
 * @param {boolean} apiAvailable core/installer.js `available`
 * @returns {?{api: boolean, info: ?Gio.DesktopAppInfo}}
 */
export function installerFor(contentType, apiAvailable) {
    let info = null;
    try {
        info = DesktopAppInfo.new(INSTALLER_ID);
    } catch (_e) {
        info = null;
    }
    if (!info && !apiAvailable)
        return null;
    const current = contentType ? Gio.AppInfo.get_default_for_type(contentType, false) : null;
    return current?.get_id() === INSTALLER_ID ? null : { api: apiAvailable, info };
}
