# Kiwi overhaul plan (v3): one macOS-style desktop on GNOME 50

Status: **draft for owner review**. Nothing here is built yet.
Target: Fedora 44, GNOME Shell 50, Wayland only.

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

The installer (the owner's own macOS-style installer) is planned after the owner shares it (§9).

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
- **Shell behaviour:** Super toggles Spotlight, up-swipes stop at workspaces, hot corner off.
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
- **Keyboard:** Alt/F10 focuses the menu bar; arrow keys move between menus; mnemonics.
- **Verification** (in the real test environment): Text Editor (GTK actions), Nautilus, Calculator, a GTK3 app with a menu bar, a Qt app under Xwayland, VS Code or Chrome under Xwayland, LibreOffice, Firefox (AT-SPI).

### 5.2 Dock
- **Contents:** pinned apps, running apps, separator, Downloads stack, Trash.
- **Looks and motion:** faux glass. Magnification (setting, off by default like macOS). Bounce on launch and on attention requests. Running dots.
- **Menus and interaction:**
  - right-click menu: windows list, Keep in Dock, Open at Login, Show in Files, Quit;
  - drag to reorder or remove (a poof animation);
  - drop files onto app icons to open them with that app.
- **Settings:** position (bottom, left or right), size, auto-hide with a delay, "minimize windows into application icon", and "show recent apps".
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
  - a scripted scenario suite (the 9 scenarios from the last test round, plus new ones) runs in the test environment with real apps on every change;
  - fuzz tests on the model with random window events.

### 5.6 Notch v3
- **Behaviour:**
  - hover to expand (with a delay), and click;
  - tabs in the expanded view: *Now* (media, live activities) / *Tray* (the file shelf) / *Widgets* (calendar day, weather, quick toggles).
- **Live activities:** charging and battery, timers (from Clocks or Kiwi's own), screen recording, Bluetooth headphones, the next calendar event, download progress.
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

### 5.8 Faux Liquid Glass
- **One look for every surface:**
  - a rgba tint plus a vertical gradient;
  - a 1px top rim highlight and a 1px bottom shade;
  - a soft drop shadow;
  - optional subtle noise.
- **Variants:** light and dark, high contrast (solid) and reduced transparency.

### 5.9 Control Center, Spotlight, clipboard, calendar
Keep the round-2 designs, restyled with faux glass, wired to the core model, and bugs fixed. Spotlight also searches the app menu's commands of the focused app, like macOS Help search.

## 6. Settings
- **Prefs layout:** one page per feature in the sidebar (General, Menu Bar, Dock, Mission Control, Stage Manager, Notch, Windows, Spotlight, Control Center, Clipboard, Appearance, About).
- **Reset:** a "Reset everything" button.
- **Schema:** new keys under clear prefixes (`menubar-*`, `dock-*`, `mc-*`, `sm-*`, `notch-*`, `windows-*`, `glass-*`). Old keys are migrated once, then deprecated.

## 7. Phases (each ends merged to main, tested in the real GNOME 50 environment)
| Phase | Content |
|---|---|
| **P0 Cleanup** | Remove the 18 dropped features and their keys, CSS and assets; the user-file cleanup; the new folder layout; the `core/` skeleton (desktop, layout, motion, events); the prefs sidebar regrouped. Expect no visible change except the removals. |
| **P1 Foundation features** | Faux glass; the menu bar with the logo menu and generic + GTK-action app menus; the dock (without Genie); window tiling and the green-button menu |
| **P2 Motion** | Genie/Scale; the dock bounce and magnification; the shared springs applied to the notch, Spotlight and Control Center |
| **P3 Mission Control and gestures** | Mission Control, App Exposé, the app switcher, trackpad gestures |
| **P4 Stage Manager v3** | The rebuild on the core model, plus the scenario and fuzz suites |
| **P5 Notch v3** | Hover, tabs, live activities, file shelf, widgets, performance pass |
| **P6 App menu, full** | Exported GTK menu bars, the DBusMenu registrar, AT-SPI experimental, Help search |
| **P7 Installer** | Integrate with the owner's installer (§9) |
| **P8 Polish** | An adversarial review round, a full test sweep, docs, an EGO-readiness check |

**Parallelism.** P1 runs as 4 parallel agents (glass, menu bar, dock, windows). P3–P6 overlap where they don't share files; all of them depend on P0's `core/`.

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

## 9. Installer (waiting on the owner)
The owner has a macOS-style installer. Once it is shared, plan:
- what it installs: the extension zip, optional GSConnect and fonts;
- whether it replaces `make install`;
- first-run onboarding (pick dock side, logo, glass) matching the installer's look;
- update and uninstall paths that restore the user's GNOME settings (button-layout, dock, hot corner).

## 10. Open questions for the owner
1. **Logo:** Fedora logo or Kiwi logo in the menu bar? (A setting either way; which is the default?)
2. **Dock default position:** bottom (macOS default)?
3. **Fonts:** should Kiwi ship or recommend Inter / SF-like fonts for the menu bar, or keep Cantarell/Adwaita Sans?
4. **Keyboard:** Super acts as ⌘ for menu-bar shortcuts shown in menus (display only; real Cmd remapping needs keyd, outside the extension). Ok?
5. **Installer:** please share it (or its repo) so §9 can be planned.
