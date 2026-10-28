// Run: gjs -m tests/osdModel.test.js
import { classifyOsd, route } from '../core/osdModel.js';
import {
    GG_PILL, PILL, SEGMENTS, TRACK_WIDTH, deviceLabel, ggPosition, pickAnchor, pillContent, pillPosition,
    segmentFill, volumeIconName,
} from '../features/osd/model.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
const _ = s => s;

test('classify: volume, mute, brightness, keyboard backlight, other', () => {
    eq(classifyOsd({ iconNames: ['audio-volume-medium-symbolic'], level: 0.5, maxLevel: 1 }),
        { kind: 'volume', muted: false, fraction: 0.5 });
    eq(classifyOsd({ iconNames: ['audio-volume-muted-symbolic'], level: 0.4, maxLevel: 1 }).muted, true);
    eq(classifyOsd({ iconNames: ['audio-volume-low-symbolic'], level: 0, maxLevel: 1 }).muted, true);
    eq(classifyOsd({ iconNames: ['display-brightness-symbolic'], level: 0.3, maxLevel: -1 }),
        { kind: 'brightness', muted: false, fraction: 0.3 });
    eq(classifyOsd({ iconNames: ['keyboard-brightness-symbolic'], level: 2, maxLevel: 4 }).fraction, 0.5);
    eq(classifyOsd({ iconNames: ['input-keyboard-symbolic'], level: null, maxLevel: null }),
        { kind: 'other', muted: false, fraction: null });
    eq(classifyOsd({ iconNames: [], level: undefined, maxLevel: undefined }).kind, 'other');
});

test('classify: over-amplified volume stays within 0..1', () => {
    eq(classifyOsd({ iconNames: ['audio-volume-overamplified-symbolic'], level: 1.5, maxLevel: 1.5 }).fraction, 1);
    eq(classifyOsd({ iconNames: ['audio-volume-high-symbolic'], level: 2, maxLevel: 1 }).fraction, 1);
});

test('route: the notch while it runs, else the pill, else stock', () => {
    const both = { notch: true, pill: true };
    eq(route({ kind: 'volume', location: 'notch', sinks: both }), 'notch');
    eq(route({ kind: 'volume', location: 'notch', sinks: { notch: false, pill: true } }), 'pill');
    eq(route({ kind: 'brightness', location: 'menu-bar', sinks: both }), 'pill');
    eq(route({ kind: 'volume', location: 'menu-bar', sinks: { notch: true, pill: false } }), 'notch');
    eq(route({ kind: 'volume', location: 'notch', sinks: { notch: false, pill: false } }), 'stock');
    eq(route({ kind: 'volume', location: 'system', sinks: both }), 'stock');
    eq(route({ kind: 'other', location: 'notch', sinks: both }), 'stock');
});

test('pill: device label prefers the port', () => {
    eq(deviceLabel('Built-in Audio', 'Speakers'), 'Speakers');
    eq(deviceLabel('USB Headphones', null), 'USB Headphones');
    eq(deviceLabel('  ', ''), null);
});

test('pill: content for volume, mute and brightness', () => {
    const v = pillContent({ kind: 'volume', muted: false, fraction: 0.5 }, { device: 'Built-in Speakers', deviceMuted: false }, _);
    eq([v.caption, v.iconName, v.fill, v.accessibleName], ['Built-in Speakers', 'audio-volume-medium-symbolic', 0.5, 'Built-in Speakers: 50 %']);
    const m = pillContent({ kind: 'volume', muted: false, fraction: 0.5 }, { device: null, deviceMuted: true }, _);
    eq([m.caption, m.muted, m.fill, m.iconName], ['Volume', true, 0, 'audio-volume-muted-symbolic']);
    const b = pillContent({ kind: 'brightness', muted: false, fraction: 0.8 }, { device: null, deviceMuted: false }, _);
    eq([b.caption, b.iconName, b.muted], ['Display', 'display-brightness-symbolic', false]);
    eq(pillContent({ kind: 'keyboard-backlight', muted: false, fraction: null }, { device: null, deviceMuted: false }, _).fill, 0);
});

test('pill: volume icons by level', () => {
    eq(volumeIconName(0.1, false), 'audio-volume-low-symbolic');
    eq(volumeIconName(0.9, false), 'audio-volume-high-symbolic');
    eq(volumeIconName(0, false), 'audio-volume-muted-symbolic');
});

test('pill: under the bar, right edge on the Control Center button, inside the monitor', () => {
    const mon = { x: 0, y: 0, width: 1280, height: 800 };
    eq(pillPosition(mon, 32, { x: 1200, width: 60 }), { x: 1260 - PILL.width, y: 32 + PILL.gap });
    eq(pillPosition(mon, 32, null).x, 1280 - PILL.margin - PILL.width);
    eq(pillPosition(mon, 32, { x: 10, width: 40 }).x, PILL.margin);
    eq(pillPosition({ x: 1280, y: 0, width: 1920, height: 1080 }, 30, { x: 3150, width: 40 }).x, 3190 - PILL.width);
    eq(TRACK_WIDTH > 100, true);
});

test('golden gate: segments lit for a level', () => {
    eq(SEGMENTS, 16);
    eq(segmentFill(0, false), 0);
    eq(segmentFill(0.5, false), 8);
    eq(segmentFill(1, false), 16);
    eq(segmentFill(1.4, false), 16);
    eq(segmentFill(0.01, false), 1, 'an audible level lights one');
    eq(segmentFill(0.8, true), 0, 'muted');
    eq(segmentFill(null, false), 0);
    eq(segmentFill(0.5, false, 10), 5);
});

test('golden gate: anchor is the matching item, else Control Center', () => {
    const cc = { x: 1200, width: 60 };
    const sound = { x: 1000, width: 30 };
    const stock = { x: 1220, width: 16 };
    eq(pickAnchor('volume', { pinnedSound: sound, stockVolume: stock, controlCenter: cc }).name, 'pinnedSound');
    eq(pickAnchor('volume', { pinnedSound: null, stockVolume: stock, controlCenter: cc }).name, 'stockVolume');
    eq(pickAnchor('volume', { stockVolume: { x: 0, width: 0 }, controlCenter: cc }).name, 'controlCenter');
    eq(pickAnchor('brightness', { pinnedSound: sound, stockVolume: stock, controlCenter: cc }).name, 'controlCenter');
    eq(pickAnchor('keyboard-backlight', { pinnedKeyboard: { x: 900, width: 30 }, controlCenter: cc }).name, 'pinnedKeyboard');
    eq(pickAnchor('keyboard-backlight', { controlCenter: cc }).name, 'controlCenter');
    eq(pickAnchor('keyboard-backlight', { stockBacklight: stock, controlCenter: cc }).name, 'stockBacklight');
    eq(pickAnchor('brightness', { stockBrightness: stock, controlCenter: cc }).name, 'stockBrightness');
    eq(pickAnchor('volume', {}), null);
});

test('golden gate: centred under the anchor, inside the monitor', () => {
    const mon = { x: 0, y: 0, width: 1280, height: 800 };
    eq(ggPosition(mon, 32, { x: 600, width: 40 }), { x: 620 - GG_PILL.width / 2, y: 32 + GG_PILL.gap });
    eq(ggPosition(mon, 32, { x: 1250, width: 30 }).x, 1280 - GG_PILL.margin - GG_PILL.width, 'clamped right');
    eq(ggPosition(mon, 32, { x: 0, width: 20 }).x, GG_PILL.margin, 'clamped left');
    eq(ggPosition(mon, 32, null).x, 1280 - GG_PILL.margin - GG_PILL.width);
    eq(ggPosition({ x: 1280, y: 0, width: 1920, height: 1080 }, 30, { x: 2200, width: 40 }).x, 2220 - GG_PILL.width / 2);
});

if (failed)
    throw new Error(`${failed} test(s) failed`);
