// Run: gjs -m tests/appProfiles.test.js
import {
    APP_PROFILES, NAUTILUS_ID, appProfile, displayName, profileKeywords, profileMenus,
} from '../core/appMenus/profiles.js';
import { buildMenus, parseDescribeAll } from '../core/appMenus/model.js';

let failed = 0;
function test(name, fn) {
    try {
        fn();
        print(`ok   ${name}`);
    } catch (e) {
        failed++;
        print(`FAIL ${name}: ${e.message}`);
    }
}
function eq(a, b) {
    if (JSON.stringify(a) !== JSON.stringify(b))
        throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
const _ = s => s;
const on = () => true;
const off = () => false;
const menu = (menus, id) => menus.find(m => m.id === id);
const ids = m => m.items.map(i => (i.kind === 'separator' ? '-' : i.id));

// What Nautilus 50.4 exports (org.gtk.Actions DescribeAll of /org/gnome/Nautilus and its window)
const nautilus = [
    ...parseDescribeAll({
        'new-window': [true, '', []], 'clone-window': [true, '', []], preferences: [true, '', []],
        'search-settings': [true, '', []], about: [true, '', []], help: [true, '', []],
        quit: [true, '', []], kill: [true, '', []],
    }, 'app'),
    ...parseDescribeAll({
        'current-location-menu': [true, '', []], 'new-tab': [true, '', []], undo: [false, '', []],
        redo: [false, '', []], 'close-current-view': [true, '', []], 'close-other-tabs': [true, '', []],
        'go-home': [true, '', []], 'tab-move-left': [true, '', []], 'tab-move-right': [true, '', []],
        'tab-move-new-window': [true, '', []], 'go-to-tab': [true, 'i', [0]], 'restore-tab': [true, '', []],
        'toggle-sidebar': [false, '', []],
    }, 'win'),
];
const generic = { hasWindow: true, canNewWindow: true, hasAbout: true };

test('Nautilus has a profile keyed by its desktop id', () => {
    eq(APP_PROFILES[NAUTILUS_ID].name, 'Finder');
    eq(appProfile('org.gnome.Nautilus')?.name, 'Finder');
    eq(appProfile('org.gnome.TextEditor.desktop'), null);
});

test('the profile follows its setting', () => {
    const asked = [];
    eq(appProfile(NAUTILUS_ID, k => {
        asked.push(k);
        return false;
    }), null);
    eq(asked, ['menubar-finder-name']);
    eq(displayName(NAUTILUS_ID, 'Files', off), 'Files');
    eq(displayName(NAUTILUS_ID, 'Files', on), 'Finder');
    eq(displayName('org.gnome.Calculator.desktop', 'Calculator', on), 'Calculator');
    eq(displayName(null, 'Files', on), 'Files');
});

test('a setting reader that throws counts as off', () => {
    eq(appProfile(NAUTILUS_ID, () => {
        throw new Error('no such key');
    }), null);
});

test('keywords keep both names searchable', () => {
    eq(profileKeywords(NAUTILUS_ID, 'Files', on), ['Finder', 'Files']);
    eq(profileKeywords(NAUTILUS_ID, 'Files', off), []);
});

test('Finder menus: the app is called Finder everywhere', () => {
    const m = buildMenus({ appName: 'Files', actions: nautilus, generic, _, profile: appProfile(NAUTILUS_ID) });
    eq(m.map(x => x.title), ['Finder', 'File', 'Edit', 'View', 'Go', 'Window', 'Help']);
    const app = menu(m, 'app');
    eq(app.items.find(i => i.id === 'about').label, 'About Finder');
    eq(app.items.find(i => i.id === 'about').command, { provider: 'gtk', group: 'app', name: 'about' });
    eq(app.items.find(i => i.id === 'quit').label, 'Quit Finder');
    eq(menu(m, 'help').items.find(i => i.id === 'help').label, 'Finder Help');
});

test('File: New Finder Window, Find… before Close Window, tab items at the end', () => {
    const m = buildMenus({ appName: 'Files', actions: nautilus, generic, _, profile: appProfile(NAUTILUS_ID) });
    const file = menu(m, 'file');
    eq(file.items[0].label, 'New Finder Window');
    eq(ids(file), ['new-window', 'new-tab', '-', 'finder-find', '-', 'close-window', '-',
        'finder-close-tab', 'finder-restore-tab']);
    eq(file.items.find(i => i.id === 'finder-find').command, {
        provider: 'generic', name: 'launch-search',
        target: { busName: 'org.gnome.Nautilus', path: '/org/gnome/Nautilus/SearchProvider' },
    });
    eq(file.items.find(i => i.id === 'finder-close-tab').command,
        { provider: 'gtk', group: 'win', name: 'close-current-view' });
});

test('Go lists Finder places; Home uses the window action; Applications opens Launchpad', () => {
    const m = buildMenus({ appName: 'Files', actions: nautilus, generic, _, profile: appProfile(NAUTILUS_ID) });
    const go = menu(m, 'go');
    eq(ids(go), ['finder-recents', 'finder-documents', 'finder-desktop', 'finder-downloads',
        'finder-home', 'finder-computer', 'finder-network', 'finder-applications']);
    eq(go.items.find(i => i.id === 'finder-home').command, { provider: 'gtk', group: 'win', name: 'go-home' });
    eq(go.items.find(i => i.id === 'finder-downloads').command, {
        provider: 'generic', name: 'open-location', target: { appId: NAUTILUS_ID, location: 'xdg:DOWNLOAD' },
    });
    eq(go.items.find(i => i.id === 'finder-applications').command, { provider: 'generic', name: 'launchpad', target: null });
    // Go sits before Window
    eq(m.findIndex(x => x.id === 'go') + 1, m.findIndex(x => x.id === 'window'));
});

test('View shows the sidebar toggle with the action state; Window gets the tab items', () => {
    const m = buildMenus({ appName: 'Files', actions: nautilus, generic, _, profile: appProfile(NAUTILUS_ID) });
    const sidebar = menu(m, 'view').items.find(i => i.id === 'finder-sidebar');
    eq([sidebar.enabled, sidebar.accel], [false, 'F9']);
    const win = ids(menu(m, 'window'));
    const at = win.indexOf('finder-tab-new-window');
    eq(win.slice(at, at + 4), ['finder-tab-new-window', 'finder-close-other-tabs', '-', 'bring-all-to-front']);
});

test('before the actions are known (the desktop, a first build): no dead items', () => {
    const m = buildMenus({ appName: 'Files', actions: [], generic: {}, _, profile: appProfile(NAUTILUS_ID) });
    eq(m.map(x => x.title), ['Finder', 'File', 'Go', 'Window', 'Help']);
    const file = ids(menu(m, 'file'));
    eq(file.includes('finder-close-tab'), false);
    // Home falls back to opening the home folder
    eq(menu(m, 'go').items.find(i => i.id === 'finder-home').command,
        { provider: 'generic', name: 'open-location', target: { appId: NAUTILUS_ID, location: '~' } });
});

test('without the profile, Files keeps its own name and the generic menus', () => {
    const m = buildMenus({ appName: 'Files', actions: nautilus, generic, _, profile: appProfile(NAUTILUS_ID, off) });
    eq(m.map(x => x.title), ['Files', 'File', 'Edit', 'Window', 'Help']);
    eq(menu(m, 'file').items[0].label, 'New Window');
});

test('profileMenus translates labels and titles', () => {
    const plan = profileMenus(appProfile(NAUTILUS_ID), [], s => `«${s}»`);
    const go = plan.find(p => p.id === 'go');
    eq(go.title, '«Go»');
    eq(go.items[0].label, '«Recents»');
    eq(profileMenus(null, [], _), []);
});

if (failed)
    throw new Error(`${failed} failed`);
