// Run: gjs -m tests/dockModel.test.js
// features/dock/model.js: the dock's pure decisions.
import {
    RECENT_MAX, AUTOSTART_MARK, Reveal, autostartState, autostartText, clickAction, dockItems,
    dockMetrics, downloadEntry, downloadFinished, dropIndex, fanLayout, menuEntries, nextWindow,
    packageKind, pinPosition, pushRecent, readConfig, sortDownloads, stableOrder, stackView,
} from '../features/dock/model.js';

let failed = 0;
function test(name, fn) {
    try { fn(); print(`ok   ${name}`); } catch (e) { failed++; print(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, msg = '') {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
const kinds = items => items.map(i => (i.kind === 'app' ? `${i.section}:${i.id}${i.running ? '*' : ''}` : i.kind));

// ---- config and sizes
test('config: defaults pass through, bad values fall back', () => {
    const vals = {
        'dock-position': 'top', 'dock-icon-size': 400, 'dock-autohide': false, 'dock-autohide-delay': -5,
        'dock-show-recents': true, 'dock-running-dots': true, 'dock-minimize-to-app': false,
        'dock-downloads': true, 'dock-downloads-view': 'spiral',
    };
    const get = { bool: k => vals[k], int: k => vals[k], string: k => vals[k] };
    const c = readConfig(get);
    eq([c.position, c.iconSize, c.autohideDelay, c.stackView], ['bottom', 128, 0, 'automatic']);
});
test('metrics: the edge claim includes the floating gap; radii are concentric', () => {
    const m = dockMetrics(48);
    eq(m.size, m.thickness + m.gap);
    eq(m.thickness, m.tile + 2 * m.padding);
    eq(m.tileRadius, m.radius - m.padding);
    eq(dockMetrics(4).icon, 24);
});

// ---- contents
test('items: pinned, separator, recent section, separator, Downloads, Trash (macOS order)', () => {
    const items = dockItems({
        pinned: ['files', 'editor'], running: ['editor', 'calc'], recents: ['calc', 'music', 'web', 'old'],
        showRecents: true,
    });
    eq(kinds(items), ['pinned:files', 'pinned:editor*', 'separator', 'recent:calc*', 'recent:music',
        'recent:web', 'separator', 'downloads', 'trash']);
});
test('items: running unpinned apps can outnumber the recent slots; closed ones then wait', () => {
    const items = dockItems({ pinned: [], running: ['a', 'b', 'c', 'd'], recents: ['x'], showRecents: true });
    eq(kinds(items).filter(k => k.startsWith('recent')), ['recent:a*', 'recent:b*', 'recent:c*', 'recent:d*']);
    eq(kinds(items)[0], 'recent:a*', 'no separator before the first section when nothing is pinned');
});
test('items: recents off puts running apps after the pinned ones without a separator', () => {
    const items = dockItems({ pinned: ['files'], running: ['calc'], recents: ['music'], showRecents: false, downloads: false });
    eq(kinds(items), ['pinned:files', 'running:calc*', 'separator', 'trash']);
});
test('items: minimized windows get tiles before the stack', () => {
    const items = dockItems({ pinned: [], running: [], recents: [], showRecents: true, minimized: [7] });
    eq(items.map(i => i.id), ['separator-system', 'window-7', 'downloads', 'trash']);
});
test('recents: newest first, deduplicated, capped', () => {
    let r = [];
    for (const id of ['a', 'b', 'a', 'c', 'd'])
        r = pushRecent(r, id);
    eq(r, ['d', 'c', 'a']);
    eq(r.length, RECENT_MAX);
    eq(pushRecent(r, null), r);
});
test('stable order: focus changes do not reorder running icons', () => {
    eq(stableOrder(['a', 'b', 'c'], ['c', 'a', 'd']), ['a', 'c', 'd']);
});

// ---- clicks
const w = (id, minimized = false) => ({ id, minimized });
test('click: launch, activate, nothing on the focused single-window app', () => {
    eq(clickAction({ windows: [], focused: false, button: 1, canNewWindow: true }).type, 'launch');
    eq(clickAction({ windows: [w(3), w(4)], focused: false, focusedWindow: null, button: 1 }), { type: 'activate', windowId: 3 });
    eq(clickAction({ windows: [w(3)], focused: true, focusedWindow: 3, button: 1 }).type, 'none');
});
test('click: the focused app with several windows cycles through all of them', () => {
    const wins = [w(1), w(2), w(3)];
    eq(clickAction({ windows: wins, focused: true, focusedWindow: 1, button: 1 }), { type: 'activate', windowId: 3 });
    eq(nextWindow([w(3), w(1), w(2)], 3), 2);
    eq(nextWindow([], 1), null);
});
test('click: a minimized-only app is brought back; middle click opens a new window', () => {
    eq(clickAction({ windows: [w(5, true)], focused: false, button: 1 }), { type: 'activate', windowId: 5 });
    eq(clickAction({ windows: [w(5)], focused: true, focusedWindow: 5, button: 2, canNewWindow: true }).type, 'new-window');
    eq(clickAction({ windows: [], focused: false, button: 2, canNewWindow: false }).type, 'launch');
});

// ---- menu
const menuBase = {
    windows: [], focusedWindow: null, actions: [], canNewWindow: true, pinned: true,
    hasDesktopFile: true, autostart: { enabled: false, editable: true }, alt: false,
};
test('menu: a running app lists its windows, actions, New Window, Options and Quit', () => {
    const m = menuEntries({
        ...menuBase, windows: [{ id: 1, title: 'Doc', minimized: false }, { id: 2, title: 'Min', minimized: true }],
        focusedWindow: 1, actions: [{ id: 'new-private', name: 'New Private Window' }],
    });
    eq(m.map(e => e.type), ['window', 'window', 'separator', 'action', 'new-window', 'separator', 'options', 'separator', 'quit']);
    eq([m[0].focused, m[1].minimized], [true, true]);
    eq(m.find(e => e.type === 'options').items.map(i => i.type), ['keep-in-dock', 'open-at-login', 'show-in-files']);
});
test('menu: the app\'s own new-window action is not listed twice', () => {
    const m = menuEntries({ ...menuBase, windows: [{ id: 1, title: 'x' }], actions: [{ id: 'new-window', name: 'New Window' }] });
    eq(m.filter(e => e.type === 'action').length, 0);
    eq(menuEntries({ ...menuBase, actions: [{ id: 'new-window', name: 'New Window' }] })[0].type, 'action');
});
test('menu: not running shows Open and no Quit; Alt turns Quit into Force Quit', () => {
    eq(menuEntries(menuBase).map(e => e.type), ['open', 'separator', 'options']);
    const alt = menuEntries({ ...menuBase, windows: [{ id: 1, title: 'x' }], alt: true });
    eq(alt[alt.length - 1].type, 'force-quit');
});
test('menu: window-backed apps cannot be kept or opened at login', () => {
    const m = menuEntries({ ...menuBase, hasDesktopFile: false, windows: [{ id: 1, title: 'x' }] });
    eq(m.find(e => e.type === 'options').items.map(i => i.sensitive), [false, false, false]);
});

// ---- drag and drop
test('drop index and pin position', () => {
    eq(dropIndex([10, 30, 50], 5), 0);
    eq(dropIndex([10, 30, 50], 31), 2);
    eq(dropIndex([10, 30, 50], 99), 3);
    eq(pinPosition(['a', 'b'], 7), 2);
    eq(pinPosition(['a', 'b'], -1), 0);
});

// ---- Downloads stack
test('packages get badges; partial downloads do not', () => {
    eq(['x.rpm', 'a.flatpakref', 'b.flatpak', 'Tool.AppImage', 'doc.pdf'].map(packageKind), ['rpm', 'flatpak', 'flatpak', 'appimage', null]);
    const part = downloadEntry({ name: 'big.rpm.part', changed: 5 });
    eq([part.partial, part.badge, part.label], [true, null, 'big.rpm']);
});
test('entries: hidden and backup files are skipped; Date Added prefers ctime/birth time', () => {
    eq(downloadEntry({ name: '.secret' }), null);
    eq(downloadEntry({ name: 'x', backup: true }), null);
    eq(downloadEntry({ name: 'a', changed: 10, created: 20, modified: 99 }).added, 20);
    eq(downloadEntry({ name: 'a', modified: 7 }).added, 7);
});
test('sort: newest first, names break ties', () => {
    const e = n => downloadEntry({ name: n[0], changed: n[1] });
    eq(sortDownloads([e(['b', 1]), e(['c', 3]), e(['a', 1])]).map(x => x.name), ['c', 'a', 'b']);
});
test('a partial file turning final is a finished download', () => {
    const before = [downloadEntry({ name: 'a.rpm.crdownload', changed: 1 })];
    eq(downloadFinished(before, [downloadEntry({ name: 'a.rpm', changed: 2 })]), true);
    eq(downloadFinished(before, before), false);
    eq(downloadFinished([], [downloadEntry({ name: 'a.rpm' })]), false);
});
test('stack view: Automatic fans a short stack from a bottom dock; side docks never fan', () => {
    eq(stackView('automatic', 'bottom', 4), 'fan');
    eq(stackView('automatic', 'bottom', 40), 'grid');
    eq(stackView('automatic', 'left', 4), 'grid');
    eq(stackView('fan', 'right', 4), 'list');
    eq(stackView('list', 'bottom', 4), 'list');
});
test('fan rows rise, drift right and turn more as they go', () => {
    const rows = fanLayout(4, 50);
    eq(rows.map(r => r.dy), [-50, -100, -150, -200]);
    eq(rows.every((r, i) => i === 0 || (r.dx >= rows[i - 1].dx && r.angle > rows[i - 1].angle)), true);
});

// ---- Open at Login
test('autostart state: none, Kiwi-made, the user\'s own (read only), disabled', () => {
    eq(autostartState(null), { enabled: false, kiwi: false, editable: true });
    eq(autostartState(`[Desktop Entry]\nName=A\n${AUTOSTART_MARK}=true\n`), { enabled: true, kiwi: true, editable: true });
    eq(autostartState('[Desktop Entry]\nName=A\n'), { enabled: true, kiwi: false, editable: false });
    eq(autostartState('[Desktop Entry]\nX-GNOME-Autostart-enabled=false\n').enabled, false);
    eq(autostartState('[Desktop Entry]\nName=A\n[Desktop Action x]\nHidden=true\n').enabled, true);
});
test('autostart text: the app entry, marked, without keys that stop it', () => {
    const t = autostartText('[Desktop Entry]\nName=Calc\nHidden=true\nExec=calc\n[Desktop Action new]\nName=New\n');
    eq(t, `[Desktop Entry]\n${AUTOSTART_MARK}=true\nName=Calc\nExec=calc\n[Desktop Action new]\nName=New\n`);
    eq(autostartState(t), { enabled: true, kiwi: true, editable: true });
});

// ---- auto-hide
test('reveal: off is always visible', () => {
    const r = new Reveal(false);
    eq([r.visible, r.wantsTimer], [true, false]);
});
test('reveal: edge arms the delay, reveal shows, leaving hides', () => {
    const r = new Reveal(true);
    eq(r.settle(), false);
    r.edge(true);
    eq(r.wantsTimer, true);
    r.reveal();
    eq([r.settle(), r.wantsTimer], [true, false]);
    // leave the edge and enter the dock in one batch: never hidden in between
    r.edge(false);
    r.dock(true);
    eq(r.settle(), true);
    r.dock(false);
    eq(r.settle(), false);
});
test('reveal: a menu or drag holds the dock up after the pointer leaves', () => {
    const r = new Reveal(true);
    r.reveal();
    r.dock(true);
    r.settle();
    r.hold();
    r.dock(false);
    eq(r.settle(), true);
    r.unhold();
    eq(r.settle(), false);
    r.unhold();
    eq(r.holds, 0);
});
test('reveal: leaving the edge before the delay disarms it', () => {
    const r = new Reveal(true);
    r.edge(true);
    r.edge(false);
    eq([r.wantsTimer, r.settle()], [false, false]);
});

if (failed) {
    print(`${failed} failed`);
    imports.system.exit(1);
}
