// SPDX-License-Identifier: GPL-3.0-or-later
// Clipboard history on disk: ~/.local/share/kiwi/clipboard/ (dir 0700, files 0600).
//   history.json            index (text inline, images by file name)
//   images/<sha256>.<ext>   one file per image
// Async Gio only; nothing here blocks the Shell main loop. Kiwi only ever deletes files it
// wrote itself: history.json and image files whose name matches the store's own pattern.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { isStoreFileName, parseHistory, serializeHistory } from './model.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');
Gio._promisify(Gio.File.prototype, 'make_directory_async', 'make_directory_finish');
Gio._promisify(Gio.File.prototype, 'delete_async', 'delete_finish');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Gio.File.prototype, 'set_attributes_async', 'set_attributes_finish');
Gio._promisify(Gio.File.prototype, 'enumerate_children_async', 'enumerate_children_finish');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async', 'next_files_finish');

const LOG = '[Kiwi]';
const INDEX = 'history.json';
const MAX_INDEX_BYTES = 64 * 1024 * 1024;     // refuse to parse a runaway file

export function defaultDir() {
    return GLib.build_filenamev([GLib.get_user_data_dir(), 'kiwi', 'clipboard']);
}

export class ClipboardStore {
    /** @param {string} [dir] store folder (tests pass a temp dir) */
    constructor(dir = defaultDir()) {
        this._dir = Gio.File.new_for_path(dir);
        this._images = this._dir.get_child('images');
        this._index = this._dir.get_child(INDEX);
        this._ready = null;
        this._queue = Promise.resolve();
    }

    get path() {
        return this._dir.get_path();
    }

    /** File for an image entry, or null for a name the store did not write. */
    imageFile(name) {
        return isStoreFileName(name) ? this._images.get_child(name) : null;
    }

    /** Run jobs one after another; a failed job is logged and does not stop the next. */
    _enqueue(job) {
        // Errors are logged here and never reach the caller: writes are fire and forget
        this._queue = this._queue.then(job)
            .catch(e => console.warn(`${LOG} clipboard store: ${e.message}`));
        return this._queue;
    }

    async _ensureDir(dir) {
        try {
            await dir.make_directory_async(GLib.PRIORITY_DEFAULT, null);
        } catch (e) {
            if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                return;
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                throw e;
            await this._ensureDir(dir.get_parent());
            await this._ensureDir(dir);
            return;
        }
        // Created by us: owner only (but leave the XDG data dir itself at its default)
        if (dir.get_path() === GLib.get_user_data_dir())
            return;
        const info = new Gio.FileInfo();
        info.set_attribute_uint32('unix::mode', 0o700);
        await dir.set_attributes_async(info, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
    }

    _ensure() {
        this._ready ??= this._ensureDir(this._images).catch(e => {
            this._ready = null;
            throw e;
        });
        return this._ready;
    }

    /**
     * Read the saved history.
     *
     * @param {object} [limits] see model DEFAULTS
     * @returns {Promise<object[]>} entries, [] when there is none or it is unreadable
     */
    async load(limits = {}) {
        try {
            const [bytes] = await this._index.load_contents_async(null);
            if (!bytes || bytes.length > MAX_INDEX_BYTES)
                return [];
            return parseHistory(new TextDecoder().decode(bytes), limits);
        } catch (e) {
            if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                console.warn(`${LOG} clipboard history not loaded: ${e.message}`);
            return [];
        }
    }

    /** Write history.json (replaces atomically, mode 0600). */
    saveIndex(history) {
        const text = serializeHistory(history);        // snapshot now, write later
        return this._enqueue(async () => {
            await this._ensure();
            await this._index.replace_contents_bytes_async(
                new GLib.Bytes(new TextEncoder().encode(text)), null, false,
                Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        });
    }

    /** Write an image file (same hash means same bytes, so rewriting is harmless). */
    writeImage(name, bytes) {
        const file = this.imageFile(name);
        if (!file)
            return Promise.resolve();
        return this._enqueue(async () => {
            await this._ensure();
            await file.replace_contents_bytes_async(bytes, null, false,
                Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        });
    }

    /** Read an image file back. @returns {Promise<GLib.Bytes|null>} */
    async readImage(name) {
        const file = this.imageFile(name);
        if (!file)
            return null;
        try {
            const [bytes] = await file.load_contents_async(null);
            return new GLib.Bytes(bytes);
        } catch (_e) {
            return null;
        }
    }

    deleteImages(names) {
        const files = names.map(n => this.imageFile(n)).filter(Boolean);
        if (!files.length)
            return Promise.resolve();
        return this._enqueue(() => this._deleteAll(files));
    }

    async _deleteAll(files) {
        for (const f of files) {
            try {
                await f.delete_async(GLib.PRIORITY_DEFAULT, null);
            } catch (e) {
                if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                    console.warn(`${LOG} could not delete ${f.get_basename()}: ${e.message}`);
            }
        }
    }

    /** File names in images/ (only ones the store itself would have written). */
    async listImages() {
        const out = [];
        let en;
        try {
            en = await this._images.enumerate_children_async(
                Gio.FILE_ATTRIBUTE_STANDARD_NAME, Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                GLib.PRIORITY_DEFAULT, null);
        } catch (_e) {
            return out;
        }
        for (;;) {
            const infos = await en.next_files_async(64, GLib.PRIORITY_DEFAULT, null);
            if (!infos.length)
                break;
            for (const info of infos) {
                if (isStoreFileName(info.get_name()))
                    out.push(info.get_name());
            }
        }
        return out;
    }

    /** Delete image files nothing references (left by a crash or an eviction that failed). */
    sweep(history, orphanFiles) {
        return this._enqueue(async () => {
            const names = orphanFiles(await this.listImages(), history);
            await this._deleteAll(names.map(n => this.imageFile(n)));
        });
    }

    /** Delete everything the store wrote: the index and every image file. */
    clearAll() {
        return this._enqueue(async () => {
            const names = await this.listImages();
            await this._deleteAll([...names.map(n => this.imageFile(n)), this._index]);
        });
    }

    /** Resolves when every queued write has finished. */
    flush() {
        return this._queue;
    }
}
