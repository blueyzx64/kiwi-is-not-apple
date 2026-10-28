# Kiwi — Tech Debt and Conflicts with Planned Features

> **Summary (read this and you can stop):**
> 1. Every new feature lands on Shell surfaces that existing modules already patch by hand: the panel boxes, `quickSettings._indicators/_grid`, `messageTray._bannerBin`, `panelBox` visibility and struts, `Main.wm` animations, and `notify::minimized`. Nothing arbitrates those surfaces. Ownership is implicit and depends on ordering hacks in `extension.js:121-127`.
> 2. The biggest structural blocker is the dispatcher. Every settings change re-runs every module (`extension.js:57-277`), modules are module-level singletons with differing signatures, and the extension is fully torn down on each screen lock because no `session-modes` is declared. Adding 8 more features to that loop multiplies churn and order bugs.
> 3. Before Liquid Glass, Control Center, Notch and Auto-hide, Kiwi needs four shared services: a **PanelLayout** owner for box slots, one **BlurService** (there are three copy-pasted blur stacks today), one **MPRIS/Notification source**, and a **WindowState registry** so Stage Manager is not mistaken for minimize, fullscreen or tiling.
> 4. The highest-risk existing debt: (a) the Firefox/Thunderbird manager can delete a user's own `chrome/` directory, and it runs on default settings even when Firefox styling is off. (b) `~/.config/gtk-*` files are written and removed on every lock. (c) Polling timers run in 5 modules (plus the native GTK3 module). (d) Lifecycle bugs: dead or stale signals, unbounded retries, async callbacks after destroy.
> 5. Two premises in the brief need correcting. `Shell.BlurEffect` already uses `radius`, the correct name since GNOME 46 (`sigma` is the legacy name), and no `add_actor`/`get_maximized` calls remain. The real version-sensitive spots are listed in §2.3.

> **v3 status (phase 0, 2026-10-27).** The tables below describe the 2.x code at `c2f3d0f`
> with their 2.x paths (`apps/`, `coordinators/`). In v3:
> - **Closed by removal** (the module is gone, overhaul plan §3): every row about
>   `panelTransparency`, `panelHover`, `dockBlur`, `dockColors`, `dockUtils`, `minimizedToDock`,
>   `downloadsStack`, `launchpadApp`, `mozillaThemeManager` (and its `chrome/` data-loss rows),
>   `windowTitle`, `windowTiling` drag-restore, `overviewSeamlessZoom`, `overviewWallpaper`,
>   `skipOverviewOnLogin`, `focusOnOverviewExit`, `reduceWindowAnimations`, `transparentMove`,
>   `batteryPercentage`, `lockIcon`, `keyboardIndicator`, `mediaPlayback`, the `advanced/`
>   module (polling, `GTK_MODULES`, prebuilt binary) and the alternative/glass CSS sets. What
>   they wrote into user files is removed once by `lib/cleanup/` (Kiwi-marked content only).
> - **Fixed in phase 0:** the 2.x dispatcher modes (`reapply`, `startOnly`) are gone, every
>   feature is a lazily loaded class; the calendar's 500 ms startup delay and Quick Settings'
>   100 ms delay are replaced by placement on `child-added` and one bounded
>   `whenQuickSettingsReady()`; the hard-coded `lookup('kiwi@kemma')` in the Quick Settings
>   notifications is gone (`ctx.extension`); the Quick Settings `max-height` is composed, not
>   replaced; the Do Not Disturb hand-off between the Control Center and the legacy button is a
>   registry conflict instead of a module flag; the GType CSS selector of the window controls is
>   gone; the GTK theme manager uses the shared async file helpers and the one user-file queue;
>   duplicated helpers (prefs rows and shortcut entries, Quick Settings readiness, job queues,
>   window predicates) exist once; the GNOME `button-layout` original is kept by the generic
>   crash-safe `core/originals.js`; rounded corners no longer re-evaluate every window on each
>   frame of a drag (`position-changed` dropped); the notch spring sets the actor directly
>   instead of allocating per frame.
> - **Still open (phase 1+):** `features/fullscreenSpace` (2.x `moveFullscreenWindow`) still
>   raises the global `St.Settings.slow_down_factor` and reads `Main.wm._workspaceAnimation`
>   (kept as is by decision; reworked with Mission Control in phase 3); the clipboard's one sync
>   `GLib.mkdir_with_parents` in enable (allowed by decision); `gtkTheme.js`'s
>   `LEGACY_IMPORT_REGEX` should narrow after a release; `session-modes` is still undecided
>   (R7); the window-state flags `tiled`, `parkedInDock` and `isolatedFullscreen` are reserved
>   for the tiling engine, the dock and Split View.

## Table of contents

1. [Conflicts with planned features](#1-conflicts-with-planned-features)
   1. [Window controls for every window, and titlebar button removal](#11-window-controls-in-the-top-bar-for-every-focused-window-and-removal-of-titlebar-buttons)
   2. [Liquid Glass](#12-liquid-glass-blurtranslucency)
   3. [Clipboard history](#13-clipboard-history)
   4. [Spotlight](#14-spotlight)
   5. [Notification notch / dynamic island](#15-notification-notch--dynamic-island)
   6. [Stage Manager](#16-stage-manager)
   7. [Redesigned Control Center](#17-redesigned-control-center-macos-style-quick-settings-grid)
   8. [Auto-hide top bar](#18-auto-hide-top-bar)
   9. [Cross-cutting recommendations](#19-cross-cutting-recommendations)
2. [Legacy patches and tech debt](#2-legacy-patches-and-tech-debt)
   1. [Lifecycle and architecture](#21-lifecycle-and-architecture)
   2. [Private Shell API monkey-patches](#22-private-shell-api-monkey-patches)
   3. [Version-specific code and deprecated APIs](#23-version-specific-code-and-deprecated-apis)
   4. [Polling and timeouts](#24-polling-and-timeouts)
   5. [Missing cleanup, leaks and races](#25-missing-cleanup-leaks-and-races)
   6. [Writing outside the extension (user files and settings)](#26-writing-outside-the-extension-user-files-and-settings)
   7. [Duplicated code, giant files, naming, magic numbers](#27-duplicated-code-giant-files-naming-magic-numbers)
   8. [Error swallowing](#28-error-swallowing)
   9. [CSS debt](#29-css-debt)
   10. [EGO review risk](#210-ego-review-risk)
   11. [Build, CI, docs](#211-build-ci-docs)
3. [Verification notes](#3-verification-notes)

Severity: **High** means it will break or block a planned feature, or risks user data or stability. **Med** means it causes visible bugs or review rejection. **Low** is hygiene. Line numbers are from commit `c2f3d0f`. ✔ means the claim was checked against the code. ⚠ means it is plausible but unverified at runtime or against upstream sources (see §3).

---

## 1. Conflicts with planned features

### 1.1 Window controls in the top bar for every focused window, and removal of titlebar buttons

| Collides with | Nature | Sev |
|---|---|---|
| `appButtons.js:357-360` `_updateVisibility()` | Visibility is hard-gated to `maximized \|\| isFullscreen`, or fullscreen only. "Every focused window" means a new mode key. The `show-window-controls-fullscreen-only` boolean should become an enum (`never/fullscreen/maximized/always`). ✔ | High |
| `appButtons.js:42-55, 177-208` and WM `button-layout` | Side and order come from `org.gnome.desktop.wm.preferences button-layout`. If titlebar removal is done by writing `button-layout=':'` (or `appmenu:`), the parser falls back to the default right side with `minimize,maximize,close` (`:196-198`), losing the user's side and order. It would also fight appButtons' own `changed::button-layout` handler, which moves the indicator between boxes (`_replaceIndicatorOnPanel` `:536-552`). ✔ | High |
| `gtkThemeManager.js:66-72` + `css/hide-titlebar{3,4}.css`, `hide-titlebar-fullscreen*.css` | The CSS only hides buttons under `.maximized`/`.fullscreen`. Always-on removal needs new unconditional variants added to `_stylesheetsFor`. The current trick moves boxes 200px off-screen at `opacity:0` (`hide-titlebar3.css:15-30`). Whether hidden buttons still take clicks or keyboard focus is ⚠. Non-GTK clients (Qt, Electron with CSD, SSD-only apps) are not covered (README "Known Issues"). | High |
| `mozillaThemeManager.js:109-112`, `css/*WindowControlsHidden.css` | Firefox and Thunderbird hide buttons only on `:root[sizemode="maximized"]`, and ignore `show-window-controls-fullscreen-only`. An "always" mode needs new Mozilla CSS. Because of `extension.js:227,233`, this manager already runs whenever `show-window-controls` is on. ✔ | Med |
| `extension.js:121-127, 142-146`; `appButtons.js:559-568` | Position depends on enable order: rightmost after calendar's moved `dateMenu`, or left at `len-1` on the assumption that windowTitle is last. A notch or Control Center adding right-box items will break "rightmost" again. ✔ | Med |
| `appButtons.js:333-355` vs `windowTitle.js:222-237` | Duplicated "ignore `com.*`/`gjs*`/`@!0,0` titles" heuristics. With always-visible controls, a wrong hide is much more visible. Move this into one `isUserWindow(win)` helper. ✔ | Med |
| `appButtons.js:273-316, 437-501` | Every hover, press or state change creates a new `St.Icon` and probes up to 6 files with sync `query_exists`. Acceptable for maximized-only use, wasteful when the controls are visible all the time. Cache the `Gio.FileIcon`s per state. ✔ | Med |
| `appButtons.js:375-387, 407-424` | 3s close-button delay and minimize disabled in fullscreen. Keep this behaviour fullscreen-only in the new mode. ✔ | Low |
| `windowTitle.js` AppMenu | Title and controls both follow `notify::focus-window` with separate code. The window-title menu already offers Fullscreen/Restore, which overlaps the controls. | Low |

**Recommended resolution:** introduce a `TitlebarPolicy` service that owns these keys: `panel-controls-mode` (enum), `hide-titlebar-buttons` (enum: never/maximized/always) and a stored `original-button-layout`. `gtkThemeManager`, `mozillaThemeManager` and `appButtons` should all read from it. Keep the CSS approach rather than rewriting `button-layout`. If `button-layout` must be changed, save the original in a Kiwi key, make appButtons parse the saved value, and restore it on disable. Give the indicator an explicit slot through a PanelLayout helper (§1.9) instead of indices.

### 1.2 Liquid Glass (blur/translucency)

| Collides with | Nature | Sev |
|---|---|---|
| `panelTransparency.js:71-233` | Panel blur is its own `Meta.BackgroundGroup` + `St.Widget` + `Shell.BlurEffect({mode:BACKGROUND, radius:30})` at `panelBox` index 0, with its own repaint signals (`:134-169`). Glass over the panel would **double-blur**, or need to replace this. ✔ | High |
| `dockBlur.js:84-223` | Second copy of the same stack per dash, with copy-pasted repaint signals (`:33-68`) and its own dock discovery (`:281-304`). ✔ | High |
| `overviewWallpaper.js:67-109` | Third blur (ACTOR mode, radius 60) in `overviewGroup`. Spotlight or Stage Manager backdrops would add a fourth. ✔ | Med |
| `panelTransparency.js:511-525, 863-866` | The module owns `Main.panel.style` (inline `background-color … !important`) and re-applies it on every `notify::style`. A glass tint written as inline style or a class on the panel will be overwritten. Inline style beats CSS in St. ✔ | High |
| `panelTransparency.js:448-462`, `stylesheet.css:100-176` | Adaptive `.kiwi-panel-dark-text/-light-text` uses wallpaper luminance from a sync `GdkPixbuf` decode of the wallpaper file (`:250-279`). Glass needs the same adaptivity. `dockColors.js:199-227` solves the same problem a different way, with `Shell.Screenshot`. ✔ | Med |
| `stylesheet.css:341-357` (`.kiwi-popup-styled … !important`) and `prefs.js:1066` (recommends Blur My Shell) | Menus and QS have no Kiwi blur yet. BMS is explicitly recommended and already fought with `!important` (commit `35538f5`). Glass for menus, QS and notifications will overlap BMS. Detect BMS and back off, or document that the two are mutually exclusive. ✔ | Med |
| `dockColors.js:273,283` | Writes the D2D pill `background-color`. Glass on the dock needs the pill translucent, so the two fight over the same D2D key. ✔ | Med |
| `panelMedia.js:139-144`, `mediaPlayback.js:250,362` | Redraw hooks exist because a dynamic popup blur (BMS) needs full damage. Kiwi's own popup blur would need the same, with a coalesced `queue_repaint`. ✔ | Low |
| `blurPaintSignal.js:27-39` | Paint-signal hack (GNOME Shell #2857). Fine to reuse, but it should live in the service. ✔ | Low |

**Recommended resolution:** build one `BlurService` with `attach(actor, {mode, radius, brightness, tint, cornerRadius})`. It owns one set of global repaint signals and one coalesced repaint later. Port panelTransparency, dockBlur and overviewWallpaper to it first, then add glass for menus, QS, notifications and the notch. Replace inline-style ownership of the panel with a class plus a single `style` writer (the service) that composes the alpha and the tint. Merge the two luminance probes into one `BackdropSampler`.

### 1.3 Clipboard history

| Collides with | Nature | Sev |
|---|---|---|
| `metadata.json` (no `session-modes`) and the EGO lock-teardown expectation (commit `bbeac23` removed a lock-survival hack in `launchpadApp.disable`) | History held in memory is lost on every lock, because `disable()` must destroy it. Persisting it to disk raises privacy concerns (passwords, OTP codes). Decide explicitly: persist with an exclusion list and a max age, or declare `"session-modes": ["user","unlock-dialog"]` and justify it to EGO. ✔ | High |
| No keybinding infrastructure (`grep addKeybinding` finds nothing) | Super+Shift+V needs a new `as` schema key, `Main.wm.addKeybinding(…, Shell.ActionMode.NORMAL \| OVERVIEW, …)` and `removeKeybinding` on disable. GNOME's default `toggle-message-tray` is Super+V and Super+M (✔ gnome-shell 51.0 `org.gnome.shell.gschema.xml.in`). No upstream default uses Super+Shift+V (✔ gnome-shell, mutter 51.0, gsettings-desktop-schemas, g-s-d media-keys schemas; distro overrides not checked). **Done:** `lib/keybindings.js`; the clipboard now defaults to Super+V and takes it out of toggle-message-tray through core/originals (Super+M stays). | Med |
| Panel right box (§7 of code-map) | A new indicator competes with `lock-indicator@0`, `kiwi-media@1`, the moved `dateMenu`, the notification dot and window-controls-last. ✔ | Med |
| `downloadsStack.js:409-521` | This is the existing modal pattern: `addTopChrome` + `pushModal(POPUP)` + backdrop click and Esc. Reuse it, but only one Kiwi modal should be open at a time. Close the fan (`_closeFan`) when the clipboard or Spotlight opens. ✔ | Low |
| `panelHover.js:156-189` ghost menu | While the panel is revealed in fullscreen, a fake open `PopupMenu` sits in `Main.panel.menuManager`. A keybinding modal opened then may compete with that grab (⚠ runtime). | Med |

**Resolution:** add `apps/clipboardHistory.js` built on `Meta.Selection` `owner-changed` (`global.display.get_selection()`) plus `St.Clipboard.get_text`, with a size cap and mime filtering. Add a `KeybindingService` that registers and removes all Kiwi bindings in one place, and a `ModalService` that holds a single open Kiwi modal and closes the others.

### 1.4 Spotlight

| Collides with | Nature | Sev |
|---|---|---|
| GNOME default `org.gnome.desktop.wm.keybindings switch-input-source = ['<Super>space', 'XF86Keyboard']` (✔ gsettings-desktop-schemas `org.gnome.desktop.wm.keybindings.gschema.xml.in`; not in repo) and `keyboardIndicator.js:226-229` (`current-source-changed`) | Super+Space is already taken by input-source switching, which keyboardIndicator styles. Grabbing it breaks layout switching for multilingual users, and the default `keyboard-indicator=true` suggests such users exist. Make the binding configurable, or offer to move `switch-input-source`, never overwriting it silently. | High |
| Overview search (`Main.overview` / searchController); `skipOverviewOnLogin.js:13-21` replaces `Main.overview.show`; `focusOnOverviewExit.js` and `windowTitle.js:143-153` use stage `captured-event` while in the overview | If Spotlight reuses the shell's search providers through the overview, it runs into these patches. Prefer a standalone modal that instantiates `SearchResultsView` or queries providers directly (⚠ private API). | Med |
| `downloadsStack.js:504`, `panelHover.js` ghost menu | Modal stacking (see §1.3). | Med |
| Blur stack (§1.2) | The Spotlight backdrop should be the 4th BlurService client, not a 4th copy. | Med |
| `launchpadApp.js:220-224` overrides `Shell.AppSystem.prototype.lookup_app` | Spotlight's app search goes through `lookup_app` or `AppSystem` and will see the synthetic Launchpad app. It needs filtering. ✔ | Low |

### 1.5 Notification notch / dynamic island

| Collides with | Nature | Sev |
|---|---|---|
| `calendar.js:197-201` | Moves `dateMenu.container` out of `_centerBox` by default. The notch wants `_centerBox`. If `move-calendar-right=false`, the clock and the notch share the centre. Make the notch imply calendar-right, or place the clock beside the notch. ✔ | High |
| `calendar.js:220-228` | Re-aligns `Main.messageTray._bannerBin` to the top-right (`x_align END, y_align START, x_expand`). A notch that animates banners out of the centre must own `_bannerBin` (or replace banner presentation). Both modules would set the same properties, and calendar's disable restores values captured at *its* enable. ✔ | High |
| `quickSettingsNotifications.js:163-304` | Second notification surface (a `MessageView` in the QS grid) that closes QS on activation. The notch is a third. They must share one notification model and DnD state. ✔ | Med |
| `quickSettingsNotifications.js:49-61, 352-377`; `quickSettingsDnDRemoval.js:149-193` | DnD is driven by `org.gnome.desktop.notifications show-banners`. The `dateMenu._indicator` is force-hidden with notify handlers. The notch must respect `show-banners` and not re-show `dateMenu._indicator`. ✔ | Med |
| `calendar.js:51-98, 167-171, 276-287` | The notification dot polls every 5s and reads `messageTray._sources` / `_notificationQueue`. A notch would show the same state, so share a `NotificationState` signal instead of adding another poll. ✔ | Med |
| `panelMedia.js` + `mediaPlayback.js:1028-1135` | Kiwi's own MPRIS `Source` is created **per `MediaList`** (`panelMedia.js:26`). A media "live activity" in the notch would start a second D-Bus watcher and duplicate players. Make `Source` a refcounted singleton. ✔ | Med |
| `extension.js:106-119` | panelMedia and QS notifications exist only when `move-calendar-right && !keep-notification-panel`. The notch adds a third dependent, which this boolean matrix cannot express. ✔ | Med |
| OSD (`Main.osdWindowManager`) | No current Kiwi patch (grep finds none). The notch hosting volume or brightness OSD would be the first patch of `osdWindowManager.show`. Use InjectionManager. ✔ | Low |
| `panelHover.js:53-55` | Counts any `statusArea` menu as open. If the notch is a `PanelMenu.Button`, its expansion keeps the fullscreen panel up, which is probably what you want. ✔ | Low |

### 1.6 Stage Manager

| Collides with | Nature | Sev |
|---|---|---|
| `minimizedToDock.js:92-147, 641-664` | Hooks `notify::minimized` on every NORMAL window and owns `set_icon_geometry` for all of them. If Stage Manager uses minimize to hide inactive stages, every hidden window becomes a dock thumbnail, and minimize animations aim at the dock instead of the stage strip. ✔ | High |
| `hideMinimizedWindows.js:20-31`; `extension.js:178` | Minimized windows are filtered from the overview and alt-tab, and this is **forced on** whenever minimize-to-dock is active. Staged windows would vanish from alt-tab. ✔ | High |
| `moveFullscreenWindow.js:578-774, 851-874` | Moves fullscreen windows across workspaces, activates workspaces, changes the global `slow_down_factor` (`:107`) and pins `Main.wm._workspaceAnimation.movingWindow` (`:130`). Stage Manager's own window moves and animations will race with it. Define precedence: fullscreen isolation off while Stage Manager is on, or Stage Manager is per-workspace. ✔ | High |
| `reduceWindowAnimations.js:27-71` | Hijacks the *next* `actor.ease()` after `_shouldAnimateActor` for map and destroy. Stage Manager ease calls on window actors made in that window could be rewritten (⚠ only if Stage Manager calls `_shouldAnimateActor` paths). ✔ (mechanism) | Med |
| `windowTiling.js:115-193, 233-257` | `_kiwiRestore` stashes and `move_resize_frame`. The drag-restore `grab-op-begin` handler resizes on drag. Stage Manager geometry changes must clear or ignore the stash. ✔ | Med |
| `appButtons.js:119-122` | The minimize button calls `window.minimize()`. Under Stage Manager it should probably "unstage". | Med |
| `focusLaunchedWindow.js:8-10`; `focusOnOverviewExit.js:46-57` | Auto-activating windows changes the current stage unexpectedly. ✔ | Med |
| `panelTransparency.js:620-658`, `transparentMove.js` | Opaque-on-maximized and per-pid opacity both touch window actors and geometry. Low risk but worth testing. ✔ | Low |
| `overviewSeamlessZoom.js:66-96, 129-141` | Patches `Workspace` and workspace boxes. A Stage Manager strip drawn in the overview or as overlay chrome must coexist with that geometry. ✔ | Low |

**Resolution:** add a `WindowStateRegistry` (`staged`, `isolatedFullscreen`, `tiled`, `parkedInDock`) that every module consults. Stage Manager should hide windows with its own mechanism (actor visibility plus `Meta.Window` skip flags, or a workspace per stage) rather than `minimize()`. If it must minimize, it tags `win._kiwiStaged`, and minimizedToDock, hideMinimizedWindows and appButtons exclude tagged windows.

### 1.7 Redesigned Control Center (macOS-style Quick Settings grid)

| Collides with | Nature | Sev |
|---|---|---|
| `quickSettingsNotifications.js:276-286` | Adds `NotificationWidget` to `quickSettings.menu._grid` with `column-span 2` and sets `menu.actor` style to `max-height: 90%` (the saved and restored style string clobbers other inline style). A redesigned grid must decide whether notifications stay in it. ✔ | High |
| `quickSettingsDnDRemoval.js:104-124` | Finds the built-in DnD toggle in `_grid` heuristically (icon names, accessible name, constructor name containing "disturb", `:44-61`) and reparents it. A rebuilt grid invalidates its saved `{parent,index}`, so restore would reinsert into a dead or foreign parent. ✔ | High |
| `quickSettingsNotifications.js:44-47, 104-114` | Kiwi DnD button inserted into `quickSettings._system._systemItem.child` before `LockItem`, found by `constructor.name === 'LockItem'`. ✔ | Med |
| `addUsernameToQuickMenu.js:117`; `batteryPercentage.js:23`; `calendar.js:54-56`; `quickSettingsNotifications.js:356-373` | Four modules insert into `quickSettings._indicators`, which is the *panel* indicator row, at index 0 or at the end. The name "QuickMenu" is misleading. These remain panel concerns but need an ordered slot API. ✔ | Med |
| `extension.js:106-119` | The custom DnD only works when `move-calendar-right && !keep-notification-panel`, even though prefs presents it independently (`prefs.js:578-583`). The Control Center should own DnD outright. ✔ | Med |
| `lockIcon.js:122` | Separate PanelMenu at `_rightBox@0`, not in QS. Unaffected unless the redesign moves the status icons. ✔ | Low |
| `stylesheet.css:84-88, 341-357` | `Gjs_ui_panel_QuickSettings` icon margins; `.kiwi-popup-styled .popup-menu .popup-menu-item:hover` accent rules also hit QS menu items (QS is a popup-menu). ✔ | Low |
| `panelHover.js:53-55` | Keeps the fullscreen panel up while QS is open. Still holds if the new CC is a PanelMenu. ✔ | Low |

**Resolution:** decide between subclassing or replacing `QuickSettingsMenu` and adding Kiwi tiles via the public `QuickSettingsItem`/`SystemIndicator` API (`Main.panel.statusArea.quickSettings.addExternalIndicator`). Then migrate DnD, username and the notification list to be CC *tiles/providers* and delete `quickSettingsDnDRemoval`'s heuristics wherever possible.

### 1.8 Auto-hide top bar

> **Removed in UX round 1** (the top bar houses the notch). `PanelVisibility` and its feature are gone; the conflicts below no longer apply.

| Collides with | Nature | Sev |
|---|---|---|
| `panelHover.js` (whole file) | Already implements reveal-on-hover, **only in fullscreen**. It does this by flipping `layoutManager._trackedActors[].trackFullscreen` and calling private `_updateVisibility()` (`:193-218`), easing `panelBox.translation_y`, keeping a ghost menu to hold the panel for GTK4 (`:156-189`), polling the pointer every 1s (`:71-93`) and using a 1px actor sized to the primary monitor only once (`:220-233`). Two modules driving `panelBox.translation_y` and visibility will flicker. **Extend or replace panelHover rather than adding a second module.** ✔ | High |
| Struts (`Main.layoutManager.panelBox` tracked with `affectsStruts`) | macOS-style auto-hide implies no strut, so maximized windows take full height. Toggling struts re-layouts every maximized window. That breaks `panelTransparency.js:634-647` (opaque when maximized, based on `maximized_*` flags) and changes `windowTiling.js:128-137` (`get_work_area_current_monitor`). ⚠ the exact chrome API: use `untrackChrome` + `trackChrome(panelBox, {affectsStruts:false})`, not private records. | High |
| `overviewSeamlessZoom.js:129-141` | Box math subtracts `workArea - monitor` offsets, which are derived from the panel strut. With the strut gone the offsets are 0, so the geometry changes (probably correct but untested), and the `_workarea` override (`:71-89`) already pretends the strut is absent. ✔ (logic) ⚠ (visual) | Med |
| `panelTransparency.js:501-509, 541-580, 910-913` | Fullscreen detection adds `.kiwi-panel-fullscreen` (opaque) and the 2s poll re-styles the panel. A revealed auto-hidden panel over a window needs its own style state ("floating glass"), which neither class covers. ✔ | Med |
| `panelTransparency.js:79-101` | Blur group is a child of `panelBox`, so it moves with `translation_y`. ✔ (OK) | Low |
| Hot corner (`Main.layoutManager.hotCorners`, top-left) | The reveal zone overlaps the Activities hot corner. A pressure barrier was rejected in `panelHover.js:235-239`. Keep the actor approach, but exclude the hot-corner rect (⚠ runtime). | Low |
| Dash-to-Dock intellihide | Independent, but both edges hiding means `downloadsStack._lockDock` (`:539-555`) patterns may be needed for the panel too (hold the panel while a menu is open). ✔ | Low |

**Resolution:** generalise panelHover into a `PanelVisibility` controller with modes `always / fullscreen-hover / autohide`, using the public `trackChrome`/`untrackChrome` options instead of `_trackedActors`. Expose `requiresVisibility` holds (menus, the notch, Spotlight) the way D2D does, then delete the ghost menu. Run panelTransparency's style decisions from that controller's state signal instead of its 2s poll.

### 1.9 Cross-cutting recommendations

| # | Recommendation | Fixes |
|---|---|---|
| R1 | **Feature registry.** Replace the `_on_settings_changed` monolith (`extension.js:57-277`) with `{keys:[…], deps:[…], create(ctx)}` descriptors. Re-evaluate only the features whose keys changed. Pass one `ctx` object (`extension`, `settings`, `gettext`, services). | Churn, order hacks, inconsistent signatures |
| R2 | **PanelLayout service.** Named slots (`left.title`, `left.controls`, `center.notch`, `right.clipboard`, `right.media`, `right.clock`, `right.controls`) with an explicit order, applied after each change. | §1.1, §1.3, §1.5, §1.7 placement fights |
| R3 | **BlurService and BackdropSampler.** | §1.2, §1.4 |
| R4 | **MPRIS Source and NotificationState singletons.** | §1.5, §1.7 |
| R5 | **WindowStateRegistry.** | §1.6 |
| R6 | **KeybindingService and ModalService.** | §1.3, §1.4 |
| R7 | **Lock-screen policy.** Decide which features survive `unlock-dialog` (clipboard, file writes) and document it for EGO. | §1.3, §2.6 |

---

## 2. Legacy patches and tech debt

### 2.1 Lifecycle and architecture

| Sev | Where | Issue | Why it matters | Fix | ✔/⚠ |
|---|---|---|---|---|---|
| High | `extension.js:57-277` | Every key change calls enable/disable on ~30 modules; correctness depends on each module's idempotence guard | One missing guard stacks signals; adding 8 features adds more state | R1 registry | ✔ |
| High | `metadata.json` (no `session-modes`) | Full teardown and rebuild on every lock: GTK css rewritten twice, Mozilla `chrome/` deleted and recreated, `favorite-apps` and the `.desktop` file rewritten, D2D keys restored and re-set | File churn, flicker in apps, potential data loss (§2.6), slow unlock | Decide per R7; at minimum, skip file rewrites when the content is unchanged (launchpad already does this, `launchpadApp.js:171-181`) | ✔ |
| Med | `extension.js:121-127` | Ordering hack so window controls stay rightmost | Breaks as soon as another right-box item is added | R2 | ✔ |
| Med | `extension.js:106-119`; `prefs.js:578-583` | `custom-dnd-button`, QS notifications and panel media are silently dependent on `move-calendar-right && !keep-notification-panel` | Users toggle switches that do nothing | Make the dependency explicit in prefs (sensitive binding) or decouple | ✔ |
| Med | `extension.js:307-308`; schema:258-262 | `focus-new-windows` only applies at enable ("reload required") | Inconsistent with every other key | Move it into the dispatcher | ✔ |
| Low | `extension.js:22-54`, module APIs | Mixed signatures (`enable()`, `enable(ext)`, `enable(settings)`, `enable(gettext,settings)`, async `enable`), plus `enableMenus` and `enableDragRestore` | Hard to add a registry | Normalise to `enable(ctx)` | ✔ |
| Low | many modules | Each calls `ext.getSettings()` again (appButtons:32, windowTitle:80, calendar:187, gtkThemeManager:149, mozilla:31, launchpad:143) | Multiple `Gio.Settings` objects and handlers for the same schema | Pass one settings object | ✔ |
| Low | `lockIcon.js:21`, `quickSettingsNotifications.js:40` | `Main.extensionManager.lookup('kiwi@kemma')` hard-codes the uuid instead of passing the extension | Breaks forks or renamed uuids; EGO discourages it | Pass `ext.dir` | ✔ |

### 2.2 Private Shell API monkey-patches

| Sev | Where | Private API | Risk | Fix | ✔/⚠ |
|---|---|---|---|---|---|
| High | `panelHover.js:198,217,484-487` | `layoutManager._trackedActors`, `_updateVisibility()` | Upstream refactors break auto-hide silently | `untrackChrome`/`trackChrome` with options | ✔ |
| High | `overviewSeamlessZoom.js:143-149, 236-237` | Direct `Workspace.prototype._init` replacement (not InjectionManager). Restored only if it is still Kiwi's function | Chaining with other extensions leaves a stale patch | InjectionManager `overrideMethod` | ✔ |
| Med | `overviewSeamlessZoom.js:71-89, 129-141, 153-206` | `layout._workarea` defineProperty, `controls.layout_manager._computeWorkspacesBoxForState`, `_swipeTracker._touchpadGesture.emit`, `controls.gestureProgress/gestureEnd` own-property overrides | Fragile per release | InjectionManager where possible; version tests | ✔ |
| Med | `reduceWindowAnimations.js:20-71` | `Main.wm._shouldAnimateActor`, `_mapping`, `_destroying`, one-shot `actor.ease` swap | Can hijack an unrelated ease on the same actor | InjectionManager on `_mapWindow`/`_destroyWindow` is not possible (bound at startup, see comment `:22-26`); keep it, but add a version guard | ✔ |
| Med | `moveFullscreenWindow.js:130` | `Main.wm._workspaceAnimation.movingWindow` | Private; also global `slow_down_factor` (`:107`) | Guard with an existence check; avoid changing the global slow-down | ✔ |
| Med | `skipOverviewOnLogin.js:13-21` | Own-property replacement of `Main.overview.show`; `_startingUp` | Re-applied on every unlock (`firstLogin` reset `:66`) and never removed until disable | InjectionManager; do not reset `firstLogin` on disable | ✔ |
| Med | `calendar.js:198-228, 280-287` | `_centerBox/_rightBox`, `dateMenu._messageList`, `_calendar`, `messageTray._bannerBin`, `_sources`, `_notificationQueue` | Notch and Control Center collisions (§1.5) | Centralise in PanelLayout and NotificationState | ✔ |
| Med | `quickSettingsNotifications.js:46,276-286`; `quickSettingsDnDRemoval.js:111,130` | `quickSettings._system._systemItem`, `menu._grid`, `_indicators` | Breaks with the CC redesign | Public QS API | ✔ |
| Med | `windowTitle.js:279-298, 411` | `AppMenu._newWindowItem`, `_actionSection._getMenuItems`, `_quitItem`, `_app`, `_arrowAlignment` | AppMenu internals change often | Guard with optional chaining; version tests | ✔ |
| Med | `dockUtils.js`, `minimizedToDock.js`, `downloadsStack.js`, `launchpadApp.js:66-69` | Dash-to-Dock privates (`_slider`, `_box`, `_boxContainer`, `_separator`, `_dragPlaceholder`, `_hookUpLabel`, `_updateDashVisibility`, `_ignoreHover`, `appIcon.activate`) | Any D2D release can break 6 modules | Keep everything inside dockUtils (blur still bypasses it) | ✔ |
| Low | `mediaPlayback.js:145-345` | `MessageList.Message` privates (`_header`, `_icon`, `_bodyBin`, `_mediaControls`) | Card layout breaks per release | Build the card from St widgets | ✔ |
| Low | `launchpadApp.js:220-224` | Global override of `Shell.AppSystem.prototype.lookup_app` | Affects every caller (Spotlight too) | Acceptable with InjectionManager; filter it in Spotlight | ✔ |

### 2.3 Version-specific code and deprecated APIs

| Sev | Where | Item | Status | ✔/⚠ |
|---|---|---|---|---|
| Info | `panelTransparency.js:88-92`, `dockBlur.js:108-112`, `overviewWallpaper.js:81-85` | `Shell.BlurEffect({radius})` | **Correct** for 46+ (`sigma` was the pre-46 name). No `sigma` anywhere. The brief's "radius→sigma" is reversed | ✔ (repo), ✔ (upstream: `sigma` in shell-blur-effect.c 45.0, `radius` from 46.0) |
| Info | whole repo | `add_actor`/`remove_actor`, `Clutter.Container`, `get_maximized()`, `St.BoxLayout{vertical}` | **None present** (grep) | ✔ |
| Med | `windowTiling.js:62`, `appButtons.js:265-266`, `panelTransparency.js:645-646,704-707` | Maximized state via `maximized_horizontally/vertically` properties and their `notify::` signals | Works: mutter 49.0, 50.0 and 51.0 `src/core/window.c` still install `maximized-horizontally`/`maximized-vertically` (so `notify::` fires) alongside `is_maximized()`. Still wrap in one helper that prefers `is_maximized()` | ✔ |
| Low | `windowTiling.js:51-52` | `MAXIMIZE_ARGS` (48 needs `Meta.MaximizeFlags.BOTH`) | Needed while 48 is supported | ✔ |
| Low | `windowTitle.js:26-27` | `MENU_CLOSE_ARGS` for 51 | Needed | ✔ |
| Low | `quickSettingsDnDRemoval.js:8` | `SHELL_HAS_SYSTEM_DND` (≥49). On 48 the toggle removal is a no-op | Needed for 48 | ✔ |
| Low | `minimizedToDock.js:185-217` | ShaderEffect `set_shader_source` (48–50) vs `new_with_snippet` (51) | Needed | ✔ (branch), ✔ (51 API: mutter 51.0 clutter-shader-effect.h) |
| Low | `stylesheet.css:84-85` | `Gjs_AggregateMenu` / `Gjs_ui_panel_AggregateMenu` selectors | **Dead**: AggregateMenu was removed in GNOME 43. Delete them | ✔ |
| Low | `css/firefoxWindowControls.css` (`:root[tabsintitlebar]`) | Firefox attribute that newer releases may have renamed | ⚠ |
| Low | 46/47 leftovers | Support dropped in `e7b10f1`. No 45–47 branches remain in JS (grep `PACKAGE_VERSION` shows only 49 and 51 gates) | ✔ |

### 2.4 Polling and timeouts

| Sev | Where | Poll | Fix | ✔ |
|---|---|---|---|---|
| Med | `panelTransparency.js:910-913` | 2s `checkWindowTouchingPanel()` forever. It masks stale per-workspace signals (§2.5) | Fix the signals and drop the poll | ✔ |
| Med | `calendar.js:167-171` | 5s notification check forever | Use `source-added/removed` and `notification-added/removed`, already connected | ✔ |
| Med | `quickSettingsNotifications.js:131-137` | 200ms retry with **no attempt limit** until the QS system item exists | Cap it, or wait for the QS `_system` creation signal | ✔ |
| Med | `panelHover.js:71-93` | 1s pointer poll while revealed | Use leave-event plus a hold API | ✔ |
| Med | `advanced/titlebuttons_hover.c:184` | 800ms scan of every toplevel in every GTK3 process, forever | Hook `realize` emission (the dead `on_widget_realize`, `:151-160`) | ✔ |
| Low | `mediaPlayback.js:324,466` | 240ms soundwave and 1s progress, only while mapped and playing | OK | ✔ |
| Low | `dockBlur.js:175,294`; `dockUtils.js:115`; `launchpadApp.js:101` | Bounded retries (25×200ms, 10×1s, 40×250ms) | OK; unify them | ✔ |
| Low | `lockIcon.js:45`, `calendar.js:75`, `quickSettingsNotifications.js:274`, `appButtons.js:163` | Fixed startup delays (500/500/100/100ms) as readiness heuristics | Use real readiness signals | ✔ |

### 2.5 Missing cleanup, leaks and races

| Sev | Where | Issue | Fix | ✔/⚠ |
|---|---|---|---|---|
| Med | `panelTransparency.js:669-686, 768-770` | `window-added/removed` and per-window signals are connected only for the workspace active at enable. `switch-workspace` re-checks but never reconnects, so windows on other workspaces get no `position-changed`/`size-changed` handlers (the 2s poll hides the bug) | Reconnect on `active-workspace-changed`, as `dockColors.js:380-381` does | ✔ |
| Med | `panelTransparency.js:701` | Connects `notify::fullscreened`. Meta.Window's property is `fullscreen`, so this never fires (it is redundant with `in-fullscreen-changed` `:783`) | Use `notify::fullscreen` | ✔ (name), ✔ (silent: GLib `g_signal_parse_name`, used by gjs `connect`, does not validate `notify` details) |
| Med | `batteryPercentage.js:37-91` | `init_async` without a cancellable. If `destroy()` runs first, the callbacks set `_batteryProxy` and connect `g-properties-changed` on a destroyed instance (null `_batteryLabel` → TypeError on update), and that signal is never disconnected | Pass a `Gio.Cancellable`, cancel it in `destroy()`, check it in the callbacks | ✔ |
| Med | `batteryPercentage.js:52` | `call_sync('EnumerateDevices')` on the compositor thread | `call()` async | ✔ |
| Low | `batteryPercentage.js:110-121` | Shows only when the percentage equals exactly 20 or the state changes. A drop from 21 to 19 between updates never shows the label. Comments say 25% | Use `<=` with an edge flag | ✔ |
| Med | `gtkThemeManager.js:164-175` | `disable()` fires an async `removeUserGtkConfig()` without awaiting it, and lock or unlock immediately starts `updateGtkCss()`. The two read-modify-write sequences can interleave | Serialise through a promise queue, like `launchpadApp._queueFileOperation` (`:118-122`) | ✔ (code), ⚠ (observed) |
| Med | `minimizedToDock.js:41, 794-800, 821-856` | The `snapshots` Map (window textures) intentionally survives `disable()`. Earlier code cleared it (removed after `44d1dc2`) | EGO expects everything released; clear it, or justify it | ✔ |
| Low | `quickSettingsNotifications.js:278-280, 328-329` | Saves the whole `menu.actor` style string and replaces it with `max-height` only; restores the saved string | Compose instead of replacing | ✔ |
| Low | `panelHover.js:220-233, 363-367` | Hover actor geometry is taken once from the primary monitor; no `monitors-changed` handling | Rebuild on `monitors-changed` | ✔ |
| Low | `skipOverviewOnLogin.js:12-22, 66` | Override reinstalled on every enable after unlock and left until disable | §2.2 | ✔ |
| Low | `transparentMove.js:123-145` | Original opacity keyed by **pid**, so two windows of the same app share one entry | Key by `Meta.Window` (WeakMap) | ✔ |
| Low | `reduceWindowAnimations.js:29-40` | If `ease()` is never called after `_shouldAnimateActor` returns true, `_kiwiEasePatched` and the swapped `ease` stay on the actor after disable | Clear patched actors in disable | ⚠ |

### 2.6 Writing outside the extension (user files and settings)

| Sev | Where | Issue | Fix | ✔ |
|---|---|---|---|---|
| **High** | `mozillaThemeManager.js:78-86` | If the profile has a user-owned `chrome/` (no Kiwi marker) **and** `chrome.bak` already exists, the user's `chrome/` is **recursively deleted** (`:84`) | Never delete unmarked directories; use a timestamped backup | ✔ |
| **High** | `mozillaThemeManager.js:127-146` | `removeCss()` deletes `chrome/` **without checking the marker** (`:136-137`). It runs on every disable, including every lock, and whenever both Firefox styling and panel controls are off (`:55-57`) | Check `_isChromeManagedByKiwi` before deleting | ✔ |
| **High** | `extension.js:227,233` + `mozillaThemeManager.js:55-112` | With **default** settings (`show-window-controls=true`, Firefox styling false), Kiwi moves the user's Firefox and Thunderbird `chrome/` to `.bak`, writes its own, and appends `toolkit.legacyUserProfileCustomizations.stylesheets` to `user.js`, without the user enabling Firefox styling | Gate profile writes on the explicit per-app key | ✔ |
| Med | `mozillaThemeManager.js:163-179` | The `user.js` line is never removed on disable | Remove the Kiwi-tagged line | ✔ |
| Med | `mozillaThemeManager.js` throughout, `gtkThemeManager.js:95,129,133` | Sync file IO (`query_exists`, `replace_contents`, `move`, `enumerate_children`, `delete`, `mkdir_with_parents`) inside `async` functions on the compositor thread. Commit `ed8d2f3` addressed "EGO030" async IO only partially | Use `*_async` everywhere | ✔ |
| Med | `gtkThemeManager.js:86,104-137` | `~/.config/gtk-{3,4}.0/gtk.css` holds absolute `file://` imports into the extension directory. After a crash or uninstall without disable, the imports dangle, and they also affect Flatpak apps given the README override | Document it; offer a "Remove Kiwi GTK changes" button in prefs | ✔ |
| Low | `gtkThemeManager.js:20` | `LEGACY_IMPORT_REGEX` strips **any** `@import` line containing `kiwi@kemma`, including user-written ones | Acceptable; narrow it after a few releases | ✔ |
| Med | `dockColors.js:273,283,412` | Writes D2D GSettings at runtime. The originals are kept only in memory, so a shell crash leaves Kiwi colours in D2D permanently | Persist the originals in a Kiwi key | ✔ |
| Low | `launchpadApp.js:51-57,183-186,265-278` | Writes the `.desktop` file and `favorite-apps` on enable and removes them on disable, i.e. on every lock and unlock | Inherent once lock-survival was rejected; R7 | ✔ |
| Med | `quickSettingsNotifications.js:59-61` | DnD writes the system `show-banners` key (by design). Fine, but the notch and CC must share this single source | §1.5 | ✔ |
| Low | `advanced/install-extra.sh:59-63` | Writes `GTK_MODULES=` to `environment.d`, overriding other modules; ships a **prebuilt binary tracked in git** (`advanced/libtitlebuttons_hover.so`) | Append to the existing value; build in CI or drop the binary | ✔ |

### 2.7 Duplicated code, giant files, naming, magic numbers

| Sev | Item | Where | Fix | ✔ |
|---|---|---|---|---|
| Med | Blur stack ×3 and repaint signals ×2 | `panelTransparency.js:71-233`, `dockBlur.js:21-223`, `overviewWallpaper.js:67-109` | BlurService | ✔ |
| Med | Dock discovery reimplemented, with a looser name check (`actor.name === 'dashtodockContainer'` instead of `isDock`) | `dockBlur.js:283-303` vs `dockUtils.js:68-123` | Use `watchDocks` | ✔ |
| Med | Luminance and backdrop sampling ×2 | `panelTransparency.js:250-279,430-437` vs `dockColors.js:173-227` | BackdropSampler | ✔ |
| Low | Window title exclusion ×2 | `appButtons.js:333-355`, `windowTitle.js:222-237` | `isUserWindow()` | ✔ |
| Low | `windowForActor` ×2 | `windowTitle.js:65-71`, `focusOnOverviewExit.js:19-25` | Shared util | ✔ |
| Low | `D2D_UUIDS` ×2; disconnect helpers ×3 | `prefs.js:27`/`dockUtils.js:18`; `dockUtils.disconnectAll`, `overviewWallpaper._disconnect`, ad hoc loops | `apps/util.js` | ✔ |
| Low | Near-identical CSS sets | `titlebuttons3/alt3`, `titlebuttons4/alt4`, `firefoxWindowControls{,.alt}`, `thunderbird…` | Generate from a template | ✔ |
| Med | Giant files | `mediaPlayback.js` 1135, `prefs.js` 1107 (one ~1000-line method `:111-1106`), `moveFullscreenWindow.js` 1093, `downloadsStack.js` 1092, `panelTransparency.js` 995, `minimizedToDock.js` 856 | Split by concern: prefs pages into files, Player/Source/MediaItem, blur/contrast/style | ✔ |
| Low | Naming | `_on_settings_changed` (ext:57) and snake_case methods in `transparentMove.js`; `_kiwi_` vs `_kiwi` expandos; `enabled` vs `_enabled`; "AddUsernameToQuickMenu" actually targets the panel indicators | Pick one convention | ✔ |
| Low | Magic numbers | `panelHover.js:84,106,407` (+50/+4/+20px), `appButtons.js:415` (3000ms), `calendar.js:35,75,167`, `quickSettingsNotifications.js:274,279` (0.9), `prefs.js:376` (`!== 50` vs schema default 29), blur radius 30 ×2 / 60, `batteryPercentage.js:10` threshold with mismatched comments | Name constants; derive prefs defaults with `settings.get_default_value()` | ✔ |

### 2.8 Error swallowing

| Sev | Where | Fix | ✔ |
|---|---|---|---|
| Med | `mozillaThemeManager.js:80,84,143-145,153-155,176-178,218-220,242-244`: every failure ignored, including deletions | Log with `console.warn` at minimum, especially around deletes | ✔ |
| Low | `mediaPlayback.js:756,768,780,784,940,945,951,959,823-825,855-857`: `.catch(() => {})` on D-Bus | Log at debug level | ✔ |
| Low | `batteryPercentage.js:53-55,62-65,87-89`; `panelTransparency.js:275,350,376`; `dockColors.js:223`; `downloadsStack.js:140,156`; `minimizedToDock.js:79`; `prefs.js:776-778` | Mostly intentional fallbacks; keep them, but log unexpected errors | ✔ |

### 2.9 CSS debt

| Sev | Where | Issue | Fix | ✔ |
|---|---|---|---|---|
| Med | `stylesheet.css:14-16, 360-363, 656-692` | **Ungated** rules on stock classes (`.app-menu-icon`, `.maximized .window-content`, `.message-title`, `.message-group-title`, `.message .message-*-button`, `.message-list-clear-button`) apply to all shell notifications whatever the settings. Glass and notch styles will stack on top | Gate them behind `.kiwi-popup-styled` or Kiwi classes | ✔ |
| Med | `stylesheet.css:213-219` | Selector relies on the auto-generated GType `Gjs_apps_appButtons_WindowControlsIndicator` (depends on the file path) | Add a style class | ✔ |
| Low | `stylesheet.css:49-53` | `.kiwi-panel-color-inherit` sets `background-color: black` while the key says "inherit" | Align name and behaviour | ✔ |
| Low | `stylesheet.css` (~60 `!important`) | Specificity wars with D2D, the theme and BMS | Accept for D2D inline styles; reduce elsewhere | ✔ |
| Low | `css/fixes3.css:31-73`, `css/fixes4.css:104-170` | Global app-specific overrides (Geary, Nautilus, every `button.image-button:hover` in GTK3) bundled under "Menu and App Styling" | Split into an explicit "App fixes" key | ✔ |

### 2.10 EGO review risk

From the git log (✔): `0447591` "EGO015 fixes" (resource cleanup: signals, destruction), `dc12ed8` "EGO016 fix" (idle sources), `ed8d2f3` "EGO030 fixes" (async file handling), `4f1ec31` "EGO v37 try/catch cleanup" (no blanket try/catch around disconnects), `44d1dc2` "ego: fixes applied" (removed `try{disconnect}catch`), `bbeac23` "comply with EGO review guidelines" (removed the lock-screen survival in launchpad and replaced destroyed flags with cancellables). The rule numbers are inferred from the commit messages; the official guideline numbering was not checked.

Items likely to be flagged next:

| Sev | Item | Where | ✔ |
|---|---|---|---|
| High | Deleting user directories in Firefox/Thunderbird profiles; touching profiles without opt-in | §2.6 | ✔ |
| Med | Remaining sync IO (same family as EGO030) | mozillaThemeManager, gtkThemeManager:129,133, appButtons:478-500, downloadsStack:196 (`Pixbuf.get_file_info`), panelTransparency:260, batteryPercentage:52 | ✔ |
| Med | Resources retained after disable (snapshots) | minimizedToDock:794-800 | ✔ |
| Med | Unbounded sources (EGO016 family) | quickSettingsNotifications:131 | ✔ |
| Med | Global side effects: `St.Settings.slow_down_factor` | moveFullscreenWindow:107 | ✔ |
| Low | Hard-coded uuid lookup | lockIcon:21, quickSettingsNotifications:40 | ✔ |
| Low | Planned features: clipboard persistence (privacy), keybinding grabs of system shortcuts (Super+Space), `session-modes` justification | §1.3/§1.4 | ⚠ |

### 2.11 Build, CI, docs

| Sev | Item | Fix | ✔ |
|---|---|---|---|
| Med | No lint (no ESLint/gjs config), no `glib-compile-schemas --strict --dry-run`, no tests | Add an `eslint` job based on the gjs.guide ruleset and a schema check on PRs | ✔ |
| Low | `pack-release.yml` uses `actions/upload-release-asset@v1` (archived) and installs the whole `gnome-shell` package for `gnome-extensions` | `softprops/action-gh-release`; a smaller dependency | ✔ |
| Low | No local Makefile or zip script; translations need manual `xgettext` (no pot regeneration script); `'%d More in Files'` is not plural-aware (`downloadsStack.js:455`) | Add `make pack/pot/install`; use `ngettext` | ✔ |
| Low | README badge "48–50" vs metadata 48–51 (`README.md:2`); `metadata.json` description lists features but not the dock or media changes | Sync | ✔ Resolved: badge and `metadata.json` both say GNOME 50 (this release supports only GNOME 50 on Fedora 44) |
| Low | `advanced/*.sh` messages refer to a non-existent "kiwi-kemma/extras" directory; install says "restart computer", uninstall says "log out" | Fix the text | ✔ |

---

## 3. Verification notes

* **✔ items** were checked by reading the cited lines at `c2f3d0f` (all JS, CSS, schema, prefs, scripts and the C module were read in full, plus git history for the EGO commits).
* **⚠ items needing runtime or upstream confirmation** (upstream items re-checked 2026-10-25; 4, 6 and 8 remain open because they need a running session or Firefox source):
  1. ✔ (2026-10-25) Mutter 49.0/50.0/51.0 `src/core/window.c` still install `maximized-horizontally/vertically` (https://gitlab.gnome.org/GNOME/mutter).
  2. ✔ `sigma` → `radius` happened in GNOME 46 (gnome-shell `src/shell-blur-effect.c` 45.0 vs 46.0).
  3. ✔ Defaults: `switch-input-source = ['<Super>space','XF86Keyboard']` (gsettings-desktop-schemas), `toggle-message-tray = ['<Super>v','<Super>m']` (gnome-shell 51.0 schema).
  4. Whether GTK delivers clicks to titlebuttons hidden with `opacity:0` and negative margins.
  5. ✔ `notify::fullscreened` is silent: GLib `g_signal_parse_name` (gobject/gsignal.c) does not validate details. The handler never runs.
  6. Interaction between the panelHover ghost-menu grab and a new `pushModal`.
  7. ✔ `Clutter.ShaderEffect.new_with_snippet` exists in mutter 51.0 `clutter/clutter/clutter-shader-effect.h`.
  8. Firefox's current titlebar attribute (`tabsintitlebar` vs newer names) used in `firefoxWindowControls*.css`.
* No existing files were modified. Only `docs/architecture/code-map.md` and this file were added.
