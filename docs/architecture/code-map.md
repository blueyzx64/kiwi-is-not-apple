# Kiwi (is not Apple) — Code Map

> **Summary (read this and you can stop):**
> 1. Kiwi (`kiwi@kemma`, v2.3.1, GNOME Shell 48–51) is one `Extension` subclass (`extension.js`) that wires about 35 feature modules in `apps/*.js`. Each module exports `enable()`/`disable()` and keeps its state in module-level variables.
> 2. Toggling is centralised and coarse. **Any** GSettings change re-runs `_on_settings_changed()` (`extension.js:57-277`), which calls `enable()` or `disable()` on *every* module. So every module must be idempotent.
> 3. Most features patch private Shell internals directly: `Main.panel._leftBox/_rightBox/_centerBox`, `quickSettings._indicators/_grid/_system`, `Main.messageTray._bannerBin/_sources`, `layoutManager._trackedActors`, `Main.wm._shouldAnimateActor`, `Workspace.prototype._init` and Dash-to-Dock's private actors.
> 4. App theming works by writing outside the extension. `gtkThemeManager.js` injects `@import` lines into `~/.config/gtk-{3,4}.0/gtk.css`. `mozillaThemeManager.js` rewrites the Firefox and Thunderbird profile `chrome/` folders and `user.js`. `dockColors.js` writes Dash-to-Dock's GSettings and `launchpadApp.js` writes a `.desktop` file plus `favorite-apps`.
> 5. *Original state:* no build system beyond `gnome-extensions pack`, no lint, no tests, no `session-modes`, so the whole extension is torn down and rebuilt on every screen lock. *Merged since:* a `Makefile`, `ci.yml`, eslint, 25 test files and the `FeatureRegistry` (section 0). `session-modes` is still not declared.
> 6. Items 1 and 2 describe the original dispatcher. It was replaced by `features.js` + `lib/featureRegistry.js` (section 2.0).

> **Status note (docs card D8, pass 2).** Sections below that describe the original code keep
> their inner line numbers from commit `c2f3d0f` unless a row says *Merged*. The merged work is
> described in **section 0 (merged since)** and in rows or paragraphs marked *Merged*. Status
> words: "merged, untested on Shell" means it is on the integration branch and passes
> `make check` (eslint, strict schema, `tests/run.sh`) but nobody has run it on a real GNOME Shell.
> The notch (S8) is now merged too (0.4), also untested on Shell.

## Table of contents

0. [Merged since the first map](#0-merged-since-the-first-map)

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

## 0. Merged since the first map

Base: `ccr-f3c1f44c-rv5a8r` at `817e61a`. Merged features, all untested on Shell: foundation (S1),
window controls (S2), Liquid Glass (S3), clipboard (S4), Spotlight (S5), auto-hide top bar (S6),
Control Center (S7), notch (S8), Stage Manager (S9). Merged debt cards: D1 to D6, D7 (CI and Makefile), D9, D10.
Frozen APIs are in `.swarm/shared/contracts.md`.

### 0.1 `lib/` (shared, no feature logic)

| File (lines) | Role | Used by |
|---|---|---|
| `lib/disposables.js` (239) | `CleanupRegistry`: `add`, `connect`, `timeout`, `idle`, `inject`, `actor`, `file`, `release`, `dispose` (newest first, safe twice) | `extension.js`, `featureRegistry`, `glass`, `windowControls`, `panelTransparency`, `gtkThemeManager` |
| `lib/settings.js` (153) | `KiwiSettings` wrapper (typed getters/setters, `watch`, `attach`) and `runMigrations(gs, list)` (copy old key to new key, never resets the old one) | `glass`, `windowControls`, `panelVisibility` |
| `lib/compat.js` (170) | The only place that compares Shell versions: `SHELL_MAJOR`, `atLeast`, `SHELL_HAS_SYSTEM_DND`, `maximizeWindow/unmaximizeWindow`, `MENU_CLOSE_ARGS`, `reducedMotion`, `watchReducedMotion`, `SHADER_API`, `createShaderEffect`, `setUnredirectAllowed`, `STOCK_PANEL_CHROME` | `windowControls`, `glass`, `panelVisibility` |
| `lib/featureRegistry.js` (230) | `FeatureRegistry`: `register/registerAll/start/refresh/apply/stop/status/isActive`. Edge-triggered enable and disable, per-feature `CleanupRegistry`, errors caught per feature, `needs`, `conflictsWith`, `restartOn`, `startOnly` | `extension.js` |
| `lib/glass.js` (~330) | `Glass` singleton (GlassService): `attach`, `wants`, `watch`, `configure`, `motion`, `snapshot`. *UX round 1:* plain transparency, no blur, no shader, no extra layer. `attach` puts `kiwi-glass-*` fill classes on the target actor itself, so the fill follows its own border-radius; `layers: 'blur'` callers draw nothing (they keep their own background) | `liquidGlass`, `panelTransparency`, `clipboard/popover`, `stageManager/strip`, `notch/view`, `modalSurface` |
| `lib/glassParams.js` (~225) | Pure functions that turn a settings snapshot into tint and contrast parameters; `fillAlpha`/`fillClasses` pick the fill class (5 % alpha buckets, Blur slider = frost) | `glass`, `liquidGlass`, tests |
| `lib/keybindings.js` (112) + `keybindingsModel.js` (85) | `Keybindings.add(cleanup, key, settings, fn)`: the one place that registers global shortcuts (`Main.wm.addKeybinding`), removed when the cleanup is disposed, rebinding live when the `as` key changes. The model finds conflicts with GNOME's own accelerators and normalizes accel strings (pure, tested) | `clipboard`, `stageManager/shortcut`, `spotlight` |
| `lib/modalSurface.js` (266) + `modalModel.js` (86) | `ModalSurface`: the one glass modal (Quick Paste, Spotlight). Only one Kiwi modal is open at a time; `registerForeign` lets the Downloads fan close it too. Glass from `Glass.attach` surface `overlays`, content in a sibling frame. `ModalArbiter` is the pure part | `clipboard/quickPaste`, `spotlight/view`, `downloadsStack` |

### 0.2 `coordinators/`

| File (lines) | Role |
|---|---|
| `coordinators/panelLayout.js` (175) and `panelLayoutModel.js` (31) | `PanelLayout.claim(cleanup, {id, actor, box, anchor})` places a panel actor with anchors (`first`, `last`, `before`, `after`) and re-sorts in one idle when a claimed box gets a child. Only claimant today: `window-controls` |
| `coordinators/panelVisibility.js` (569) and `panelVisibilityModel.js` (208) | `PanelVisibility`: `hold`, `reveal`, `isVisible`, `autoHiding`, `mode`, `connect`. `PanelVisibilityFeature` is the `panel-autohide` feature: pressure barrier on the top edge, struts, slide animation, `kiwi-panel-autohide` class. The pure state machine and edge-segment math are in the model file |

| `coordinators/windowState.js` (229) | `WindowState` singleton (`WindowStateRegistry` is the class, for tests): per-window flags `staged`, `isolatedFullscreen`, `tiled`, `parkedInDock`; `set/has/flags/list/clear/clearFlag`, `skipsDock`, `hiddenFromSwitcher`, `stageActive`/`setStageActive`, `interceptMinimize`, `watch`. No gi imports. Flags drop when the window is unmanaged. Consumers: `stageManager`, `windowControls` (minimize interceptor), `minimizedToDock` (`skipsDock`, sets `parkedInDock`) |

`panelHover.js` was **removed** by the auto-hide merge. Its job (reveal in fullscreen) is mode
`fullscreen-hover` of `PanelVisibility`. The old key `panel-hover-fullscreen` stays in the schema only so
`runMigrations` can copy it to `panel-autohide` and `panel-autohide-fullscreen-only`.

### 0.3 Feature folders

| Path | Role |
|---|---|
| `apps/windowControls.js` (428) plus `apps/windowControls/{model,icons,prefs}.js` | Panel window controls as a `cls` feature (`WindowControlsFeature`). Shown for every focused window by default (`window-controls-scope`: all, maximized, fullscreen). Position `window-controls-position`: system, left, right, resolved by the pure `model.js` against the WM `button-layout`. `titlebarHideSheet()` picks which `css/hide-titlebar*.css` removes real titlebar buttons (`remove-titlebar-buttons`). `icons.js` caches the icon directory listing |
| `apps/liquidGlass/{index,prefs}.js` | `LiquidGlass` feature (`liquid-glass` key). Attaches glass to the panel (only while Panel Transparency is off) and to the Quick Settings and date menu boxes (`.popup-menu-content`, never the BoxPointer: an `-arrow-background-color` there drew the square backing). The dock keeps Dash to Dock's own background; the `overlays` surface is for future features to attach themselves. Prefs page *Liquid Glass* |
| `apps/autohide/{prefs.js,style.css}` | Prefs page *Auto-hide Top Bar*; `style.css` is the source of the `/* feature: autohide */` block in `stylesheet.css` |
| `apps/clipboard/{index,model,store,popover,quickPaste,view,prefs}.js`, `style.css` | *Merged, untested on Shell.* Clipboard history (`clipboard-history`, class `ClipboardHistory`). Watches `Meta.Selection owner-changed` (no polling). `model.js` (512) is pure policy: dedupe, cap, pins, size and mime limits, password-manager and sensitive-text filtering, terminal paste chord. `store.js` saves async under `~/.local/share/kiwi/clipboard/` (dir 0700, files 0600), reloaded on enable because Kiwi tears down on lock. `popover.js`: top-bar button placed through `PanelLayout`. `quickPaste.js`: keyboard window on `ModalSurface`. `clipboardService()` is the read API the Spotlight provider uses. The shortcut default is empty (`[]`, EGO rule); the prefs row has a *Use Super+Shift+V* button |
| `apps/spotlight/{index,model,view,calculator,overlayKey,providerInfo,prefs}.js`, `providers/{apps,dbusSearch,settings,settingsCatalog,clipboard}.js`, `style.css` | *Merged, untested on Shell.* Spotlight (`spotlight`, class `SpotlightFeature`). `model.js` is the pure ranking, sections and search session (stream, timeout, cancel). `calculator.js` has its own parser (no `eval`, units). `overlayKey.js` takes over the Super tap by blocking only the Shell's own `overlay-key` handler (found with `signal_handler_find`, oldest id) and unblocking it on stop. Providers: apps (`Shell.AppSystem`), files and others through GNOME search providers over D-Bus (`dbusSearch.js`, async with timeout), a settings catalog, clipboard history, web search (`spotlight-engine`). Uses `ModalSurface`, `PanelVisibility.hold` and closes on lock |
| `apps/controlCenter/{index,model,shell,tiles,userRow,nowPlaying,prefs}.js`, `style.css` | *Merged, untested on Shell.* Control Center (`control-center`, class `ControlCenter`, registered last). Keeps the stock Quick Settings grid but sets 4 columns, reorders and sets column spans per item (table in `model.js`). Snapshots the actors on enable and restores the order on disable, skipping dead actors. It owns Do Not Disturb (`quickSettingsDnDRemoval` restores into the live container; `quickSettingsNotifications` has one gate). `userRow.js` puts avatar and name in the system item (replaces `add-username-to-quick-menu`, migrated to `control-center-user-row`). `battery-percentage-always` binds the panel label to the power toggle. Now Playing (`nowPlaying.js`) uses the shared `MprisWatcher` (0.4). No `Glass.attach` of its own: `Glass.watch` only, class `kiwi-cc-glass` |
| `apps/stageManager/{index,model,shellAdapter,windowHider,strip,shortcut,prefs}.js`, `style.css` | *Merged, untested on Shell.* Stage Manager (`stage-manager`, class `StageManager`; `conflictsWith` minimize-to-dock, move-window-to-new-workspace, tiling-title-menu, so those pause and keep their settings). One stage per workspace, the focused app's windows are the stage, other stages become cards in a strip on a chosen side. `windowHider.js` hides with opacity 0 and removes from the pick list, never minimizes, and restores every window and frame on disable. `model.js` is pure. The toggle shortcut is its own entry `stage-manager-shortcut` (`StageManagerShortcut`) so it works while the feature is off |
| `apps/roundedCorners/{index,effect,model,prefs}.js` | Rounded window corners (`rounded-corners`, off by default; `rounded-corners-radius`, `rounded-corners-blacklist`). One `KiwiRoundedCornersEffect` (a `Shell.GLSLEffect`, `lib/compat.js` `GLSL_EFFECT`, so 48-50 only) per window actor, disabled while maximized, tiled, fullscreen or excluded, removed on disable. The fragment snippet rounds the frame rect's corners and carries the window's own edge, outline and shadow around the arc (no hard cut). `model.js` is pure (which windows qualify, radius clamp, frame inset, mutter's offscreen-texture origin); Control Center tile *Rounded Corners* |
| `apps/util/windows.js` (50) | Shared window predicates with no gi imports: `isHelperWindowInfo`, `isUserWindow`, `windowForActor`. Used by `windowTitle`, `focusOnOverviewExit`, `windowControls` |
| `apps/dockRetry.js` (56), `apps/dockColorsModel.js` (64), `apps/batteryModel.js` (20) | Pure helpers from debt cards: `boundedRetry` (the one retry loop for dock discovery), the model that decides when saved dock colours are stale, and `shouldShowLabel` for the battery label |
| `features.js` (303) | `FEATURES` array that replaces the dispatcher. Order is start order |
| `tests/*.test.js`, `tests/run.sh` | 25 test files run with `gjs -m` (lib, coordinators, window controls, clipboard, Spotlight including a fake search provider on `dbus-run-session`, Control Center, Stage Manager, dock helpers, Mozilla manager, window utils, battery) |

### 0.4 Notch (merged, untested on Shell)

| Path | Role |
|---|---|
| `coordinators/notificationRouter.js` (297) | `NotificationRouter`: the one owner of how banners reach the screen. `setBannerSink(cleanup, {present(n)})` diverts banners after the stock filters (acknowledged, urgency, DND, busy, fullscreen) ran; the notification stays in its source so it remains in the calendar message list; last sink wins; stock banners return on release. `pinBanners(cleanup)` keeps banners top-right (used by `calendar.js`). `state()`/`connect()` give `{count, dnd}` (replaces the calendar dot's 5 s poll), `setDnd`, `isDiverting`. Starts with its first user and tears down with the last. Uses private `MessageTray` members, guarded in `lib/compat.js` |
| `coordinators/mprisWatcher.js` (81) and `lib/mpris.js` (483) | `MprisWatcher.acquire(cleanup, gettext)` returns a handle with `players`, `on('player-added'/'player-removed')`, `release()`. One shared `Source` of `Player` objects (moved out of `mediaPlayback.js`), started by the first user and stopped, with pending D-Bus calls cancelled, when the last lets go. Users: `panelMedia`, `controlCenter/nowPlaying`, `notch` |
| `apps/notch/{index,stateMachine,view,prefs}.js`, `style.css` | `NotchFeature` (`notch`). `stateMachine.js` (385) is pure and tested (`tests/notchStateMachine.test.js`): states idle 190x32, live activity 250x32, OSD 270x32 (1.5 s, preempts), compact 290x32, expanded 430x140 or dashboard 640x200. `index.js` wires the banner sink (`notch-notifications`), the MPRIS live activity and dashboard (`notch-live-activities`), `Main.osdWindowManager._showOsdWindow` (`notch-osd`), a `PanelLayout` claim in the centre box and `PanelVisibility.hold('notch')` |

Changes in existing modules: `calendar.js` (216) now uses `NotificationRouter.pinBanners` and the router state instead of its own poll; `quickSettingsNotifications.js` (402) uses the router; `panelMedia.js` (159) uses `MprisWatcher`; the Control Center Now Playing tile uses `MprisWatcher` (no second Source). `apps/mediaPlayback.js` keeps `MediaItem` (the card), the Source moved to `lib/mpris.js`.

**Calendar forcing.** `features.js` defines `calendarRight = move-calendar-right || notch`. While the notch is on the clock moves right and the notification list lives in Quick Settings, whatever `move-calendar-right` says. Prefs says so: the notch row has a subtitle and the `move-calendar-right` row is greyed out with "On while the notch is on".

**Deferred (phase 2, decided).** The "Up next" dashboard panel (MPRIS has no reliable queue API), the timer, recording and charging live activities, and "toggle changed" confirmations. Phase 1 has the Clipboard dashboard panel and the "Copied" confirmation.

### 0.5 Debt cards merged (what changed in existing modules)

| Card | Change (merged, untested on Shell) |
|---|---|
| D1 user-files | `mozillaThemeManager.js` (500) uses async Gio only, one job queue per manager, removes only the Kiwi-tagged line from `user.js` on disable (deletes the file if only Kiwi content is left), never writes an empty buffer (it hangs), writes the marker first, respects symlinks and foreign files, logs delete failures. `gtkThemeManager.js` (227) async IO with a shared queue; dangling `gtk.css` imports after a crash are documented, not auto-cleaned. Tests: `tests/mozillaThemeManager.test.js` |
| D2 panel-transparency | `panelTransparency.js` (929): window signals on all workspaces (`window-added/removed`, workspace switch resync), 2 s poll removed, async wallpaper sampling with a cancellable, `WeakSet` window tracking, class `kiwi-panel-solid-black` (old `kiwi-panel-color-inherit` still styled) |
| D3 overview-patches | `overviewSeamlessZoom`, `skipOverviewOnLogin`, `reduceWindowAnimations` patch through `CleanupRegistry.inject`, guard private properties, `firstLogin` is no longer reset on disable, pending ease swaps are cleared on disable |
| D4 window-utils | `apps/util/windows.js` shared predicates; `windowTitle` guards AppMenu privates with `?.`; `transparentMove` keys its saved opacity by `WeakMap<Meta.Window>` instead of pid |
| D5 dock | `dockRetry.js` (one bounded retry), `dockBlur` discovers docks through `dockUtils.watchDocks`, `dockColors` saves the original Dash-to-Dock colours in the Kiwi key `dock-colors-saved` and `restoreStaleColors` repairs them on enable after a crash (only if the key still holds a Kiwi colour), `launchpadApp` overrides `lookup_app` through `CleanupRegistry.inject`. `dock-adaptive-colors` now gets the raw settings (`ctx.settings`) |
| D6 css-debt | Stock-class rules are gated behind Kiwi classes (`.kiwi-popup-styled`, `.kiwi-notifications`, `.kiwi-window-title-icon`), dead `Gjs_AggregateMenu` selectors and the ungated `.maximized .window-content` rule removed |
| D7 build-ci | `Makefile` (`pack`, `pot`, `install`, `uninstall`, `test`, `lint`, `schema-check`, `check`, `clean`), `.github/workflows/ci.yml` on pull requests and pushes to main (eslint, strict schema, tests, pack), `pack-release.yml` no longer uses the archived upload action, `dist/` ignored, README badge 48 to 51 |
| D9 small-modules | `downloadsStack` uses `ngettext` and an async thumbnail header; `lockIcon` takes its directory from the extension and reacts to `state-changed` (no startup delay); `batteryPercentage` uses `batteryModel.shouldShowLabel` and an edge flag |
| D10 window-move | `moveFullscreenWindow.js` (1112): guards the private `movingWindow`, restores `slow_down_factor` only if nobody changed it, prefers `is_maximized()` |

---

## 1. Repository layout

| Path | Lines | Role |
|---|---|---|
| `extension.js` | 77 | *Merged:* thin entry point. Builds a `FeatureRegistry` from `features.js`, forwards `changed` signals, hands over `ctx`. The old 365-line dispatcher is gone |
| `features.js` | 314 | *Merged:* feature list (see 0.3) |
| `lib/`, `coordinators/` | ~4k | *Merged:* see section 0 |
| `tests/` | — | *Merged:* `run.sh` plus 26 `*.test.js` files |
| `Makefile` | — | *Merged:* developer tasks (see 0.5, D7) |
| `prefs.js` | 1136 | Adw preferences window. Original pages inline in `fillPreferencesWindow()`; feature pages come from `apps/<feature>/prefs.js` (`FEATURE_PREFS`) |
| `metadata.json` | 19 | uuid `kiwi@kemma`, shell 48–51, gettext-domain `kiwi@kemma`, **no `session-modes`** |
| `apps/*.js` | ~12k | 38 files directly in `apps/` (`panelHover.js` and `blurPaintSignal.js` left; new `dockRetry`, `dockColorsModel`, `batteryModel`) plus folders `windowControls/`, `liquidGlass/`, `autohide/`, `clipboard/`, `spotlight/`, `controlCenter/`, `notch/`, `stageManager/`, `util/` |
| `stylesheet.css` | 1649 | Shell (St) styles, mostly gated behind `kiwi-*` classes |
| `css/*.css` (29 files) | ~3.3k | GTK3/GTK4 titlebutton themes, hide-titlebar rules, app fixes, Firefox/Thunderbird userChrome, prefs.css |
| `icons/` | — | PNG titlebuttons (`titlebuttons/`, `titlebuttons-glass/`, @2 variants), SVG symbolic icons |
| `schemas/…kiwi.gschema.xml` | 567 | 97 keys (50 added over the original 47: 3 window controls, 9 Liquid Glass, 5 auto-hide, 1 dock, 3 Control Center, 6 Stage Manager, 9 clipboard, 9 Spotlight, 5 notch) |
| `po/*.po`, `translating/` | — | 17 languages, `kiwi.pot` (193 msgids), compile script |
| `advanced/` | — | Optional GTK3 module `titlebuttons_hover.c` with a **committed prebuilt `.so`** and install scripts |
| `.github/workflows/pack-release.yml` | 60 | Packs the zip on release (debt card D7 may change CI; not described here until merged) |

---

## 2. Boot flow

> **Merged, untested on Shell.** The dispatcher described in 2.1 to 2.4 was replaced by
> `FeatureRegistry` plus `features.js`. Read 2.0 first; 2.1 to 2.4 are kept as history of what
> each feature's old conditions were (the `when`/`setting` fields in `features.js` carry them now).

### 2.0 Current flow (`extension.js`, 69 lines)

1. `enable()` creates a `CleanupRegistry`, gets the settings, opens `org.gnome.desktop.interface`, calls `Glass.configure(settings)`.
2. A `FeatureRegistry` registers every entry of `FEATURES` (`features.js`).
3. The registry is wired to three sources: the Kiwi settings `changed` signal runs `refresh(key)`; `interface changed::show-battery-percentage` runs `apply('battery-percentage')`; `Main.extensionManager extension-state-changed` runs `refresh(null)` when the dock extension (`isDockExtension`) changes state.
4. `start(ctx)` with `ctx = {extension, settings, gettext, interfaceSettings}` starts every wanted feature in list order.
5. `disable()` disposes the extension registry, calls `stop()` (reverse order, each feature's own cleanup registry is disposed after its `disable()`), unconfigures Glass, resets the cached dock settings.

Entries in `features.js`: 40 ids. Two are `startOnly` (`gtk-theme`, `focus-new-windows`). Nine use `cls` (`window-controls`, `panel-autohide`, `clipboard-history`, `spotlight`, `liquid-glass`, `control-center`, `notch`, `stage-manager`, `stage-manager-shortcut`) and own their signals through the cleanup registry they are given. The rest are the old modules with `reapply: true` (legacy: `enable()` re-runs on every settings change while wanted). `stage-manager` is the first entry to use `conflictsWith` (minimize-to-dock, move-window-to-new-workspace, tiling-title-menu pause while it runs); `needs` is still unused. `panel-hover-fullscreen` is no longer an id; `panel-autohide` replaced it.

Order matters in a few places: `control-center` is registered after `liquid-glass` and the other panel features so it sees them; clipboard comes before Spotlight, which reads `clipboardService()` lazily; `minimize-to-dock` is registered before `downloads-in-dock` so the stack lets go first on stop; `calendar` is registered before `window-controls`, and `PanelLayout` keeps the controls last when the calendar moves the date menu.

### 2.1 `enable()` — `extension.js:289-311` (old, replaced)

1. `this._settings = this.getSettings()` and a `changed` handler that forwards any key to `_on_settings_changed(key)` (`:290-291`).
2. `org.gnome.desktop.interface` settings watch `show-battery-percentage` so that Kiwi's battery label steps aside when GNOME shows its own (`:292-294`, `_applyBatteryPercentage` `:280-287`).
3. `Main.extensionManager` `extension-state-changed` re-runs the whole dispatcher whenever Dash-to-Dock or Ubuntu Dock changes state (`:298-302`, `isDockExtension` from `dockUtils.js:203`).
4. `gtkThemeManagerEnable(this)` always runs, whatever the settings say (`:305`).
5. `focusLaunchedWindowEnable()` runs only at enable. Changing `focus-new-windows` needs a reload, as the schema description says (`:307-308`).
6. `_on_settings_changed(null)` applies every module (`:310`).

### 2.2 The dispatcher — `_on_settings_changed(key)` (`extension.js:57-277`) (old, replaced by `features.js`)

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

### 2.3 `disable()` — `extension.js:313-364` (old, replaced by `FeatureRegistry.stop()`)

`disable()` disconnects its three signals, then calls every module's `disable()` in a fixed order. `downloadsStackDisable()` must run before `minimizedToDockDisable()` because the stack borrows the minimized strip (`:356-359`). `resetDockSettings()` drops the cached Dash-to-Dock `Gio.Settings` (`dockUtils.js:190`).

Because `metadata.json` declares no `session-modes`, GNOME Shell calls `disable()` on every screen lock and `enable()` on unlock. Commit `bbeac23` ("comply with EGO review guidelines") **removed** a `Main.sessionMode.isLocked` early-return in `launchpadApp.disable()`, so reviewers expect full teardown on lock.

### 2.4 Module registration (old)

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

`KiwiPreferences.fillPreferencesWindow()` (`prefs.js:111-1106`) builds everything inline.

> **Merged, untested on Shell.** Page order now: About, Panel, Dock, Buttons, Options, **Liquid Glass**, **Auto-hide Top Bar**, **Control Center**, **Clipboard**, **Spotlight**, **Notch**, **Stage Manager**, Advanced (last, with *Restore Defaults*). `FEATURE_PREFS` imports the `apps/<feature>/prefs.js` of liquidGlass, windowControls, autohide, controlCenter, clipboard, spotlight, notch and stageManager; each exports `PAGE` and `buildPrefs()` (contract in `.swarm/shared/contracts.md`). The window controls groups join the Buttons page (`PAGE.into: 'windowControls'`) and replace the old *fullscreen-only* row. The `panel-hover-fullscreen` row is gone (the Auto-hide page replaces it). The panel-blur and dock-blur rows defer to Liquid Glass. Line numbers in the table below are the original ones.
 Helpers: `_createLinkRow` (`:38`), `_addSwitchRows` (`:56`), `_withDockActive` (D-Bus `ListExtensions` to the shell, `:77-91`), `_createEnumComboRow` (`:94-109`).

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

**Keys added by merged features** (all *merged, untested on Shell*; the original table above is unchanged):

| Key (default) | Owner | Effect |
|---|---|---|
| `window-controls-scope` ('all') | `windowControls`, `gtkThemeManager` | which windows get panel buttons: all, maximized, fullscreen. Migrated once from `show-window-controls-fullscreen-only` |
| `window-controls-position` ('left') | `windowControls` | system (follow WM `button-layout`), left, right |
| `remove-titlebar-buttons` (true) | `gtkThemeManager` | picks `hide-titlebar{,-fullscreen,-always}{3,4}.css` through `titlebarHideSheet()` |
| `liquid-glass` (true) | `liquidGlass`, `glass` | master switch |
| `liquid-glass-style` ('tinted'), `-blur` (30), `-tint` (55), `-highlight` (true), `-refraction` (false) | `glass` | look of the glass layers |
| `liquid-glass-surfaces` (panel, menus, dock, overlays) | `glass`, `liquidGlass`, `dockBlur` | which surfaces get glass. Seeded from the legacy `panel-blur` and `dock-blur` |
| `liquid-glass-performance` (false), `-off-in-powersave` (true) | `glass` | still-wallpaper path and power-saver behaviour |
| `panel-autohide` (true), `panel-autohide-fullscreen-only` (false) | `panelVisibility` | mode: always, fullscreen-hover or autohide. Migrated once from `panel-hover-fullscreen` |
| `panel-autohide-reveal-delay` (150), `-hide-delay` (600), `-keep-on-desktop` (false) | `panelVisibility` | timings and desktop behaviour |

| `dock-colors-saved` ('') | `dockColors`, `dockColorsModel` | JSON of the Dash-to-Dock colours Kiwi replaced, so `restoreStaleColors` can repair them after a crash |
| `control-center` (true), `control-center-user-row` (true), `battery-percentage-always` (false) | `controlCenter` | feature switch; avatar and name row (migrated from `add-username-to-quick-menu`); always show the battery label unless GNOME shows its own |
| `stage-manager` (true), `-side` ('left'), `-autohide` (true), `-group-by-app` (true), `-recent-count` (6), `-shortcut` ([]) | `stageManager` | feature switch and strip options; shortcut empty by default |
| `clipboard-history` (true), `-recording` (true), `-shortcut` ([]), `-panel-icon` (true), `-history-size` (25), `-images` (true), `-persist` (true), `-ignore-sensitive` (true), `-excluded-apps` ([]) | `clipboard` | history switch, pause, Quick Paste shortcut (empty by default; prefs button *Use Super+Shift+V*), caps, disk persistence, secret filtering |
| `spotlight` (true), `-on-super` (true), `-shortcut` ([]), `-files` (true), `-settings` (true), `-calculator` (true), `-clipboard` (true), `-web` (true), `-engine` ('duckduckgo') | `spotlight` | feature switch, Super tap takeover, optional shortcut, result groups, web search engine |

| `notch` (true), `notch-notifications` (true), `notch-live-activities` (true), `notch-osd` (true), `notch-timeout` (5, range 2 to 30 s) | `notch` | feature switch, which parts take over, and how long a notification stays (hover keeps it open, urgent ones stay until dismissed) |

**Deprecated, still in the schema:** `panel-hover-fullscreen`, `show-window-controls-fullscreen-only` and `add-username-to-quick-menu` are read only by one-time migrations (the last one's feature entry runs only while `control-center` is off). `panel-blur` and `dock-blur` are legacy inputs to Liquid Glass (`Glass.wants`).

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

Line counts in the first column are current (`7b58d8a`). Inner `:NN` references in rows not marked *Merged* are from `c2f3d0f` and may have moved.

Legend: **Cleanup** grades come from reading `disable()`. A = everything created is destroyed or disconnected and every patch restored. B = minor gaps. C = known gaps or persistent side effects.

### 5.1 Panel modules

Rows for `windowControls.js` and `panelHover.js` were updated for merged work. The other rows still describe the original code unless they say *Merged*.

| File (lines) | Purpose | Shell internals touched | Keys | Cleanup |
|---|---|---|---|---|
| `windowControls.js` (433) + `windowControls/` | *Merged, untested on Shell.* Close/min/max buttons in the panel for the focused window (scope setting). Rewritten as `WindowControlsFeature` (class entry). See section 0.3 | Panel button added to the status area and placed by `PanelLayout.claim` (`window-controls`, left before `window-title`, or right last); `global.display notify::focus-window`; per-window maximize/fullscreen signals; `Main.overview showing/hidden`; `Main.screenShield active-changed`; all in one `CleanupRegistry` | enable-app-window-buttons, button-type, button-size, show-window-controls, window-controls-scope, window-controls-position, remove-titlebar-buttons, WM button-layout | A (by design; icon lookups use a cached directory listing) |
| `windowTitle.js` (433) | App name and window title in `_leftBox`, AppMenu plus Kiwi items (tiling grid, Fullscreen, Restore, Always on Top) | `addToStatusArea('window-title', …, -1, 'left')`; `AppMenu` private fields `_newWindowItem`, `_actionSection`, `_quitItem`, `_app`, `_arrowAlignment` ; *merged (D4):* these privates are read with `?.`, and the actor-to-window lookup is the shared `windowForActor`; `global.stage captured-event` while in the overview; idles | show-window-title*, show-tiling-title-menu | A |
| `windowTiling.js` (393) | Tiling engine (`move_resize_frame` on work-area fractions), glyph grid, drag-to-restore | `global.display grab-op-begin` (`:263`); expando `win._kiwiRestore`; version branch `MAXIMIZE_ARGS` 48 vs 49+ (`:51`); `isMaximized` uses the `maximized_horizontally/vertically` properties (`:62`) | — | A (stashes cleared `:269`) |
| `panelHover.js` | **Removed** (merged with auto-hide). Replaced by `coordinators/panelVisibility.js`, see section 0.2 | — | panel-autohide* | — |
| `panelTransparency.js` (930) | Translucent panel, optional blur, adaptive dark/light foreground, tray icon inversion | Owns `Main.panel.style` background and re-asserts it on `notify::style` (`:511-525,:863-866`); `Main.layoutManager._backgroundGroup` children (`:137`); `Meta.BackgroundGroup` inserted at `panelBox` index 0 (`:79-101`); `St.ThemeContext changed`. *Merged (D2):* window signals on all workspaces (resynced on workspace add, remove and switch), no 2 s poll, async cancellable wallpaper sampling, `WeakSet` window tracking, `kiwi-panel-solid-black` class. *Merged (S3/S6):* blur now goes through `Glass.attach` (no private `BlurEffect`), and it reads `PanelVisibility.autoHiding()` / `connect()` to drop its "opaque when a window touches" rule while the bar auto-hides | panel-transparency* | B |
| `panelStyling.js` (25) | Adds the gate classes `.kiwi-panel-styled` (panel) and `.kiwi-popup-styled` (uiGroup) | `Main.panel`, `Main.uiGroup` style classes | panel-styling, popup-menu-styling | A |
| `calendar.js` (216) | Moves the clock to the right, hides the dateMenu message list, moves banners to the top-right, notification dot | `dateMenu.container` `_centerBox`→`_rightBox` (`:198-201`); `dateMenu._messageList.hide()`, `dateMenu._calendar`, `dateMenu.menu.box.style` (`:206-215`); **`Main.messageTray._bannerBin` x/y align** (`:220-228`); dot into `quickSettings._indicators` or `_rightBox` (`:54-56,:86`); `messageTray source-added/removed`, `_sources`, `_notificationQueue` (`:163,:280-287`); 500ms and **5s poll** (`:75,:167`) | move-calendar-right, keep-notification-panel, notification-indicator-style | A- |
| `quickSettingsNotifications.js` (402) | Notification list inside Quick Settings, custom DnD button and panel moon | `quickSettings.menu._grid.add_child` + `layout_manager.child_set_property(column-span 2)` (`:276-286`); `quickSettings.menu.actor.set_style(max-height 90%)` (`:278-280`); `_system._systemItem.child` (`:46`); subclass of `MessageList.MessageView` with `_setupMpris(){}` (`:163-167`); `Main.messageTray.connectObject`; **unbounded 200ms retry**; writes `show-banners`. *Merged (S7):* one gate in `ensureDndButton` so the Control Center can own Do Not Disturb | custom-dnd-button | A- |
| `quickSettingsDnDRemoval.js` (227) | Helpers that find and remove the built-in DnD toggle (49+) and indicator, and keep `dateMenu._indicator` hidden | Heuristic actor search by icon name, accessible name or constructor name (`:27-61`); reparents actors out of `_grid`/`_indicators` and back (`:63-102`); `dateMenu._indicator` notify handlers (`:149-169`); `SHELL_HAS_SYSTEM_DND` version gate. *Merged (S7):* restores into the live container (not a saved dead parent), destroy-safe, and a flag lets the Control Center own DnD | (via caller) | A- |
| `panelMedia.js` (159) | Panel media button with MPRIS cards | `addToStatusArea('kiwi-media', …, 1, 'right')` (`:146`); `global.stage notify::key-focus` (connectObject) | (gated by move-calendar-right && !keep-notification-panel) | A |
| `mediaPlayback.js` (663) | Kiwi's own MPRIS client (`Source`, `Player`) and `MediaItem` card (artwork, marquee, seek slider, soundwave) | Subclasses `MessageList.Message`, `Slider`/`BarLevel` (`:42-104`); private Message fields `_header`, `_icon`, `_bodyBin`, `_mediaControls`, `titleLabel` (`:145-345`); D-Bus `NameOwnerChanged`; 240ms soundwave and 1s progress timers (`:324,:466`) | — | A |
| `batteryPercentage.js` (191) | Battery % label when ≤20% and discharging | `quickSettings._indicators.add_child` (`:23`); UPower D-Bus with **`call_sync`**; `init_async` with no cancellable. *Merged (D9):* the show/hide rule is `batteryModel.shouldShowLabel` with an edge flag, so the label slides in and out once per change | battery-percentage | B (late async callbacks after destroy) |
| `lockIcon.js` (124) | Caps/Num lock icons | `addToStatusArea('lock-indicator', …, 0, 'right')`; keymap via `stage.get_context().get_backend()` (51 note, `:17-18`); *Merged (D9):* takes its icons directory from the extension (`enable(extension)`, falls back to `import.meta.url`) and reads the state on `state-changed` instead of after a 500 ms delay | lock-icon | A |
| `addUsernameToQuickMenu.js` (131) | Real name slides into the QS **panel indicator** box | `quickSettings._indicators.insert_child_at_index(…, 0)` (`:117`) | add-username-to-quick-menu | A |
| `keyboardIndicator.js` (310) | Uppercase or "A" input-source label with a border, or hide it | `statusArea.keyboard` label found by tree walk (`:58-77`); `Keyboard.getInputSourceManager()` `current-source-changed`; expando `label._kiwiOriginalText` | keyboard-indicator, hide-keyboard-indicator | A |
| `hideActivitiesButton.js` (20) | Hides `statusArea.activities` | `hide()`/`show()` | hide-activities-button | A |

### 5.2 Overview and window-management modules

| File (lines) | Purpose | Shell internals touched | Keys | Cleanup |
|---|---|---|---|---|
| `overviewWallpaper.js` (~110) | Wallpaper behind the overview with a translucent dim widget over it (`.kiwi-overview-dim`); no blur since UX round 1 | `Meta.BackgroundGroup` at `layoutManager.overviewGroup` index 0; `Background.BackgroundManager({controlPosition:false})`; re-sinks on `child-added` (`:105-108`); `monitors-changed` rebuild | overview-wallpaper-background | A |
| `overviewSeamlessZoom.js` (252) | Whole-monitor zoom into the overview; touchpad swipe smoothing | *Merged (D3):* every patch (`Workspace.prototype._init`, `_computeWorkspacesBoxForState`, swipe `emit`, `gestureProgress/End`) goes through `CleanupRegistry.inject`, privates are guarded and the timeline is stopped on dispose. Originally a **direct** `Workspace.prototype._init` replacement; *merged:* its box math starts from the layout's own `_workAreaBox`, which `PanelVisibility` insets while the bar auto-hides; `Object.defineProperty(layout,'_workarea')` (`:71-89`); `controls.layout_manager._computeWorkspacesBoxForState` (`:129-141`); `Main.overview._swipeTracker._touchpadGesture.emit` (`:153-159`); `controls.gestureProgress/gestureEnd` own-property overrides (`:180-206`); custom `WorkspaceBackground` subclass | overview-seamless-zoom | not re-graded after D3 (was B) |
| `focusOnOverviewExit.js` (100) | Focus the window under the pointer on overview exit | `ControlsManager.prototype.prepareToLeaveOverview` (InjectionManager); stage `captured-event` | focus-on-overview-exit | A |
| `skipOverviewOnLogin.js` (56) | No overview at login | *Merged (D3):* injects `Main.overview.show` only on the first startup, releases the injection and the `startup-complete` signal together, and no longer resets `firstLogin` on disable; `layoutManager._startingUp` | skip-overview-on-login | not re-graded after D3 (was B) |
| `hideMinimizedWindows.js` (36) | Minimized windows hidden from overview and alt-tab | InjectionManager on `Workspace._isOverviewWindow`, `WindowCyclerPopup/GroupCyclerPopup._getWindows`, `WindowSwitcherPopup._getWindowList` | hide-minimized-windows (or minimize-to-dock) | A |
| `moveFullscreenWindow.js` (1112) | Fullscreen windows get their own workspace to the right; return on exit | `workspace_manager append/remove_workspace`, `notify::n-workspaces`, `workspace-switched`; **`St.Settings.get().slow_down_factor = 3`** for 700ms (*merged, D10:* restored only if nobody changed it meanwhile); `Main.wm._workspaceAnimation.movingWindow` (*merged, D10:* guarded; `is_maximized()` preferred). Paused through `conflictsWith` while Stage Manager runs; expandos `_kiwi_isolated`, `_kiwi_fullscreenWorkspaceIndex`, `_kiwi_originalWorkspaceIndex`; ~8 timeout/idle maps | move-window-to-new-workspace | A- |
| `reduceWindowAnimations.js` (118) | macOS-style map/destroy fade | *Merged (D3):* `Main.wm._shouldAnimateActor` through `CleanupRegistry.inject`, privates guarded; pending one-shot `actor.ease` swaps are tracked and cleared on disable; reads `Main.wm._mapping/_destroying` | reduce-window-animations | A |
| `transparentMove.js` (190) | Opacity 230 while moving or resizing | `grab-op-begin/end`; walks actors for `MetaSurfaceActor` by constructor name; *merged (D4):* saved opacity is a `WeakMap` keyed by `Meta.Window` (was pid), camelCase names, grab-end does nothing if no opacity was saved | transparent-move | A |
| `focusLaunchedWindow.js` (36) | Activate windows that demand attention | `global.display window-demands-attention` | focus-new-windows | A |

### 5.3 Dock (Dash-to-Dock) modules

| File (lines) | Purpose | Shell or D2D internals touched | Keys | Cleanup |
|---|---|---|---|---|
| `dockUtils.js` (340) | Shared D2D discovery, item building, separators, press darkening, schema lookup | `dockContainer._slider`, `dash._box`, `_boxContainer`, `_isHorizontal`, `_position`, `_hookUpLabel`, `iconSize`, `child._delegate.app/icon` (`:68-304`); `ExtensionState.ACTIVE` | — | n/a |
| `dockBlur.js` (12) | Empty since UX round 1 (no blur layer in the dock; the pill is Dash to Dock's own rounded background). Id kept; runs when `Glass.wants('dock')` | `Meta.BackgroundGroup` at dashBox index 0; repaint signals on `restacked`, wm map/destroy/…, `_backgroundGroup`; *merged (D5):* dock discovery uses `dockUtils.watchDocks` (the duplicate discovery code is gone); the 200 ms × 25 allocation retry is `dockRetry.boundedRetry` | dock-blur | A |
| `dockStyling.js` (125) | `.kiwi-dock-styled`, press darkening, tooltip scheme classes | uiGroup `child-added`, `dash._box child-added`, `St.Settings notify::color-scheme`; `button._kiwiPressId` expando | dock-styling | A |
| `dockColors.js` (468) | Indicator and separator colours follow the content behind the dock | `Shell.Screenshot.screenshot_area` (`:212`); **writes D2D GSettings**; *merged (D5):* the originals are saved in the Kiwi key `dock-colors-saved` and restored in `disable()`, and `restoreStaleColors` repairs a crash leftover on the next enable (only while the key still holds a Kiwi colour). A crash followed by turning the feature off before the next login still leaves Kiwi colours | dock-adaptive-colors | B- |
| `minimizedToDock.js` (867) | Minimized-window thumbnails in a strip before the trash; adopts the D2D trash item | `paint_to_content` snapshots (`:76`); `win.set_icon_geometry` on **every** eligible window (`:641-664`); `notify::minimized` on all windows; moves `dash._separator`, reads `_dragPlaceholder` (`:472-489`); re-parents the trash item (`:535-551`); `Clutter.ShaderEffect` vs `new_with_snippet` (51) branch. *Merged (S9):* skips windows with `WindowState.skipsDock` (staged) and sets or clears the `parkedInDock` flag; paused through `conflictsWith` while Stage Manager runs | minimize-to-dock | B (snapshot map deliberately survives disable) |
| `downloadsStack.js` (1134) | Downloads folder stack and fan | `Gio.FileMonitor` on Downloads; `Main.layoutManager.addTopChrome(overlay)` + **`Main.pushModal`** (`:421,:504`); D2D `container._updateDashVisibility/_ignoreHover/_box.sync_hover`, `dash.requiresVisibility` (`:539-555`); joins the `kiwi-minimized-strip` | downloads-in-dock, downloads-behind-folder | A |
| `launchpadApp.js` (278) | Launchpad favourite that toggles Show Apps | Writes `~/.local/share/applications/org.gnome.Shell.Extensions.Kiwi.Launchpad.desktop`; **`Shell.AppSystem.prototype.lookup_app` override** (*merged, D5:* through `CleanupRegistry.inject`); overrides `appIcon.activate/popupMenu` (`:66-69`); `favorite-apps` writes | enable-launchpad-app, launchpad-app-custom-icon | A- (rewrites files and favourites on every lock) |

### 5.4 Theming modules

| File (lines) | Purpose | Writes | Cleanup |
|---|---|---|---|
| `gtkThemeManager.js` (227) | Managed `@import` block in `~/.config/gtk-{3,4}.0/gtk.css`. *Merged:* titlebar-removal sheet chosen by `titlebarHideSheet()`; file jobs share one queue (`createJobQueue`) | Creates the directories, prepends the block, deletes the file if only Kiwi content is left (`:90-137`) | A- (async removal on disable is not awaited; overlaps the next enable) |
| `mozillaThemeManager.js` (500) + `firefoxThemeManager.js` (26), `thunderbirdThemeManager.js` (26) | Firefox and Thunderbird `chrome/userChrome.css` imports | Moves the user's `chrome/` to `chrome.bak`, writes `chrome/` plus a `.kiwi-managed` marker, appends `toolkit.legacyUserProfileCustomizations.stylesheets` to `user.js`, deletes `chrome/` and restores `.bak` on disable. *Merged (Wave 0 and D1):* marker written first, only Kiwi-owned `chrome/` is deleted, the Kiwi-tagged `user.js` line is removed on disable (file deleted if only ours), symlinks and foreign files respected, empty buffers never written, all IO async through a job queue, delete failures logged; `tests/mozillaThemeManager.test.js` | was **C**; not re-graded since D1 (no Shell run) |
| `blurPaintSignal.js` (39), now `lib/blurPaintSignal.js` | Clutter.Effect that emits `update-blur` on paint (blur-my-shell hack for GNOME Shell #2857) | — | n/a |

---

## 6. Shared helpers and cross-module dependencies

### 6.1 Import graph (`from './…'`)

```
extension.js ──► every module, plus dockUtils {dockActive,isDockExtension,resetDockSettings}
                 and windowTiling {enableDragRestore,disableDragRestore}

windowControls ─┐
windowTitle ────┴─► windowTiling        (isMaximized, maximize/unmaximize, tile grid)
dockBlur, dockColors, dockStyling, downloadsStack, launchpadApp, minimizedToDock ─► dockUtils
quickSettingsNotifications ─► quickSettingsDnDRemoval
panelMedia ─► mediaPlayback (MediaItem, Source)
firefoxThemeManager, thunderbirdThemeManager ─► mozillaThemeManager
```

*Merged, untested on Shell.* Current graph:

```
extension.js ──► features.js, lib/featureRegistry, lib/disposables, lib/glass, dockUtils
features.js ──► every apps/ module, apps/windowControls.js, apps/liquidGlass/index.js,
                coordinators/panelVisibility, lib/glass
apps/windowControls.js ──► lib/{disposables,settings,compat}, coordinators/panelLayout,
                           windowTiling, windowControls/{model,icons}
apps/gtkThemeManager.js ──► lib/{disposables,settings}, windowControls/model
apps/panelTransparency.js ──► lib/{disposables,glass}, coordinators/panelVisibility
apps/dockBlur.js, apps/overviewWallpaper.js, apps/liquidGlass/index.js ──► lib/glass
lib/glass.js ──► lib/{disposables,settings,compat,glassParams}
coordinators/panelVisibility.js ──► lib/{settings,compat}, panelVisibilityModel
apps/clipboard/index.js ──► lib/{disposables,settings,compat,keybindings}, coordinators/panelLayout, clipboard/{model,store,popover,quickPaste}
apps/clipboard/quickPaste.js ──► lib/modalSurface
apps/spotlight/index.js ──► lib/{keybindings,modalSurface,glass}, coordinators/panelVisibility, spotlight/{model,view,overlayKey,providers/*}
apps/spotlight/providers/clipboard.js ──► clipboard/index.js (clipboardService)
apps/controlCenter/index.js ──► lib/{disposables,settings,glass}, controlCenter/*, quickSettingsDnDRemoval, quickSettingsNotifications; nowPlaying ──► coordinators/mprisWatcher
apps/stageManager/index.js ──► coordinators/windowState, lib/{glass,settings}, stageManager/*
apps/stageManager/shortcut.js ──► lib/keybindings
apps/minimizedToDock.js, apps/windowControls.js ──► coordinators/windowState
apps/windowControls.js, windowTitle.js, focusOnOverviewExit.js ──► apps/util/windows.js
apps/downloadsStack.js ──► lib/modalSurface (registerForeign)
apps/notch/index.js ──► coordinators/{notificationRouter,mprisWatcher,panelLayout,panelVisibility}, notch/{stateMachine,view}
apps/calendar.js, apps/quickSettingsNotifications.js ──► coordinators/notificationRouter; apps/panelMedia.js ──► coordinators/mprisWatcher, mediaPlayback (MediaItem)
apps/dockBlur.js ──► dockUtils.watchDocks ──► dockRetry; apps/dockColors.js ──► dockColorsModel
```

### 6.2 Implicit couplings (no import, but behaviour depends on another module)

| Coupling | Evidence |
|---|---|
| ~~windowControls needs to be the last child of `_rightBox`~~ *Merged:* `PanelLayout` re-sorts the claim in one idle when the calendar re-adds the date menu, so the destroy-and-recreate hack in the old dispatcher is gone | coordinators/panelLayout.js |
| windowControls on the left is anchored `before` the `window-title` role through `PanelLayout` | apps/windowControls.js (claim), coordinators/panelLayout.js |
| downloadsStack joins minimizedToDock's `kiwi-minimized-strip` by actor name | downloadsStack.js:864-878 |
| downloadsStack reads dockStyling's `.kiwi-dock-styled` class to decide press darkening | downloadsStack.js:830-832 |
| minimize-to-dock forces hideMinimizedWindows | features.js (`hide-minimized-windows` `when`) |
| panelTransparency's `.kiwi-panel-dark-text` / `-light-text` restyle keyboardIndicator's label | stylesheet.css:749-768 |
| calendar's dot placement depends on `keep-notification-panel` and on dateMenu's index in `_rightBox` | calendar.js:53-56, 81-85 |
| quickSettingsNotifications and the custom DnD only exist when calendar is moved and the panel is not kept | features.js (`when` of both entries) |
| ~~panelHover counts any open status menu~~ *Merged:* `PanelVisibility` tracks every panel menu (`Main.panel.menuManager` `addMenu` is injected) and holds the bar while one is open; other features use `PanelVisibility.hold(cleanup, name)` | coordinators/panelVisibility.js |
| panelTransparency reads `PanelVisibility.autoHiding()` and re-checks on its changes. overviewSeamlessZoom relies on the layout work-area box that PanelVisibility insets | apps/panelTransparency.js:483,770; apps/overviewSeamlessZoom.js:136 |
| Stage Manager hides windows with opacity 0 (never minimizes). `minimizedToDock`, `windowControls` (minimize button) and the Control Center tile react through `WindowState` flags and `setStageActive`; `moveFullscreenWindow`, `windowTiling` drag-restore and `minimizedToDock` pause by `conflictsWith` in `features.js` | coordinators/windowState.js; features.js |
| The Control Center owns Do Not Disturb and the user row; `quickSettingsNotifications`, `quickSettingsDnDRemoval` and `addUsernameToQuickMenu` step aside when `control-center` is on | features.js; apps/controlCenter/index.js |
| Spotlight reads clipboard history through `clipboardService()` (lazily) and takes the Super tap from the Shell's `overlay-key` handler, so it also affects the stock overview shortcut while it runs | apps/spotlight/providers/clipboard.js; apps/spotlight/overlayKey.js |
| Quick Paste, Spotlight and the Downloads fan share one `ModalSurface` arbiter, so opening one closes the others | lib/modalSurface.js |
| blur: panelTransparency, dockBlur, overviewWallpaper and liquidGlass all share `lib/glass.js`; `Glass.wants()` decides between the legacy `panel-blur`/`dock-blur` keys and Liquid Glass | lib/glass.js |
| panelMedia's redraw callback exists for Blur My Shell's dynamic popup blur | panelMedia.js:139-144 |

### 6.3 Global and expando state

* Module-level `let` singletons in the legacy modules. Merged features use classes with a `CleanupRegistry` (`WindowControlsFeature`, `LiquidGlass`, `PanelVisibilityFeature`). Module singletons that other code imports: `Glass` (lib/glass.js), `PanelLayout`, `PanelVisibility`.
* Expandos on Shell or Mutter objects: `win._kiwiRestore` (windowTiling), `win._kiwi_isolated` / `_kiwi_fullscreenWorkspaceIndex` / `_kiwi_originalWorkspaceIndex` (moveFullscreenWindow), `actor._kiwiEasePatched` (reduceWindowAnimations), `label._kiwiOriginalText` (keyboardIndicator), `button._kiwiPressId` (dockStyling), `button._currentSystemIcon` (old windowControls, gone with the rewrite), `_ghostMenu._ghostAnchor` (old panelHover, gone).
* `Gio._promisify` is called at module load in `launchpadApp.js:12-16` and `mediaPlayback.js:27-28`, and in `gtkThemeManager.enable()` (`:179`).

---

## 7. Panel and Quick Settings occupancy map

```
Main.panel
├─ _leftBox:   [activities (maybe hidden)] … [window-controls if placed left: PanelLayout, before window-title] [window-title (-1)]
├─ _centerBox: [dateMenu]  ← removed by calendar.js when move-calendar-right=true (default)
└─ _rightBox:  [lock-indicator @0] [kiwi-media @1] … [keyboard] [quickSettings]
               [dateMenu (moved here)] [notification dot if keep-notification-panel] [window-controls if placed right: PanelLayout, last]

quickSettings._indicators (panel side): [username @0] … stock indicators … [battery % label] [DnD moon] [notification dot]
quickSettings.menu._grid: stock toggles (built-in DnD toggle removed on 49+) … [NotificationWidget (col-span 2)]
quickSettings._system._systemItem.child: … [Kiwi DnD button] [LockItem] …
quickSettings.menu.actor style: "max-height: 90% of monitor"
Main.messageTray._bannerBin: x_expand, x_align END, y_align START (top-right banners)
Main.layoutManager.panelBox: [glass layer from Glass.attach, when the panel surface is on] [panel]; visibility, strut and translation_y driven by PanelVisibility (merged)
Main.layoutManager.uiGroup/chrome (merged, untested on Shell): [Stage Manager strip (chrome, pill-sized input region)] [ModalSurface frame while Quick Paste or Spotlight is open (POPUP-mode modal)]
Main.panel._rightBox also gets the clipboard history button (claim 'clipboard-history' via PanelLayout, before quickSettings)
Quick Settings grid (Control Center on): 4 columns, groups connectivity / focus / display / sound / media / toggles / background / more / notifications, footer last; user row at index 0 of the system item
Main.layoutManager.overviewGroup: [kiwi-overview-blur-group @0] …
Main.uiGroup: [kiwi-downloads-fan (top chrome, modal)]   (the old panel-hover chrome and ghost menu are gone; PanelVisibility adds edge pressure-barrier segments instead)
```

---

## 8. CSS and theming pipeline

### 8.1 GTK (`gtkThemeManager.js`)

1. `_stylesheetsFor(version)` (`:38-79`) picks files in this order:
   * `titlebuttons{,-alt}{3,4}.css`, plus `titlebuttons-glass{3,4}.css` for glass
   * `titlebuttons-size-small{3,4}.css` (+ glass small)
   * *Merged:* one of `hide-titlebar-always{3,4}.css` (scope all), `hide-titlebar{3,4}.css` (scope maximized) or `hide-titlebar-fullscreen{3,4}.css` (scope fullscreen), only when `show-window-controls && remove-titlebar-buttons` (`titlebarHideSheet()`)
   * *original rule, now replaced:* `hide-titlebar{,-fullscreen}{3,4}.css` when `show-window-controls`
   * `fixes{3,4}.css` when `popup-menu-styling`
2. `_buildManagedBlock()` wraps `@import url("file:///…/kiwi@kemma/css/<f>")` lines between `MARKER_BEGIN`/`MARKER_END` (`:12-13,:81-88`).
3. `processUserGtkFile()` (`:104-137`) loads `~/.config/gtk-N.0/gtk.css` asynchronously. It strips the old block (`MANAGED_BLOCK_REGEX`) and any legacy line containing `@import … kiwi@kemma` (`LEGACY_IMPORT_REGEX`, for versions ≤1.9.1), **prepends** the new block so user rules win, then writes it back with *sync* `replace_contents`. If only Kiwi content was in the file, the file is deleted.
4. The update re-runs when any of 6 keys changes (`:151`). On disable it is called with an empty block (`:139-146`). The returned promise is not awaited.
5. The imported CSS uses relative `url("../icons/titlebuttons/…png")` with `-gtk-scaled()` @2 variants, so it resolves inside the extension directory.

**What hides titlebar buttons today:** `hide-titlebar3.css` moves `headerbar > box.left/right` 200px off-screen at opacity 0 for `.maximized`/`.fullscreen`, and does the same for `.titlebar.default-decoration` (SSD fallback). `hide-titlebar4.css` targets `headerbar windowcontrols.start/.end`. Both are conditioned on `.maximized`/`.fullscreen` window classes. *Merged:* the unconditional `hide-titlebar-always{3,4}.css` variants now exist and are the default (scope `all`). Firefox and Thunderbird use `*Hidden.css` keyed on `:root[sizemode="maximized"]` only.

**Titlebar removal (UX round 1):** with scope `all`, `apps/windowControls/buttonLayout.js` (`ButtonLayoutOwner`) saves the WM `button-layout` in `saved-button-layout`, writes it without close/minimize/maximize and restores it exactly on toggle-off/disable; `extension.js` calls `restoreStaleButtonLayout()` once at start (crash recovery). The hide-titlebar CSS is used only for scopes maximized/fullscreen. Apps that hard-code their own layout keep their buttons. Flatpak GTK apps only see the CSS when the `flatpak override` lines in the README are applied.

**What is restored on disable:** the GTK managed block is removed. Mozilla `chrome/` is deleted and `chrome.bak` moved back, but `user.js` is left modified. D2D colour keys and `favorite-apps` are restored by their modules. Nothing restores files if the shell crashes. The `.gitignore` notes that the old generated `css/gtk3.css`/`gtk4.css` files are no longer written (issue #86).

### 8.2 Mozilla (`mozillaThemeManager.js`)

The profile is resolved from `installs.ini`, then `profiles.ini`, in `~/.mozilla/firefox` then `$XDG_CONFIG_HOME/mozilla/firefox` (`:185-245`). Imports are `${prefix}.css`, `.alt.css` or `.glass.css`, plus `-size-small.css` and `Hidden.css` (`:90-112`).

### 8.3 `stylesheet.css` sections (Shell/St)

| Lines | Section | Gate |
|---|---|---|
| 10-16 | Window title icon (`-st-icon-style: symbolic`) | `.kiwi-window-title-icon` (D6 folded the stock `.app-menu-icon` padding into it) |
| 19-185 | Top panel: spacing, icon size, arrows removed, dateMenu padding, dark/light text flips, `:overview` transparency | `#panel.kiwi-panel-styled`, `.kiwi-panel-dark-text/-light-text`, `.kiwi-panel-fullscreen`, `.kiwi-panel-no-transition`, `.kiwi-panel-color-inherit`. Includes legacy `Gjs_AggregateMenu` selectors (`:84-85`) |
| 188-247 | Panel window controls | Kiwi classes; GType selector `Gjs_apps_windowControls_WindowControlsIndicator` (`:213-219`) |
| 250-330 | Tiling grid in the title menu | Kiwi classes |
| 333-363 | Popup menu accent (with `!important` over Blur My Shell); **ungated** `.maximized .window-content` (`:360`) | `.kiwi-popup-styled` |
| 366-378 | Notification badge, DnD indicator | Kiwi classes |
| 381-542 | Dash-to-Dock spacing, adaptive colours, pill glow, tooltips | `#dashtodockContainer.kiwi-dock-*` |
| 545-723 | QS notifications, media cards, **ungated** `.message-title`, `.message-group-title`, `.message .message-*-button`, `.message-list-clear-button` (`:656-692`) | mixed |
| 726-768 | Keyboard indicator | `.kiwi-input-themed/-en` |
| 770-899 | Minimized strip, Downloads stack and fan | Kiwi ids and classes |
| 911-966 | *Merged:* `/* feature: liquid-glass */` glass layers, rim, highlight, `kiwi-glass-panel` | `.kiwi-glass-*` classes |
| 967-972 | *Merged:* `/* feature: autohide */` revealed-bar shadow (source `apps/autohide/style.css`) | `#panel.kiwi-panel-autohide` |
| 973-1107 | *Merged:* `/* feature: control-center */` tiles, user row, Now Playing | `.kiwi-cc-*` |
| 1108-1135 | *Merged:* `/* feature: stage-manager */` strip cards and badge | `.kiwi-stage-*` |
| 1136-1367 | *Merged:* `/* feature: clipboard */` popover and Quick Paste | `.kiwi-clip-*`, `.kiwi-qp-*` |
| 1368-1481 | *Merged:* `/* feature: spotlight */` | `.kiwi-spotlight-*` |
| 1482-1649 | *Merged:* `/* feature: notch */` | `.kiwi-notch-*` |
| (all of 10-899) | D6 gated stock-class rules (message titles, close and clear buttons, window-content, app-menu-icon, window-controls GType selector) behind Kiwi classes, so these line ranges shifted by a few lines | |

---

## 9. `advanced/` native module

* `titlebuttons_hover.c` (185 lines) is a GTK3 module loaded through `GTK_MODULES`. It adds `.titlebuttons-hover` / `.titlebuttons-hover-alt` to the headerbar while any titlebutton is hovered, so all three buttons light up together (used by `titlebuttons-alt3.css:179+`).
* Wiring happens through an initial idle scan and then a **`g_timeout_add(800ms)` periodic scan of every toplevel, forever, in every GTK3 process** (`:180-185`). `on_widget_realize` (`:151-160`) is dead code that is never hooked up.
* `install-extra.sh` copies the **committed prebuilt `libtitlebuttons_hover.so`** (tracked in git) to `~/.config/environment.d/`. It writes `GTK_MODULES=<path>` in `10-gtk3-titlebuttons.conf` (`:59-63`), which overrides any existing `GTK_MODULES`. `compile-extra.sh` builds it from source with gcc and pkg-config. `uninstall-extra.sh` removes both files. `relink.sh` and `convert-svg.sh` are asset helpers.
* The module is not shipped in the EGO zip, because `pack` only includes `icons`, `apps` and `css` as extra sources. The prefs Advanced page links to it (`prefs.js:999-1033`).

---

## 10. i18n, build, packaging, CI

* **i18n:** `metadata.json` declares `gettext-domain: kiwi@kemma`. Shell modules receive `this.gettext` from `extension.js` (`:58`); prefs uses `gettext as _` from the prefs module. `translating/kiwi.pot` (regenerated for the merged features) and 17 `po/*.po` files exist (plus `po/POTFILES`; `make pot` regenerates a template into `po/`). `translating/compile-translations.sh` only validates and compiles `.mo` files into an ignored `locale/` folder. The plural string `'%d More in Files'` in `downloadsStack.js` uses `ngettext` since D9.
* **Schemas:** XML only. `*.compiled` is git-ignored (`.gitignore`), and commit `9ec6053` removed the compiled file. `gnome-extensions pack` compiles or includes schemas.
* **Build/packaging:** *Merged (D7):* `Makefile` targets `pack` (zip in `dist/`, with `--extra-source` for `icons apps css` and `lib coordinators features.js` when they exist), `pot` (`xgettext` from `po/POTFILES` into `po/kiwi@kemma.pot`), `install`, `uninstall`, `test`, `lint`, `schema-check` (`glib-compile-schemas --strict`), `check` (lint, schema-check, test), `clean`. Release packing in `pack-release.yml` builds the extra-source list from folders that exist.
* **CI:** *Merged (D7):* `.github/workflows/ci.yml` runs on pull requests, pushes to `main` and manually: eslint 9, strict schema compile, `make test`, `make pack`, then uploads the zip as an artifact. `pack-release.yml` runs on `release: published` or manually and uploads with `gh release upload` (the archived `upload-release-asset` action is gone). Not covered by CI: anything that needs a real Shell (the swarm has not run any feature on Shell; an X1 smoke harness is in progress and not described here). New source folders must be added to `--extra-source` (CLAUDE.md rule); `apps/` already covers the feature folders under it.
* **Docs drift:** the README badge was fixed to 48 to 51 (D7). `metadata.json`'s description was updated after pass 1 (read it there; not re-listed here). Shell 46 and 47 were dropped in `e7b10f1` (2026-10-01).
