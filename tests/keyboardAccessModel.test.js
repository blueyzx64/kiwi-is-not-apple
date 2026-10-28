// Run: gjs -m tests/keyboardAccessModel.test.js
// features/keyboardAccess/model.js and lib/a11ySettingsModel.js: the Sticky Keys HUD, the zoom
// mapping, XKB symbols parsing and the Keyboard Viewer board.
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import {
    CORNERS, EVDEV, HUD_MARGIN, MOD, PANEL_SWITCHES, board, hudContent, hudPosition, isAlphabetic,
    keysymLabel, levelFor, parseInclude, parseSymbols, pickVariant, readConfig, resolveKeys, splitXkbId,
    stickyGlyphs, zoomTracking,
} from '../features/keyboardAccess/model.js';
import { a11ySwitch, a11ySwitches, isOn, valueFor } from '../lib/a11ySettingsModel.js';

let failed = 0;
const pending = [];
function test(name, fn) {
    try {
        const r = fn();
        if (r?.then) {
            pending.push(r.then(() => print(`ok   ${name}`), e => {
                failed++;
                print(`FAIL ${name}: ${e.message}`);
            }));
            return;
        }
        print(`ok   ${name}`);
    } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// A tiny keysym table: single characters are themselves, plus the names the tests use
const NAMED = {
    grave: 0x60, asciitilde: 0x7e, exclam: 0x21, at: 0x40, minus: 0x2d, underscore: 0x5f, equal: 0x3d,
    plus: 0x2b, ssharp: 0xdf, question: 0x3f, udiaeresis: 0xfc, Udiaeresis: 0xdc, odiaeresis: 0xf6,
    Odiaeresis: 0xd6, adiaeresis: 0xe4, Adiaeresis: 0xc4, EuroSign: 0x20ac, numbersign: 0x23,
    apostrophe: 0x27, less: 0x3c, greater: 0x3e, bar: 0x7c, space: 0x20, section: 0xa7, quotedbl: 0x22,
};
const cp = name => NAMED[name] ?? (name.length === 1 ? name.codePointAt(0) : 0);

const cfg = { stickyDisplay: true, corner: 'top-right', slowKeysIndicator: false, zoomFollow: 'system' };

test('config: defaults for unknown values', () => {
    const v = {
        'kbd-a11y-sticky-display': true, 'kbd-a11y-sticky-corner': 'middle', 'kbd-a11y-slowkeys-indicator': false,
        'kbd-a11y-zoom-follow': 'sometimes',
    };
    eq(readConfig({ bool: k => v[k], string: k => v[k] }), cfg);
    eq(CORNERS[0], 'top-right');
});

test('sticky glyphs: macOS order, locked wins, Alt and AltGr are one ⌥', () => {
    eq(stickyGlyphs(MOD.SHIFT | MOD.MOD4, 0).map(g => g.glyph).join(''), '⇧⌘');
    eq(stickyGlyphs(MOD.MOD4 | MOD.SHIFT | MOD.MOD1 | MOD.CONTROL, 0).map(g => g.glyph).join(''), '⌃⌥⇧⌘');
    eq(stickyGlyphs(MOD.SHIFT, MOD.CONTROL), [
        { id: 'control', glyph: '⌃', state: 'locked' }, { id: 'shift', glyph: '⇧', state: 'latched' }]);
    eq(stickyGlyphs(MOD.MOD5, MOD.MOD1).length, 1);
    eq(stickyGlyphs(MOD.LOCK, 0), [], 'Caps Lock is not a sticky modifier');
});

test('hud: hidden with nothing latched, Sticky Keys off or display off; slow keys chip opt-in', () => {
    const s = { stickyKeys: true, slowKeys: false, latched: MOD.SHIFT, locked: 0 };
    eq(hudContent(s, cfg).glyphs.length, 1);
    eq(hudContent({ ...s, latched: 0 }, cfg), null);
    eq(hudContent({ ...s, stickyKeys: false }, cfg), null);
    eq(hudContent(s, { ...cfg, stickyDisplay: false }), null);
    eq(hudContent({ ...s, latched: 0, slowKeys: true }, cfg), null, 'chip off by default');
    eq(hudContent({ ...s, latched: 0, slowKeys: true }, { ...cfg, slowKeysIndicator: true }), { glyphs: [], slowKeys: true });
});

test('hud position: each corner, margin in from the work area', () => {
    const area = { x: 0, y: 32, width: 1280, height: 768 };
    const size = { width: 100, height: 40 };
    eq(hudPosition({ corner: 'top-right', size, area }), { x: 1280 - 100 - HUD_MARGIN, y: 32 + HUD_MARGIN });
    eq(hudPosition({ corner: 'top-left', size, area }), { x: HUD_MARGIN, y: 32 + HUD_MARGIN });
    eq(hudPosition({ corner: 'bottom-left', size, area }), { x: HUD_MARGIN, y: 800 - 40 - HUD_MARGIN });
    eq(hudPosition({ corner: 'bottom-right', size, area }).x, 1280 - 100 - HUD_MARGIN);
});

test('zoom follow: macOS choices onto focus and caret tracking', () => {
    eq(zoomTracking('system'), null);
    eq(zoomTracking('always'), { focus: 'push', caret: 'push' });
    eq(zoomTracking('typing'), { focus: 'none', caret: 'push' });
    eq(zoomTracking('never'), { focus: 'none', caret: 'none' });
});

test('panel switches all exist; shared switches flip their bindings', () => {
    eq(a11ySwitches(PANEL_SWITCHES).length, PANEL_SWITCHES.length);
    const motion = a11ySwitch('reduce-motion').binding;
    eq([isOn(motion, false), valueFor(motion, true)], [true, false], 'inverted');
    const text = a11ySwitch('text-size').binding;
    eq([isOn(text, 1.25), valueFor(text, false)], [true, 1.0]);
    eq(isOn(a11ySwitch('sticky-keys').binding, true), true);
});

test('xkb ids and includes', () => {
    eq(splitXkbId('de+nodeadkeys'), { layout: 'de', variant: 'nodeadkeys' });
    eq(splitXkbId('us'), { layout: 'us', variant: '' });
    eq(splitXkbId('fr(azerty)'), { layout: 'fr', variant: 'azerty' });
    eq(splitXkbId(''), { layout: 'us', variant: '' });
    eq(parseInclude('latin(type4)'), { file: 'latin', variant: 'type4' });
    eq(parseInclude('kpdl(comma)'), { file: 'kpdl', variant: 'comma' });
    eq(parseInclude('us'), { file: 'us', variant: '' });
});

const TOY = {
    base: `// comment { not a block
default partial alphanumeric_keys
xkb_symbols "basic" {
    name[Group1]= "Toy";
    key <AC01> {[ a, A ]};
    key <AE01> { type[Group1]="FOUR_LEVEL", symbols[Group1]= [ 1, exclam, onesuperior ] };
    include "extra(more)"
};
partial xkb_symbols "nodead" {
    include "base(basic)"
    key <AC01> {[ q, Q ]};
};
partial xkb_symbols "aug" {
    key <AC02> {[ s ]};
    augment "extra(more)"
};`,
    extra: `partial xkb_symbols "more" {
    key <AC02> {[ s, S, ssharp ]};
    key <AC01> {[ x, X ]};
};`,
};
const toyLoad = async f => TOY[f] ?? null;

test('parse: variants, default, includes and keys in source order', () => {
    const v = parseSymbols(TOY.base);
    eq([...v.keys()], ['basic', 'nodead', 'aug']);
    eq(pickVariant(v, '').isDefault, true);
    eq(pickVariant(v, 'missing'), null);
    eq(v.get('basic').steps.map(s => s.key ?? s.include), ['AC01', 'AE01', 'extra(more)']);
    eq(v.get('basic').steps[1].levels, ['1', 'exclam', 'onesuperior']);
});

test('resolve: later definitions override, includes recurse, augment fills gaps only', async () => {
    const basic = await resolveKeys({ layout: 'base', variant: '' }, toyLoad);
    eq(basic.get('AC01'), ['x', 'X'], 'the include came after the key');
    const nodead = await resolveKeys({ layout: 'base', variant: 'nodead' }, toyLoad);
    eq(nodead.get('AC01'), ['q', 'Q']);
    eq(nodead.get('AC02'), ['s', 'S', 'ssharp']);
    const aug = await resolveKeys({ layout: 'base', variant: 'aug' }, toyLoad);
    eq(aug.get('AC02'), ['s', 'S', 'ssharp'], 'augment keeps level 1 and adds the rest');
    eq((await resolveKeys({ layout: 'nope', variant: '' }, toyLoad)).size, 0);
});

test('labels: unicode, dead keys, void, levels, caps on letters only', () => {
    eq(keysymLabel('U20AC', cp), { text: '€', dead: false });
    eq(keysymLabel('dead_acute', cp), { text: '´', dead: true });
    eq(keysymLabel('NoSymbol', cp).text, '');
    eq(keysymLabel('0x10000e9', cp).text, 'é');
    eq(isAlphabetic(['a', 'A'], cp), true);
    eq(isAlphabetic(['1', 'exclam'], cp), false);
    eq(levelFor({ shift: false, caps: true, option: false }, true), 1);
    eq(levelFor({ shift: false, caps: true, option: false }, false), 0);
    eq(levelFor({ shift: true, caps: true, option: false }, true), 0);
    eq(levelFor({ shift: true, caps: false, option: true }, false), 3);
});

test('board: ANSI without LSGT, wider left Shift, codes and levels', async () => {
    const keys = await resolveKeys({ layout: 'base', variant: '' }, toyLoad);
    const b = board(keys, { shift: false, caps: false, option: false }, cp);
    eq(b.length, 5);
    eq(b[3].some(k => k.key === 'LSGT'), false);
    eq(b[3][0], { key: 'LFSH', width: 2.25, text: '⇧', dead: false, kind: 'mod', mod: 'shift', code: 42 });
    const a = b[2].find(k => k.key === 'AC01');
    eq([a.text, a.code], ['x', EVDEV.AC01]);
    const shifted = board(keys, { shift: true, caps: false, option: false }, cp);
    eq(shifted[0].find(k => k.key === 'AE01').text, '!');
    eq(board(keys, { shift: false, caps: false, option: true }, cp)[0].find(k => k.key === 'AE01').text, '',
        'onesuperior is not in the toy table: no label');
});

// The real files: US and German, when xkeyboard-config is installed
const DIRS = ['/usr/share/xkeyboard-config-2/symbols', '/usr/share/X11/xkb/symbols'];
const dir = DIRS.find(d => GLib.file_test(`${d}/us`, GLib.FileTest.EXISTS));
const realLoad = async f => {
    try {
        return new TextDecoder().decode(Gio.File.new_for_path(`${dir}/${f}`).load_contents(null)[1]);
    } catch {
        return null;
    }
};
if (dir) {
    test('real xkb: us basic', async () => {
        const keys = await resolveKeys(splitXkbId('us'), realLoad);
        eq(keys.get('AC01').slice(0, 2), ['a', 'A']);
        eq(keys.get('TLDE').slice(0, 2), ['grave', 'asciitilde']);
        eq(keys.has('LSGT'), false, 'ANSI');
    });
    test('real xkb: de has ISO, ß, dead keys, AltGr €; nodeadkeys replaces them', async () => {
        const keys = await resolveKeys(splitXkbId('de'), realLoad);
        eq(keys.get('AE11')[0], 'ssharp');
        eq(keys.get('AD12')[0], 'plus');
        eq(keys.get('AD03')[2], 'EuroSign');
        eq(keys.has('LSGT'), true);
        eq(keys.get('AE12')[0].startsWith('dead_'), true);
        const nd = await resolveKeys(splitXkbId('de+nodeadkeys'), realLoad);
        eq(nd.get('AE12')[0].startsWith('dead_'), false);
        const b = board(keys, { shift: false, caps: false, option: false }, cp);
        eq(b[3].find(k => k.key === 'AB01').text, 'y', 'QWERTZ');
        eq(b[1].find(k => k.key === 'AD06').text, 'z');
    });
}

await Promise.all(pending);
if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
