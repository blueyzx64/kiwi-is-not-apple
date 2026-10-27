// SPDX-License-Identifier: GPL-3.0-or-later
// Colour filters (accessibility): greyscale, the three colour-blindness corrections and a
// colour tint on the whole screen, like macOS Accessibility > Display > Colour Filters.
//
// GNOME 50 has no colour-filter keys (org.gnome.desktop.a11y.* has none; the magnifier's
// colour effects only act on its zoom region), so Kiwi puts one shader effect on the stage:
// a 3x3 colour matrix (model.js) given as nine float uniforms, so a change of type, intensity
// or hue costs a uniform update, not a recompile. It is removed on disable.
//
// Shell API: global.stage effects; lib/compat.js createShaderEffect (48-51 shader APIs).

import GObject from 'gi://GObject';

import { KiwiSettings } from '../../lib/settings.js';
import { createShaderEffect } from '../../lib/compat.js';
import { filterMatrix } from './model.js';

const EFFECT_NAME = 'kiwi-color-filter';
const KEYS = ['color-filter-kind', 'color-filter-intensity', 'color-filter-hue'];
const UNIFORMS = ['m00', 'm01', 'm02', 'm10', 'm11', 'm12', 'm20', 'm21', 'm22'].map(n => `kiwi_${n}`);

// Premultiplied colour in, premultiplied colour out: the matrix is linear, so it commutes
// with alpha; clamping to alpha keeps the result a valid premultiplied colour.
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
        this._effect = null;
    }

    enable() {
        const ks = new KiwiSettings(this._ctx.settings);
        ks.attach(this._cleanup);
        const effect = createShaderEffect({ declarations: DECLARATIONS, effectFn: EFFECT_FN });
        if (!effect)
            return;
        this._effect = effect;
        const sync = () => {
            const m = filterMatrix({
                kind: ks.string('color-filter-kind'),
                intensity: ks.int('color-filter-intensity'),
                hue: ks.int('color-filter-hue'),
            });
            m.flat().forEach((v, i) => effect.set_uniform_value(UNIFORMS[i], floatValue(v)));
            effect.queue_repaint();
        };
        sync();
        ks.watch(KEYS, sync);
        global.stage.add_effect_with_name(EFFECT_NAME, effect);
        this._cleanup.add(() => {
            global.stage.remove_effect(effect);
            this._effect = null;
        });
    }

    disable() {
        // Everything is in the cleanup registry
    }
}
