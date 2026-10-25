// SPDX-License-Identifier: GPL-3.0-or-later
// Knows which button icon files exist, from one async directory listing, so hovering a
// button never stats files on the compositor thread.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');

const FOLDERS = ['titlebuttons', 'titlebuttons-glass'];

export class IconCatalog {
    /** @param {string} extensionPath */
    constructor(extensionPath) {
        this._root = `${extensionPath}/icons`;
        this._names = new Map();
        this._cancellable = new Gio.Cancellable();
        this.ready = false;
    }

    /** List the icon folders. Resolves true when done, false when cancelled or failed. */
    async load() {
        try {
            for (const folder of FOLDERS) {
                const dir = Gio.File.new_for_path(`${this._root}/${folder}`);
                const names = new Set();
                const enumerator = await dir.enumerate_children_async(
                    'standard::name', Gio.FileQueryInfoFlags.NONE,
                    GLib.PRIORITY_DEFAULT, this._cancellable);
                for (;;) {
                    const infos = await enumerator.next_files_async(
                        256, GLib.PRIORITY_DEFAULT, this._cancellable);
                    if (!infos.length)
                        break;
                    infos.forEach(i => names.add(i.get_name()));
                }
                enumerator.close_async(GLib.PRIORITY_DEFAULT, null, null);
                this._names.set(folder, names);
            }
            this.ready = true;
            return true;
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                console.error(`[Kiwi] window controls icon listing failed: ${e}`);
            return false;
        }
    }

    /** Before the listing arrives every file is assumed to exist (the first choice wins). */
    has(folder, name) {
        if (!this.ready)
            return true;
        return this._names.get(folder)?.has(name) ?? false;
    }

    file(folder, name) {
        return Gio.File.new_for_path(`${this._root}/${folder}/${name}`);
    }

    destroy() {
        this._cancellable.cancel();
    }
}
