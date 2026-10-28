// Run: gjs -m tests/widgetsKinds.test.js
// The data shaping of the widget kinds added after the first set: World Clock fallback, Up
// Next, Reminders (iCalendar VTODO), Notes, Photos, Recent Files, System disk and network,
// Timers and icon grids (core/widgets/data.js), and the photo decode's cover crop and rounded
// corners (lib/wallpaperModel.js).
import {
    DEFAULT_WORLD_CLOCKS, fallbackClocks, agenda, nextEvent, startsIn, unfoldIcs, parseTodo, sortReminders,
    icsUtc, completeTodo, taskListOf, parseNotes, serializeNotes, NOTE_MAX, isPhotoType, isPhotoDir, pickPhoto,
    photoSlot, parseRecent, uriName, recentFiles, timeAgo, parseNetDev, netRate, formatRate, rateLevel,
    formatCountdown, durationName, TILE_GRID,
} from '../core/widgets/data.js';
import { coverCrop, roundCornersAlpha } from '../lib/wallpaperModel.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

test('world clock: macOS cities while GNOME Clocks has none, without the local one', () => {
    eq(DEFAULT_WORLD_CLOCKS.slice(0, 4).map(c => c.name), ['Cupertino', 'Tokyo', 'Sydney', 'Paris']);
    eq(fallbackClocks('Asia/Tokyo').map(c => c.name), ['Cupertino', 'Sydney', 'Paris', 'New York', 'London']);
    eq(fallbackClocks('Europe/Riga').length, 6);
});

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m);
const EVENTS = [
    { id: 'past', summary: 'Gone', date: at(27, 9), end: at(27, 10) },
    { id: 'late', summary: 'Late', date: at(27, 18), end: at(27, 19) },
    { id: 'now', summary: 'Now', date: at(27, 11), end: at(27, 13) },
    { id: 'all', summary: 'Holiday', date: at(27, 0), end: at(28, 0) },
    { id: 'tmr', summary: 'Tomorrow', date: at(28, 9), end: at(28, 10) },
    { id: 'fri', summary: 'Friday', date: at(30, 9), end: at(30, 10) },
];

test('Up Next: events grouped by day, all-day first', () => {
    const g = agenda(EVENTS, at(27, 12), 10);
    eq(g.map(x => x.day), [0, 1, 3]);
    eq(g[0].events.map(e => e.id), ['all', 'now', 'late']);
    eq(g[1].events.map(e => e.id), ['tmr']);
    eq(agenda(EVENTS, at(27, 12), 2).map(x => x.events.length), [2]);
    eq(agenda([], at(27, 12), 5), []);
});

test('Up Next: leads with the next timed event, says when it starts', () => {
    eq(nextEvent(EVENTS, at(27, 12)).id, 'now');
    eq(nextEvent(EVENTS, at(27, 14)).id, 'late');
    eq(nextEvent([{ id: 'a', summary: 'A', date: at(27, 0), end: at(28, 0) }], at(27, 12)).id, 'a');
    eq(nextEvent([], at(27, 12)), null);
    eq(startsIn(at(27, 12, 25), at(27, 12)), 'In 25 min');
    eq(startsIn(at(27, 15), at(27, 12)), 'In 3 h');
    eq(startsIn(at(27, 11), at(27, 12)), 'Now');
    eq(startsIn(at(29, 11), at(27, 12)), '');
});

const TODO = [
    'BEGIN:VTODO',
    'UID:20261028-abc@kiwi',
    'DTSTAMP:20261027T100000Z',
    'SUMMARY:Buy milk\\, eggs and a long name that is folded over two',
    '  lines',
    'DUE;VALUE=DATE:20261029',
    'PRIORITY:1',
    'STATUS:NEEDS-ACTION',
    'PERCENT-COMPLETE:0',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'STATUS:IGNORED-IN-ALARM',
    'END:VALARM',
    'END:VTODO',
].join('\r\n');

test('reminders: a VTODO is read, folded lines and escapes included', () => {
    eq(unfoldIcs('A:b\r\n c\n\td'), 'A:bcd');
    const r = parseTodo(TODO);
    eq(r.uid, '20261028-abc@kiwi');
    eq(r.summary, 'Buy milk, eggs and a long name that is folded over two lines');
    eq(r.allDay, true);
    eq([r.due.getFullYear(), r.due.getMonth(), r.due.getDate()], [2026, 9, 29]);
    eq(r.priority, 1);
    eq(r.completed, false);
    eq(r.recurring, false);
    const timed = parseTodo('BEGIN:VCALENDAR\nBEGIN:VTODO\nUID:x\nSUMMARY:Call\nDUE:20261028T150000Z\nRRULE:FREQ=WEEKLY\nEND:VTODO\nEND:VCALENDAR');
    eq(timed.due.toISOString(), '2026-10-28T15:00:00.000Z');
    eq(timed.allDay, false);
    eq(timed.recurring, true);
    eq(parseTodo('BEGIN:VTODO\nUID:y\nCOMPLETED:20261001T000000Z\nEND:VTODO').completed, true);
    eq(parseTodo('BEGIN:VEVENT\nUID:z\nEND:VEVENT'), null);
    eq(parseTodo('BEGIN:VTODO\nSUMMARY:no uid\nEND:VTODO'), null);
    eq(parseTodo(''), null);
});

test('reminders: open ones, due first, then priority, then name', () => {
    const r = (summary, due, priority = 0, completed = false) => ({ summary, due, priority, completed });
    const list = [
        r('b', null, 0), r('a', null, 0), r('high', null, 1), r('later', at(30, 9)), r('soon', at(28, 9)),
        r('done', at(27, 9), 1, true), r('mid', null, 5),
    ];
    eq(sortReminders(list).map(x => x.summary), ['soon', 'later', 'high', 'mid', 'a', 'b']);
});

test('reminders: ticking one marks it done and keeps the rest', () => {
    const now = new Date(Date.UTC(2026, 9, 28, 15, 30, 5));
    eq(icsUtc(now), '20261028T153005Z');
    const out = completeTodo(TODO, now);
    const lines = out.split('\r\n');
    eq(lines.filter(l => l.startsWith('STATUS:')), ['STATUS:IGNORED-IN-ALARM', 'STATUS:COMPLETED']);
    eq(lines.filter(l => l.startsWith('PERCENT-COMPLETE')), ['PERCENT-COMPLETE:100']);
    eq(lines.includes('COMPLETED:20261028T153005Z'), true);
    eq(lines.includes('ACTION:DISPLAY'), true);
    eq(lines[lines.length - 1], 'END:VTODO');
    eq(lines.indexOf('STATUS:COMPLETED') > lines.indexOf('END:VALARM'), true);
    const back = parseTodo(out);
    eq([back.completed, back.uid, back.priority], [true, '20261028-abc@kiwi', 1]);
});

test('reminders: task lists from EDS source key files', () => {
    const data = '[Data Source]\nDisplayName=Personal\nEnabled=true\nParent=local-stub\n\n[Task List]\nBackendName=local\nColor=#62a0ea\n';
    eq(taskListOf(data), { name: 'Personal', enabled: true, color: '#62a0ea' });
    eq(taskListOf(data.replace('Enabled=true', 'Enabled=false')).enabled, false);
    eq(taskListOf('[Data Source]\nDisplayName=Contacts\n[Address Book]\nBackendName=local\n'), null);
    eq(taskListOf(''), null);
});

test('notes: stored per id, empty notes dropped, malformed is empty', () => {
    eq(parseNotes(''), {});
    eq(parseNotes('nope'), {});
    eq(parseNotes('{"notes":{"default":"hi","bad":3}}'), { default: 'hi' });
    eq(serializeNotes({}, 'default', 'Hello\nworld'), '{"notes":{"default":"Hello\\nworld"}}');
    eq(serializeNotes({ default: 'x' }, 'default', '  '), '');
    eq(serializeNotes({ a: 'x' }, 'b', 'y'), '{"notes":{"a":"x","b":"y"}}');
    eq(parseNotes(serializeNotes({}, 'n', 'z'.repeat(NOTE_MAX + 50))).n.length, NOTE_MAX);
});

test('photos: which files and folders, and a stable pick per slot', () => {
    eq(['image/jpeg', 'image/PNG', 'image/svg+xml', 'image/gif', 'text/plain', null].map(isPhotoType),
        [true, true, false, false, false, false]);
    eq(['Holidays', 'Screenshots', '.cache', 'Wallpapers', ''].map(isPhotoDir), [true, false, false, false, false]);
    eq(pickPhoto(0, 5), -1);
    eq(pickPhoto(10, 5), pickPhoto(10, 5));
    const picks = new Set();
    for (let s = 0; s < 50; s++) {
        const i = pickPhoto(7, s);
        if (i < 0 || i >= 7)
            throw new Error(`out of range: ${i}`);
        picks.add(i);
    }
    eq(picks.size > 4, true, 'spread');
    eq(pickPhoto(7, 3, 1) !== pickPhoto(7, 3, 0) || pickPhoto(7, 3, 2) !== pickPhoto(7, 3, 0), true, 'shuffle moves');
    const d = new Date(2026, 9, 28, 10, 15);
    eq(photoSlot(d, 'hourly'), photoSlot(new Date(2026, 9, 28, 10, 59), 'hourly'));
    eq(photoSlot(d, 'hourly') + 1, photoSlot(new Date(2026, 9, 28, 11, 0), 'hourly'));
    eq(photoSlot(d, 'daily'), photoSlot(new Date(2026, 9, 28, 23, 59), 'daily'));
});

test('photos: cover crop and rounded corners for the decode', () => {
    eq(coverCrop(4000, 3000, 364, 170), { width: 364, height: 273, x: 0, y: 51 });
    eq(coverCrop(1000, 3000, 170, 170), { width: 170, height: 510, x: 0, y: 170 });
    eq(coverCrop(170, 170, 170, 170), { width: 170, height: 170, x: 0, y: 0 });
    // an 8x8 RGBA square with a radius of 3: corners clear, the middle and the edges' centres kept
    const w = 8, h = 8, rs = w * 4;
    const px = new Uint8Array(rs * h).fill(255);
    roundCornersAlpha(px, w, h, rs, 3);
    const a = (x, y) => px[y * rs + x * 4 + 3];
    eq([a(0, 0), a(7, 0), a(0, 7), a(7, 7)], [0, 0, 0, 0]);
    eq([a(3, 3), a(0, 4), a(4, 0), a(7, 4), a(4, 7), a(1, 1)], [255, 255, 255, 255, 255, 255]);
    eq(a(0, 1) > 0 && a(0, 1) < 255, true, 'antialiased edge');
    eq(px[0], 255, 'colour untouched');
});

const XBEL = `<?xml version="1.0" encoding="UTF-8"?>
<xbel version="1.0" xmlns:bookmark="http://www.freedesktop.org/standards/desktop-bookmarks" xmlns:mime="http://www.freedesktop.org/standards/shared-mime-info">
  <bookmark href="file:///home/u/Documents/Report%202026.odt" added="2026-10-20T10:00:00.000000Z" modified="2026-10-28T09:00:00.000000Z" visited="2026-10-20T10:00:00.000000Z">
    <info><metadata owner="http://freedesktop.org"><mime:mime-type type="application/vnd.oasis.opendocument.text"/></metadata></info>
  </bookmark>
  <bookmark href="file:///home/u/Pictures/a&amp;b.png" added="2026-10-27T10:00:00Z" modified="2026-10-27T10:00:00Z" visited="2026-10-27T10:00:00Z">
    <info><metadata owner="http://freedesktop.org"><mime:mime-type type="image/png" /></metadata></info>
  </bookmark>
  <bookmark href="https://example.com/x" added="2026-10-28T11:00:00Z" modified="2026-10-28T11:00:00Z" visited="2026-10-28T11:00:00Z"></bookmark>
  <bookmark href="file:///home/u/Documents/Report%202026.odt" added="2026-10-01T10:00:00Z" modified="2026-10-01T10:00:00Z" visited="2026-10-01T10:00:00Z"></bookmark>
  <bookmark added="2026-10-01T10:00:00Z"></bookmark>
</xbel>`;

test('recent files: read from the xbel, local only, newest first, once each', () => {
    const items = parseRecent(XBEL);
    eq(items.length, 4);
    eq(items[1].uri, 'file:///home/u/Pictures/a&b.png');
    eq(items[0].mime, 'application/vnd.oasis.opendocument.text');
    eq(items[1].mime, 'image/png');
    const files = recentFiles(items, 10);
    eq(files.map(f => f.name), ['Report 2026.odt', 'a&b.png']);
    eq(recentFiles(items, 1).length, 1);
    eq(uriName('file:///x/%E2%9C%93%20done.txt'), '✓ done.txt');
    eq(uriName('file:///x/bad%E2'), 'bad%E2');
    eq(parseRecent('garbage'), []);
});

test('recent files: how long ago', () => {
    const now = new Date(2026, 9, 28, 12, 0).getTime();
    eq(timeAgo(now - 20000, now), 'Just now');
    eq(timeAgo(now - 5 * 60000, now), '5 min ago');
    eq(timeAgo(now - 3 * 3600000, now), '3 h ago');
    eq(timeAgo(new Date(2026, 9, 27, 20, 0).getTime(), now), 'Yesterday');
    eq(timeAgo(new Date(2026, 9, 20).getTime(), now), '');
});

test('system: network counters, rates and levels', () => {
    const dev = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 5000 10 0 0 0 0 0 0 5000 10 0 0 0 0 0 0
  eth0: 1000 10 0 0 0 0 0 0 200 3 0 0 0 0 0 0
 wlan0: 3000 10 0 0 0 0 0 0 800 3 0 0 0 0 0 0`;
    eq(parseNetDev(dev), { rx: 4000, tx: 1000 });
    eq(parseNetDev('nothing'), null);
    eq(netRate({ rx: 1000, tx: 0 }, { rx: 5000, tx: 2000 }, 2), { rx: 2000, tx: 1000 });
    eq(netRate({ rx: 9000, tx: 0 }, { rx: 10, tx: 0 }, 2), { rx: 0, tx: 0 });
    eq(netRate(null, { rx: 1, tx: 1 }, 2), { rx: 0, tx: 0 });
    eq([formatRate(820), formatRate(12345), formatRate(3.44e6), formatRate(25e6)], ['820 B/s', '12 KB/s', '3.4 MB/s', '25 MB/s']);
    eq([rateLevel(0), rateLevel(1e8), rateLevel(1e9)], [0, 1, 1]);
    eq(Math.round(rateLevel(1e5) * 10), 4);
});

test('timers: countdowns and names', () => {
    eq([formatCountdown(0), formatCountdown(1), formatCountdown(65000), formatCountdown(3723000)], ['0:00', '0:01', '1:05', '1:02:03']);
    eq([durationName(30000), durationName(300000), durationName(5400000), durationName(7200000)], ['30 s', '5 min', '1 h 30 min', '2 h']);
});

test('icon grids per size', () => {
    eq(Object.keys(TILE_GRID), ['small', 'medium', 'large', 'extraLarge']);
    eq(TILE_GRID.medium.cols * TILE_GRID.medium.rows, 8);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
