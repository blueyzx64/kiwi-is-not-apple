// SPDX-License-Identifier: GPL-3.0-or-later
// App profiles: how Kiwi names and dresses up a few well-known apps, as data.
//
//   APP_PROFILES['org.gnome.Nautilus.desktop']    Files as "Finder"
//   appProfile(appId, isOn)                         the profile, or null while its key is off
//   displayName(appId, fallback, isOn)              the name Kiwi draws for the app
//   profileMenus(profile, actions, _)               the profile's menu plan as menu items
//
// `isOn(key)` reads a boolean Kiwi setting (settings.get_boolean); a profile with a `setting`
// applies only while that key is on. Only labels Kiwi draws change (menu bar, dock, Launchpad,
// Spotlight, the app switcher): the app's .desktop file is never touched.
//
// A menu plan lists, per menu id, items added to Kiwi's generic menus
// (core/appMenus/model.js buildMenus). An item is one of:
//   {id, label, action: 'win.new-tab', accel?}      an org.gtk.Actions action of the app; left
//                                                    out when the app does not export it
//   {id, label, command: {name, target}, accel?}    a generic command (core/appMenus/commands.js)
//   {separator: true}
// `before` puts the items before an item of that menu (else at its end); a menu id the generic
// menus lack becomes a new menu, placed before Window. `labels` renames generic slots.
//
// Nautilus 50 (checked against its 50.4 sources and a live org.gtk.Actions List):
//   app.*  new-window, clone-window, preferences, search-settings, about, help, quit, kill
//   win.*  new-tab, close-current-view, close-other-tabs, undo, redo, go-home, restore-tab,
//          tab-move-left/right, tab-move-new-window, go-to-tab(i), toggle-sidebar,
//          current-location-menu
//   slot.* back, forward, up, open-location, focus-search, search-visible, reload... and
//   view.* cut, copy, paste, new-folder, select-all, zoom... are installed on widgets
//          (gtk_widget_insert_action_group) and NOT exported: Back, Forward, Enclosing Folder,
//          Go to Folder…, New Folder and the clipboard items cannot be driven from outside.
// So Go opens places through the app (org.freedesktop.Application.Open reuses a window that
// already shows the place, else opens one), and Find… asks Nautilus's search provider
// (LaunchSearch: a new window with its search field shown, searching everywhere).
//
// Pure JS (no gi imports): runs under `gjs -m` in tests.

const N_ = s => s;

export const NAUTILUS_ID = 'org.gnome.Nautilus.desktop';

// Nautilus's GNOME Shell search provider (/usr/share/gnome-shell/search-providers)
const NAUTILUS_SEARCH = Object.freeze({
    busName: 'org.gnome.Nautilus', path: '/org/gnome/Nautilus/SearchProvider',
});

const place = (id, label, location, accel = null) =>
    ({ id, label, accel, command: { name: 'open-location', target: { appId: NAUTILUS_ID, location } } });

/**
 * Locations: a URI, '~' for the home folder, or 'xdg:<NAME>' for a GLib.UserDirectory
 * (DESKTOP, DOCUMENTS, DOWNLOAD, MUSIC, PICTURES, VIDEOS), resolved by the adapter.
 */
export const FINDER_PROFILE = Object.freeze({
    id: 'finder',
    setting: 'menubar-finder-name',
    // A product name, not translated (macOS does not translate "Finder" either)
    name: 'Finder',
    labels: Object.freeze({
        'new-window': N_('New Finder Window'),
    }),
    menus: Object.freeze([
        {
            id: 'file',
            before: 'close-window',
            items: [
                { id: 'finder-find', label: N_('Find…'), accel: '<Control>f',
                    command: { name: 'launch-search', target: NAUTILUS_SEARCH } },
                { separator: true },
            ],
        },
        {
            id: 'file',
            items: [
                { id: 'finder-close-tab', label: N_('Close Tab'), action: 'win.close-current-view', accel: '<Control>w' },
                { id: 'finder-restore-tab', label: N_('Reopen Closed Tab'), action: 'win.restore-tab', accel: '<Shift><Control>t' },
            ],
        },
        {
            id: 'view',
            items: [
                { id: 'finder-sidebar', label: N_('Toggle Sidebar'), action: 'win.toggle-sidebar', accel: 'F9' },
            ],
        },
        {
            id: 'go',
            title: N_('Go'),
            items: [
                place('finder-recents', N_('Recents'), 'recent:///'),
                place('finder-documents', N_('Documents'), 'xdg:DOCUMENTS'),
                place('finder-desktop', N_('Desktop'), 'xdg:DESKTOP'),
                place('finder-downloads', N_('Downloads'), 'xdg:DOWNLOAD'),
                // The window's own action when it has one (it navigates in place)
                { id: 'finder-home', label: N_('Home'), action: 'win.go-home', accel: '<Alt>Home',
                    fallback: place('finder-home', N_('Home'), '~').command },
                place('finder-computer', N_('Computer'), 'computer:///'),
                place('finder-network', N_('Network'), 'x-network-view:///'),
                // GNOME has no folder of launchable apps: Launchpad is Kiwi's Applications
                { id: 'finder-applications', label: N_('Applications'), accel: null,
                    command: { name: 'launchpad', target: null } },
            ],
        },
        {
            id: 'window',
            before: 'bring-all-to-front',
            items: [
                { id: 'finder-tab-new-window', label: N_('Move Tab to New Window'), action: 'win.tab-move-new-window' },
                { id: 'finder-close-other-tabs', label: N_('Close Other Tabs'), action: 'win.close-other-tabs' },
                { separator: true },
            ],
        },
    ].map(m => Object.freeze(m))),
});

/** app id -> profile. Add an app here to rename it and give it menus. */
export const APP_PROFILES = Object.freeze({
    [NAUTILUS_ID]: FINDER_PROFILE,
});

const id = appId => (appId && !appId.endsWith('.desktop') ? `${appId}.desktop` : appId);

/**
 * @param {?string} appId desktop id ('org.gnome.Nautilus.desktop'; the suffix is optional)
 * @param {(key: string) => boolean} [isOn] reads a boolean Kiwi setting; omitted = all on
 * @returns {?object} the profile while its setting is on, else null
 */
export function appProfile(appId, isOn = () => true) {
    const profile = APP_PROFILES[id(appId)] ?? null;
    if (!profile)
        return null;
    if (profile.setting) {
        let on = false;
        try {
            on = !!isOn(profile.setting);
        } catch {
            on = false;
        }
        if (!on)
            return null;
    }
    return profile;
}

/**
 * The app name Kiwi draws.
 *
 * @param {?string} appId
 * @param {string} fallback the app's own name
 * @param {(key: string) => boolean} [isOn]
 * @returns {string}
 */
export function displayName(appId, fallback, isOn) {
    return appProfile(appId, isOn)?.name ?? fallback;
}

/**
 * Search words for an app shown under its profile name: the profile name and the app's own
 * name, so both "Finder" and "Files" find it.
 *
 * @returns {string[]}
 */
export function profileKeywords(appId, ownName, isOn) {
    const profile = appProfile(appId, isOn);
    if (!profile)
        return [];
    return [profile.name, ownName].filter(Boolean);
}

/**
 * The profile's menu plan as menu items, resolved against the actions the app exports.
 *
 * @param {?object} profile from appProfile()
 * @param {object[]} actions provider actions ({group, name, enabled, parameterized, state, provider?})
 * @param {Function} _ gettext
 * @returns {{id: string, title: ?string, before: ?string, items: object[]}[]}
 */
export function profileMenus(profile, actions, _) {
    if (!profile)
        return [];
    const byName = new Map();
    for (const a of actions ?? []) {
        if (!a.parameterized)
            byName.set(`${a.group}.${a.name}`, a);
    }
    return profile.menus.map(menu => ({
        id: menu.id,
        title: menu.title ? _(menu.title) : null,
        before: menu.before ?? null,
        items: menu.items.map(it => resolveItem(it, byName, _)).filter(Boolean),
    }));
}

function resolveItem(it, byName, _) {
    if (it.separator)
        return { kind: 'separator' };
    const base = { kind: 'item', id: it.id, label: _(it.label), accel: it.accel ?? null, checked: null };
    if (it.action) {
        const action = byName.get(it.action);
        if (action) {
            return {
                ...base,
                enabled: action.enabled !== false,
                checked: typeof action.state === 'boolean' ? action.state : null,
                command: { provider: action.provider ?? 'gtk', group: action.group, name: action.name },
            };
        }
        if (!it.fallback)
            return null;
        return { ...base, accel: null, enabled: true, command: { provider: 'generic', ...it.fallback } };
    }
    return { ...base, enabled: true, command: { provider: 'generic', ...it.command } };
}
