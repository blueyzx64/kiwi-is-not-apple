// SPDX-License-Identifier: GPL-3.0-or-later
// Drives the Kiwi input engine through a real ibus-daemon (started by engine-test.sh) as an app
// would: one input context with surrounding-text support, a simulated document that receives
// commits, deletions and the keys the engine lets through. Prints PASS/FAIL lines.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import IBus from 'gi://IBus?version=1.0';
import System from 'system';

Gio._promisify(IBus.InputContext.prototype, 'process_key_event_async', 'process_key_event_async_finish');

const sleep = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));

// evdev keycodes, as the Shell passes them
const KEYS = {
    e: [IBus.KEY_e, 18], o: [IBus.KEY_o, 24], m: [IBus.KEY_m, 50], w: [IBus.KEY_w, 17],
    ' ': [IBus.KEY_space, 57], 2: [IBus.KEY_2, 3], BackSpace: [IBus.KEY_BackSpace, 14],
    Escape: [IBus.KEY_Escape, 1],
};

let failed = 0;
function check(name, ok, detail) {
    if (!ok)
        failed++;
    print(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` ${detail}` : ''}`);
}

IBus.init();
const bus = new IBus.Bus();
for (let i = 0; i < 50 && !bus.is_connected(); i++)
    await sleep(100);
check('bus', bus.is_connected());

const ic = bus.create_input_context('kiwi-engine-test');
ic.set_capabilities(IBus.Capabilite.FOCUS | IBus.Capabilite.SURROUNDING_TEXT | IBus.Capabilite.PREEDIT_TEXT |
    IBus.Capabilite.LOOKUP_TABLE);
const doc = { text: '', table: null, tableVisible: false };
ic.connect('commit-text', (_ic, t) => {
    doc.text += t.get_text();
});
ic.connect('delete-surrounding-text', (_ic, offset, n) => {
    if (offset < 0)
        doc.text = [...doc.text].slice(0, offset).concat([...doc.text].slice(offset + n || doc.text.length)).join('');
});
ic.connect('update-lookup-table', (_ic, table, visible) => {
    doc.table = table;
    doc.tableVisible = visible;
});
ic.connect('hide-lookup-table', () => {
    doc.tableVisible = false;
});
// Apps without surrounding text get a Backspace key instead of a deletion
ic.connect('forward-key-event', (_ic, keyval, _keycode, state) => {
    if (keyval === IBus.KEY_BackSpace && !(state & IBus.ModifierType.RELEASE_MASK))
        doc.text = [...doc.text].slice(0, -1).join('');
});
ic.focus_in();

// As GNOME Shell does: one global engine; ibus-daemon starts the component's exec on demand
let engine = null;
for (let i = 0; i < 30 && !engine; i++) {
    bus.set_global_engine_async('kiwi:us', 3000, null, null);
    await sleep(200);
    engine = ic.get_engine()?.get_name() === 'kiwi:us' ? 'kiwi:us' : null;
}
check('engine kiwi:us active (started by ibus-daemon)', !!engine, ic.get_engine()?.get_name() ?? 'none');

/** One press or release; an unhandled press types its character, as the app would. */
async function send(name, release = false) {
    const [keyval, keycode] = KEYS[name];
    const state = release ? IBus.ModifierType.RELEASE_MASK : 0;
    const handled = await ic.process_key_event_async(keyval, keycode, state, -1, null);
    await sleep(60);
    if (!handled && !release) {
        if (name === 'BackSpace')
            doc.text = [...doc.text].slice(0, -1).join('');
        else if (name.length === 1)
            doc.text += name;
    }
    return handled;
}
async function tap(name) {
    await send(name);
    await send(name, true);
}
const candidates = () => {
    const t = doc.table;
    if (!t)
        return [];
    const out = [];
    for (let i = 0; i < t.get_number_of_candidates(); i++)
        out.push(t.get_candidate(i).get_text());
    return out;
};

// A short tap types the letter, no menu
await tap('e');
await sleep(700);
check('tap e types e, no menu', doc.text === 'e' && !doc.tableVisible, JSON.stringify(doc.text));

// Hold e past the key-repeat delay: the menu opens with the macOS variants
doc.text = '';
await send('e');
for (let i = 0; i < 8; i++) {
    await sleep(80);
    await send('e');                       // auto-repeat presses are swallowed
}
await sleep(300);
const list = candidates();
check('hold e shows variants', doc.tableVisible && list.join('') === 'èéêëēėę', list.join(' '));
check('hold e typed one e', doc.text === 'e', JSON.stringify(doc.text));
await send('e', true);
check('menu stays after release', doc.tableVisible);
await tap('2');
check('2 picks é and replaces e', doc.text === 'é' && !doc.tableVisible, JSON.stringify(doc.text));

// Esc closes and keeps the letter
doc.text = '';
await send('e');
await sleep(700);
await send('e', true);
await tap('Escape');
check('Esc keeps e', doc.text === 'e' && !doc.tableVisible, JSON.stringify(doc.text));

// Without surrounding text the letter is removed with a forwarded Backspace
ic.set_capabilities(IBus.Capabilite.FOCUS | IBus.Capabilite.PREEDIT_TEXT | IBus.Capabilite.LOOKUP_TABLE);
doc.text = '';
await send('e');
await sleep(700);
await send('e', true);
await tap('2');
check('no surrounding text: Backspace then é', doc.text === 'é', JSON.stringify(doc.text));
ic.set_capabilities(IBus.Capabilite.FOCUS | IBus.Capabilite.SURROUNDING_TEXT | IBus.Capabilite.PREEDIT_TEXT |
    IBus.Capabilite.LOOKUP_TABLE);

// Text Replacements: omw + space, then Backspace restores the shortcut
ic.reset();
doc.text = '';
for (const k of ['o', 'm', 'w', ' '])
    await tap(k);
check('omw + space expands', doc.text === 'On my way! ', JSON.stringify(doc.text));
await tap('BackSpace');
check('Backspace undoes the expansion', doc.text === 'omw ', JSON.stringify(doc.text));
await tap('BackSpace');
check('a second Backspace is ordinary', doc.text === 'omw', JSON.stringify(doc.text));

print(failed ? `engine-test: ${failed} failed` : 'engine-test: all passed');
System.exit(failed ? 1 : 0);
