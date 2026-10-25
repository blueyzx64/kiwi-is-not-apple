// SPDX-License-Identifier: GPL-3.0-or-later
// Dynamically adjusts top panel transparency based on window and overview state.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import GdkPixbuf from 'gi://GdkPixbuf';
import Clutter from 'gi://Clutter';

import { Glass } from '../lib/glass.js';
import { CleanupRegistry } from '../lib/disposables.js';

let settings;
let enabled = false;
let windowSignals = [];
let settingsSignals = [];
let interfaceSettings;
let originalStyle;
let isUpdatingStyle = false;
let interfaceSettingsSignal;
let timeoutId;
let safetyIntervalId;
let lastForcedAlpha = null; // remember last alpha decided by logic (touch/fullscreen)
let lastFullscreenState = false; // edge-detect fullscreen state changes
let overviewHiding = false; // overview still 'visible' but animating out
let lastPanelColor = null; // last [r,g,b] read from a valid theme node
let noTransitionIdleId = 0; // idle source that drops kiwi-panel-no-transition
let colorFixIdleId = 0; // one-shot idle in applyPanelColorFix
let themeUpdateIdleId = 0; // one-shot idle in forceThemeUpdate
let colorSchemeIdleId = 0; // one-shot idle after color-scheme change
let themeChangedIdleId = 0; // one-shot idle after a stylesheet swap
let ownBackground = ''; // background declaration we keep on the panel
let panelStyleSignal;
let themeContextSignal;

// Adaptive foreground state
let bgSettings;
let bgSignals = [];
let wallpaperLuminance = 0;
let iconTheme;
let monochromeIcons = new Map(); // gicon string -> 'light' | 'dark' | null
let contentIcons = new WeakMap(); // St.ImageContent | Gio.BytesIcon -> 'light' | 'dark' | null

const SAMPLE_SIZE = 32; // wallpaper is downscaled to this before sampling
const SAMPLE_ROWS = 4;  // top rows only — that's what sits behind the panel
const LIGHT_THRESHOLD = 0.45;
const DARKEN_EFFECT = 'kiwi-tray-darken';
const LIGHTEN_EFFECT = 'kiwi-tray-lighten';
const ICON_SAMPLE_SIZE = 24;
const ICON_SATURATION_MAX = 0.15;    // above this the icon carries real colour
const ICON_LUMINANCE_MIN = 0.6;      // above this the icon counts as light
const ICON_LUMINANCE_MAX_DARK = 0.4; // below this it counts as dark
const ICON_SPREAD_MAX = 0.15;        // luminance std dev; above this it has its own contrast

// Blur state. The blur itself (and its tint, Liquid Glass tiers, legacy panel-blur key,
// repaint workarounds) is lib/glass.js; this module only says when the panel is see-through.
let blurHandle = null;
let blurWanted = false;   // last visibility updatePanelStyle asked for
let glassRegistry = null;

function createBlurEffect() {
    destroyBlurEffect();

    const panel = Main.panel;
    const panelBox = panel.get_parent();
    if (!panelBox)
        return;

    // layers: 'blur' - the panel keeps its own (adjustable) background colour
    blurHandle = Glass.attach(panel, {
        surface: 'panel',
        parent: panelBox,
        layers: 'blur',
        name: 'kiwi-panel-blur',
    });
    blurHandle.setVisible(blurWanted);
}

function destroyBlurEffect() {
    blurHandle?.destroy();
    blurHandle = null;
}

function updateBlurVisibility(visible) {
    blurWanted = visible;
    blurHandle?.setVisible(visible);
}

// --- Adaptive foreground helpers ---
// What sits behind the panel foreground is the panel's own background painted at
// the current opacity over the wallpaper. Measure both, blend them, and force
// the foreground the other way. Neither direction can be left to the theme: a
// dark theme keeps white text over a light wallpaper, and a light one (the Light
// Style extension) keeps dark text over a dark wallpaper.

function _wallpaperPath() {
    const dark = interfaceSettings.get_string('color-scheme') === 'prefer-dark';
    let uri = dark ? bgSettings.get_string('picture-uri-dark') : '';
    if (!uri) uri = bgSettings.get_string('picture-uri');
    if (!uri) return null;
    return Gio.File.new_for_uri(uri).get_path();
}

function updateWallpaperLightness() {
    const path = _wallpaperPath();
    if (!path) {
        wallpaperLuminance = 0;
        return;
    }

    try {
        // preserve_aspect_ratio false: SAMPLE_ROWS is then a fixed fraction of
        // the image height regardless of its dimensions.
        const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, SAMPLE_SIZE, SAMPLE_SIZE, false);
        const pixels = pixbuf.get_pixels();
        const stride = pixbuf.get_rowstride();
        const channels = pixbuf.get_n_channels();
        const width = pixbuf.get_width();
        const rows = Math.min(SAMPLE_ROWS, pixbuf.get_height());

        let sum = 0;
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < width; x++) {
                const i = y * stride + x * channels;
                sum += (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255;
            }
        }
        wallpaperLuminance = sum / (rows * width);
    } catch (_e) {
        // XML slideshows and unreadable files: keep the theme foreground
        wallpaperLuminance = 0;
    }
}

// Tray icons come from apps as raster images, so CSS can't recolour them.
// Brightness -1 maps every pixel to black and +1 to white, both leaving alpha
// alone, so a monochrome icon can be pushed either way. A coloured icon would
// just become a blob, so only icons that measure as monochrome get an effect.
// Returns 'light', 'dark' or null when the icon must be left alone.
function _measureIcon(pixbuf) {
    const pixels = pixbuf.get_pixels();
    const stride = pixbuf.get_rowstride();
    const channels = pixbuf.get_n_channels();
    const width = pixbuf.get_width();
    const height = pixbuf.get_height();

    let saturation = 0;
    let luminance = 0;
    let luminanceSq = 0;
    let count = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * stride + x * channels;
            if (pixels[i + 3] < 30) continue; // ignore near-transparent pixels

            const r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);

            const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            saturation += max === 0 ? 0 : (max - min) / max;
            luminance += l;
            luminanceSq += l * l;
            count++;
        }
    }

    if (!count || (saturation / count) >= ICON_SATURATION_MAX) return null;

    const mean = luminance / count;
    // A dark glyph on a white disc (ChatGPT) or a white logo with dark detail
    // (Discord) is grey too, but one flat colour would erase its own contrast.
    // A true monochrome icon is shaped by alpha alone, so its spread is ~0.
    if (Math.sqrt(luminanceSq / count - mean * mean) > ICON_SPREAD_MAX) return null;
    if (mean > ICON_LUMINANCE_MIN) return 'light';
    if (mean < ICON_LUMINANCE_MAX_DARK) return 'dark';
    return null; // mid grey: pushing it either way is a coin flip
}

function _iconTone(gicon) {
    if (!gicon) return null;

    // AppIndicator wraps file icons in an EmblemedIcon that deliberately breaks
    // to_string(); the inner icon resolves and keys the cache properly.
    if (gicon instanceof Gio.EmblemedIcon)
        gicon = gicon.get_icon();

    // A BytesIcon (Better Tray Icons pixmaps and tinted SVGs) has no string
    // form, so it is keyed on the object, the way _contentTone() keys content.
    const key = gicon.to_string();
    const cache = key ? monochromeIcons : contentIcons;
    const id = key ?? gicon;
    if (cache.has(id))
        return cache.get(id);

    let tone = null;
    try {
        const info = iconTheme.lookup_by_gicon(gicon, ICON_SAMPLE_SIZE, St.IconLookupFlags.FORCE_SIZE);
        const pixbuf = info?.load_icon();
        // Without an alpha channel the icon is a solid rectangle — recolouring
        // it would produce exactly the flat patch this check exists to avoid.
        if (pixbuf?.get_has_alpha())
            tone = _measureIcon(pixbuf);
    } catch (_e) {
        // Unresolvable icon: leave it alone
    }

    cache.set(id, tone);
    return tone;
}

// Indicators that publish IconPixmap over D-Bus instead of an icon name (the
// Nextcloud client, for one) have nothing to look up: AppIndicator paints the
// pixmap straight into an St.ImageContent and leaves the gicon behind. That
// content is a Gio.LoadableIcon, so the image actually on screen can be read
// back and measured with the same test — AppIndicator itself loads it this way
// to build emblems. A new St.ImageContent is created for every pixmap update,
// so keying the cache on the object both caches and invalidates itself.
function _contentTone(content) {
    if (contentIcons.has(content))
        return contentIcons.get(content);

    let tone = null;
    try {
        const [stream] = content.load(ICON_SAMPLE_SIZE, null);
        const pixbuf = GdkPixbuf.Pixbuf.new_from_stream(stream, null);
        if (pixbuf.get_has_alpha())
            tone = _measureIcon(pixbuf);
    } catch (_e) {
        // Unreadable content: leave it alone
    }

    contentIcons.set(content, tone);
    return tone;
}

// Better Tray Icons gives its icons the generic system-status-icon class and
// drops even that under its custom icon style, so inside its inline tray box
// every icon counts.
function _trayIcons() {
    const icons = [];
    const walk = (actor, inBti) => {
        for (const child of actor.get_children()) {
            if (child instanceof St.Icon &&
                (inBti || child.has_style_class_name('appindicator-icon') || child.has_style_class_name('tray-icon')))
                icons.push(child);
            else
                walk(child, inBti || (child instanceof St.Widget && child.has_style_class_name('tray-visible-box')));
        }
    };
    walk(Main.panel, false);
    return icons;
}

// mode is 'darken' on a light background, 'lighten' on a dark one, or null to
// leave every icon as its app painted it.
function updateTrayIconInversion(mode) {
    for (const icon of _trayIcons()) {
        // An icon painted from a D-Bus pixmap carries its image in `content`,
        // and the gicon left over from an earlier update may not match it, so
        // measure whichever of the two is the image actually on screen.
        const tone = mode ? (icon.content
            ? _contentTone(icon.content)
            : _iconTone(icon.gicon)) : null;

        // Only push an icon away from the background it sits on.
        const wanted = (mode === 'darken' && tone === 'light') ? DARKEN_EFFECT
            : (mode === 'lighten' && tone === 'dark') ? LIGHTEN_EFFECT
            : null;

        for (const name of [DARKEN_EFFECT, LIGHTEN_EFFECT]) {
            if (name !== wanted && icon.get_effect(name))
                icon.remove_effect_by_name(name);
        }

        if (wanted && !icon.get_effect(wanted)) {
            const effect = new Clutter.BrightnessContrastEffect({ name: wanted });
            effect.set_brightness(wanted === DARKEN_EFFECT ? -1.0 : 1.0);
            icon.add_effect(effect);
        }
    }
}

// St hands out Cogl.Color, whose components are 0..255 bytes.
function _luminance(color) {
    return (0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue) / 255;
}

function _panelLuminance() {
    return _luminance(Main.panel.get_theme_node().get_background_color());
}

// In the overview the panel paints nothing and the shell theme styles its own
// foreground for the overview backdrop, so hand it back untouched.
function clearForegroundContrast() {
    const panel = Main.panel;
    panel.remove_style_class_name('kiwi-panel-dark-text');
    panel.remove_style_class_name('kiwi-panel-light-text');
    updateTrayIconInversion(null);
}

function updateForegroundContrast(opacity, panelLuminance = _panelLuminance()) {
    const panel = Main.panel;
    const behind = opacity * panelLuminance + (1 - opacity) * wallpaperLuminance;
    const dark = behind > LIGHT_THRESHOLD;

    // Both directions need forcing: a light shell theme paints the panel text
    // dark, which disappears once a transparent panel exposes a dark wallpaper.
    panel.remove_style_class_name(dark ? 'kiwi-panel-light-text' : 'kiwi-panel-dark-text');
    panel.add_style_class_name(dark ? 'kiwi-panel-dark-text' : 'kiwi-panel-light-text');

    // Indicators that appear later are picked up by the periodic safety check.
    updateTrayIconInversion(settings.get_boolean('panel-invert-tray-icons')
        ? (dark ? 'darken' : 'lighten')
        : null);
}

// Panel color fix helper
// The class only sets the panel's *theme* background; the colour that actually
// shows comes from the inline style updatePanelStyle() builds out of
// get_background_color(). So toggling the class changes nothing until the stale
// inline style is dropped and the style recomputed — that is why the old
// behaviour needed an overview trip (which clears the inline style) to show up.
function applyPanelColorFix() {
    const panel = Main.panel;

    if (settings.get_boolean('panel-color-inherit')) {
        panel.add_style_class_name('kiwi-panel-color-inherit');
    } else {
        panel.remove_style_class_name('kiwi-panel-color-inherit');
    }

    // Clear the inline background so the theme node reports the class colour
    // instead of the rgba() we last wrote, then rebuild it from that reading.
    setPanelBackground('');
    if (colorFixIdleId)
        GLib.Source.remove(colorFixIdleId);
    colorFixIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        colorFixIdleId = 0;
        if (enabled) updatePanelStyle(lastForcedAlpha);
        return GLib.SOURCE_REMOVE;
    });
}

// Transparency is off: hand the panel back to whatever styled it before us.
// Baking in a colour read from the theme node fights the shell theme and any
// other extension that paints the panel inline (e.g. Light Shell).
function restorePanelStyle() {
    const panel = Main.panel;
    ownBackground = '';
    panel.set_style(originalStyle);
    panel.queue_redraw();
}

function _isFullscreenActive() {
    return global.workspace_manager
        .get_active_workspace()
        .list_windows()
        .some(win =>
            win.showing_on_its_workspace() &&
            !win.is_hidden() &&
            win.is_fullscreen());
}

// The shell owns Main.panel.style too: Overview._gestureEnd() replaces it with
// `transition-duration: Nms;` and _hideDone() nulls it, both wiping our
// background and exposing the opaque theme colour. Keep what the shell wrote
// and put our declaration back, synchronously, so no frame paints without it.
function setPanelBackground(declaration) {
    const panel = Main.panel;
    ownBackground = declaration;

    const current = panel.get_style() ?? '';
    const base = current.replace(/background-color:[^;]*;\s*/g, '');
    const wanted = `${base}${declaration}`;
    if (current !== wanted) {
        panel.set_style(wanted);
    }
}

function _cancelNoTransitionIdle() {
    if (noTransitionIdleId) {
        GLib.Source.remove(noTransitionIdleId);
        noTransitionIdleId = 0;
    }
}

function updatePanelStyle(alpha = null) {
    const panel = Main.panel;
    if (isUpdatingStyle) return;
    isUpdatingStyle = true;
    
    try {
        // Use CSS class-based approach for fullscreen state to avoid oscillation
        const fullscreenNow = _isFullscreenActive();
        
        // Edge-detect fullscreen state changes
        if (fullscreenNow !== lastFullscreenState) {
            lastFullscreenState = fullscreenNow;
            
            if (fullscreenNow) {
                // Add CSS class for fullscreen - stylesheet.css handles opaque background
                panel.add_style_class_name('kiwi-panel-fullscreen');
                lastForcedAlpha = 1.0;
            } else {
                // Remove fullscreen class, restore transparency handling
                panel.remove_style_class_name('kiwi-panel-fullscreen');
                lastForcedAlpha = null;
            }
        }
        
        // In overview, always transparent — hide blur. The hide animation is
        // excluded so the panel takes its final style up front and cross-fades
        // with the overview instead of jumping once the exit finishes.
        if (Main.overview.visible && !overviewHiding) {
            // Keep the theme colour in the style. Reading it back is how the
            // next update learns it, and `transparent` reads back as black.
            const { red: r, green: g, blue: b } = panel.get_theme_node().get_background_color();
            setPanelBackground(`background-color: rgba(${r}, ${g}, ${b}, 0) !important;`);
            updateBlurVisibility(false);
            clearForegroundContrast();
            panel.queue_redraw();
            return;
        }

        // If fullscreen is active, CSS class handles it - skip inline style
        if (fullscreenNow) {
            // Clear any inline style to let CSS rule take effect
            setPanelBackground('');
            updateBlurVisibility(false);
            updateForegroundContrast(1.0);
            panel.queue_redraw();
            return;
        }

        if (!settings.get_boolean('panel-transparency')) {
            updateBlurVisibility(false);
            updateForegroundContrast(1.0);
            restorePanelStyle();
            return;
        }

        // Get theme colors for non-fullscreen states. While the overview is
        // hiding, the theme node still reflects :overview (transparent, reads
        // as black), so reuse the last valid reading instead.
        const themeNode = panel.get_theme_node();
        const backgroundColor = themeNode.get_background_color();
        let [r, g, b] = [backgroundColor.red, backgroundColor.green, backgroundColor.blue];
        if (overviewHiding && lastPanelColor)
            [r, g, b] = lastPanelColor;
        else if (!overviewHiding)
            lastPanelColor = [r, g, b];

        if (alpha !== null) {
            lastForcedAlpha = alpha;
        }
        // High contrast (Glass opaque tier): a solid panel
        const opacity = blurHandle?.tier === 'opaque'
            ? 1.0 : lastForcedAlpha ?? settings.get_int('panel-transparency-level') / 100;
        const newStyle = `background-color: rgba(${r}, ${g}, ${b}, ${opacity}) !important;`;
        
        // Show/hide blur regardless of whether style string changed
        updateBlurVisibility(opacity < 1.0);
        updateForegroundContrast(opacity, _luminance({ red: r, green: g, blue: b }));

        if (ownBackground !== newStyle) {
            setPanelBackground(newStyle);
            panel.queue_redraw();
        }
    } finally {
        isUpdatingStyle = false;
    }
}

function checkWindowTouchingPanel() {
    if (!settings.get_boolean('panel-transparency') || 
        !settings.get_boolean('panel-opaque-on-window')) {
        // Even if opaque-on-window is disabled, fullscreen should force opaque
        if (_isFullscreenActive()) {
            updatePanelStyle(1.0);
        } else {
            // Clear any stale forced alpha (e.g., from prior fullscreen)
            lastForcedAlpha = null;
            updatePanelStyle(null);
        }
        return;
    }

    // A maximized window fills the work area, which starts right below the
    // panel, so it always touches it — no geometry check needed.
    const windowTouching = global.workspace_manager
        .get_active_workspace()
        .list_windows()
        .some(win =>
            win.is_on_primary_monitor() &&
            win.showing_on_its_workspace() &&
            !win.is_hidden() &&
            win.get_window_type() !== Meta.WindowType.DESKTOP &&
            !win.skip_taskbar &&
            win.maximized_horizontally &&
            win.maximized_vertically
        );
    if (_isFullscreenActive()) {
        updatePanelStyle(1.0);
    } else {
        // Clear before updating: updatePanelStyle(null) falls back to the forced
        // alpha, so a stale 1.0 would paint one opaque frame first.
        if (!windowTouching) {
            lastForcedAlpha = null;
        }
        updatePanelStyle(windowTouching ? 1.0 : null);
    }
}

function handleWindowSignals(connect = true) {
    if (!connect) {
        windowSignals.forEach(({ actor, signals }) => {
            signals.forEach(signalId => actor.disconnect(signalId));
        });
        windowSignals = [];
        return;
    }

    const workspace = global.workspace_manager.get_active_workspace();
    const workspaceSignals = [];

    workspaceSignals.push(workspace.connect('window-added', (ws, win) => {
        connectWindowSignals(win);
        checkWindowTouchingPanel();
    }));

    workspaceSignals.push(workspace.connect('window-removed', (ws, win) => {
        disconnectWindowSignals(win);
        checkWindowTouchingPanel();
    }));

    windowSignals.push({ actor: workspace, signals: workspaceSignals });

    workspace.list_windows().forEach(win => {
        connectWindowSignals(win);
    });
}

function connectWindowSignals(metaWindow) {
    const actorSignals = [];

    actorSignals.push(metaWindow.connect('position-changed', () => {
        checkWindowTouchingPanel();
    }));

    actorSignals.push(metaWindow.connect('size-changed', () => {
        checkWindowTouchingPanel();
    }));

    // Track state changes (fullscreen, maximized, etc.)
    actorSignals.push(metaWindow.connect('notify::fullscreen', () => {
        checkWindowTouchingPanel();
    }));
    actorSignals.push(metaWindow.connect('notify::maximized-horizontally', () => {
        checkWindowTouchingPanel();
    }));
    actorSignals.push(metaWindow.connect('notify::maximized-vertically', () => {
        checkWindowTouchingPanel();
    }));

    actorSignals.push(metaWindow.connect('unmanaged', () => {
        disconnectWindowSignals(metaWindow);
        checkWindowTouchingPanel();
    }));

    windowSignals.push({ actor: metaWindow, signals: actorSignals });
}

function disconnectWindowSignals(metaWindow) {
    const index = windowSignals.findIndex(item => item.actor === metaWindow);
    if (index !== -1) {
        const { signals } = windowSignals[index];
        signals.forEach(signalId => {
            metaWindow.disconnect(signalId);
        });
        windowSignals.splice(index, 1);
    }
}

function setupSignals() {
    settingsSignals = [
        settings.connect('changed::panel-transparency', () => {
            if (settings.get_boolean('panel-transparency')) {
                checkWindowTouchingPanel();
            } else {
                lastForcedAlpha = null;
                updateBlurVisibility(false);
                restorePanelStyle();
            }
        }),
        settings.connect('changed::panel-transparency-level', () => {
            updatePanelStyle(null);
        }),
        settings.connect('changed::panel-opaque-on-window', () => {
            checkWindowTouchingPanel();
        }),
        settings.connect('changed::panel-color-inherit', () => {
            applyPanelColorFix();
        }),
        settings.connect('changed::panel-invert-tray-icons', () => {
            updatePanelStyle(null);
        })
    ];

    handleWindowSignals(true);

    windowSignals.push({
        actor: global.window_manager,
        signals: [
            global.window_manager.connect('switch-workspace', () => {
                checkWindowTouchingPanel();
            })
        ]
    });

    windowSignals.push({
        actor: global.display,
        signals: [
            global.display.connect('window-entered-monitor', () => {
                checkWindowTouchingPanel();
            }),
            global.display.connect('window-left-monitor', () => {
                checkWindowTouchingPanel();
            }),
            global.display.connect('in-fullscreen-changed', () => {
                checkWindowTouchingPanel();
            }),
        ]
    });

    windowSignals.push({
        actor: Main.overview,
        signals: [
            Main.overview.connect('showing', () => {
                overviewHiding = false;
                _cancelNoTransitionIdle();
                // Synchronous removal: the show animation keeps its bg fade
                Main.panel.remove_style_class_name('kiwi-panel-no-transition');
                updatePanelStyle();
            }),
            Main.overview.connect('hiding', () => {
                overviewHiding = true;
                // The theme's 250ms background transition would fade the panel
                // in from the stale :overview reading — suppress it for the exit
                Main.panel.add_style_class_name('kiwi-panel-no-transition');
                checkWindowTouchingPanel();
            }),
            Main.overview.connect('hidden', () => {
                overviewHiding = false;
                // A colour read while the overview showed is :overview's
                // transparent, which reads back as black. Login always passes
                // through the startup overview, so read the theme afresh.
                setPanelBackground('');
                checkWindowTouchingPanel();
                // One frame later, so the write above is also transition-free
                noTransitionIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                    noTransitionIdleId = 0;
                    Main.panel.remove_style_class_name('kiwi-panel-no-transition');
                    return GLib.SOURCE_REMOVE;
                });
            })
        ]
    });
}

function forceThemeUpdate() {
    const panel = Main.panel;
    panel.remove_style_class_name('panel');
    if (themeUpdateIdleId)
        GLib.Source.remove(themeUpdateIdleId);
    themeUpdateIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        themeUpdateIdleId = 0;
        panel.add_style_class_name('panel');
        ownBackground = '';
        panel.style = null;
        updatePanelStyle();
        return GLib.SOURCE_REMOVE;
    });
}

// The panel colour is read back from the panel, which reports our own inline
// background once it is set. A stylesheet swap that bypasses color-scheme
// (Light Style) would then never show, so drop the inline colour and read the
// new theme's. Idle: all nodes restyled. In the overview 'hidden' redoes it.
function onThemeChanged() {
    if (themeChangedIdleId)
        GLib.Source.remove(themeChangedIdleId);
    themeChangedIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        themeChangedIdleId = 0;
        setPanelBackground('');
        updatePanelStyle();
        return GLib.SOURCE_REMOVE;
    });
}

export function enable(_settings) {
    // extension.js re-runs every module's enable() on any settings change, so
    // this must be idempotent — otherwise originalStyle is re-captured from a
    // panel we already made transparent, and timers/signals pile up.
    if (enabled) return;
    settings = _settings;
    enabled = true;

    originalStyle = Main.panel.get_style();
    panelStyleSignal = Main.panel.connect('notify::style', () => {
        if (ownBackground)
            setPanelBackground(ownBackground);
    });
    interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    interfaceSettingsSignal = interfaceSettings.connect('changed::color-scheme', () => {
        updateWallpaperLightness();
        forceThemeUpdate();
        if (colorSchemeIdleId)
            GLib.Source.remove(colorSchemeIdleId);
        colorSchemeIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            colorSchemeIdleId = 0;
            updatePanelStyle();
            return GLib.SOURCE_REMOVE;
        });
    });
    themeContextSignal = St.ThemeContext.get_for_stage(global.stage).connect('changed', onThemeChanged);

    iconTheme = new St.IconTheme();
    bgSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
    bgSignals = ['changed::picture-uri', 'changed::picture-uri-dark'].map(key =>
        bgSettings.connect(key, () => {
            updateWallpaperLightness();
            updatePanelStyle();
        }));
    updateWallpaperLightness();

    setupSignals();

    updatePanelStyle();
    forceThemeUpdate();

    // Apply panel color fix on startup
    applyPanelColorFix();

    // The glass layer is always attached; lib/glass.js decides whether it is drawn
    // (Liquid Glass panel surface, or the legacy panel-blur key while it is off).
    createBlurEffect();
    glassRegistry = new CleanupRegistry();
    let glassReady = false;
    Glass.watch(glassRegistry, () => {
        // High contrast turns the panel solid; leaving it restores the user's level
        if (glassReady)
            updatePanelStyle(null);
    });
    glassReady = true;

    timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
        checkWindowTouchingPanel();
        timeoutId = null;
        return GLib.SOURCE_REMOVE;
    });

    // Lightweight periodic safety check (every 2s) to catch missed transitions (uses full logic)
    safetyIntervalId = GLib.timeout_add(GLib.PRIORITY_LOW, 2000, () => {
        checkWindowTouchingPanel();
        return GLib.SOURCE_CONTINUE;
    });
}

export function disable() {
    enabled = false;

    if (timeoutId) {
        GLib.Source.remove(timeoutId);
        timeoutId = null;
    }
    if (safetyIntervalId) {
        GLib.Source.remove(safetyIntervalId);
        safetyIntervalId = null;
    }
    if (panelStyleSignal) {
        Main.panel.disconnect(panelStyleSignal);
        panelStyleSignal = null;
    }
    _cancelNoTransitionIdle();
    if (colorFixIdleId) {
        GLib.Source.remove(colorFixIdleId);
        colorFixIdleId = 0;
    }
    if (themeUpdateIdleId) {
        GLib.Source.remove(themeUpdateIdleId);
        themeUpdateIdleId = 0;
        // forceThemeUpdate() took the class off; its idle was what put it back
        Main.panel.add_style_class_name('panel');
    }
    if (colorSchemeIdleId) {
        GLib.Source.remove(colorSchemeIdleId);
        colorSchemeIdleId = 0;
    }
    if (themeContextSignal) {
        St.ThemeContext.get_for_stage(global.stage).disconnect(themeContextSignal);
        themeContextSignal = null;
    }
    if (themeChangedIdleId) {
        GLib.Source.remove(themeChangedIdleId);
        themeChangedIdleId = 0;
    }
    ownBackground = '';
    
    settingsSignals.forEach(signal => {
        settings.disconnect(signal);
    });
    settingsSignals = [];

    handleWindowSignals(false);

    if (interfaceSettingsSignal) {
        interfaceSettings.disconnect(interfaceSettingsSignal);
        interfaceSettingsSignal = null;
    }
    interfaceSettings = null;

    bgSignals.forEach(signal => bgSettings.disconnect(signal));
    bgSignals = [];
    bgSettings = null;
    wallpaperLuminance = 0;
    iconTheme = null;
    monochromeIcons.clear();
    contentIcons = new WeakMap();

    // Destroy blur effect
    glassRegistry?.dispose();
    glassRegistry = null;
    destroyBlurEffect();
    blurWanted = false;

    // Remove CSS classes and give the panel its pre-Kiwi style back
    const panel = Main.panel;
    panel.remove_style_class_name('kiwi-panel-fullscreen');
    panel.remove_style_class_name('kiwi-panel-color-inherit');
    panel.remove_style_class_name('kiwi-panel-no-transition');
    clearForegroundContrast();
    // Only hand back a style we saved; never clobber another extension's
    if (originalStyle !== undefined)
        restorePanelStyle();

    settings = null;
    originalStyle = undefined;
    lastForcedAlpha = null;
    lastFullscreenState = false;
    overviewHiding = false;
    lastPanelColor = null;
}