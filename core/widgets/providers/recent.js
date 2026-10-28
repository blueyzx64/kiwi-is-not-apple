// SPDX-License-Identifier: GPL-3.0-or-later
// Recent files data: the files apps recorded in ~/.local/share/recently-used.xbel (the
// freedesktop list GTK's RecentManager keeps; RecentManager itself is GTK and not in the
// Shell). READ ONLY: Kiwi never writes that file. It is read asynchronously, parsed by
// data.js parseRecent, checked for files that are gone, and read again when it changes
// (a file monitor) while a Recent Files widget is visible. A minute tick keeps "5 min ago"
// current.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { parseRecent, recentFiles } from '../data.js';
import { Provider } from './base.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'query_info_async');

const SHOWN = 10;
const CANDIDATES = 24;
const SETTLE_MS = 800;
const MINUTE_MS = 60000;

export class RecentProvider extends Provider {
    initial() {
        return { state: 'loading', files: [], now: Date.now() };
    }

    run(cleanup) {
        const cancel = new Gio.Cancellable();
        cleanup.add(() => cancel.cancel());
        this._cancel = cancel;
        this._files = [];
        this._settle = 0;
        const file = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']));
        this._file = file;
        try {
            const monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, cancel);
            cleanup.connect(monitor, 'changed', () => this._queue(cleanup));
            cleanup.add(() => monitor.cancel());
        } catch (e) {
            console.warn('[Kiwi] recent files: no file monitor:', e.message);
        }
        cleanup.timeout(MINUTE_MS, () => {
            this.publish({ ...this._data, now: Date.now() });
            return true;
        }, { name: 'kiwi-widgets-recent-minute' });
        this._load(cancel);
    }

    // Apps rewrite the file in bursts: read it once they are done
    _queue(cleanup) {
        if (this._settle)
            cleanup.release(this._settle);
        this._settle = cleanup.timeout(SETTLE_MS, () => {
            this._settle = 0;
            this._load(this._cancel);
        }, { name: 'kiwi-widgets-recent-settle' });
    }

    async _load(cancel) {
        let text = '';
        try {
            const [bytes] = await this._file.load_contents_async(cancel);
            text = new TextDecoder().decode(bytes);
        } catch (e) {
            if (e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return;
            // No list yet: nothing was opened
        }
        const candidates = recentFiles(parseRecent(text), CANDIDATES);
        const present = await Promise.all(candidates.map(async f => {
            try {
                const info = await Gio.File.new_for_uri(f.uri).query_info_async('standard::type,standard::content-type',
                    Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_LOW, cancel);
                return { ...f, mime: f.mime || info.get_content_type() || '', dir: info.get_file_type() === Gio.FileType.DIRECTORY };
            } catch (_e) {
                return null; // gone, or cancelled
            }
        }));
        if (cancel.is_cancelled())
            return;
        this.publish({ state: 'ready', files: present.filter(Boolean).slice(0, SHOWN), now: Date.now() });
    }

    /** Open a file with its default app. */
    open(uri) {
        Gio.AppInfo.launch_default_for_uri_async(uri, global.create_app_launch_context(0, -1), null, (_o, res) => {
            try {
                Gio.AppInfo.launch_default_for_uri_finish(res);
            } catch (e) {
                console.warn(`[Kiwi] could not open ${uri}:`, e.message);
            }
        });
    }
}
