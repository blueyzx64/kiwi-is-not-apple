// SPDX-License-Identifier: GPL-3.0-or-later
// Run as its own process (gjs -m wallpaperProbe.js <path> <option> <monitor-w> <monitor-h> <band>):
// decodes a wallpaper and prints the luminance of the band under the menu bar as JSON
// ({mean, spread, low, high}, or null when the picture does not reach the bar).
//
// Why a process: GdkPixbuf decodes PNG and JPEG on the thread that reads them, whatever the
// target size, so a 9000 px wallpaper stalled the Shell for 650 ms. In a helper the Shell's
// main loop never waits (adaptiveBar.js starts it with Gio.Subprocess and awaits the pipe).

import GdkPixbuf from 'gi://GdkPixbuf';
import System from 'system';

import { PROBE_WIDTH, bandLuminance, decodesByRatio, wallpaperBand } from './model.js';

const [path, option, mw, mh, band] = ARGV; // eslint-disable-line no-undef
const monitor = { width: Number(mw), height: Number(mh) };
try {
    // Placements by ratio read a small decode; centred and tiled pictures use their real pixels
    const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, decodesByRatio(option) ? PROBE_WIDTH : -1, -1, true);
    const rect = wallpaperBand({ width: pixbuf.get_width(), height: pixbuf.get_height() },
        monitor, option, Number(band));
    const stats = rect && bandLuminance(pixbuf.read_pixel_bytes().toArray(),
        { rowstride: pixbuf.get_rowstride(), channels: pixbuf.get_n_channels() }, rect);
    print(JSON.stringify(stats));
} catch (e) {
    printerr(e.message);
    System.exit(1);
}
