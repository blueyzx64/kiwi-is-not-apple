// SPDX-License-Identifier: GPL-3.0-or-later
// The file shelf (Tray tab): links to files, kept in the Kiwi key `notch-shelf`, newest first.
// The files themselves are never copied, moved or deleted.
//
// How files get here on GNOME 50 / Wayland (see docs/features/notch.md, "File shelf"): a drag
// from an app does not reach Shell actors, so the shelf takes
//   - "Add from Clipboard": files copied in Files (x-special/gnome-copied-files or
//     text/uri-list) or a copied path;
//   - finished downloads (notch-shelf-downloads) and new screenshots (notch-shelf-screenshots).
// And gives them back with Open, Show in Files, Copy (a text/uri-list on the clipboard, which
// Files and GTK apps paste as the file) and Remove, since dragging out is not possible either.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { addToShelf, removeFromShelf, CLIPBOARD_FILE_TYPES, displayName } from './model.js';

const KEY = 'notch-shelf';
const INFO_ATTRS = 'standard::display-name,standard::icon,standard::content-type';

export class Shelf {
    /**
     * @param {CleanupRegistry} cleanup
     * @param {KiwiSettings} ks
     * @param {() => void} onChange the list, an item's info or the clipboard offer changed
     */
    constructor(cleanup, ks, onChange) {
        this._ks = ks;
        this._onChange = onChange;
        this._info = new Map();     // uri -> {name, gicon, missing}
        this._cancellable = new Gio.Cancellable();
        this._clipboardHasFiles = false;
        this._alive = true;
        cleanup.add(() => {
            this._alive = false;
            this._cancellable.cancel();
        });
        ks.watch(KEY, () => this._changed());

        // Is there something to add? Follow the clipboard owner (no reads until the button)
        const selection = global.display.get_selection();
        cleanup.connect(selection, 'owner-changed', (_s, type) => {
            if (type === Meta.SelectionType.SELECTION_CLIPBOARD)
                this._syncClipboardOffer();
        });
        this._syncClipboardOffer();

        cleanup.connect(Main.screenshotUI, 'screenshot-taken', (_ui, file) => {
            if (ks.bool('notch-shelf-screenshots') && file)
                this.add([file.get_uri()]);
        });
    }

    /** @returns {string[]} the links, newest first */
    get uris() {
        return this._ks.strv(KEY);
    }

    get clipboardHasFiles() {
        return this._clipboardHasFiles;
    }

    /** Display info of one item (loaded once, asynchronously; onChange fires when it lands) */
    info(uri) {
        const known = this._info.get(uri);
        if (known)
            return known;
        const entry = { name: displayName(uri), gicon: null, missing: false };
        this._info.set(uri, entry);
        Gio.File.new_for_uri(uri).query_info_async(INFO_ATTRS, Gio.FileQueryInfoFlags.NONE,
            GLib.PRIORITY_LOW, this._cancellable, (f, res) => {
                try {
                    const i = f.query_info_finish(res);
                    entry.name = i.get_display_name() || entry.name;
                    entry.gicon = i.get_icon();
                } catch (e) {
                    if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        return;
                    entry.missing = e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND) ?? false;
                }
                if (this._alive)
                    this._onChange();
            });
        return entry;
    }

    add(uris) {
        const next = addToShelf(this.uris, uris);
        if (JSON.stringify(next) !== JSON.stringify(this.uris))
            this._ks.setStrv(KEY, next);
    }

    remove(uri) {
        this._ks.setStrv(KEY, removeFromShelf(this.uris, uri));
    }

    clear() {
        this._ks.setStrv(KEY, []);
    }

    /** Read files from the clipboard in the best format offered; resolves to how many were added */
    addFromClipboard() {
        const clipboard = St.Clipboard.get_default();
        const offered = clipboard.get_mimetypes(St.ClipboardType.CLIPBOARD) ?? [];
        const pick = CLIPBOARD_FILE_TYPES.find(([mime]) => offered.includes(mime));
        if (!pick)
            return Promise.resolve(0);
        const [mime, parse] = pick;
        return new Promise(resolve => {
            clipboard.get_content(St.ClipboardType.CLIPBOARD, mime, (_c, bytes) => {
                const data = bytes?.get_data?.() ?? bytes?.toArray?.() ?? null;
                const uris = data ? parse(new TextDecoder().decode(data)) : [];
                if (this._alive && uris.length)
                    this.add(uris);
                resolve(uris.length);
            });
        });
    }

    open(uri) {
        Gio.AppInfo.launch_default_for_uri_async(uri, global.create_app_launch_context(0, -1),
            this._cancellable, (_o, res) => {
                try {
                    Gio.AppInfo.launch_default_for_uri_finish(res);
                } catch (e) {
                    console.warn(`[Kiwi] notch shelf: cannot open ${uri}: ${e.message}`);
                }
            });
    }

    /** Show the file selected in the file manager (org.freedesktop.FileManager1) */
    reveal(uri) {
        Gio.DBus.session.call('org.freedesktop.FileManager1', '/org/freedesktop/FileManager1',
            'org.freedesktop.FileManager1', 'ShowItems', new GLib.Variant('(ass)', [[uri], '']),
            null, Gio.DBusCallFlags.NONE, -1, this._cancellable, (c, res) => {
                try {
                    c.call_finish(res);
                } catch (e) {
                    console.warn(`[Kiwi] notch shelf: cannot show ${uri}: ${e.message}`);
                }
            });
    }

    /** Put the file on the clipboard, so it pastes into Files or a GTK app */
    copy(uri) {
        St.Clipboard.get_default().set_content(St.ClipboardType.CLIPBOARD, 'text/uri-list',
            new GLib.Bytes(new TextEncoder().encode(`${uri}\r\n`)));
    }

    _changed() {
        const keep = new Set(this.uris);
        for (const uri of this._info.keys()) {
            if (!keep.has(uri))
                this._info.delete(uri);
        }
        this._onChange();
    }

    _syncClipboardOffer() {
        const offered = St.Clipboard.get_default().get_mimetypes(St.ClipboardType.CLIPBOARD) ?? [];
        const has = CLIPBOARD_FILE_TYPES.slice(0, 2).some(([mime]) => offered.includes(mime));
        if (has !== this._clipboardHasFiles) {
            this._clipboardHasFiles = has;
            this._onChange();
        }
    }
}
