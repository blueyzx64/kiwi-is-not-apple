# Kiwi overhaul plan (v3): one macOS-style desktop on GNOME 50

Status: **historical.** Kiwi 3.0.0 shipped; see the [README](../../README.md) for what it does today, [docs/features](../features/README.md) for each feature and [code-map.md](code-map.md) for the code. The body below is the plan as written and is kept as history; where it disagrees with the code, the code wins. The installer phase (P7, §9) was dropped and none of its code ships.
Target: Fedora 44, GNOME Shell 50, Wayland only.
Research: the macOS feature research (2018 → 27) is done; [`docs/research/macos/porting-matrix.md`](../research/macos/porting-matrix.md) maps every feature to a phase. This plan was updated to match it (§3, §5, §7, §9), and §11 lists where the research disagrees with earlier owner choices.

## 1. Goal
Replicate the whole macOS desktop experience on GNOME, with one design language and parts that know about each other:
- **Menu bar:** logo menu, app name and app menus, status items, Control Center, clock.
- **Dock**, with the Genie and Scale minimize effects.
- **Mission Control**, which replaces the Activities overview.
- **Stage Manager.**
- **Notch**, as a Dynamic Island.
- **Spotlight, Launchpad, Show Desktop and clipboard.**
- **Window management:** traffic lights, tiling and snapping, rounded corners.
- **Faux Liquid Glass** everywhere.

The installer (the owner's own macOS-style installer, `app-installer`) has been assessed; its integration is P7 (§9).

## 2. Owner decisions (2026-10-27)
| Topic | Decision |
|---|---|
| Dash to Dock add-ons, Firefox/Thunderbird theming, native GTK3 hover module, small panel tweaks | **Drop** |
| Window behaviour tweaks, overview tweaks, GTK titlebutton CSS themes | **Drop** |
| Dock | **Kiwi's own dock**; Dash to Dock is not needed (Kiwi turns it off while its dock runs, and restores it) |
| Overview | **Mission Control** (restyled overview: Spaces bar, spread windows, no search or dash) |
| Menu bar left | **Logo menu** (Fedora/Kiwi logo, the owner picks) |
| App menu | **All layers**, including the experimental AT-SPI mode |
| Notch | File shelf, live activities, mini widgets, hover to expand |
| Glass | **Faux glass**: tint, gradient, rim highlight, inner shadow; no real blur |
| Minimize effect | **Genie (default) + Scale** |
| Stage Manager | **Rebuild from scratch** on the new foundation |
| Undecided items (no preference given) | Orchestrator default: window-title → replaced by the app menu; panel-media → dropped (the notch does media); calendar card and the Control Center notification fallback → kept; rounded corners → kept |

## 3. Feature list after the overhaul

### Kept, then reworked into the new design
- **Top-bar window controls:** traffic lights, plus app-buttons mode.
- **Spotlight.**
- **Clipboard history and Quick Paste.**
- **Control Center.**
- **Calendar card** (and the Control Center notifications fallback when the notch is off).
- **Show Desktop.**
- **Shell behaviour:** Super toggles Spotlight, up-swipes stop at workspaces, GNOME's hot corner off (Kiwi's own four hot corners replace it in P3).
- **Rounded corners.**
- **Notch:** v3.
- **Stage Manager:** v3, rebuilt.
- **Liquid Glass:** becomes faux glass.
- **Launchpad:** becomes part of the dock and app grid instead of a Dash-to-Dock app.

### New
- **Menu bar:** logo menu plus the global app menu.
- **Dock.**
- **Genie/Scale minimize.**
- **Mission Control.**
- **Window tiling:** a tile menu on the green button, edge snapping with a preview, keyboard shortcuts.
- **macOS app switcher:** Super+Tab with app icons; Super+` cycles an app's windows.
- **App Exposé.**
- **Trackpad gestures:** pinch for Launchpad, spread for Show Desktop, 4-finger down for App Exposé, up for Mission Control.

### New, from the macOS research
Summaries only; each links to its matrix area, which links the research sections.
- **Menu bar** ([matrix §1](../research/macos/porting-matrix.md#1-menu-bar-and-app-menu)): Tahoe's transparent bar with adaptive text; About This PC and Force Quit dialogs; privacy dots (mic, camera, screen, location); clock opens Notification Center; fullscreen-only reveal; ⌘ glyphs.
- **Dock** ([§2](../research/macos/porting-matrix.md#2-dock-and-launchpad)): recent apps, web apps, LauncherEntry badges and progress, grey dots for background apps (Golden Gate), folder Stacks, Launchpad jiggle delete.
- **Windows** ([§3](../research/macos/porting-matrix.md#3-windows-tiling-and-full-screen)): Sequoia tiling with drag zones (edges, corners, menu bar; Ctrl for instant), margins, linked divider resize, Super+Ctrl shortcuts and arrangements; Hide/Hide Others emulation; glass traffic lights; centred dialogs.
- **Desktop** ([§4](../research/macos/porting-matrix.md#4-mission-control-spaces-gestures-and-hot-corners)): four hot corners with modifiers; click wallpaper to reveal desktop (default "Only in Stage Manager").
- **Notification Center and widgets** ([§7](../research/macos/porting-matrix.md#7-notification-center-widgets-and-desktop-widgets)): a right-side column with grouped stacks; Focus modes; one widget model for Notification Center, a desktop widget layer and the notch.
- **Control Center and Spotlight** ([§8](../research/macos/porting-matrix.md#8-control-center), [§9](../research/macos/porting-matrix.md#9-spotlight)): Tahoe's customisable Control Center and controls pinned to the menu bar; Spotlight browse views, Actions, Quick Keys, clipboard tab, history, Quick Look via Sushi.
- **Appearance** ([§10](../research/macos/porting-matrix.md#10-appearance-faux-glass-dark-mode-accent-icons-wallpapers-sounds)): Clear↔Tinted slider, Reduce Transparency, Increase Contrast, Show Borders, wallpaper tint, auto Light/Dark, icon styles (Default/Dark/Clear/Tinted).
- **Screenshots and input** ([§11](../research/macos/porting-matrix.md#11-screenshots-and-recording), [§12](../research/macos/porting-matrix.md#12-input-and-keyboard)): ⇧Super-3/4/5 glass toolbar with timer and floating thumbnail; Caps Lock and input-source badge; emoji popover.

### Removed (18 features)
- **Dash to Dock add-ons:** dock-styling, dock-blur, dock-adaptive-colors, downloads-in-dock, minimize-to-dock, launchpad-app (as a DtD app).
- **Browser theming:** firefox-theme, thunderbird-theme.
- **The `advanced/` native module.**
- **Small panel tweaks:** panel-transparency, panel-styling, lock-icon, add-username-to-quick-menu, keyboard-indicator, battery-percentage.
- **Window behaviour tweaks:** focus-new-windows, move-window-to-new-workspace, transparent-move, reduce-window-animations, hide-minimized-windows.
- **Overview tweaks:** overview-wallpaper-background, overview-seamless-zoom, focus-on-overview-exit, skip-overview-on-login. Mission Control takes over the overview.
- **Other:** gtk-theme titlebutton icon sets (fixes3/4.css stay only if still needed), window-title, tiling-title-menu, panel-media, hide-activities-button (folded into the menu bar).

**Clean-up:** obsolete schema keys stay readable for one release, marked deprecated, then are removed. A one-shot cleanup removes any Kiwi blocks Kiwi wrote earlier (userChrome.css, the gtk.css imports, GTK_MODULES) from the user's files. It never touches content Kiwi didn't write.

## 4. Architecture

### 4.1 Layout
```
extension.js          thin: start/stop the registry
features.js           the feature list (much shorter)
lib/                  pure helpers + Shell services (glass, modal, keybindings, settings, compat)
core/                 NEW: the shared desktop model all features use
  desktop.js            one DesktopModel: windows, apps, focus, workspaces, monitors
  layout.js             reserved edges: menu bar height, dock rect, strip rect, notch rect → work area
  motion.js             shared springs, durations, reduced-motion, the Genie/Scale effects
  events.js             typed signals: window-added, app-focused, minimize-requested, ...
  appMenus/             the app menu providers (§5.1)
features/             one folder per feature: index.js (Shell side) + model.js (pure) + prefs.js
  menuBar/ dock/ missionControl/ stageManager/ notch/ spotlight/ controlCenter/
  clipboard/ windows/ (controls, tiling, corners, switcher) showDesktop/ gestures/ launchpad/
prefs/                the preferences window (sidebar pages per feature)
```
New folders go into `--extra-source` in pack-release.yml (CLAUDE.md rule).

### 4.2 How the parts work together
- **One owner per screen edge.**
  - The menu bar owns the top.
  - The dock owns the bottom, or the side the user picks.
  - Stage Manager owns the left strip, or the right if the dock is on the left.
  - The notch sits inside the menu bar.
  - `core/layout.js` turns these into the work area and struts, so tiling, maximize, Stage Manager and Show Desktop all agree on the usable space. Today each feature guesses.
- **One window model.** The dock's running dots, the app menu's focused app, Stage Manager's sets, the app switcher, App Exposé and Mission Control all read `core/desktop.js`. Today they each track windows on their own, which is the main source of the Stage Manager bugs.
- **One motion system.** Shared spring curves and durations, so the dock bounce, notch, Genie, Stage Manager flights and Mission Control feel like one OS. Reduced motion is honoured in one place.
- **Conflict rules, defined once:**
  - Minimize goes to the dock (Genie), or to the Stage Manager strip when Stage Manager is on.
  - Show Desktop delegates to Stage Manager when it is on.
  - Mission Control hides the strip and the dock.
  - Fullscreen windows hide the menu bar and the dock, and leave the notch visible only on hover.

## 5. Feature specs (summary; each gets a full spec file in docs/features before building)

### 5.1 Menu bar and global app menu
- **Layout:** logo menu, then the **bold app name**, then the app menus, … then status items, Control Center, clock.
- **Logo menu:** About This PC (a Kiwi dialog: hardware, OS, GNOME version), System Settings…, App Store… (GNOME Software), Recent Items, Force Quit…, Sleep, Restart…, Shut Down…, Lock Screen, Log Out.
- **App menu providers,** tried in order; the result is merged with the generic menus:
  1. **Generic (every app):** *App* (About, Settings, Hide, Hide Others, Quit), *File* (New Window), *Window* (Minimize, Zoom, Tile Left/Right, Move to Workspace, Always on Top, Bring All to Front), *Help* (a Search field that searches menu items).
  2. **GTK actions:** `org.gtk.Actions` on the window's unique bus name (Meta.Window `get_gtk_*_object_path`). Map well-known actions (`app.about`, `app.preferences`, `app.quit`, `app.new-window`, `app.shortcuts`, `win.*`) into the generic menus.
  3. **GTK exported menu bar:** `org.gtk.Menus` at `get_gtk_menubar_object_path` when present → the full native menus.
  4. **DBusMenu:** Kiwi runs `com.canonical.AppMenu.Registrar` and reads `com.canonical.dbusmenu` for Qt, Electron (VS Code, Chrome), LibreOffice and other Xwayland apps (they register by X11 window id).
  5. **AT-SPI (experimental, setting off by default):** read the menu bar or the primary menu button's menu from the accessibility tree.
     - libadwaita hamburger menus are built only when opened: open them off-screen, read them, then close them, and cache the result per app.
     - Can flicker; clearly labelled.
- **Keyboard:** Alt/F10 focuses the menu bar; arrow keys move between menus; mnemonics. Super is shown as ⌘ in menus; an optional, saved-and-restored `ctrl:swap_lwin_lctl` toggle.
- **Look (Tahoe):** transparent by default with text that flips by the sampled wallpaper luminance (async, with hysteresis); solid when a window touches the top; a "Show menu bar background" switch. It replaces the dropped panel-transparency ([F20](../research/macos/2024-now-sequoia-tahoe.md#f20-the-transparent-menu-bar)).
- **Logo-menu dialogs (P1):** About This PC (model from DMI or a model map, chip, memory, OS, GNOME version, storage; "More Info…" opens GNOME Settings) and Force Quit (Super+Alt+Esc; flags unresponsive apps; `request_quit()` then `Meta.Window.kill()`). "Desktop & Dock…" opens Kiwi prefs.
- **Right side:** privacy dots restyled from GNOME's indicators, with the app list in Control Center; the clock opens the Notification Center (§5.9), ⌥-click toggles Do Not Disturb.
- **Full screen:** the menu bar and dock hide and reveal at the top edge ("In Full Screen Only"). Full auto-hide stays removed.
- **P6 additions:** a status-item host (StatusNotifierItem) and a Menu Bar page to hide or reorder items; Control Center controls pinned to the bar.
- **Verification** (in the real test environment): Text Editor (GTK actions), Nautilus, Calculator, a GTK3 app with a menu bar, a Qt app under Xwayland, VS Code or Chrome under Xwayland, LibreOffice, Firefox (AT-SPI).

### 5.2 Dock
- **Contents:** pinned apps, running apps, separator, Downloads stack, Trash.
- **Looks and motion:** faux glass. Magnification (setting, off by default like macOS). Bounce on launch and on attention requests. Running dots.
- **Menus and interaction:**
  - right-click menu: windows list, Keep in Dock, Open at Login, Show in Files, Quit;
  - drag to reorder or remove (a poof animation);
  - drop files onto app icons to open them with that app.
- **Settings:** position (bottom, left or right), size, auto-hide with a delay, "minimize windows into application icon", and "show recent apps".
- **From the research:**
  - P1: recent apps (up to 3); web apps matched by app id; `.desktop` actions in the menu; the Downloads stack moves in from the dropped DtD add-on, with package badges, partial downloads, a completion bounce and "Open with Installer" (IN §4.2).
  - P2: LauncherEntry badges and progress; grey dots for apps running in the background (`org.freedesktop.background.Monitor`) with "Stop Running in Background"; folder Stacks (Fan, Grid, List).
- **Launchpad** stays (GNOME's app grid already has folders and manual order, which Tahoe users miss); Tahoe's "Apps" becomes a Spotlight tab. Jiggle mode shows ⓧ only on Flatpak apps (GNOME Software's `uninstall` action, P3) and on installer-owned apps (P7, §9).
- **Interplay:**
  - Launchpad and App Exposé entry points.
  - Minimized windows show at the right side, or in the app icon.
  - Stage Manager on: the dock stays, and the strip uses the other side.

### 5.3 Genie and Scale minimize
- Genie: the window mesh funnels into its dock icon, using a `Clutter.DeformEffect` subclass (the same technique as "Compiz alike magic lamp").
- Scale: a plain shrink.
- Restore plays the same effect in reverse.
- The source of truth for the target icon rect is the dock. Stage Manager overrides the target with its strip slot.

### 5.4 Mission Control
- **Restyled overview:**
  - Spaces bar on top (workspace thumbnails, with a + button to add one);
  - windows spread out without the search entry or dash;
  - the app grid only via Launchpad.
- **Entry points:** F3, Ctrl+Up, swipe up with 3/4 fingers, a dock icon.
- **Actions:** drag windows to Spaces; App Exposé for one app (swipe down, or Ctrl+Down).
- **Startup:** Kiwi lands on the desktop at login, never in Mission Control (the dropped `skip-overview-on-login` behaviour now belongs here).
- **Desktop pieces in the same phase (P3):**
  - **Hot corners:** four corners with optional modifier keys and actions (Mission Control, App Exposé, Desktop, Notification Center, Launchpad, Quick Note, Lock, display sleep); pressure barriers per monitor; the top corners must not steal menu-bar clicks.
  - **Click wallpaper to reveal desktop:** windows fly to the edges and leave slivers; setting `always / stage-manager / never`, default `stage-manager` (§11).
  - **Full screen as its own Space, and Split View:** only if the owner approves (§11), off by default.

### 5.5 Stage Manager v3 (rebuild)
- Built on `core/desktop.js` and `core/layout.js`.
- **Behaviour (macOS-faithful):**
  - sets made by drag or Shift-click;
  - opening a new app replaces the stage;
  - click the wallpaper to reveal the desktop;
  - a recent-apps strip that auto-hides behind windows;
  - "one at a time / all at once" per app;
  - a strip per workspace;
  - it cooperates with tiling: side-by-side uses the tiling engine (§5.7).
- **Implementation rules:**
  - A single state machine, pure in model.js, holds the sets, the stage and the strip order.
  - The Shell adapter only animates and applies frames.
  - Every animation can be cancelled; actors live in one container destroyed on disable.
- **Bug-proofing:**
  - a scripted scenario suite (the 9 scenarios from the last test round, plus the 13 seeds in the [Stage Manager lessons](../research/macos/2022-2023-ventura-sonoma.md#stage-manager-lessons-for-kiwi-v3-not-a-feature)) runs in the test environment with real apps on every change;
  - fuzz tests on the model with random window events.

### 5.6 Notch v3
- **Behaviour:**
  - hover to expand (with a delay), and click;
  - tabs in the expanded view: *Now* (media, live activities) / *Tray* (the file shelf) / *Widgets* (calendar day, weather, quick toggles).
- **Live activities:** charging and battery, timers (Kiwi's own; Clocks has no timer API), screen recording with ⏹, Bluetooth headphones, the next calendar event, download progress, install progress from the installer's LauncherEntry, low-battery and accessory alerts, and "Copy code" for one-time codes in notifications.
- **File shelf:** drop files onto the notch; they are kept as a list of links, then can be dragged out, opened, or AirDrop-like sent via GSConnect if present.
- **Performance:**
  - one actor tree, no relayout per frame (FractionLayout is already there);
  - waveform bars animated by transforms only;
  - idle at 0% CPU when nothing is playing.

### 5.7 Windows
- **Traffic lights** in the menu bar, or app buttons (as now).
- **Green-button hover menu:** Fill, Center, Tile Left/Right, Move to Workspace, Full Screen.
- **Edge snapping** with a translucent preview; Ctrl+Super+arrows tile.
- **Rounded corners** (as now).
- **App switcher:** Super+Tab with big icons; Q to quit, H to hide; Super+` cycles windows.
- **Tiling, Sequoia model (P1)** ([F1–F4](../research/macos/2024-now-sequoia-tahoe.md#f1-window-tiling-drag-to-edges-corners-and-the-menu-bar)):
  - drag zones at edges, corners and the menu bar, with a glass preview; Ctrl while dragging shows them at once;
  - Mutter's `edge-tiling` is switched off while Kiwi tiles, and restored on disable;
  - shortcuts: Super+Ctrl+arrows, Fill, Center, Return to Previous Size, and arrangements (Left & Right, Top & Bottom, Quarters) using the most recent windows;
  - "Tiled windows have margins" (P1); linked resize of a tiled pair's divider (P2).
- **Hide and Hide Others (P1):** no Wayland concept exists, so Kiwi emulates it: a no-animation minimize with a "hidden" flag, skipped in the dock's minimized area and restored when the app is activated. It must cooperate with Stage Manager's window flags.
- **Glass traffic lights** (Golden Gate style) on Kiwi's buttons. In-app headerbars keep Adwaita's buttons (§11).
- **Dialogs (P2):** centred alerts and the pop-up power dialog restyled.

### 5.8 Faux Liquid Glass
- **One look for every surface:**
  - a rgba tint plus a vertical gradient;
  - a 1px top rim highlight and a 1px bottom shade;
  - a soft drop shadow;
  - optional subtle noise.
- **Variants:** light and dark, high contrast (solid) and reduced transparency.
- **From the research (P1)** ([cookbook](../research/macos/2024-now-sequoia-tahoe.md#6-faux-liquid-glass-cookbook-no-blur)): regular and "clear" fills; a darker outer edge (Golden Gate); one Clear↔Tinted slider; Reduce Transparency and Increase Contrast as one switch in `lib/glass.js`; Show Borders; 5–10 % wallpaper tint; scroll-edge fades; one corner radius.
- **Appearance around it (P1):** dark tokens on every surface; auto Light/Dark by sunset (writes `color-scheme`, saved and restored); follow GNOME's accent colour. **P2:** icon styles (Default, Dark, Clear, Tinted) on Kiwi-drawn icons; liquid motion (morphing popovers).

### 5.9 Control Center, Spotlight, clipboard, calendar, Notification Center and widgets
Keep the round-2 designs, restyled with faux glass, wired to the core model, and bugs fixed. Spotlight also searches the app menu's commands of the focused app, like macOS Help search. Additions from the research:
- **Control Center (P6):** Tahoe's customisable gallery (Edit Controls, sizes, Kiwi controls such as Tile, Stage Manager and Glass); controls pinned to the menu bar; Low Power Mode; battery and user rows. The volume and brightness OSD moves under the menu bar (P2).
- **Spotlight (P6):** one ranked list with filters and Tab-to-scope; browse views (Apps, Files, Actions, Clipboard on Super+1–4); Actions and Quick Keys from `.desktop` actions and Kiwi actions; search history; calculator history; Go to Folder path mode; Quick Look via Sushi (`org.gnome.NautilusPreviewer`); a settings catalogue over GNOME Settings panels and Kiwi prefs ([F32–F36](../research/macos/2024-now-sequoia-tahoe.md#f32-spotlight-one-ranked-list-filters-tab-to-scope-and-site-search)).
- **Notification Center (P5):** a right-side glass column opened by the clock: grouped stacks per app, actions, Clear All, history, time-sensitive break-through, per-app mute, Focus modes. The notch keeps banners; the Control Center fallback stays for when the notch is off.
- **Widgets (P5):** one widget model shared by the Notification Center, the notch's Widgets tab and a **desktop widget layer** (above the wallpaper, below windows; dimmed while windows are in front; a gallery and edit mode). Built-ins first: Clock, Calendar, Weather, Media, Batteries, Toggles ([VS desktop widgets](../research/macos/2022-2023-ventura-sonoma.md#desktop-widgets-placement-sizes-and-layout)).

### 5.10 Screenshots (P2)
- ⇧Super-3/4/5 bound to the Shell's own screenshot UI (keys saved and restored), restyled as a bottom glass toolbar, with a Timer option.
- A floating thumbnail at the bottom right: click opens Gradia or Loupe; drag gives a file link.
- Audio and markup stay with Kooha and Gradia ([matrix §11](../research/macos/porting-matrix.md#11-screenshots-and-recording)).

### 5.11 Input (P2)
- A Caps Lock and input-source badge at the text cursor, with a menu-bar fallback ([VS](../research/macos/2022-2023-ventura-sonoma.md#text-cursor-indicators-caps-lock-input-source-dictation)).
- An emoji and symbols popover (Ctrl+Super+Space) that reuses the Quick Paste injection.
- Real ⌘ remapping (keyd or Toshy) is installer territory and later.

## 6. Settings
- **Prefs layout:** one page per feature in the sidebar (General, Menu Bar, Dock, Mission Control, Stage Manager, Notch, Windows, Spotlight, Control Center, Clipboard, Appearance, About).
- **Reset:** a "Reset everything" button.
- **Schema:** new keys under clear prefixes (`menubar-*`, `dock-*`, `mc-*`, `sm-*`, `notch-*`, `windows-*`, `glass-*`). Old keys are migrated once, then deprecated.
- **More pages from the research:** Desktop (hot corners, click wallpaper, widgets), Notification Center & Focus, Keyboard (⌘ glyphs, Ctrl/Super swap, emoji), Screenshots, Login Items (P7). The order follows macOS System Settings.
- **Saved originals (P0):** every GNOME key Kiwi writes (`button-layout`, `color-scheme`, `edge-tiling`, `dynamic-workspaces`, hot corners, `xkb-options`, screenshot and switcher keybindings, dock keys) has its original stored in Kiwi's schema, so disable, "Reset everything" and uninstall can restore it. The restore must never depend on `disable()`, because `disable()` also runs on lock (§9).

## 7. Phases (each ends merged to main, tested in the real GNOME 50 environment)
| Phase | Content |
|---|---|
| **P0 Cleanup** | Remove the 18 dropped features and their keys, CSS and assets; the user-file cleanup; the new folder layout; the `core/` skeleton (desktop, layout, motion, events); the prefs sidebar regrouped in the macOS System Settings order. *Added:* the saved-originals store for every GNOME key Kiwi writes (§6); reduced motion (GNOME 50's key) and accessible names as rules in `core/`. Expect no visible change except the removals. |
| **P1 Foundation features** | Faux glass; the menu bar with the logo menu and generic + GTK-action app menus; the dock (without Genie); window tiling and the green-button menu. *Added:* Clear↔Tinted slider, Reduce Transparency, Increase Contrast, Show Borders, wallpaper tint, auto Light/Dark, accent, Control Center restyle (glass agent); transparent adaptive menu bar, About This PC, Force Quit, privacy dots, clock → Notification Center hook, fullscreen reveal, ⌘ glyphs (menu-bar agent); recent apps, Downloads stack with package badges, web apps, desktop actions (dock agent); drag zones, margins, shortcuts and arrangements, Hide emulation, glass traffic lights, full-screen options (windows agent) |
| **P2 Motion and system surfaces** | Genie/Scale; the dock bounce and magnification; the shared springs applied to the notch, Spotlight and Control Center. *Added:* liquid motion (morphing popovers); LauncherEntry badges, grey background-app dots, folder Stacks; linked tile resize; the volume/brightness OSD; centred dialogs; the screenshot toolbar and floating thumbnail; icon styles; Caps Lock badge; emoji popover; colour filters |
| **P3 Mission Control, gestures and desktop** | Mission Control, App Exposé, the app switcher, trackpad gestures. *Added:* hot corners; Show Desktop with click-wallpaper; Launchpad restyle with jiggle mode (Flatpak rule); start on the desktop; resize-to-fit on display change; full screen as a Space + Split View (if approved, §11) |
| **P4 Stage Manager v3** | The rebuild on the core model, plus the scenario and fuzz suites (with the 13 research seeds); the wallpaper-click "Only in Stage Manager" wiring |
| **P5 Notch v3, Notification Center and widgets** | Hover, tabs, live activities, file shelf, widgets, performance pass. *Added:* the Notification Center column, Focus modes and time-sensitive notifications; one widget model for the Notification Center, the notch and the desktop widget layer (dimming, gallery); "Copy code"; low-battery alerts; recording and install activities |
| **P6 Menu bar and Spotlight, full** | Exported GTK menu bars, the DBusMenu registrar, AT-SPI experimental, Help search. *Added:* Spotlight Tahoe features (browse views, Actions, Quick Keys, clipboard tab, history, Quick Look); customisable Control Center and pinned controls; the status-item host and the Menu Bar item manager; Low Power Mode, battery and user rows |
| **P7 Installer and app lifecycle** | Integrate with the owner's installer (§9): D-Bus API consumer, Downloads-stack hand-off, Launchpad and dock-Trash uninstall rules, LauncherEntry progress, the onboarding flow, Login Items page, App Store / Software Update dot, installing Kiwi itself |
| **P8 Polish** | An adversarial review round, a full test sweep, docs, an EGO-readiness check (including an audit of every private-API wrapper listed in the matrix's [hard blockers](../research/macos/porting-matrix.md#hard-blockers-things-kiwi-cannot-do-or-can-do-only-by-a-workaround)) |
| **Later** | Everything the matrix marks `later` (47 rows): lock screen, Nautilus extension, AI helpers, OCR, sounds and wallpapers with original art, multi-display menu bars, extra-large widgets |

**Parallelism.** P1 runs as 4 parallel agents (glass, menu bar, dock, windows). P2 can run as 3 (motion, dock extras, system surfaces: OSD, dialogs, screenshots, input). P3–P6 overlap where they don't share files; all of them depend on P0's `core/`. P7's Kiwi side depends on the installer repo's D-Bus API (§9).

## 8. Testing
- **Test environment.** The real GNOME Shell 50.6 test environment already has:
  - real apps (Files, Calculator, Rhythmbox, Text Editor);
  - PipeWire audio;
  - mocked NetworkManager, BlueZ, UPower and power-profiles;
  - virtual mouse and keyboard;
  - screenshots.
- **To add:**
  - a Qt app and an Electron app (for DBusMenu);
  - LibreOffice;
  - Firefox (for AT-SPI);
  - a multi-monitor run (two virtual monitors).
- **Every phase must show:**
  - `make check`;
  - 20 enable/disable cycles with 0 Kiwi errors;
  - a per-feature scenario suite;
  - screenshots reviewed before merging.
- **Never commit screenshots.**

## 9. P7: installer and app lifecycle
> **Paused indefinitely (owner, 2026-10-27); the Kiwi-side code was removed on 2026-10-27.** The installer client, the contract doc, the Downloads-stack "Open with Installer" and the installer-owned Launchpad delete path are gone; the Setup Assistant and Login Items stay. The plan text below is kept as history.

The owner's `app-installer` (Tauri 2 + SvelteKit, Rust domain/application/infrastructure crates) has been assessed: AppImage install and uninstall are real; RPM install is wired but not proven on Fedora. Full assessment, risks and next steps: installer research, owner's app-installer.

**Principle.** Kiwi is the shell (Finder, Dock, Launchpad); the installer is Installer.app plus the uninstall back end. Neither depends on the other being installed. Kiwi talks to it only over D-Bus, async with timeouts, and degrades when it is absent (EGO).

- **RPM back end on Fedora 44: dnf5daemon primary, PackageKit fallback.** GNOME Software on F44 requires `dnf5daemon-server`, not PackageKit (orchestrator-verified). The installer should drop `Requires: PackageKit` for `dnf5daemon-server` on F44+ and run a fresh-F44 spike (risks R1–R3).
- **D-Bus API (installer repo, new):** a D-Bus-activatable `io.github.blueyzx64.Installer1` with `Open`, `ListManagedApps`, `OwnsDesktopId`, `Uninstall`, and the signals `AppsChanged`, `UninstallFinished`, `Progress`. Confirmation UI always lives in the installer; Kiwi never removes anything itself (§4.1).
- **LauncherEntry progress:** the installer mirrors `Progress` into `com.canonical.Unity.LauncherEntry`, so Kiwi's dock (P2 consumer) shows a progress bar on the installer icon and the notch (P5) shows "Installing… 40 %". `AppsChanged` plus `installed-changed` triggers the fly-to-dock animation.
- **Downloads stack hand-off:** double-clicking a package uses the MIME default (the installer's one-time "Make Default"), so Kiwi needs no change; the stack adds package badges and "Open with Installer"; after a successful install the installer offers "Move <file> to the Trash" (§4.2).
- **Launchpad delete rules:** ⓧ appears only on (1) installer-owned apps (`X-Installer-Managed=true` or `OwnsDesktopId()`), which call `Uninstall`; (2) Flatpak apps, which call GNOME Software's `uninstall` action; (3) nothing else, as macOS shows ⓧ only for App Store apps. Dragging to the dock Trash does the same. The poof plays on `UninstallFinished(removed)` (§4.3).
- **Onboarding (Setup Assistant):** a declarative step list rendered in Kiwi prefs first (option A), the installer's Svelte skin later (option B). It runs once, never in `initial-setup` or over GNOME's welcome dialog, saves originals of every GNOME key it changes, and can be re-run from the logo menu (§4.4).
- **Installing Kiwi itself:** the installer's "Get Kiwi" flow calls `org.gnome.Shell.Extensions.InstallRemoteExtension` (no logout); a Copr RPM and an offline zip are secondary. Uninstall sets `pending-uninstall=true` so Kiwi restores saved keys first; `make install` stays for developers (§4.5).
- **Also in P7:** the Login Items page (autostart files with `X-Kiwi-Created`, the permission store `background` table) and an opt-in "Background Items Added" notification; the logo menu's pending-update dot; Kiwi skips its decoration effects for the installer's undecorated window (R5).
- **P7 test:** in the GNOME 50 test environment, install the installer RPM, set it as default, open an AppImage from the stack, watch dock progress, see it in Launchpad, jiggle-delete it, check the Trash and the empty ledger, then run 20 enable/disable cycles with the installer running.
- **Fix in the installer repo first:** the desktop-id mismatch (one reverse-DNS id everywhere), the README RPM status, and "Reduced Motion is GNOME 50" in its docs.

## 10. Open questions for the owner
1. **Logo:** Fedora logo or Kiwi logo in the menu bar? (A setting either way; which is the default?)
2. **Dock default position:** bottom (macOS default)?
3. **Fonts:** should Kiwi ship or recommend Inter / SF-like fonts for the menu bar, or keep Cantarell/Adwaita Sans?
4. **Keyboard:** Super acts as ⌘ for menu-bar shortcuts shown in menus (display only; real Cmd remapping needs keyd, outside the extension). Ok?
5. ~~**Installer:** please share it (or its repo) so §9 can be planned.~~ Done: assessed, see §9.
6. The research conflicts in §11.

## 11. Conflicts needing owner decision
Where the research disagrees with an earlier owner choice, or forces a choice the plan hasn't made. Each row has a proposed default; nothing is built until the owner confirms.

| # | Topic | Earlier choice | What the research says | Proposed default | Blocks |
|---|---|---|---|---|---|
| 1 | **Full screen as its own Space** | Dropped as a "behaviour tweak" (`move-window-to-new-workspace`) | It is core macOS full-screen behaviour (Lion onward), and Split View builds on it; it should return as part of Mission Control, off by default ([UI](../research/macos/native-apps-and-system-ui.md#full-screen-and-split-view)) | Bring it back in P3 inside Mission Control, off by default, with Split View on the tiling engine | P3 |
| 2 | **Traffic lights inside app titlebars** | GTK titlebutton CSS themes dropped | Coloured traffic lights in apps' own headerbars need GTK CSS; without it apps keep Adwaita's grey circles, and the green-button tile menu works only on Kiwi's buttons ([UI](../research/macos/native-apps-and-system-ui.md#window-management-traffic-lights-zoomfill-minimize-hide-tiling), [F2](../research/macos/2024-now-sequoia-tahoe.md#f2-green-button-tile-menu-and-window--move--resize)) | Keep the drop: Kiwi's traffic lights live in the menu bar (or app-buttons mode); `button-layout` puts app buttons on the left. An optional theme could later ship through the installer, never written by Kiwi | P1 |
| 3 | **Click-wallpaper default** | Plan §5.5 treats it as Stage Manager behaviour only | macOS Sonoma defaults to "Always", but that is its most-reverted change; the research recommends a non-Stage-Manager mode too, defaulting to "Only in Stage Manager" ([VS](../research/macos/2022-2023-ventura-sonoma.md#click-wallpaper-to-reveal-desktop)) | `always / stage-manager / never`, default `stage-manager` (differs from macOS on purpose) | P3, P4 |
| 4 | **AI features and EGO rules** | Not covered | Writing Tools, notification summaries and "Search or Ask" need an LLM. EGO forbids bundled binaries and data sent to third parties without explicit action, so they need a separately packaged, opt-in, local-first helper ([F9](../research/macos/2024-now-sequoia-tahoe.md#f9-apple-intelligence-writing-tools), [F10](../research/macos/2024-now-sequoia-tahoe.md#f10-notification-summaries-and-the-reduce-interruptions-focus), [F60](../research/macos/2024-now-sequoia-tahoe.md#f60-siri-ai-in-spotlight-search-or-ask-and-the-siri-app)) | Out of scope until after P8; at most an "Ask…" hook in Spotlight that only appears when a helper is installed | later |
| 5 | **Lock screen (`unlock-dialog` session mode)** | Not covered | Lock-screen clock, fonts and unlock animations need `unlock-dialog`, which changes Kiwi's lifecycle (it would no longer be torn down on lock) and draws EGO scrutiny ([VS](../research/macos/2022-2023-ventura-sonoma.md#redesigned-lock-screen-and-login-window), [F41](../research/macos/2024-now-sequoia-tahoe.md#f41-lock-screen-clock-customisation)) | Stay in `user` mode for this release; revisit after P8 | later |
| 6 | **Notification Center vs the notch and calendar card** | Notch takes banners; calendar card and Control Center fallback kept | macOS has one right-side column opened from the clock; the research files differ on timing (P1 vs P2) ([BM](../research/macos/2020-2021-bigsur-monterey.md#notification-center-redesign-grouped-interactive-notifications)) | Build the column in P5 with one shared widget model; the clock opens it; the calendar card becomes its top widget; the Control Center fallback stays for "notch off" | P5 |
| 7 | **Hot corners** | "Hot corner off" kept as Shell behaviour | Four configurable corners with modifiers are a liked macOS feature ([BM](../research/macos/2020-2021-bigsur-monterey.md#hot-corners-with-new-actions)) | GNOME's corner stays off; Kiwi's four corners ship in P3, all set to "none" by default except an opt-in suggestion in onboarding | P3 |
| 8 | **Dropped panel tweaks that return in new homes** | Dropped: panel-transparency, battery-percentage, add-username, keyboard-indicator, reduce-window-animations | The same needs reappear as the adaptive menu bar, Control Center battery and user rows, the Caps Lock/input-source badge and the reduced-motion rule ([matrix](../research/macos/porting-matrix.md)) | Confirm these are rebuilt inside the new features, with old keys migrated once, not revived as standalone tweaks | P0 |
| 9 | **`skip-overview-on-login` dropped** | Dropped with the overview tweaks | GNOME 50 opens the overview at login; with Mission Control replacing it, users would land in Mission Control, which macOS never does | Mission Control owns "start on the desktop" (on, no setting) | P3 |
| 10 | **Launchpad vs Tahoe's "Apps"** | Launchpad becomes part of the dock and app grid | Tahoe removed Launchpad; users miss folders and manual order ([UI](../research/macos/native-apps-and-system-ui.md#launchpad-and-apps-in-tahoe)) | Keep Launchpad (GNOME's grid); add "Apps" only as a Spotlight tab | P3, P6 |
| 11 | **Desktop icons (DING)** | Not covered | DING's window takes wallpaper clicks, which breaks click-wallpaper and stacks over desktop widgets ([VS](../research/macos/2022-2023-ventura-sonoma.md#desktop-widgets-placement-sizes-and-layout)) | Detect DING; disable click-wallpaper while it runs and place widgets above it; no Kiwi desktop icons | P3, P5 |
| 12 | **Status items** | Not covered | GNOME has no StatusNotifierItem host; Kiwi must host one or defer to the AppIndicator extension ([UI](../research/macos/native-apps-and-system-ui.md#menu-bar-apple-menu-app-menus-status-items-multiple-displays-auto-hide)) | Defer to AppIndicator when it is enabled; otherwise Kiwi hosts the watcher (P6) | P6 |
| 13 | **Real blur on GNOME 51** | Faux glass, no real blur | GNOME 51's Shell-only blur is a possible extra, never a requirement ([cookbook](../research/macos/2024-now-sequoia-tahoe.md#6-faux-liquid-glass-cookbook-no-blur)) | Keep "no blur" for this release; note as a 51 option | later |
| 14 | **Installer target and licence** | Installer: Fedora 45 / GNOME 51 first, MIT placeholder | Kiwi supports Fedora 44 / GNOME 50 only; the licence is still a placeholder (R3, R9) | Make F44/GNOME 50 a first-class installer target; decide the licence before publishing | P7 |

## 12. Resolutions (owner rule, 2026-10-27)
The owner's rule: wherever Kiwi had overridden a default, use the **macOS default**, and keep every one **toggleable**. The owner's explicit choices still win: top-bar window controls, Super tap opening Spotlight, up-swipes reaching workspaces only, GNOME's hot corner off, top-only rounded corners.

| §11 # | Resolution |
|---|---|
| 1 Full screen as its own Space | **On** (macOS), toggle. P0 keeps `move-window-to-new-workspace`, default true; P3 adds Split View. |
| 2 Traffic lights in app titlebars | Top-bar controls stay on (owner's choice). When they're off, the apps' buttons default to the **macOS traffic-light style**, with GNOME style as the toggle; one GTK CSS set is kept for this. |
| 3 Click wallpaper | **"Always"** (macOS default), with "Only in Stage Manager" as the toggle. |
| 4 AI features | **Skipped** (owner, see §13). |
| 5 Lock screen | After P8. |
| 6 Notification Center | macOS model: clicking the clock opens the Notification Center column (it absorbs the calendar card). The notch keeps live banners and activities. |
| 7 Hot corners | Kiwi hot corners, configurable. macOS default is no actions; GNOME's own hot corner stays off (owner's choice). |
| 8 Panel items inside new features | macOS defaults: battery icon without % (toggle), the input-source menu shown only with 2+ sources, no username in the menu bar. |
| 9 Login | Start on the desktop (macOS); Mission Control does not open at login. |
| 10 Launchpad | Keep Launchpad (folders, ordering, jiggle delete), not Tahoe's "Apps". |
| 11 Desktop icons (DING) | If DING is present, wallpaper clicks are only taken on empty wallpaper; widgets sit above DING's window. |
| 12 Status items | Kiwi hosts StatusNotifierItems itself (P6); it can defer to the AppIndicator extension if that is enabled. |
| 13 Real blur | No (faux glass only, owner). |
| 14 Installer target | Kiwi stays on F44/GNOME 50. The installer should add F44/GNOME 50 + dnf5daemon support before integration (P7). |

Other macOS defaults that apply: dock magnification **off**, dock at the bottom, "minimize windows into application icon" **off**, Genie as the minimize effect, menu bar shown in full screen **off**, Stage Manager **off** by default (macOS ships it off; toggle in Control Center), Focus off.

## 13. AI features: skipped (owner, 2026-10-27)
The owner dropped AI features entirely: no Writing Tools, summaries, "Search or Ask", Live Text, voice or image generation. Focus on making every other feature complete and working. (The earlier local-only design is in git history if it's ever revisited.)
