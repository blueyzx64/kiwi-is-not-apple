# macOS 10.14 Mojave (2018) and 10.15 Catalina (2019): feature research for Kiwi

Scope: user-facing desktop and system features of Mojave and Catalina, the bundled apps that shaped the desktop, and the security changes users actually see. Each feature uses the template in `README.md`. The port judgements target **GNOME Shell 50 on Fedora 44, Wayland only**. They use the plan in `docs/architecture/overhaul-plan.md` (menu bar, own dock, Mission Control, Stage Manager v3, notch, faux glass, tiling).

Status words: **have** means Kiwi ships it today, **partial** means some of it or a nearby feature, **none** means nothing yet. "Planned" points to the section of the overhaul plan that already covers it.

---

## Release overviews

### macOS 10.14 Mojave
- **Announced** 4 June 2018 (WWDC). **Released** 24 September 2018. Last point release 10.14.6 (July 2019). Group FaceTime came in 10.14.1 (30 October 2018). Website dark mode (`prefers-color-scheme`) arrived in Safari 12.1 with 10.14.4.
- **Theme:** "pro features built for everyone." It was the biggest visual change since Yosemite:
  - system-wide **Dark Mode**, with accent colours and Desktop Tinting;
  - **Dynamic Desktop** wallpapers;
  - desktop **Stacks**;
  - a big **Finder** update: Gallery view, a metadata Preview pane, Quick Actions;
  - **Quick Look** editing and Markup;
  - a new **screenshot** toolbar (⇧⌘5) with a floating thumbnail;
  - **Continuity Camera**;
  - **recent apps in the Dock**.
- **Apps:** News, Stocks, Voice Memos and Home were ported from iOS ("Marzipan", later called Catalyst). The Mac App Store was redesigned. Software Update moved back to System Preferences.
- **Security and privacy:** new TCC prompts for camera, microphone, Mail and Messages data, and Automation (Apple Events), plus Full Disk Access. Notarization was introduced for Developer ID apps (required from Catalina on).
- **Requirements and removals:** needs Metal (most pre-2012 Macs dropped). Last release that runs 32-bit apps, and it warns once every 30 days. Removed: subpixel font smoothing, and the Facebook, Twitter, LinkedIn, Vimeo and Flickr integrations. Last release with iTunes and Dashboard.
- **What it left alone:** Mission Control, Spotlight and Notification Center were essentially unchanged. The window manager gained nothing new.

### macOS 10.15 Catalina
- **Announced** 3 June 2019. **Released** 7 October 2019. Last 10.x release; Big Sur became 11. Key point releases:
  - 10.15.4: Screen Time communication limits, time-synced lyrics in Music, iCloud Drive folder sharing;
  - 10.15.5: battery health management.
- **Theme:** a "clean break."
  - iTunes split into **Music, TV and Podcasts**; device sync moved to Finder.
  - **Sidecar** (an iPad as a second display and Pencil tablet).
  - **Screen Time** replaced Parental Controls.
  - The **Find My** app with crowd-sourced offline finding.
  - **Voice Control** and other accessibility work: Hover Text, a Zoom display, colour filters.
  - **Approve with Apple Watch.**
  - **Mac Catalyst** opened to all developers.
  - The **green-button tile menu.**
  - **Auto** light/dark appearance.
- **Security:**
  - the system lives on a **read-only volume**;
  - **Gatekeeper requires notarization** and re-checks apps;
  - new TCC prompts for **Files and Folders**, **Screen Recording** and **Input Monitoring**, and per-app notification authorisation.
  Reviewers compared the flood of prompts to Windows Vista's UAC.
- **Removals:** all **32-bit apps** (Carbon, QuickTime 7), **Dashboard**, Parental Controls. **zsh** replaced bash as the default shell.
- **Reception:** important but buggy at launch. Six Colors advised waiting.

---

## Mojave (10.14) features

### Dark Mode (system-wide)
- **Introduced / changed:** 10.14 (system-wide); 10.14.4 websites via `prefers-color-scheme`; 10.15 adds Auto (see below). Yosemite had only a partial dark menu bar and Dock.
- **What it is:**
  - **Where:** System Preferences › General › Appearance: Light / Dark. It is also offered during setup.
  - **What it changes:** every first-party app, the menu bar, Dock, menus, sidebars, Spotlight, Notification Center and the app switcher.
  - **Not an inversion.** Chrome is opaque or translucent greys, never pure black. Glyphs were redrawn rather than inverted. Pressed buttons *lighten* instead of darken.
  - **Window edges:** the rim shadow becomes a 1 px light border, so dark windows stay distinct; the diffuse shadow is kept.
  - **Trash** gets a translucent black icon.
  - **Content stays light by design:** Pages documents, Mail messages, TextEdit and web pages. Mail and TextEdit later offered per-app "use dark background for content" options.
  - **Developer API:** `NSAppearance`, semantic colours, asset catalogue variants.
- **Caveats (on macOS):** third-party apps had to rebuild against the 10.14 SDK, so support was spotty for months. No per-app override for users. It was criticised as inconsistent (bright documents in dark chrome).
- **Port to GNOME 50:** GNOME already has the system switch: `org.gnome.desktop.interface color-scheme` = `prefer-dark`, read by libadwaita, GTK4 and the portal `org.freedesktop.appearance.color-scheme`, which Firefox, Chromium and Electron honour. Kiwi's job:
  1. Every Kiwi surface (menu bar, dock, notch, Spotlight, Control Center, Mission Control, glass) has light and dark token sets. Switch on `St.Settings.get().color_scheme`, or on `Main.sessionMode` plus the interface settings change.
  2. A 1 px light rim on dark windows. The rounded-corners feature already draws per-window effects; add a rim highlight in dark mode.
  3. An Appearance row in Kiwi's Control Center: Light / Dark / Auto.
- **Blockers / risks:** GTK3 apps follow it only with adw-gtk3 or a dark GTK theme. Qt apps need a platform theme (QGnomePlatform is unmaintained; Fedora uses adwaita-qt or the Qt6 portal colour scheme). Never write user theme files (CLAUDE.md rule).
- **Linux equivalents today:** GNOME Settings › Appearance (Default / Dark), the Quick Settings "Dark Style" toggle, the "Night Theme Switcher" extension.
- **Kiwi status:** partial. GNOME's toggle works and some Kiwi CSS has dark variants, but the light/dark token set is not complete everywhere.
- **Recommendation:** **Port (P1 core)**, effort **S**. It is table stakes for one design language; it mainly means faux-glass tokens plus a dark-window rim.

### Accent colours and highlight colour
- **Introduced / changed:** 10.14. Previously only Blue and Graphite.
- **What it is:**
  - **Where:** General › Accent colour: Blue, Purple, Pink, Red, Orange, Yellow, Green, Graphite (Big Sur later added Multicolour).
  - **What it tints:** checkboxes, radio buttons, push-button defaults, selection, menu-bar and menu highlights, sidebar icons.
  - **Highlight colour** (text selection) follows the accent colour by default but can be set apart, including Other… with a colour picker.
  - **Graphite** also turns the traffic lights grey and turns off Desktop Tinting.
  - The checkbox and radio transition animations were removed.
- **Caveats (on macOS):** no custom accent (only 8). Messages' blue and green bubbles ignore it, as do Touch Bar buttons.
- **Port to GNOME 50:** GNOME 47+ has `org.gnome.desktop.interface accent-color` (blue, teal, green, yellow, orange, red, pink, purple, slate), and libadwaita apps follow it.
  - Kiwi should read it (St exposes `St.Settings` `accent-color` and `-st-accent-color` in Shell CSS) and use it for menu highlights, the dock's running dot, Spotlight selection and Control Center tiles.
  - Optional "Graphite traffic lights" option for Kiwi's panel window controls when the accent is slate.
- **Blockers / risks:** GTK3 and Qt apps don't follow it. There is no custom accent in GNOME, which matches macOS anyway.
- **Linux equivalents today:** GNOME Settings › Appearance accent colours (47+).
- **Kiwi status:** partial (Shell CSS follows the accent wherever stock classes are used; Kiwi-specific surfaces mostly hard-code blue).
- **Recommendation:** **Port (P1 core)**, effort **S**. Honour `accent-color` in all Kiwi tokens, which is nearly free.

### Desktop Tinting
- **Introduced / changed:** 10.14 (dark mode only at first; later in light mode too).
- **What it is:** each window samples the average colour of the wallpaper behind it and tints its grey chrome (sidebars, title bars, backgrounds) very slightly. The tint updates as the window moves. The point is to keep dark windows from clashing with a colourful wallpaper. It can be disabled only by choosing the Graphite accent; Big Sur and later added "Allow wallpaper tinting in windows".
- **Caveats (on macOS):** subtle to invisible. Colour-critical users disliked it.
- **Port to GNOME 50:** Kiwi cannot tint other apps' chrome. That is client-side under Wayland; GTK draws it. Kiwi can tint **its own** surfaces:
  - Compute the wallpaper's average or dominant colour once per monitor. Load the background file with GdkPixbuf in a worker idle, scale it to 16×16 and average. Or read `Meta.Background` and listen to `Main.layoutManager._bgManagers` `changed`.
  - Feed that colour into the faux-glass tint for the menu bar, dock, Control Center and notch.
  - Cache it per wallpaper URI.
- **Blockers / risks:** the image must be decoded off the compositor thread; GdkPixbuf async loaders are fine. Gradient or animated XML backgrounds need sampling per frame (sample on change only).
- **Linux equivalents today:** none in GNOME. Some KDE themes do "accent from wallpaper." GNOME 47's accent picker is manual.
- **Kiwi status:** none (glass uses fixed tints).
- **Recommendation:** **Port (P2)**, effort **S**. Cheap, and it makes faux glass feel alive. Pair it with an "accent from wallpaper" option.

### Dynamic Desktop (time-shifting wallpaper)
- **Introduced / changed:** 10.14 (Mojave dunes, Solar Gradients); later releases added more and Light/Dark-only dynamic pairs.
- **What it is:**
  - **Format:** a single HEIC file with 16 frames (Mojave). XMP metadata in an `apple_desktop` namespace maps each frame to a **solar position** (azimuth and elevation) or, in simpler files, to a time. A variant ships only a light and a dark frame, which follow the appearance setting.
  - **Who drives it:** the Dock process computes the sun's position for the user's location (Location Services, falling back to the time-zone city) and shows the matching frame with cross-fades.
  - **Where:** Desktop & Screen Saver, a "Dynamic" menu per wallpaper (Dynamic / Light (still) / Dark (still)).
- **Caveats (on macOS):** custom dynamic wallpapers are undocumented (third-party tools such as Dynamic Wallpaper make them). Edge cases at high latitudes (polar day and night) make the solar maths odd. It needs location for accuracy.
- **Port to GNOME 50:** GNOME already supports **timed XML slideshows** (`<background><starttime>…<static>…<transition>`), rendered by Shell's `background.js` through `GnomeDesktop.BGSlideShow` with cross-fades, plus `picture-uri` / `picture-uri-dark` light/dark pairs. Kiwi could add:
  1. An importer, run in prefs (a separate process, so OK to be slow): decode HEIC (libheif via gdk-pixbuf `heif` loader on Fedora), extract the frames, read the XMP solar table, and **write a Kiwi-owned XML** plus the frames into `~/.local/share/kiwi/wallpapers/`.
  2. A sun-position helper (pure JS, NOAA formula) using location from GeoClue via the portal or the timezone. Regenerate the XML start times daily, or simply swap `picture-uri` on a timer from the Shell side.
  3. Set `org.gnome.desktop.background picture-uri` only with consent, and restore the previous value on disable or uninstall.
- **Blockers / risks:** HEIC decode depends on the `libheif` pixbuf loader being installed. Changing the user's wallpaper key must be reversible and opt-in. The XML transitions are timed, not solar, so the helper must rewrite them for each day or season.
- **Linux equivalents today:** GNOME's own timed XML wallpapers (e.g. adwaita day/night), the "Dynamic Wallpaper" GTK4 app (creates light/dark XML), `heic-to-dynamic-gnome-wallpaper` scripts, "Timed Wallpaper" extensions.
- **Kiwi status:** none.
- **Recommendation:** **Port (P2)**, effort **M**. A strong visual "it's a Mac" cue that ties into Auto appearance, and GNOME already renders the result; Kiwi only builds the importer and scheduler.

### Desktop Stacks
- **Introduced / changed:** 10.14 (Desktop). Dock Stacks date back to Leopard (2007).
- **What it is:**
  - **Turning it on:** View › Use Stacks, or right-click the desktop. Desktop files are grouped into stack piles.
  - **Group Stacks By:** Kind (default: Images, Documents, PDF Documents, Screenshots as their own kind, Movies, Music, Spreadsheets, Presentations, Other), Date Last Opened, Date Added, Date Modified, Date Created (groups Today / Yesterday / Previous 7 Days / Previous 30 Days / by year), or Tags.
  - **Expand:** click a stack to expand it in place (siblings shift); click again to collapse. Option-click expands all.
  - **Scrub:** with two fingers on a trackpad, or one on a Magic Mouse, over a stack to flip through thumbnails.
  - **New files** drop into their stack automatically.
  - **Folders are never stacked.**
- **Caveats (on macOS):** desktop only, not any Finder window. Folders stay loose. "Other" becomes a junk drawer. Some users found the expand/reflow jarring.
- **Port to GNOME 50:** GNOME has **no desktop icons** in the Shell since 3.28. The options:
  - **Own desktop:** Kiwi draws a desktop-icon layer in the Shell (an actor in `Main.layoutManager._backgroundGroup` sibling layer, per monitor) from `Gio.FileMonitor` on `~/Desktop`, with stacks as the only mode. Drag-and-drop to and from apps works through Shell DnD to Wayland clients only partly. Shell → client DnD of files is limited; the DING extension spawns a separate GTK window for that reason.
  - **Cooperate with DING / GTK4-DING:** no stacks API, so no.
  - **Dock Stacks** (Downloads, any folder) are the realistic part: Kiwi already has a Downloads fan. Generalise it to "any folder as a stack" with Fan / Grid / List and sort options.
- **Blockers / risks:** file DnD out of a Shell actor into Wayland apps is unreliable. A real desktop needs a client window (layer-shell is not available to arbitrary clients in GNOME), which is the DING architecture (a GTK4 window flagged as desktop by an extension). It is a large, separate product.
- **Linux equivalents today:** Desktop Icons NG (DING) and GTK4 Desktop Icons NG (no stacks), Nautilus "Desktop" folder, KDE Folder View.
- **Kiwi status:** partial (Downloads stack in the dock; no desktop stacks).
- **Recommendation:** **Later (P3)** for desktop stacks, effort **XL** (needs its own desktop-window helper). **Port (P2)** for "any folder as a Dock stack" (Fan/Grid/List), effort **M**.

### Finder Gallery view
- **Introduced / changed:** 10.14 (replaces Cover Flow); ⌘4.
- **What it is:**
  - One large preview of the selected file with a thumbnail strip below; arrow keys move through it.
  - The Preview pane sits on the right by default.
  - It plays video and audio inline, and can show names when "Show filename" is ticked.
  - Thumbnail size is fixed regardless of window size.
- **Caveats (on macOS):** best for images and video; shows one name at a time; little use for documents.
- **Port to GNOME 50:** this is Nautilus's UI, and Kiwi cannot add views to Nautilus (no view-plugin API in Nautilus 43+; only menu and column extensions via nautilus-python). The options are a separate GTK4/libadwaita "Gallery" helper app opened from a Nautilus context-menu item, or nothing.
- **Blockers / risks:** app cooperation (Nautilus) is required; GNOME design is unlikely to accept a cover-flow-like mode.
- **Linux equivalents today:** Nautilus grid view with large icons, Loupe (the GNOME image viewer, with a filmstrip-like ← → browse), Shotwell, gThumb (browser + viewer with a filmstrip).
- **Kiwi status:** none.
- **Recommendation:** **Skip**, effort **L**. It is a file-manager feature outside Shell scope; Loupe covers the use case.

### Finder Preview pane with full metadata
- **Introduced / changed:** 10.14 (View › Show Preview, ⇧⌘P; on by default in Column and Gallery). 10.15 tidied the layout. 13 Ventura allowed per-kind metadata choices.
- **What it is:** a right sidebar with a large preview, then metadata such as kind, size, dates, dimensions, EXIF (camera, lens, focal length, exposure), tags, and "Show More". Under it sit the **Quick Actions** buttons for that file type (rotate, markup, create PDF, trim, More…).
- **Caveats (on macOS):** metadata is chosen per file kind through View › Show Preview Options; it is cramped on small windows.
- **Port to GNOME 50:** Nautilus has no preview pane. Nautilus 47+ has a richer Properties dialog, and nautilus-python can add property pages only to old versions (removed in Nautilus 43). A Kiwi Quick Look panel (below) could show metadata instead: a GTK4 helper reading `Gio.FileInfo` plus `gexiv2` / TinySPARQL (LocalSearch) for EXIF.
- **Blockers / risks:** Nautilus doesn't cooperate; the selected-file query is not exported over D-Bus. `org.freedesktop.FileManager1` only does `ShowItems`, not "get selection."
- **Linux equivalents today:** Nautilus Properties (Ctrl+I), Sushi (Space preview), Dolphin's Information panel (KDE).
- **Kiwi status:** none.
- **Recommendation:** **Skip** as a Finder feature, effort **L**. Fold metadata into a Kiwi Quick Look helper if one is ever built.

### Finder Quick Actions (Services / Automator)
- **Introduced / changed:** 10.14 (Services renamed Quick Actions, surfaced in Finder). Later moved into Shortcuts (12 Monterey).
- **What it is:**
  - **Where they show:** context-sensitive buttons in the Preview pane, in the right-click › Quick Actions submenu, in the Touch Bar, and in Quick Look.
  - **Built-ins:** Rotate Left, Markup, Create PDF (from several images), Trim (video), Convert Image (13), Remove Background (14).
  - **Custom actions:** Automator "Quick Action" workflows declare input type and app, with a custom name, icon and Touch Bar colour, and can be reordered via Extensions › Finder.
- **Caveats (on macOS):** they don't sync between Macs; Automator is clunky; the menu becomes cluttered.
- **Port to GNOME 50:** Nautilus supports **scripts** (`~/.local/share/nautilus/scripts/`, executable files shown in right-click › Scripts) and **nautilus-python `MenuProvider`** extensions (Nautilus 43+ API 4.0).
  - Kiwi could ship an *optional* add-on that installs Kiwi-owned scripts into its own subfolder (`Scripts › Kiwi`): Rotate, Create PDF (img2pdf / ImageMagick), Convert Image, Trim Video (ffmpeg), Markup (opens an annotate tool such as Satty).
  - Remove them on uninstall (they are Kiwi-created, so this is allowed).
- **Blockers / risks:** it writes into a user directory, so it must be opt-in, tracked, removed on uninstall, and must never touch other scripts. It depends on CLI tools (ImageMagick, ffmpeg, img2pdf) being installed. There are no Preview-pane buttons, because Nautilus has no pane. EGO reviewers frown on extensions that install executables; better done by Kiwi's installer (§9) than by the extension.
- **Linux equivalents today:** Nautilus Scripts, nautilus-python extensions (e.g. nautilus-image-converter), Dolphin Service Menus, Thunar Custom Actions.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3)**, effort **M**. Ship it with the installer as a "Quick Actions pack" rather than in the extension.

### Quick Look editing and Markup
- **Introduced / changed:** Quick Look itself is from 10.5. 10.14 added Rotate, Markup, Trim and Share inside Quick Look. 10.15 added "annotate on iPhone/iPad" (Continuity Markup).
- **What it is:**
  - **Space** in Finder opens a full-size preview; Space or Esc closes it; ⌥Space opens full screen; arrow keys go to the next file.
  - **Mojave toolbar:** Rotate (changes the file); **Markup** (pen, shapes, text, signature, crop, highlight, shape recognition, loupe) for images and PDFs; **Trim** for audio and video (yellow handles); Share; "Open with Preview/QuickTime".
  - Edits save in place, with a Revert option.
- **Caveats (on macOS):** edits overwrite the original (Revert remains available until closing). Markup is basic; signatures are captured via the trackpad or camera.
- **Port to GNOME 50:**
  - **Preview:** GNOME Sushi (`org.gnome.NautilusPreviewer`, D-Bus `ShowFile(uri, xid, close_if_shown)`) already does Space-preview in Nautilus.
  - **Kiwi** can open previews from its *own* surfaces (Dock Stacks, notch file shelf, Spotlight results, the screenshot thumbnail) by calling Sushi over D-Bus.
  - **Markup and Trim:** hand off to external tools: Satty or Swappy (annotate), Gradia (GNOME Circle-style screenshot editor), or `ffmpeg` for trimming in a small GTK4 helper.
  - A full Kiwi Quick Look (preview plus markup) would be a GTK4/libadwaita helper app; that is a big project.
- **Blockers / risks:** Sushi (`sushi` package) normally comes with Nautilus on Fedora Workstation, but it is a separate package, so Kiwi must detect it and fall back to the default app. There is no in-place markup in GNOME. Calling into another app means a hard dependency to document.
- **Linux equivalents today:** Sushi (Space in Nautilus), Loupe (rotate and crop since 47), Satty, Swappy, Gradia, Xournal++ (PDF annotate), Papers (GNOME 47+ document viewer, with basic annotations).
- **Kiwi status:** none (Kiwi's Downloads stack opens files with the default app).
- **Recommendation:** **Port (P2)**, effort **S**, for "Space to Quick Look" in Kiwi's own surfaces via Sushi. **Later (P3)**, effort **L**, for markup or trim inside a Kiwi helper.

### Screenshot toolbar (⇧⌘5) and screen recording
- **Introduced / changed:** 10.14 (Screenshot.app replaces Grab). ⇧⌘3/⇧⌘4 unchanged since early OS X. Later releases added HDR capture (26).
- **What it is:**
  - **Shortcuts:**
    - **⇧⌘3** captures the full screen;
    - **⇧⌘4** gives a crosshair to drag a region. Hold Space while dragging to move the region; hold ⇧ to lock an axis; hold ⌥ to resize from the centre; Esc cancels;
    - **⇧⌘4 then Space** switches to a camera cursor that captures one window or menu, with its shadow (⌥-click to drop the shadow);
    - adding **Control** to any of these copies to the clipboard instead of saving;
    - **⇧⌘6** captures the Touch Bar.
  - **⇧⌘5** opens a floating, movable control strip: Capture Entire Screen / Window / Selection | Record Entire Screen / Selection | **Options** | Capture or Record.
  - **Options:**
    - **Save to:** Desktop, Documents, Clipboard, Mail, Messages, Preview, Other Location;
    - **Timer:** None, 5 s, 10 s;
    - **Microphone:** None or a chosen input;
    - toggles for Show Floating Thumbnail, Remember Last Selection, Show Mouse Pointer, and Show Mouse Clicks (recording only).
  - **Recording** shows a stop button in the menu bar (⌃⌘Esc also stops) and saves `.mov` files.
  - **Default filename:** "Screen Shot <date> at <time>.png" (later "Screenshot …"). The format can be changed with `defaults write com.apple.screencapture type`.
- **Caveats (on macOS):** the app is buried in Utilities. It records no system audio without third-party drivers, and no webcam overlay (QuickTime does that). DRM windows (TV app) come out black.
- **Port to GNOME 50:** GNOME 42+ has a built-in **Screenshot UI** (`Main.screenshotUI`, `js/ui/screenshot.js`): Print opens it, with area / screen / window modes, a screencast toggle, a show-pointer toggle, saving to `~/Pictures/Screenshots` and the clipboard, and a notification. `Shift+Print`, `Alt+Print` and `Ctrl+Alt+Shift+R` are also bound. Kiwi can:
  1. Bind **Shift+Super+3 / 4 / 5** as *optional* shortcuts (defaults empty, per EGO rules) to `Main.screenshotUI.open()` (mode SCREENSHOT or SCREENCAST), and to `Shell.Screenshot` `screenshot` / `screenshot_area` / `screenshot_window` for instant ⇧⌘3-style captures.
  2. Add **macOS Options** as a Kiwi popover attached to the UI:
     - Save-to folder: move the file after the `screenshot-taken` signal;
     - Timer: delay the `open()` capture, or capture after N s with `Shell.Screenshot`;
     - Remember Last Selection: the stock UI already remembers the area.
  3. Restyle the stock panel with faux glass via CSS (`.screenshot-ui-panel`).
- **Blockers / risks:**
  - Monkey-patching `ScreenshotUI` internals (private `_`-prefixed members) is fragile across 48–51, so prefer the public `open()` and the `screenshot-taken` signal (`Signals: {'screenshot-taken': {param_types: [Gio.File]}}` in 50).
  - Screencasts record no audio in GNOME's built-in recorder (an open GNOME issue). Kiwi could pipe PipeWire audio only by replacing the recorder (L).
  - Super+Shift+number may clash with workspace or app shortcuts, so check conflicts with `keybindingsModel.js`.
- **Linux equivalents today:** GNOME Screenshot UI, Kooha (recorder with audio), GPU Screen Recorder, OBS, Gradia, Satty, Flameshot (works on GNOME Wayland via the portal, with a prompt).
- **Kiwi status:** none.
- **Recommendation:** **Port (P2)**, effort **M**. macOS shortcuts plus Options on top of GNOME's own UI are a high-visibility, low-risk win.

### Floating screenshot thumbnail and instant Markup
- **Introduced / changed:** 10.14.
- **What it is:**
  - **Where:** after a capture, a thumbnail slides in at the bottom-right for about 5 s.
  - **If ignored:** the file saves normally. Hover keeps the thumbnail on screen; swipe it right to save at once.
  - **Click:** opens a Markup window (draw, shapes, text, signature, crop, rotate) with Done, Revert, Share and Delete.
  - **Drag:** drag it straight into Mail, Messages or Slack; the screenshot then exists only there, with no desktop clutter.
  - **Control-click:** Save to Desktop / Documents / Clipboard, Open in Mail / Messages / Preview / Photos, Show in Finder, Delete, Markup, Close.
  - Captures taken while a thumbnail is visible are not in the *next* screenshot.
- **Caveats (on macOS):** it delays the file appearing by about 5 s, which confuses scripts. It can be turned off in Options.
- **Port to GNOME 50:** Kiwi listens to `Main.screenshotUI` `screenshot-taken` (file) and to the screencast stop, then shows a glass thumbnail actor in a Kiwi chrome layer at the bottom-right (`Main.layoutManager.addTopChrome`, or the notch as a live activity).
  - **Click:** open in an annotate app (Satty, Swappy or Gradia, detected via `Gio.AppInfo`), or Sushi for a plain preview.
  - **Drag out:** Shell actors can start DnD only to Shell targets, not Wayland clients. Instead offer "Copy" (the stock UI already copies to the clipboard) and "Show in Files".
  - **Right-click menu:** Save to…, Copy, Open With, Show in Files, Delete (to Trash, `Gio.File.trash_async`).
  - **Suppress** the stock "Screenshot captured" notification while the thumbnail is up: filter via the notch / message tray source, matching on `Main.screenshotUI` source title.
- **Blockers / risks:** **dragging from a Shell actor into a Wayland client is not supported**, so drag-to-Slack can't be copied; this is the main gap. The stock notification filtering touches private message-tray code.
- **Linux equivalents today:** GNOME's notification with an image preview (click opens the file), Flameshot's pin and upload, Gradia.
- **Kiwi status:** none.
- **Recommendation:** **Port (P2)**, effort **M**. Very macOS and visible; the notch can host it. Accept no drag-out.

### Dock: recent applications
- **Introduced / changed:** 10.14 (iPadOS-inspired). Setting "Show recent applications in Dock" (on by default; Big Sur renamed it "Show suggested and recent apps").
- **What it is:** a section between pinned apps and the folders/Trash separator holding up to **3** recently used non-pinned apps. Running unpinned apps also appear there. Each has a separator on both sides.
- **Caveats (on macOS):** users dislike apps they quit lingering; there is no way to change the count without `defaults`; it is commonly turned off.
- **Port to GNOME 50:** in Kiwi's planned dock (§5.2), track recency from `Shell.WindowTracker` / `Shell.AppUsage` (`Shell.AppUsage.get_default().get_most_used()`) or from Kiwi's own `core/desktop.js` focus history. Persist the last 3 in GSettings `dock-recent-apps`, with a toggle and an optional count (`dock-recent-count`).
- **Blockers / risks:** none significant; `Shell.AppUsage` is public.
- **Linux equivalents today:** Dash to Dock has no recents; the GNOME dash shows running apps.
- **Kiwi status:** none (the overhaul plan lists "show recent apps" as a dock setting).
- **Recommendation:** **Port (P1 core)**, effort **S**. Already planned for the dock.

### Continuity Camera
- **Introduced / changed:** 10.14 (photo and document scan into apps); 13 Ventura reused the name for iPhone as webcam.
- **What it is:**
  - **Where:** in Finder, the desktop or supporting apps (Notes, Pages, TextEdit, Mail, Preview, Keynote), choose File/right-click › **Import from iPhone or iPad** › Take Photo / Scan Documents / Add Sketch (10.15).
  - **On the phone:** the camera opens by itself.
  - **Scan mode:** auto edge detection, auto shutter, colour / grey / B&W; multi-page PDF inserted at the cursor.
  - **Photo mode:** a JPEG at reduced resolution, EXIF stripped.
  - **Requirements:** same Apple ID, Bluetooth and Wi-Fi on, iOS 12+.
- **Caveats (on macOS):** works only in apps that adopt it; no video, HDR or Live Photo; Apple-ID and Bluetooth-range bound.
- **Port to GNOME 50:** no phone-to-PC "capture and insert" protocol exists. The nearest thing is **GSConnect** (KDE Connect protocol): "Share" from Android sends files to `~/Downloads`. Kiwi could watch GSConnect-received files (or `~/Downloads`) and show them on the notch shelf for drag or paste. Inserting at a cursor in another app isn't possible from the Shell. Clipboard sync via GSConnect covers some of it.
- **Blockers / risks:** needs a phone app; iPhones don't run KDE Connect fully (an iOS client exists with limits); no insert-into-app API in the Linux desktop.
- **Linux equivalents today:** GSConnect / KDE Connect (share and clipboard), Warp (file transfer), Android → Nearby Share via Packet / rquickshare, DroidCam (phone as webcam), Document Scanner (GNOME Simple Scan).
- **Kiwi status:** none (notch file shelf planned, §5.6).
- **Recommendation:** **Later (P3)**, effort **M**. "Files from your phone land on the notch shelf" via GSConnect is the honest approximation.

### News app
- **Introduced / changed:** 10.14 (from iOS, UIKit-on-Mac); News+ subscription in 10.14.4.
- **What it is:** Apple News: a Today feed with curated and personalised stories, channels and topics you follow, a sidebar, News+ magazines. Notifications for breaking news. US, UK, Canada and Australia only.
- **Caveats (on macOS):** iPad-like UI (Marzipan); region-locked; closing the window quits the app (un-Mac-like).
- **Port to GNOME 50:** an app, not desktop UI. Kiwi's job is at most a notch or Control Center "headline" widget fed by an RSS app or GNOME Online Accounts. No Apple News API.
- **Blockers / risks:** Apple service; licensing.
- **Linux equivalents today:** NewsFlash (GNOME Circle RSS), Feeds, Tubefeeder.
- **Kiwi status:** none.
- **Recommendation:** **Skip**, effort **—**. An app; recommend NewsFlash in Kiwi's installer if desired.

### Stocks app
- **Introduced / changed:** 10.14 (from iOS); 13 Ventura and later added currency and more.
- **What it is:** a watchlist sidebar with sparkline cards, interactive charts (1D–10Y), Apple News business stories alongside, synced via iCloud. Also a Notification Center widget.
- **Caveats (on macOS):** basic; data delayed; news region-locked.
- **Port to GNOME 50:** a notch "mini widget" (§5.6 Widgets tab) could show a watchlist, but needs a quote API (Yahoo's unofficial endpoints break; most free APIs need keys). Better left to apps.
- **Blockers / risks:** data licensing and API keys; network calls from the Shell must be async (Soup 3); privacy.
- **Linux equivalents today:** "Stocks" GNOME Shell extensions (e.g. *Stocks Extension*), Tickers apps (Flathub).
- **Kiwi status:** none.
- **Recommendation:** **Skip**, effort **M**. Low value and a data-source liability.

### Voice Memos app
- **Introduced / changed:** 10.14 (from iOS); 10.15 version 2.1; later added enhanced recording and folders.
- **What it is:** one-click recording with a live waveform, a library synced with iPhone via iCloud, trim, replace, rename by location, share. The input device follows the system default (no in-app picker at launch).
- **Caveats (on macOS):** no input selector; iPad-style UI; iCloud required for sync.
- **Port to GNOME 50:** GNOME **Sound Recorder** (`org.gnome.SoundRecorder`) is the equivalent. Kiwi value: a notch **live activity** while any app records. Detect via PipeWire / the microphone privacy indicator (Shell shows a mic indicator via `Main.panel.statusArea` / `Shell` screen-cast/mic usage), and show a waveform and elapsed time.
- **Blockers / risks:** reading which app records needs PipeWire stream info. The Shell has no direct PipeWire API, but `Gvc.MixerControl` lists source outputs (recording streams) per app, which is enough.
- **Linux equivalents today:** GNOME Sound Recorder, Audacity, the Shell's own mic-in-use indicator.
- **Kiwi status:** none (the notch has media live activities for playback).
- **Recommendation:** **Port (P2)** as a notch "recording" live activity, effort **S**. The app itself: **Skip**.

### Home app
- **Introduced / changed:** 10.14 (from iOS); 10.15 added automations and HomeKit Secure Video; later Control Center Home tile.
- **What it is:** a HomeKit dashboard: rooms, accessory tiles (lights, thermostats, locks, cameras), scenes, automations (via a Home hub). Siri control.
- **Caveats (on macOS):** criticised as the worst iOS port (slot-machine time pickers, bugs); HomeKit-only.
- **Port to GNOME 50:** Home Assistant is the Linux-world equivalent. A Control Center "Home" section could call the Home Assistant REST/WebSocket API with a user token (a toggle grid for chosen entities). There is no HomeKit access on Linux (HAP controller libraries exist in Python but pairing is complex).
- **Blockers / risks:** secrets storage (libsecret in prefs; never log tokens); a network API from the Shell must be async; scope creep.
- **Linux equivalents today:** Home Assistant web/companion apps, "Home Assistant Extension" for GNOME Shell (Quick Settings toggles).
- **Kiwi status:** none.
- **Recommendation:** **Later (P3)**, effort **M**. An optional Control Center Home section for Home Assistant users; otherwise point to the existing extension.

### Mac App Store redesign
- **Introduced / changed:** 10.14 (first real redesign since 2011).
- **What it is:** an iOS 11-style store: **Discover** (editorial stories, App of the Day), **Create / Work / Play / Develop** tabs, Categories, Updates; a left sidebar; big preview videos; your account and purchases at the bottom-left; an in-app ratings API. OS updates removed from the store.
- **Caveats (on macOS):** low information density; the Mac store remained thin.
- **Port to GNOME 50:** GNOME Software (Explore / Installed / Updates) plus Flathub. Kiwi's logo menu already plans "App Store…" → GNOME Software. Show an **update count badge** next to it: query PackageKit via D-Bus `org.freedesktop.PackageKit` `GetUpdates` (async), or GNOME Software's `org.gnome.Software` search provider. Simpler: GNOME Software already sends an "updates available" notification that Kiwi can mirror.
- **Blockers / risks:** PackageKit calls can be slow, so cache and refresh hourly; on Atomic (Silverblue) it is rpm-ostree, plus Flatpak counts.
- **Linux equivalents today:** GNOME Software, Flathub website, Bazaar (Flathub-focused store).
- **Kiwi status:** none (logo menu planned, §5.1).
- **Recommendation:** **Port (P2)**, effort **S**, only the "App Store… N updates" badge in the logo menu. The store itself: **Skip**.

### Software Update back in System Preferences
- **Introduced / changed:** 10.14 (moved from the App Store into a System Preferences pane). Later releases kept it in System Settings › General.
- **What it is:** a dedicated pane: "Automatically keep my Mac up to date", Advanced (check, download, install macOS updates, app updates, security responses), a red badge on the System Preferences icon and an "N updates" item in the Apple menu.
- **Caveats (on macOS):** large updates force restarts; the badge nags and can't be dismissed without `defaults` hacks.
- **Port to GNOME 50:** GNOME Software owns updates (offline updates on restart through `pkcon offline-trigger` / `gnome-software --mode=updates`). Kiwi: the logo menu shows "System Settings…" and "App Store…"; macOS puts "N updates" on *System Preferences…* (Catalina) or *App Store…* (Mojave). Pick one, open `gnome-software --mode=updates`, and integrate "Update and Restart" in the logo menu's Restart… dialog. GNOME's end-session dialog already shows an "Install pending software updates" checkbox when offline updates are prepared, so Kiwi's Restart… item should open that stock dialog (through `org.gnome.SessionManager` `Reboot`) instead of rebuilding it.
- **Blockers / risks:** same as above; the PackageKit and rpm-ostree split.
- **Linux equivalents today:** GNOME Software Updates page; the end-session dialog's install-updates option.
- **Kiwi status:** none.
- **Recommendation:** **Port (P2)**, effort **S**. Merge it with the App Store badge entry above (one PackageKit query).

### Group FaceTime
- **Introduced / changed:** 10.14.1 (October 2018; delayed from 10.14.0 by a bug).
- **What it is:** up to 32 participants, video or audio, tiles that grow for the active speaker, join late, ring or notify, Memoji and effects on iOS. Started from FaceTime or a Messages group.
- **Caveats (on macOS):** the "FaceTime eavesdropping" bug (January 2019) forced Apple to disable Group FaceTime server-side temporarily; Apple-only until SharePlay links (12).
- **Port to GNOME 50:** not a desktop feature. Kiwi relevance: a notch live activity for "in a call" (camera or mic active, from the privacy indicators) with mute and leave where the app exposes MPRIS (most don't).
- **Blockers / risks:** Apple service; no common call-control API on Linux.
- **Linux equivalents today:** Jitsi, browser-based Meet/Zoom, GNOME Calls (phone only).
- **Kiwi status:** none.
- **Recommendation:** **Skip**, effort **—**. The "camera or mic in use" live activity is covered under privacy indicators.

### App privacy permissions (TCC): camera, microphone, Automation, Full Disk Access; then Files and Folders, Screen Recording and Input Monitoring
- **Introduced / changed:**
  - **10.14:** camera, microphone, Mail/Messages/Safari data and Time Machine backups behind **Full Disk Access**, plus **Automation** (Apple Events between apps).
  - **10.15:** **Files and Folders** (Desktop, Documents, Downloads, iCloud Drive, removable and network volumes), **Screen Recording** (for anything reading other windows' pixels or titles, e.g. Bartender, Zoom sharing), **Input Monitoring** (keyloggers, hotkey tools), **Developer Tools**, and per-app **notification authorisation**.
  - **11+:** orange and green camera/mic dots in the menu bar.
- **What it is:**
  - **Prompt:** a modal "'App' would like to access …" with Don't Allow / OK, shown once per app per class.
  - **Where to manage:** System Preferences › Security & Privacy › Privacy, about 16 categories. Some can only be granted by dragging the app into the list, often followed by an app restart.
  - **Catalina** keeps denied apps in the list (unchecked) so you can enable them later.
  - **Implied consent:** opening or saving via the Open/Save panel or Finder drag counts as consent (powerbox).
- **Caveats (on macOS):** "Vista-like" prompt fatigue after a Catalina upgrade; utilities (window managers, launchers) need Accessibility plus Screen Recording plus Input Monitoring; resets with `tccutil`.
- **Port to GNOME 50:** GNOME's equivalent is **xdg-desktop-portal** permissions (Camera, Microphone (PipeWire), Location, Screenshot / ScreenCast, Background, Notifications, Remote Desktop / Input Capture). These are mostly enforced only for Flatpak apps; host apps can do anything. Settings › Privacy & Security and › Apps manage them. Shell shows **screen-share** and **mic/camera/location** indicators in the top bar (GNOME 4x). Kiwi:
  - Restyle these indicators as macOS-style **coloured privacy dots** in the menu bar (orange = mic, green = camera, purple = screen recording, blue = location). They live inside the Quick Settings indicator box (private members such as the remote-access / screen-sharing indicator and the camera, microphone and location indicators), so Kiwi must find them defensively and re-check per GNOME release. Clicking shows the list of apps using them (Control Center does this in macOS 12+).
  - The notch can flash a privacy dot.
- **Blockers / risks:** the indicators are private Shell internals (names change between releases). Host (non-Flatpak) apps bypass permissions, so Kiwi cannot add real TCC. Never claim security Kiwi doesn't provide.
- **Linux equivalents today:** GNOME Settings › Privacy & Security, › Apps (per-app portal permissions), Flatseal, Shell's privacy indicators.
- **Kiwi status:** none.
- **Recommendation:** **Port (P2)**, effort **S–M**, for the privacy dots plus "who is using it" in the menu bar or Control Center. The permission system itself: **Skip** (it is GNOME and portals).

### Safari 12 (Mojave)
- **Introduced / changed:** 10.14 (Safari 12, also on 10.12 and 10.13); 12.1 in 10.14.4 added dark web content.
- **What it is:** Intelligent Tracking Prevention 2.0 (blocks Like/Share/comment widgets, Storage Access prompts); simplified system fingerprint; automatic strong passwords and a reused-password audit; **favicons in tabs** (opt-in); legacy `.safariextz` extensions disabled; NPAPI plugins except Flash dropped; `prefers-color-scheme` support (12.1).
- **Caveats (on macOS):** the extension purge hurt; fingerprint defence was weak in tests (Ars).
- **Port to GNOME 50:** browser features, not Shell. Epiphany (GNOME Web) is the WebKit sibling and has ITP and password management. Kiwi dropped browser theming (§2 decisions).
- **Blockers / risks:** —
- **Linux equivalents today:** GNOME Web (Epiphany, WebKitGTK with ITP), Firefox ETP, Chromium.
- **Kiwi status:** none (by decision).
- **Recommendation:** **Skip**.

### Mojave removals: subpixel antialiasing and social-network integrations
- **Introduced / changed:** 10.14.
- **What it is:** LCD subpixel font smoothing was removed (grayscale only; it can be partly brought back with `defaults write -g CGFontRenderingFontSmoothingDisabled -bool NO`, a stem-darkening option). The Internet Accounts integrations for Facebook, Twitter, Vimeo, Flickr and LinkedIn were removed from Share menus and Contacts.
- **Caveats (on macOS):** text looked thinner on non-Retina displays, which drew complaints.
- **Port to GNOME 50:** GNOME has `org.gnome.desktop.interface font-antialiasing` (grayscale default since 46; rgba available) and `font-hinting`. Kiwi shouldn't change it; a "macOS-like text" preset (grayscale, slight hinting) is already GNOME's default.
- **Blockers / risks:** —
- **Linux equivalents today:** GNOME Tweaks / Settings font options.
- **Kiwi status:** n/a.
- **Recommendation:** **Skip**.

---

## Catalina (10.15) features

### Window tile menu on the green button
- **Introduced / changed:** 10.15 (hover menu); 11 adds the 4-zone layout picker and "Move to …"; 15 Sequoia adds full window tiling.
- **What it is:**
  - **Hover menu:** hovering the green traffic light for about 1 s (or long-pressing it) shows a menu: **Enter Full Screen**, **Tile Window to Left of Screen**, **Tile Window to Right of Screen**, and "Move to <display/iPad>" when there is another display or Sidecar.
  - **Tile left/right** enters full-screen **Split View**: the other half shows Mission Control-style thumbnails to pick the partner. The divider drags to resize; double-clicking the title bar or the divider swaps.
  - **Option key:** holding ⌥ turns the items into **Move Window to Left/Right Side of Screen**, which tiles without full screen.
  - **Window menu:** the same items appear there (no default shortcuts; assignable in Keyboard › Shortcuts).
  - **Zoom:** ⌥-clicking the green button zooms instead.
- **Caveats (on macOS):** Split View only works with full-screen-capable apps. It is limited to two apps; no quarters until Sequoia. The hover delay is easy to miss.
- **Port to GNOME 50:** planned in §5.7. Kiwi's panel traffic lights (or the app's own green button in app-buttons mode) get a hover popover (St `PopupMenu` on a hover timeout) with:
  - Fill (`maximize()`, no flags on 49+);
  - Centre;
  - Tile Left/Right (Kiwi tiling engine: set the frame to half of `core/layout.js` work area via `move_resize_frame`);
  - Full Screen (`make_fullscreen()`);
  - Move to Display ▸ (`move_to_monitor`) and Move to Workspace ▸ (`change_workspace_by_index`).
  - A "Split View" mode: after Tile Left, show a picker of other windows on the free half (a Mission Control-style thumbnail spread using `Meta.WindowActor` clones). That is the Catalina behaviour, done without full screen.
- **Blockers / risks:** hover on **client-side** green buttons (libadwaita/GTK4 CSD) can't be detected by the Shell, so it works only on Kiwi's panel controls, or on server-side decorated windows via the titlebar `Meta.Window` frame rect plus pointer polling (fragile). GNOME's own edge tiling (`edge-tiling`, Super+←/→) must be kept in step to avoid double tiling (tech-debt doc).
- **Linux equivalents today:** GNOME edge tiling and Super+arrows, Tiling Shell, Forge, gTile, Tiling Assistant (has a similar layout popup), Pop Shell.
- **Kiwi status:** partial (`apps/windowTiling.js` exists; no green-button menu yet; planned P1).
- **Recommendation:** **Port (P1 core)**, effort **M**. Already in P1; add the "pick the partner window" step.

### Auto appearance (Light / Dark / Auto)
- **Introduced / changed:** 10.15.
- **What it is:**
  - **Where:** General › Appearance gets a third option, **Auto**.
  - **When it switches:** Light by day and Dark by night, using sunset and sunrise for the user's location (Location Services; time-zone fallback).
  - **No switch mid-work:** it changes only when the Mac is idle, or when no app holds a "don't switch now" assertion (e.g. full-screen video), so it never flips under you.
  - **Dynamic wallpapers** follow it.
- **Caveats (on macOS):** no custom times (Night Shift has custom times, Auto doesn't); it may switch late because of the idle rule.
- **Port to GNOME 50:** GNOME has no Auto. Kiwi can own it:
  - **Schedule:** a sunrise/sunset calculator (pure JS) using GeoClue location via `Geoclue` gi (allowed in Shell; GNOME's Night Light uses `gsd-color` with geoclue), or reuse Night Light's schedule `org.gnome.settings-daemon.plugins.color night-light-schedule-from/-to` / automatic.
  - **Switching:** flip `org.gnome.desktop.interface color-scheme` at the boundary, only when idle (`Meta.IdleMonitor` `add_idle_watch`) or when no full-screen window is focused.
  - **UI:** expose Light/Dark/Auto in Control Center and prefs; restore the user's original value on disable (save it in `saved-color-scheme`).
- **Blockers / risks:** Kiwi writes a GNOME setting, so it must save and restore (the "never overwrite user state Kiwi didn't create" spirit: record and restore). It conflicts with Night Theme Switcher if both are installed; detect and defer.
- **Linux equivalents today:** the Night Theme Switcher extension (exactly this), Auto Dark Mode-style scripts, KDE's day/night global theme (Plasma 6.x).
- **Kiwi status:** none.
- **Recommendation:** **Port (P1 core)**, effort **S**. Small and very macOS; pairs with Dynamic Desktop and faux-glass variants.

### Sidecar (iPad as second display)
- **Introduced / changed:** 10.15. Universal Control (12.3) is separate. 11 moved Sidecar into Displays and Control Center.
- **What it is:**
  - **Connecting:** start from the Mac only: the AirPlay/Displays menu-bar item, the green-button "Move to iPad", the Window menu, or the Sidecar pane. Wired (USB/Lightning) or wireless (AWDL peer-to-peer) within about 10 m.
  - **Display modes:** extend or mirror; it appears in Displays as a virtual device. Fixed 2× scaling, no resolution choice.
  - **Input:** the **Apple Pencil** acts as pointer and pressure tablet (pressure and tilt in tablet-aware apps). Fingers can't click, but two-finger scroll and pinch gestures work.
  - **Sidebar** (left or right): show/hide menu bar, show/hide Dock, keyboard, ⌘ ⌥ ⌃ ⇧ modifier keys, undo, disconnect.
  - **Touch Bar strip** (top or bottom, or hidden).
  - **Requirements:** HEVC hardware encoding (Skylake+ or T2), an iPad with Pencil support, the same Apple ID, and only one iPad at a time.
- **Caveats (on macOS):** hardware gating; same Apple ID; slightly laggy wirelessly; GPU cost from encoding; Six Colors called it "not a good Mac experience or a good iPad experience."
- **Port to GNOME 50:** the pieces exist below the Shell:
  - **Virtual monitor:** Mutter's `org.gnome.Mutter.ScreenCast` `RecordVirtual` creates a **virtual monitor** stream (used by gnome-remote-desktop and gnome-network-displays). GNOME Remote Desktop 46+ supports RDP with an *extended* virtual monitor.
  - **Tablet side:** an RDP client on the tablet (Android, iPad) gives a working second screen with pen as pointer. Weylus (browser-based, pen pressure via `uinput`) is the closest "Sidecar" today.
  - **Kiwi role:** a Control Center tile "Use <tablet> as display" that drives gnome-remote-desktop (via its D-Bus or `grdctl`) — or better, documentation.
  - **Pen pressure** over RDP is not supported; Weylus needs `uinput` permissions.
- **Blockers / risks:** `org.gnome.Mutter.ScreenCast` is restricted to allowed callers in recent Mutter (it checks the sender is privileged); an extension could call it from the Shell process itself, but owning a PipeWire encoder pipeline in the compositor is heavy and risky. No AWDL equivalent. Pen pressure needs a tablet-side app plus `uinput`.
- **Linux equivalents today:** GNOME Remote Desktop (extend mode), Weylus, Deskreen (browser second screen via virtual display), gnome-network-displays (Miracast sink side), KDE's "Virtual Monitor" over KDE Connect (Plasma 6.1+).
- **Kiwi status:** none.
- **Recommendation:** **Skip** (document gnome-remote-desktop and Weylus), effort **XL**. High cost, compositor risk, small audience.

### Continuity Sketch and Continuity Markup
- **Introduced / changed:** 10.15 (iOS 13 / iPadOS 13).
- **What it is:** *Sketch*: "Import from iPhone or iPad › Add Sketch" opens a drawing canvas on the iPad and inserts the result into the Mac doc. *Markup*: in Quick Look or Preview Markup, a device button sends the file to the iPad for Pencil markup, mirrored live on the Mac, then saved back.
- **Caveats (on macOS):** Apple ID, Bluetooth range, app adoption needed.
- **Port to GNOME 50:** no cross-device protocol for live markup. With GSConnect, "send file to phone", annotate there, and send back. That is two shares, not Continuity.
- **Blockers / risks:** needs phone-side apps; no live-mirroring protocol.
- **Linux equivalents today:** GSConnect share, Xournal++ with a tablet, Weylus pen input.
- **Kiwi status:** none.
- **Recommendation:** **Skip**.

### Screen Time
- **Introduced / changed:** 10.15 (from iOS 12; replaces Parental Controls); 10.15.4 adds Communication Limits; later releases moved it into System Settings with more charts.
- **What it is:**
  - **Where:** System Preferences › Screen Time.
  - **Reports:** usage per day and week, per app, category and website; **Notifications** counts; **Pickups** (iOS); combined across devices via iCloud (opt-in).
  - **Downtime:** a schedule in which only Always Allowed apps work, with an optional block at downtime.
  - **App Limits:** per app, category or site, with a daily time and custom days. When a limit hits, a grey shield screen appears with **"One More Minute"** (save your work), Ignore Limit (15 min / today), or "Ask for More Time" (child accounts).
  - **Communication Limits** (10.15.4): who can contact the user in FaceTime and Messages during allowed time and Downtime.
  - **Always Allowed.**
  - **Content & Privacy:** web filters, explicit media, Siri, Game Center, purchase restrictions.
  - **Screen Time passcode.**
  - **Family Sharing:** manage children's accounts from the parent's Mac.
- **Caveats (on macOS):**
  - Ars noted Mac usage counts apps that are merely *open* (even minimised) as used, which skews the numbers.
  - The pane is too small for the charts.
  - Upgrading from Mojave **wiped Parental Controls**, leaving accounts unmanaged.
  - Child management requires iCloud Family Sharing (local accounts can't be managed).
- **Port to GNOME 50:** GNOME **48+ has Wellbeing**: Settings › Wellbeing with screen-time usage charts, a daily limit (with grayscale or notification at the limit), and break reminders. GNOME 49/50 extended **Parental Controls** (malcontent) with per-child screen time limits and app restrictions in Settings.
  - Kiwi's value is limited to surfacing: a Control Center or notch "Screen Time today: 3 h 12 m" mini widget read from GNOME's data. Shell's own `TimeLimitsManager` in `js/misc/timeLimitsManager.js` (48+) tracks active time; it is a private API, so read the `org.gnome.desktop.screen-time-limits` settings plus the history file.
  - Per-app usage charts aren't in GNOME. `Shell.AppUsage` keeps scores, not durations.
- **Blockers / risks:** private Shell modules; per-app time tracking would need Kiwi's own focus-time log (a privacy-sensitive file).
- **Linux equivalents today:** GNOME Wellbeing (48+), malcontent Parental Controls, ActivityWatch (per-app usage), Timekpr-nExT.
- **Kiwi status:** none.
- **Recommendation:** **Skip** (GNOME covers it), effort **—**. Optionally **Later (P3)**, **S**, a "today's screen time" widget in the notch Widgets tab.

### Find My (app and offline finding)
- **Introduced / changed:** 10.15 (merges Find My Mac/iPhone and Find My Friends into one Catalyst app); 11+ adds AirTags and items.
- **What it is:**
  - **People** (location sharing with friends and family, notify when someone leaves or arrives), **Devices** (map, play sound, directions, Mark as Lost, Erase), **Me**.
  - **Offline finding:** a sleeping or offline Mac sends an encrypted, rotating Bluetooth beacon; any nearby Apple device relays the location end-to-end encrypted, so only the owner can decrypt it. It works for Macs with no network.
  - Activation Lock ties into it.
- **Caveats (on macOS):** iCloud-only; iPad-style UI; the Today widget for Friends was removed.
- **Port to GNOME 50:** no crowd network on Linux. Practical analogues:
  - **GSConnect "Ring"/"Locate"** for the *phone* from the desktop (D-Bus `org.gnome.Shell.Extensions.GSConnect` device `ring` action). Kiwi could add a "Find my phone" button in Control Center when GSConnect is present.
  - For the laptop itself: Prey (third-party), or GNOME's "lost device" doesn't exist.
- **Blockers / risks:** relies on GSConnect being installed and paired; cross-extension D-Bus is a public API (GSConnect exports `org.gnome.Shell.Extensions.GSConnect` with device actions via `org.gtk.Actions`).
- **Linux equivalents today:** GSConnect / KDE Connect "Ring device", Google Find My Device (web), Prey.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3)**, effort **S**. A "Ring phone" Control Center action via GSConnect; skip anything more.

### Activation Lock for Macs (T2)
- **Introduced / changed:** 10.15 (T2 Macs); later Apple silicon.
- **What it is:** when Find My Mac is on, the Mac's firmware and secure enclave bind it to the Apple ID. Erasing or reinstalling requires the owner's Apple ID password, which makes stolen Macs useless.
- **Caveats (on macOS):** second-hand Macs locked by previous owners (an e-waste problem); needs Apple support to remove with proof of purchase.
- **Port to GNOME 50:** firmware-level; nothing an extension can do. The closest Linux concepts are a firmware (UEFI) password, LUKS full-disk encryption, and TPM-bound unlock (systemd-cryptenroll).
- **Blockers / risks:** hardware and firmware.
- **Linux equivalents today:** LUKS + TPM2, BIOS supervisor passwords, vendor anti-theft (Lenovo/Dell).
- **Kiwi status:** n/a.
- **Recommendation:** **Skip**.

### Approve with Apple Watch
- **Introduced / changed:** 10.15 + watchOS 6 (Auto Unlock from 10.12 Sierra).
- **What it is:** in place of typing the admin password, double-click the Watch side button to approve: unlocking System Preferences panes, viewing Safari passwords, unlocking locked Notes, approving app installs and some `sudo`-like admin prompts, and opening protected settings. It needs Auto Unlock on (Security & Privacy › General), 2FA, and a Mac with 802.11ac (2013+).
- **Caveats (on macOS):** not every prompt supports it; Watch range and Bluetooth flakiness; macOS 26 has the iPhone also act as a key.
- **Port to GNOME 50:** auth is polkit plus PAM. The Shell is GNOME's **polkit agent** (`js/ui/components/polkitAgent.js`) and supports fingerprint via fprintd (PAM `pam_fprintd`). A phone-as-key would need a PAM module (e.g. `pam_bluetooth`-style proximity, or a KDE Connect "approve" flow; neither is standard). Kiwi could only restyle the polkit dialog (faux glass, macOS wording "<App> wants to make changes. Enter your password to allow this.").
- **Blockers / risks:** PAM and auth stacks are security-critical and out of an extension's scope; reviewers would reject auth changes.
- **Linux equivalents today:** fprintd (fingerprint), Howdy (face IR, PAM), pam_u2f (security keys), BlueProximity (old).
- **Kiwi status:** none.
- **Recommendation:** **Skip** the approval mechanism. **Later (P3)**, effort **S**, a macOS-style restyle of the polkit and auth dialogs.

### Music app (iTunes split)
- **Introduced / changed:** 10.15 (from iTunes code, AppKit); 10.15.4 time-synced lyrics; 11+ redesigns; later Autoplay, AutoMix (26).
- **What it is:**
  - **Library:** Apple Music, Listen Now / For You, Browse, Radio, then Library (Recently Added, Artists, Albums, Songs), Store (optional), and playlists in a colourful sidebar.
  - **Panels:** Up Next and Lyrics panels slide over the content (unless the window is wide).
  - **Player bar:** now-playing on the left, controls in the centre, volume on the right; MiniPlayer; full-screen player; AirPlay 2 multi-room.
  - **CD import and Smart Playlists** survive; the old **Column Browser** was removed.
  - **Media keys** and the Notification Center/Control Center now-playing tile.
- **Caveats (on macOS):** power-user losses (Column Browser); Apple Music upsell; slow with large libraries; iCloud Music Library matching issues.
- **Port to GNOME 50:** app, not Shell. Kiwi's relevant part: the **notch/Control Center Now Playing** (via MPRIS, already in Kiwi). Add **time-synced lyrics** in the expanded notch from MPRIS `xesam:asText` (rare) or LRCLIB (online lookup; privacy opt-in).
- **Blockers / risks:** lyrics need a network service; MPRIS players vary in metadata quality.
- **Linux equivalents today:** GNOME Music, Rhythmbox, Lollypop, Amberol, Tauon, Spotify; lyrics via "Lyrics" extensions or Lollypop.
- **Kiwi status:** have (Now Playing in Control Center and the notch via MPRIS; `apps/mediaPlayback.js`, `controlCenter/nowPlaying.js`).
- **Recommendation:** **Skip** the app. **Later (P3)**, effort **M**, synced lyrics in the expanded notch (opt-in online).

### Apple TV app
- **Introduced / changed:** 10.15 (TV+ launched in November 2019).
- **What it is:** Watch Now with Up Next, Apple TV+, Channels, the iTunes Store movie and TV catalogue, the library of purchases, 4K HDR / Dolby Vision / Atmos on 2018+ Macs; screenshots of DRM content are blocked.
- **Caveats (on macOS):** no third-party service integration on Mac (unlike tvOS); DRM.
- **Port to GNOME 50:** not desktop UI. The Shell already blocks nothing (no DRM surface path). Players: Showtime (GNOME 49+ default video player), Celluloid, mpv.
- **Blockers / risks:** —
- **Linux equivalents today:** Showtime, Celluloid, Kodi, browsers for streaming.
- **Kiwi status:** n/a.
- **Recommendation:** **Skip**.

### Podcasts app
- **Introduced / changed:** 10.15 (Catalyst port from iPad, replacing iTunes podcasts).
- **What it is:** Listen Now, Browse, Top Charts, a Library of shows and episodes, Up Next, transcripts (later), sync with iPhone, search across hosts and topics.
- **Caveats (on macOS):** iOS-isms (swipe to delete, no keyboard delete); show notes hidden.
- **Port to GNOME 50:** app only; MPRIS already covers playback UI.
- **Blockers / risks:** —
- **Linux equivalents today:** GNOME Podcasts, Kasts (KDE), gPodder.
- **Kiwi status:** n/a.
- **Recommendation:** **Skip**.

### iPhone and iPad management in Finder
- **Introduced / changed:** 10.15 (moved from iTunes).
- **What it is:** a connected device appears in the Finder sidebar under Locations. Selecting it shows a General tab (update or restore iOS, backups to the Mac (encrypted), manage backups), Music / Movies / TV / Podcasts / Books / Photos / Files sync tabs, and a sync button. Wi-Fi sync is optional.
- **Caveats (on macOS):** no transfer progress bar; the Files tab differs from On My iPhone.
- **Port to GNOME 50:** Nautilus already shows phones via gvfs (AFC for iPhone with `libimobiledevice`, MTP for Android) in its sidebar. Backups via `idevicebackup2` (CLI). Kiwi has no role beyond maybe a notch "phone connected / charging" live activity (from UPower device or `Gio.VolumeMonitor` `mount-added`).
- **Blockers / risks:** iOS pairing on Linux is flaky with new iOS versions.
- **Linux equivalents today:** Nautilus + gvfs-afc/MTP, libimobiledevice tools, GSConnect.
- **Kiwi status:** none.
- **Recommendation:** **Skip**. Optionally a "device connected" live activity is trivial, but don't spend time on it.

### Mac Catalyst (iPad apps on the Mac)
- **Introduced / changed:** previewed in 10.14 (News, Stocks, Voice Memos, Home; multi-process UIKitHost); opened to developers in 10.15 (single process; Podcasts, Find My); 11 "Optimized for Mac" idiom; Apple-silicon Macs also run unmodified iPhone and iPad apps (11+).
- **What it is:** UIKit apps compiled for macOS. Taps map to clicks, swipes to scrolling; the apps gain the menu bar, multiple windows, the Touch Bar, keyboard shortcuts, drag and drop, and the macOS toolbar. They are distributed via the Mac App Store or Developer ID.
- **Caveats (on macOS):** apps feel non-native (iOS pickers, modal sheets, close-window-quits, blurry 77 % scaling of text in the 10.14/10.15 "iPad idiom"); poor docs at launch; a separate App Store purchase (no universal purchase at first).
- **Port to GNOME 50:** the concept on Linux is **adaptive apps** (libadwaita breakpoints, GTK4) that run on desktop and Linux phones, or **Waydroid** (Android in a container, windowed via its multi-window mode).
  - Kiwi's angle: **menu-bar integration for apps without menus**. That is §5.1's generic menus plus GTK actions, the same problem Catalyst solved with an auto menu bar.
  - Waydroid windows appear as normal Wayland windows, so dock and Stage Manager handle them.
- **Blockers / risks:** —
- **Linux equivalents today:** libadwaita adaptive apps, Waydroid, Anbox (dead).
- **Kiwi status:** partial (generic app menus planned, §5.1).
- **Recommendation:** **Skip** as a feature (it's a dev framework). The lesson — every app gets a menu bar — is already in P1/P6.

### Voice Control
- **Introduced / changed:** 10.15 (also iOS 13); later adds more languages and custom commands.
- **What it is:**
  - **Turning it on:** Accessibility › Voice Control (a one-time download; on-device Siri speech engine). A floating mic overlay shows what it heard, and "go to sleep" / "wake up" pauses it.
  - **Commands:** "open Safari", "click Done", "scroll down", "press command tab", "select previous word", "show commands".
  - **"Show numbers"** overlays numbers on every clickable element (from the accessibility tree); say "click 12". Menus and context menus get numbers automatically.
  - **"Show grid"** gives a numbered 3×3 grid that recursively zooms for clicking anywhere; drag via "drag 3 to 7".
  - **Dictation** with editing ("replace X with Y", "correct that").
  - **Custom commands** (text, shortcuts, workflows) and a vocabulary list.
- **Caveats (on macOS):** Electron apps and Chrome or Firefox exposed almost nothing to "show numbers" at launch; mic quality matters; it is designed for sighted users with motor impairments; English-first.
- **Port to GNOME 50:** the pieces exist:
  - **Speech recognition:** Vosk, or Whisper (whisper.cpp) or the Speech Note app, local and private, in an **out-of-process helper**.
  - **Numbers overlay:** a Shell overlay actor fed by **AT-SPI** queries of the focused app's actionable elements (`Atspi` component extents). AT-SPI must run in the helper, **not in the Shell**: synchronous AT-SPI calls in the compositor can deadlock with the app being queried.
  - **Grid:** pure Shell overlay plus a pointer warp via a virtual input device (`Clutter.get_default_backend().get_default_seat().create_virtual_device()`), which extensions may use.
  - **Key presses:** also via the Clutter virtual keyboard.
- **Blockers / risks:** AT-SPI coverage on GTK4 is good, but Electron and Chromium need `--force-renderer-accessibility`. Speech models are large (100 MB–1 GB). An XL project, with a11y responsibility.
- **Linux equivalents today:** Numen (voice control, Wayland via `dotool`), Talon (commercial), nerd-dictation, Speech Note, GNOME's planned dictation (none shipped), Orca (screen reader, a different need).
- **Kiwi status:** none (the AT-SPI menu mode experiment in §5.1 shares tech).
- **Recommendation:** **Later (P3)**, effort **XL**. A grid-click overlay and "show numbers" could reuse §5.1's AT-SPI helper; speech is a separate project.

### Hover Text
- **Introduced / changed:** 10.15.
- **What it is:**
  - **Where:** Accessibility › Zoom › Enable Hover Text.
  - **How:** hold **⌘** (configurable modifier) and point at any text or UI item. A large, high-resolution text bubble appears near the pointer with the item's text (from the accessibility tree), in a chosen font, size (up to 128 pt) and colours.
  - **Triple-press** the modifier to lock it on.
  - **Text-entry mode:** typing into a field shows the field's contents enlarged in a bar (top, middle or bottom).
- **Caveats (on macOS):** depends on app accessibility support; ⌘ conflicts with click-modifiers.
- **Port to GNOME 50:** use an AT-SPI helper (out of process). On modifier hold, query the accessible at the pointer (`Atspi.Component.get_accessible_at_point`), read its name or text, and send it to the Shell over D-Bus. Kiwi renders a large glass bubble near the pointer (`global.get_pointer()` tracking with a `GLib.timeout` at about 30 Hz while held, or `Clutter` stage motion events only over Shell UI). The text-entry mode uses AT-SPI `text-changed` events on the focused field.
- **Blockers / risks:** pointer tracking over Wayland clients isn't delivered to the Shell as events; poll `global.get_pointer()` (cheap). AT-SPI latency; must not run in the compositor.
- **Linux equivalents today:** GNOME Magnifier (Super+Alt+8, lens or full screen), Orca "flat review", none that match Hover Text.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3)**, effort **M**. Valuable a11y, and it shares the AT-SPI helper with app menus.

### Zoom on a separate display, and Display colour filters
- **Introduced / changed:** 10.15 (Zoom display picker; colour filters ported from iOS).
- **What it is:**
  - **Zoom:** Accessibility › Zoom can send the zoomed view to a *second display* while the main one stays normal; picture-in-picture zoom (a lens following the pointer) with stationary / follow-pointer modes. Shortcuts ⌥⌘8 (toggle), ⌥⌘= / ⌥⌘- (zoom), or ⌃ + scroll.
  - **Colour Filters** (Accessibility › Display › Colour Filters): Greyscale, Red/Green (protanopia), Green/Red (deuteranopia), Blue/Yellow (tritanopia), Colour Tint with intensity.
  - **Display options:** Invert colours, Reduce motion, Increase contrast, Reduce transparency, cursor size and shake-to-locate (10.11).
- **Caveats (on macOS):** filters apply to the display only, so screenshots are unfiltered. Greyscale is also used as a wind-down trick. Zoom on a separate display needs at least two displays.
- **Port to GNOME 50:**
  - **Magnifier:** GNOME has one (`Main.magnifier`, settings `org.gnome.desktop.a11y.magnifier`; lens, full screen, colour effects: brightness, contrast, invert, greyscale via `color-saturation`), but no "zoom on second monitor" mode.
  - **Colour filters:** Kiwi can implement them as a **Clutter effect on `global.stage` or `Main.layoutManager.uiGroup`**: `Clutter.DesaturateEffect` for greyscale (public, stable), plus a colour-matrix `Clutter.ShaderEffect` for daltonisation and tint.
  - Expose them in Control Center › Accessibility and in prefs, honouring GNOME's own `high-contrast` and `reduced-motion`.
- **Blockers / risks:** GNOME 51 removes `Shell.GLSLEffect` and `ShaderEffect.set_shader_source` (skill version matrix), so custom shaders need the snippet API path (`lib/compat.js` `createShaderEffect`) and re-testing. A full-stage effect costs GPU and disables unredirection of full-screen games (use `lib/compat.js` `setUnredirectAllowed`). Shell 48's wellbeing greyscale may already apply a desaturate effect at the time limit; Kiwi must not stack two.
- **Linux equivalents today:** GNOME Magnifier, the "Colour Blind Filters" GNOME extension (exactly this), Night Light (warm tint).
- **Kiwi status:** none (Kiwi already honours reduced motion via `lib/compat.js`).
- **Recommendation:** **Port (P2)**, effort **S–M**. Colour filters (greyscale, three daltonise filters, tint) as Control Center accessibility toggles. Skip zoom-on-second-display.

### Gatekeeper and notarization
- **Introduced / changed:** notarization optional from 10.14 (stapled tickets); **required** for Developer ID software in 10.15 (from February 2020 strictly); 10.15 Gatekeeper also re-checks apps periodically and checks everything launched, not just quarantined downloads. 15 Sequoia removed the Control-click › Open bypass (now Settings › Privacy & Security › Open Anyway).
- **What it is:** on first launch of downloaded software: "'App' is an app downloaded from the Internet. Are you sure you want to open it?" for notarized apps, or "cannot be opened because the developer cannot be verified" / "Apple cannot check it for malicious software" for un-notarized ones, with Move to Trash / Cancel. Control-click › Open, or Security & Privacy › "Open Anyway", allows it. The quarantine xattr `com.apple.quarantine` drives this. Apple's notary service scans uploaded builds automatically (not app review).
- **Caveats (on macOS):** friction for open-source and indie apps; online OCSP checks caused the November 2020 Big Sur launch slowdowns; privacy concerns about app-launch pings.
- **Port to GNOME 50:** Linux trust comes from distro repos (signed RPMs), **Flatpak** with Flathub's verified publishers and sandbox permissions, and GNOME Software's "unsafe permissions" warnings. Nautilus has no quarantine prompt for downloaded executables (executables need `chmod +x`). Kiwi has nothing to add in the Shell. The owner's **installer** project (see `installer-and-app-lifecycle.md`) is the right place for any "verified developer" UX.
- **Blockers / risks:** —
- **Linux equivalents today:** RPM GPG signing, Flathub verification badges, Flatpak sandbox, SELinux, fapolicyd (allow-listing on enterprise).
- **Kiwi status:** n/a.
- **Recommendation:** **Skip** (installer research covers app trust).

### Read-only system volume
- **Introduced / changed:** 10.15 (separate read-only System volume plus a writable Data volume in an APFS volume group, firmlinks joining them); 11 Big Sur made it a cryptographically **Signed System Volume** booted from a snapshot.
- **What it is:** users see one volume in Finder; `/System` is immutable even to root (SIP). User data lives in `/System/Volumes/Data`; root-level folders are created via `synthetic.conf`; updates replace the system volume atomically.
- **Caveats (on macOS):** broke tools that wrote to `/` (e.g. `/data` mount points, Nix needed `synthetic.conf`); harder system tinkering.
- **Port to GNOME 50:** the Linux analogue is **Fedora Atomic** (Silverblue: an rpm-ostree read-only `/usr`, atomic updates and rollbacks) and bootc. It is relevant to Kiwi only as a deployment target: Kiwi must install in `~/.local/share/gnome-shell/extensions` (works on Atomic) and never need root.
- **Blockers / risks:** —
- **Linux equivalents today:** Fedora Silverblue, Kinoite, bootc images, openSUSE Aeon, Vanilla OS.
- **Kiwi status:** n/a (Kiwi already installs per-user).
- **Recommendation:** **Skip** (note for the installer: support Atomic).

### End of 32-bit apps
- **Introduced / changed:** warnings in 10.13.4 and 10.14 (once per 30 days); removed in 10.15.
- **What it is:** 32-bit apps (Carbon, QuickTime 7 codecs, old games, the old Steam client) show crossed-out icons and a "needs to be updated" alert linking to support. System Information › Legacy Software lists them; the Catalina installer warns before upgrading.
- **Caveats (on macOS):** lost games and pro tools, the reason many held back on Mojave.
- **Port to GNOME 50:** irrelevant to Shell. Fedora still ships 32-bit (i686) multilib libraries for Steam and Wine.
- **Blockers / risks:** —
- **Linux equivalents today:** —
- **Kiwi status:** n/a.
- **Recommendation:** **Skip**.

### Dashboard removed (Today widgets take over)
- **Introduced / changed:** Dashboard (10.4) disabled by default in 10.10 and removed in 10.15. Widgets lived on in Notification Center's Today view, which was redesigned in 11 and placed on the desktop in 14.
- **What it is:** Dashboard was a separate layer (F12, its own Space) of HTML/JS widgets: weather, calculator, stickies, world clock, dictionary. In Catalina, stickies move to the Stickies app, and the Today view widgets (Calendar, Weather, Stocks, Reminders, World Clock, Find My Friends (removed)) remain.
- **Caveats (on macOS):** a few die-hards lost workflows; widget gallery sparse until 11.
- **Port to GNOME 50:** Kiwi's notch **Widgets tab** (§5.6: calendar day, weather, quick toggles) and the calendar card are the modern equivalent. GNOME Shell has Weather and World Clocks in the date menu (`Main.panel.statusArea.dateMenu`, using GWeather plus `org.gnome.clocks` locations).
- **Blockers / risks:** GWeather from the Shell is fine (the date menu uses it).
- **Linux equivalents today:** GNOME date menu (calendar, weather, world clocks), Conky, Desktop Widgets extensions.
- **Kiwi status:** partial (calendar card; notch widgets planned).
- **Recommendation:** **Skip** Dashboard itself; the widget idea is already in P5 (notch Widgets).

### zsh becomes the default shell
- **Introduced / changed:** 10.15 (new accounts; bash 3.2 stayed but showed a "default interactive shell is now zsh" notice).
- **What it is:** Terminal uses zsh for new users; `chsh -s /bin/zsh` for existing ones. It is a GPLv3-avoidance move (bash 4+ is GPLv3).
- **Caveats (on macOS):** dotfile migration.
- **Port to GNOME 50:** not desktop. Fedora defaults to bash; Ptyxis is the terminal (Fedora 41+).
- **Blockers / risks:** —
- **Linux equivalents today:** —
- **Kiwi status:** n/a.
- **Recommendation:** **Skip**.

### Photos redesign
- **Introduced / changed:** 10.15 (Days / Months / Years curated views, Memory Movies, autoplaying Live Photos and video).
- **What it is:** ML picks key photos, crops and de-duplicates (hides screenshots and near-duplicates in curated views), groups by event and place, and shows "All Photos" for everything. Memories can be edited (mood, length).
- **Caveats (on macOS):** curated views hide photos users expect to see.
- **Port to GNOME 50:** app; no Shell role. Search providers (Spotlight) could surface photos via LocalSearch (TinySPARQL), already done by Kiwi Spotlight's D-Bus search-provider plumbing if a photo app exposes one (Shotwell doesn't; GNOME Photos is deprecated).
- **Blockers / risks:** —
- **Linux equivalents today:** Shotwell, digiKam, Immich (self-hosted, Google-Photos-like), Loupe for viewing.
- **Kiwi status:** n/a.
- **Recommendation:** **Skip**.

### Reminders, Notes and Mail updates
- **Introduced / changed:** 10.15.
- **What it is:** **Reminders** rebuilt: Today / Scheduled / Flagged / All smart lists, subtasks, attachments, natural-language dates, @mention people in Messages (iOS), a quick toolbar. **Notes:** Gallery view, shared folders, view-only collaboration, better checklists, text recognition in scanned docs and images for search. **Mail:** block sender, mute thread, one-click unsubscribe, a new layout.
- **Caveats (on macOS):** the new Reminders format was not readable by older OS versions after upgrade (sync broke until all devices updated).
- **Port to GNOME 50:** apps. Kiwi-relevant: the notch or Control Center could show **today's tasks**. GNOME has Endeavour (formerly To Do, now unmaintained), Errands (GNOME Circle, CalDAV via Evolution Data Server or Nextcloud). EDS task lists are reachable from the Shell: the date menu already reads EDS calendars through `gnome-shell-calendar-server`, but tasks are not exported, so an EDS query in a helper is needed.
- **Blockers / risks:** EDS access from the Shell is possible via `EDataServer`/`ECal` gi but synchronous API traps; better through a helper.
- **Linux equivalents today:** Errands, Endeavour, GNOME Notes (dead), Folio / Notes apps (Flathub), Geary / Thunderbird (block, mute).
- **Kiwi status:** none.
- **Recommendation:** **Skip** apps. **Later (P3)**, effort **M**, a "Today's reminders" widget via an EDS helper.

### Safari 13 (Catalina)
- **Introduced / changed:** 10.15 (Safari 13, also on 10.13 and 10.14).
- **What it is:** a start page with Siri Suggestions (frequent sites, Reading List, iCloud tabs, links from Messages); weak-password warnings; "Switch to Tab" in the address field; per-site download permission prompts; **picture-in-picture** by long-pressing the address-bar audio icon; Apple Pay in Catalyst; legacy extensions fully removed (App Extensions only); FIDO2 security keys.
- **Caveats (on macOS):** uBlock Origin and other legacy extensions were lost.
- **Port to GNOME 50:** browser. Kiwi relevance: **PiP windows**. Firefox's PiP window should be "always on top, on all workspaces", which Kiwi's window rules could do (Mutter `make_above`, `stick`), though GNOME/Firefox already set most of it. Stage Manager v3 should exempt PiP windows from sets.
- **Blockers / risks:** identifying PiP windows by title or `wm_class` is heuristic.
- **Linux equivalents today:** Firefox PiP, Chromium PiP, GNOME Web.
- **Kiwi status:** n/a.
- **Recommendation:** **Skip** browser features. Add "exempt PiP windows" to the Stage Manager v3 spec (S).

### System Preferences reorganisation (Apple ID at top, Family Sharing pane)
- **Introduced / changed:** 10.15 (an iOS-style account header); 13 Ventura replaced it with System Settings.
- **What it is:** the top of the System Preferences window shows the user's picture, name and **Apple ID** (iCloud, Media & Purchases, Family Sharing as its own pane). Panes are grouped in four rows; Parental Controls is removed; Screen Time and Sidecar panes are added.
- **Caveats (on macOS):** Apple ID nags ("Update Apple ID settings") with red badges.
- **Port to GNOME 50:** GNOME Settings is not themable by extensions. Kiwi's prefs window (§6) and Control Center's user row (`apps/controlCenter/userRow.js`) already echo the "you at the top" pattern. The logo menu's "About This PC" also fits.
- **Blockers / risks:** —
- **Linux equivalents today:** GNOME Settings (Online Accounts, Users).
- **Kiwi status:** partial (the Control Center user row).
- **Recommendation:** **Skip**.

### Apple Arcade and game controller support
- **Introduced / changed:** 10.15 (Arcade launched on 10.15 day one; the Game Controller framework adds DualShock 4 and Xbox One S Bluetooth controllers); 11.3 added PS5 and Xbox Series controllers.
- **What it is:** a subscription catalogue of games across iPhone, iPad, Mac and Apple TV, with progress synced via iCloud. Controllers pair in Bluetooth preferences, and a game-overlay banner appears on connect.
- **Caveats (on macOS):** a thin Mac catalogue; Catalyst-ported games.
- **Port to GNOME 50:** Linux has Steam plus Proton and kernel `hid-playstation` / `xpad` drivers. Kiwi could show a **controller connected / battery** live activity in the notch (UPower lists gamepad batteries as `UP_DEVICE_KIND_GAMING_INPUT`; the Shell already reads UPower).
- **Blockers / risks:** none.
- **Linux equivalents today:** Steam, Lutris, Heroic; GNOME's Bluetooth panel; "Battery Indicator" extensions for devices.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3)**, effort **S**. Fold it into the notch's "Bluetooth device battery" live activity (already planned for headphones, §5.6).

### Sign in with Apple
- **Introduced / changed:** 10.15 / iOS 13.
- **What it is:** an OAuth-style login using the Apple ID with Touch ID or a password, an optional **Hide My Email** relay address per app, and a minimal data share; supported in Safari, native apps and the web.
- **Caveats (on macOS):** mandatory for App Store apps offering other social logins (policy controversy).
- **Port to GNOME 50:** not applicable. The nearest local piece is GNOME Online Accounts plus passkeys in browsers.
- **Blockers / risks:** Apple service.
- **Linux equivalents today:** GOA, passkeys in browsers and password managers.
- **Kiwi status:** n/a.
- **Recommendation:** **Skip**.

### Battery health management
- **Introduced / changed:** 10.15.5 (Intel laptops with Thunderbolt 3); 11 added Optimised Battery Charging (learned schedule to 80 %); 26 shows charge-limit options more broadly.
- **What it is:** Energy Saver › Battery Health… › "Battery health management" (on by default) lowers maximum charge based on temperature and charging patterns, to slow chemical ageing. The battery menu shows "Battery Is Not Charging" / "Charging On Hold". The battery Service status (Normal / Service Recommended) has been shown since 10.13.
- **Caveats (on macOS):** less runtime when full; opaque behaviour.
- **Port to GNOME 50:** GNOME **48+ Settings › Power** has "Preserve Battery Health" (an 80 % limit via UPower `charge-threshold` on supported hardware). Kiwi: show the state in Control Center's battery tile and the menu-bar battery menu ("Charging on hold: Battery health"), read from UPower (`ChargeThresholdEnabled`, `ChargeThresholdSupported` properties on the battery device, plus `state` = pending-charge).
- **Blockers / risks:** hardware support varies (ThinkPads, Framework, some ASUS). The UPower property names need checking against the Fedora 44 UPower version.
- **Linux equivalents today:** GNOME 48+ battery health option, TLP thresholds, vendor tools.
- **Kiwi status:** none (Kiwi's battery-percentage feature is being dropped; the Control Center battery tile is stock).
- **Recommendation:** **Later (P3)**, effort **S**. A small status line in the battery menu. The setting is GNOME's.

---

## Summary table

| Feature | Release | Recommendation | Effort | Main blocker |
|---|---|---|---|---|
| Dark Mode (Kiwi surfaces + dark window rim) | 10.14 | Port (P1) | S | GTK3/Qt apps need themes; Kiwi tokens must cover every surface |
| Accent colours | 10.14 | Port (P1) | S | GTK3/Qt ignore `accent-color` |
| Desktop Tinting (Kiwi surfaces) | 10.14 | Port (P2) | S | Can't tint other apps' CSD chrome; decode the wallpaper off-thread |
| Dynamic Desktop | 10.14 | Port (P2) | M | HEIC loader dependency; must save and restore the user's wallpaper key |
| Desktop Stacks | 10.14 | Later (P3) | XL | GNOME has no desktop; Shell→Wayland file DnD |
| Dock folder Stacks (any folder, Fan/Grid/List) | 10.14 (dock stacks older) | Port (P2) | M | None big; extends the Downloads stack |
| Finder Gallery view | 10.14 | Skip | L | Nautilus has no view-plugin API |
| Finder Preview pane metadata | 10.14 | Skip | L | Nautilus has no pane and no selection D-Bus |
| Finder Quick Actions | 10.14 | Later (P3) | M | Writes user script dirs; CLI deps; better in installer |
| Quick Look from Kiwi surfaces (Sushi) | 10.14 | Port (P2) | S | Sushi must be installed |
| Quick Look markup / trim in Kiwi | 10.14 | Later (P3) | L | Needs a GTK4 helper app |
| Screenshot shortcuts + ⇧⌘5 Options | 10.14 | Port (P2) | M | Private ScreenshotUI internals; no audio in the GNOME recorder |
| Floating screenshot thumbnail | 10.14 | Port (P2) | M | No drag from a Shell actor into Wayland clients |
| Dock recent apps | 10.14 | Port (P1) | S | — |
| Continuity Camera (phone files to notch shelf) | 10.14 | Later (P3) | M | No insert-into-app protocol; needs GSConnect |
| News app | 10.14 | Skip | — | Apple service, region-locked |
| Stocks app | 10.14 | Skip | M | Quote data licensing / API keys |
| Voice Memos → recording live activity | 10.14 | Port (P2) | S | Per-app recording streams via Gvc only |
| Home app (Home Assistant section) | 10.14 | Later (P3) | M | HomeKit unavailable; token storage |
| Mac App Store (update badge only) | 10.14 | Port (P2) | S | PackageKit vs rpm-ostree + Flatpak counts |
| Software Update in settings (merged with badge) | 10.14 | Port (P2) | S | Same as above |
| Group FaceTime | 10.14.1 | Skip | — | Apple service |
| Privacy dots + who-uses-it | 10.14 / 10.15 | Port (P2) | S–M | Shell's indicators are private; host apps bypass portals |
| Safari 12 | 10.14 | Skip | — | Browser, not Shell |
| Subpixel AA and social integration removals | 10.14 | Skip | — | n/a |
| Green-button tile menu + partner picker | 10.15 | Port (P1) | M | Can't hook client-side (CSD) green buttons |
| Auto Light/Dark | 10.15 | Port (P1) | S | Writes a GNOME key (save/restore); Night Theme Switcher conflict |
| Sidecar | 10.15 | Skip | XL | Mutter ScreenCast restricted; pen pressure; no AWDL |
| Continuity Sketch / Markup | 10.15 | Skip | — | No cross-device markup protocol |
| Screen Time | 10.15 | Skip (P3 widget optional) | S | GNOME 48+ Wellbeing already exists |
| Find My (Ring phone via GSConnect) | 10.15 | Later (P3) | S | Needs GSConnect; no crowd network |
| Activation Lock | 10.15 | Skip | — | Firmware |
| Approve with Apple Watch (polkit restyle only) | 10.15 | Later (P3) | S | Auth/PAM out of extension scope |
| Music app (synced lyrics in notch) | 10.15 | Later (P3) | M | Online lyrics service, opt-in |
| Apple TV app | 10.15 | Skip | — | App, DRM |
| Podcasts app | 10.15 | Skip | — | App |
| Device management in Finder | 10.15 | Skip | — | Nautilus/gvfs already do it |
| Mac Catalyst | 10.14 / 10.15 | Skip | — | Dev framework (lesson in §5.1 menus) |
| Voice Control (grid + numbers) | 10.15 | Later (P3) | XL | AT-SPI must be out of process; speech models |
| Hover Text | 10.15 | Later (P3) | M | AT-SPI helper; pointer polling |
| Colour filters (greyscale, daltonise, tint) | 10.15 | Port (P2) | S–M | GNOME 51 shader API change; full-stage GPU cost |
| Zoom on separate display | 10.15 | Skip | L | Magnifier has no multi-monitor mode |
| Gatekeeper / notarization | 10.15 | Skip | — | Installer topic |
| Read-only system volume | 10.15 | Skip | — | n/a (support Atomic installs) |
| End of 32-bit apps | 10.15 | Skip | — | n/a |
| Dashboard removal / widgets | 10.15 | Skip (covered by P5) | — | Already in notch Widgets |
| zsh default | 10.15 | Skip | — | n/a |
| Photos redesign | 10.15 | Skip | — | App |
| Reminders / Notes / Mail (today widget) | 10.15 | Later (P3) | M | EDS tasks need a helper |
| Safari 13 (PiP exemption in Stage Manager) | 10.15 | Skip (S note for SM v3) | S | PiP detection is heuristic |
| System Preferences reorganisation | 10.15 | Skip | — | GNOME Settings not themable |
| Apple Arcade / controllers (battery activity) | 10.15 | Later (P3) | S | — |
| Sign in with Apple | 10.15 | Skip | — | Apple service |
| Battery health status | 10.15.5 | Later (P3) | S | Hardware support; UPower property names |

**Count:** 51 feature sections (Mojave 23, Catalina 28) and 53 table rows: Stacks and Quick Look each get a second row for a separately recommended sub-feature.

---

## Sources
- Apple Newsroom, "Apple introduces macOS Mojave" (June 2018): https://www.apple.com/newsroom/2018/06/apple-introduces-macos-mojave/
- Apple Newsroom, "Apple previews macOS Catalina" (June 2019): https://www.apple.com/newsroom/2019/06/apple-previews-macos-catalina/
- Apple Newsroom, "macOS Catalina is available today" (October 2019): https://www.apple.com/newsroom/2019/10/macos-catalina-is-available-today/
- Apple Support, "Take a screenshot on Mac": https://support.apple.com/en-us/102646
- Apple Support, "Use an iPad as a second display for a Mac" (Sidecar): https://support.apple.com/102597
- Apple Support, Sidecar (Catalina Mac mini guide): https://support.apple.com/en-kg/guide/mac-mini/sidecar-apde36aa0ecf/2019/mac/10.15
- Apple Support, "Use Screen Time on your Mac": https://support.apple.com/HT210387
- Apple Support, Screen Time (macOS 10.15 help): https://support.apple.com/en-asia/guide/mac-help/mchlfb0b5864/10.15/mac
- Apple Support, Hover Text: https://support.apple.com/en-asia/guide/mac-help/use-hover-text-mchlb203bc78/12.0/mac
- Apple Support, "Unlock your Mac and approve tasks with Apple Watch": https://support.apple.com/en-ca/guide/mac-pro/apda4d638ecf/2020/mac/11
- Ars Technica, "macOS 10.14 Mojave: The Ars Technica review": https://arstechnica.com/gadgets/2018/09/macos-10-14-mojave-the-ars-technica-review/
- Ars Technica, "macOS 10.15 Catalina: The Ars Technica review": https://arstechnica.com/gadgets/2019/10/macos-10-15-catalina-the-ars-technica-review/
- Six Colors, "macOS Catalina review" (Jason Snell): https://sixcolors.com/post/2019/10/macos-catalina-review/
- MacStories, "macOS Catalina: The MacStories Overview": https://www.macstories.net/news/macos-catalina-the-macstories-overview/
- Wikipedia, macOS Mojave: https://en.wikipedia.org/wiki/MacOS_Mojave
- Wikipedia, macOS Catalina: https://en.wikipedia.org/wiki/MacOS_Catalina
- NSHipster, "macOS Dynamic Desktop": https://nshipster.com/macos-dynamic-desktop/
- iDownloadBlog, "How macOS Mojave's Dynamic Desktop wallpapers work": https://www.idownloadblog.com/2018/06/06/macos-mojave-dynamic-wallpaper-desktop/
- MacRumors, "Use Stacks in macOS Mojave": https://www.macrumors.com/how-to/use-stacks-in-macos-mojave/
- Hongkiat, "macOS Mojave's Stacks: everything you need to know": https://www.hongkiat.com/blog/macos-mojave-stacks-everything-you-need-to-know/
- 9to5Mac, "How to use Dark Mode on macOS Catalina" (Auto appearance): https://9to5mac.com/2020/01/05/how-to-use-dark-mode-macos-catalina/
- Intego, "What are all those macOS Catalina security alerts?": https://www.intego.com/mac-security-blog/what-are-all-those-macos-catalina-security-alerts/
- MacRumors, "Set Screen Time communication limits" (10.15.4): https://macrumors.com/how-to/set-screen-time-communication-limits
- iMore, "How to use Approve with Apple Watch": https://www.imore.com/how-use-approve-apple-watch
- MacMost, "Use Hover Text": https://macmost.com/use-hover-text-to-make-it-easier-to-read-and-type-on-a-mac.html
- GNOME Shell 50 source, `js/ui/screenshot.js` (`screenshot-taken` signal, `open()` modes): https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/gnome-50/js/ui/screenshot.js
- GNOME Discourse, "Introducing GNOME 48" (Wellbeing, battery health): https://discourse.gnome.org/t/introducing-gnome-48/27824
- OMG! Ubuntu, "GNOME 48 best new features": https://www.omgubuntu.co.uk/2025/03/gnome-48-best-new-features
