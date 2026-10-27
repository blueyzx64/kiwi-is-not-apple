// SPDX-License-Identifier: GPL-3.0-or-later
// Colour filters (accessibility): greyscale, the three colour-blindness corrections and a
// colour tint on the whole screen, like macOS Accessibility > Display > Colour Filters.
//
// GNOME 50 has no colour-filter keys (org.gnome.desktop.a11y.* has none; the magnifier's
// colour effects only act on its zoom region), so Kiwi puts a shader effect on every child of
// Main.uiGroup: window_group (the wallpaper and the windows) and each piece of chrome. The
// effects hand out no paint volume (lib/compat.js), so any damage redraws a whole child: with
// a volume Clutter repaints only the damaged part into the effect's cached picture and the
// rest of it, the wallpaper above all, stays black (also seen with the stock DesaturateEffect
// on global.stage). Each effect is a 3x3 colour matrix (model.js) given as nine float
// uniforms, so a change of type, intensity or hue costs a uniform update, not a recompile.
// Children that come later get one; all go on disable.
//
// Shell API: Main.uiGroup child-added / child-removed; lib/compat.js createShaderEffect
// (48-51 shader APIs).

import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { KiwiSettings } from '../../lib/settings.js';
import { createShaderEffect } from '../../lib/compat.js';
import { filterMatrix } from './model.js';

const EFFECT_NAME = 'kiwi-color-filter';
const KEYS = ['color-filter-kind', 'color-filter-intensity', 'color-filter-hue'];
const UNIFORMS = ['m00', 'm01', 'm02', 'm10', 'm11', 'm12', 'm20', 'm21', 'm22'].map(n => `kiwi_${n}`);

// The texture is premultiplied, so the (linear) matrix acts on it as it is; alpha stays.
const DECLARATIONS = UNIFORMS.map(u => `uniform float ${u};`).join('\n');
const EFFECT_FN = `
vec4 kiwi_effect(vec2 uv, vec4 color) {
    mat3 m = mat3(kiwi_m00, kiwi_m10, kiwi_m20,
                  kiwi_m01, kiwi_m11, kiwi_m21,
                  kiwi_m02, kiwi_m12, kiwi_m22);
    return vec4(clamp(m * color.rgb, 0.0, color.a), color.a);
}`;

function floatValue(v) {
    const value = new GObject.Value();
    value.init(GObject.TYPE_FLOAT);
    value.set_float(v);
    return value;
}

export class ColorFilters {
    constructor(ctx, cleanup) {
        this._ctx = ctx;
        this._cleanup = cleanup;
        this._effects = new Map();   // child of uiGroup -> its effect
        this._values = null;         // the nine uniform values now in force
    }

    enable() {
        const ks = new KiwiSettings(this._ctx.settings);
        ks.attach(this._cleanup);
        const sync = () => {
            const m = filterMatrix({
                kind: ks.string('color-filter-kind'),
                intensity: ks.int('color-filter-intensity'),
                hue: ks.int('color-filter-hue'),
            });
            this._values = m.flat();
            for (const effect of this._effects.values()) {
                this._setUniforms(effect);
                effect.queue_repaint();
            }
        };
        sync();
        ks.watch(KEYS, sync);
        const group = Main.uiGroup;
        for (const child of group.get_children())
            this._attach(child);
        this._cleanup.connect(group, 'child-added', (_g, child) => this._attach(child));
        this._cleanup.connect(group, 'child-removed', (_g, child) => this._detach(child));
        this._cleanup.add(() => {
            for (const child of [...this._effects.keys()])
                this._detach(child);
        });
    }

    disable() {
        // Everything is in the cleanup registry
    }

    _attach(child) {
        if (this._effects.has(child))
            return;
        const effect = createShaderEffect({ declarations: DECLARATIONS, effectFn: EFFECT_FN });
        if (!effect)
            return;
        this._setUniforms(effect);
        this._effects.set(child, effect);
        child.add_effect_with_name(EFFECT_NAME, effect);
    }

    _detach(child) {
        const effect = this._effects.get(child);
        if (!effect)
            return;
        this._effects.delete(child);
        child.remove_effect(effect);
    }

    _setUniforms(effect) {
        this._values.forEach((v, i) => effect.set_uniform_value(UNIFORMS[i], floatValue(v)));
    }
}
