// Run: gjs -m tests/pointerModel.test.js
// features/pointer/model.js: shake detection, hide while typing, config, Xcursor recolouring;
// lib/caretModel.js: caret moves.
import {
    SHAKE, ShakeDetector, TypingHider, anyOn, indexTheme, parseHex, readConfig, recolorPixel, recolorXcursor,
    themeName,
} from '../features/pointer/model.js';
import { CaretTracker } from '../lib/caretModel.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// Samples every 8 ms (a 125 Hz mouse) from x0 to x1 over `ms`
function stroke(d, t0, x0, x1, ms) {
    let out = false;
    const n = Math.max(1, Math.round(ms / 8));
    for (let i = 1; i <= n; i++)
        out = d.update(x0 + (x1 - x0) * i / n, 300, t0 + ms * i / n);
    return out;
}
function shake(d, t0, strokes, len = 200, ms = 90) {
    let x = 500, t = t0, out = false;
    d.update(x, 300, t);
    for (let i = 0; i < strokes; i++) {
        const to = i % 2 ? x - len : x + len;
        out = stroke(d, t, x, to, ms);
        x = to;
        t += ms;
    }
    return { shaking: out, t, x };
}

test('a quick side-to-side shake turns it on, then it ends after the hold', () => {
    const d = new ShakeDetector();
    const r = shake(d, 1000, 5);
    eq(r.shaking, true);
    eq(d.shaking(r.t + SHAKE.hold - 200), true);
    eq(d.shaking(r.t + SHAKE.hold + 200), false);
});
test('two strokes are not a shake', () => {
    eq(shake(new ShakeDetector(), 0, 2).shaking, false);
});
test('slow back and forth is not a shake', () => {
    eq(shake(new ShakeDetector(), 0, 8, 200, 600).shaking, false);
});
test('small wiggles are not a shake', () => {
    eq(shake(new ShakeDetector(), 0, 10, 20, 20).shaking, false);
});
test('a long straight move is not a shake', () => {
    eq(stroke(new ShakeDetector(), 0, 0, 1200, 300), false);
});
test('a pause between strokes starts over', () => {
    const d = new ShakeDetector();
    const r = shake(d, 0, 2);
    // rest longer than maxGap, then two more strokes: still only two in a row
    eq(shake(d, r.t + 500, 2).shaking, false);
});
test('vertical shaking is ignored', () => {
    const d = new ShakeDetector();
    let y = 100, t = 0, out = false;
    for (let i = 0; i < 40; i++) {
        y = i % 10 < 5 ? y + 40 : y - 40;
        t += 8;
        out = d.update(500, y, t) || out;
    }
    eq(out, false);
});

test('typing: two caret moves with a still pointer hide it; motion shows it', () => {
    const h = new TypingHider();
    eq(h.caretMoved(), false, 'one move (a click placed the caret)');
    eq(h.caretMoved(), true);
    eq(h.caretMoved(), false, 'already hidden');
    eq(h.pointerMoved(), true);
    eq(h.pointerMoved(), false);
    eq(h.caretMoved(), false, 'motion reset the count');
});
test('typing: blocked (grab, button, overview, modal) never hides and resets the count', () => {
    const h = new TypingHider();
    h.caretMoved();
    eq(h.caretMoved({ blocked: true }), false);
    eq(h.caretMoved(), false);
    eq(h.caretMoved(), true);
    eq(h.reset(), true);
    eq(h.hidden, false);
});

test('config: size, colours, defaults for bad hex', () => {
    const v = {
        'pointer-shake-to-locate': true, 'pointer-hide-while-typing': false, 'pointer-size': '48',
        'pointer-custom-colors': true, 'pointer-fill-color': '#ff0000', 'pointer-outline-color': 'nope',
    };
    const c = readConfig({ bool: k => v[k], string: k => v[k] });
    eq(c, { shake: true, hideWhileTyping: false, size: 48, colors: true, fill: [255, 0, 0], outline: [255, 255, 255] });
    eq(readConfig({ bool: () => false, string: k => (k === 'pointer-size' ? 'system' : '') }).size, 0);
    eq(anyOn({ shake: false, hideWhileTyping: false, size: 0, colors: false }), false);
    eq(anyOn({ shake: false, hideWhileTyping: false, size: 32, colors: false }), true);
});
test('hex and theme names', () => {
    eq(parseHex('#00FF80'), [0, 255, 128]);
    eq(parseHex('#abc'), null);
    eq(themeName([255, 0, 0], [255, 255, 255]), 'Kiwi-Pointer-ff0000ffffff');
    eq(indexTheme('Adwaita').includes('Inherits=Adwaita'), true);
});

const RED = [255, 0, 0];
const BLUE = [0, 0, 255];
test('recolour: black fill -> fill, white outline -> outline, soft shadow kept, clear kept', () => {
    eq(recolorPixel(0xff000000, RED, BLUE).toString(16), 'ffff0000');
    eq(recolorPixel(0xffffffff, RED, BLUE).toString(16), 'ff0000ff');
    eq(recolorPixel(0x40000000, RED, BLUE).toString(16), '40000000');
    eq(recolorPixel(0, RED, BLUE), 0);
    // premultiplied: a half-transparent white edge stays half-transparent, in the outline colour
    eq(recolorPixel(0xa0a0a0a0, RED, BLUE).toString(16), 'a00000a0');
});

function xcursor(pixels, w, h) {
    const header = 16, toc = 12, img = 36;
    const buf = new Uint8Array(header + toc + img + w * h * 4);
    const v = new DataView(buf.buffer);
    v.setUint32(0, 0x72756358, true); v.setUint32(4, header, true); v.setUint32(8, 0x10000, true);
    v.setUint32(12, 1, true);
    v.setUint32(16, 0xfffd0002, true); v.setUint32(20, 24, true); v.setUint32(24, header + toc, true);
    const p = header + toc;
    v.setUint32(p, img, true); v.setUint32(p + 4, 0xfffd0002, true); v.setUint32(p + 8, 24, true);
    v.setUint32(p + 12, 1, true); v.setUint32(p + 16, w, true); v.setUint32(p + 20, h, true);
    v.setUint32(p + 24, 0, true); v.setUint32(p + 28, 0, true); v.setUint32(p + 32, 0, true);
    pixels.forEach((px, i) => v.setUint32(p + img + i * 4, px, true));
    return buf;
}
test('Xcursor: images recoloured, layout unchanged, input untouched, junk refused', () => {
    const src = xcursor([0xff000000, 0xffffffff], 2, 1);
    const out = recolorXcursor(src, RED, BLUE);
    eq(out.length, src.length);
    const v = new DataView(out.buffer);
    eq([v.getUint32(64, true).toString(16), v.getUint32(68, true).toString(16)], ['ffff0000', 'ff0000ff']);
    eq(new DataView(src.buffer).getUint32(64, true).toString(16), 'ff000000');
    eq(recolorXcursor(new Uint8Array(40), RED, BLUE), null);
    eq(recolorXcursor(src.slice(0, 60), RED, BLUE), null);
});

test('caret: a move is reported only from one place to another', () => {
    const c = new CaretTracker();
    eq(c.report({ x: 10, y: 20, width: 1, height: 18 }), false, 'first report');
    eq(c.report({ x: 10, y: 20, width: 1, height: 18 }), false, 'same place');
    eq(c.report({ x: 18, y: 20, width: 1, height: 18 }), true);
    eq(c.report({ x: 0, y: 0, width: 0, height: 0 }), false);
    eq(c.report({ x: 30, y: 20, width: 1, height: 18 }), false, 'after none');
    c.focusChanged();
    eq(c.report({ x: 40, y: 20, width: 1, height: 18 }), false, 'after a focus change');
});

if (failed)
    throw new Error(`${failed} test(s) failed`);
