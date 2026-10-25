// SPDX-License-Identifier: GPL-3.0-or-later
// The list of Kiwi features, in start order (stop runs in reverse).
// The engine is lib/featureRegistry.js; see its header for the entry shape.
//
// To add a feature: import its class (or enable/disable pair) and add ONE entry below,
// with `setting` (its on/off key), `conflictsWith`/`needs` if it shares a resource, and
// nothing else. Put everything it sets up in the `cleanup` registry it is given.
//
// Entries marked `reapply` are the pre-registry modules. They keep their old behaviour:
// enable() runs again on every settings change while wanted, disable() while not wanted.
// Migrate a module off `reapply` once its enable() is idempotent and its keys are known.

import { enable as addUsernameEnable, disable as addUsernameDisable } from './apps/addUsernameToQuickMenu.js';
import { enable as moveFullscreenEnable, disable as moveFullscreenDisable } from './apps/moveFullscreenWindow.js';
import { enable as focusLaunchedWindowEnable, disable as focusLaunchedWindowDisable } from './apps/focusLaunchedWindow.js';
import { enable as lockIconEnable, disable as lockIconDisable } from './apps/lockIcon.js';
import { enable as transparentMoveEnable, disable as transparentMoveDisable } from './apps/transparentMove.js';
import { enable as batteryPercentageEnable, disable as batteryPercentageDisable } from './apps/batteryPercentage.js';
import { enable as calendarEnable, disable as calendarDisable } from './apps/calendar.js';
import { enable as windowTitleEnable, disable as windowTitleDisable } from './apps/windowTitle.js';
import { WindowControlsFeature } from './apps/windowControls.js';
import { PanelVisibilityFeature, wantsController } from './coordinators/panelVisibility.js';
import { enable as panelTransparencyEnable, disable as panelTransparencyDisable } from './apps/panelTransparency.js';
import { enable as panelStylingEnable, disable as panelStylingDisable, enableMenus as popupStylingEnable, disableMenus as popupStylingDisable } from './apps/panelStyling.js';
import { enable as hideMinimizedWindowsEnable, disable as hideMinimizedWindowsDisable } from './apps/hideMinimizedWindows.js';
import { enable as gtkThemeManagerEnable, disable as gtkThemeManagerDisable } from './apps/gtkThemeManager.js';
import { enable as firefoxThemeManagerEnable, disable as firefoxThemeManagerDisable } from './apps/firefoxThemeManager.js';
import { enable as thunderbirdThemeManagerEnable, disable as thunderbirdThemeManagerDisable } from './apps/thunderbirdThemeManager.js';
import { enable as hideActivitiesButtonEnable, disable as hideActivitiesButtonDisable } from './apps/hideActivitiesButton.js';
import { enable as overviewWallpaperEnable, disable as overviewWallpaperDisable } from './apps/overviewWallpaper.js';
import { enable as overviewSeamlessZoomEnable, disable as overviewSeamlessZoomDisable } from './apps/overviewSeamlessZoom.js';
import { enable as focusOnOverviewExitEnable, disable as focusOnOverviewExitDisable } from './apps/focusOnOverviewExit.js';
import { enable as skipOverviewEnable, disable as skipOverviewDisable } from './apps/skipOverviewOnLogin.js';
import { enable as quickSettingsNotificationsEnable, disable as quickSettingsNotificationsDisable } from './apps/quickSettingsNotifications.js';
import { enable as panelMediaEnable, disable as panelMediaDisable } from './apps/panelMedia.js';
import { enable as keyboardIndicatorEnable, disable as keyboardIndicatorDisable } from './apps/keyboardIndicator.js';
import { enable as launchpadAppEnable, disable as launchpadAppDisable } from './apps/launchpadApp.js';
import { enable as dockBlurEnable, disable as dockBlurDisable } from './apps/dockBlur.js';
import { enable as dockStylingEnable, disable as dockStylingDisable } from './apps/dockStyling.js';
import { enable as dockColorsEnable, disable as dockColorsDisable } from './apps/dockColors.js';
import { enable as minimizedToDockEnable, disable as minimizedToDockDisable } from './apps/minimizedToDock.js';
import { enable as downloadsStackEnable, disable as downloadsStackDisable } from './apps/downloadsStack.js';
import { enable as reduceWindowAnimationsEnable, disable as reduceWindowAnimationsDisable } from './apps/reduceWindowAnimations.js';
import { enableDragRestore, disableDragRestore } from './apps/windowTiling.js';
import { dockActive } from './apps/dockUtils.js';
import { LiquidGlass } from './apps/liquidGlass/index.js';
import { NotchFeature } from './apps/notch/index.js';
import { ControlCenter } from './apps/controlCenter/index.js';
import { StageManager } from './apps/stageManager/index.js';
import { StageManagerShortcut } from './apps/stageManager/shortcut.js';
import { Glass } from './lib/glass.js';
import { ClipboardHistory } from './apps/clipboard/index.js';
import { SpotlightFeature } from './apps/spotlight/index.js';

// ctx: { extension, settings (Gio.Settings), gettext, interfaceSettings (Gio.Settings) }
const bool = (ctx, key) => ctx.settings.get_boolean(key);

// The date menu leaves the centre box when the user asked for it, and always while the notch
// owns the centre. The message list moves to Quick Settings with it.
const calendarRight = ctx => bool(ctx, 'move-calendar-right') || bool(ctx, 'notch');

// Everything that hangs off Dash-to-Dock stays off while it is not running
const minimizeToDock = ctx => dockActive() && bool(ctx, 'minimize-to-dock');

// Stage Manager pauses minimize-to-dock (it keeps its saved value), so nothing is parked in the
// dock then and the "hide minimized windows" it implies must not apply either.
const minimizeToDockRunning = ctx => minimizeToDock(ctx) && !bool(ctx, 'stage-manager');

/** @type {object[]} */
export const FEATURES = [
    // Started once with the extension; never re-evaluated by settings changes.
    {
        id: 'gtk-theme',
        startOnly: true,
        enable: ctx => gtkThemeManagerEnable(ctx.extension),
        disable: () => gtkThemeManagerDisable(),
    },
    {
        id: 'focus-new-windows',
        startOnly: true,
        setting: 'focus-new-windows',
        enable: () => focusLaunchedWindowEnable(),
        disable: () => focusLaunchedWindowDisable(),
    },

    {
        id: 'move-window-to-new-workspace', reapply: true, setting: 'move-window-to-new-workspace',
        enable: () => moveFullscreenEnable(),
        disable: () => moveFullscreenDisable(),
    },
    {
        // The Control Center user row replaces this
        id: 'add-username-to-quick-menu', reapply: true,
        when: ctx => bool(ctx, 'add-username-to-quick-menu') && !bool(ctx, 'control-center'),
        enable: () => addUsernameEnable(),
        disable: () => addUsernameDisable(),
    },
    {
        id: 'lock-icon', reapply: true, setting: 'lock-icon',
        enable: ctx => lockIconEnable(ctx.extension),
        disable: () => lockIconDisable(),
    },
    {
        id: 'transparent-move', reapply: true, setting: 'transparent-move',
        enable: () => transparentMoveEnable(),
        disable: () => transparentMoveDisable(),
    },
    {
        // GNOME's own top bar percentage would show a second number, so ours steps aside.
        // Also re-applied alone when org.gnome.desktop.interface show-battery-percentage changes.
        id: 'battery-percentage', reapply: true,
        when: ctx => bool(ctx, 'battery-percentage') &&
            !ctx.interfaceSettings.get_boolean('show-battery-percentage') &&
            !(bool(ctx, 'control-center') && bool(ctx, 'battery-percentage-always')),
        enable: () => batteryPercentageEnable(),
        disable: () => batteryPercentageDisable(),
    },

    // Calendar group. The calendar re-attaches the date menu at the far right of the panel,
    // so a change of either key restarts it and the notification pieces together.
    {
        id: 'calendar', reapply: true, when: calendarRight,
        restartOn: ['keep-notification-panel'],
        enable: ctx => calendarEnable(ctx.extension),
        disable: () => calendarDisable(),
    },
    {
        id: 'quick-settings-notifications', reapply: true,
        when: ctx => calendarRight(ctx) && !bool(ctx, 'keep-notification-panel'),
        restartOn: ['keep-notification-panel'],
        enable: ctx => quickSettingsNotificationsEnable(ctx.gettext, ctx.settings),
        disable: () => quickSettingsNotificationsDisable(),
    },
    {
        // The notch's live activity replaces this button (the Control Center tile stays)
        id: 'panel-media', reapply: true,
        when: ctx => calendarRight(ctx) && !bool(ctx, 'keep-notification-panel') &&
            !(bool(ctx, 'notch') && bool(ctx, 'notch-live-activities')),
        restartOn: ['keep-notification-panel'],
        enable: ctx => panelMediaEnable(ctx.gettext),
        disable: () => panelMediaDisable(),
    },

    {
        id: 'window-title', reapply: true, setting: 'show-window-title',
        enable: ctx => windowTitleEnable(ctx.extension),
        disable: () => windowTitleDisable(),
    },
    {
        id: 'tiling-title-menu', reapply: true,
        when: ctx => bool(ctx, 'show-window-title') && bool(ctx, 'show-tiling-title-menu'),
        enable: () => enableDragRestore(),
        disable: () => disableDragRestore(),
    },
    {
        // Placed by PanelLayout, which re-sorts when the calendar re-adds the date menu,
        // so no restartOn keys are needed. Reacts to its own settings keys.
        id: 'window-controls', setting: 'show-window-controls',
        cls: WindowControlsFeature,
    },
    {
        // Local clipboard history; its panel icon claims a slot through PanelLayout
        id: 'clipboard-history', setting: 'clipboard-history',
        cls: ClipboardHistory,
    },
    {
        // Super tap / shortcut opens Spotlight; the clipboard provider reads clipboardService() lazily
        id: 'spotlight', setting: 'spotlight',
        cls: SpotlightFeature,
    },
    {
        // Modes always / fullscreen-hover / autohide; runs for the last two. Reacts to its own
        // keys, and owns Main.layoutManager.panelBox visibility, struts and translation.
        id: 'panel-autohide', when: ctx => wantsController(ctx.settings),
        cls: PanelVisibilityFeature,
    },
    {
        id: 'panel-transparency', reapply: true, setting: 'panel-transparency',
        enable: ctx => panelTransparencyEnable(ctx.settings),
        disable: () => panelTransparencyDisable(),
    },
    {
        id: 'panel-styling', reapply: true, setting: 'panel-styling',
        enable: () => panelStylingEnable(),
        disable: () => panelStylingDisable(),
    },
    {
        id: 'popup-menu-styling', reapply: true, setting: 'popup-menu-styling',
        enable: () => popupStylingEnable(),
        disable: () => popupStylingDisable(),
    },

    {
        // A window parked in the dock should not also show up in the overview
        id: 'hide-minimized-windows', reapply: true,
        when: ctx => bool(ctx, 'hide-minimized-windows') || minimizeToDockRunning(ctx),
        enable: () => hideMinimizedWindowsEnable(),
        disable: () => hideMinimizedWindowsDisable(),
    },
    {
        id: 'minimize-to-dock', reapply: true, when: minimizeToDock,
        enable: () => minimizedToDockEnable(),
        disable: () => minimizedToDockDisable(),
    },
    {
        // Registered after minimize-to-dock: the stack borrows the minimized strip and holds a
        // signal on it, so it must let go first (stop runs in reverse order).
        id: 'downloads-in-dock', reapply: true,
        when: ctx => dockActive() && bool(ctx, 'downloads-in-dock'),
        enable: ctx => downloadsStackEnable(ctx.gettext, ctx.settings),
        disable: () => downloadsStackDisable(),
    },

    {
        id: 'hide-activities-button', reapply: true, setting: 'hide-activities-button',
        enable: () => hideActivitiesButtonEnable(),
        disable: () => hideActivitiesButtonDisable(),
    },
    {
        id: 'overview-wallpaper-background', reapply: true, setting: 'overview-wallpaper-background',
        enable: () => overviewWallpaperEnable(),
        disable: () => overviewWallpaperDisable(),
    },
    {
        id: 'overview-seamless-zoom', reapply: true, setting: 'overview-seamless-zoom',
        enable: () => overviewSeamlessZoomEnable(),
        disable: () => overviewSeamlessZoomDisable(),
    },
    {
        id: 'focus-on-overview-exit', reapply: true, setting: 'focus-on-overview-exit',
        enable: () => focusOnOverviewExitEnable(),
        disable: () => focusOnOverviewExitDisable(),
    },
    {
        id: 'skip-overview-on-login', reapply: true, setting: 'skip-overview-on-login',
        enable: () => skipOverviewEnable(),
        disable: () => skipOverviewDisable(),
    },

    {
        // Wave 0 made both managers no-ops unless the per-app styling key is on
        id: 'firefox-theme', reapply: true,
        when: ctx => bool(ctx, 'enable-firefox-styling') || bool(ctx, 'show-window-controls'),
        enable: ctx => firefoxThemeManagerEnable(ctx.extension),
        disable: () => firefoxThemeManagerDisable(),
    },
    {
        id: 'thunderbird-theme', reapply: true,
        when: ctx => bool(ctx, 'enable-thunderbird-styling') || bool(ctx, 'show-window-controls'),
        enable: ctx => thunderbirdThemeManagerEnable(ctx.extension),
        disable: () => thunderbirdThemeManagerDisable(),
    },
    {
        id: 'keyboard-indicator', reapply: true, setting: 'keyboard-indicator',
        restartOn: ['keyboard-indicator', 'hide-keyboard-indicator'],
        enable: ctx => keyboardIndicatorEnable(ctx.settings),
        disable: () => keyboardIndicatorDisable(),
    },

    {
        id: 'dock-styling', reapply: true,
        when: ctx => dockActive() && bool(ctx, 'dock-styling'),
        enable: () => dockStylingEnable(),
        disable: () => dockStylingDisable(),
    },
    {
        id: 'dock-blur', reapply: true,
        when: ctx => dockActive() && Glass.wants('dock', ctx.settings),
        enable: () => dockBlurEnable(),
        disable: () => dockBlurDisable(),
    },
    {
        // Dock colors that follow the wallpaper behind the dock
        id: 'dock-adaptive-colors', reapply: true,
        when: ctx => dockActive() && bool(ctx, 'dock-adaptive-colors'),
        enable: ctx => dockColorsEnable(ctx.settings),
        disable: () => dockColorsDisable(),
    },
    {
        // macOS-style scale + fade for window open/close
        id: 'reduce-window-animations', reapply: true, setting: 'reduce-window-animations',
        enable: () => reduceWindowAnimationsEnable(),
        disable: () => reduceWindowAnimationsDisable(),
    },
    {
        id: 'launchpad-app', reapply: true, setting: 'enable-launchpad-app',
        restartOn: ['launchpad-app-custom-icon'],
        enable: ctx => launchpadAppEnable(ctx.extension, ctx.gettext),
        disable: () => launchpadAppDisable(),
    },
    {
        // Frosted panel and menus; the dock and wallpaper blur ride on the same service
        id: 'liquid-glass', setting: 'liquid-glass',
        cls: LiquidGlass,
    },
    {
        // Quick Settings restyled as a Control Center; last so it sees the other panel features
        id: 'control-center', setting: 'control-center',
        cls: ControlCenter,
    },
    {
        // Stage Manager wins over these (decisions.md); their saved values are kept
        id: 'stage-manager', setting: 'stage-manager',
        cls: StageManager,
        conflictsWith: ['minimize-to-dock', 'move-window-to-new-workspace', 'tiling-title-menu'],
    },
    {
        // Its own entry so the shortcut still works while Stage Manager is off
        id: 'stage-manager-shortcut',
        when: ctx => ctx.settings.get_strv('stage-manager-shortcut').length > 0,
        restartOn: ['stage-manager-shortcut'],
        cls: StageManagerShortcut,
    },
    {
        // Pill in the centre of the bar for banners, media and volume. Replaces the stock banners
        // and OSD (parts switch live on notch-notifications / notch-osd / notch-live-activities).
        id: 'notch', setting: 'notch',
        cls: NotchFeature,
    },
];
