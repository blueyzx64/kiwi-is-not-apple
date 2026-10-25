// SPDX-License-Identifier: GPL-3.0-or-later
// EXPERIMENTAL edge refraction for Liquid Glass (off by default).
//
// A Clutter.ShaderEffect can only transform the texture of the actor it sits on, not
// whatever is behind the actor. So refraction runs on the still, blurred wallpaper
// copy GlassService builds in Performance mode, never on the live BACKGROUND blur.
// Per-version shader plumbing is in lib/compat.js (createShaderEffect).

import { createShaderEffect } from './compat.js';

const DECLARATIONS = `
    uniform float width;
    uniform float height;
    uniform float radius;
    uniform float bezel;
    uniform float strength;
`;

// Signed distance to a rounded rectangle; near the rim the sample point moves
// outward along the edge normal, bending the picture like a lens. A <=1px red/blue
// split at the rim only; the interior is untouched so text never shifts.
const EFFECT_FN = `
    vec4 kiwi_effect(vec2 uv, vec4 color) {
        vec2 size = vec2(width, height);
        vec2 p = uv * size;
        vec2 h = size * 0.5;
        vec2 q = abs(p - h) - (h - vec2(radius));
        vec2 c = max(q, vec2(0.0));
        float sdf = length(c) + min(max(q.x, q.y), 0.0) - radius;
        float depth = -sdf;
        float rim = 1.0 - smoothstep(0.0, bezel, depth);
        rim *= rim;
        vec2 s = sign(p - h);
        float cornerAmount = step(0.0001, length(c));
        float xAxis = step(q.y, q.x);
        vec2 axisN = vec2(xAxis * s.x, (1.0 - xAxis) * s.y);
        vec2 cornerN = (c * s) / max(length(c), 0.0001);
        vec2 n = mix(axisN, cornerN, cornerAmount);
        vec2 shift = n * strength * rim;
        vec2 fringe = n * rim;
        vec2 uvG = clamp((p + shift) / size, 0.0, 1.0);
        vec2 uvR = clamp((p + shift + fringe) / size, 0.0, 1.0);
        vec2 uvB = clamp((p + shift - fringe) / size, 0.0, 1.0);
        vec4 g = kiwi_sample(uvG);
        return vec4(kiwi_sample(uvR).r, g.g, kiwi_sample(uvB).b, g.a);
    }
`;

export class RefractionEffect {
    /** @returns {RefractionEffect|null} null when this Shell cannot build the shader */
    static create() {
        const effect = createShaderEffect({ declarations: DECLARATIONS, effectFn: EFFECT_FN });
        return effect ? new RefractionEffect(effect) : null;
    }

    constructor(effect) {
        this.effect = effect;
    }

    /** Push the geometry. Sizes in logical px of the actor the effect sits on. */
    update(width, height, cornerRadius, scale = 1) {
        const w = Math.max(width, 1);
        const h = Math.max(height, 1);
        const r = Math.min(cornerRadius, w / 2, h / 2);
        // Nudged off whole numbers so GJS marshals doubles (see minimizedToDock.js)
        this.effect.set_uniform_value('width', w - 1e-6);
        this.effect.set_uniform_value('height', h - 1e-6);
        this.effect.set_uniform_value('radius', Math.max(r, 1) - 1e-6);
        this.effect.set_uniform_value('bezel', Math.max(10 * scale, 1) - 1e-6);
        this.effect.set_uniform_value('strength', 8 * scale - 1e-6);
        this.effect.enabled = width >= 1 && height >= 1;
    }
}
