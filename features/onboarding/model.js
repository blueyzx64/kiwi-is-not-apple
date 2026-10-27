// SPDX-License-Identifier: GPL-3.0-or-later
// Kiwi's Setup Assistant (overhaul plan §9, research installer-and-app-lifecycle.md §4.4 option
// A): a declarative list of steps, rendered once in the preferences window, and the rules for
// when the Shell offers it.
//
// Lifecycle of the `onboarding` key:
//   'new'        never offered (the default). The Shell offers it once the session is idle:
//                only in the normal user session, never over another modal (GNOME's welcome
//                dialog), else it waits for the next enable.
//   'requested'  the Shell opened the preferences for it; prefs presents the assistant
//   'shown'      the assistant is up
//   'done'       finished or skipped ("Not Now" keeps every default). Re-run from About.
//
// Every control writes a Kiwi key, except Appearance's Light/Dark, which is the user choosing
// GNOME's own color-scheme (as in GNOME Settings; Kiwi does not own it, so there is nothing to
// restore). Keys are checked against the schema in tests/onboardingModel.test.js.
//
// Pure JS (no gi imports): runs under `gjs -m` in tests.

const N_ = s => s;

export const ONBOARDING_KEY = 'onboarding';
export const STATES = Object.freeze(['new', 'requested', 'shown', 'done']);

/**
 * What the Shell does now: 'offer' (open it), 'after-overview' (GNOME starts in the overview:
 * ask again when it closes) or 'not-now' (another session mode or another modal such as GNOME's
 * welcome dialog; the next enable asks again).
 */
export function offerDecision({ state, sessionMode, overviewVisible, modalOpen }) {
    if (state !== 'new' || sessionMode !== 'user')
        return 'not-now';
    if (overviewVisible)
        return 'after-overview';
    return modalOpen ? 'not-now' : 'offer';
}

/** Should the preferences window present the assistant as it opens? */
export const shouldPresent = state => state === 'requested';

export const ACCENTS = Object.freeze([
    ['multicolor', N_('Multicolor')], ['blue', N_('Blue')], ['purple', N_('Purple')], ['pink', N_('Pink')],
    ['red', N_('Red')], ['orange', N_('Orange')], ['yellow', N_('Yellow')], ['green', N_('Green')],
    ['graphite', N_('Graphite')],
]);

/**
 * Control kinds the renderer knows:
 *   appearance  Light / Dark / Auto (appearanceChoice, appearanceWrites)
 *   accent      colour swatches over a string key
 *   choice      a toggle group over a string key with fixed values
 *   size        a slider over an integer key
 *   switch      a boolean key
 */
export const STEPS = Object.freeze([
    {
        id: 'welcome', icon: 'kiwi-logo',
        title: N_('Welcome to Kiwi'),
        body: N_('Make GNOME feel like a Mac. Choose a few things now, or keep the macOS defaults and change them later in Kiwi Settings.'),
        controls: [],
    },
    {
        id: 'appearance', icon: 'applications-graphics-symbolic',
        title: N_('Choose Your Look'),
        body: N_('Light, Dark, or Auto, which switches between them through the day.'),
        controls: [
            { type: 'appearance' },
            { type: 'accent', key: 'appearance-accent', title: N_('Accent Colour') },
        ],
    },
    {
        id: 'dock', icon: 'user-desktop-symbolic',
        title: N_('Your Dock'),
        body: N_('Your favourite apps, running apps, Downloads and the Trash.'),
        controls: [
            {
                type: 'choice', key: 'dock-position', title: N_('Position on Screen'),
                values: ['left', 'bottom', 'right'], labels: [N_('Left'), N_('Bottom'), N_('Right')],
            },
            { type: 'size', key: 'dock-icon-size', title: N_('Size'), lower: 24, upper: 128, step: 4 },
        ],
    },
    {
        id: 'menu-bar', icon: 'focus-top-bar-symbolic',
        title: N_('The Menu Bar'),
        body: N_('The logo at the left end opens the logo menu: About, System Settings, Force Quit, Sleep, Restart and Shut Down.'),
        controls: [
            {
                type: 'choice', key: 'menubar-logo', title: N_('Logo'),
                values: ['fedora', 'kiwi', 'none'], labels: [N_('Fedora'), N_('Kiwi'), N_('None')],
            },
        ],
    },
    {
        id: 'windows', icon: 'window-restore-symbolic',
        title: N_('Window Controls'),
        body: N_('Close, minimize and zoom for the focused window can sit in the menu bar, at the left, as on a Mac.'),
        controls: [
            { type: 'switch', key: 'show-window-controls', title: N_('Window Controls in the Menu Bar') },
        ],
    },
    {
        id: 'stage-manager', icon: 'view-app-grid-symbolic',
        title: N_('Stage Manager'),
        body: N_('Keep the window you work in at the centre, with your other apps in a strip at the side. Turn it on or off any time from the Control Center.'),
        controls: [
            { type: 'switch', key: 'stage-manager', title: N_('Stage Manager') },
        ],
    },
    {
        id: 'privacy', icon: 'security-high-symbolic',
        title: N_('Privacy'),
        body: N_('Clipboard history keeps what you copy on this computer only, readable only by you, and skips passwords from password managers. The notch shows notification text at the top of the screen, also while you share it.'),
        controls: [
            { type: 'switch', key: 'clipboard-history', title: N_('Clipboard History') },
            { type: 'switch', key: 'notch-notifications', title: N_('Notifications in the Notch') },
        ],
    },
    {
        id: 'done', icon: 'emblem-ok-symbolic',
        title: N_('You’re All Set'),
        body: N_('Everything here, and much more, is in Kiwi Settings. You can run this assistant again from About.'),
        controls: [],
    },
]);

/** Which Light / Dark / Auto button is on. */
export function appearanceChoice({ auto, colorScheme }) {
    if (auto)
        return 'auto';
    return colorScheme === 'prefer-dark' ? 'dark' : 'light';
}

/**
 * The writes for a Light / Dark / Auto choice, in order. Light and Dark write GNOME's
 * color-scheme first: while Auto runs the appearance feature takes that as the user's choice
 * (it turns Auto off and keeps it); then Auto goes off for when Kiwi is not running.
 *
 * @returns {Array<{schema: 'gnome'|'kiwi', key: string, value: *}>}
 */
export function appearanceWrites(choice) {
    if (choice === 'auto')
        return [{ schema: 'kiwi', key: 'appearance-auto', value: true }];
    return [
        { schema: 'gnome', key: 'color-scheme', value: choice === 'dark' ? 'prefer-dark' : 'prefer-light' },
        { schema: 'kiwi', key: 'appearance-auto', value: false },
    ];
}
