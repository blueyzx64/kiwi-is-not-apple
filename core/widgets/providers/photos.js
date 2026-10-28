// SPDX-License-Identifier: GPL-3.0-or-later
// Photos data: the pictures in the Pictures folder (XDG), as macOS's "Featured Photos" does
// with the library. READ ONLY. The folder is listed asynchronously (a few levels deep, without
// Screenshots, Wallpapers or hidden folders: data.js isPhotoDir) and the list is kept on the
// host for ten minutes, so the overview coming and going does not list it again. The photo of
// the hour (data.js pickPhoto) is the same in every view; each view decodes it at its own size
// in the probe process (lib/wallpaperDecode.js decodePhoto), never on the Shell's main loop.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { decodePhoto } from '../../../lib/wallpaperDecode.js';
import { isPhotoDir, isPhotoType, photoSlot } from '../data.js';
import { Provider } from './base.js';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'close_async');

const CACHE_KEY = 'photos';
const CACHE_MS = 10 * 60000;
const MAX_FILES = 3000;
const MAX_DIRS = 300;
const MAX_DEPTH = 3;
const BATCH = 100;
const ATTRS = 'standard::name,standard::type,standard::content-type,standard::is-hidden';

/** The Pictures folder (XDG), or ~/Pictures. */
export function picturesDir() {
    const dir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
    return dir && dir !== GLib.get_home_dir() ? dir : GLib.build_filenamev([GLib.get_home_dir(), 'Pictures']);
}

async function listPhotos(root, cancel) {
    const files = [];
    const queue = [{ dir: Gio.File.new_for_path(root), depth: 0 }];
    let dirs = 0;
    while (queue.length && files.length < MAX_FILES && dirs < MAX_DIRS) {
        const { dir, depth } = queue.shift();
        dirs++;
        let en;
        try {
            en = await dir.enumerate_children_async(ATTRS, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_LOW, cancel);
        } catch (e) {
            if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                throw e;
            continue; // unreadable folder
        }
        try {
            for (;;) {
                const infos = await en.next_files_async(BATCH, GLib.PRIORITY_LOW, cancel);
                if (!infos.length)
                    break;
                for (const info of infos) {
                    const name = info.get_name();
                    if (info.get_is_hidden())
                        continue;
                    const type = info.get_file_type();
                    if (type === Gio.FileType.DIRECTORY && depth < MAX_DEPTH && isPhotoDir(name))
                        queue.push({ dir: dir.get_child(name), depth: depth + 1 });
                    else if (type === Gio.FileType.REGULAR && isPhotoType(info.get_content_type()))
                        files.push(dir.get_child(name).get_path());
                }
            }
        } finally {
            en.close_async(GLib.PRIORITY_LOW, null).catch(() => {});
        }
    }
    // A stable order, so the photo of the hour is the same after a new listing
    return files.sort();
}

export class PhotosProvider extends Provider {
    initial() {
        return { state: 'loading', count: 0, slot: 0 };
    }

    run(cleanup) {
        const cancel = new Gio.Cancellable();
        cleanup.add(() => cancel.cancel());
        this._cancel = cancel;
        this._files = [];
        this._scheduleSlot(cleanup);
        this._load(cancel);
    }

    async _load(cancel) {
        const cache = this._env.cache;
        let entry = cache.get(CACHE_KEY);
        if (!entry || Date.now() - entry.time > CACHE_MS) {
            try {
                entry = { time: Date.now(), files: await listPhotos(picturesDir(), cancel) };
            } catch (_e) {
                return; // cancelled
            }
            cache.set(CACHE_KEY, entry);
        }
        if (cancel.is_cancelled())
            return;
        this._files = entry.files;
        this._publish();
    }

    // The next hour (the slot) begins: every view moves on together
    _scheduleSlot(cleanup) {
        const now = new Date();
        const ms = 3600000 - (now.getMinutes() * 60000 + now.getSeconds() * 1000 + now.getMilliseconds());
        cleanup.timeout(Math.max(1000, ms), () => {
            this._publish();
            if (this.running)
                this._scheduleSlot(cleanup);
        }, { name: 'kiwi-widgets-photos-slot' });
    }

    _publish() {
        this.publish({
            state: this._files.length ? 'ready' : 'empty',
            count: this._files.length,
            hour: photoSlot(new Date(), 'hourly'),
            day: photoSlot(new Date(), 'daily'),
        });
    }

    /** The path of photo `index`, or null. */
    path(index) {
        return this._files[index] ?? null;
    }

    /** Decode a photo for a view (see lib/wallpaperDecode.js decodePhoto). */
    decode(path, width, height, radius, cancel) {
        return decodePhoto(path, width, height, radius, cancel);
    }

    /** Open a photo in the default image viewer. */
    open(path) {
        const uri = Gio.File.new_for_path(path).get_uri();
        Gio.AppInfo.launch_default_for_uri_async(uri, global.create_app_launch_context(0, -1), null, (_o, res) => {
            try {
                Gio.AppInfo.launch_default_for_uri_finish(res);
            } catch (e) {
                console.warn(`[Kiwi] could not open ${uri}:`, e.message);
            }
        });
    }
}
