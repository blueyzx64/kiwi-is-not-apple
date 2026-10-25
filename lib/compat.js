// SPDX-License-Identifier: GPL-3.0-or-later
// The one place that knows what differs between GNOME Shell 48, 49, 50 and 51.
// Feature code asks this module; it never compares versions itself.
// Facts checked in .claude/skills/gnome-shell-extension/references/version-matrix.md.

import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';

/** Major shell version, e.g. 49. */
export const SHELL_MAJOR = parseInt(Config.PACKAGE_VERSION, 10);

/** @param {number} major true when the running shell is `major` or newer */
export function atLeast(major) {
    return SHELL_MAJOR >= major;
}

/** GNOME 49 moved Do Not Disturb into Quick Settings, so there is a built-in DND UI. */
export const SHELL_HAS_SYSTEM_DND = atLeast(49);

// Mutter 49 dropped the MetaMaximizeFlags argument from maximize()/unmaximize();
// 48 still requires it.
const MAXIMIZE_ARGS = atLeast(49) ? [] : [Meta.MaximizeFlags.BOTH];

export function maximizeWindow(win) {
    win.maximize(...MAXIMIZE_ARGS);
}

export function unmaximizeWindow(win) {
    win.unmaximize(...MAXIMIZE_ARGS);
}

/**
 * Argument for PopupMenu.close(). 51 replaced the PopupAnimation bitmask with a params
 * object; `true` is the 48-50 spelling of "animate". 51 gets the closest equivalent.
 */
export const MENU_CLOSE_ARGS = atLeast(51) ? { animate: true } : true;

const A11Y_SCHEMA = 'org.gnome.desktop.a11y.interface';
const INTERFACE_SCHEMA = 'org.gnome.desktop.interface';

function _schemaHasKey(schemaId, key) {
    const schema = Gio.SettingsSchemaSource.get_default()?.lookup(schemaId, true);
    return !!schema?.has_key(key);
}

// Which GSettings key carries the preference on this shell
function _reducedMotionSource() {
    if (atLeast(50) && _schemaHasKey(A11Y_SCHEMA, 'reduced-motion'))
        return { schemaId: A11Y_SCHEMA, key: 'reduced-motion', invert: false };
    if (_schemaHasKey(INTERFACE_SCHEMA, 'enable-animations'))
        return { schemaId: INTERFACE_SCHEMA, key: 'enable-animations', invert: true };
    return null;
}

function _read(settings, source) {
    return settings.get_boolean(source.key) !== source.invert;
}

/**
 * Read the user's "reduce motion" preference once.
 * 50+: org.gnome.desktop.a11y.interface reduced-motion.
 * 48-49: org.gnome.desktop.interface enable-animations, inverted.
 * Falls back to false when the key does not exist. To follow changes use
 * watchReducedMotion(), which keeps one Gio.Settings for its lifetime.
 *
 * @returns {boolean}
 */
export function reducedMotion() {
    const source = _reducedMotionSource();
    if (!source)
        return false;
    return _read(new Gio.Settings({ schema_id: source.schemaId }), source);
}

/**
 * Call fn(reduced:boolean) now and whenever the preference changes. One Gio.Settings is
 * built here and its connection is torn down by `registry.dispose()`.
 *
 * @param {CleanupRegistry} registry
 * @param {Function} fn
 */
export function watchReducedMotion(registry, fn) {
    const source = _reducedMotionSource();
    if (!source) {
        fn(false);
        return;
    }
    const settings = new Gio.Settings({ schema_id: source.schemaId });
    registry.connect(settings, `changed::${source.key}`, () => fn(_read(settings, source)));
    fn(_read(settings, source));
}

/**
 * Which custom-shader API this Shell has. 48-50 replace the whole fragment program
 * (Clutter.ShaderEffect.set_shader_source, Shell.GLSLEffect also exists); 51 removed
 * Shell.GLSLEffect and set_shader_source in favour of Cogl snippets. Feature code
 * never looks at this: it calls createShaderEffect().
 */
export const SHADER_API = typeof Clutter.ShaderEffect.prototype.set_shader_source === 'function'
    ? 'program' : 'snippet';

const ProgramEffect = GObject.registerClass(
class KiwiProgramShaderEffect extends Clutter.ShaderEffect {
    constructor(source) {
        super();
        this.set_shader_source(source);
    }
});

/**
 * Build a ShaderEffect that post-processes the actor's own texture.
 *
 * `declarations` holds uniforms and helpers. `effectFn` must define
 * `vec4 kiwi_effect(vec2 uv)` (uv is 0..1 over the actor) and may call
 * `kiwi_sample(vec2 uv)` to read the actor's texture. Set uniforms afterwards with
 * effect.set_uniform_value(name, floatValue) (use non-integral doubles, see
 * apps/minimizedToDock.js).
 *
 * @param {{declarations: string, effectFn: string}} src
 * @returns {Clutter.ShaderEffect|null} null when the shader could not be created
 */
export function createShaderEffect({ declarations, effectFn }) {
    try {
        if (SHADER_API === 'program') {
            return new ProgramEffect(`
                uniform sampler2D tex;
                ${declarations}
                vec4 kiwi_sample(vec2 uv) { return texture2D(tex, uv); }
                ${effectFn}
                void main() { cogl_color_out = kiwi_effect(cogl_tex_coord_in[0].xy); }
            `);
        }
        // Snippet declarations are emitted at file scope before the hook, where the
        // layer-0 sampler cogl_sampler0 is already declared.
        return Clutter.ShaderEffect.new_with_snippet(Cogl.Snippet.new(
            Cogl.SnippetHook.FRAGMENT,
            `${declarations}
             vec4 kiwi_sample(vec2 uv) { return texture2D(cogl_sampler0, uv); }
             ${effectFn}`,
            `cogl_color_out = kiwi_effect(cogl_tex_coord_in[0].xy);`));
    } catch (e) {
        console.error('[Kiwi] shader effect unavailable:', e);
        return null;
    }
}

/**
 * Hold direct scanout (unredirect) off while Shell UI is drawn over a fullscreen window, or
 * release it. Calls must be paired by the caller. A no-op where the compositor has no such
 * call (X11 support went away in 50, and the API may follow).
 *
 * @param {boolean} allowed true = the compositor may unredirect again
 */
export function setUnredirectAllowed(allowed) {
    const compositor = global.compositor;
    const fn = allowed ? compositor?.enable_unredirect : compositor?.disable_unredirect;
    if (typeof fn === 'function')
        fn.call(compositor);
}

/**
 * Chrome tracking the stock panelBox has (layout.js, 48 to main): struts on, hidden over
 * fullscreen. `affectsInputRegion` is deliberately absent: 50 dropped it and Params.parse()
 * throws on unknown keys, while 48 and 49 default it to the value we want.
 */
export const STOCK_PANEL_CHROME = Object.freeze({ affectsStruts: true, trackFullscreen: true });

// --- notifications and OSD ---------------------------------------------------------------
// Checked against messageTray.js and osdWindow.js at 48.0, 49.0, 50.0 and main.
// MessageTray: `_showNotification()` (called from `_updateState()` once the stock filters for
// acknowledged, urgency, DND, busy and fullscreen have run), `_notificationQueue` and the
// 'queue-changed' signal are the same in all four. The class changed from registerClass() to
// a native class in 50, so patch MessageTray.prototype, never an instance.
// OSD: the public show() changed in 49 (show(monitor, icon, label, level, max) became
// show(icon, label, levels), plus showOne/showAll), but every path ends in
// `_showOsdWindow(monitorIndex, icon, label, level, maxLevel)`, unchanged since 48.

/**
 * Take the head of the banner queue, as MessageTray._showNotification() does.
 * @param {object} tray Main.messageTray
 * @returns {object|undefined} the Notification
 */
export function takeQueuedBanner(tray) {
    const notification = tray._notificationQueue?.shift();
    tray.emit('queue-changed');
    return notification;
}

/** Ask the tray to look at its queue again (shows or diverts the next banner). */
export function kickTray(tray) {
    if (typeof tray._updateState === 'function')
        tray._updateState();
}

/** @returns {boolean} the running Shell has the hooks the banner and OSD diversion need */
export function canDivertBanners(tray) {
    return Array.isArray(tray?._notificationQueue) && typeof tray._showNotification === 'function';
}

/** @returns {boolean} */
export function canDivertOsd(osdWindowManager) {
    return typeof osdWindowManager?._showOsdWindow === 'function';
}

/**
 * Put a notification back at the head of the banner queue so the stock banner shows it.
 * Used when a sink goes away while still holding a card. No-op for destroyed notifications.
 *
 * @param {object} tray Main.messageTray
 * @param {object} notification
 */
export function requeueBanner(tray, notification) {
    if (!Array.isArray(tray?._notificationQueue) || notification._destroyed)
        return;
    if (!tray._notificationQueue.includes(notification)) {
        tray._notificationQueue.unshift(notification);
        tray.emit('queue-changed');
    }
    // The tray drops acknowledged notifications from its queue
    notification.acknowledged = false;
}
