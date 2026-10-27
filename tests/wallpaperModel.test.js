// SPDX-License-Identifier: GPL-3.0-or-later
// gjs -m tests/wallpaperModel.test.js
// lib/wallpaperModel.js: what to sample for the glass wallpaper tint, and the average.
import { ColorCache, averageRgb, isXmlBackground, parseHexColor, wallpaperSource, xmlFirstImage }
    from '../lib/wallpaperModel.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const bg = (over = {}) => ({
    pictureUri: 'file:///w/day.jpg', pictureUriDark: 'file:///w/night.jpg', options: 'zoom',
    primaryColor: '#023c88', colorScheme: 'default', ...over,
});

test('source: the dark picture only for prefer-dark, like the Shell', () => {
    eq(wallpaperSource(bg()), { kind: 'file', uri: 'file:///w/day.jpg' });
    eq(wallpaperSource(bg({ colorScheme: 'prefer-light' })).uri, 'file:///w/day.jpg');
    eq(wallpaperSource(bg({ colorScheme: 'prefer-dark' })).uri, 'file:///w/night.jpg');
    eq(wallpaperSource(bg({ colorScheme: 'prefer-dark', pictureUriDark: '' })).uri, 'file:///w/day.jpg');
});

test('source: no picture shows the primary colour', () => {
    eq(wallpaperSource(bg({ options: 'none' })), { kind: 'color', color: [2, 60, 136] });
    eq(wallpaperSource(bg({ options: 'none', primaryColor: 'nonsense' })), { kind: 'none' });
    eq(wallpaperSource(bg({ pictureUri: '' })), { kind: 'none' });
});

test('hex colours', () => {
    eq(parseHexColor('#fff'), [255, 255, 255]);
    eq(parseHexColor(' #102030 '), [16, 32, 48]);
    eq(parseHexColor('rgb(1,2,3)'), null);
    eq(parseHexColor(null), null);
});

test('XML backgrounds: the first picture, plain or multi-size', () => {
    eq(isXmlBackground('file:///usr/share/backgrounds/f44/default/f44.xml'), true);
    eq(isXmlBackground('file:///w/a.png'), false);
    eq(xmlFirstImage('<background><static><duration>1</duration><file>/a/day.png</file></static>' +
        '<transition><from>/a/day.png</from><to>/a/night.png</to></transition></background>'), '/a/day.png');
    eq(xmlFirstImage('<static><file><size width="1920" height="1080">/a/fhd.jxl</size><size width="3840">/a/uhd.jxl</size></file></static>'), '/a/fhd.jxl');
    eq(xmlFirstImage('<background/>'), null);
});

test('average: RGB rows with padding, and alpha weighting', () => {
    // 2x2 RGB, rowstride 8 (2 bytes padding)
    const rgb = new Uint8Array([255, 0, 0, 0, 0, 255, 9, 9, 0, 255, 0, 255, 255, 255, 9, 9]);
    eq(averageRgb(rgb, { width: 2, height: 2, rowstride: 8, channels: 3 }), [128, 128, 128]);
    // 2x1 RGBA: a transparent pixel counts for nothing
    const rgba = new Uint8Array([10, 20, 30, 255, 250, 250, 250, 0]);
    eq(averageRgb(rgba, { width: 2, height: 1, rowstride: 8, channels: 4 }), [10, 20, 30]);
    eq(averageRgb(new Uint8Array([1, 1, 1, 0]), { width: 1, height: 1, rowstride: 4, channels: 4 }), null);
});

test('cache keeps the most recent entries', () => {
    const c = new ColorCache(2);
    c.set('a', [1, 1, 1]);
    c.set('b', null);
    c.get('a');
    c.set('c', [3, 3, 3]);
    eq([c.get('a'), c.get('b'), c.get('c'), c.size], [[1, 1, 1], undefined, [3, 3, 3], 2]);
});

if (failed) {
    print(`${failed} test(s) failed`);
    imports.system.exit(1);
}
