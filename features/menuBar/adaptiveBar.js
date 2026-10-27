// SPDX-License-Identifier: GPL-3.0-or-later
// The transparent menu bar of macOS 26 (research ST F20, BM "Redesigned menu bar"): no
// background over the wallpaper, with text and icons dark or light by the wallpaper's
// brightness under the bar, and the solid bar back as soon as a window touches it or is
// maximized.
//
// Style classes on Main.panel (rules in style.css):
//   kiwi-menubar-clear                 transparent (else the theme or glass fill shows; the
//                                      glass fill is held off through a Glass handle)
//   kiwi-menubar-on-light / -on-dark   which text the wallpaper band needs
//   kiwi-menubar-scrim                 a soft gradient for a mixed band (legibility)
//
// Wallpaper: the picture of org.gnome.desktop.background (picture-uri, or picture-uri-dark
// in dark style; the picture an XML day/night background shows now, measured again when it
// changes) is decoded once, in a helper process (wallpaperProbe.js, so a huge picture never
// stalls the Shell), and the band under the bar is measured (model.js wallpaperBand +
// bandLuminance). The text colour is judged on the worst part of the band (chooseText); a
// band where neither colour is readable keeps the solid bar. The result is cached per picture
// and placement, and sampled again only when the background settings, the style or the
// monitors change.
//
// Windows: the bar is solid while a window on the active workspace of the primary monitor
// touches the top of the work area or is maximized. Windows are checked when they appear,
// change state, finish a move or resize, or the workspace changes; never per frame (a move in
// progress is checked when the grab ends).
//
// Shell API: Main.panel, Main.layoutManager (primaryMonitor, panelBox, getWorkAreaForMonitor),
// Main.overview, global.display grab-op-begin/end, Gio.Subprocess.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { WindowState } from '../../core/windowState.js';
import { isUserFacing } from '../../core/desktopModel.js';
import { Glass } from '../../lib/glass.js';
import { isXmlBackground, parseHexColor, wallpaperSource, xmlSlideAt } from '../../lib/wallpaperModel.js';
import { barLook, chooseText, relativeLuminance, touchesBar } from './model.js';
import { readText } from './systemInfo.js';

Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');

const PROBE = GLib.filename_from_uri(import.meta.url.replace(/[^/]*$/, 'wallpaperProbe.js'))[0];

const CLASSES = Object.freeze({
    clear: 'kiwi-menubar-clear', light: 'kiwi-menubar-on-light', dark: 'kiwi-menubar-on-dark',
    scrim: 'kiwi-menubar-scrim',
});
const BG_KEYS = ['picture-uri', 'picture-uri-dark', 'picture-options', 'primary-color'];

export class AdaptiveBar {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._look = null;
        this._text = null;           // {darkText, scrim, solid} of the current wallpaper band
        this._cache = new Map();     // picture key -> {mean, spread, low, high}
        this._slideToken = 0;        // timer to the next picture of an XML background
        this._windowAtTop = false;
        this._grabbing = false;
        this._idleToken = 0;
        this._windows = new Map();   // Meta.Window -> CleanupRegistry tokens
    }

    /** 'clear' | 'solid' | 'overview' (tests, the harness) */
    get look() {
        return this._look;
    }

    /** {darkText, scrim, solid} or null before the first sample (tests, the harness) */
    get text() {
        return this._text;
    }

    get windowAtTop() {
        return this._windowAtTop;
    }

    start() {
        const cleanup = this._cleanup;
        const panel = Main.panel;
        // The Shell destroys the panel on exit without disabling extensions: stop touching it
        this._panelGone = false;
        cleanup.connect(panel, 'destroy', () => (this._panelGone = true));
        cleanup.add(() => {
            for (const c of Object.values(CLASSES))
                panel.remove_style_class_name(c);
        });

        this._desktop = this._ctx.desktop.acquire(cleanup);
        this._bg = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
        this._iface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        this._cancellable = new Gio.Cancellable();
        cleanup.add(() => this._cancellable.cancel());

        const resample = () => this._sample();
        for (const key of BG_KEYS)
            cleanup.connect(this._bg, `changed::${key}`, resample);
        cleanup.connect(this._iface, 'changed::color-scheme', resample);
        cleanup.connect(Main.layoutManager, 'monitors-changed', resample);
        cleanup.connect(Main.layoutManager.panelBox, 'notify::height', resample);

        // The panel's glass fill (liquid-glass) must give way while the bar is clear: a fill
        // shows only while every handle on it is visible. 'blur' draws nothing of its own, so
        // with liquid-glass off this handle changes nothing.
        this._glass = Glass.attach(panel, { surface: 'panel', layers: 'blur' });
        cleanup.add(() => this._glass.destroy());
        // Reduce Transparency, Increase Contrast or high contrast: always the solid bar
        this._opaque = false;
        Glass.watch(cleanup, ({ env }) => {
            this._opaque = !!(env.opaque || env.highContrast);
            this._apply();
        });
        cleanup.connect(Main.overview, 'showing', () => this._apply());
        cleanup.connect(Main.overview, 'hidden', () => this._checkWindows());

        // Windows touching the bar
        const events = this._ctx.events;
        events.on('window-added', ({ window }) => this._watch(window.id), cleanup);
        events.on('window-removed', () => this._queueCheck(), cleanup);
        events.on('window-changed', ({ fields }) => {
            if (fields.some(f => f === 'minimized' || f === 'maximized' || f === 'fullscreen' ||
                f === 'workspace' || f === 'monitor'))
                this._queueCheck();
        }, cleanup);
        events.on('workspaces-changed', () => this._queueCheck(), cleanup);
        events.on('work-area-changed', () => this._queueCheck(), cleanup);
        cleanup.connect(global.display, 'grab-op-begin', () => (this._grabbing = true));
        cleanup.connect(global.display, 'grab-op-end', () => {
            this._grabbing = false;
            this._queueCheck();
        });
        WindowState.watch(cleanup, () => this._queueCheck());
        for (const info of this._desktop.model.windows({ userFacing: false }))
            this._watch(info.id);
        cleanup.add(() => this._windows.clear());

        this._checkWindows();
        this._sample();
    }

    // ---- windows ----------------------------------------------------------------------------

    _watch(id) {
        const win = this._desktop.metaWindow(id);
        if (!win || this._windows.has(win))
            return;
        // A programmatic move (keyboard tiling, maximize) has no grab; a drag is checked at its end
        const onMove = () => {
            if (!this._grabbing)
                this._queueCheck();
        };
        const tokens = [
            this._cleanup.connect(win, 'position-changed', onMove),
            this._cleanup.connect(win, 'size-changed', onMove),
        ];
        tokens.push(this._cleanup.connect(win, 'unmanaged', () => {
            tokens.forEach(t => this._cleanup.release(t));
            this._windows.delete(win);
        }));
        this._windows.set(win, tokens);
        this._queueCheck();
    }

    _queueCheck() {
        if (this._idleToken)
            return;
        this._idleToken = this._cleanup.idle(() => {
            this._idleToken = 0;
            this._checkWindows();
        }, { name: 'menu bar window check' });
    }

    _checkWindows() {
        const lm = Main.layoutManager;
        const primary = lm.primaryIndex;
        const area = lm.getWorkAreaForMonitor(primary);
        const active = global.workspace_manager.get_active_workspace_index();
        let atTop = false;
        for (const info of this._desktop.model.windows({ workspace: active, monitor: primary, minimized: false })) {
            if (!isUserFacing(info))
                continue;
            const win = this._desktop.metaWindow(info.id);
            if (!win || WindowState.has(win, 'staged') || win.is_hidden())
                continue;
            if (info.maximized || info.fullscreen || touchesBar(win.get_frame_rect(), area)) {
                atTop = true;
                break;
            }
        }
        this._windowAtTop = atTop;
        this._apply();
    }

    // ---- look -------------------------------------------------------------------------------

    _apply() {
        if (this._panelGone)
            return;
        const panel = Main.panel;
        const look = barLook({
            transparent: true,
            windowAtTop: this._windowAtTop,
            overview: Main.overview.visible,
            solidOnly: this._opaque || !!St.Settings.get().high_contrast,
        });
        this._look = look;
        const clear = look === 'clear' && !!this._text && !this._text.solid;
        const set = (cls, on) => (on ? panel.add_style_class_name(cls) : panel.remove_style_class_name(cls));
        set(CLASSES.clear, clear);
        set(CLASSES.light, clear && this._text.darkText);
        set(CLASSES.dark, clear && !this._text.darkText);
        set(CLASSES.scrim, clear && this._text.scrim);
        this._glass?.setVisible(!clear);
    }

    // ---- wallpaper --------------------------------------------------------------------------

    async _sample() {
        this._cancellable.cancel();
        this._cleanup.release(this._slideToken);
        this._slideToken = 0;
        const cancellable = new Gio.Cancellable();
        this._cancellable = cancellable;
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;
        // The same picture the Shell shows (and glass tints from): lib/wallpaperModel.js
        const option = this._bg.get_string('picture-options');
        const source = wallpaperSource({
            pictureUri: this._bg.get_string('picture-uri'),
            pictureUriDark: this._bg.get_string('picture-uri-dark'),
            options: option,
            primaryColor: this._bg.get_string('primary-color'),
            colorScheme: this._iface.get_string('color-scheme'),
        });
        const band = Main.layoutManager.panelBox.height || Main.panel.height;
        let stats = null;
        if (source.kind === 'file') {
            try {
                const slide = await this._resolve(source.uri, cancellable);
                const key = `${slide.uri}|${option}|${monitor.width}x${monitor.height}|${band}`;
                stats = this._cache.get(key);
                if (!stats) {
                    stats = await this._measure(slide.uri, option, monitor, band, cancellable);
                    if (cancellable.is_cancelled())
                        return;
                    this._cache.set(key, stats);
                }
                if (slide.until !== null) {
                    // A day/night background: measure the next picture when it comes up
                    this._slideToken = this._cleanup.timeout(Math.max(1000, Math.ceil(slide.until * 1000)), () => {
                        this._slideToken = 0;
                        this._sample();
                    }, { name: 'menu bar wallpaper slide' });
                }
            } catch (e) {
                if (!e.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    console.warn(`[Kiwi] menu bar: cannot read the wallpaper ${source.uri}: ${e.message}`);
                stats = null;
            }
            if (cancellable.is_cancelled())
                return;
        }
        this._text = chooseText(stats ?? this._colorStats(source.color), this._text?.darkText ?? null);
        this._apply();
    }

    // The background colour (picture-options 'none', bars, or no readable picture)
    _colorStats(color = null) {
        const [r, g, b] = color ?? parseHexColor(this._bg.get_string('primary-color')) ?? [0, 0, 0];
        const mean = relativeLuminance(r, g, b);
        return { mean, spread: 0, low: mean, high: mean };
    }

    // The picture to measure: the file itself, or the one an XML day/night background shows now
    async _resolve(uri, cancellable) {
        if (!isXmlBackground(uri))
            return { uri, until: null };
        const xml = Gio.File.new_for_uri(uri);
        const slide = xmlSlideAt(await readText(xml.get_path(), cancellable) ?? '', new Date());
        if (!slide)
            throw new Error('the background lists no picture');
        const file = GLib.path_is_absolute(slide.path) ? Gio.File.new_for_path(slide.path)
            : xml.get_parent().resolve_relative_path(slide.path);
        return { uri: file.get_uri(), until: slide.until };
    }

    // Luminance of the band under the bar, measured by wallpaperProbe.js in its own process;
    // null when the picture does not reach the bar
    async _measure(uri, option, monitor, band, cancellable) {
        const proc = new Gio.Subprocess({
            argv: ['gjs', '-m', PROBE, Gio.File.new_for_uri(uri).get_path(), option,
                String(monitor.width), String(monitor.height), String(band)],
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });
        proc.init(null);
        const stop = cancellable.connect(() => proc.force_exit());
        try {
            const [out, err] = await proc.communicate_utf8_async(null, cancellable);
            if (!proc.get_successful())
                throw new Error(err?.trim() || 'the picture cannot be decoded');
            return JSON.parse(out);
        } finally {
            cancellable.disconnect(stop);
        }
    }
}
