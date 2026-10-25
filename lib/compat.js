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
