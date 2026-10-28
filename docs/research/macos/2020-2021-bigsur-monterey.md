# macOS 11 Big Sur (2020) and macOS 12 Monterey (2021): feature research for Kiwi

Scope: the user-facing desktop and system features of Big Sur and Monterey, including their point
releases (11.1–11.7, 12.1–12.7), plus the bundled-app changes that shape the desktop experience.
Each feature follows the template in `README.md`. Port judgements target **GNOME Shell 50 on
Fedora 44, Wayland only**, and the plan in `docs/architecture/overhaul-plan.md` (menu bar, dock,
Mission Control, Stage Manager, notch, Spotlight, Control Center, clipboard, faux glass).

Conventions used below:
- "Kiwi status" refers to the merged code (`docs/architecture/code-map.md`) and the overhaul
  plan. *Planned* means the overhaul plan already has it; it is not built yet.
- Effort: **S** ≤ 2 days, **M** ≤ 1–2 weeks, **L** several weeks, **XL** a project of its own.
- GNOME facts that may have shifted between releases are marked "check on 50" where relevant.

---

## Release overviews

### macOS 11 Big Sur (announced WWDC 22 June 2020, released 12 November 2020)
- The biggest visual redesign since Mac OS X (Apple's words). Rounder windows, full-height
  sidebars, "unified" toolbars that absorb the title, borderless toolbar buttons, SF Symbols
  everywhere, iOS-style squircle app icons, a much more translucent menu bar and a floating Dock,
  centred alert dialogs and redone system sounds (and the startup chime returns).
- Control Center arrives on the Mac in the menu bar; modules can be dragged out into the menu bar.
- Notification Center is rebuilt: clicking the clock opens one floating column with grouped,
  interactive notifications on top and iOS 14-style WidgetKit widgets (S/M/L) below.
- First macOS for Apple Silicon (M1): Rosetta 2, Universal 2 binaries, iPhone/iPad apps on the Mac.
- Version number jumps from 10.15 to 11 (legacy software still sees "10.16").
- System: signed system volume (SSV), updates that install in the background, Time Machine to APFS.
- Apps: Safari 14 (custom start page, favicons and hover previews in tabs, Privacy Report,
  translation, WebExtensions), Messages rebuilt on Catalyst (pins, mentions, inline replies,
  effects), Maps on Catalyst (Look Around, Guides), new Battery pane with usage history.
- Point releases: 11.1 AirPods Max, News widgets, App Store privacy labels; 11.3 AirTag/Find My,
  resizable iPhone/iPad app windows on M1, Xbox Series/DualSense controllers; 11.4/11.5 Podcasts.
- Removed: font-smoothing checkbox, the option to hide the menu bar clock, the Calculator widget,
  Network Utility.

### macOS 12 Monterey (announced WWDC 7 June 2021, released 25 October 2021)
- A refinement release on Big Sur's design, centred on "connect, focus, work across devices".
- Focus replaces Do Not Disturb: multiple named profiles with allow-lists of people and apps,
  schedules and app/location triggers, sync across devices, Focus status shared with contacts,
  time-sensitive notifications.
- Shortcuts comes to the Mac (menu bar, Finder Quick Actions, Services, Dock, `shortcuts` CLI),
  positioned as the successor to Automator.
- Continuity: AirPlay to Mac (Mac as AirPlay receiver/speaker), Universal Control (12.3, one
  keyboard and pointer across Macs and iPads), SharePlay in FaceTime (12.1).
- Live Text and Visual Look Up in images system-wide; Quick Note from a hot corner or Globe+Q.
- Safari 15: tab groups, an optional compact tab bar with site tinting (after a reverted redesign).
- Privacy: orange microphone dot in the menu bar plus a Control Center list of apps using the
  mic/camera, Mail Privacy Protection, iCloud+ (Hide My Email, Private Relay beta).
- Mac laptops get Low Power Mode; new password manager pane; "Erase All Content and Settings".
- Smaller UI bits: notifications with bigger app icons and contact photos, per-app mute from a
  right-click, full-screen green-button options, "show menu bar in full screen", windows that
  resize when dragged to a smaller display, custom pointer colours, a "Games" Launchpad folder.
- Point releases: 12.1 SharePlay, Hide My Email in Mail, Messages safety; 12.3 Universal Control
  (beta), spatial-audio Control Center controls, removal of Python 2.7; 12.4/12.5 bug fixes.

---

## Big Sur: design and visual language

### Window chrome redesign (unified toolbars, full-height sidebars, rounder corners)
- **Introduced / changed:** Big Sur 11.0; Monterey adds "Show window title icons" (Accessibility › Display).
- **What it is:** Window corners get a larger radius (close to an iPhone X screen). Many apps drop the
  separate title bar and become "unified": the title sits inline in the toolbar, the traffic lights
  get extra padding, and the sidebar runs uninterrupted to the top edge of the window (three
  full-height columns in Mail and Notes). Toolbar buttons are borderless glyphs that show a
  background only on hover or press. The search field collapses into a magnifier button when the
  window is narrow. The proxy icon next to the title appears only on hover. Active vs inactive
  windows differ mainly by shadow depth and contrast; inactive windows lose more contrast.
  Controls are tweaked: rounder checkboxes, pill-ended progress bars, oval slider knobs with
  integrated ticks, padded pop-up buttons, segmented tabs drawn as a continuous strip, and a
  second, larger button size for setup screens and alerts.
- **Caveats (on macOS):** Reviewers (Ars Technica) called the lower contrast the one objectively
  negative change: it is harder to see where controls are and which window is active. The hover-only
  proxy icon hurt discoverability until Monterey added a toggle. Older Chrome/Edge builds collided
  with the new traffic-light padding.
- **Port to GNOME 50:** Not Kiwi's job for app windows: libadwaita already ships unified header bars,
  full-height split views (`AdwNavigationSplitView`, `AdwOverlaySplitView`), flat header-bar buttons
  and collapsing search. The owner dropped GTK theming (overhaul plan §2). Kiwi can keep its rounded
  corners effect (`apps/roundedCorners`) and its own window-shadow/inactive treatment, and match the
  look in its own Shell surfaces (menus, Control Center, dialogs) through `stylesheet.css` tokens.
- **Blockers / risks:** No way to restyle client-side decorations from the Shell without GTK
  theming; GTK3/Qt/Electron apps keep their own chrome. Rounded corners rely on `Shell.GLSLEffect`,
  which is gone in GNOME 51 (code-map, roundedCorners).
- **Linux equivalents today:** libadwaita (GNOME 45+ design), adw-gtk3 for GTK3 apps, WhiteSur GTK
  theme (macOS look-alike), Rounded Window Corners Reborn extension.
- **Kiwi status:** partial (rounded corners; traffic lights in the menu bar planned).
- **Recommendation:** Skip (app chrome) / keep rounded corners, **effort S** for matching Kiwi's own surfaces: libadwaita already delivers this and GTK theming is out of scope.

### Squircle app icons
- **Introduced / changed:** Big Sur 11.0.
- **What it is:** Every Apple app icon becomes an iOS-style rounded square (continuous-curvature
  "superellipse") on a fixed grid, with more depth than iOS: drop shadows, highlights, and some
  objects (Xcode's hammer, TextEdit's pencil) that break out of the plate. Folder and drive icons
  are also rounder. Third-party developers were pushed to adopt the shape; old-style icons look out
  of place in the Dock.
- **Caveats (on macOS):** Mixed reception ("neumorphism"); critics called the approach
  inconsistent (some icons with shading, some just the old glyph pasted on a square). Uniform
  shapes reduce at-a-glance recognisability.
- **Port to GNOME 50:** Two options. (1) Recommend or bundle-in-installer a macOS-like icon theme
  (the installer is planned, §9) rather than shipping one. (2) In Kiwi's own dock and Launchpad,
  draw an optional squircle "plate" behind icons that are not already square (St widget with a
  large `border-radius` and gradient behind the `St.Icon`; detecting shape needs icon pixel
  analysis, so make it a per-app or global switch). A true superellipse mask would need a shader.
- **Blockers / risks:** Apple's icons are copyrighted and must not be shipped. Masking arbitrary
  icons needs `Clutter.ShaderEffect`/`GLSLEffect`, which changes in GNOME 51. Icon themes are user
  files: Kiwi must not overwrite a theme the user installed.
- **Linux equivalents today:** WhiteSur, MacTahoe and Colloid icon themes; GNOME's own icon style is
  already a rounded-square-ish "cushion" for many core apps.
- **Kiwi status:** none.
- **Recommendation:** Later (P3), **effort M**: a plate behind non-square icons in Kiwi's own dock is cheap; full icon theming belongs to the installer.

### SF Symbols as the system glyph set
- **Introduced / changed:** Big Sur 11.0 (SF Symbols 2), expanded in Monterey (SF Symbols 3, hierarchical/palette colour).
- **What it is:** All toolbar, sidebar and menu-bar glyphs become SF Symbols, vector glyphs drawn to
  match the San Francisco font's weights and sizes, which follow the accent colour and accessibility
  text sizes. Developers use the same set via AppKit/SwiftUI/Catalyst.
- **Caveats (on macOS):** Licence restricts SF Symbols to Apple platforms; third-party apps not
  using them look inconsistent.
- **Port to GNOME 50:** Use Adwaita symbolic icons (already weight-matched to Adwaita Sans/Cantarell)
  for every Kiwi surface, and draw any missing glyphs in-house as symbolic SVGs under `icons/`.
- **Blockers / risks:** Licence: SF Symbols and SF Pro cannot be redistributed or used on Linux.
- **Linux equivalents today:** Adwaita symbolic icons, the GNOME Icon Library app, Phosphor/Lucide sets.
- **Kiwi status:** partial (Kiwi ships its own symbolic SVGs).
- **Recommendation:** Skip (licence), **effort S** to keep using symbolic icons consistently: there is nothing to port.

### Redesigned menu bar: spacing, height and wallpaper-adaptive translucency
- **Introduced / changed:** Big Sur 11.0.
- **What it is:** The menu bar is a few pixels taller with a smaller font, wider spacing between
  status items and more vertical padding in menus. Its translucency is turned up so far that macOS
  recolours the bar from the wallpaper underneath: a light wallpaper gives a light bar with dark
  text, a dark wallpaper a dark bar with white text, independent of Light/Dark mode. The menu
  highlight in the bar becomes a grey patch rather than the accent colour, while the drop-down menus
  themselves still follow Light/Dark and the accent. Apple says the material "becomes more vibrant
  when you interact with it". Reduce Transparency turns the bar solid white or black.
- **Caveats (on macOS):** Readability on cheap or low-density displays; the bar no longer shows the
  accent colour; busy wallpapers produce mid-grey bars.
- **Port to GNOME 50:** Part of the planned menu bar (§5.1) and faux glass (§5.8). Sample the
  wallpaper strip behind the bar asynchronously (the dropped `panelTransparency.js` already has
  async wallpaper sampling and a cancellable), compute luminance per monitor, and switch the bar
  between `kiwi-menubar-light`/`-dark` classes; re-sample on `changed::picture-uri(-dark)` of
  `org.gnome.desktop.background` and on monitor changes. When a window is maximised under the bar,
  macOS keeps the translucent bar; Kiwi's faux glass can do the same (tint over the window).
- **Blockers / risks:** No real backdrop blur (owner chose faux glass), so the "material" is a tint
  plus gradient; sampling must not block (use `GdkPixbuf` async loaders or a `Gio` stream, never
  sync file reads, EGO-X-002). Per-monitor wallpapers and slideshows/dynamic wallpapers (XML) need
  handling.
- **Linux equivalents today:** Blur my Shell (real blur), Transparent Top Bar, Dynamic Panel extensions.
- **Kiwi status:** partial (old panel-transparency is being dropped; new menu bar planned).
- **Recommendation:** Port (P1 core), **effort M**: it defines the look of the menu bar Kiwi is building anyway.

### Floating, rounder Dock
- **Introduced / changed:** Big Sur 11.0.
- **What it is:** The Dock gets rounder corners, the same translucency as the menu bar, and a thin
  gap above the screen's bottom edge so it "floats" like the iPadOS dock. Settings unchanged:
  position, size, magnification, Genie/Scale minimise, auto-hide, recent apps.
- **Caveats (on macOS):** The gap is small; magnification is still off by default.
- **Port to GNOME 50:** Covered by Kiwi's own dock (§5.2): a `Main.layoutManager.addChrome` actor
  with a struts-aware rect owned by `core/layout.js`; the gap is just a bottom margin (the strut
  must then include it, or windows will touch the dock).
- **Blockers / risks:** Struts with a margin must stay in sync with tiling and Stage Manager.
- **Linux equivalents today:** Dash to Dock (floating mode, "panel mode" off), Dash to Panel.
- **Kiwi status:** planned (dock).
- **Recommendation:** Port (P1 core), **effort S** on top of the planned dock: a margin and radius tokens.

### Centred, iOS-style alert dialogs
- **Introduced / changed:** Big Sur 11.0; Monterey converts the remaining horizontal system dialogs.
- **What it is:** Alerts become translucent rounded panels with the icon on top, centred text and
  vertically stacked large buttons. In-app alerts no longer slide down as a sheet from the title
  bar: they spring up in the middle of the window and dim the whole window. The area above the text
  is a drag handle. Very long alerts get a scroll bar. File pickers still use sheets.
- **Caveats (on macOS):** Vertical layouts suit tall phone screens, not wide Mac screens; busy
  dialogs grew very tall in 11.0 (fixed later).
- **Port to GNOME 50:** App dialogs: libadwaita's `AdwAlertDialog` (GNOME 46+) is already a centred
  card with stacked buttons when narrow. Shell dialogs (polkit authentication, end-session, "app is
  not responding", Wi-Fi password) use `ModalDialog`/`Dialog` in `js/ui/`; Kiwi can restyle them
  with gated CSS (`.kiwi-dialogs .modal-dialog …`) to faux glass, centred text and pill buttons.
- **Blockers / risks:** Restyling stock dialogs touches stock classes, so gate every rule behind a
  Kiwi class (code-map D6 rule). Polkit's dialog is security UI: never change its behaviour.
- **Linux equivalents today:** `AdwAlertDialog`, `AdwDialog`; GNOME Shell's own modal dialogs.
- **Kiwi status:** none.
- **Recommendation:** Port (P2), **effort S**: a CSS pass on Shell's modal dialogs gives a lot of Big Sur feel cheaply.

### Wallpaper tinting of windows and Reduce Transparency
- **Introduced / changed:** Big Sur 11.0 (General › "Allow wallpaper tinting in windows", now in Light mode too).
- **What it is:** Window backgrounds pick up a faint tint from the desktop picture behind them.
  Big Sur makes it a separate toggle (no longer tied to the Graphite accent). Accessibility ›
  Display › Reduce Transparency removes translucency system-wide (menu bar, Dock, sidebars,
  Control Center); Increase Contrast adds borders.
- **Caveats (on macOS):** Subtle; some users find tints muddy.
- **Port to GNOME 50:** For Kiwi's own surfaces only: derive a tint colour from the same wallpaper
  sample as the menu bar and feed it into `lib/glass.js` parameters (`glassParams.js` already maps
  settings to tint). Add Kiwi settings "Wallpaper tint" and "Reduce transparency" (solid fills),
  and follow GNOME's `org.gnome.desktop.a11y.interface high-contrast` for the solid variant.
- **Blockers / risks:** GTK app windows cannot be tinted; GNOME has no system-wide "reduce
  transparency" key (check on 50), so Kiwi's switch is its own.
- **Linux equivalents today:** GNOME accent colours (47+), high-contrast mode.
- **Kiwi status:** partial (glass variants planned in §5.8).
- **Recommendation:** Port (P1 core), **effort S**: it is a parameter of the faux glass already being built.

### Multicolour accent colour
- **Introduced / changed:** Big Sur 11.0.
- **What it is:** A new default "multicolour" accent lets each app use its own accent (Notes
  yellow, Finder blue); picking a fixed accent overrides apps.
- **Caveats (on macOS):** Few apps use it; the effect is barely noticeable.
- **Port to GNOME 50:** GNOME 47+ has a system accent colour (`org.gnome.desktop.interface
  accent-color`). Kiwi's surfaces should read it (toggles, sliders, focus rings) instead of a
  hard-coded blue; there is no per-app accent concept to port.
- **Blockers / risks:** None significant.
- **Linux equivalents today:** GNOME accent colours.
- **Kiwi status:** partial (check that Control Center/Spotlight/notch follow the accent).
- **Recommendation:** Port (P1 core), **effort S**: follow the GNOME accent everywhere.

### New system sounds and the returning startup chime
- **Introduced / changed:** Big Sur 11.0 (Sound pane: "Play sound on startup").
- **What it is:** All alert and UI sounds are remastered from snippets of the originals (Glass →
  Crystal, Pop → Bubble, etc.), including trash, file move, screenshot and lock sounds. The startup
  chime, silent on Macs since 2016, returns by default with an off switch.
- **Caveats (on macOS):** Mostly cosmetic; some users disliked the new tones.
- **Port to GNOME 50:** Sounds: ship an original (not Apple-derived) freedesktop sound theme only
  through the installer, or let Kiwi play its own short sounds for Kiwi events (dock poof, Spotlight
  open, screenshot already plays a Shell sound) with `global.display.get_sound_player()
  .play_from_file()`, behind a setting. Startup chime: firmware-time chime is impossible; a login
  chime can be played once per session from `enable()` (guarded so it does not replay after every
  unlock, because Kiwi re-enables on unlock without `session-modes`).
- **Blockers / risks:** Apple's sounds are copyrighted. Re-enable on unlock would replay the chime
  unless guarded (e.g. compare the session start time). Users may hate unexpected sound: off by default.
- **Linux equivalents today:** freedesktop sound theme, `org.gnome.desktop.sound` (event sounds,
  input feedback), GNOME Shell's own screenshot and volume sounds.
- **Kiwi status:** none.
- **Recommendation:** Later (P3), **effort S**: pleasant polish, but needs original audio assets.

### Redesigned login window and Recovery
- **Introduced / changed:** Big Sur 11.0.
- **What it is:** Larger user pictures, rounder fields, the login background follows the chosen
  user's wallpaper (not on FileVault Macs); Recovery becomes a centred rounded panel with big icons.
- **Caveats (on macOS):** FileVault Macs always show the default wallpaper.
- **Port to GNOME 50:** The login screen is GDM's Shell in `gdm` session mode; a user-installed
  extension does not run there. The lock screen (`unlock-dialog` mode) is reachable if Kiwi lists
  `unlock-dialog` in `session-modes`, which Kiwi does not today. Recovery is a firmware/OS concern.
- **Blockers / risks:** EGO reviewers scrutinise lock-screen code; GDM theming needs root files.
- **Linux equivalents today:** GDM Settings app (`gdm-settings`), Login Manager Settings.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort L**: outside a user extension's reach; maybe a lock-screen style later.

---

## Big Sur: menu bar, Control Center and Notification Center

### Control Center in the menu bar
- **Introduced / changed:** Big Sur 11.0; Monterey adds Focus, mic/camera usage and video/mic-mode modules; 12.3 adds spatial audio controls.
- **What it is:** A menu-bar icon (two toggle switches) opens an iOS-like panel. Always-present
  modules: Wi-Fi, Bluetooth and AirDrop (grouped, blue when on), Do Not Disturb (Focus in 12),
  Keyboard Brightness and Screen Mirroring (square tiles), Display (brightness slider; click for
  Dark Mode, Night Shift, True Tone, Sidecar), Sound (volume slider; click for output devices), Now
  Playing (all players, artwork for Apple apps). Optional modules: Accessibility Shortcuts, Battery,
  Fast User Switching. Hovering a tile shows a chevron; clicking the label expands it in place into
  a detail view (network list, device list). Modules cannot be reordered inside the panel.
- **Caveats (on macOS):** Only about a dozen modules (iOS has 30+), no rearranging, no third-party
  modules, no keyboard shortcut to open it (MacStories).
- **Port to GNOME 50:** Kiwi already restyles the stock Quick Settings grid as Control Center
  (`apps/controlCenter`, 4 columns, reordered, user row, Now Playing). Big Sur fidelity adds: the
  grouped network tile (Wi-Fi/Bluetooth/AirDrop-like), square tiles, in-place expanding detail
  views (Quick Settings menus already open "in place" with `QuickMenuToggle` submenus), a Display
  module that merges brightness, Dark Style and Night Light, a Sound module with output list, and a
  keyboard shortcut (`lib/keybindings.js`, default empty). Faux glass via `Glass.watch`.
- **Blockers / risks:** The stock grid is private API (`quickSettings._grid`, `_indicators`); GNOME
  changes it often. Recreating tiles risks fighting other extensions that add Quick Settings items.
- **Linux equivalents today:** GNOME Quick Settings (since 43), Quick Settings Tweaker extension.
- **Kiwi status:** have (round-2 design; restyle and wiring to core planned in §5.9).
- **Recommendation:** Port (P1 core), **effort M**: already exists; finish the Big Sur module layout and detail views.

### Pinning Control Center modules to the menu bar
- **Introduced / changed:** Big Sur 11.0 (Dock & Menu Bar pane).
- **What it is:** Drag any module out of Control Center onto the menu bar; it stays in Control
  Center too. Per-module options in Dock & Menu Bar: "Show in Menu Bar" (always / when active, for
  e.g. AirDrop, Screen Mirroring, Now Playing). Cmd-drag a menu-bar item off the bar to remove it.
  The Sound item shows the current output device icon (e.g. AirPods).
- **Caveats (on macOS):** The settings pane spends a whole page per checkbox; menu-bar crowding
  pushed power users to Bartender.
- **Port to GNOME 50:** Kiwi menu bar (§5.1) can host a `PanelMenu.Button` per pinned module that
  opens the same detail view as a dropdown; a `menubar-pinned-modules` (`as`) key holds the order,
  with a "when active" variant. Drag-to-pin from the Control Center panel is possible with
  `DND.makeDraggable` onto a panel drop target; start with a prefs list and right-click "Show in
  Menu Bar". Placement through `coordinators/panelLayout.js`.
- **Blockers / risks:** Stock indicators (network, volume, power) already live in the panel's
  aggregate; duplicates must stay in sync. Panel space with the notch in the centre.
- **Linux equivalents today:** GNOME shows some system icons in the top bar automatically;
  extensions such as Bluetooth Quick Connect, Sound Input & Output Device Chooser.
- **Kiwi status:** none.
- **Recommendation:** Port (P2), **effort M**: core to the macOS menu-bar feel once the menu bar exists.

### Option-click details on Wi-Fi, Bluetooth and Sound
- **Introduced / changed:** Long-standing, kept in Big Sur's redesigned menus (Wi-Fi splits "Known" and "Other Networks").
- **What it is:** Option-click Wi-Fi shows IP and MAC addresses, BSSID, channel, RSSI/noise, transmit
  rate and diagnostics; Option-click Bluetooth shows MAC addresses and signal; Option-click Sound
  lists inputs too. Bluetooth shows battery levels of connected accessories.
- **Caveats (on macOS):** Hidden; discoverable only by word of mouth.
- **Port to GNOME 50:** In Kiwi's network/Bluetooth/sound detail views, read the Alt modifier
  (`global.get_pointer()` mask) on open. Wi-Fi details from NetworkManager via `gi://NM` (Shell
  already uses `NM.Client`); Bluetooth battery from UPower devices (`UPowerGlib`) or BlueZ
  `org.bluez.Battery1`; inputs from `Gvc.MixerControl` (Shell's volume code).
- **Blockers / risks:** Signal/noise fields vary by driver; keep reads async.
- **Linux equivalents today:** GNOME Settings › Wi-Fi details, `nmcli`, Bluetooth battery in Settings.
- **Kiwi status:** none.
- **Recommendation:** Later (P3), **effort S**: power-user nicety once the detail views exist.

### Now Playing in the menu bar
- **Introduced / changed:** Big Sur 11.0 (moved from Notification Center's Today view).
- **What it is:** A Control Center module and optional menu-bar item listing every app playing
  audio/video with play/pause/skip and artwork; third-party players (Chrome, IINA) included.
- **Caveats (on macOS):** Relies on apps adopting MediaRemote; the menu-bar item appears only while playing.
- **Port to GNOME 50:** MPRIS through Kiwi's shared `MprisWatcher`; already in Control Center and
  the notch. Owner decision: panel-media is dropped because the notch does media, so no separate
  menu-bar item.
- **Blockers / risks:** None beyond MPRIS quality per app.
- **Linux equivalents today:** GNOME's media message in the calendar menu; Media Controls extension.
- **Kiwi status:** have (Control Center Now Playing, notch live activity).
- **Recommendation:** Port (P1 core), **effort S**: keep it; the notch covers the menu-bar role.

### Battery menu and Fast User Switching items
- **Introduced / changed:** Big Sur 11.0.
- **What it is:** The Battery module shows charge, source, "battery needs service" alerts and the
  apps using significant energy; the percentage toggle moved to System Preferences. Fast User
  Switching shows a list of users and "Login Window…" as an icon (previously the user name).
- **Caveats (on macOS):** The Option-click battery condition moved to the Battery pane.
- **Port to GNOME 50:** Battery: UPower via Shell's power indicator; "apps using significant energy"
  has no Linux data source (no per-app energy accounting short of `powertop`); show "Power mode" and
  time remaining instead. User switching: the Shell's system menu already has "Switch User…" when
  several users exist (`Gdm` via `LoginManager`); expose it in the logo menu.
- **Blockers / risks:** Per-app energy data unavailable.
- **Linux equivalents today:** Quick Settings battery/power-mode menu, GNOME Usage app.
- **Kiwi status:** partial (battery-percentage-always in Control Center; logo menu planned).
- **Recommendation:** Port (P2), **effort S**: small items in the planned menu bar and logo menu.

### Clicking the clock opens Notification Center
- **Introduced / changed:** Big Sur 11.0.
- **What it is:** The dedicated Notification Center icon is gone; clicking the date and time opens the
  combined notifications-and-widgets column. Option-click the clock toggles Do Not Disturb. A
  two-finger swipe left from the right edge of the trackpad also opens it.
- **Caveats (on macOS):** Undiscoverable (no affordance on the clock); the clock can no longer be hidden.
- **Port to GNOME 50:** The stock clock already opens the date menu (calendar + notifications).
  Kiwi's menu bar puts the clock at the far right (`calendarRight` logic exists) and opens a Kiwi
  Notification Center panel instead of the stock menu; Alt-click toggles DND via
  `NotificationRouter.setDnd`. Keyboard: `Super+V` is GNOME's shortcut for the message tray; keep it.
- **Blockers / risks:** Edge-swipe: Clutter touchpad swipe events give finger count and deltas, not
  start position, so "from the right edge" cannot be detected; use a 2-finger gesture alternative or skip.
- **Linux equivalents today:** GNOME date menu (clock click), Super+V.
- **Kiwi status:** partial (calendar card; clock moves right with the notch).
- **Recommendation:** Port (P1 core), **effort S**: wiring of the planned menu bar; skip the edge swipe.

### Notification Center redesign: grouped, interactive notifications
- **Introduced / changed:** Big Sur 11.0; Monterey enlarges app icons and adds contact photos.
- **What it is:** One floating column, notifications on top. Notifications stack per app; click a stack
  to expand, "Show Less" to collapse; hovering the stack's × turns it into "Clear All". Only a few
  stacks show before a "N more notifications" button. Hovering a notification reveals a chevron to
  expand rich content (News summary and image, Mail inline reply, Calendar accept, Podcasts play);
  actions are folded into an "Options" button. Right-click: Deliver Quietly, Turn Off, Notification
  Preferences. Active banners on screen merge seamlessly into the panel when it opens.
- **Caveats (on macOS):** Options hidden behind hover cost an extra click (Reminders "Complete").
- **Port to GNOME 50:** GNOME 48+ already groups notifications per app in the message list (check on
  50 for the exact API). Kiwi builds a Notification Center panel fed by `NotificationRouter`
  (sources remain in the stock `MessageTray`): stacks per `Source`, expand/collapse with the shared
  springs, "Clear All" per stack (`source.destroy()` semantics or per-notification `destroy`),
  actions from `notification.actions`, and a right-click menu that writes the app's
  `org.gnome.desktop.notifications.application` keys (`show-banners`, `enable`) on explicit user
  action. When the notch is on it already takes banners; the panel is the history.
- **Blockers / risks:** Rich previews depend on what apps send (GNOME notifications carry title,
  body, icon, image, actions; no inline reply standard). `MessageTray` internals are private.
- **Linux equivalents today:** GNOME date menu message list (grouped since 48), Notification Banner
  Reloaded, Notification Center extensions.
- **Kiwi status:** partial (router, notch banners, calendar card and Control Center notification fallback).
- **Recommendation:** Port (P1 core), **effort L**: the macOS right-side column is a defining surface and Kiwi has the router already.

### Notification Center widgets (WidgetKit)
- **Introduced / changed:** Big Sur 11.0 (11.1 adds News; Monterey adds Find My people/items widgets).
- **What it is:** Below notifications, iOS 14-style widgets in Small, Medium and Large sizes: Calendar
  (up next, mini month), Clock (one analog city or four cities), Notes (folder or single note),
  Photos (Memories), Podcasts, Reminders (one list), Screen Time (opens the pane), Stocks, Weather,
  plus third-party widgets. Widgets are glanceable, mostly without buttons; clicking opens the app.
  Widgets live only in the panel (desktop widgets came in Sonoma).
- **Caveats (on macOS):** Few system widgets; no interactivity until Sonoma; no desktop placement.
- **Port to GNOME 50:** Kiwi ships its own widget set inside the Notification Center (and the notch
  "Widgets" tab, §5.6): Calendar (Shell's `CalendarServer`/EDS, as the date menu does), World Clock
  (`org.gnome.clocks world-clocks` + `GLib.DateTime`/`GLib.TimeZone`), Weather (`GWeather` with
  `org.gnome.shell.weather` locations, as the stock date menu does), Battery (UPower, including
  Bluetooth devices), Now Playing (MPRIS), Screen Time (GNOME 48+ wellbeing data via
  `org.gnome.desktop.screen-time-limits`/usage service, check on 50), Reminders/Tasks (EDS task
  lists via `gi://ECal` is heavy; maybe later), Clipboard (Kiwi's own). Each widget is a small St
  actor with S/M/L layouts and a pure model module for tests.
- **Blockers / risks:** No third-party widget ecosystem on Linux; each widget is Kiwi code to
  maintain. EDS access from the Shell must stay async. Weather needs location permission.
- **Linux equivalents today:** GNOME date menu (weather, world clocks, events), Desktop Widgets
  extensions, Conky.
- **Kiwi status:** partial (calendar card; notch widgets planned).
- **Recommendation:** Port (P2), **effort L**: high visual value; start with Calendar, Clock, Weather, Battery.

### Widget gallery and edit mode
- **Introduced / changed:** Big Sur 11.0.
- **What it is:** "Edit Widgets" at the bottom of Notification Center opens a full-screen gallery:
  a searchable app list, S/M/L preview buttons, a green "+" on hover or drag a widget to the column;
  remove with "–"; right-click a placed widget to change size or edit (e.g. pick a Reminders list).
- **Caveats (on macOS):** Discoverability of right-click editing.
- **Port to GNOME 50:** A Kiwi modal on `ModalSurface` listing the built-in widgets with size chips;
  drag-and-drop with `DND.makeDraggable` into the column; state in a `nc-widgets` key (array of
  `{id,size,config}` as JSON string or `a(ssv)`). Prefs page mirrors it for keyboard users.
- **Blockers / risks:** Only one Kiwi modal at a time (`ModalArbiter`); must close the panel first.
- **Linux equivalents today:** None in GNOME.
- **Kiwi status:** none.
- **Recommendation:** Port (P2), **effort M**: needed as soon as there is more than a fixed widget list.

---

## Big Sur: system and bundled apps

### Spotlight refinements (faster, Quick Look, default search in apps)
- **Introduced / changed:** Big Sur 11.0.
- **What it is:** The Spotlight bar is restyled (a single rounded field that grows into a list),
  results appear faster, Space/Cmd-Y opens a full Quick Look preview of the selected result, and
  Spotlight powers search in Safari, Pages and Keynote.
- **Caveats (on macOS):** Quick Look of web results is limited.
- **Port to GNOME 50:** Kiwi Spotlight exists (`apps/spotlight`). Add a preview pane or Space-to-
  preview: images via `St.Icon`/`GdkPixbuf` thumbnails from `~/.cache/thumbnails` (freedesktop
  thumbnail spec), text via a short async read, others via `org.gnome.NautilusPreviewer`
  (Sushi, `ShowFile` on D-Bus) when installed.
- **Blockers / risks:** Sushi opens its own window; previews of arbitrary types need it.
- **Linux equivalents today:** GNOME Shell search, Sushi (Space in Files), Ulauncher, Albert.
- **Kiwi status:** have (Spotlight); preview none.
- **Recommendation:** Port (P2), **effort M**: Quick Look in Spotlight is a daily-use macOS habit.

### Apple Silicon support and Rosetta 2
- **Introduced / changed:** Big Sur 11.0 (M1 Macs, 10 November 2020).
- **What it is:** macOS runs natively on ARM64. Rosetta 2 translates x86-64 apps ahead of time at
  install or first launch (re-translated after OS updates), with a "Open using Rosetta" checkbox in
  Get Info for Universal apps that need Intel plug-ins. No translation of kernel extensions,
  x86 virtualisation or AVX code. Activity Monitor shows a "Kind" column (Apple/Intel). Universal 2
  binaries ship both architectures.
- **Caveats (on macOS):** Intel and ARM code cannot mix in one process; first launch is slower.
- **Port to GNOME 50:** Not a desktop-shell feature. On ARM Linux (Fedora Asahi Remix) x86 apps run
  through FEX-Emu (and muvm for 4K-page needs); Flatpak handles multi-arch. Kiwi could at most label
  translated apps in an "About" or app-info view, which is not worth it.
- **Blockers / risks:** Hardware/OS level.
- **Linux equivalents today:** Fedora Asahi Remix, FEX-Emu, box64, Flatpak multi-arch.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort XL**: not something a Shell extension does.

### iPhone and iPad apps on the Mac
- **Introduced / changed:** Big Sur 11.0 on M1; 11.1 orientation and full-screen options; 11.3 resizable windows, keyboard tilt and controller mapping.
- **What it is:** iOS/iPadOS apps from the Mac App Store run unmodified (if the developer allows) in
  windows; touch alternatives map keys to taps and tilt.
- **Caveats (on macOS):** Many developers opted out; awkward touch-first UIs; window sizing limits.
- **Port to GNOME 50:** The Linux analogue is Android apps through Waydroid (an LXC container with
  Wayland windows). Kiwi need do nothing; Waydroid windows already appear in the dock and switcher.
- **Blockers / risks:** Not Kiwi's layer.
- **Linux equivalents today:** Waydroid, Anbox (dead).
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort XL**: platform feature, already served by Waydroid.

### Signed System Volume and background updates
- **Introduced / changed:** Big Sur 11.0.
- **What it is:** The system volume is a sealed, cryptographically hashed (SHA-256 per file) APFS
  snapshot; the Mac boots from it and updates write a new snapshot, so updates start downloading and
  preparing in the background and need less downtime.
- **Caveats (on macOS):** Users cannot modify system files; Time Machine no longer restores the OS.
- **Port to GNOME 50:** OS-level. Fedora Atomic desktops (Silverblue, ostree/bootc with composefs)
  give an immutable, image-based system with background staging; GNOME Software does offline updates.
- **Blockers / risks:** Not a desktop feature.
- **Linux equivalents today:** Fedora Silverblue/Kinoite, bootc, GNOME Software offline updates.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort XL**: belongs to the distribution, not the shell.

### Time Machine on APFS
- **Introduced / changed:** Big Sur 11.0 (Monterey adds better progress and time estimates).
- **What it is:** New backup disks use APFS snapshots: Ars measured 2.75× faster first and 4× faster
  incremental local backups; local disks are encrypted; the menu-bar item shows status.
- **Caveats (on macOS):** No conversion of HFS+ backups; no full-system restore.
- **Port to GNOME 50:** Kiwi could show a status item/Control Center module for an existing backup tool
  (Déjà Dup and Pika Backup have no stable public status D-Bus API; check), but the backup engine is
  out of scope.
- **Blockers / risks:** No common backup status API.
- **Linux equivalents today:** Déjà Dup, Pika Backup (Borg), Snapper/Btrfs snapshots, Timeshift.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort M**: low value for the shell; leave to backup apps.

### Battery preference pane with Usage History
- **Introduced / changed:** Big Sur 11.0 (optimised charging carried over from Catalina 10.15.5).
- **What it is:** Laptops get a Battery pane merging Energy Saver: Usage History charts (battery level
  and screen-on time for 24 hours or 10 days), Battery/Power Adapter settings, Schedule, and
  battery health management/optimised charging.
- **Caveats (on macOS):** Desktops keep the old Energy Saver pane.
- **Port to GNOME 50:** Settings territory. UPower keeps history (`GetHistory` on device objects),
  so a Kiwi battery widget could draw a 24-hour sparkline; GNOME 48+ has a charge-limit option in
  Settings (check on 50).
- **Blockers / risks:** UPower history quality varies; drawing charts in St needs `St.DrawingArea`/Cairo.
- **Linux equivalents today:** GNOME Settings › Power, GNOME Power Statistics, GNOME Usage.
- **Kiwi status:** none.
- **Recommendation:** Later (P3), **effort M**: a battery widget with history is nice but not core.

### Safari 14 redesign (start page, favicon tabs, Privacy Report, translation)
- **Introduced / changed:** Safari 14 with Big Sur (also on Catalina/Mojave).
- **What it is:** Customisable start page (background image, sections: Favorites, Frequently
  Visited, Privacy Report, Reading List, iCloud Tabs, Siri Suggestions); favicons in tabs by default
  and tabs shrink to icon-only; hover a tab for a page preview; Privacy Report of trackers blocked by
  Intelligent Tracking Prevention; built-in translation (beta); WebExtensions API for extensions;
  password breach monitoring; WebP; VP9/4K HDR; Flash removed.
- **Caveats (on macOS):** Translation US/Canada only at launch; extensions must ship via the App Store.
- **Port to GNOME 50:** Browser features, not shell features. Kiwi dropped Firefox theming (§2).
- **Blockers / risks:** App cooperation.
- **Linux equivalents today:** Firefox (tab previews, translations, ETP report), Epiphany/GNOME Web.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort XL**: belongs to the browser.

### Messages rebuilt on Catalyst
- **Introduced / changed:** Big Sur 11.0; Monterey adds Shared with You and photo stacks.
- **What it is:** Feature parity with iOS: up to nine pinned conversations, @mentions, inline threaded
  replies, effects (balloons, confetti), #images GIF search, Memoji stickers, group photos, smarter
  search.
- **Caveats (on macOS):** Catalyst look; iMessage is Apple-only.
- **Port to GNOME 50:** Not applicable (app and Apple service). Kiwi's job is only to show its
  notifications well (inline reply is not standard in GNOME notifications).
- **Blockers / risks:** Apple service.
- **Linux equivalents today:** Fractal (Matrix), Chatty, Signal Desktop, GSConnect SMS.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort XL**: Apple service.

### Maps, Photos, Voice Memos and App Store updates
- **Introduced / changed:** Big Sur 11.0 (11.1 App Store privacy "nutrition labels").
- **What it is:** Maps on Catalyst with Look Around, Guides, cycling and EV routing, indoor maps;
  Photos editing and Retouch; Voice Memos folders, Favorites, Enhance; App Store privacy labels and
  a Safari Extensions category.
- **Caveats (on macOS):** Region-limited data.
- **Port to GNOME 50:** App-level. GNOME Software's "Safety"/context tiles already show permissions
  and licence, the closest match to privacy labels.
- **Blockers / risks:** None for Kiwi.
- **Linux equivalents today:** GNOME Maps, Shotwell/GNOME Photos-like apps (Loupe for viewing),
  GNOME Sound Recorder, GNOME Software.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort XL**: bundled apps, not desktop shell.

---

## Monterey: focus, notifications and privacy

### Focus modes
- **Introduced / changed:** Monterey 12.0 (Notifications & Focus pane); Ventura later adds Focus filters.
- **What it is:** Do Not Disturb becomes one of several Focus profiles (Do Not Disturb, Work,
  Personal, Sleep, Driving from iPhone, plus Gaming, Mindfulness, Reading, Fitness and up to ten
  Custom ones with a name, colour and glyph). Each Focus has "Allowed Notifications From" People and
  Apps lists, options to allow time-sensitive notifications, calls from everyone/Favorites/groups and
  repeated calls (twice within three minutes). "Turn On Automatically": time schedules, arriving at
  or leaving a location, or while a chosen app is open (Gaming turns on when a game controller
  connects). Control Center's Focus module offers "for 1 hour", "until this evening", "until I
  leave". An active Focus shows its glyph in the menu bar. "Share across devices" syncs state via
  iCloud; "Share Focus Status" lets Messages tell contacts you have notifications silenced, and they
  can "Notify Anyway".
- **Caveats (on macOS):** Sync across devices can switch the Mac into Focus unexpectedly; Focus filters
  (per-app content) arrived only in Ventura.
- **Port to GNOME 50:** Shell extension on top of `NotificationRouter`: a pure `focus/model.js` holds
  profiles (`{id,name,icon,color,allowedApps[],allowTimeSensitive,schedules[],appTriggers[]}`) and
  decides per notification (app id from `source.app?.id`/`policy.id`, urgency CRITICAL = time
  sensitive). The adapter filters banners (sink) and still files notifications into the history like
  macOS. Triggers: `GLib.timeout` at the next schedule edge; app triggers from `Shell.AppSystem`
  `app-state-changed`; game controller from `GUdev` is overkill, so skip. Control Center module with
  durations; a menu-bar glyph while active; GNOME's own DND key is set while the plain Do Not
  Disturb Focus is active so other apps see it.
- **Blockers / risks:** No people allow-list (notifications have no sender identity standard); no
  location triggers without GeoClue permission (skip); no cross-device sync (GSConnect could relay a
  state later). GNOME's DND still lets CRITICAL notifications through, which matches time-sensitive.
- **Linux equivalents today:** GNOME Do Not Disturb toggle (Quick Settings since 48), per-app
  notification switches in Settings.
- **Kiwi status:** partial (Control Center owns DND).
- **Recommendation:** Port (P2), **effort M**: a real productivity gain that only a shell can implement, and the router is already there.

### Time-sensitive notifications and per-app mute
- **Introduced / changed:** Monterey 12.0.
- **What it is:** Apps can mark notifications as time-sensitive (Calendar, Reminders) so they break
  through a Focus; each app's Notifications settings can allow or block this. Right-click any
  notification to "Mute for 1 hour", "Mute for today" or "Turn off notifications". Notifications
  show larger app icons and contact photos for people.
- **Caveats (on macOS):** Developers can abuse time-sensitive (Apple asks them not to).
- **Port to GNOME 50:** Map time-sensitive to GNOME's `MessageTray.Urgency.CRITICAL`/HIGH. Mute
  timers are Kiwi state in the router (a map of app id → until), persisted in a Kiwi key so a lock/
  unlock re-enable keeps them. "Turn off" writes the app's GNOME notification settings only on that
  explicit click. Contact photos: use the notification's `gicon`/image when apps send one.
- **Blockers / risks:** Many apps send everything at NORMAL urgency.
- **Linux equivalents today:** GNOME Settings › Notifications per app.
- **Kiwi status:** none.
- **Recommendation:** Port (P2), **effort S**: small router addition that makes Focus and Notification Center feel right.

### Microphone and camera in-use indicators
- **Introduced / changed:** Monterey 12.0 (later releases add purple for screen/audio recording and blue for location).
- **What it is:** An orange dot appears next to the Control Center icon (top-right of the menu bar)
  while any app uses the microphone; the camera already has a green hardware LED. Opening Control
  Center lists, at the top, the apps currently using the mic or camera.
- **Caveats (on macOS):** The dot is tiny; in full screen it shows in the corner. On the 2021 notched
  MacBook Pro menu-bar items could hide behind the camera housing (fixed in 12.1).
- **Port to GNOME 50:** GNOME already has the data: the Shell's volume code shows a microphone
  indicator from `Gvc.MixerControl` source outputs (with app names), GNOME 45+ added a camera-in-use
  indicator based on PipeWire camera nodes (gnome-shell MR !2840), and screencast/screen-sharing
  indicators exist. Kiwi hides or restyles these icons into one orange/green dot beside its Control
  Center icon and lists the apps (name and icon from the stream's application properties) at the top
  of Control Center; in the notch, a privacy live activity can show the same dot.
- **Blockers / risks:** The camera monitor only sees apps using PipeWire for the camera (V4L2-direct
  apps are invisible); hiding stock indicators must be restored on disable; private indicator
  classes may move between releases.
- **Linux equivalents today:** GNOME's mic, camera (45+), screen-share and screencast indicators.
- **Kiwi status:** none.
- **Recommendation:** Port (P1 core), **effort S**: trust signal users expect from macOS, mostly restyling data GNOME already has.

### Mic Mode and Video Effects modules (Voice Isolation, Portrait)
- **Introduced / changed:** Monterey 12.0 (FaceTime and adopting apps).
- **What it is:** During a call, Control Center shows Mic Mode (Standard, Voice Isolation, Wide
  Spectrum) and Video Effects (Portrait background blur on Apple Silicon) for the app using them.
- **Caveats (on macOS):** Hardware limits (T2/Apple Silicon); per-app adoption.
- **Port to GNOME 50:** Noise suppression can be a PipeWire filter-chain virtual source (RNNoise
  LADSPA) that a helper creates; Kiwi's tile would switch the default input to it. Background blur
  needs a virtual camera (v4l2loopback) helper; both are system configuration, not extension code.
- **Blockers / risks:** Needs packages (rnnoise plugin, EasyEffects or a helper); EGO forbids
  installing things; changing default devices surprises users.
- **Linux equivalents today:** EasyEffects (noise reduction), NoiseTorch (archived), Linux Studio
  Plugins, Webcamoid/OBS virtual camera.
- **Kiwi status:** none.
- **Recommendation:** Later (P3), **effort M**: a tile that toggles an EasyEffects preset if present is the realistic version.

### Mail Privacy Protection, iCloud Private Relay and Hide My Email
- **Introduced / changed:** Monterey 12.0 (Hide My Email in Mail from 12.1).
- **What it is:** Mail preloads remote content through Apple proxies to hide opens and IP; Private
  Relay (beta) sends Safari traffic through two relays; Hide My Email creates random forwarding
  addresses (iCloud+).
- **Caveats (on macOS):** Apple-service, paid tier, region-limited.
- **Port to GNOME 50:** Apple services; nothing to port into a shell.
- **Blockers / risks:** Apple services.
- **Linux equivalents today:** Firefox Relay, SimpleLogin, addy.io, Tor, Mullvad/Proton VPN,
  Thunderbird remote-content blocking.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort XL**: services, not desktop.

### Built-in password manager pane
- **Introduced / changed:** Monterey 12.0 (12.3 adds notes on entries).
- **What it is:** System Preferences › Passwords (same UI as Safari): view and copy credentials,
  breach and reuse warnings, verification codes (TOTP), CSV import/export, AirDrop sharing; locks
  after inactivity.
- **Caveats (on macOS):** iCloud Keychain only; no vaults.
- **Port to GNOME 50:** App territory. Kiwi's clipboard already avoids recording password-manager
  copies (`model.js` filters); Spotlight could later search a password manager via its search
  provider (KeePassXC has none; Secrets/GNOME Keyring do not expose search).
- **Blockers / risks:** Security sensitivity; EGO and user trust.
- **Linux equivalents today:** GNOME Secrets, KeePassXC, Bitwarden, Seahorse (Passwords and Keys).
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort L**: not a shell feature; keep the clipboard filtering.

### Low Power Mode
- **Introduced / changed:** Monterey 12.0 (Battery pane, laptops from 2016); Sonoma/Sequoia later add High Power and Control Center access.
- **What it is:** A checkbox (later an Energy Mode menu) separately for "Battery" and "Power Adapter"
  that caps CPU clocks to save power: Ars measured about 40 % lower CPU scores on an M1 Air with
  package power capped near 4 W. A plugged-in Mac runs at full speed even if the battery setting is
  on. The battery menu shows when it is on.
- **Caveats (on macOS):** Laptops only at first; no Control Center module in Monterey.
- **Port to GNOME 50:** power-profiles-daemon (`net.hadess.PowerProfiles` / `org.freedesktop.UPower
  .PowerProfiles`) gives power-saver/balanced/performance, already in GNOME's Quick Settings. Kiwi
  adds the macOS model: separate "On battery" and "On power adapter" choices, applied by watching
  UPower `OnBattery` and calling `ActiveProfile` with a `HoldProfile` cookie (released on disable,
  so the user's own choice returns); a Control Center tile and a "Low Power Mode" line in the battery
  menu; the notch can show a low-power badge.
- **Blockers / risks:** Holding profiles while another app (e.g. GNOME's automatic power saver at low
  battery) also changes them; ppd may not be installed (feature-detect the bus name).
- **Linux equivalents today:** GNOME Quick Settings power modes, GNOME's "automatic power saver" on
  low battery, TLP/tuned-ppd on Fedora.
- **Kiwi status:** none (stock power-mode item remains in Control Center).
- **Recommendation:** Port (P2), **effort S**: easy and useful; mostly UI over an existing daemon.

### Erase All Content and Settings
- **Introduced / changed:** Monterey 12.0 (Apple Silicon or T2 Macs).
- **What it is:** Erase Assistant from the System Preferences menu wipes the data volume by destroying
  its encryption keys and keeps the system, like iOS's reset; signs out of Apple ID and removes Touch ID.
- **Caveats (on macOS):** Fails with multiple partitions or reduced Secure Boot.
- **Port to GNOME 50:** Installer/OS concern. Kiwi's own reset
  is "Reset everything" for its settings (§6), which is a different thing.
- **Blockers / risks:** Destructive; root required; never from an extension.
- **Linux equivalents today:** Reinstall; Fedora Atomic rebase/reset; GNOME OS factory reset (in development).
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort XL**: destructive system operation.

---

## Monterey: productivity

### Shortcuts for Mac
- **Introduced / changed:** Monterey 12.0 (12.3 adds Reminders tag actions).
- **What it is:** The iOS Shortcuts app with a Mac gallery and an editor (drag actions from a
  library, variables). Mac-only actions came from Automator (files, images, windows: find, move,
  resize, hide/quit apps). Run from: the app (play button on tiles), the menu bar (a Shortcuts
  menu), Finder Quick Actions and the Services menu, the Dock, Spotlight, Siri, a per-shortcut
  keyboard shortcut, AppleScript, and the `shortcuts run "name"` CLI (plus list/view/sign). Can run
  AppleScript, JavaScript and shell scripts after enabling script support. Drag an Automator
  workflow onto Shortcuts to convert it.
- **Caveats (on macOS):** Buggy and crash-prone at launch (MacStories); no share-sheet input; some
  Safari actions did not work; Automator conversions hit-or-miss (Ars).
- **Port to GNOME 50:** A full visual automation app is a separate GTK4 project (XL). Within Kiwi's
  scope: a "Shortcuts" menu-bar extra and Spotlight provider that lists user scripts and
  `.desktop` actions from a Kiwi folder (`~/.local/share/kiwi/shortcuts/`, created by Kiwi), runs
  them with `Gio.Subprocess` (async), and allows a keyboard shortcut per entry (`lib/keybindings.js`,
  default empty); built-in window actions (tile, move to workspace, hide others) exposed as entries.
  Files "Quick Actions" are Nautilus scripts (`~/.local/share/nautilus/scripts`), which Kiwi should
  only document, not write.
- **Blockers / risks:** EGO reviewers dislike extensions that run arbitrary commands; it must be
  user-initiated, clearly labelled, and never fetch scripts. Wayland: no cross-app UI automation
  (no AppleScript equivalent; D-Bus and CLI only).
- **Linux equivalents today:** GNOME custom keyboard shortcuts, Nautilus scripts, Actions for
  Nautilus, Kando (pie menu), Ulauncher/Albert extensions, Home Assistant/ydotool.
- **Kiwi status:** none.
- **Recommendation:** Later (P3), **effort M**: a scripts menu is feasible; a Shortcuts editor is not Kiwi's job.

### Quick Note
- **Introduced / changed:** Monterey 12.0.
- **What it is:** Move the pointer to the bottom-right hot corner (a small note thumbnail peeks out,
  click it) or press Globe/Fn+Q to open a small floating Notes window over any app. By default it
  reopens the last Quick Note (setting: always new). In Safari you can "Add to Quick Note" selected
  text or images; highlights persist on the page and a thumbnail of the linked note appears when you
  revisit. Notes link back to app content (NSUserActivity). Quick Notes collect in a "Quick Notes"
  folder. The corner and the shortcut are configurable in Hot Corners and Keyboard › Shortcuts ›
  Mission Control.
- **Caveats (on macOS):** On multi-monitor Macs only the right-most screen's corner works; reviewers
  found it less useful than on iPad; occasional wrong placement bugs.
- **Port to GNOME 50:** Shell-side floating note: a `St.Entry`/`Clutter.Text` multi-line editor in a
  chrome actor (not a modal, so the user can keep working; focus with `global.stage.set_key_focus`
  on click), autosaved async to `~/.local/share/kiwi/notes/*.md` (files Kiwi creates), opened from a
  configurable hot corner (see below) or a shortcut (default empty). "Add selection": take the
  current PRIMARY/CLIPBOARD selection via `St.Clipboard` plus the focused window's title as a source
  line. "Open in…" hands the note to the default Markdown/text app.
- **Blockers / risks:** No in-page highlights or deep links (needs browser cooperation). Keyboard
  input in a non-modal Shell actor must release focus correctly. Clipboard rules: user action only.
- **Linux equivalents today:** GNOME Text Editor, Iotas, Folio, Sticky Notes apps, Notes extensions.
- **Kiwi status:** none.
- **Recommendation:** Port (P2), **effort M**: distinctive, self-contained and fits the notch/file-shelf style of quick tools.

### Hot Corners with new actions
- **Introduced / changed:** Long-standing (Desktop & Screen Saver › Hot Corners); Monterey adds Quick Note as an action.
- **What it is:** Each of the four corners can trigger Mission Control, Application Windows, Desktop,
  Notification Center, Launchpad, Quick Note, Start/Disable Screen Saver, Put Display to Sleep, Lock
  Screen; holding a modifier while assigning requires that modifier (to avoid accidents).
- **Caveats (on macOS):** Accidental triggers; corners only on the outermost displays.
- **Port to GNOME 50:** Kiwi turns GNOME's hot corner off (§3). Add its own: one pressure barrier or
  a 1-px reactive actor per corner per monitor (`Meta.Barrier` + `Layout.PressureBarrier`, as the
  stock `HotCorner` does), each mapped to a Kiwi action (Mission Control, App Exposé, Show Desktop,
  Notification Center, Launchpad, Quick Note, lock, screen off) and an optional required modifier.
  Respect fullscreen (no triggers over fullscreen windows unless set).
- **Blockers / risks:** Barriers on multi-monitor edges; corners shared with the menu bar or dock.
- **Linux equivalents today:** GNOME's single top-left hot corner, Custom Hot Corners - Extended extension.
- **Kiwi status:** none (stock hot corner disabled).
- **Recommendation:** Port (P2), **effort S**: cheap, very macOS, and the entry point for Quick Note and Mission Control.

### Live Text
- **Introduced / changed:** Monterey 12.0 (Intel support added during beta).
- **What it is:** Text in photos and screenshots becomes selectable in Photos, Preview, Quick Look,
  Screenshot and Safari: drag to select, Cmd-C, or Control-click to Look Up, Translate, Search the
  web, Share. Data detectors make phone numbers, emails, URLs, addresses and flight numbers actionable.
  Languages at launch: English, Chinese, French, Italian, German, Portuguese, Spanish.
- **Caveats (on macOS):** Region/language limits; works only in Apple apps and adopting apps.
- **Port to GNOME 50:** Two Kiwi-sized pieces: (1) in Kiwi's clipboard history, "Copy Text" on image
  entries, and (2) a "Capture Text" region action, both via an OCR helper run with `Gio.Subprocess`
  (Tesseract CLI if installed, or the Frog/Normcap app). The region capture uses the Shell's
  screenshot API (`Shell.Screenshot.screenshot_area`) to a temporary file Kiwi deletes after OCR.
- **Blockers / risks:** OCR engine must be installed separately (feature-detect); no in-app inline
  selection in images (needs app cooperation); privacy: never upload images.
- **Linux equivalents today:** Frog (TextSnatcher), Normcap, Tesseract, Text Pieces, GNOME's screenshot UI (no OCR).
- **Kiwi status:** none.
- **Recommendation:** Later (P3), **effort M**: useful, but depends on an external OCR tool.

### Visual Look Up
- **Introduced / changed:** Monterey 12.0.
- **What it is:** Photos and Safari identify art, landmarks, plants, pets and books in images (a
  sparkle on the Info button, or right-click › Look Up) and show Siri Knowledge/Wikipedia results.
- **Caveats (on macOS):** Uneven accuracy (dog breeds), US-English first.
- **Port to GNOME 50:** Requires a local vision model or a cloud service; out of scope.
- **Blockers / risks:** No local model in the stack; privacy of cloud lookups.
- **Linux equivalents today:** None built-in.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort XL**: ML service, not shell.

### Safari 15 tab groups and compact tab bar
- **Introduced / changed:** Safari 15 with Monterey (the radical redesign was reverted in 15.1).
- **What it is:** Tab Groups save named sets of tabs as live sessions synced via iCloud, switchable
  from the sidebar or a toolbar menu; pinned tabs do not work inside groups. The optional Compact
  layout merges address bar, toolbar and tabs into one strip and can tint the chrome with the page's
  colour.
- **Caveats (on macOS):** Public back-and-forth over the redesign; compact mode crams tabs.
- **Port to GNOME 50:** Browser feature. Kiwi's analogue is window-level: Stage Manager sets and
  workspaces already group work; nothing to port.
- **Blockers / risks:** App cooperation.
- **Linux equivalents today:** Firefox tab groups (2025) and vertical tabs, GNOME Web.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort XL**: browser feature.

### Shared with You
- **Introduced / changed:** Monterey 12.0.
- **What it is:** Links, photos, music, podcasts and shows received in Messages appear in a "Shared
  with You" section of Safari, Photos, News, Podcasts and TV, with a link back to the conversation.
- **Caveats (on macOS):** Apple apps only; no third-party API on the Mac at launch.
- **Port to GNOME 50:** Needs messaging-app cooperation; nothing in GNOME provides it.
- **Blockers / risks:** Apple service.
- **Linux equivalents today:** None.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort XL**: service-level integration.

### Notes and Reminders tags, mentions and Smart Lists
- **Introduced / changed:** Monterey 12.0.
- **What it is:** #tags in Notes and Reminders with a Tag Browser and Smart Folders/Lists; @mentions
  and an Activity view in shared notes.
- **Caveats (on macOS):** Notes' Smart Folders filter tags only.
- **Port to GNOME 50:** App features; out of scope.
- **Blockers / risks:** None for Kiwi.
- **Linux equivalents today:** Endeavour, Errands, Planify, Obsidian/Logseq.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort XL**: app features.

### Finder: Go to Folder redesign and path shortcuts
- **Introduced / changed:** Monterey 12.0.
- **What it is:** Shift-Cmd-G opens a Spotlight-like floating field that autocompletes paths and lists
  recent locations. Option on a hovered folder shows its path; right-click the path to copy it or
  open Terminal there. Copy operations show a progress pie and can pause and resume (APFS only).
- **Caveats (on macOS):** The cancel/pause button confusion (Ars).
- **Port to GNOME 50:** Kiwi Spotlight can accept a typed path (`~/`, `/`) and autocomplete folders
  with async `Gio.File.enumerate_children_async`, then open the result in Files (`Gio.AppInfo
  .launch_default_for_uri`). Copy progress belongs to Files (Nautilus already shows a progress pie).
- **Blockers / risks:** Large directories must be enumerated with limits and cancellables.
- **Linux equivalents today:** Ctrl+L in Files and file choosers, Nautilus operations pie.
- **Kiwi status:** partial (Spotlight exists; no path mode).
- **Recommendation:** Port (P2), **effort S**: a cheap, high-value Spotlight mode.

### Keyboard dictation on device
- **Introduced / changed:** Monterey 12.0 (Apple Silicon, no 60-second limit).
- **What it is:** Press the dictation key (or Fn twice) to dictate anywhere; on Apple Silicon it runs
  offline without a time limit and personalises over time.
- **Caveats (on macOS):** Languages; Intel Macs still online.
- **Port to GNOME 50:** A helper app with Whisper/Vosk that types through the input method (IBus
  engine) is the right shape; a Shell extension cannot inject text into Wayland apps except through
  an input method or `Clutter.VirtualInputDevice` (synthetic keys, layout-dependent).
- **Blockers / risks:** Wayland input injection; model size; CPU.
- **Linux equivalents today:** Speech Note, nerd-dictation, IBus speech engines (in development), Blurt.
- **Kiwi status:** none.
- **Recommendation:** Later (P3), **effort XL**: separate project; at most a menu/notch indicator for an external dictation tool.

---

## Monterey: continuity and media

### Universal Control
- **Introduced / changed:** Monterey 12.3 (beta), iPadOS 15.4.
- **What it is:** One Mac's keyboard and trackpad drive up to two other nearby Macs or iPads. Push the
  pointer past the left or right screen edge: the other device shows the pointer "pushing through",
  and pushing further links it. Arrange devices in Displays; copy/paste and drag-and-drop files move
  between them. On iPad the pointer becomes a dot with iPad gestures. Requirements: same Apple ID with
  two-factor, Bluetooth, Wi-Fi and Handoff on, within 10 m. A setting can stop edge-push linking and
  connect from Control Center › Display instead.
- **Caveats (on macOS):** Shipped five months late; device limits; occasional link drops.
- **Port to GNOME 50:** Use an existing tool: Deskflow/Input Leap with the XDG RemoteDesktop and
  InputCapture portals (Mutter implements InputCapture since GNOME 46-era releases, check on 50). Kiwi
  could add a Control Center tile showing the Deskflow state and the "push-through" edge glow when the
  pointer crosses (pointer position is readable in the Shell), but cannot implement the transport.
- **Blockers / risks:** Wayland input capture must go through the portal with user consent; peer
  discovery and encryption are a whole project; no iPad counterpart.
- **Linux equivalents today:** Deskflow (Synergy upstream), Input Leap, Barrier (dead), lan-mouse, GSConnect remote input.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort XL**: recommend Deskflow; at most a status tile later.

### AirPlay to Mac (receiver and speaker)
- **Introduced / changed:** Monterey 12.0.
- **What it is:** The Mac becomes an AirPlay receiver: mirror or extend an iPhone/iPad/Mac display,
  stream video, or use it as an AirPlay 2 speaker. Sharing › AirPlay Receiver: Current User, Anyone
  on the Same Network, or Everyone, with an optional password; wired connection from iPhone/iPad
  works too. Newer Macs required for full resolution.
- **Caveats (on macOS):** Model limits; security when open to Everyone.
- **Port to GNOME 50:** External receivers exist (UxPlay for screen, Shairport Sync for audio). Kiwi
  could offer a Control Center tile that starts and stops a user systemd unit for them (`systemctl
  --user` via D-Bus `org.freedesktop.systemd1`), only if installed.
- **Blockers / risks:** Third-party packages, firewall/mDNS ports, protocol reverse-engineering
  (legal grey zone for FairPlay content).
- **Linux equivalents today:** UxPlay, RPiPlay, Shairport Sync, GNOME Network Displays (sender side).
- **Kiwi status:** none.
- **Recommendation:** Later (P3), **effort M**: a convenience tile over external tools at best.

### Screen Mirroring and Sidecar from Control Center
- **Introduced / changed:** Big Sur 11.0 (Control Center module); Monterey adds AirPlay to Mac targets and the redesigned Displays pane.
- **What it is:** Control Center › Screen Mirroring lists Apple TVs, AirPlay TVs, Macs and iPads
  (Sidecar) to mirror or extend to; Display module links Sidecar.
- **Caveats (on macOS):** Apple devices and AirPlay-certified TVs only.
- **Port to GNOME 50:** GNOME Network Displays (Miracast/Chromecast) is the sender; Kiwi tile can
  launch it or, if it exposes a D-Bus API, list sinks (check). Extending to a tablet: GNOME Remote
  Desktop with a virtual monitor (headless/"extend" RDP) is the Sidecar analogue.
- **Blockers / risks:** No stable sink-list API; Miracast needs Wi-Fi P2P support.
- **Linux equivalents today:** GNOME Network Displays, GNOME Remote Desktop, Deskreen, weylus.
- **Kiwi status:** none.
- **Recommendation:** Later (P3), **effort S**: a launcher tile is trivial; a native list is not.

### SharePlay and FaceTime upgrades
- **Introduced / changed:** Monterey 12.0 (FaceTime links, grid, Voice Isolation, Portrait); SharePlay in 12.1.
- **What it is:** Watch or listen together in sync during FaceTime calls with shared controls and
  "smart volume"; share your screen; FaceTime links let Windows/Android users join from a browser;
  grid view; spatial audio.
- **Caveats (on macOS):** Apple ecosystem; content-app adoption.
- **Port to GNOME 50:** Apple service; nothing to port.
- **Blockers / risks:** Apple service.
- **Linux equivalents today:** Jitsi, Discord, Element calls; Syncplay/Jellyfin SyncPlay for watch parties.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort XL**: service.

### Spatial audio controls in Control Center
- **Introduced / changed:** Monterey 12.3 (M1 Macs with supported AirPods).
- **What it is:** Sound module offers Off, Fixed and Head Tracked spatial audio for supported
  AirPods; dynamic head tracking in Music.
- **Caveats (on macOS):** M1 and specific AirPods only.
- **Port to GNOME 50:** No head-tracking data on Linux; PipeWire has spatialiser filters but nothing
  standard to toggle.
- **Blockers / risks:** Hardware/protocol (AirPods sensors are proprietary).
- **Linux equivalents today:** PipeWire filter-chain spatializer, EasyEffects crossfeed.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort L**: no data source.

---

## Monterey: windows, displays and accessibility

### Full-screen green-button options and "show menu bar in full screen"
- **Introduced / changed:** Monterey 12.0 (Big Sur already had Tile Left/Right in the green-button menu since Catalina).
- **What it is:** Hovering or click-holding the green button shows Enter Full Screen, Tile Window to
  Left/Right of Screen; in full screen or Split View it adds Exit Full Screen, Move Window to Desktop
  (out of the split into its own Space), and Replace Tiled Window. Dock & Menu Bar gains
  "Automatically hide and show the menu bar in full screen" (off keeps the bar visible in full
  screen). Big Sur kept "Automatically hide and show the menu bar" for all windows.
- **Caveats (on macOS):** Split View only two apps; discoverability.
- **Port to GNOME 50:** Part of the planned green-button hover menu (§5.7). Add the full-screen
  variants: Move to its own workspace (Kiwi Mission Control spaces), Replace tiled partner (swap the
  window in a tile pair via the tiling engine). Add a `menubar-fullscreen-visible` setting: the
  conflict rule "fullscreen hides the menu bar" becomes configurable; with it off the menu bar reveals
  on pointer at the top edge (a pressure barrier) over fullscreen windows.
- **Blockers / risks:** Showing chrome over fullscreen windows needs `Main.layoutManager` tracking
  with `trackFullscreen`; Kiwi removed auto-hide once because the notch lives in the bar, so reveal
  must also keep the notch rule ("visible on hover only").
- **Linux equivalents today:** GNOME edge tiling (Super+Left/Right), Tiling Assistant extension.
- **Kiwi status:** planned (green-button menu); menu bar fullscreen option none.
- **Recommendation:** Port (P1 core), **effort S**: small additions to work already in P1.

### Windows resize to fit when moved to another display
- **Introduced / changed:** Monterey 12.0.
- **What it is:** Dragging a window to a smaller display (laptop panel, Sidecar iPad, a portrait
  monitor) shrinks it to fit, and back.
- **Caveats (on macOS):** Some apps with minimum sizes cannot fit.
- **Port to GNOME 50:** On `Meta.Window` `entered-monitor` (or at drag end via `grab-op-end`), if the
  frame rect exceeds the new monitor's work area, `move_resize_frame` it proportionally inside
  `core/layout.js`'s work area; remember the original size per window (a `WeakMap`) to restore on
  return. Skip maximised/tiled/fullscreen windows (Mutter already handles those).
- **Blockers / risks:** Client minimum sizes; scaling differences between monitors (fractional
  scaling) change logical sizes.
- **Linux equivalents today:** Mutter constrains windows partly on-screen but does not shrink them.
- **Kiwi status:** none.
- **Recommendation:** Port (P2), **effort S**: invisible until needed, then delightful on laptop + monitor setups.

### Pointer outline and fill colour
- **Introduced / changed:** Monterey 12.0 (Accessibility › Display › Pointer).
- **What it is:** Choose the pointer's outline and fill colours (reset button); joins existing
  pointer size and shake-to-locate.
- **Caveats (on macOS):** Some apps with custom cursors ignore it.
- **Port to GNOME 50:** GNOME has cursor size and a "Locate pointer" (Ctrl) option, not colours.
  Colours mean generating a recoloured Xcursor theme into a Kiwi-created folder in
  `~/.local/share/icons/` and setting `org.gnome.desktop.interface cursor-theme` (saved and restored on
  disable). Shake-to-locate can be done in the Shell by watching pointer motion and briefly scaling a
  cursor sprite overlay.
- **Blockers / risks:** Rewriting the user's cursor-theme setting (must restore exactly); theme
  generation needs SVG rendering; apps with custom cursors unaffected.
- **Linux equivalents today:** Cursor themes (Bibata colour variants), GNOME locate pointer, Jiggle extension (shake to find).
- **Kiwi status:** none.
- **Recommendation:** Later (P3), **effort M**: niche; shake-to-locate is the more useful half.

### Displays pane redesign and Adaptive Sync / ProMotion
- **Introduced / changed:** Monterey 12.0 (ProMotion on 2021 MacBook Pro, Adaptive Sync for external displays).
- **What it is:** One Displays pane with an arrangement view, right-click mirroring options and per-display
  resolution, refresh rate (including variable), HDR, True Tone and rotation.
- **Caveats (on macOS):** Some panes still per-display.
- **Port to GNOME 50:** GNOME Settings › Displays; Mutter supports VRR (experimental in GNOME 46, check
  on 50). Nothing for Kiwi beyond linking Settings from the Display module.
- **Blockers / risks:** None for Kiwi.
- **Linux equivalents today:** GNOME Settings › Displays, Mutter VRR.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort S**: GNOME already covers it.

### Launchpad "Games" folder
- **Introduced / changed:** Monterey 12.0.
- **What it is:** Launchpad automatically creates and fills a Games folder with installed games.
- **Caveats (on macOS):** Not configurable.
- **Port to GNOME 50:** GNOME app folders support category-based folders
  (`org.gnome.desktop.app-folders.folder` with `categories`), which the stock app grid already uses
  for Utilities/System. Kiwi's Launchpad (§3) can offer an automatic "Games" folder from the `Game`
  desktop category, created only once and only if the user has no folder of that name.
- **Blockers / risks:** App folders are user settings; Kiwi must not rearrange the user's grid; only
  add its own folder id and remove it on request.
- **Linux equivalents today:** GNOME app grid category folders (Utilities, System).
- **Kiwi status:** none (Launchpad becomes part of the dock and app grid).
- **Recommendation:** Port (P2), **effort S**: one-off, matches macOS with almost no code.

### Memoji user pictures and animated lock screen avatar
- **Introduced / changed:** Monterey 12.0.
- **What it is:** Memoji and emoji become account picture options; a Memoji avatar animates on the
  login and lock screen.
- **Caveats (on macOS):** Apple assets.
- **Port to GNOME 50:** GNOME Settings › Users supports any picture; animations on the lock screen
  would need `unlock-dialog` session mode. Not worth it.
- **Blockers / risks:** Assets; lock-screen code scrutiny.
- **Linux equivalents today:** GNOME user pictures.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort M**: cosmetic, outside Kiwi's surfaces.

### Desktop wallpapers and screen savers on demand
- **Introduced / changed:** Big Sur 11.0 (new Big Sur photos, dynamic illustrated wallpapers with light/dark), Monterey 12.0 (downloaded on first use, animated "hello" and Monterey screen savers).
- **What it is:** Dynamic Desktop wallpapers change through the day or with Light/Dark; most
  wallpapers are now 4 KB stubs downloaded when chosen.
- **Caveats (on macOS):** Apple images are copyrighted.
- **Port to GNOME 50:** GNOME supports light/dark wallpaper pairs (`picture-uri-dark`) and timed XML
  slideshows; dynamic wallpapers are an installer/asset concern. Kiwi should only read the wallpaper
  for adaptive glass.
- **Blockers / risks:** Copyright of Apple wallpapers.
- **Linux equivalents today:** GNOME light/dark wallpapers, Timed/Dynamic Wallpaper apps.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort S**: assets, not code; the installer may offer original wallpapers.

### Tips notifications and onboarding
- **Introduced / changed:** Monterey 12.0.
- **What it is:** The Tips app arrives on the Mac and posts occasional notifications about features.
- **Caveats (on macOS):** Some find them nagging.
- **Port to GNOME 50:** Kiwi's first-run onboarding belongs to the installer (§9); in-shell tips
  would be notifications from Kiwi itself, which EGO reviewers and users dislike.
- **Blockers / risks:** Spam perception.
- **Linux equivalents today:** GNOME Tour.
- **Kiwi status:** none.
- **Recommendation:** Skip, **effort S**: use installer onboarding instead.

---

## Summary table

| Feature | Release | Recommendation | Effort | Main blocker |
|---|---|---|---|---|
| Window chrome redesign | Big Sur | Skip (keep rounded corners) | S | GTK theming out of scope; CSD owned by apps |
| Squircle app icons | Big Sur | Later (P3) | M | Copyright; masking needs shaders (51 changes) |
| SF Symbols | Big Sur | Skip | S | Licence forbids use off Apple platforms |
| Menu bar spacing and adaptive translucency | Big Sur | Port (P1) | M | No real blur; async wallpaper sampling per monitor |
| Floating, rounder Dock | Big Sur | Port (P1) | S | Struts must include the gap |
| Centred alert dialogs | Big Sur/Monterey | Port (P2) | S | Stock dialog classes; gate CSS |
| Wallpaper tinting and Reduce Transparency | Big Sur | Port (P1) | S | No GNOME reduce-transparency key; Shell surfaces only |
| Multicolour accent | Big Sur | Port (P1) | S | None (follow GNOME accent) |
| System sounds and startup chime | Big Sur | Later (P3) | S | Copyright; replay on unlock |
| Login window and Recovery redesign | Big Sur | Skip | L | GDM not reachable from a user extension |
| Control Center | Big Sur/Monterey | Port (P1) | M | Private Quick Settings internals |
| Pin Control Center modules to the menu bar | Big Sur | Port (P2) | M | Duplicate stock indicators; panel space |
| Option-click network/Bluetooth/sound details | Big Sur | Later (P3) | S | Driver-dependent data |
| Now Playing | Big Sur | Port (P1, have) | S | MPRIS quality per app |
| Battery and Fast User Switching items | Big Sur | Port (P2) | S | No per-app energy data |
| Clock opens Notification Center | Big Sur | Port (P1) | S | Edge swipe undetectable (no touch positions) |
| Grouped, interactive notifications | Big Sur/Monterey | Port (P1) | L | Private MessageTray; apps send little rich content |
| Notification Center widgets | Big Sur/Monterey | Port (P2) | L | No widget ecosystem; each widget is Kiwi code |
| Widget gallery and edit mode | Big Sur | Port (P2) | M | One modal at a time |
| Spotlight Quick Look preview | Big Sur | Port (P2) | M | Arbitrary previews need Sushi |
| Apple Silicon and Rosetta 2 | Big Sur | Skip | XL | Platform level |
| iPhone/iPad apps on Mac | Big Sur | Skip | XL | Platform level (Waydroid exists) |
| Signed System Volume, background updates | Big Sur | Skip | XL | Distribution level |
| Time Machine on APFS | Big Sur/Monterey | Skip | M | No common backup status API |
| Battery pane with usage history | Big Sur | Later (P3) | M | UPower history quality |
| Safari 14 redesign | Big Sur | Skip | XL | Browser feature |
| Messages on Catalyst | Big Sur | Skip | XL | Apple service |
| Maps/Photos/Voice Memos/App Store updates | Big Sur | Skip | XL | Bundled apps |
| Focus modes | Monterey | Port (P2) | M | No sender identity, location or device sync |
| Time-sensitive notifications and per-app mute | Monterey | Port (P2) | S | Apps rarely set urgency |
| Mic/camera in-use indicators | Monterey | Port (P1) | S | Camera monitor sees PipeWire apps only |
| Mic Mode and Video Effects | Monterey | Later (P3) | M | Needs external audio/video helpers |
| Mail Privacy, Private Relay, Hide My Email | Monterey | Skip | XL | Apple services |
| Passwords pane | Monterey | Skip | L | App/security territory |
| Low Power Mode | Monterey | Port (P2) | S | power-profiles-daemon holds may conflict |
| Erase All Content and Settings | Monterey | Skip | XL | Destructive, root, installer concern |
| Shortcuts for Mac | Monterey | Later (P3) | M | EGO caution on running commands; no UI automation on Wayland |
| Quick Note | Monterey | Port (P2) | M | No deep links/highlights without app cooperation |
| Hot Corners with actions | Monterey | Port (P2) | S | Multi-monitor barriers |
| Live Text | Monterey | Later (P3) | M | External OCR engine needed |
| Visual Look Up | Monterey | Skip | XL | Needs an ML service |
| Safari tab groups and compact tabs | Monterey | Skip | XL | Browser feature |
| Shared with You | Monterey | Skip | XL | Service integration |
| Notes/Reminders tags and Smart Lists | Monterey | Skip | XL | App features |
| Go to Folder path mode | Monterey | Port (P2) | S | Async enumeration limits |
| On-device dictation | Monterey | Later (P3) | XL | Wayland text injection, models |
| Universal Control | Monterey 12.3 | Skip | XL | Portal input capture, transport, no iPad |
| AirPlay to Mac | Monterey | Later (P3) | M | Third-party receivers, network ports |
| Screen Mirroring / Sidecar | Big Sur/Monterey | Later (P3) | S | No sink-list API in Network Displays |
| SharePlay and FaceTime upgrades | Monterey 12.1 | Skip | XL | Apple service |
| Spatial audio controls | Monterey 12.3 | Skip | L | No head-tracking data |
| Full-screen green-button options, menu bar in full screen | Monterey | Port (P1) | S | Fullscreen chrome tracking with the notch |
| Resize windows moved to a smaller display | Monterey | Port (P2) | S | Client minimum sizes, fractional scaling |
| Pointer colours and shake to locate | Monterey | Later (P3) | M | Must rewrite and restore cursor-theme |
| Displays pane and Adaptive Sync | Monterey | Skip | S | Already in GNOME Settings |
| Launchpad Games folder | Monterey | Port (P2) | S | Must not disturb user app folders |
| Memoji user pictures | Monterey | Skip | M | Assets, lock-screen code |
| Wallpapers on demand / dynamic wallpapers | Big Sur/Monterey | Skip | S | Copyright; assets |
| Tips notifications | Monterey | Skip | S | Spam perception |

Count: 59 features (Port P1: 10, Port P2: 14, Later P3: 11, Skip: 24).

### Top port candidates (in priority order)
1. **Control Center Big Sur layout** with expanding detail views (P1, M); pinning modules to the menu bar follows in P2.
2. **Notification Center column**: clock click, grouped stacks, actions, history (P1, L).
3. **Adaptive menu-bar translucency** from the wallpaper, plus wallpaper tint and Reduce Transparency in faux glass (P1, M).
4. **Mic/camera/screen privacy dot** with the app list in Control Center (P1, S).
5. **Focus modes** with time-sensitive break-through and per-app mute (P2, M).
6. **Notification Center widgets** and their gallery: Calendar, Clock, Weather, Battery first (P2, L).
7. **Quick Note with configurable Hot Corners** (P2, M + S).
8. **Low Power Mode** per power source, via power-profiles-daemon (P2, S).

Close runners-up: full-screen green-button options (P1, S, part of §5.7), Spotlight Quick Look and
path mode (P2), resize-to-fit across displays (P2, S), centred Shell dialogs (P2, S).

---

## Sources
- Apple Support, "What's new in the updates for macOS Big Sur": https://support.apple.com/en-us/HT211896
- Apple Support, "What's new in the updates for macOS Monterey": https://support.apple.com/en-us/HT212585
- Apple Support, Use Control Center on Mac (macOS 12): https://support.apple.com/guide/mac-help/mchl50f94f8f/12.0/mac/12.0
- Apple Support, Set up a Focus on Mac (macOS 12): https://support.apple.com/guide/mac-help/mchl613dc43f/12.0/mac/12.0
- Apple Support, Universal Control: https://support.apple.com/en-us/102459
- Apple Support, Live Text in Preview (macOS 12): https://support.apple.com/guide/preview/prvw625a5b2c/mac
- Apple Support, Live Text in Photos: https://support.apple.com/guide/photos/pht6bc6bd5f5
- Apple Support, AirPlay from iPhone/iPad (AirPlay to Mac): https://support.apple.com/en-us/102661
- Apple Support, Power modes / Low Power Mode on Mac: https://support.apple.com/en-us/101613
- Apple Newsroom, Introducing macOS Big Sur: https://www.apple.com/newsroom/2020/06/introducing-macos-big-sur/
- Apple Newsroom, macOS Monterey: https://www.apple.com/newsroom/2021/06/macos-monterey-brings-new-ways-for-users-to-connect-get-more-done-and-work-more-fluidly-across-apple-devices/
- Ars Technica, macOS 11.0 Big Sur: The Ars Technica review: https://arstechnica.com/gadgets/2020/11/macos-11-0-big-sur-the-ars-technica-review/
- Ars Technica, macOS 12 Monterey: The Ars Technica review: https://arstechnica.com/gadgets/2021/10/macos-12-monterey-the-ars-technica-review/
- MacStories, macOS Big Sur: The MacStories Review: https://www.macstories.net/stories/macos-big-sur-the-macstories-review/
- MacStories, macOS Monterey: The MacStories Review: https://www.macstories.net/stories/macos-monterey-the-macstories-review/
- 9to5Mac, First look at Control Center and widgets on Big Sur: https://9to5mac.com/2020/06/25/first-look-at-new-control-center-and-widgets-on-macos-big-sur/
- Macworld, macOS Big Sur user interface changes: https://www.macworld.com/article/234382/macos-big-sur-learn-about-the-user-interface-changes.html
- Macworld, How to set up Focus in macOS Monterey: https://www.macworld.com/article/353477/how-to-macos-monterey-set-up-customize-focus-modes-mac.html
- Wikipedia, macOS Big Sur: https://en.wikipedia.org/wiki/MacOS_Big_Sur
- Wikipedia, macOS Monterey: https://en.wikipedia.org/wiki/MacOS_Monterey
- GNOME Shell MR !2840, camera-in-use indicator via PipeWire: https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2840
- 512 Pixels on the MacStories Monterey review: https://512pixels.net/2021/10/the-macstories-macos-monterey-review/
