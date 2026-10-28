// Run: gjs -m tests/kiwiInputModel.test.js
// helpers/kiwi-input: accent table, press-and-hold state machine, Text Replacements, engine list.
import { accentedLetters, pickByDigit, variantsFor } from '../helpers/kiwi-input/accentsModel.js';
import { HoldMachine } from '../helpers/kiwi-input/holdModel.js';
import {
    DEFAULT_REPLACEMENTS, Replacer, TypedBuffer, isTrigger, matchReplacement, parseReplacements,
} from '../helpers/kiwi-input/replacementsModel.js';
import {
    CURATED_LAYOUTS, engineName, enginesXml, layoutsToOffer, xkbIdOfEngine,
} from '../helpers/kiwi-input/enginesModel.js';
import {
    cleanReplacements, hasKiwiSource, kiwiEngineName, withKiwiSources,
} from '../lib/inputSourcesModel.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

const key = (ch, extra = {}) => ({ keyval: ch.codePointAt(0), ch, name: 'other', mods: false, ...extra });
const types = r => r.effects.map(e => e.type);

// --- accents
test('macOS en-US order for the vowels', () => {
    eq(variantsFor('a').join(''), 'àáâäæãåā');
    eq(variantsFor('e').join(''), 'èéêëēėę');
    eq(variantsFor('i').join(''), 'îïíīįì');
    eq(variantsFor('o').join(''), 'ôöòóœøōõ');
    eq(variantsFor('u').join(''), 'ûüùúū');
});
test('consonants and y', () => {
    eq(variantsFor('c').join(''), 'çćč');
    eq(variantsFor('n').join(''), 'ñń');
    eq(variantsFor('s').join(''), 'ßśš');
    eq(variantsFor('z').join(''), 'žźż');
    eq(variantsFor('l').join(''), 'ł');
    eq(variantsFor('y').join(''), 'ÿ');
    eq(variantsFor('g').length > 0, true);
});
test('upper case mirrors lower case; S has no ß', () => {
    eq(variantsFor('E').join(''), 'ÈÉÊËĒĖĘ');
    eq(variantsFor('S').join(''), 'ŚŠ');
    eq(variantsFor('Y').join(''), 'Ÿ');
});
test('letters without variants, digits, empty input', () => {
    eq(variantsFor('b'), []);
    eq(variantsFor('1'), []);
    eq(variantsFor(''), []);
    eq(variantsFor('ab'), []);
});
test('at most nine variants, every letter listed', () => {
    for (const l of accentedLetters())
        eq(variantsFor(l).length <= 9 && variantsFor(l).length > 0, true, l);
});
test('digit pick', () => {
    eq(pickByDigit(variantsFor('e'), '2'), 'é');
    eq(pickByDigit(variantsFor('e'), '9'), null);
    eq(pickByDigit(variantsFor('e'), 'x'), null);
});

// --- hold machine
test('a tap types the letter and cancels the timer on release', () => {
    const m = new HoldMachine();
    const p = m.press(key('e'));
    eq(p.handled, true);
    eq(p.effects, [{ type: 'commit', text: 'e' }, { type: 'start-timer' }]);
    const r = m.release(key('e'));
    eq([r.handled, types(r)], [true, ['cancel-timer']]);
    eq(m.state, 'idle');
});
test('letters without variants pass through', () => {
    const m = new HoldMachine();
    eq(m.press(key('b')), { handled: false, effects: [] });
    eq(m.release(key('b')).handled, false);
});
test('modifiers and a disabled machine pass through', () => {
    eq(new HoldMachine().press(key('e', { mods: true })).handled, false);
    eq(new HoldMachine({ enabled: false }).press(key('e')).handled, false);
});
test('hold: repeats are swallowed, the timer opens the menu', () => {
    const m = new HoldMachine();
    m.press(key('e'));
    eq(m.press(key('e')), { handled: true, effects: [] });
    const t = m.timeout();
    eq(t.effects, [{ type: 'show', variants: variantsFor('e'), cursor: -1 }]);
    eq(m.state, 'open');
    eq(m.release(key('e')).handled, true);
    eq(m.state, 'open');
});
test('pick with a digit replaces the letter', () => {
    const m = new HoldMachine();
    m.press(key('e'));
    m.timeout();
    const r = m.press(key('2'));
    eq(r.effects, [{ type: 'hide' }, { type: 'delete', count: 1 }, { type: 'commit', text: 'é' }]);
    eq(m.state, 'idle');
});
test('a digit past the list does nothing; arrows and Return pick', () => {
    const m = new HoldMachine();
    m.press(key('y'));
    m.timeout();
    eq(m.press(key('5')), { handled: true, effects: [] });
    eq(m.press(key('', { keyval: 1, name: 'Right' })).effects, [{ type: 'cursor', index: 0 }]);
    eq(m.press(key('', { keyval: 2, name: 'Return' })).effects.at(-1), { type: 'commit', text: 'ÿ' });
});
test('Left wraps to the last variant', () => {
    const m = new HoldMachine();
    m.press(key('c'));
    m.timeout();
    eq(m.press(key('', { keyval: 1, name: 'Left' })).effects, [{ type: 'cursor', index: 2 }]);
});
test('Esc closes and keeps the letter', () => {
    const m = new HoldMachine();
    m.press(key('e'));
    m.timeout();
    eq(m.press(key('', { keyval: 3, name: 'Escape' })), { handled: true, effects: [{ type: 'hide' }] });
    eq(m.state, 'idle');
});
test('another key closes the menu and is handled as usual', () => {
    const m = new HoldMachine();
    m.press(key('e'));
    m.timeout();
    const r = m.press(key('x'));
    eq([r.handled, types(r)], [false, ['hide']]);
    m.press(key('e'));
    m.timeout();
    const r2 = m.press(key('a'));
    eq(types(r2), ['hide', 'commit', 'start-timer']);
    eq(m.state, 'holding');
});
test('another key while holding cancels the timer', () => {
    const m = new HoldMachine();
    m.press(key('e'));
    const r = m.press(key('b'));
    eq([r.handled, types(r)], [false, ['cancel-timer']]);
    eq(m.timeout().handled, false);
});
test('click on a candidate, and reset', () => {
    const m = new HoldMachine();
    m.press(key('o'));
    m.timeout();
    eq(m.pick(5).effects.at(-1), { type: 'commit', text: 'ø' });
    m.press(key('o'));
    eq(types(m.reset()), ['cancel-timer']);
    m.press(key('o'));
    m.timeout();
    eq(types(m.reset()), ['hide']);
    eq(m.pick(0).handled, false);
});

// --- text replacements
const map = parseReplacements(DEFAULT_REPLACEMENTS);
test('parse drops bad pairs and duplicates', () => {
    const m = parseReplacements([['omw', 'On my way!'], ['', 'x'], ['a b', 'x'], ['omw', 'dup'], ['ty', ''], ['brb', 'Be right back']]);
    eq([...m.entries()], [['omw', 'On my way!'], ['brb', 'Be right back']]);
});
test('triggers', () => {
    eq([' ', '.', ',', '!', '?'].every(isTrigger), true);
    eq(isTrigger('a'), false);
});
test('match only whole words, on a trigger', () => {
    eq(matchReplacement(map, 'hi omw', ' '), { shortcut: 'omw', phrase: 'On my way!' });
    eq(matchReplacement(map, 'omw', '.'), { shortcut: 'omw', phrase: 'On my way!' });
    eq(matchReplacement(map, 'zomw', ' '), null);
    eq(matchReplacement(map, 'omw', 'x'), null);
    eq(matchReplacement(new Map(), 'omw', ' '), null);
});
test('the longest shortcut wins', () => {
    const m = parseReplacements([['w', 'W'], ['omw', 'On my way!']]);
    eq(matchReplacement(m, 'omw', ' ').shortcut, 'omw');
});
test('expand, then Backspace restores the shortcut once', () => {
    const r = new Replacer(map);
    eq(r.expand('omw', ' '), { delete: 3, text: 'On my way! ' });
    eq(r.backspace(), { delete: 11, text: 'omw ' });
    eq(r.backspace(), null);
});
test('any other key forgets the expansion', () => {
    const r = new Replacer(map);
    r.expand('omw', ' ');
    r.forget();
    eq(r.backspace(), null);
    eq(r.expand('abc', ' '), null);
});
test('typed buffer', () => {
    const b = new TypedBuffer();
    b.type('omw');
    b.backspace();
    eq(b.text, 'om');
    b.type('x'.repeat(100));
    eq(b.text.length, 64);
    b.clear();
    eq(b.text, '');
});

// --- engines
test('engine names round-trip', () => {
    eq(engineName('us'), 'kiwi:us');
    eq(engineName('us+euro'), 'kiwi:us:euro');
    eq(xkbIdOfEngine('kiwi:us:euro'), 'us+euro');
    eq(xkbIdOfEngine('xkb:us::eng'), null);
});
test('offer the curated layouts plus the user\'s own', () => {
    const ids = layoutsToOffer([['xkb', 'us+euro'], ['xkb', 'jp'], ['ibus', 'anthy']]);
    eq(ids.slice(0, CURATED_LAYOUTS.length), [...CURATED_LAYOUTS]);
    eq(ids.includes('jp'), true);
    eq(ids.filter(i => i === 'us+euro').length, 1);
    eq(ids.includes('anthy'), false);
});
test('prefs and engine agree on engine names', () => {
    for (const id of [...CURATED_LAYOUTS, 'jp', 'us+euro'])
        eq(kiwiEngineName(id), engineName(id), id);
});
test('Kiwi sources are appended; nothing removed or duplicated', () => {
    const src = [['xkb', 'us+euro'], ['ibus', 'anthy'], ['xkb', 'de']];
    const r = withKiwiSources(src);
    eq(r.sources, [...src, ['ibus', 'kiwi:us:euro'], ['ibus', 'kiwi:de']]);
    eq(r.added, ['kiwi:us:euro', 'kiwi:de']);
    eq(withKiwiSources(r.sources).added, []);
    eq(hasKiwiSource(src), false);
    eq(hasKiwiSource(r.sources), true);
});
test('replacement editor rows are cleaned', () => {
    eq(cleanReplacements([[' omw ', 'On my way!'], ['a b', 'x'], ['', 'x'], ['ty', ' '], ['omw', 'Later']]),
        [['omw', 'Later']]);
});
test('engines XML escapes and carries layout and variant', () => {
    const x = enginesXml([{ xkbId: 'us+euro', displayName: 'English (US, euro <5>)', shortName: 'en', language: 'en' }]);
    eq(x.includes('<name>kiwi:us:euro</name>'), true);
    eq(x.includes('<layout>us</layout>'), true);
    eq(x.includes('<layout_variant>euro</layout_variant>'), true);
    eq(x.includes('euro &lt;5&gt;'), true);
    eq(enginesXml([{ xkbId: 'de', displayName: 'German' }]).includes('layout_variant'), false);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
