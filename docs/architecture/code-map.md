# Kiwi (is not Apple) — Code Map

> **Summary (read this and you can stop):**
> 1. Kiwi (`kiwi@kemma`, v2.3.1, GNOME Shell 48–51) is one `Extension` subclass (`extension.js`) that wires about 35 feature modules in `apps/*.js`. Each module exports `enable()`/`disable()` and keeps its state in module-level variables.
> 2. Toggling is centralised and coarse. **Any** GSettings change re-runs `_on_settings_changed()` (`extension.js:57-277`), which calls `enable()` or `disable()` on *every* module. So every module must be idempotent.
> 3. Most features patch private Shell internals directly: `Main.panel._leftBox/_rightBox/_centerBox`, `quickSettings._indicators/_grid/_system`, `Main.messageTray._bannerBin/_sources`, `layoutManager._trackedActors`, `Main.wm._shouldAnimateActor`, `Workspace.prototype._init` and Dash-to-Dock's private actors.
> 4. App theming works by writing outside the extension. `gtkThemeManager.js` injects `@import` lines into `~/.config/gtk-{3,4}.0/gtk.css`. `mozillaThemeManager.js` rewrites the Firefox and Thunderbird profile `chrome/` folders and `user.js`. `dockColors.js` writes Dash-to-Dock's GSettings and `launchpadApp.js` writes a `.desktop` file plus `favorite-apps`.
> 5. There is no build system beyond `gnome-extensions pack` in a release-only GitHub Action. There is no lint, no tests and no session-modes declaration, so the whole extension is torn down and rebuilt on every screen lock.

## Table of contents

1. [Repository layout](#1-repository-layout)
2. [Boot flow](#2-boot-flow)
3. [Preferences (prefs.js)](#3-preferences-prefsjs)
4. [Schema key → module mapping](#4-schema-key--module-mapping)
5. [Per-module reference](#5-per-module-reference)
6. [Shared helpers and cross-module dependencies](#6-shared-helpers-and-cross-module-dependencies)
7. [Panel and Quick Settings occupancy map](#7-panel-and-quick-settings-occupancy-map)
8. [CSS and theming pipeline](#8-css-and-theming-pipeline)
9. [advanced/ native module](#9-advanced-native-module)
10. [i18n, build, packaging, CI](#10-i18n-build-packaging-ci)

All line numbers refer to commit `c2f3d0f` (HEAD at time of writing).

---

## 1. Repository layout

| Path | Lines | Role |
|---|---|---|
| `extension.js` | 365 | Entry point, module registry, settings dispatcher |
| `prefs.js` | 1107 | Adw preferences window (6 pages), all in one `fillPreferencesWindow()` |
| `metadata.json` | 19 | uuid `kiwi@kemma`, shell 48–51, gettext-domain `kiwi@kemma`, **no `session-modes`** |
| `apps/*.js` | ~12.8k | 37 modules (feature modules plus helpers) |
| `stylesheet.css` | 899 | Shell (St) styles, mostly gated behind `kiwi-*` classes |
| `css/*.css` | ~2.9k | GTK3/GTK4 titlebutton themes, hide-titlebar rules, app fixes, Firefox/Thunderbird userChrome, prefs.css |
| `icons/` | — | PNG titlebuttons (`titlebuttons/`, `titlebuttons-glass/`, @2 variants), SVG symbolic icons |
| `schemas/…kiwi.gschema.xml` | 284 | 47 keys, ordered like the prefs pages |
| `po/*.po`, `translating/` | — | 17 languages, `kiwi.pot` (193 msgids), compile script |
| `advanced/` | — | Optional GTK3 module `titlebuttons_hover.c` with a **committed prebuilt `.so`** and install scripts |
| `.github/workflows/pack-release.yml` | 60 | Packs the zip on release |

---

## 2. Boot flow

### 2.1 `enable()` — `extension.js:289-311`

1. `this._settings = this.getSettings()` and a `changed` handler that forwards any key to `_on_settings_changed(key)` (`:290-291`).
2. `org.gnome.desktop.interface` settings watch `show-battery-percentage` so that Kiwi's battery label steps aside when GNOME shows its own (`:292-294`, `_applyBatteryPercentage` `:280-287`).
3. `Main.extensionManager` `extension-state-changed` re-runs the whole dispatcher whenever Dash-to-Dock or Ubuntu Dock changes state (`:298-302`, `isDockExtension` from `dockUtils.js:203`).
4. `gtkThemeManagerEnable(this)` always runs, whatever the settings say (`:305`).
5. `focusLaunchedWindowEnable()` runs only at enable. Changing `focus-new-windows` needs a reload, as the schema description says (`:307-308`).
6. `_on_settings_changed(null)` applies every module (`:310`).

### 2.2 The dispatcher — `_on_settings_changed(key)` (`extension.js:57-277`)

The dispatcher is a single linear function that evaluates **every** module on **every** key change. There is no per-key routing except a few special cases:

| Lines | Special case |
|---|---|
| `60-64` | `keyboard-indicator` / `hide-keyboard-indicator` force a disable, then re-enable |
| `66-69` | `button-type` / `enable-app-window-buttons` force a rebuild of the panel window controls |
| `100-104` | `keep-notification-panel` tears down calendar, QS notifications and panel media before re-applying |
| `106-119` | `quickSettingsNotifications` and `panelMedia` exist **only** when `move-calendar-right && !keep-notification-panel` |
| `121-127` | Ordering hack: calendar moves `dateMenu` to the end of `_rightBox`, so window controls are destroyed here and re-added at `:142-146` to stay rightmost |
| `135-140` | Tiling drag-restore follows `show-window-title && show-tiling-title-menu` |
| `172-194` | Dock features are gated on `dockActive()`. `minimize-to-dock` also forces `hideMinimizedWindows` on (`:178`) |
| `226-236` | Firefox and Thunderbird managers are enabled when their key **or `show-window-controls`** is true |
| `268-276` | Launchpad is re-created when `launchpad-app-custom-icon` changes |

**Contract implied for every module:** `enable()` must be a no-op when already enabled, and `disable()` must be safe when never enabled. Most modules guard with an `enabled`/instance flag. See `panelTransparency.js:854-858` and `panelHover.js:353-359` for the comments explaining why.

### 2.3 `disable()` — `extension.js:313-364`

`disable()` disconnects its three signals, then calls every module's `disable()` in a fixed order. `downloadsStackDisable()` must run before `minimizedToDockDisable()` because the stack borrows the minimized strip (`:356-359`). `resetDockSettings()` drops the cached Dash-to-Dock `Gio.Settings` (`dockUtils.js:190`).

Because `metadata.json` declares no `session-modes`, GNOME Shell calls `disable()` on every screen lock and `enable()` on unlock. Commit `bbeac23` ("comply with EGO review guidelines") **removed** a `Main.sessionMode.isLocked` early-return in `launchpadApp.disable()`, so reviewers expect full teardown on lock.

### 2.4 Module registration

There is no registry. Each module is imported by name (`extension.js:22-54`) and called explicitly. Module call signatures differ:

| Signature | Modules |
|---|---|
| `enable()` | most modules |
| `enable(ext)` | `windowControls`, `windowTitle`, `calendar`, `gtkThemeManager`, `firefox/thunderbirdThemeManager` |
| `enable(settings)` | `panelTransparency`, `keyboardIndicator` |
| `enable(gettext[, settings])` | `quickSettingsNotifications`, `panelMedia`, `downloadsStack` |
| `enable(ext, gettext)` (async) | `launchpadApp` |
| non-standard names | `panelStyling.enableMenus/disableMenus`, `windowTiling.enableDragRestore/disableDragRestore` |

---

## 3. Preferences (`prefs.js`)

`KiwiPreferences.fillPreferencesWindow()` (`prefs.js:111-1106`) builds everything inline. Helpers: `_createLinkRow` (`:38`), `_addSwitchRows` (`:56`), `_withDockActive` (D-Bus `ListExtensions` to the shell, `:77-91`), `_createEnumComboRow` (`:94-109`).

| Page (icon) | Line | Groups → rows (keys) |
|---|---|---|
| **About** | `:133` | Header (logo, version pill linking to the release tag), links, legal dialog, Ko-fi QR, sponsor button; `Adw.Breakpoint` at 500sp (`:351`) |
| **Panel** (`focus-top-bar-symbolic`) | `:362` | *Panel Transparency* (`:368`): expander `panel-transparency` → level, opaque-on-window, blur, color-inherit, invert-tray-icons. *Panel Items* (`:464`): `panel-hover-fullscreen`; expander `show-window-title` → *inverted* `show-window-title-icon`, `show-window-subtitle`, `show-tiling-title-menu` (`:486-508`); expander `move-calendar-right` → `notification-indicator-style`, `keep-notification-panel`; `battery-percentage` (greyed out while GNOME shows its own, `:559-576`); `custom-dnd-button`, `lock-icon`, `hide-activities-button`, `add-username-to-quick-menu`. *Styling* (`:585`): `panel-styling`, `popup-menu-styling`; expander `keyboard-indicator` → `hide-keyboard-indicator` |
| **Dock** (`kiwi-dock-symbolic`) | `:635` | Banner when Dash-to-Dock is missing (`:644`, live via `ExtensionStateChanged` D-Bus signal `:813-820`). *Dock Items*: `minimize-to-dock`; expander `downloads-in-dock` → `downloads-behind-folder`; expander `enable-launchpad-app` → custom icon picker (`launchpad-app-custom-icon`, PNG ≤512px validation `:756-773`). *Styling*: `dock-styling`, `dock-blur`, `dock-adaptive-colors` |
| **Buttons** (`kiwi-buttons-symbolic`) | `:825` | *Window Control Button Style*: expander `enable-app-window-buttons` → `button-type` (titlebuttons/alt/glass), `button-size`, `enable-firefox-styling`, `enable-thunderbird-styling`. Turning the main switch off also turns off Firefox and Thunderbird styling (`:901-909`). Second group: expander `show-window-controls` → `show-window-controls-fullscreen-only` |
| **Options** (`preferences-other-symbolic`) | `:941` | One group *Kiwi* with 9 switches: overview-wallpaper-background, overview-seamless-zoom, focus-on-overview-exit, skip-overview-on-login, hide-minimized-windows, move-window-to-new-workspace, reduce-window-animations, focus-new-windows, transparent-move |
| **Advanced** (`applications-utilities-symbolic`) | `:968` | Native hover module explanation and link, "More of my work", recommended extensions (includes **Blur My Shell**, `:1066`), **Restore Defaults** (resets every key, `:1101`) |

Two things to note in prefs:

* The "non-default" heuristics that decide whether an expander starts open hard-code values. `panel-transparency-level !== 50` (`:376`) does not match the schema default `29` (`schema:22`).
* `custom-dnd-button` is shown unconditionally, but it only does something while `move-calendar-right` is on and `keep-notification-panel` is off (see §4).

---

## 4. Schema key → module mapping

The `schema` column gives the line in `schemas/org.gnome.shell.extensions.kiwi.gschema.xml`. "Read by" lists the files that call `get_*` on the key. Keys read only by `extension.js` are pure on/off gates for a module.

| Key (default) | schema | Read by | What it patches |
|---|---|---|---|
| `panel-transparency` (false) | 16 | ext:154, panelTransparency | inline `background-color` on `Main.panel`, fullscreen class, blur, foreground contrast |
| `panel-transparency-level` (29) | 21 | panelTransparency:603 | alpha of the panel inline style |
| `panel-opaque-on-window` (false) | 27 | panelTransparency:622 | alpha forced to 1 when a maximized window is on the primary monitor |
| `panel-blur` (false) | 32 | panelTransparency:607,754,899 | `Shell.BlurEffect` (BACKGROUND, radius 30) in a `Meta.BackgroundGroup` at index 0 of `panelBox` |
| `panel-color-inherit` (false) | 37 | panelTransparency:473 | `.kiwi-panel-color-inherit` (which sets `background-color: black`, stylesheet:49-53) |
| `panel-invert-tray-icons` (false) | 42 | panelTransparency:459 | `Clutter.BrightnessContrastEffect` on monochrome AppIndicator/tray icons |
| `show-window-title` (true) | 49 | ext:129 | `windowTitle` PanelMenu.Button in `_leftBox` (AppMenu with Kiwi items) |
| `show-window-title-icon` (true) | 54 | windowTitle:94 | icon visibility |
| `show-window-subtitle` (true) | 59 | windowTitle:246 | title text format |
| `show-tiling-title-menu` (true) | 64 | ext:136, windowTitle:315 | tiling grid in the title menu, and the `grab-op-begin` drag-restore (windowTiling:259) |
| `panel-hover-fullscreen` (true) | 69 | ext:148 | `panelHover`: 1px hover actor, `_trackedActors[].trackFullscreen`, `panelBox.translation_y`, ghost menu |
| `move-calendar-right` (true) | 74 | ext:106 | `calendar`: `dateMenu.container` moved `_centerBox`→`_rightBox`; also gates QS notifications, panel media and custom DnD |
| `keep-notification-panel` (false) | 79 | ext:100,108, calendar:53,203 | keeps the dateMenu message list; the indicator dot goes into `_rightBox` instead of QS `_indicators` |
| `notification-indicator-style` (default) | 84 | calendar:58,92 | inline color on the notification dot |
| `battery-percentage` (true) | 94 | ext:281 | label in `quickSettings._indicators` |
| `lock-icon` (false) | 99 | ext:86 | PanelMenu.Button `lock-indicator` at `_rightBox` index 0 |
| `custom-dnd-button` (true) | 104 | quickSettingsNotifications:257,307 | removes the built-in DnD toggle (49+) and indicator, adds a moon button to `_system._systemItem` and a moon icon to `_indicators`. **Only active inside quickSettingsNotifications** |
| `hide-activities-button` (false) | 109 | ext:196 | `statusArea.activities.hide()` |
| `add-username-to-quick-menu` (false) | 114 | ext:80 | label at `quickSettings._indicators` index 0 (the panel, not the menu) |
| `panel-styling` (true) | 121 | ext:160 | `.kiwi-panel-styled` on `Main.panel` |
| `popup-menu-styling` (true) | 126 | ext:166, gtkThemeManager:44 | `.kiwi-popup-styled` on `Main.uiGroup`, plus `fixes{3,4}.css` in GTK |
| `keyboard-indicator` (true) | 131 | ext:60,239 | relabels and restyles `statusArea.keyboard` |
| `hide-keyboard-indicator` (false) | 136 | keyboardIndicator:127 | hides it |
| `minimize-to-dock` (true) | 147 | ext:175 | minimized thumbnails strip inside Dash-to-Dock; `set_icon_geometry` on every window; also forces hideMinimizedWindows |
| `downloads-in-dock` (true) | 152 | ext:190 | Downloads stack item and fan overlay (`pushModal`) |
| `downloads-behind-folder` (false) | 157 | downloadsStack:1033 | layout variant |
| `enable-launchpad-app` (false) | 162 | ext:272 | `.desktop` file in `~/.local/share/applications`, `favorite-apps` pin, `Shell.AppSystem.prototype.lookup_app` override |
| `launchpad-app-custom-icon` ('') | 167 | ext:269, launchpadApp:143 | icon path inside the `.desktop` file |
| `dock-styling` (true) | 174 | ext:245 | `.kiwi-dock-styled` on dock containers, press-darken effect, label classes |
| `dock-blur` (true) | 179 | ext:251 | `Shell.BlurEffect` (BACKGROUND, radius 30) per dash |
| `dock-adaptive-colors` (false) | 184 | ext:257 | writes D2D `custom-theme-running-dots-color` and `background-color`; screenshots a band of the screen |
| `enable-app-window-buttons` (true) | 195 | ext:66, gtkThemeManager:39, mozilla:50, windowControls:33 | GTK titlebutton CSS; panel controls icon mode (PNG or symbolic) |
| `button-type` (titlebuttons) | 200 | gtk:42, mozilla:52, windowControls:35,461 | CSS file set and PNG folder |
| `button-size` (small) | 205 | gtk:43, mozilla:53, windowControls:36,238 | small-size CSS and `.small-size` class |
| `enable-firefox-styling` (false) | 210 | ext:227, mozilla:49 | Firefox `chrome/userChrome.css`, `user.js` |
| `enable-thunderbird-styling` (false) | 215 | ext:233, mozilla:49 | same for Thunderbird |
| `show-window-controls` (true) | 222 | ext:125,142,227,233, gtk:40, mozilla:51, windowControls:37 | panel controls, `hide-titlebar{3,4}.css`, **and the Firefox/Thunderbird `*Hidden.css` even when their styling key is off** |
| `show-window-controls-fullscreen-only` (false) | 227 | gtk:41, windowControls:357 | `hide-titlebar-fullscreen*.css`; panel controls only shown in fullscreen. Not honoured by the Mozilla CSS |
| `overview-wallpaper-background` (true) | 238 | ext:202 | blurred `Meta.BackgroundGroup` at index 0 of `layoutManager.overviewGroup` |
| `overview-seamless-zoom` (true) | 243 | ext:208 | `Workspace.prototype._init`, `_computeWorkspacesBoxForState`, swipe tracker `emit`, `controls.gestureProgress/gestureEnd` |
| `focus-on-overview-exit` (true) | 248 | ext:214 | `ControlsManager.prototype.prepareToLeaveOverview` (InjectionManager) |
| `skip-overview-on-login` (false) | 253 | ext:220 | replaces `Main.overview.show` during startup |
| `focus-new-windows` (true) | 258 | ext:307 | `window-demands-attention` → `Main.activateWindow` (enable-time only) |
| `hide-minimized-windows` (false) | 263 | ext:178 | `Workspace._isOverviewWindow`, alt-tab `_getWindows/_getWindowList` (InjectionManager) |
| `move-window-to-new-workspace` (true) | 268 | ext:74 | workspace creation and removal, `St.Settings.slow_down_factor`, `Main.wm._workspaceAnimation.movingWindow` |
| `reduce-window-animations` (true) | 273 | ext:263 | `Main.wm._shouldAnimateActor` override with a one-shot `actor.ease` swap |
| `transparent-move` (true) | 278 | ext:92 | opacity of window surface actors during `grab-op-begin/end` |

External settings that Kiwi reads or writes:

| Setting | Access | Where |
|---|---|---|
| `org.gnome.desktop.wm.preferences button-layout` | read | windowControls.js:42-55 |
| `org.gnome.desktop.wm.keybindings toggle-fullscreen/toggle-above` | read | windowTitle.js:341,368 |
| `org.gnome.desktop.interface color-scheme / show-battery-percentage` | read | panelTransparency, extension.js |
| `org.gnome.desktop.background picture-uri[-dark]` | read | panelTransparency:882, dockColors:352 |
| `org.gnome.desktop.notifications show-banners` | **write** (DnD) | quickSettingsNotifications.js:60-61 |
| `org.gnome.mutter dynamic-workspaces / workspaces-only-on-primary`, `wm.preferences num-workspaces` | read | moveFullscreenWindow.js:962-967 |
| `org.gnome.shell favorite-apps` | **write** | launchpadApp.js:51-57,265-267 |
| `org.gnome.shell.extensions.dash-to-dock *` | read, and **write** for 2 colour keys | dockUtils.js:161-187, dockColors.js:273,283,412 |

---

## 5. Per-module reference

Legend: **Cleanup** grades come from reading `disable()`. A = everything created is destroyed or disconnected and every patch restored. B = minor gaps. C = known gaps or persistent side effects.

### 5.1 Panel modules

| File (lines) | Purpose | Shell internals touched | Keys | Cleanup |
|---|---|---|---|---|
| `windowControls.js` (577) | Close/min/max buttons in the panel for maximized or fullscreen focused windows | `PanelMenu.Button` via `addToStatusArea('window-controls')` at `_rightBox` end or `_leftBox` len-1 (`:554-570`); re-parents its container on button-layout side change (`:536-552`); `global.display notify::focus-window`; per-window `notify::maximized-horizontally/vertically/fullscreen` (`:265-267`); `Main.overview showing/hidden`; `Main.screenShield active-changed`; 100ms and 3000ms timeouts (`:163,:415`) | enable-app-window-buttons, button-type, button-size, show-window-controls(-fullscreen-only), WM button-layout | A- (signals tracked; new `St.Icon` on every hover; sync `query_exists` file probing `:460-501`) |
| `windowTitle.js` (456) | App name and window title in `_leftBox`, AppMenu plus Kiwi items (tiling grid, Fullscreen, Restore, Always on Top) | `addToStatusArea('window-title', …, -1, 'left')`; `AppMenu` private fields `_newWindowItem`, `_actionSection`, `_quitItem`, `_app`, `_arrowAlignment` (`:279-298,:411`); `global.stage captured-event` while in the overview (`:147`); idles (`:202,:266`) | show-window-title*, show-tiling-title-menu | A |
| `windowTiling.js` (399) | Tiling engine (`move_resize_frame` on work-area fractions), glyph grid, drag-to-restore | `global.display grab-op-begin` (`:263`); expando `win._kiwiRestore`; version branch `MAXIMIZE_ARGS` 48 vs 49+ (`:51`); `isMaximized` uses the `maximized_horizontally/vertically` properties (`:62`) | — | A (stashes cleared `:269`) |
| `panelHover.js` (490) | Reveal panel on top-edge hover **only in fullscreen** | `layoutManager.addChrome(1px actor, {trackFullscreen:false})` (`:364`); `layoutManager._trackedActors[].trackFullscreen` and `lm._updateVisibility()` (`:198-217,:484-487`); `panelBox.translation_y` easing; **ghost PopupMenu** registered in `Main.panel.menuManager` to keep the panel up for GTK4 (`:156-189`); 1s poll (`:73`); per-window `notify::fullscreen`; stage `button-release-event` | panel-hover-fullscreen | B (restores `trackFullscreen`; hover actor sized once to the primary monitor) |
| `panelTransparency.js` (995) | Translucent panel, optional blur, adaptive dark/light foreground, tray icon inversion | Owns `Main.panel.style` background and re-asserts it on `notify::style` (`:511-525,:863-866`); `Main.layoutManager._backgroundGroup` children (`:137`); `Meta.BackgroundGroup` inserted at `panelBox` index 0 (`:79-101`); `St.ThemeContext changed`; per-window signals on the **enable-time workspace only** (`:669-686`); `notify::fullscreened` (non-existent property, `:701`); **2s poll** (`:910`); sync `GdkPixbuf` wallpaper decode (`:260`) | panel-transparency* | B |
| `panelStyling.js` (25) | Adds the gate classes `.kiwi-panel-styled` (panel) and `.kiwi-popup-styled` (uiGroup) | `Main.panel`, `Main.uiGroup` style classes | panel-styling, popup-menu-styling | A |
| `calendar.js` (289) | Moves the clock to the right, hides the dateMenu message list, moves banners to the top-right, notification dot | `dateMenu.container` `_centerBox`→`_rightBox` (`:198-201`); `dateMenu._messageList.hide()`, `dateMenu._calendar`, `dateMenu.menu.box.style` (`:206-215`); **`Main.messageTray._bannerBin` x/y align** (`:220-228`); dot into `quickSettings._indicators` or `_rightBox` (`:54-56,:86`); `messageTray source-added/removed`, `_sources`, `_notificationQueue` (`:163,:280-287`); 500ms and **5s poll** (`:75,:167`) | move-calendar-right, keep-notification-panel, notification-indicator-style | A- |
| `quickSettingsNotifications.js` (382) | Notification list inside Quick Settings, custom DnD button and panel moon | `quickSettings.menu._grid.add_child` + `layout_manager.child_set_property(column-span 2)` (`:276-286`); `quickSettings.menu.actor.set_style(max-height 90%)` (`:278-280`); `_system._systemItem.child` (`:46`); subclass of `MessageList.MessageView` with `_setupMpris(){}` (`:163-167`); `Main.messageTray.connectObject`; **unbounded 200ms retry** (`:131-137`); writes `show-banners` | custom-dnd-button | A- |
| `quickSettingsDnDRemoval.js` (193) | Helpers that find and remove the built-in DnD toggle (49+) and indicator, and keep `dateMenu._indicator` hidden | Heuristic actor search by icon name, accessible name or constructor name (`:27-61`); reparents actors out of `_grid`/`_indicators` and back (`:63-102`); `dateMenu._indicator` notify handlers (`:149-169`); `SHELL_HAS_SYSTEM_DND` version gate (`:8`) | (via caller) | A- |
| `panelMedia.js` (154) | Panel media button with MPRIS cards | `addToStatusArea('kiwi-media', …, 1, 'right')` (`:146`); `global.stage notify::key-focus` (connectObject) | (gated by move-calendar-right && !keep-notification-panel) | A |
| `mediaPlayback.js` (1135) | Kiwi's own MPRIS client (`Source`, `Player`) and `MediaItem` card (artwork, marquee, seek slider, soundwave) | Subclasses `MessageList.Message`, `Slider`/`BarLevel` (`:42-104`); private Message fields `_header`, `_icon`, `_bodyBin`, `_mediaControls`, `titleLabel` (`:145-345`); D-Bus `NameOwnerChanged`; 240ms soundwave and 1s progress timers (`:324,:466`) | — | A |
| `batteryPercentage.js` (183) | Battery % label when ≤20% and discharging | `quickSettings._indicators.add_child` (`:23`); UPower D-Bus with **`call_sync`** (`:52`); `init_async` with no cancellable (`:45,:78`) | battery-percentage | B (late async callbacks after destroy) |
| `lockIcon.js` (131) | Caps/Num lock icons | `addToStatusArea('lock-indicator', …, 0, 'right')`; keymap via `stage.get_context().get_backend()` (51 note, `:17-18`); `Main.extensionManager.lookup('kiwi@kemma')` (`:21`) | lock-icon | A |
| `addUsernameToQuickMenu.js` (131) | Real name slides into the QS **panel indicator** box | `quickSettings._indicators.insert_child_at_index(…, 0)` (`:117`) | add-username-to-quick-menu | A |
| `keyboardIndicator.js` (310) | Uppercase or "A" input-source label with a border, or hide it | `statusArea.keyboard` label found by tree walk (`:58-77`); `Keyboard.getInputSourceManager()` `current-source-changed`; expando `label._kiwiOriginalText` | keyboard-indicator, hide-keyboard-indicator | A |
| `hideActivitiesButton.js` (20) | Hides `statusArea.activities` | `hide()`/`show()` | hide-activities-button | A |

### 5.2 Overview and window-management modules

| File (lines) | Purpose | Shell internals touched | Keys | Cleanup |
|---|---|---|---|---|
| `overviewWallpaper.js` (138) | GPU-blurred wallpaper (ACTOR blur, radius 60) behind the overview | `Meta.BackgroundGroup` at `layoutManager.overviewGroup` index 0; `Background.BackgroundManager({controlPosition:false})`; re-sinks on `child-added` (`:105-108`); `monitors-changed` rebuild | overview-wallpaper-background | A |
| `overviewSeamlessZoom.js` (252) | Whole-monitor zoom into the overview; touchpad swipe smoothing | **Direct** `Workspace.prototype._init` replacement (`:143-149`); `Object.defineProperty(layout,'_workarea')` (`:71-89`); `controls.layout_manager._computeWorkspacesBoxForState` (`:129-141`); `Main.overview._swipeTracker._touchpadGesture.emit` (`:153-159`); `controls.gestureProgress/gestureEnd` own-property overrides (`:180-206`); custom `WorkspaceBackground` subclass | overview-seamless-zoom | B (restores only if nobody else re-patched, `:236`) |
| `focusOnOverviewExit.js` (109) | Focus the window under the pointer on overview exit | `ControlsManager.prototype.prepareToLeaveOverview` (InjectionManager); stage `captured-event` | focus-on-overview-exit | A |
| `skipOverviewOnLogin.js` (67) | No overview at login | Replaces `Main.overview.show` as an own property (`:13-21`); `layoutManager._startingUp`, `startup-complete` | skip-overview-on-login | B (re-patches on every unlock because `firstLogin` resets at `:66`) |
| `hideMinimizedWindows.js` (36) | Minimized windows hidden from overview and alt-tab | InjectionManager on `Workspace._isOverviewWindow`, `WindowCyclerPopup/GroupCyclerPopup._getWindows`, `WindowSwitcherPopup._getWindowList` | hide-minimized-windows (or minimize-to-dock) | A |
| `moveFullscreenWindow.js` (1093) | Fullscreen windows get their own workspace to the right; return on exit | `workspace_manager append/remove_workspace`, `notify::n-workspaces`, `workspace-switched`; **`St.Settings.get().slow_down_factor = 3`** for 700ms (`:96-114`); `Main.wm._workspaceAnimation.movingWindow` (`:130`); expandos `_kiwi_isolated`, `_kiwi_fullscreenWorkspaceIndex`, `_kiwi_originalWorkspaceIndex`; ~8 timeout/idle maps | move-window-to-new-workspace | A- |
| `reduceWindowAnimations.js` (79) | macOS-style map/destroy fade | Replaces `Main.wm._shouldAnimateActor` (`:20-71`); one-shot `actor.ease` swap; reads `Main.wm._mapping/_destroying` | reduce-window-animations | A (an in-flight actor may keep `_kiwiEasePatched`) |
| `transparentMove.js` (190) | Opacity 230 while moving or resizing | `grab-op-begin/end`; walks actors for `MetaSurfaceActor` by constructor name (`:98-112`); opacity keyed by **pid** (`:123`) | transparent-move | A |
| `focusLaunchedWindow.js` (36) | Activate windows that demand attention | `global.display window-demands-attention` | focus-new-windows | A |

### 5.3 Dock (Dash-to-Dock) modules

| File (lines) | Purpose | Shell or D2D internals touched | Keys | Cleanup |
|---|---|---|---|---|
| `dockUtils.js` (322) | Shared D2D discovery, item building, separators, press darkening, schema lookup | `dockContainer._slider`, `dash._box`, `_boxContainer`, `_isHorizontal`, `_position`, `_hookUpLabel`, `iconSize`, `child._delegate.app/icon` (`:68-304`); `ExtensionState.ACTIVE` | — | n/a |
| `dockBlur.js` (325) | Blur behind the dash pill | `Meta.BackgroundGroup` at dashBox index 0; repaint signals on `restacked`, wm map/destroy/…, `_backgroundGroup`; own `uiGroup child-added` plus a 1s × 10 retry (**duplicates `watchDocks`**, `:281-304`); 200ms × 25 allocation retry | dock-blur | A |
| `dockStyling.js` (125) | `.kiwi-dock-styled`, press darkening, tooltip scheme classes | uiGroup `child-added`, `dash._box child-added`, `St.Settings notify::color-scheme`; `button._kiwiPressId` expando | dock-styling | A |
| `dockColors.js` (422) | Indicator and separator colours follow the content behind the dock | `Shell.Screenshot.screenshot_area` (`:212`); **writes D2D GSettings** (`:273,:283`), restored only in `disable()` (`:412`) | dock-adaptive-colors | B (crash leaves D2D keys changed) |
| `minimizedToDock.js` (856) | Minimized-window thumbnails in a strip before the trash; adopts the D2D trash item | `paint_to_content` snapshots (`:76`); `win.set_icon_geometry` on **every** eligible window (`:641-664`); `notify::minimized` on all windows; moves `dash._separator`, reads `_dragPlaceholder` (`:472-489`); re-parents the trash item (`:535-551`); `Clutter.ShaderEffect` vs `new_with_snippet` (51) branch (`:208-217`) | minimize-to-dock | B (snapshot map deliberately survives disable, `:794-800`) |
| `downloadsStack.js` (1092) | Downloads folder stack and fan | `Gio.FileMonitor` on Downloads; `Main.layoutManager.addTopChrome(overlay)` + **`Main.pushModal`** (`:421,:504`); D2D `container._updateDashVisibility/_ignoreHover/_box.sync_hover`, `dash.requiresVisibility` (`:539-555`); joins the `kiwi-minimized-strip` | downloads-in-dock, downloads-behind-folder | A |
| `launchpadApp.js` (279) | Launchpad favourite that toggles Show Apps | Writes `~/.local/share/applications/org.gnome.Shell.Extensions.Kiwi.Launchpad.desktop`; **`Shell.AppSystem.prototype.lookup_app` override** (`:220-224`); overrides `appIcon.activate/popupMenu` (`:66-69`); `favorite-apps` writes | enable-launchpad-app, launchpad-app-custom-icon | A- (rewrites files and favourites on every lock) |

### 5.4 Theming modules

| File (lines) | Purpose | Writes | Cleanup |
|---|---|---|---|
| `gtkThemeManager.js` (191) | Managed `@import` block in `~/.config/gtk-{3,4}.0/gtk.css` | Creates the directories, prepends the block, deletes the file if only Kiwi content is left (`:90-137`) | A- (async removal on disable is not awaited; overlaps the next enable) |
| `mozillaThemeManager.js` (293) + `firefoxThemeManager.js` (26), `thunderbirdThemeManager.js` (26) | Firefox and Thunderbird `chrome/userChrome.css` imports | Moves the user's `chrome/` to `chrome.bak`, writes `chrome/` plus a `.kiwi-managed` marker, appends `toolkit.legacyUserProfileCustomizations.stylesheets` to `user.js`, deletes `chrome/` and restores `.bak` on disable (`:48-146`) | **C** (deletes directories it may not own; never reverts `user.js`; all sync IO) |
| `blurPaintSignal.js` (39) | Clutter.Effect that emits `update-blur` on paint (blur-my-shell hack for GNOME Shell #2857) | — | n/a |

---

## 6. Shared helpers and cross-module dependencies

### 6.1 Import graph (`from './…'`)

```
extension.js ──► every module, plus dockUtils {dockActive,isDockExtension,resetDockSettings}
                 and windowTiling {enableDragRestore,disableDragRestore}

windowControls ─┐
windowTitle ────┴─► windowTiling        (isMaximized, maximize/unmaximize, tile grid)
panelTransparency ─┐
dockBlur ──────────┴─► blurPaintSignal  (connectPaintSignal)
dockBlur, dockColors, dockStyling, downloadsStack, launchpadApp, minimizedToDock ─► dockUtils
quickSettingsNotifications ─► quickSettingsDnDRemoval
panelMedia ─► mediaPlayback (MediaItem, Source)
firefoxThemeManager, thunderbirdThemeManager ─► mozillaThemeManager
```

### 6.2 Implicit couplings (no import, but behaviour depends on another module)

| Coupling | Evidence |
|---|---|
| windowControls needs to be the last child of `_rightBox`, after calendar's `dateMenu` | extension.js:121-127; windowControls.js:559-562 |
| windowControls on the left assumes windowTitle is the last `_leftBox` child | windowControls.js:548-550, 564-567; windowTitle.js:446 |
| downloadsStack joins minimizedToDock's `kiwi-minimized-strip` by actor name | downloadsStack.js:864-878 |
| downloadsStack reads dockStyling's `.kiwi-dock-styled` class to decide press darkening | downloadsStack.js:830-832 |
| minimize-to-dock forces hideMinimizedWindows | extension.js:178 |
| panelTransparency's `.kiwi-panel-dark-text` / `-light-text` restyle keyboardIndicator's label | stylesheet.css:749-768 |
| calendar's dot placement depends on `keep-notification-panel` and on dateMenu's index in `_rightBox` | calendar.js:53-56, 81-85 |
| quickSettingsNotifications and the custom DnD only exist when calendar is moved and the panel is not kept | extension.js:106-119 |
| panelHover counts *any* `statusArea[*].menu.isOpen` to stay revealed | panelHover.js:53-55 |
| panelMedia's redraw callback exists for Blur My Shell's dynamic popup blur | panelMedia.js:139-144 |

### 6.3 Global and expando state

* Module-level `let` singletons in every module. There are no classes on the extension object.
* Expandos on Shell or Mutter objects: `win._kiwiRestore` (windowTiling), `win._kiwi_isolated` / `_kiwi_fullscreenWorkspaceIndex` / `_kiwi_originalWorkspaceIndex` (moveFullscreenWindow), `actor._kiwiEasePatched` (reduceWindowAnimations), `label._kiwiOriginalText` (keyboardIndicator), `button._kiwiPressId` (dockStyling), `button._currentSystemIcon` (windowControls), `_ghostMenu._ghostAnchor` (panelHover).
* `Gio._promisify` is called at module load in `launchpadApp.js:12-16` and `mediaPlayback.js:27-28`, and in `gtkThemeManager.enable()` (`:179`).

---

## 7. Panel and Quick Settings occupancy map

```
Main.panel
├─ _leftBox:   [activities (maybe hidden)] … [window-controls if layout is left, at len-1] [window-title (-1)]
├─ _centerBox: [dateMenu]  ← removed by calendar.js when move-calendar-right=true (default)
└─ _rightBox:  [lock-indicator @0] [kiwi-media @1] … [keyboard] [quickSettings]
               [dateMenu (moved here)] [notification dot if keep-notification-panel] [window-controls (last)]

quickSettings._indicators (panel side): [username @0] … stock indicators … [battery % label] [DnD moon] [notification dot]
quickSettings.menu._grid: stock toggles (built-in DnD toggle removed on 49+) … [NotificationWidget (col-span 2)]
quickSettings._system._systemItem.child: … [Kiwi DnD button] [LockItem] …
quickSettings.menu.actor style: "max-height: 90% of monitor"
Main.messageTray._bannerBin: x_expand, x_align END, y_align START (top-right banners)
Main.layoutManager.panelBox: [kiwi-panel-blur-group @0] [panel]; translation_y driven by panelHover
Main.layoutManager.overviewGroup: [kiwi-overview-blur-group @0] …
Main.uiGroup: [panel-hover-area (chrome)] [kiwi-downloads-fan (top chrome, modal)] [ghost menu + anchor]
```

---

## 8. CSS and theming pipeline

### 8.1 GTK (`gtkThemeManager.js`)

1. `_stylesheetsFor(version)` (`:38-79`) picks files in this order:
   * `titlebuttons{,-alt}{3,4}.css`, plus `titlebuttons-glass{3,4}.css` for glass
   * `titlebuttons-size-small{3,4}.css` (+ glass small)
   * `hide-titlebar{,-fullscreen}{3,4}.css` when `show-window-controls`
   * `fixes{3,4}.css` when `popup-menu-styling`
2. `_buildManagedBlock()` wraps `@import url("file:///…/kiwi@kemma/css/<f>")` lines between `MARKER_BEGIN`/`MARKER_END` (`:12-13,:81-88`).
3. `processUserGtkFile()` (`:104-137`) loads `~/.config/gtk-N.0/gtk.css` asynchronously. It strips the old block (`MANAGED_BLOCK_REGEX`) and any legacy line containing `@import … kiwi@kemma` (`LEGACY_IMPORT_REGEX`, for versions ≤1.9.1), **prepends** the new block so user rules win, then writes it back with *sync* `replace_contents`. If only Kiwi content was in the file, the file is deleted.
4. The update re-runs when any of 6 keys changes (`:151`). On disable it is called with an empty block (`:139-146`). The returned promise is not awaited.
5. The imported CSS uses relative `url("../icons/titlebuttons/…png")` with `-gtk-scaled()` @2 variants, so it resolves inside the extension directory.

**What hides titlebar buttons today:** `hide-titlebar3.css` moves `headerbar > box.left/right` 200px off-screen at opacity 0 for `.maximized`/`.fullscreen`, and does the same for `.titlebar.default-decoration` (SSD fallback). `hide-titlebar4.css` targets `headerbar windowcontrols.start/.end`. Both are conditioned on `.maximized`/`.fullscreen` window classes. There are no unconditional variants yet. Firefox and Thunderbird use `*Hidden.css` keyed on `:root[sizemode="maximized"]` only.

**What is restored on disable:** the GTK managed block is removed. Mozilla `chrome/` is deleted and `chrome.bak` moved back, but `user.js` is left modified. D2D colour keys and `favorite-apps` are restored by their modules. Nothing restores files if the shell crashes. The `.gitignore` notes that the old generated `css/gtk3.css`/`gtk4.css` files are no longer written (issue #86).

### 8.2 Mozilla (`mozillaThemeManager.js`)

The profile is resolved from `installs.ini`, then `profiles.ini`, in `~/.mozilla/firefox` then `$XDG_CONFIG_HOME/mozilla/firefox` (`:185-245`). Imports are `${prefix}.css`, `.alt.css` or `.glass.css`, plus `-size-small.css` and `Hidden.css` (`:90-112`).

### 8.3 `stylesheet.css` sections (Shell/St)

| Lines | Section | Gate |
|---|---|---|
| 10-16 | Window title icon (`-st-icon-style: symbolic`), `.app-menu-icon` padding | **ungated** (`.app-menu-icon` is a stock class) |
| 19-185 | Top panel: spacing, icon size, arrows removed, dateMenu padding, dark/light text flips, `:overview` transparency | `#panel.kiwi-panel-styled`, `.kiwi-panel-dark-text/-light-text`, `.kiwi-panel-fullscreen`, `.kiwi-panel-no-transition`, `.kiwi-panel-color-inherit`. Includes legacy `Gjs_AggregateMenu` selectors (`:84-85`) |
| 188-247 | Panel window controls | Kiwi classes; GType selector `Gjs_apps_windowControls_WindowControlsIndicator` (`:213-219`) |
| 250-330 | Tiling grid in the title menu | Kiwi classes |
| 333-363 | Popup menu accent (with `!important` over Blur My Shell); **ungated** `.maximized .window-content` (`:360`) | `.kiwi-popup-styled` |
| 366-378 | Notification badge, DnD indicator | Kiwi classes |
| 381-542 | Dash-to-Dock spacing, adaptive colours, pill glow, tooltips | `#dashtodockContainer.kiwi-dock-*` |
| 545-723 | QS notifications, media cards, **ungated** `.message-title`, `.message-group-title`, `.message .message-*-button`, `.message-list-clear-button` (`:656-692`) | mixed |
| 726-768 | Keyboard indicator | `.kiwi-input-themed/-en` |
| 770-899 | Minimized strip, Downloads stack and fan | Kiwi ids and classes |

---

## 9. `advanced/` native module

* `titlebuttons_hover.c` (185 lines) is a GTK3 module loaded through `GTK_MODULES`. It adds `.titlebuttons-hover` / `.titlebuttons-hover-alt` to the headerbar while any titlebutton is hovered, so all three buttons light up together (used by `titlebuttons-alt3.css:179+`).
* Wiring happens through an initial idle scan and then a **`g_timeout_add(800ms)` periodic scan of every toplevel, forever, in every GTK3 process** (`:180-185`). `on_widget_realize` (`:151-160`) is dead code that is never hooked up.
* `install-extra.sh` copies the **committed prebuilt `libtitlebuttons_hover.so`** (tracked in git) to `~/.config/environment.d/`. It writes `GTK_MODULES=<path>` in `10-gtk3-titlebuttons.conf` (`:59-63`), which overrides any existing `GTK_MODULES`. `compile-extra.sh` builds it from source with gcc and pkg-config. `uninstall-extra.sh` removes both files. `relink.sh` and `convert-svg.sh` are asset helpers.
* The module is not shipped in the EGO zip, because `pack` only includes `icons`, `apps` and `css` as extra sources. The prefs Advanced page links to it (`prefs.js:999-1033`).

---

## 10. i18n, build, packaging, CI

* **i18n:** `metadata.json` declares `gettext-domain: kiwi@kemma`. Shell modules receive `this.gettext` from `extension.js` (`:58`); prefs uses `gettext as _` from the prefs module. `translating/kiwi.pot` (193 msgids, POT-Creation 2026-10-01) and 17 `po/*.po` files exist. There is no `xgettext` regeneration script; `translating/compile-translations.sh` only validates and compiles `.mo` files into an ignored `locale/` folder. One plural string (`'%d More in Files'`, downloadsStack.js:455) uses `.replace` instead of `ngettext`.
* **Schemas:** XML only. `*.compiled` is git-ignored (`.gitignore`), and commit `9ec6053` removed the compiled file. `gnome-extensions pack` compiles or includes schemas.
* **Build/packaging:** there is no Makefile or zip script. `gnome-extensions pack --extra-source=icons --extra-source=apps --extra-source=css --podir=po .` runs in CI only.
* **CI:** `.github/workflows/pack-release.yml` runs on `release: published` or manually. It apt-installs `gnome-shell` to get `gnome-extensions`, renames the zip with `version-name`, and uploads it with `actions/upload-release-asset@v1` (archived action). There is no lint (ESLint config absent), no `glib-compile-schemas --strict` check and no tests. `.github/ISSUE_TEMPLATE/bug_report.md` and `FUNDING.yml` are present.
* **Docs drift:** the README badge says "GNOME Shell 48–50" (`README.md:2`), but `metadata.json` says 48–51. Shell 46 and 47 were dropped in `e7b10f1` (2026-10-01).
