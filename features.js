// SPDX-License-Identifier: GPL-3.0-or-later
// The list of Kiwi features, in start order (stop runs in reverse).
// The engine is lib/featureRegistry.js; see its header for the entry shape.
//
// To add a feature (docs/architecture/conventions.md): create features/<name>/, then add ONE
// entry below with `setting` (its on/off key) or `when`, `load` (a dynamic import, so a
// feature that is off costs nothing), and `conflictsWith` / `needs` if it shares a resource
// with another feature. Put everything it sets up in the `cleanup` registry it is given.
//
// Shared-resource rules, defined once here:
//   - button-layout: window-controls and app-buttons are mirrors; only one runs.
//   - Do Not Disturb: the Control Center provides it while on (dnd-button steps aside).
//   - Stage Manager owns window placement: fullscreen-to-its-own-Space pauses (its saved
//     value is kept).
//   - The notch owns the centre of the top bar: the date menu moves right (calendar).
//   - Kiwi's dock owns the dock: Dash to Dock is kept off while it runs (core/originals).

// ctx: see extension.js (settings, gettext, events, desktop, layout, motion, originals, ...)
const bool = (ctx, key) => ctx.settings.get_boolean(key);

// The date menu leaves the centre box when the user asked for it, and always while the notch
// owns the centre. The message list moves to Quick Settings with it.
const calendarRight = ctx => bool(ctx, 'move-calendar-right') || bool(ctx, 'notch');
const notificationsInQuickSettings = ctx => calendarRight(ctx) && !bool(ctx, 'keep-notification-panel');

/** @type {object[]} */
export const FEATURES = [
    {
        // GTK stylesheets for the apps' own titlebars (macOS traffic lights, hidden buttons,
        // app fixes). Always runs: it writes an empty block (none) when nothing is wanted.
        id: 'gtk-theme',
        load: async () => (await import('./features/windowControls/gtkTheme.js')).GtkTheme,
    },
    {
        // The macOS menu bar: logo menu, app name and menus (core/appMenus), transparent
        // adaptive look, full-screen reveal, privacy dots; each part has its own key
        id: 'menu-bar',
        load: async () => (await import('./features/menuBar/index.js')).MenuBar,
    },
    {
        // Full screen as its own Space, the macOS default
        id: 'move-window-to-new-workspace', setting: 'move-window-to-new-workspace',
        load: async () => (await import('./features/fullscreenSpace/index.js')).FullscreenSpace,
    },

    // Calendar group. The calendar re-attaches the date menu at the far right of the panel,
    // so a change of keep-notification-panel restarts it and the notification pieces together.
    {
        id: 'calendar', when: calendarRight,
        restartOn: ['keep-notification-panel'],
        load: async () => (await import('./features/calendar/index.js')).Calendar,
    },
    {
        id: 'quick-settings-notifications', when: notificationsInQuickSettings,
        restartOn: ['keep-notification-panel'],
        load: async () => (await import('./features/calendar/notificationList.js')).QuickSettingsNotifications,
    },
    {
        // The Control Center has its own Do Not Disturb tile and wins (conflictsWith there)
        id: 'dnd-button',
        when: ctx => notificationsInQuickSettings(ctx) && bool(ctx, 'custom-dnd-button'),
        restartOn: ['keep-notification-panel'],
        load: async () => (await import('./features/calendar/dndButton.js')).DndButton,
    },

    {
        // Placed by PanelLayout, which re-sorts when the calendar re-adds the date menu.
        id: 'window-controls', setting: 'show-window-controls',
        load: async () => (await import('./features/windowControls/index.js')).WindowControlsFeature,
    },
    {
        // The mirror of window-controls: the apps' own buttons while the top-bar ones are off.
        // Both own button-layout; the registry stops the one going off before starting the other.
        id: 'app-buttons', when: ctx => !bool(ctx, 'show-window-controls'),
        keys: ['show-window-controls'],
        load: async () => (await import('./features/windowControls/appButtons.js')).AppButtonsFeature,
    },
    {
        // Local clipboard history; its panel icon claims a slot through PanelLayout
        id: 'clipboard-history', setting: 'clipboard-history',
        load: async () => (await import('./features/clipboard/index.js')).ClipboardHistory,
    },
    {
        // Top-bar button, Super+D and a click on empty wallpaper slide the windows aside; hands
        // off to Stage Manager's toggleDesktop() while that runs (looked up through ctx.features)
        id: 'show-desktop',
        when: ctx => bool(ctx, 'show-desktop-button') ||
            ctx.settings.get_strv('show-desktop-shortcut').length > 0 ||
            ctx.settings.get_string('click-wallpaper-reveals-desktop') !== 'never',
        keys: ['show-desktop-button', 'click-wallpaper-reveals-desktop'],
        restartOn: ['show-desktop-shortcut'],
        load: async () => (await import('./features/showDesktop/index.js')).ShowDesktop,
    },
    {
        // Full-screen app grid with folders and jiggle delete; GNOME's folders and order are
        // its data. Takes Super+A from GNOME's app grid while on (core/originals).
        id: 'launchpad', setting: 'launchpad',
        load: async () => (await import('./features/launchpad/index.js')).Launchpad,
    },
    {
        // Full screen Split View on the green button; builds on full screen as its own Space
        id: 'split-view', setting: 'split-view',
        load: async () => (await import('./features/splitView/index.js')).SplitView,
    },
    {
        // Super tap / shortcut opens Spotlight; the clipboard rows come from clipboard-history
        id: 'spotlight', setting: 'spotlight',
        load: async () => (await import('./features/spotlight/index.js')).SpotlightFeature,
    },
    {
        // Auto Light/Dark, the accent and the highlight colour; each part has its own key and
        // owns nothing while that key is at its default
        id: 'appearance',
        load: async () => (await import('./features/appearance/scheme.js')).Appearance,
    },
    {
        id: 'popup-menu-styling', setting: 'popup-menu-styling',
        load: async () => (await import('./features/appearance/index.js')).PopupMenuStyling,
    },
    {
        // Translucent panel, menus and overlays (lib/glass.js does the work)
        id: 'liquid-glass', setting: 'liquid-glass',
        load: async () => (await import('./features/liquidGlass/index.js')).LiquidGlass,
    },
    {
        // Overview swipes stop at the workspace overview; no hot corner. Each part has its key.
        id: 'shell-behaviour',
        when: ctx => bool(ctx, 'overview-gestures-workspace-only') || bool(ctx, 'disable-hot-corner'),
        restartOn: ['overview-gestures-workspace-only', 'disable-hot-corner'],
        load: async () => (await import('./features/shellBehaviour/index.js')).ShellBehaviour,
    },
    {
        // macOS-style rounded corners: one shader effect per window actor
        id: 'rounded-corners', setting: 'rounded-corners',
        load: async () => (await import('./features/roundedCorners/index.js')).RoundedCorners,
    },
    {
        // Quick Settings restyled as a Control Center; last of the panel features so it sees
        // the others
        id: 'control-center', setting: 'control-center',
        conflictsWith: ['dnd-button'],
        load: async () => (await import('./features/controlCenter/index.js')).ControlCenter,
    },
    {
        // Kiwi's own dock on the bottom (or a side) edge, claimed through core/layout. It takes
        // Dash to Dock out of the enabled extensions while it runs and puts it back after.
        id: 'dock', setting: 'dock',
        load: async () => (await import('./features/dock/index.js')).Dock,
    },
    {
        // Stage Manager wins over fullscreen-to-its-own-Space; its saved value is kept
        id: 'stage-manager', setting: 'stage-manager',
        conflictsWith: ['move-window-to-new-workspace'],
        load: async () => (await import('./features/stageManager/index.js')).StageManager,
    },
    {
        // Its own entry so the shortcut still works while Stage Manager is off
        id: 'stage-manager-shortcut',
        when: ctx => ctx.settings.get_strv('stage-manager-shortcut').length > 0,
        restartOn: ['stage-manager-shortcut'],
        load: async () => (await import('./features/stageManager/shortcut.js')).StageManagerShortcut,
    },
    {
        // Pill in the centre of the bar for banners, media and volume. Replaces the stock banners
        // and OSD (parts switch live on notch-notifications / notch-osd / notch-live-activities).
        id: 'notch', setting: 'notch',
        load: async () => (await import('./features/notch/index.js')).NotchFeature,
    },
];
