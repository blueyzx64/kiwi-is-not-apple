// SPDX-License-Identifier: GPL-3.0-or-later
// "Hide title bars of maximized windows" for the windows Mutter draws a title bar for (X11
// windows with a frame): while such a window is maximized or full screen, its _MOTIF_WM_HINTS
// say "no decorations", which Mutter honours live; the hints it had come back when it is not
// maximized any more, when the option goes off and when Kiwi is disabled. The property is set
// with the xprop tool (there is no Mutter API for it); without xprop nothing happens.
// Client-side windows (GTK header bars, libadwaita) are never touched here.
//
// Shell API: Meta.Window (decorated, get_client_type, get_description = the X window id of an X11
// window), global.display 'window-created', Gio.Subprocess.

import Gio from 'gi://Gio';
import Meta from 'gi://Meta';

import { CleanupRegistry } from '../../lib/disposables.js';
import { hidesFrameTitlebar, motifArgs, parseMotifHints, undecoratedHints } from './model.js';

const isX11 = win => win.get_client_type() === Meta.WindowClientType.X11;

const run = (argv, flags = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE) => {
    try {
        return Gio.Subprocess.new(argv, flags);
    } catch (e) {
        return null;    // no xprop installed
    }
};

export class X11Titlebars {
    /**
     * @param {import('../../lib/settings.js').KiwiSettings} ks
     * @param {CleanupRegistry} cleanup
     */
    constructor(ks, cleanup) {
        this._ks = ks;
        this._cleanup = cleanup;
        this._hidden = new Map();   // Meta.Window -> {xid, original: ?number[]}
        this._pending = new Set();  // windows whose hints are being read
        this._tracked = new Map();  // Meta.Window -> CleanupRegistry
    }

    enable() {
        const cleanup = this._cleanup;
        cleanup.add(() => this._stop());
        cleanup.connect(global.display, 'window-created', (_d, win) => this._track(win));
        for (const actor of global.get_window_actors())
            this._track(actor.meta_window);
        this._ks.watch('hide-maximized-titlebars', () => this.sync());
    }

    sync() {
        for (const win of this._tracked.keys())
            this._sync(win);
    }

    _track(win) {
        if (this._tracked.has(win) || !isX11(win))
            return;
        const reg = new CleanupRegistry();
        this._tracked.set(win, reg);
        for (const sig of ['notify::maximized-horizontally', 'notify::maximized-vertically', 'notify::fullscreen'])
            reg.connect(win, sig, () => this._sync(win));
        reg.connect(win, 'unmanaged', () => {
            reg.dispose();
            this._tracked.delete(win);
            this._hidden.delete(win);
        });
        this._sync(win);
    }

    _sync(win) {
        const want = hidesFrameTitlebar({
            enabled: this._ks.bool('hide-maximized-titlebars'),
            serverSide: win.decorated,
            x11: isX11(win),
            maximized: win.maximized_horizontally && win.maximized_vertically,
            fullscreen: win.is_fullscreen(),
        });
        if (want && !this._hidden.has(win))
            this._hide(win);
        else if (!want && this._hidden.has(win))
            this._restore(win);
    }

    async _hide(win) {
        if (this._pending.has(win))
            return;
        this._pending.add(win);
        const xid = win.get_description().split(' ')[0];
        const read = run(['xprop', '-id', xid, '_MOTIF_WM_HINTS']);
        try {
            const [out] = read ? await read.communicate_utf8_async(null, null) : [null];
            if (!read)
                return;
            this._hidden.set(win, { xid, original: parseMotifHints(out) });
            run(motifArgs(xid, undecoratedHints(this._hidden.get(win).original)), Gio.SubprocessFlags.STDERR_SILENCE);
        } catch (e) {
            console.error('[Kiwi] could not read the window hints:', e);
        } finally {
            this._pending.delete(win);
            // The window may have changed while the hints were read
            if (this._tracked.has(win))
                this._sync(win);
        }
    }

    _restore(win) {
        const entry = this._hidden.get(win);
        this._hidden.delete(win);
        if (entry)
            run(motifArgs(entry.xid, entry.original), Gio.SubprocessFlags.STDERR_SILENCE);
    }

    _stop() {
        for (const win of [...this._hidden.keys()])
            this._restore(win);
        for (const reg of this._tracked.values())
            reg.dispose();
        this._tracked.clear();
    }
}
