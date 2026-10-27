# macOS core system UI and bundled apps (2018 → now), and how Kiwi should port them

Scope: the parts of macOS that make up "the Mac experience" day to day: the system UI (menu bar, Dock, Mission Control, Spotlight and so on) and the bundled apps (Finder, Preview, Activity Monitor …). Each item says what it is today, how it changed from Mojave (2018) to now, and whether Kiwi should build it **in the Shell extension**, as a **small companion GTK4/libadwaita app**, by **configuring or theming an existing GNOME app**, or **skip** it.

**Where macOS is today (2026-10-27).** The current release is **macOS 27 "Golden Gate"** (27.0 on 14 Sep 2026, 27.2 on 26 Oct 2026). It is Apple-silicon only, and it is the last release with general Rosetta support. Its big themes:
- Siri AI is built into Spotlight (the "Search or Ask" bar).
- A Liquid Glass slider, from ultra-clear to fully tinted.
- Uniform toolbars and edge-to-edge sidebars.
- Extra-large and real-time widgets.
- A grey Dock indicator for apps that still run in the background.
- Finder column auto-size.
- A "Show Borders" accessibility option.

It refines **macOS 26 Tahoe** (2025), which brought:
- the Liquid Glass design and a transparent menu bar;
- a customisable Control Center and Spotlight Actions, clipboard history and quick keys;
- the removal of Launchpad, replaced by "Apps";
- folder colours and emoji, and the Phone and Journal apps.

Short history used below: Mojave 10.14 (2018), Catalina 10.15 (2019), Big Sur 11 (2020), Monterey 12 (2021), Ventura 13 (2022), Sonoma 14 (2023), Sequoia 15 (2024), Tahoe 26 (2025), Golden Gate 27 (2026).

**Kiwi context.** These come from `docs/architecture/overhaul-plan.md`.
- The plan covers the menu bar with a logo menu and a global app menu, Kiwi's own dock (Genie/Scale), Mission Control, App Exposé, a Cmd-Tab-style switcher, gestures, Stage Manager v3, the notch, Spotlight, Control Center, clipboard, tiling and faux glass.
- The owner **dropped** GTK and Firefox theming (`gtk.css` imports, `userChrome.css`) and the native `advanced/` module. Any "theme an existing app" advice below therefore means GSettings/configuration or a separately installed add-on, not Kiwi writing CSS into user files.
- Status words used below: **have** = merged in Kiwi today; **partial** = some of it exists, or it is in the overhaul plan; **none** = neither.

**Packaging rule for companion pieces.** EGO does not let an extension install system packages or drop files into other apps' folders. Anything outside the Shell process should ship through the owner's installer (overhaul plan §9), not from `enable()`. That covers a companion app, a Nautilus extension, a GDM theme and `keyd` rules.

---

## Part A: System UI

### Menu bar (Apple menu, app menus, status items, multiple displays, auto-hide)
- **Introduced / changed:**
  - Classic since 1984.
  - Big Sur: translucent and taller, rounded menus, Control Center icon.
  - Monterey: option to keep the menu bar in full screen.
  - Ventura: System Settings menu-bar section.
  - Tahoe: **fully transparent by default** (with a faint top gradient for legibility), a "Show menu bar background" toggle, a new **Menu Bar** settings page with "Allow in the Menu Bar" per-app switches, Control Center controls and multiple Control Center panels droppable into the bar, iPhone Live Activities in the bar, and menus with SF Symbol icons next to items.
  - 27: refined glass contrast.
- **What it is:**
  - **Left:** the Apple menu: About This Mac, System Settings…, App Store…, Recent Items, Force Quit…, Sleep, Restart…, Shut Down…, Lock Screen, Log Out.
  - **Then the bold app name**, whose menu holds About, Settings… (⌘,), Services, Hide (⌘H), Hide Others (⌥⌘H), Show All and Quit (⌘Q).
  - **Then the app's menus** (File, Edit, View, Window, Help). Help has a search field that finds and highlights any menu command.
  - **Right:** status menus (third-party extras), Spotlight, Control Center, privacy dots (orange mic, green camera, purple system-audio recording, arrow for location), and the clock, which opens Notification Center.
  - ⌘-drag rearranges or removes status items.
  - **Auto-hide:** "Automatically hide and show the menu bar" (Always / On Desktop Only / In Full Screen Only / Never). The bar slides down when the pointer touches the top edge.
  - **Multiple displays:** every display has its own menu bar. The active display's bar is opaque or bright and the others are dimmed. With "Displays have separate Spaces" off, only the main display has one.
- **Caveats (on macOS):**
  - The notch on MacBooks hides status items when there are too many; Apple only added the per-app hide switch in Tahoe.
  - Transparent-bar legibility depends on the wallpaper.
  - Third-party Control Center controls barely existed at Tahoe launch (MacStories found two apps).
- **Port to GNOME 50:** Shell extension, on top of `Main.panel`.
  - Logo menu: a `PanelMenu.Button` with `PopupMenu` items calling `SystemActions` (lock, suspend, power off, log out), `Gio.AppInfo` for Settings and Software, and `Gtk.RecentManager`-equivalent data. In the Shell, read `~/.local/share/recently-used.xbel` asynchronously.
  - App name and menus: the provider chain in plan §5.1. GTK `org.gtk.Actions`/`org.gtk.Menus` via `Meta.Window.get_gtk_*_object_path()`, a `com.canonical.AppMenu.Registrar` + DBusMenu host for Qt/Electron/LibreOffice (they register by X11 id, so this works only under Xwayland), and AT-SPI as an experiment.
  - Status items: GNOME has no StatusNotifierItem host. Kiwi must either host `org.kde.StatusNotifierWatcher` itself or cooperate with the AppIndicator extension (Fedora does not ship it enabled).
  - Privacy dots: GNOME already shows a camera, mic and screen-share indicator. Restyle it as dots.
  - Multiple displays: GNOME draws the panel only on the primary monitor. Secondary bars mean creating extra `St.BoxLayout` panels per `Main.layoutManager.monitors`, as Multi Monitors Add-On does, and a dimmed style for the non-focused monitor.
  - Auto-hide: chrome tracking with `affectsStruts` toggled plus a pressure barrier (`Meta.Barrier`). Note that `affectsInputRegion` is gone in 50. Kiwi removed its old auto-hide because the notch lives in the bar, so auto-hide must keep the notch reachable, for example by revealing the bar on hover. Offer the macOS options: "In Full Screen Only" by default, "Always", "Never".
- **Blockers / risks:**
  - libadwaita apps have **no menu bar** to export: only `app.*`/`win.*` actions and a hamburger menu. A generic File/Edit/Window set plus mapped actions is the realistic ceiling without AT-SPI.
  - Wayland apps cannot register DBusMenu by window id (no X11 id), so native-Wayland Qt and Electron apps fall back to the generic menus.
  - Edit commands (Copy, Paste, Undo) cannot be invoked in an arbitrary app from the Shell except by synthesising key chords through `Clutter.VirtualInputDevice`. That works, but it is fragile.
  - EGO reviewers dislike heavy private-API use (`Main.panel._leftBox`).
- **Linux equivalents today:** Ubuntu's old Unity global menu (dead), the extensions "Fildem", "Gnome Global Application Menu" and "AppIndicator and KStatusNotifierItem Support", KDE Plasma's Global Menu widget (the best working reference for DBusMenu).
- **Kiwi status:** partial. Window controls in the panel, Control Center, notch and clock exist. The logo menu, app menu and status-item host are planned for P1/P6.
- **Recommendation:** Port (P1 core), **L**. The menu bar is the single most "Mac" surface. Ship the logo menu plus generic and GTK-action menus first, then DBusMenu and AT-SPI.

### Dock (magnification, Stacks, recents, Genie/Scale, bounce, badges, context menus, hiding)
- **Introduced / changed:**
  - Mojave: "Show recent applications" (up to 3 recent apps in their own section).
  - Big Sur: new squircle icons, a lighter glass background.
  - Monterey and later: minor.
  - Sonoma: "Click wallpaper to reveal desktop".
  - Tahoe: Liquid Glass Dock (more transparent), icon styles (default, dark, clear, tinted) and the grey "shame box" for non-conforming icons; Launchpad's Dock tile becomes **Apps**.
  - 27: a **light-grey running indicator** for apps that were quit but still run a background process, with "Stop Running in Background" in the icon menu; more detailed glass icons.
- **What it is:**
  - **Layout:**
    - pinned apps;
    - a separator, then recent or suggested apps;
    - a separator, then folders, stacks and the Downloads stack;
    - minimized windows (unless "Minimize windows into application icon");
    - the Trash.
  - **Desktop & Dock settings:** Size; Magnification (off by default, with a size slider); Position (left/bottom/right); Minimize using **Genie** or **Scale**; title-bar double-click (Fill / Zoom / Minimize / nothing); Minimize into application icon; Automatically hide and show the Dock; Animate opening applications (the **bounce**); Show indicators for open applications; Show suggested and recent apps in Dock.
  - **Behaviour:**
    - Bounce on launch and a repeated bounce when an app needs attention.
    - **Badges:** red counts, or a "!" mark.
    - Right-click menu: open windows list; New Window; Options ▸ Keep in Dock / Open at Login / Show in Finder / Assign To (All Desktops, This Desktop, None); Show All Windows; Hide; Quit. Holding ⌥ turns Quit into Force Quit and Hide into Hide Others.
    - Drop a file on an app to open it with that app; drag off to remove ("Remove" label, then a puff).
    - ⌘-click reveals the item in Finder; ⌥-click switches to the app and hides the current one; ⌥⌘-click switches to it and hides all others.
    - Ctrl-Shift held toggles magnification for the moment. ⌥⌘D toggles auto-hide. Fn-Ctrl-F3 moves keyboard focus to the Dock.
    - Drag the separator to resize the Dock.
    - Hidden apps' icons can be made translucent (a `defaults` key).
  - **Stacks:** a folder in the Dock opens as a Fan, a Grid (scrollable, with folder navigation) or a List, sorted by name or date added/modified/created or kind. It is shown as a folder icon or as a stack of its contents.
- **Caveats (on macOS):**
  - Magnification is off by default and many users find it distracting.
  - "Recent apps" surprises people.
  - The Dock lives only on one display at a time; it moves to whichever display the pointer pushes against at the bottom edge.
  - The Tahoe Dock glass hurts contrast on light wallpapers.
- **Port to GNOME 50:** Shell extension (plan §5.2–5.3).
  - Actors: an `St.Widget` in `Main.layoutManager.addChrome` with `affectsStruts` (or tracked for auto-hide), apps from `Shell.AppSystem` and `Shell.AppFavorites`, windows from the core `DesktopModel`.
  - Magnification: a per-frame scale of icon actors based on pointer distance (transform only, no relayout).
  - Bounce: an `ease` on `translation_y` triggered by `Shell.WindowTracker`/`Shell.App` `notify::state` (STARTING) and by `Meta.Window` `demands-attention`/`urgent`.
  - Badges and progress: implement the `com.canonical.Unity.LauncherEntry` D-Bus signal (count, progress, urgent), as Dash to Dock does. Many apps (Thunderbird, Telegram, Fractal, Discord/Electron) emit it.
  - Genie: a `Clutter.DeformEffect` subclass (mesh), Scale: a plain `ease`. Both hook `Main.wm` minimize/unminimize. The target rect is set with `Meta.Window.set_icon_geometry()`.
  - Stacks: a Gio folder enumeration (async) with a fan/grid popup. `Gio.FileMonitor` for Downloads.
  - Open at Login: write `~/.config/autostart/*.desktop` (a file Kiwi creates, which the rules allow).
  - "Show in Finder": `org.freedesktop.FileManager1.ShowItems`.
  - 27's background-running indicator maps to apps with no windows but a live process. GNOME's Background Apps portal list (`org.freedesktop.background.Monitor`, already used by Quick Settings' "Background Apps") can feed it.
- **Blockers / risks:**
  - Dash to Dock must be disabled and restored, as planned.
  - The DeformEffect mesh costs GPU on large windows; cap the tile count.
  - Wayland apps cannot be "hidden" (see Window management), so the translucent hidden-app icon depends on Kiwi's own hide emulation.
  - Badges need app cooperation (LauncherEntry).
  - An EGO reviewer will look closely at the Genie shader and effect code.
- **Linux equivalents today:** Dash to Dock, Dash to Panel, the Compiz-alike Magic Lamp effect extension, Plank/Docky (X11, dead), Latte Dock (KDE, dead), nwg-dock.
- **Kiwi status:** partial. The Dash-to-Dock add-ons (dock styling, downloads stack, minimize-to-dock) exist but are being dropped; Kiwi's own dock and Genie are planned for P1/P2.
- **Recommendation:** Port (P1 core), **XL** for everything, **L** for the P1 subset. The dock plus Genie is the second most recognisable Mac surface. Build badges and Stacks in P2.

### Mission Control, Spaces and App Exposé
- **Introduced / changed:**
  - Lion merged Exposé and Spaces into Mission Control (2011).
  - Mavericks: separate Spaces per display.
  - El Capitan: Split View.
  - Since 2018 the core stayed the same.
  - Sequoia: "Drag windows to top of screen to enter Mission Control".
  - Tahoe: glass styling.
  - 27: smoother Mission Control and Spaces animations, and better restoration of windows, Spaces and display assignments when a display is replugged.
- **What it is:**
  - **Entering:** a 3-finger swipe up (or 4 fingers, configurable), the Mission Control key/F3, Ctrl-↑, a 2-finger double-tap on a Magic Mouse, or dragging a window to the top edge.
  - **The view:** all windows of the current Space spread out in one layer without overlapping, with titles on hover. The **Spaces bar** at the top shows desktop thumbnails; it starts collapsed as names ("Desktop 1, 2, Safari") and expands on hover. A "+" adds a Space.
  - **Actions:** drag a window onto a Space to move it; drag Spaces to reorder; hover a Space and click ✕ to remove it (its windows move to the neighbour). Full-screen apps appear as their own Spaces. Dragging a window onto a full-screen app thumbnail creates a **Split View** Space.
  - **Switching Spaces:** Ctrl-← / Ctrl-→ or Ctrl-1…9 (if enabled); 3- or 4-finger horizontal swipes.
  - **App Exposé:** Ctrl-↓ or a 3/4-finger swipe down shows only the front app's windows, with recent documents along the bottom. From the Dock: right-click ▸ Show All Windows.
  - **Settings** (Desktop & Dock ▸ Mission Control): Automatically rearrange Spaces based on most recent use; When switching to an application, switch to a Space with open windows for the application; Group windows by application; Displays have separate Spaces; Drag windows to top of screen to enter Mission Control.
- **Caveats (on macOS):**
  - "Rearrange Spaces automatically" is on by default and widely disliked.
  - Spaces are not scriptable. There is no shortcut to move a window to a Space without third-party tools (macOS has none built in). Sequoia's tiling partly reduced the need.
- **Port to GNOME 50:** Shell extension restyling the overview (plan §5.4).
  - Hide the search entry and dash (`Main.overview.searchEntry`, `dash`).
  - Replace the workspace thumbnails with a top Spaces bar (`WorkspaceThumbnail`-like actors, or a reparented `ThumbnailsBox`).
  - Spread windows with the stock `Workspace`/`WorkspaceLayout`.
  - App Exposé: filter `Workspace` window clones by `Shell.WindowTracker.get_window_app()`.
  - "+": `global.workspace_manager.append_new_workspace()`; GNOME's dynamic workspaces must be turned off while Kiwi manages them, and restored (`org.gnome.mutter dynamic-workspaces`).
  - Entry points: the `toggle-overview` keybinding (via `Main.wm.setCustomKeybindingHandler`) plus Kiwi keybindings for Ctrl-↑/↓.
  - Gestures: the stock `SwipeTracker`.
  - Per-display Spaces: `org.gnome.mutter workspaces-only-on-primary`. GNOME cannot give each monitor independent workspaces; it is "primary only" or "span all".
- **Blockers / risks:**
  - The overview internals are private and change every release (`OverviewControls`, `WorkspacesView`), so this is the highest-maintenance item.
  - True per-monitor independent Spaces are impossible in Mutter today.
  - Mutter's full-screen windows do not get their own workspace automatically (see Full screen).
- **Linux equivalents today:** the stock GNOME overview, the extensions "Just Perfection" and "V-Shell (Vertical Workspaces)", KDE's Overview and Desktop Grid, Compiz Expo (historic).
- **Kiwi status:** partial. Shell behaviour turns the hot corner off and stops up-swipes at the workspaces view; Mission Control and App Exposé are planned for P3.
- **Recommendation:** Port (P1 core in importance, scheduled P3), **L**. It replaces Activities, so it defines the whole flow.

### Hot corners
- **Introduced / changed:**
  - Long-standing (Exposé, 2003).
  - Monterey: a default bottom-right **Quick Note**.
  - Tahoe: "Apps" replaced "Launchpad" in the action list.
- **What it is:**
  - Desktop & Dock ▸ Hot Corners. Each of the 4 corners can trigger Mission Control, Application Windows, Desktop, Notification Center, Launchpad/Apps, Quick Note, Start Screen Saver, Disable Screen Saver, Put Display to Sleep, Lock Screen, or nothing.
  - Holding ⌘/⌥/⌃/⇧ while picking an action makes the corner fire only with that modifier held, which avoids accidental triggers.
- **Caveats (on macOS):** accidental triggers are the main complaint; modifiers fix them.
- **Port to GNOME 50:** Shell extension.
  - GNOME has one hot corner (top-left → overview), controlled by `org.gnome.desktop.interface enable-hot-corners`, which Kiwi already turns off.
  - Implement 4 corners with `Meta.Barrier` pressure barriers (`Layout.PressureBarrier`, as `layout.js` HotCorner does), per monitor.
  - Read the modifier state with `global.get_pointer()`.
  - Actions map to Kiwi features (Mission Control, App Exposé, Show Desktop, Notification Center, Launchpad, Lock via `Main.screenShield.lock`, display sleep via the `org.gnome.ScreenSaver` D-Bus `SetActive`, Quick Note by launching a notes app).
- **Blockers / risks:**
  - Barriers need care on multi-monitor edges.
  - With the menu bar at the top, the top corners must not steal clicks on the logo menu or the clock.
- **Linux equivalents today:** the extension "Custom Hot Corners – Extended", KDE Screen Edges.
- **Kiwi status:** none (Kiwi only disables GNOME's corner).
- **Recommendation:** Port (P2), **S**. Cheap, liked, and reuses existing barrier code.

### Trackpad gestures (full list)
- **Introduced / changed:**
  - Stable since El Capitan.
  - Monterey and later: minor.
  - 27: "pull down to refresh" in Safari, Mail, News, Podcasts and Calendar.
  - 27.2: code for touchscreen gestures ahead of a touchscreen MacBook Pro.
- **What it is** (Trackpad settings; defaults per Apple's guide):

  | Gesture | Action |
  |---|---|
  | Tap with one finger | Click (tap to click) |
  | 2-finger click or tap | Secondary click |
  | 2-finger double-tap | Smart zoom |
  | 2-finger slide | Scroll (natural direction) |
  | 2-finger pinch | Zoom |
  | 2-finger rotate | Rotate |
  | 2-finger swipe left/right | Previous/next page |
  | 2-finger swipe in from the right edge | Notification Center |
  | 3-finger drag | Drag items (Accessibility option) |
  | 3-finger tap, or Force Click | Look up and data detectors |
  | Spread thumb and 3 fingers | Show Desktop |
  | Pinch thumb and 3 fingers | Launchpad / Apps |
  | 3- or 4-finger swipe up | Mission Control |
  | 3- or 4-finger swipe down | App Exposé |
  | 3- or 4-finger swipe left/right | Switch Spaces or full-screen apps |

  Force Touch trackpads add Force Click and haptic "clicks" with no moving parts.
- **Caveats (on macOS):** the 3-finger vs 4-finger choice conflicts with 3-finger drag; Force Click is discoverable to almost no one.
- **Port to GNOME 50:** Shell extension for the system gestures.
  - Mutter delivers 3+ finger touchpad swipe and pinch events to the Shell (`Clutter.EventType.TOUCHPAD_SWIPE`/`TOUCHPAD_PINCH`, with `get_touchpad_gesture_finger_count()`). Apps receive only 2-finger pinch, rotate and swipe through Wayland pointer-gestures.
  - Kiwi can claim 3/4-finger up and down (Mission Control, App Exposé), left and right (workspaces; already stock), 4-finger pinch (Launchpad) and spread (Show Desktop) with `SwipeTracker` or a `captured-event` handler on `global.stage`, as plan §3 says.
  - 2-finger and in-app gestures (smart zoom, back/forward, rotate) are each app's job. GTK4 has them, and Nautilus, Loupe and Epiphany support swipe-back.
  - 3-finger drag is a libinput feature (added in libinput 1.27). Whether GNOME exposes it as a setting must be checked for 50; if it is not exposed, skip it.
- **Blockers / risks:**
  - A 2-finger edge-swipe for Notification Center is not possible: 2-finger motion is scroll and goes to the app.
  - There are no haptics on non-Apple trackpads.
  - Pinch events with 4 fingers vary by hardware; test on real devices.
  - It conflicts with GNOME's own 3-finger swipe trackers, so Kiwi must disable or replace them and restore them on disable.
- **Linux equivalents today:** GNOME's built-in 3-finger swipes, the extensions "Gesture Improvements" (pinch and more) and "Touchpad Gesture Customization", Touchegg (X11 only), KDE's gestures.
- **Kiwi status:** partial (up-swipe stop at workspaces); the full set is planned for P3.
- **Recommendation:** Port (P3), **M**. Gestures are how Mac laptop users drive Mission Control, Launchpad and Show Desktop.

### Cmd-Tab app switcher
- **Introduced / changed:**
  - OS X 10.3; unchanged in essence.
  - Big Sur: rounded glass.
  - Tahoe: Liquid Glass, more transparent (reviewers liked it here).
- **What it is:**
  - Hold ⌘ and tap Tab: a centred row of **one big icon per running app** in most-recently-used order, including hidden apps and apps with no windows. Releasing ⌘ activates the selected app.
  - While it is open:
    - Tab and ⇧Tab or `` ` `` move the selection; arrow keys and the mouse also work;
    - **Q quits** and **H hides** the selected app;
    - ↑ or ↓ opens App Exposé for it;
    - Esc or `.` cancels;
    - you can drop a dragged file onto an icon.
  - A quick ⌘Tab tap toggles between the last two apps.
  - ⌘-`` ` `` cycles windows of the current app (no UI).
  - The switcher does not un-minimize windows, unless ⌥ is held when ⌘ is released.
- **Caveats (on macOS):**
  - It is app-based, not window-based: users coming from Windows hate that minimized windows stay minimized.
  - It shows only one display.
- **Port to GNOME 50:** Shell extension.
  - GNOME already has an app-grouped `AppSwitcherPopup` (`switch-applications`, Super/Alt-Tab) and `switch-group` (Super/Alt-`` ` ``).
  - Kiwi overrides both with `Main.wm.setCustomKeybindingHandler('switch-applications', …)` and a subclass of `SwitcherPopup.SwitcherPopup` with big icons, no thumbnails, and Q/H handled in `_keyPressHandler`. Quit uses `Shell.App.request_quit()`; Hide uses Kiwi's hide emulation.
  - Keep "un-minimize with ⌥" as an option.
- **Blockers / risks:**
  - There is no real Cmd key: Super-Tab is the honest mapping, unless the user remaps keys with keyd (see Keyboard conventions).
  - Super is also GNOME's overview key, which Kiwi already redirects to Spotlight.
  - The custom handler must be restored on disable.
- **Linux equivalents today:** the stock GNOME app switcher, the extensions "AATWS (Advanced Alt-Tab Window Switcher)" and "Coverflow Alt-Tab".
- **Kiwi status:** none (planned P3).
- **Recommendation:** Port (P1 core), **S–M**. Very cheap thanks to the stock popup, and constantly used.

### Launchpad (and "Apps" in Tahoe)
- **Introduced / changed:**
  - Lion (2011) to Sequoia: Launchpad, a full-screen, iOS-like paged grid of all apps, with **folders** made by dragging one icon onto another, drag to reorder, delete App Store apps with the jiggle mode (⌥ held), and search on top. Opened with F4, a pinch with thumb and 3 fingers, or the Dock tile.
  - **Tahoe removed Launchpad.** Its replacement **Apps** is the Applications section of Spotlight, opened by the Dock tile, the pinch gesture, ⌘Space then ⌘1, or Fn-⇧A. Apps is:
    - a scrollable alphabetical grid (5 columns, **7 since 26.1**) with the most-used apps on top;
    - category filters (Productivity & Finance, Utilities, Creativity, Social, Entertainment, Information & Reading, Other);
    - a Grid or List toggle;
    - iPhone apps (opened through iPhone Mirroring).
  - Apps has **no custom order, no folders**, and no right-click menu.
  - 27 kept Apps; Launchpad did not return.
- **What it is:** a launcher you browse rather than search. In Tahoe it is a typing-first window, not a full-screen overlay.
- **Caveats (on macOS):**
  - The loss of folders and manual layout is one of Tahoe's most complained-about changes (Apple Community threads; Fast Company called it "a mistake for users").
  - Third-party "LaunchOS", "Launchie" and "AppGrid" recreate the old Launchpad.
- **Port to GNOME 50:** Shell extension restyling GNOME's own app grid, which already **is** Launchpad. `AppDisplay` has pages, drag to reorder, drag-onto-icon folders, page dots and a search field via the overview.
  - Kiwi shows it as a full-screen glass overlay (blurred wallpaper look, big icons, no dash).
  - Entry points: the dock tile, a 4-finger pinch, and a key.
  - Optionally add the Tahoe "Apps" categories as filter chips (from `.desktop` `Categories=`) and Spotlight's ⌘1-style Apps tab.
  - Uninstalling from the grid uses GNOME Software (`gnome-software --details=`) or the Flatpak/PackageKit flow of the owner's installer.
- **Blockers / risks:**
  - The private `AppDisplay` internals change often.
  - Showing the grid without the overview's other parts needs care, because the grid is a child of the overview's controls.
- **Linux equivalents today:** the GNOME app grid, the "Launchpad"-style extensions (e.g. "ArcMenu" in grid mode), KDE's Application Dashboard.
- **Kiwi status:** partial. `launchpadApp` (a Dash-to-Dock app) is being dropped; the dock and app-grid Launchpad are planned.
- **Recommendation:** Port (P2), **M**. Faithful to pre-Tahoe macOS, and arguably better than Tahoe's Apps. Keep folders. Offer the Tahoe categories as filters inside Spotlight.

### Spotlight
- **Introduced / changed:**
  - Mojave–Big Sur: a centred search bar, top-hit preview pane.
  - Monterey: Live Text in images, rich results.
  - Ventura: Quick Look from results (Space), actions (e.g. start a timer, create a Focus).
  - **Tahoe: the biggest redesign ever.**
    - Typing-first, with adaptive learning: "N" can rank Numbers first.
    - A filter row under the field.
    - **Tab scopes the search to an app's documents.**
    - Four sections: **Apps (⌘1), Files (⌘2), Actions (⌘3), Clipboard (⌘4)**; you can also press ⌘Space then the digit.
    - **Actions** (App Intents / Shortcuts) with fields filled by Tab.
    - **Quick keys:** user-assigned aliases such as "fp".
    - **Slash filters:** `/pdf`, `/folders`, `/screenshots` …
    - Searches **menu items** of the front app, open windows and tabs, third-party cloud files, and text in screenshots.
    - **Clipboard history of the last 8 hours.**
    - Calculations, unit and currency conversion, definitions.
    - Holding ⌘ reveals a result's path. Up-arrow recalls previous searches.
    - Grid/List toggle for Apps and Files.
    - The window can be dragged and resized.
  - **27:** Siri AI is integrated: the "Search or Ask" bar starts a conversation that can be switched to ChatGPT. Search ranking is better. Shift-⌘Space starts Visual Intelligence.
- **What it is:** the system launcher, file search, calculator, clipboard and command palette in one keyboard surface.
- **Caveats (on macOS):**
  - Indexing after updates slows it down.
  - The clipboard window is only 8 hours.
  - Siri AI is region-limited, beta and has usage limits.
  - Privacy settings now include "exclude apps" and private query sharing.
- **Port to GNOME 50:** Shell extension (Kiwi already has it).
  - **Search sources:**
    - GNOME search providers (`org.gnome.Shell.SearchProvider2`) for files (via localsearch, the renamed Tracker 3), Characters, Calculator, Settings, Software, Contacts and Clocks;
    - Kiwi's own apps, settings, calculator and clipboard providers;
    - web search.
  - **To add, Tahoe style:**
    - tabs (Apps, Files, Actions, Clipboard) with Super+1…4 inside the modal, or Ctrl+1…4 to avoid GNOME's Super+number app launching;
    - **Tab to scope** to an app (files whose MIME type the app handles, via `Gio.AppInfo.get_supported_types` and a localsearch SPARQL query over `org.freedesktop.LocalSearch3`);
    - quick keys (stored in GSettings);
    - `/type` filters;
    - **Space for Quick Look** via the Sushi D-Bus API (`org.gnome.NautilusPreviewer.ShowFile`);
    - hold Super/Alt to show the path, and Up-arrow history;
    - **menu items of the focused app** from the app-menu providers (planned);
    - **open windows** from `DesktopModel`.
  - "Actions" can map to a small fixed catalogue (new note, timer, toggle Wi-Fi or Dark Style, screenshot, run a `.desktop` action from `Gio.DesktopAppInfo.list_actions()`). Every app's jump-list actions are real Linux "app intents".
- **Blockers / risks:**
  - No App Intents equivalent across apps.
  - localsearch may be disabled or limited to XDG folders.
  - Siri AI and LLM answers are out of scope; an optional local or remote LLM would be a privacy and EGO red flag, so skip it.
  - Clipboard rules from EGO apply (Kiwi already complies).
- **Linux equivalents today:** the GNOME overview search, Ulauncher, Albert, Raycast-like "Vicinae", KRunner, Pop Launcher, and the Spotlight-style Shell extensions "Search Light" and "Spotlight-like search".
- **Kiwi status:** have (apps, files via providers, settings, calculator, clipboard, web).
- **Recommendation:** Port (P1 core, already built). Extend it in P2 (**M**) with the Tahoe tabs, Tab-scoping, quick keys, Sushi preview and menu-item search. That last one is the killer feature.

### Notification Center and widgets
- **Introduced / changed:**
  - Mojave and Catalina: a two-tab sidebar (Today with widgets / Notifications).
  - **Big Sur:** redesigned as one column, with grouped notifications on top and iOS-style SwiftUI **widgets** below (S/M/L), plus Edit Widgets.
  - Monterey: Focus integration and time-sensitive alerts.
  - **Sonoma:** widgets on the **desktop** (drag them out of Notification Center), interactive widgets, iPhone widgets via Continuity, monochrome "dimmed" widgets when an app is in front, and "Click wallpaper to reveal desktop".
  - Sequoia: Apple Intelligence notification summaries (15.1+).
  - Tahoe: glass styling; low-battery and AirPods alerts moved into their menu-bar items; Live Activities in the menu bar.
  - **27:** an **Extra-Large Portrait** widget size, and widgets that update in **real time** while their app is open.
- **What it is:**
  - Opened by clicking the date/time, a 2-finger swipe from the right trackpad edge, Fn-N, or a hot corner.
  - **Notifications:**
    - grouped by app as expandable stacks;
    - hovering shows the ✕ and "Clear All";
    - inline actions;
    - per-app settings: Desktop / Notification Center / Lock Screen, Temporary or Persistent banners, badges, sounds, previews (Always / When Unlocked / Never), grouping (Automatic / By App / Off), time-sensitive and critical alerts;
    - global "Show previews", "Allow when display is sleeping / screen is locked / mirroring", and summarise.
  - **Banners** slide in at the top right.
  - **Widgets:** a gallery with search and categories. Widgets can be resized from the context menu (S/M/L/XL, and XL portrait in 27). On the desktop, widgets snap to a grid, dim to monochrome when windows are in front ("Dim widgets on desktop": Automatic / Always / Never), and hide in Stage Manager unless allowed.
- **Caveats (on macOS):**
  - Widgets require WidgetKit apps.
  - Desktop widgets overlap icons.
  - Summaries make mistakes.
  - Persistent banners pile up.
- **Port to GNOME 50:** mostly Shell extension.
  - Notifications: GNOME 48+ already **groups by app** in the message list (inside the date menu, next to the calendar). Kiwi can move that list into a right-side glass sheet opened from the clock (`Main.panel.statusArea.dateMenu`, `Calendar.MessageList`), restyle the banners (`Main.messageTray._bannerBin`) to slide in from the top right, and map the macOS per-app options onto GNOME's existing `org.gnome.desktop.notifications.application` keys (show-banners, enable-sound-alerts, show-in-lock-screen, details-in-lock-screen).
  - Widgets: GNOME has no widget platform, so Kiwi can offer **built-in** widgets only: clock and world clocks (`org.gnome.clocks` world-clocks, as the date menu reads), weather (libgweather, which the Shell imports already), calendar day/month (`Calendar`), battery (UPower), now playing (MPRIS), and system stats. Put them in the panel and, optionally, on the **desktop** as actors in `Main.layoutManager._backgroundGroup` (above the wallpaper, below windows), dimmed when a window is focused.
  - The notch already plans "mini widgets". Share widget code between them.
- **Blockers / risks:**
  - Third-party widgets would need a protocol (a D-Bus "widget provider" or HTML), which is a huge scope: skip.
  - The background-group actors must avoid input when windows cover them.
  - Desktop icons (DING extension) and widgets compete for the desktop.
  - Real-time updates mean every widget must be event-driven (no polling) to idle at 0 % CPU.
- **Linux equivalents today:** the GNOME date-menu notification list and the "Notification Banner Reloaded" extension; desktop widget extensions ("Desktop Clock", "Azclock"); KDE Plasma widgets; Conky.
- **Kiwi status:** partial (calendar card, the Control Center notifications fallback, notch mini widgets planned).
- **Recommendation:** Port (P2) for the Notification Center sheet and banner restyle, **M**. Built-in widgets in Notification Center and on the desktop come later (P3), **L**.

### Control Center
- **Introduced / changed:**
  - **Big Sur** introduced it: Wi-Fi, Bluetooth and AirDrop modules, Focus/Do Not Disturb, Keyboard Brightness, Screen Mirroring, Display, Sound and Now Playing, with optional Accessibility Shortcuts, Battery and Fast User Switching.
  - You can drag any module to the menu bar.
  - Monterey: Focus.
  - Ventura: Stage Manager tile.
  - **Tahoe:** iOS-18-style **customisable** Control Center.
    - An **Edit Controls** gallery with a sidebar, search and per-app groups.
    - Controls are resizable.
    - **Multiple Control Center panels** in the menu bar, each with one of 11 icons.
    - Any control can sit alone in the menu bar.
    - Third-party controls (WidgetKit Controls API).
    - New controls: timers, Shortcuts, tile windows, quick note, voice memo, Home scenes.
  - Tahoe also moved the **volume/brightness HUD** from mid-screen to small oblong sliders under the Control Center icon.
- **What it is:** a menu-bar glass panel of toggles and sliders; the Mac's version of Quick Settings.
- **Caveats (on macOS):**
  - Third-party controls were nearly absent at launch, caused by a refresh bug.
  - The panel is height-limited to about half a Studio Display.
  - The new HUD location took getting used to.
- **Port to GNOME 50:** Shell extension (Kiwi has a Control Center built on Quick Settings).
  - Add Edit mode (drag tiles in a grid; tile sizes 1×1, 2×1, 2×2), "pin a tile to the menu bar" (a small `PanelMenu.Button` per pinned tile), and multiple panels.
  - **Move GNOME's OSD** (`Main.osdWindowManager`) for volume and brightness to a small slider under the Control Center icon, as in Tahoe. This is a cheap, visible win.
  - Third-party tiles exist on GNOME as other extensions' `QuickSettings.SystemIndicator` items; Kiwi can show them in a "More" section.
- **Blockers / risks:** private Quick Settings internals (`_grid`, `_indicators`); conflicts with other Quick Settings extensions.
- **Linux equivalents today:** GNOME Quick Settings, the extensions "Quick Settings Tweaker" and "Quick Settings Audio Panel".
- **Kiwi status:** have.
- **Recommendation:** Port (P1 core, built). Add Edit Controls, pin-to-bar and the Tahoe HUD in P2, **M**.

### Window management: traffic lights, Zoom/Fill, minimize, Hide, tiling
- **Introduced / changed:**
  - Traffic lights since Aqua.
  - Since 2018:
    - Catalina's green-button hover menu (Enter Full Screen, Tile Left/Right of Screen).
    - Big Sur: rounder corners.
    - **Sequoia: native tiling.** Drag to edges and corners with a highlighted preview (⌥ while dragging shows it instantly), the green-button **Fill & Arrange** menu, Fn-Ctrl shortcuts, and "Tiled windows have margins".
    - Tahoe: rounder still, with a Move & Resize submenu (Fill, Center, halves, quarters, Return to Previous Size; arrangements Left & Right, Top & Bottom, Quarters, Left & Quarters …).
    - 27: stronger shadows on the active window, and better restoration after a display is unplugged.
- **What it is:**
  - **Red** closes the window (the app keeps running; a dot marks it in the Dock).
  - **Yellow** minimizes (⌘M; ⌥⌘M for all of the app's windows).
  - **Green:**
    - click: Full Screen, or Zoom in some apps;
    - ⌥-click: Zoom/Fill;
    - hover: the tiling menu, with Fill Fn-Ctrl-F, Center Fn-Ctrl-C, Left/Right/Top/Bottom Fn-Ctrl-arrows, Return to previous size Fn-Ctrl-R, Left & Right Fn-Ctrl-⇧-←, and so on.
  - Double-clicking the title bar does Fill, Zoom or Minimize (a setting).
  - The buttons show glyphs (×, −, ↔) when hovered over the cluster.
  - **Hide (⌘H)** hides all of an app's windows at once, without minimizing. The app vanishes until activated; "Hide Others" is ⌥⌘H.
  - Windows snap to each other's edges when dragged near them.
  - ⌥⌘W closes all of the app's windows; ⌘Q quits the app.
- **Caveats (on macOS):**
  - The Zoom vs Full Screen vs Fill semantics confuse people.
  - Quitting is separate from closing.
  - Tiling arrived very late and still has no saved layouts.
- **Port to GNOME 50:** Shell extension plus GTK settings (plan §5.7).
  - Traffic lights in the menu bar (Kiwi has them), or the apps' own buttons on the left via `org.gnome.desktop.wm.preferences button-layout 'close,minimize,maximize:'` (Kiwi's `ButtonLayoutOwner` saves and restores it). libadwaita respects it.
  - Tiling with a green-button hover menu on Kiwi's panel buttons, edge snapping with a preview (Mutter's own edge tiling plus Kiwi's quarter tiles via `Meta.Window.move_resize_frame`), shortcuts (Super+Ctrl+arrows, since Fn is not visible to the OS), and Return to Previous Size.
  - **Hide:** no Wayland concept exists, so emulate it. Minimize the app's windows with a Kiwi "hidden" flag in `WindowState`, use a no-animation path (not Genie), skip them in the Dock's minimized area, and restore all of them when the app is activated (Dock click, switcher, `Shell.App.activate`). This mirrors macOS faithfully.
  - Window-edge snapping (magnetic edges) through a grab-op handler in `Meta.Display` `grab-op-begin`. That is costly; do it later.
- **Blockers / risks:**
  - The colored traffic-light look inside apps' own headerbars would need GTK CSS, which the owner dropped, so the apps keep Adwaita's grey circles unless the user installs a theme.
  - Electron and Qt apps draw their own decorations.
  - Hide emulation must not fight Stage Manager (WindowState flags are already designed for this).
- **Linux equivalents today:** Mutter edge tiling (halves only), the extensions "Tiling Shell", "Tiling Assistant", "Forge" and "Pop Shell", the "Pixel Saver"/"Unite" style buttons-in-panel extensions.
- **Kiwi status:** partial (window controls in the panel, tiling and rounded corners exist; the green-button menu and Hide emulation are planned).
- **Recommendation:** Port (P1 core), **M**. Traffic lights plus the Fill & Arrange menu plus Hide are core Mac muscle memory.

### Full screen and Split View
- **Introduced / changed:**
  - Lion: full screen as its own Space.
  - El Capitan: Split View.
  - Catalina: green-button menu entries.
  - Monterey: "Automatically hide and show the menu bar in full screen".
  - Sequoia and Tahoe: Full Screen Tile (Left/Right of Screen) in the green menu.
- **What it is:**
  - Green button or Ctrl-⌘F: the window becomes its **own Space** next to the desktop. The menu bar and Dock auto-hide (reveal on edge hover).
  - Swiping left/right moves between Spaces.
  - Split View pairs two full-screen apps with a draggable divider. Pick the second app from the green menu ("Tile Window to Left/Right of Screen") or drag it in Mission Control.
- **Caveats (on macOS):**
  - Full-screen Spaces confuse multi-monitor users.
  - Many power users avoid full screen and use Fill instead.
- **Port to GNOME 50:** Shell extension.
  - `Meta.Window.make_fullscreen()` works for any app (GTK, Qt, Electron) because it is compositor-side.
  - Optionally move the window to a new workspace right after the current one and remove that workspace on exit. Kiwi's old `moveFullscreenWindow.js` did this; the overhaul dropped it as a "behaviour tweak", but it should **return as part of the macOS full-screen model**, off by default.
  - Split View: two windows on their own workspace, tiled 50/50 with a draggable divider (Kiwi's tiling engine) and the panel and dock hidden.
  - The menu bar reveal in full screen comes from the auto-hide work.
- **Blockers / risks:**
  - Some apps resize badly when made full-screen by the compositor.
  - Games and video players already handle F11.
  - Mutter's "unredirect" for full-screen windows interacts with Kiwi overlays (`setUnredirectAllowed` exists in `lib/compat.js`).
- **Linux equivalents today:** F11 per app; extensions that move full-screen windows to an empty workspace.
- **Kiwi status:** partial (a fullscreen-isolation flag exists in WindowState; the old feature is being removed).
- **Recommendation:** Port (P3), **M**. It completes the Mission Control model, and Split View is cheap once tiling exists.

### Quick Look
- **Introduced / changed:**
  - Leopard (2007).
  - **Mojave:** Quick Look **Markup** (annotate, sign, rotate, trim video) and Quick Actions in the window.
  - Ventura: Quick Look from Spotlight.
  - Sonoma–Sequoia: Live Text, Visual Look Up, Copy Subject.
  - Tahoe: folder-customisation glyphs appear in Quick Look.
  - 27.2: code for touch gestures.
- **What it is:**
  - Select a file and press **Space**: a floating, full-size preview of almost any file (images, PDFs, Office files, audio and video with scrubbing, 3D USDZ, fonts, code).
  - ←/→ browse a multi-selection; ⌘↩ shows an index grid; ⌥ gives a full-screen slideshow.
  - Rotate, Markup, Trim, Share, "Open with App", ⌘+/− zoom.
  - Works in Finder, the desktop, Mail and Spotlight. Third-party QL extensions add formats.
- **Caveats (on macOS):**
  - Plugin model changes (qlgenerator → app extensions in Catalina+) broke many old previewers.
  - Markup edits save in place.
- **Port to GNOME 50:** configure existing apps plus a small Shell integration.
  - **Sushi** (GNOME Files' previewer: Space in Nautilus) is the equivalent. It was revived (Sushi 50) and ported to **GTK4 in Sushi 51** (dark mode, overlay controls, adaptive sizing, shortcuts to rename, trash and open).
  - Kiwi can call it from **Spotlight** results and from Dock Stacks (Space) via `org.gnome.NautilusPreviewer` `ShowFile(uri, windowHandle, closeIfShown)`.
  - Markup is not part of Sushi; route "Markup" to Papers (PDF annotations in 50) or Gradia (images).
- **Blockers / risks:**
  - Sushi is a separate package (`sushi` on Fedora; usually installed with Nautilus).
  - The Wayland window handle for parenting is optional.
  - No system-wide "Space to preview" in other apps' file lists: GTK's file chooser has no previewer hook.
- **Linux equivalents today:** Sushi, GNOME Files' properties preview, KDE's Ark/Dolphin "Preview" panel, QuickLook-like "Kiview".
- **Kiwi status:** none.
- **Recommendation:** Theme or configure an existing app, with Sushi as a dependency (P2), **S**. Wire Space-to-preview into Spotlight and Stacks; never write a Kiwi previewer.

### Screenshot and Screen Recording toolbar (⇧⌘5)
- **Introduced / changed:**
  - **Mojave introduced the Screenshot app/toolbar and the floating thumbnail.**
  - Catalina–Sequoia: minor (HDR/SDR capture format later).
  - Tahoe: glass; screenshots searchable by text in Spotlight.
  - 27: "Shortcuts" automations triggered by taking a screenshot; ⇧⌘6 asks Siri about a selected area (with Siri AI).
- **What it is:**
  - ⇧⌘5 shows a bottom toolbar: capture the entire screen, a window or a selection; record the entire screen or a selection; Options (Save to Desktop/Documents/Clipboard/Mail/Messages/Preview/Other; Timer None/5/10 s; Microphone; Show Floating Thumbnail; Remember Last Selection; Show Mouse Pointer; HDR/SDR); then Capture or Record.
  - The selection frame can be moved and resized.
  - Shortcuts:
    - ⇧⌘3 captures the full screen;
    - ⇧⌘4 starts a crosshair selection (Space switches to a camera that captures a window with its shadow, ⌥ drops the shadow);
    - adding Ctrl copies the capture to the clipboard.
  - The **floating thumbnail** sits in the bottom right for a few seconds: swipe it away to save, drag it into a document, or click it for Markup or Trim.
  - Recording stops from the menu-bar ⏹ icon.
  - Files are PNG and MOV, named "Screenshot <date> at <time>".
- **Caveats (on macOS):**
  - There is no built-in system-audio capture for recordings (only a microphone); people use third-party apps.
  - Window shadows enlarge the PNGs.
- **Port to GNOME 50:** Shell extension, configuring and extending the Shell's own screenshot UI (GNOME 42+).
  - It already has screen/window/selection, screenshot vs screencast, show pointer, and saves to `~/Pictures/Screenshots` plus the clipboard.
  - Kiwi can:
    - bind ⇧Super-3/4/5 through the Shell keybindings (`org.gnome.shell.keybindings` `screenshot`, `screenshot-window`, `show-screenshot-ui`, `show-screen-recording-ui`), restoring them on disable;
    - restyle `Main.screenshotUI` as a bottom glass toolbar;
    - add a **Timer** option, injected into `ScreenshotUI` before `_saveScreenshot`;
    - add a **floating thumbnail** (an actor in the bottom right listening for the screenshot-taken notification or the `screenshot-taken` signal path, draggable with `DND`, click opening Gradia, Satty or Loupe);
    - add a recording ⏹ in the menu bar (GNOME already has a screencast indicator).
  - Audio in recordings: the Shell recorder has no audio (gnome-shell issue #5524). The extension "Screencast extra Feature" shows it can be done by changing the GStreamer pipeline. That is fragile; do it later.
- **Blockers / risks:**
  - `ScreenshotUI` internals are private.
  - A Shell-side GStreamer pipeline with PipeWire audio is brittle across versions.
  - Window shadows are not captured (Mutter captures without the shadow, which is arguably better).
- **Linux equivalents today:** the GNOME screenshot UI, Gradia (annotation, GNOME Circle in 50), Satty, Flameshot (limited on Wayland), Kooha (recording with audio via portal), OBS.
- **Kiwi status:** none.
- **Recommendation:** Port (P2), **M**. Shortcuts plus the toolbar restyle plus the floating thumbnail give 90 % of the feel; leave audio and Markup to Kooha and Gradia.

### Login window, lock screen, Setup Assistant (first run)
- **Introduced / changed:**
  - Big Sur: a new lock screen with a blurred wallpaper, user picture and name.
  - Sonoma: the lock screen moved to the **top clock** layout from iOS, with aerial screen-saver wallpapers that slow down into the desktop on login.
  - **Tahoe:** iOS-style **Clock Appearance** (6 fonts plus a weight slider) for the lock screen and screen saver; widgets-free; Liquid Glass "Tinted" makes Lock Screen notifications more opaque (26.1).
  - **27:** Golden Gate wallpapers animate on unlock.
  - Setup Assistant: language, Wi-Fi, Migration Assistant, Apple Account, FileVault (**on by default in Tahoe when signed in**), Touch ID, Screen Time, Siri, appearance (Light/Dark/Auto), "Make This Your New Mac" (Sonoma+).
- **What it is:** a calm, wallpaper-led login and lock (a large clock at the top, the avatar and password at the bottom), plus a friendly first-run that ends with the desktop "unfolding".
- **Caveats (on macOS):**
  - The clock size cannot be changed.
  - FileVault-by-default ties recovery to the Apple Account.
- **Port to GNOME 50:**
  - **Lock screen:** a Shell extension with `session-modes: ["user", "unlock-dialog"]` can restyle `UnlockDialog` and the clock (`Main.screenShield`): top clock layout, fonts and weights, blurred wallpaper. This also stops Kiwi from being torn down on every lock, which the code map flags.
  - **Login (GDM):** the `gdm` session mode works only for a **system-wide** extension enabled for the `gdm` user (`/usr/share/gnome-shell/extensions`, dconf for gdm). That is the installer's job, not EGO's. Keep it optional.
  - **Setup Assistant:** GNOME's `gnome-initial-setup` handles system first-run. Kiwi needs only a **Kiwi onboarding** (pick dock side, logo, glass level, gestures), which the plan already gives to the installer (§9) or a first-run page in `prefs.js`.
- **Blockers / risks:**
  - Running in `unlock-dialog` adds EGO scrutiny: no keyboard grabs, and nothing that can leak the session.
  - GDM theming is officially unsupported and can break login if wrong.
  - Making an extension run at the lock screen needs care so the clipboard and Spotlight never open there (Kiwi already closes Spotlight on lock).
- **Linux equivalents today:** GDM settings tools ("GDM Settings" app on Flathub), lock-screen extensions (blur level, clock styling).
- **Kiwi status:** none.
- **Recommendation:**
  - The lock-screen restyle: Port (P3), **M**.
  - Kiwi onboarding: Port (P7, with the installer), **S**.
  - GDM: Later (P3, installer-only), **M**.
  - Setup Assistant itself: Skip.

### System Settings
- **Introduced / changed:**
  - **Ventura replaced System Preferences** (an icon grid) with **System Settings**: an iOS-like sidebar app with searchable panes; widely criticised at first for lost density.
  - Sonoma–Tahoe refined it: Tahoe added **Menu Bar** and **Spotlight** pages, the **Appearance** page with themes (Color, Text highlight, Folder color, Icon & widget style: Default / Dark / Clear / Tinted) and **Liquid Glass** (Clear/Tinted in 26.1, a slider in 27).
- **What it is:** one app with a sidebar of categories (Apple Account; Wi-Fi; Bluetooth; Network; Notifications; Sound; Focus; Screen Time; General; Appearance; Accessibility; Control Center/Menu Bar; Siri & Spotlight; Privacy & Security; Desktop & Dock; Displays; Wallpaper; Screen Saver; Battery; Lock Screen; Touch ID & Password; Users & Groups; Passwords; Internet Accounts; Game Center; Wallet; Keyboard; Mouse/Trackpad; Printers & Scanners). It is searchable and highlights the matching control.
- **Caveats (on macOS):** settings moved between versions; search sometimes finds a pane but not the control.
- **Port to GNOME 50:** configure the existing app plus Kiwi's prefs.
  - GNOME **Settings** (gnome-control-center) is already a sidebar app with search and almost the same structure.
  - It has **no plugin API**, so Kiwi cannot add panes. Kiwi's own preferences window (Adw, separate process) should copy the macOS structure (Desktop & Dock, Menu Bar, Control Center, Appearance/Glass, Spotlight, Mission Control, Trackpad gestures, Keyboard …) as plan §6 says.
  - Kiwi's Spotlight settings catalogue should index both GNOME Settings panels (`gnome-control-center <panel>`) and Kiwi prefs pages.
  - The logo menu's "System Settings…" opens GNOME Settings, and a second entry, "Desktop & Dock…", opens Kiwi prefs.
- **Blockers / risks:**
  - Two settings apps instead of one, unavoidable.
  - Prefs is a separate process (no Shell imports).
- **Linux equivalents today:** GNOME Settings, GNOME Tweaks, Refine (a Tweaks successor).
- **Kiwi status:** partial (Kiwi prefs exist; regrouping is planned).
- **Recommendation:** Theme or configure the existing app (no work on GNOME Settings) plus Kiwi prefs in the macOS layout (P0/P1), **S**.

### Keyboard conventions: ⌘ shortcuts, Fn/Globe, text replacement, Character Viewer
- **Introduced / changed:**
  - ⌘ semantics are 40 years old.
  - Catalina/Big Sur era: the **Globe key** on Apple keyboards (2021) shows emoji, switches input source, or starts dictation.
  - Monterey: Fn-shortcuts (Fn-E emoji, Fn-A Dock, Fn-C Control Center, Fn-N Notification Center, Fn-Q Quick Note, Fn-F full screen …).
  - Sequoia: Fn-Ctrl tiling keys.
  - Tahoe: Fn-⇧A opens Apps.
  - 27: ⇧⌘Space opens Visual Intelligence.
  - Text replacements sync through iCloud.
- **What it is:**
  - **⌘ shortcuts:** ⌘ is the app-command modifier, distinct from Ctrl (which terminals keep). The full list is on Apple's "Mac keyboard shortcuts" page.
    - Editing and documents: ⌘C/V/X/Z, ⇧⌘Z, ⌘A/F/G, ⌘O/S/P/N/T/W, ⌥⌘W, ⌘, (Settings).
    - App and window control: ⌘H, ⌥⌘H, ⌘M, ⌘Q, ⌥⌘Esc (Force Quit), ⌘Tab, ⌘`.
    - Spotlight and Character Viewer: ⌘Space (Spotlight), ⌃⌘Space (Character Viewer), ⌃⌘F (full screen).
    - Screenshots: ⇧⌘3/4/5.
    - Session: ⌃⌘Q (lock), ⇧⌘Q (log out).
    - Finder: ⌘1–4 (views), ⌘I (Get Info), ⌘Delete (Trash), ⇧⌘G (Go to Folder), ⇧⌘. (show hidden files), ⌥⌘P/S (path bar and sidebar), ⇧⌘N (new folder).
  - **Fn/Globe:** "Press 🌐 to: Change Input Source / Show Emoji & Symbols / Start Dictation / Do Nothing". Pressing it twice opens the Character Viewer.
  - **Text replacement:** Keyboard ▸ Text Replacements (e.g. "omw" → "On my way!"), plus smart quotes and dashes, double-space period, autocorrect and capitalisation, inline predictive text. It works in Cocoa text views, but not in Electron or terminals.
  - **Character Viewer:** a compact emoji popover with search, skin tones and recents. It expands into a full viewer with categories (Arrows, Currency, Math, Latin …), favourites and font variations. The Keyboard Viewer shows the current layout.
- **Caveats (on macOS):**
  - Text replacements are app-dependent.
  - The Globe key exists only on Apple keyboards.
  - ⌘ vs Ctrl confusion when switching to Linux or Windows.
- **Port to GNOME 50:**
  - **⌘ semantics:** a system tool, outside the Shell. On Wayland the Shell cannot remap keys for apps.
    - Options: **keyd** (a root daemon, per-app rules impossible on Wayland without a helper); **Toshy**/**xremap** (user-level via uinput, can read the focused app from a Shell D-Bus helper and has terminal exceptions); or the simple xkb option `ctrl:swap_lwin_lctl` in `org.gnome.desktop.input-sources xkb-options`, which makes the key in the ⌘ position send Ctrl.
    - Kiwi can offer the xkb toggle (saved and restored) and **show ⌘-style glyphs** in its menus (plan §10 Q4).
  - **Fn/Globe:** the PC Fn key never reaches the OS (it is handled in keyboard firmware). Map "Globe" to Super-tap (Kiwi already uses it for Spotlight) or Super+Space (GNOME input switch).
  - **Character Viewer:** **GNOME Characters** (app plus a search provider in Spotlight) and the **GTK emoji chooser** (Ctrl+. or Ctrl+; in GTK text fields), plus IBus emoji (Super+.).
    - A Shell-level emoji popover (Ctrl+Super+Space) can insert by setting the clipboard and synthesising Ctrl+V through `Clutter.VirtualInputDevice`, the same mechanism as Kiwi's Quick Paste.
    - Restore the user's clipboard afterwards.
  - **Text replacement:** needs an **IBus engine** or an input-method helper (an out-of-process Rust or Vala companion). A Shell extension must not watch all keystrokes (EGO privacy rules). espanso exists but is unreliable on GNOME Wayland.
- **Blockers / risks:**
  - The Wayland security model means no global key remapping or text expansion from the Shell.
  - keyd and Toshy need root or the `input` group, so they are installer territory.
  - Synthesised paste fails in apps without Ctrl+V (terminals use Ctrl+Shift+V; Kiwi's clipboard already handles the terminal chord).
- **Linux equivalents today:** keyd, Toshy, Kinto, xremap, input-remapper; GNOME Characters; the "Emoji Copy" and "Smile" emoji pickers; ibus-typing-booster; espanso.
- **Kiwi status:** partial (Super toggles Spotlight; the Quick Paste injection mechanism exists).
- **Recommendation:**
  - ⌘ glyphs plus the optional xkb toggle: Port (P1), **S**.
  - Emoji/Character popover: Port (P2), **S**.
  - keyd/Toshy profile shipped by the installer: Later (P3), **M**.
  - Text replacement: Skip in the Shell; Later as an IBus companion, **L**.

### Sounds and haptics
- **Introduced / changed:**
  - Big Sur: the **startup chime returned** ("Play sound on startup"), and the UI sounds were remastered.
  - Monterey and later: minor.
  - Tahoe: refreshed alert sounds alongside the design (minor).
- **What it is:**
  - Sound settings: Alert sound (Boop, Breeze, Bubble, Crystal, Funky, Heroine, Jump, Mezzo, Pebble, Pluck, Pong, Sonar, Sonumi, Submerge …) and alert volume; Play sound on startup; **Play user-interface sound effects** (emptying the Trash, the screenshot shutter, dragging to the Dock, a "poof" on removal); Play feedback when volume is changed (a "pop").
  - Haptics: **Force Touch trackpads** click by vibration (adjustable click firmness, "Silent clicking"). They give haptic ticks when guides snap in apps, when Force Clicking, and at alignment points in Keynote or Finder.
- **Caveats (on macOS):** the sounds are Apple-copyrighted; haptics need Apple hardware.
- **Port to GNOME 50:** Shell extension plus original assets.
  - The Shell plays sounds with `global.display.get_sound_player().play_from_theme()`/`play_from_file()`. Hook Kiwi events: emptying the Trash (via a Gio monitor of `trash:///` in the dock), the screenshot shutter (GNOME has one), dock remove-poof, volume-feedback pop (GNOME's `volume-change` sound already exists via `org.gnome.desktop.sound` `event-sounds`).
  - The alert sound is selectable in GNOME Settings ▸ Sound (a few built-ins).
  - Kiwi **must ship its own original sounds** (CC0 or commissioned), never Apple's.
  - Haptics: skip.
- **Blockers / risks:** asset licensing; users who disable event sounds (honour `event-sounds`).
- **Linux equivalents today:** freedesktop sound themes, GNOME's alert-sound picker.
- **Kiwi status:** none.
- **Recommendation:** Later (P3), **S**. Small polish once the dock and screenshots exist. Haptics: Skip.

### Accessibility features that define the feel
- **Introduced / changed:**
  - Catalina: Voice Control.
  - Big Sur: Reduce Transparency expanded.
  - Monterey: Live Text, pointer colours.
  - Ventura: Live Captions.
  - Sonoma: Personal Voice.
  - Sequoia: Vocal Shortcuts, Eye Tracking (iOS), Hover Typing.
  - **Tahoe:** Magnifier for Mac (iPhone camera), Accessibility Reader (⌘Esc), Braille Access, Vehicle Motion Cues, **Reduce Transparency** turning off most Liquid Glass.
  - **27:** **Show Borders** (outline controls on translucent surfaces).
- **What it is:**
  - The settings that shape how macOS feels: **Reduce Motion** (cross-fades instead of the Space slide and zoom; also tames Genie and Mission Control), **Reduce Transparency**, **Increase Contrast**, Differentiate without colour, Shake mouse pointer to locate, Display contrast, Hover Text, Zoom (scroll with modifier, picture-in-picture), VoiceOver, Spoken Content, Live Captions, Sticky/Slow Keys, Full Keyboard Access.
  - The Accessibility Shortcuts panel opens with ⌥⌘F5 or a triple-press of Touch ID.
- **Caveats (on macOS):** Reduce Motion leaves some animations; the Liquid Glass complaints led to the 26.1 Tinted option and the 27 slider.
- **Port to GNOME 50:** Shell extension, honouring GNOME's settings.
  - GNOME 50 adds a **Reduced Motion** accessibility option (alternative animations, distinct from the old `enable-animations` performance toggle; proxied to apps through the settings portal). Kiwi's `lib/compat.js` already has `reducedMotion`/`watchReducedMotion`; it must read the new key and swap Genie for a cross-fade and Mission Control zoom for a fade.
  - GNOME's **High Contrast** maps to Kiwi's solid "high contrast" glass. Kiwi's own "Reduce transparency" plus a **Show Borders** (1 px outlines on glass) copies Tahoe/27.
  - Locate pointer (Ctrl), Zoom, Orca, Sticky Keys and the screen keyboard are stock GNOME. Kiwi just must not break them: keep Spotlight and the menus accessible with `accessible_name` on every actor, and keyboard navigation.
- **Blockers / risks:** the new reduced-motion key name must be confirmed against gsettings-desktop-schemas 50 before coding (the research did not confirm it).
- **Linux equivalents today:** GNOME Settings ▸ Accessibility, Orca, Live Captions (Flathub), Speech Note.
- **Kiwi status:** partial (reduced-motion helper; glass variants planned).
- **Recommendation:** Port (P1 core, as a rule for every feature), **S**. Accessibility parity is a correctness requirement, not a feature.

---

## Part B: Bundled apps

### Finder (sidebar, tags, views, Gallery, Quick Actions, path bar, spring-loading, Get Info)
- **Introduced / changed:**
  - **Mojave:** **Gallery View** (replacing Cover Flow), a full-metadata **Preview pane**, **Quick Actions** (rotate, markup, create PDF, custom Automator actions), **Desktop Stacks** (group desktop files by kind, date or tag).
  - Catalina: iOS device sync moved into Finder (iTunes was split).
  - Big Sur: redesign.
  - Monterey: Quick Actions from Shortcuts.
  - Ventura/Sonoma: minor; "Remove Background" Quick Action (Sonoma).
  - **Tahoe:** Liquid Glass toolbar (button groups always visible); **folder customisation** (a colour per folder, SF Symbol or emoji glyph via right-click ▸ Customize Folder…; a system-wide default folder colour in Appearance); folder icons show whether they are empty, with a fill animation; a new Finder icon.
  - **27:** **column auto-size and reset** (right-click the bottom of a column), cleaner windows, Apple Intelligence **suggested file and folder names**, faster SMB/NAS browsing.
- **What it is:**
  - **Views:** Icon ⌘1, List ⌘2 (disclosure triangles, sortable columns), **Column ⌘3** (Miller columns, the Mac signature for deep trees), Gallery ⌘4 (large preview, a filmstrip, metadata, Quick Actions).
  - **Sidebar:**
    - Favorites (Recents, Applications, Desktop, Documents, Downloads, AirDrop, Home);
    - iCloud (Drive, Shared);
    - Locations (this Mac, disks, network, servers);
    - **Tags** (7 colour tags plus named tags).
  - **Toolbar:** back/forward, view switcher, Group By, Share, **Tags**, Action menu, search (Spotlight scoped to "This Mac" or the current folder; saving it makes a **Smart Folder**).
  - **Path bar** (⌥⌘P) at the bottom, with drag targets; the status bar (⌘/) shows the item count and free space; tabs (⌘T); ⌘-click the title shows the path menu.
  - **Spring-loaded folders:** drag an item over a folder and it opens after a delay. Press Space to open it now; this also works in the sidebar and Dock stacks. Set the delay in Accessibility ▸ Pointer Control.
  - **Tags:** Ctrl-1…7 toggle the favourite tags and Ctrl-0 clears them. They work in Save dialogs and are searchable, sortable and groupable. They are stored as `com.apple.metadata:_kMDItemUserTags` xattrs and sync via iCloud.
  - **Get Info (⌘I):** General (kind, size, where, created/modified, Stationery pad, Locked), More Info (metadata), Name & Extension, Comments, **Open with ▸ Change All…**, Preview, **Sharing & Permissions**. Paste an image onto the icon to set a custom icon. ⌥⌘I gives a live **Inspector** for the selection.
  - **Also:** Go to Folder ⇧⌘G (path completion), Connect to Server ⌘K, ⌥⌘V to move (cut-and-paste), ⌘Delete to Trash, show hidden files ⇧⌘., batch rename, Compress, Quick Look Space, "Put Back" from the Trash, iCloud Optimize Storage.
- **Caveats (on macOS):**
  - There is no real "cut".
  - Column widths got auto-size only in 27.
  - Folder colours do not show in the sidebar, Dock, aliases or Spotlight.
  - The Tahoe glass toolbar is more transparent in icon view without tabs (MacStories).
- **Port to GNOME 50:** configure an existing app (**Nautilus / GNOME Files 50**) plus a **Nautilus extension** shipped by the installer.
  - **What Files 50 has:** grid and list views, sidebar (bookmarks, Starred, Recent, Network, Trash, Other Locations), an always-on editable path bar (case-insensitive completion in 50), tabs, built-in compress and extract, the **reworked batch rename** (50), **pop-out Properties windows** (50), grid-view captions (up to 3 extra info rows, 50), multiple type filters in search (50), Sushi (Space), and drag-hover opening in the path bar.
  - **What is missing:**
    - **Column view** (there are only unofficial Miller-column patches for 49/50);
    - Gallery view, and a Preview pane with metadata;
    - **tags** (GNOME has "Starred" only; tag work in Nautilus stalled years ago);
    - folder colours;
    - Get Info's Open-with "Change All" (Properties has an "Open With" page, which is close);
    - a Quick Actions menu.
  - **What Kiwi can do:**
    - Set GSettings (`org.gnome.nautilus.preferences`: default view, sort, `show-create-link`, list-view columns), restoring them on uninstall.
    - Ship a **nautilus-python extension** (MenuProvider, InfoProvider for emblems, ColumnProvider, `Nautilus.PropertiesModelProvider` for a Get-Info-style page) that adds:
      - **colour tags**, stored in the freedesktop `user.xdg.tags` xattr, shown as coloured emblems with a Tags column and a right-click colour row;
      - **folder colours** through the `metadata::custom-icon` GIO metadata attribute, which Nautilus honours, pointing at Kiwi-generated tinted folder icons;
      - **Quick Actions:** Rotate, Convert Image (via glycin or `gdk-pixbuf`), Create PDF (via `img2pdf` or Papers), Remove Background (only if a local tool exists);
      - "Open with ▸ Change All" (`Gio.AppInfo.set_as_default_for_type`).
    - **Tag search** in Kiwi Spotlight needs localsearch to index `user.xdg.tags`; that is unverified, so a Kiwi-side xattr scan of a recent-files list is the fallback.
  - **Column view:** do not fork Nautilus. Either wait upstream, or recommend a different file manager.
- **Blockers / risks:**
  - Nautilus extensions run **in the Nautilus process** (Python). They need the `nautilus-python` package, cannot add views or sidebar sections, and Nautilus can break them between releases.
  - EGO forbids the Shell extension from installing them, so they go through the installer.
  - xattrs are lost on some file systems (FAT/exFAT, some cloud folders).
  - Kiwi must never write into user folders without consent: tags are user-initiated, which is fine.
- **Linux equivalents today:** Nautilus (Files), Nemo, Dolphin (has a Miller-like column mode, tags via Baloo, Information panel), Thunar, the Miller-columns patches, nautilus-python extensions (Folder Color, nautilus-admin, Actions for Nautilus).
- **Kiwi status:** none (the Spotlight file search exists).
- **Recommendation:** Theme or configure the existing app plus a companion Nautilus extension (P3), **L**. Tags, folder colours and Quick Actions are the Finder features users notice. Column and Gallery views are Skip unless upstream adds them.

### Preview
- **Introduced / changed:**
  - Mojave: Markup in Quick Look, shared with Preview.
  - Catalina–Sequoia: steady additions (Live Text, Copy Subject, form filling, signatures from iPhone).
  - **Tahoe:** Liquid Glass, menu icons, **"Use Dark Appearance for PDF"**; Preview also arrived on iPhone and iPad (iOS 26).
  - 27: minor.
- **What it is:**
  - Image and PDF viewer-editor.
  - **PDF:** thumbnails sidebar (drag to **reorder, delete or insert pages**, **merge PDFs** by dragging thumbnails between documents), annotations (highlight, notes, shapes, text, **signatures** from the trackpad, camera or iPhone), form filling, password protection, export, OCR text selection.
  - **Images:** crop, rotate, **Adjust Size**, **Adjust Color**, **Instant Alpha** background removal, Export As (format conversion, HEIC→JPEG), batch export of multiple images.
- **Caveats (on macOS):** in-place saving surprises people (Versions instead of Save As); it is slow with huge PDFs.
- **Port to GNOME 50:** configure existing apps.
  - **Papers** (the default Document Viewer since GNOME 49): GNOME 50 overhauled annotations (text notes, lines, highlights, colours, eraser); signatures are in progress (an Outreachy project).
  - **Loupe** (Image Viewer): viewing, zoom, rotate; GNOME 49 sandboxed image loading through glycin.
  - Gaps are filled by other apps: **PDF Arranger** for page reorder and merge, **Gradia** or Satty for image markup, **Switcheroo** or Converter for format conversion, **Pinta** for adjust size and colour.
  - Kiwi makes Papers and Loupe the defaults (`xdg-mime`, saved and restored) and links "Open in…" from Quick Look and Quick Actions.
- **Blockers / risks:** no single app matches Preview; it is several apps.
- **Linux equivalents today:** Papers, Loupe, PDF Arranger, Xournal++, Okular (KDE, closest single app to Preview), Gradia, Pinta.
- **Kiwi status:** none.
- **Recommendation:** Theme or configure existing apps (P3), **S**. Recommend the set; do not build a Preview clone.

### Activity Monitor
- **Introduced / changed:** stable. The tabs are CPU / Memory (pressure graph) / Energy (Energy Impact, App Nap) / Disk / Network, plus a GPU History window. Apple silicon added GPU, ANE and "% GPU" columns; Tahoe brought glass.
- **What it is:**
  - A process list with hierarchical view.
  - Inspect a process: open files, ports, sample, spindump.
  - Quit or Force Quit; Dock-icon live graphs; a menu-bar CPU history.
  - **Force Quit Applications** (⌥⌘Esc) is a separate, simpler window listing GUI apps.
- **Caveats (on macOS):** the Energy Impact numbers are opaque.
- **Port to GNOME 50:**
  - **Configure an existing app.** **Mission Center** (GTK4/libadwaita, Rust, Flathub) is the closest Activity Monitor. It shows apps grouped with their processes, services, and CPU/RAM/disk/network/GPU/fan pages. Resources (GNOME Circle) and the stock GNOME System Monitor also work.
  - **Shell part:** build **Force Quit…** in the Shell (logo menu and ⌥Super-Esc). List `Shell.AppSystem.get_running()`, quit with `Shell.App.request_quit()`, and force with `Meta.Window.kill()` on the app's windows. Flag "not responding" apps from Mutter's `Meta.Window` unresponsive state (the Shell's close-dialog path).
- **Blockers / risks:** Mission Center is not on the Fedora default install (Flathub); killing non-window processes from the Shell needs `Gio.Subprocess` `kill`, so keep to windows.
- **Linux equivalents today:** Mission Center, Resources, GNOME System Monitor, btop.
- **Kiwi status:** none (Force Quit is in the planned logo menu).
- **Recommendation:**
  - Force Quit dialog: Port (P1, part of the menu bar), **S**.
  - Activity Monitor itself: recommend Mission Center (P3), **S**.

### Disk Utility
- **Introduced / changed:** the El Capitan redesign; APFS volumes and snapshots (High Sierra+); minor since; glass in Tahoe.
- **What it is:** disks and volumes, First Aid, Erase (APFS/HFS+/ExFAT/FAT), Partition, Restore, disk images (create, encrypted DMG), RAID set assistant, Mount/Unmount, Info.
- **Caveats (on macOS):** destructive operations are easy to trigger; the APFS container model confuses people.
- **Port to GNOME 50:** configure an existing app. **GNOME Disks** covers format, partition, image create and restore, SMART, benchmark, and mount options.
- **Blockers / risks:** none for Kiwi.
- **Linux equivalents today:** GNOME Disks, GParted, KDE Partition Manager.
- **Kiwi status:** none.
- **Recommendation:** Skip (use GNOME Disks), **–**.

### Font Book
- **Introduced / changed:** Ventura redesign (gallery grid, info panel); Tahoe glass.
- **What it is:** install, validate and disable fonts; collections; preview sizes and custom text; character repertoire; download system fonts on demand.
- **Caveats (on macOS):** font cache issues are rare now.
- **Port to GNOME 50:** configure an existing app. **GNOME Fonts** (gnome-font-viewer) previews and installs fonts. **Font Downloader** gets Google Fonts. Characters shows a font's glyphs.
- **Blockers / risks:** no disable/collection management (fontconfig can do it; there is no GUI).
- **Linux equivalents today:** GNOME Fonts, Font Manager (collections, disable), Font Downloader.
- **Kiwi status:** none.
- **Recommendation:** Skip (point to Font Manager), **–**.

### Terminal
- **Introduced / changed:** almost untouched for 20 years until **Tahoe**: a new settings window, **new themes**, **24-bit colour**, **Powerline glyphs**, and Liquid Glass.
- **What it is:** a tabbed zsh terminal with profiles (Basic, Pro, Homebrew …), split pane (horizontal only), window groups, Secure Keyboard Entry, and Marks/bookmarks.
- **Caveats (on macOS):** power users prefer iTerm2, Ghostty or Warp.
- **Port to GNOME 50:** configure an existing app. **Ptyxis** (Fedora's default since 41) already has profiles, tabs, container integration and transparency. GNOME Console is the minimal alternative. Kiwi could ship a "Kiwi" palette as an **optional** Ptyxis profile via the installer (`org.gnome.Ptyxis` dconf), not from the extension.
- **Blockers / risks:** a terminal paste chord (Ctrl+Shift+V) breaks ⌘-style expectations (see Keyboard).
- **Linux equivalents today:** Ptyxis, Console, Ghostty, Kitty, WezTerm.
- **Kiwi status:** none.
- **Recommendation:** Skip (Ptyxis is fine), **–**.

### TextEdit
- **Introduced / changed:** stable; glass in Tahoe; 27 adds Apple Intelligence name suggestions.
- **What it is:** an RTF/plain-text editor with rich formatting, tables and lists, opening .docx/.odt, autosave and Versions.
- **Caveats (on macOS):** rich text by default trips people up.
- **Port to GNOME 50:** configure an existing app: **GNOME Text Editor** (plain text, autosave, sessions). There is no rich-text equivalent in core; LibreOffice Writer covers it.
- **Blockers / risks:** none.
- **Linux equivalents today:** Text Editor, Apostrophe (Markdown), LibreOffice.
- **Kiwi status:** none.
- **Recommendation:** Skip, **–**.

### Calculator
- **Introduced / changed:** **Sequoia redesigned it**: a resizable window, **History**, **unit conversions** across 20+ categories, **Math Notes** integration, and Basic / Scientific / Programmer modes. Tahoe brought glass.
- **What it is:** a calculator with a tape/history, conversions and Programmer mode, plus Spotlight's inline calculator.
- **Caveats (on macOS):** Math Notes needs Apple Intelligence-free iCloud Notes.
- **Port to GNOME 50:** configure an existing app.
  - **GNOME Calculator** has Basic/Advanced/Financial/Programmer modes, history, currency and unit conversion, and a search provider.
  - Kiwi Spotlight already calculates; add unit and currency conversion through the Calculator search provider (`gnome-calculator --search-provider`).
- **Blockers / risks:** none.
- **Linux equivalents today:** GNOME Calculator, Qalculate!.
- **Kiwi status:** partial (the Spotlight calculator).
- **Recommendation:** Skip the app; Spotlight conversions are P2 (**S**).

### Notes
- **Introduced / changed:**
  - Catalina: gallery view and shared folders.
  - Big Sur: pinned and smart search.
  - **Monterey:** **Quick Note** (Fn-Q / the bottom-right hot corner, a floating note linked to the app or webpage you are in), tags, mentions.
  - Ventura: Smart Folders.
  - Sequoia: Math Notes, audio transcription, collapsible headings.
  - **Tahoe:** **Markdown import/export**, call recordings and transcripts saved into Notes.
  - **27:** a native **drawing tool** (8 brushes).
- **What it is:** an iCloud-synced rich notes app with checklists, tables, scans, attachments, links and locked notes.
- **Caveats (on macOS):** iCloud-only sync (or IMAP); the export story was poor before Tahoe's Markdown.
- **Port to GNOME 50:** configure an existing app.
  - GNOME has no core notes app. Good options: **Iotas** (GNOME Circle, Markdown, Nextcloud Notes sync) and **Folio**.
  - Kiwi's **Quick Note** hot corner and Spotlight action can open the user's chosen notes app with a new note.
  - A notch "quick note" field that appends to a Markdown file is a later idea.
- **Blockers / risks:** no shared notes API across apps.
- **Linux equivalents today:** Iotas, Folio, Notes (Joplin, Obsidian, Standard Notes).
- **Kiwi status:** none.
- **Recommendation:**
  - The app: Skip (recommend Iotas).
  - Quick Note hot corner and shortcut: Port (P2), **S**.

### Reminders
- **Introduced / changed:**
  - **Catalina redesign:** smart lists (Today, Scheduled, Flagged, All), subtasks, attachments.
  - Monterey: tags and custom smart lists.
  - Ventura: pinned lists and templates.
  - Sonoma: grocery auto-categories, Kanban columns, and reminders shown in Calendar.
  - Tahoe: Apple Intelligence **auto-categorise** any list.
  - 27: natural-language entry.
- **What it is:** a to-do app with location and time alerts, syncing via iCloud/CalDAV.
- **Caveats (on macOS):** iCloud lock-in for the newest features.
- **Port to GNOME 50:** configure existing apps: **Errands** (GTK4, CalDAV/Nextcloud) or **Endeavour** (formerly GNOME To Do, with GOA). The notch "Now" tab could show the next due task through Evolution Data Server (EDS) task lists, the same backend the Shell calendar uses.
- **Blockers / risks:** EDS task access from the Shell is possible (the Shell already uses EDS for events); keep it read-only.
- **Linux equivalents today:** Errands, Endeavour, Planify.
- **Kiwi status:** none.
- **Recommendation:** Skip the app; due tasks in the notch or Notification Center are Later (P3), **S**.

### Calendar
- **Introduced / changed:** Big Sur glass; Ventura; Sonoma (reminders in Calendar); Tahoe glass; 27 natural-language events and swipe to refresh.
- **What it is:** day/week/month/year views, multiple accounts (iCloud, Google, Exchange, CalDAV), invitations, travel time, a menu-bar date in Notification Center widgets.
- **Caveats (on macOS):** Exchange support is weak.
- **Port to GNOME 50:** configure an existing app: **GNOME Calendar** (GNOME 50 added an attendee list, a redesigned quick add, ICS export, a month-view polish and first day of week) with **GNOME Online Accounts**. Kiwi's calendar card and notch "next event" read the same EDS data.
- **Blockers / risks:** none.
- **Linux equivalents today:** GNOME Calendar, Evolution, Thunderbird.
- **Kiwi status:** partial (calendar card).
- **Recommendation:** Skip the app; keep the Kiwi calendar card (P1, exists).

### Contacts
- **Introduced / changed:** stable; Tahoe glass and contact posters.
- **What it is:** an address book synced by iCloud/CardDAV/Exchange, groups, Me card, vCard import/export.
- **Caveats (on macOS):** none of note.
- **Port to GNOME 50:** configure an existing app: **GNOME Contacts** with GOA and EDS. The Contacts search provider already feeds Spotlight.
- **Blockers / risks:** none.
- **Linux equivalents today:** GNOME Contacts, Evolution.
- **Kiwi status:** none (the Spotlight provider covers search).
- **Recommendation:** Skip, **–**.

### Mail
- **Introduced / changed:**
  - Monterey: Mail Privacy Protection, Hide My Email.
  - **Ventura:** scheduled send, undo send, remind me, follow-up.
  - Sequoia: categories (on iOS first), Apple Intelligence summaries and Smart Reply.
  - Tahoe: glass.
  - 27: relevance-ranked search, smart replies in your own style, Write with Siri.
- **What it is:** a multi-account IMAP/Exchange client with smart mailboxes, rules, VIP, Markup in attachments, and badge counts in the Dock.
- **Caveats (on macOS):** Exchange quirks; AI features are region-limited.
- **Port to GNOME 50:** configure existing apps: **Geary** (simple, GOA), **Evolution** (full, Exchange via EWS) or **Thunderbird** (Flathub/rpm). The dock should show their unread badges via LauncherEntry (Thunderbird supports it).
- **Blockers / risks:** none for Kiwi.
- **Linux equivalents today:** Geary, Evolution, Thunderbird.
- **Kiwi status:** none.
- **Recommendation:** Skip, **–**.

### Photos
- **Introduced / changed:**
  - Catalina: Days/Months/Years.
  - Ventura: Shared Library.
  - **Sequoia:** a single-scroll redesign.
  - Tahoe: Library and Collections tabs come back; glass with very transparent controls (criticised).
  - **27:** Reframe, Extend (generative), better Clean Up, **keywords and star ratings**, full-resolution Shared Albums, video-frame-to-still.
- **What it is:** an iCloud photo library manager with faces, places, memories and non-destructive edits.
- **Caveats (on macOS):** iCloud ties; heavy AI features with usage limits.
- **Port to GNOME 50:** configure an existing app: **Shotwell** (library, import, tags, basic edits) or **digiKam**. **Loupe** is for viewing. GNOME Photos is no longer a core app.
- **Blockers / risks:** none for Kiwi.
- **Linux equivalents today:** Shotwell, digiKam, darktable, Immich (self-hosted cloud).
- **Kiwi status:** none.
- **Recommendation:** Skip, **–**.

### Music
- **Introduced / changed:**
  - **Catalina split iTunes** into Music, TV and Podcasts (with device sync moving to Finder).
  - Big Sur: Listen Now.
  - Tahoe: Liquid Glass with the **playback controls moved to a transparent bottom pill** (criticised on Mac), AutoMix (26.1 over AirPlay).
- **What it is:** a library plus Apple Music streaming, playlists, lyrics, a mini player, and Now Playing in Control Center and the menu bar.
- **Caveats (on macOS):** Apple Music subscription push.
- **Port to GNOME 50:** configure existing apps: **GNOME Music**, **Rhythmbox**, **Amberol** (simple), **Decibels** (GNOME's audio player since 48). Kiwi's part is **MPRIS** integration (the notch "Now", the Control Center Now Playing, and the lock screen, which GNOME 49 already shows).
- **Blockers / risks:** none.
- **Linux equivalents today:** the above, plus Spotify and Cider (Apple Music client).
- **Kiwi status:** have (MPRIS in the Control Center and notch).
- **Recommendation:** Skip the app; MPRIS is done.

### Clock
- **Introduced / changed:** **Ventura added a Clock app to the Mac** (World Clock, Alarms, Stopwatch, Timers); Sonoma added multiple timers; Tahoe added a custom snooze (1–15 min) and timers in Control Center.
- **What it is:** an iOS-style clock app whose alarms and timers appear as notifications and, in Tahoe, as menu-bar controls.
- **Caveats (on macOS):** alarms do not wake a sleeping Mac.
- **Port to GNOME 50:** configure an existing app: **GNOME Clocks** has the same four tabs. The notch's **timer live activity** (plan §5.6) can mirror Clocks timers (if Clocks exposes them; otherwise run Kiwi's own timers), and Spotlight can offer "Set timer 10 min".
- **Blockers / risks:** GNOME Clocks has no public D-Bus API for running timers (it would need verifying), so Kiwi-owned timers may be needed.
- **Linux equivalents today:** GNOME Clocks, Sessions (pomodoro, Circle in 50).
- **Kiwi status:** partial (the notch timers are planned).
- **Recommendation:** Skip the app; timers in the notch and Spotlight are P2 (**S**).

### Weather
- **Introduced / changed:** **Ventura added Weather to the Mac**; Sonoma widgets; 27 refreshed forecast views (conditions, precipitation, wind toggles, Highlights).
- **What it is:** a full-window forecast with maps, hourly and 10-day forecasts, plus widgets.
- **Caveats (on macOS):** some data is US-only.
- **Port to GNOME 50:** configure an existing app: **GNOME Weather**. The Shell already reads its locations and **libgweather** for the date-menu weather, so a Kiwi weather widget (Notification Center, notch "Widgets", desktop) is cheap.
- **Blockers / risks:** libgweather providers (MET Norway) need network; respect the user's location settings.
- **Linux equivalents today:** GNOME Weather, the Shell's date-menu weather.
- **Kiwi status:** none.
- **Recommendation:** Skip the app; the weather widget is Later (P3), **S**.

### Stickies
- **Introduced / changed:** ancient; mostly unchanged (Big Sur icon, Tahoe glass).
- **What it is:** coloured floating sticky notes on the desktop, with an optional translucent "Float on Top".
- **Caveats (on macOS):** no sync.
- **Port to GNOME 50:** configure an existing app: **Sticky Notes** (com.vixalien.sticky, GTK4, Flathub). Floating "always on top" works on Wayland only through the compositor; Kiwi's Window menu has "Always on Top" (`Meta.Window.make_above()`).
- **Blockers / risks:** none.
- **Linux equivalents today:** Sticky Notes, Xpad (X11).
- **Kiwi status:** none.
- **Recommendation:** Skip, **–**.

### Digital Color Meter
- **Introduced / changed:** stable utility.
- **What it is:** shows the RGB value under the pointer, with an aperture size, colour-space choice (sRGB, P3, native) and copy-as-text or as an image (⇧⌘C).
- **Caveats (on macOS):** colour-space confusion.
- **Port to GNOME 50:** configure an existing app: **Eyedropper** (GNOME Circle) uses the portal's `PickColor` (backed by the Shell's `Shell.Screenshot.pick_color`). Kiwi Spotlight or Control Center could offer "Pick Color" by calling the same Shell API in-process and copying the hex value.
- **Blockers / risks:** none.
- **Linux equivalents today:** Eyedropper, Gpick.
- **Kiwi status:** none.
- **Recommendation:** Later (P3), **S**, as a Spotlight action; otherwise Skip.

### Screenshot (app)
- **Introduced / changed:** Mojave (see the toolbar section above).
- **What it is:** the app behind ⇧⌘5, in Utilities.
- **Caveats (on macOS):** see above.
- **Port to GNOME 50:** covered by the Shell screenshot UI section above.
- **Blockers / risks:** see above.
- **Linux equivalents today:** the GNOME screenshot UI.
- **Kiwi status:** none.
- **Recommendation:** see "Screenshot and Screen Recording toolbar" (P2, **M**).

### Time Machine
- **Introduced / changed:**
  - Leopard (2007).
  - Big Sur: backups to APFS volumes.
  - Monterey and later: quick restore of the whole Mac from Migration Assistant.
  - The **"star field" restore UI** (enter Time Machine from Finder and scroll back in time) is unchanged in style.
  - Menu-bar status item.
- **What it is:** automatic hourly/daily/weekly snapshots to an external or network disk, browsed with the time-tunnel UI, and restored per file or for the whole system.
- **Caveats (on macOS):** slow over the network; failures go unnoticed.
- **Port to GNOME 50:** configure existing apps: **Déjà Dup "Backups"** (GNOME, scheduled, restores files and folders, Nautilus "Revert to previous version" integration) and **Pika Backup** (Circle, Borg, browse archives). System snapshots: Btrfs plus snapper/Timeshift (Fedora uses Btrfs).
- **Blockers / risks:** a "star field" UI would be a huge companion-app project for little value.
- **Linux equivalents today:** Déjà Dup, Pika Backup, Timeshift, snapper.
- **Kiwi status:** none.
- **Recommendation:** Skip (recommend Pika or Déjà Dup), **–**.

### Keychain Access and Passwords
- **Introduced / changed:**
  - Monterey: passwords in System Preferences.
  - **Sequoia: the Passwords app** (passwords, passkeys, codes/TOTP, Wi-Fi, security warnings, shared groups).
  - Tahoe: **password history**.
  - 27: (planned) automatic change of weak passwords.
  - Keychain Access remains for certificates and keys.
- **What it is:** a system credential store with autofill in Safari and apps, iCloud Keychain sync, and passkeys.
- **Caveats (on macOS):** sync works only between Apple devices (plus iCloud for Windows).
- **Port to GNOME 50:** configure existing apps: **Passwords and Keys (Seahorse)** for gnome-keyring, **Key Rack** (Flatpak secrets), **Secrets** (KeePass, Circle), and the Bitwarden or KeePassXC browser integrations.
- **Blockers / risks:** no system autofill on Linux.
- **Linux equivalents today:** Seahorse, Secrets, KeePassXC, Bitwarden.
- **Kiwi status:** none.
- **Recommendation:** Skip, **–**.

### Image Capture
- **Introduced / changed:** stable.
- **What it is:** import from cameras, iPhones and scanners; scanner controls (flatbed, document feeder, format); delete after import.
- **Caveats (on macOS):** none.
- **Port to GNOME 50:** configure existing apps: **Document Scanner** (simple-scan) for scanners; **Shotwell** or Nautilus (gphoto2 MTP mount) for camera import.
- **Blockers / risks:** iPhone import is via libimobiledevice/gvfs-afc (it works).
- **Linux equivalents today:** Document Scanner, Shotwell, Rapid Photo Downloader.
- **Kiwi status:** none.
- **Recommendation:** Skip, **–**.

### Automator and Shortcuts
- **Introduced / changed:**
  - Automator (Tiger 2005) still ships.
  - **Monterey brought Shortcuts to the Mac**, with Quick Actions, the menu bar, Spotlight and Siri.
  - Ventura/Sonoma added actions.
  - **Tahoe:** **Automations** (time of day, sunrise or sunset, alarms, email or message arrival, files changed in a folder, drive connect, Wi-Fi, Bluetooth, displays, Stage Manager, app open/close, Focus) and Apple Intelligence "Use Model" actions; shortcuts in Spotlight with quick keys.
  - **27:** **describe a shortcut in natural language**; screenshot and notification triggers.
- **What it is:** visual automation across apps, built on App Intents.
- **Caveats (on macOS):** App Intents adoption varies; Automator is legacy.
- **Port to GNOME 50:** mostly skip.
  - There is no cross-app intent system on Linux.
  - What Kiwi can reuse:
    - `.desktop` actions as "Actions" in Spotlight;
    - **Nautilus scripts** (`~/.local/share/nautilus/scripts`) as Quick Actions;
    - user-defined Spotlight commands (a name plus a shell command, run with `Gio.Subprocess` on explicit user action).
  - A full Shortcuts or Automations app would be a large companion project.
- **Blockers / risks:** running user commands from the Shell is allowed only on explicit user action, and must be async.
- **Linux equivalents today:** Nautilus scripts, "Actions for Nautilus", GNOME custom keyboard shortcuts, Home Assistant, n8n, cron/systemd timers.
- **Kiwi status:** none.
- **Recommendation:** Later (P3) for user commands in Spotlight, **S**; Skip a Shortcuts app.

### Archive Utility
- **Introduced / changed:** stable.
- **What it is:** a hidden helper: double-click a .zip, .tar or .gz to extract it next to the archive; Finder ▸ Compress makes a .zip.
- **Caveats (on macOS):** no .rar or .7z without third-party apps.
- **Port to GNOME 50:** configure an existing app. Nautilus has built-in extract and compress (gnome-autoar; formats .zip, .tar.xz, .7z, encrypted .zip), and **File Roller** is the full archive manager.
- **Blockers / risks:** none.
- **Linux equivalents today:** Nautilus, File Roller, Ark.
- **Kiwi status:** none.
- **Recommendation:** Skip, **–**.

### System Information and "About This Mac"
- **Introduced / changed:** **Ventura** turned About This Mac into a small iOS-style window (Mac model and picture, chip, memory, serial, macOS version, a "More Info…" button into System Settings ▸ General ▸ About), with "System Report…" for System Information. Tahoe added a **Parts and Service history** section (Repair Assistant).
- **What it is:** a friendly summary window plus a deep hardware and software report.
- **Caveats (on macOS):** none.
- **Port to GNOME 50:** Shell extension dialog (planned in the logo menu: "About This PC").
  - Data comes from async reads only:
    - `org.freedesktop.hostname1` (`Chassis`, `HardwareVendor`, `HardwareModel`, `OperatingSystemPrettyName`, `KernelRelease`);
    - `GLib.get_os_info()`;
    - `/proc/cpuinfo` and `/proc/meminfo`, read async with Gio;
    - `net.hadess.SwitcherooControl` `GPUs`;
    - `Gio.File.query_filesystem_info_async` for the disk;
    - `Config.PACKAGE_VERSION` for the GNOME version.
  - A chassis icon (laptop or desktop), and "More Info…" opens `gnome-control-center system`.
- **Blockers / risks:** the hardware model is missing on some boards (fall back to the DMI vendor).
- **Linux equivalents today:** Settings ▸ System ▸ About, Hardinfo2, inxi.
- **Kiwi status:** none (planned P1).
- **Recommendation:** Port (P1, part of the menu bar), **S**.

### Migration Assistant
- **Introduced / changed:** stable; Sonoma and later integrate it with Setup Assistant; Tahoe and 27 use it with the Apple Account.
- **What it is:** transfers users, apps, settings and files from another Mac, a Time Machine backup or a Windows PC.
- **Caveats (on macOS):** slow over Wi-Fi.
- **Port to GNOME 50:** skip. The closest options are restoring a Déjà Dup or Pika backup of `$HOME`, or Flatpak plus dconf export. Kiwi's own settings can be exported and imported from prefs (a JSON dump of the Kiwi schema), which is cheap.
- **Blockers / risks:** none.
- **Linux equivalents today:** Déjà Dup restore, `dconf dump`.
- **Kiwi status:** none.
- **Recommendation:** Skip; export/import of Kiwi settings is Later (P3), **S**.

### Software Update
- **Introduced / changed:**
  - **Mojave moved macOS updates out of the App Store** into System Preferences ▸ Software Update.
  - Big Sur: snapshot-based faster updates (signed system volume).
  - Ventura: Rapid Security Responses (later Background Security Improvements).
  - Tahoe and 27: General ▸ Software Update, automatic updates, Beta Updates.
  - The Apple menu shows "System Settings… • 1 update".
- **What it is:** OS and App Store updates with a badge in the Apple menu and on the System Settings icon.
- **Caveats (on macOS):** forced restarts; large downloads.
- **Port to GNOME 50:** configure an existing app plus a small Shell piece. **GNOME Software** does offline OS (dnf/PackageKit) and Flatpak updates. Kiwi's logo menu shows "Software Update… (n)":
  - the count comes from PackageKit's D-Bus `GetUpdates` (async), or from GNOME Software's own update notification;
  - clicking opens `gnome-software --mode=updates`;
  - "App Store…" opens GNOME Software.
- **Blockers / risks:** a PackageKit query costs CPU and network, so cache it and refresh at most every few hours, or listen to Software's notifications instead.
- **Linux equivalents today:** GNOME Software, dnf, Flatpak.
- **Kiwi status:** none (the logo menu "App Store…" is planned).
- **Recommendation:** Port (P2), **S**. A badge in the logo menu is a nice Mac touch.

### Boot Camp
- **Introduced / changed:** Intel Macs only; gone with Apple silicon.
- **What it is:** dual-boot Windows.
- **Caveats (on macOS):** dead on Apple silicon.
- **Port to GNOME 50:** not applicable.
- **Blockers / risks:** none.
- **Linux equivalents today:** GRUB/systemd-boot dual boot.
- **Kiwi status:** none.
- **Recommendation:** Skip.

---

## Summary

| Item | Type | Recommendation | Effort | Main blocker |
|---|---|---|---|---|
| Menu bar (logo menu, app menus, status items, multi-display, auto-hide) | shell | Port (P1 core) | L | libadwaita apps export no menu bar; DBusMenu only for Xwayland apps; no SNI host in GNOME |
| Dock (magnification, Stacks, Genie/Scale, bounce, badges) | shell | Port (P1 core), Genie P2 | XL | DeformEffect cost; badges need the LauncherEntry API in apps; Dash to Dock coexistence |
| Mission Control, Spaces, App Exposé | shell | Port (P3) | L | Private overview internals; no per-monitor independent workspaces in Mutter |
| Hot corners (4 corners + modifiers) | shell | Port (P2) | S | Barrier edge cases on multi-monitor; must not steal menu-bar clicks |
| Trackpad gestures | shell | Port (P3) | M | No 2-finger edge-swipe; replacing GNOME's own swipe trackers |
| Cmd-Tab app switcher | shell | Port (P1 core) | S–M | No real ⌘ key (Super-Tab); custom keybinding handler must be restored |
| Launchpad / Apps | shell | Port (P2) | M | Private AppDisplay internals |
| Spotlight (Tahoe tabs, Tab-scope, quick keys, menu search) | shell | Have; extend P2 | M | No App Intents; localsearch coverage |
| Notification Center | shell | Port (P2) | M | Private message-tray internals |
| Widgets (NC + desktop) | shell | Later (P3) | L | No widget platform; built-in widgets only |
| Control Center (Edit Controls, pin to bar, Tahoe HUD) | shell | Have; extend P2 | M | Private Quick Settings internals |
| Window management (traffic lights, Fill & Arrange, Hide) | shell | Port (P1 core) | M | No Wayland "hide"; app headerbar buttons keep Adwaita look (no GTK CSS) |
| Full screen as a Space + Split View | shell | Port (P3) | M | Compositor-forced full screen quirks in some apps |
| Quick Look | theme existing app (Sushi) + shell hook | Port (P2) | S | Sushi is a separate package; no previewer in other apps' file lists |
| Screenshot toolbar (⇧⌘3/4/5, timer, floating thumbnail) | shell | Port (P2) | M | Private ScreenshotUI; no audio in Shell recorder |
| Lock screen restyle | shell (unlock-dialog mode) | Port (P3) | M | EGO scrutiny of unlock-dialog code |
| Login window (GDM) | shell (system-wide, installer) | Later (P3) | M | GDM extensions need system-wide install; theming unsupported |
| Setup Assistant / Kiwi onboarding | companion (installer / prefs first-run) | Port (P7) | S | Depends on the owner's installer |
| System Settings | theme existing app (GNOME Settings) + Kiwi prefs | Configure (P0/P1) | S | No plugin API in gnome-control-center |
| ⌘ glyphs + optional Ctrl/Super swap | shell (xkb option) | Port (P1) | S | No per-app remap on Wayland from the Shell |
| keyd/Toshy ⌘ remapping | system tool via installer | Later (P3) | M | Needs root or input group |
| Emoji / Character Viewer popover | shell | Port (P2) | S | Synthesised paste fails in some apps |
| Text replacement | companion (IBus engine) | Skip now; Later | L | The Shell must not watch keystrokes (EGO, privacy) |
| Sounds | shell + original assets | Later (P3) | S | Apple sounds are copyrighted |
| Haptics | skip | Skip | – | No hardware or driver |
| Accessibility parity (reduced motion, contrast, Show Borders) | shell | Port (P1 core) | S | Confirm GNOME 50's reduced-motion key |
| Finder (tags, folder colours, Quick Actions, Get Info) | theme existing app (Nautilus) + Nautilus extension | Port (P3) | L | Nautilus has no view/sidebar API; nautilus-python dependency; installer-only |
| Finder column / Gallery view | skip | Skip | – | Needs Nautilus upstream |
| Preview | theme existing app (Papers, Loupe, PDF Arranger) | Configure (P3) | S | No single app matches |
| Activity Monitor | theme existing app (Mission Center) | Configure (P3) | S | Flathub, not default |
| Force Quit dialog | shell | Port (P1) | S | None |
| Disk Utility | skip (GNOME Disks) | Skip | – | – |
| Font Book | skip (GNOME Fonts / Font Manager) | Skip | – | – |
| Terminal | skip (Ptyxis) | Skip | – | – |
| TextEdit | skip (Text Editor) | Skip | – | – |
| Calculator | skip (GNOME Calculator); Spotlight conversions | Skip app; P2 conversions | S | – |
| Notes | skip (Iotas); Quick Note shortcut | Skip app; P2 Quick Note | S | No notes API |
| Reminders | skip (Errands); due tasks via EDS | Later (P3) | S | Read-only EDS from the Shell |
| Calendar | skip (GNOME Calendar); Kiwi calendar card | Have (card) | – | – |
| Contacts | skip (GNOME Contacts) | Skip | – | – |
| Mail | skip (Geary, Evolution, Thunderbird) | Skip | – | – |
| Photos | skip (Shotwell, Loupe) | Skip | – | – |
| Music | skip; MPRIS in Kiwi | Have (MPRIS) | – | – |
| Clock | skip (GNOME Clocks); notch timers | P2 timers | S | No Clocks timer API |
| Weather | skip (GNOME Weather); Kiwi widget | Later (P3) | S | Network and location consent |
| Stickies | skip (Sticky Notes app) | Skip | – | – |
| Digital Color Meter | shell (Spotlight action) or Eyedropper | Later (P3) | S | – |
| Screenshot app | shell (see toolbar) | Port (P2) | M | see toolbar |
| Time Machine | skip (Déjà Dup, Pika) | Skip | – | – |
| Keychain / Passwords | skip (Seahorse, Secrets) | Skip | – | – |
| Image Capture | skip (Document Scanner, Shotwell) | Skip | – | – |
| Automator / Shortcuts | shell (Spotlight user commands) | Later (P3) | S | No cross-app intents on Linux |
| Archive Utility | skip (Nautilus, File Roller) | Skip | – | – |
| About This Mac / System Information | shell (logo-menu dialog) | Port (P1) | S | Missing DMI model on some boards |
| Migration Assistant | skip; Kiwi settings export | Later (P3) | S | – |
| Software Update | shell (logo-menu badge) + GNOME Software | Port (P2) | S | PackageKit query cost |
| Boot Camp | skip | Skip | – | – |

**Takeaways for the porting matrix.**
- The macOS "feel" lives almost entirely in the **Shell layer**: menu bar, dock, Mission Control, switcher, Spotlight, Control Center, window controls and screenshots. That is where Kiwi should spend its effort, and it matches the overhaul plan.
- Bundled apps are best handled by **recommending and configuring GNOME apps**, with exactly one worthwhile companion piece: a **Nautilus extension** for tags, folder colours and Quick Actions, shipped by the installer.
- No bundled app justifies a Kiwi-written GTK4 clone.
- Tahoe's Launchpad removal is an opportunity rather than a requirement: GNOME's app grid already gives Kiwi folders and manual order, which Tahoe users miss.

## Sources
- Apple, Mac User Guide (macOS 27):
  - [Use the Dock](https://support.apple.com/guide/mac-help/mh35859/mac)
  - [Mission Control](https://support.apple.com/guide/mac-help/mh35798/mac)
  - [Hot corners](https://support.apple.com/guide/mac-help/mchlp3000/mac)
  - [Screenshots and screen recordings](https://support.apple.com/guide/mac-help/mh26782/mac)
  - [Quick Look](https://support.apple.com/guide/mac-help/mh14119/mac)
  - [Tags](https://support.apple.com/guide/mac-help/mchlp15236/mac)
  - [Preview pane](https://support.apple.com/guide/mac-help/mchl1e4644c2/mac)
  - [Quick Actions](https://support.apple.com/guide/mac-help/mchl97ff9142/mac)
  - [Emoji and symbols / Character Viewer](https://support.apple.com/guide/mac-help/mchlp1560/mac)
  - [Text replacement](https://support.apple.com/guide/mac-help/mh35735/mac)
  - [Control Center](https://support.apple.com/guide/mac-help/mchl50f94f8f/mac)
  - [Notifications settings](https://support.apple.com/guide/mac-help/mh40583/mac)
  - [Widgets](https://support.apple.com/guide/mac-help/mchl52be5da5/mac)
  - [Full screen](https://support.apple.com/guide/mac-help/mchl9c21d2be/mac)
  - [Window tiling icons and shortcuts](https://support.apple.com/guide/mac-help/mchl9674d0b0/mac)
  - [What's in the menu bar](https://support.apple.com/guide/mac-help/mchlp1446/mac)
  - [Spotlight](https://support.apple.com/guide/mac-help/mchlp1008/mac)
  - [Input Sources settings / Globe key](https://support.apple.com/guide/mac-help/mchl84525d76/mac)
  - [Move and arrange app windows](https://support.apple.com/guide/mac-help/mchlp2469/mac)
- Apple:
  - [Mac keyboard shortcuts](https://support.apple.com/en-us/102650)
  - [Use Multi-Touch gestures on your Mac](https://support.apple.com/en-us/102482)
  - [What's new in the updates for macOS 27 Golden Gate](https://support.apple.com/en-us/127257)
  - [All New Features, macOS Tahoe (PDF)](https://www.apple.com/in/os/pdf/All_New_Features_macOS_Tahoe_Sept_2025.pdf)
- Reviews and news:
  - [MacStories: macOS 26 Tahoe review, Liquid Glass](https://www.macstories.net/stories/macos-26-tahoe-the-macstories-review/2/)
  - [MacStories: system features (menu bar, Control Center, Spotlight)](https://www.macstories.net/stories/macos-26-tahoe-the-macstories-review/3/)
  - [MacStories: apps (Shortcuts)](https://www.macstories.net/stories/macos-26-tahoe-the-macstories-review/4/)
  - [MacStories: Notes, Journal, Maps](https://www.macstories.net/stories/macos-26-tahoe-the-macstories-review/5/)
  - [MacStories: Terminal, Passwords, accessibility](https://www.macstories.net/stories/macos-26-tahoe-the-macstories-review/6/)
  - [MacRumors: 50 new macOS Tahoe features](https://www.macrumors.com/2025/09/24/all-the-new-macos-tahoe-features/)
  - [MacRumors: 50 new macOS Golden Gate features](https://www.macrumors.com/2026/09/17/new-features-changes-macos-27/)
  - [MacRumors: macOS Tahoe 26.1 (Liquid Glass setting)](https://www.macrumors.com/2025/11/03/apple-releases-macos-tahoe-26-1/)
  - [Wikipedia: macOS Tahoe](https://en.wikipedia.org/wiki/MacOS_Tahoe)
  - [9to5Mac: Tahoe Control Center](https://9to5mac.com/2025/06/28/new-macos-tahoe-feature-solves-common-complaint/)
  - [Fast Company SA: why macOS 26 is a mistake (Launchpad)](https://fastcompany.co.za/tech/2025-09-18-why-apples-macos-26-is-a-mistake-for-users)
  - [Apple Community: Tahoe removed Launchpad folders](https://discussions.apple.com/thread/256138531)
  - [MacMost: launching apps now that Launchpad is gone](https://macmost.com/how-to-launch-apps-now-that-launchpad-is-gone.html)
  - [MacMost: customize folders in Tahoe](https://macmost.com/how-to-customize-folders-in-macos-tahoe.html)
  - [MacTech: Tahoe lock screen clock font](https://www.mactech.com/2025/10/15/macos-tahoe-adds-the-ability-to-change-your-macs-clock-screen-font)
  - [mac.install.guide: Launchpad in Tahoe/27](https://mac.install.guide/mac-setup/launchpad)
- GNOME:
  - [GNOME 50 release notes](https://release.gnome.org/50/)
  - [GNOME 49 release notes](https://release.gnome.org/49/)
  - [This Week in GNOME #240 (Files 50)](https://thisweek.gnome.org/posts/2026/03/twig-240/)
  - [TWIG #224 Reduced Motion](https://thisweek.gnome.org/posts/2025/11/twig-224/)
  - [gnome-control-center MR 3253 (reduced motion)](https://gitlab.gnome.org/GNOME/gnome-control-center/-/merge_requests/3253)
  - [Phoronix: GNOME 48 groups notifications by app](https://www.phoronix.com/news/GNOME-48-Notifications-App)
  - [gnome-shell issue 5524: audio in screencasts](https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/5524)
  - [Screencast extra Feature extension](https://extensions.gnome.org/extension/8764/screencast-extra-feature/)
  - [OMG Ubuntu: Sushi GTK4 port](https://www.omgubuntu.co.uk/2026/09/gnome-sushi-gtk4-port)
  - [Ubuntu Handbook: Sushi 51](https://ubuntuhandbook.org/index.php/2026/08/gnome-file-previewer-sushi-51-ports-to-gtk4-adds-new-click-actions/)
  - [nautilus-python InfoProvider reference](https://sources.debian.org/src/nautilus-python/4.1.0-1/docs/reference/nautilus-python-info-provider.xml)
  - [Nautilus Miller-columns patch](https://gitlab.com/jguece/nautilus-miller-columns-patch/-/tags)
  - [GNOME Discourse: enabling an extension for the gdm user](https://discourse.gnome.org/t/how-to-enable-extension-for-the-gdm-user/18140)
- Other Linux:
  - [Mission Center review (Linuxiac)](https://linuxiac.com/mission-center-system-monitoring-app/)
  - [It's FOSS: Mission Center vs Resources](https://itsfoss.com/comparison/mission-center-vs-resources/)
  - [espanso Wayland issue 1955](https://www.github.com/espanso/espanso/issues/1955)
