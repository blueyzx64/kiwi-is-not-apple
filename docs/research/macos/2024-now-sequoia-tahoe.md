# macOS 15 Sequoia, 26 Tahoe and 27 Golden Gate (2024 → now): features and how Kiwi could port them

Scope: the user-facing desktop and system features of **macOS 15 Sequoia** (2024), **macOS 26 Tahoe** (2025) and
**macOS 27 Golden Gate** (2026, current as of 27 October 2026). For each feature this file records what it is, its
caveats, a realistic port to **GNOME Shell 50 on Fedora 44 (Wayland only)**, the blockers, Linux equivalents,
Kiwi's status and a recommendation. Template: `README.md` in this folder. The plan it feeds is
`docs/architecture/overhaul-plan.md`.

How to read the Kiwi status column:
- **have**: merged in Kiwi today (most of it "merged, untested on Shell", see `docs/architecture/code-map.md` §0).
- **partial**: some of it exists, or it is planned in the overhaul plan with a phase.
- **none**: nothing exists or is planned.

Kiwi's glass is **faux Liquid Glass**: tint, gradient, rim highlight, inner shadow, no real blur (owner decision,
overhaul plan §2 and §5.8). Every Liquid Glass entry below says how to imitate the trait without blur.

> **Source note.** The macOS 27 material comes from Apple's announcement coverage and reviews dated June to
> October 2026 (MacRumors, Wikipedia, 9to5Mac, 512 Pixels, Daring Fireball). The touchscreen OLED MacBook Pro with
> a Dynamic Island is **reported, not announced**, at the time of writing: Bloomberg says Apple will announce it on
> 28 October 2026. Treat it as a rumour.

---

## Contents

1. [Release overviews](#1-release-overviews)
2. [macOS 15 Sequoia features](#2-macos-15-sequoia-features) (F1–F17)
3. [macOS 26 Tahoe: Liquid Glass in depth](#3-macos-26-tahoe-liquid-glass-in-depth) (F18–F31)
4. [macOS 26 Tahoe: system features](#4-macos-26-tahoe-system-features) (F32–F56)
5. [macOS 27 Golden Gate features](#5-macos-27-golden-gate-features) (F57–F68)
6. [Faux Liquid Glass cookbook (no blur)](#6-faux-liquid-glass-cookbook-no-blur)
7. [Summary table](#7-summary-table)
8. [Top port candidates and main blockers](#8-top-port-candidates-and-main-blockers)
9. [Sources](#9-sources)

---

## 1. Release overviews

### macOS 15 Sequoia (version 15, 2024)
- **Dates:** announced at WWDC on 10 June 2024, released on 16 September 2024. Latest update: 15.8.1
  (28 September 2026, security only).
- **Theme:** productivity and Continuity, then Apple Intelligence in the point releases.
- **Headline features in 15.0:**
  - Window tiling: edge drag, Option-drag, the green-button menu and keyboard shortcuts.
  - iPhone Mirroring and iPhone notifications on the Mac. Neither is available in the EU.
  - The standalone Passwords app.
  - Presenter preview and background replacement for video calls.
  - Safari Highlights, the redesigned Reader, Viewer and Distraction Control.
  - Math Notes, with a rewritten Calculator.
  - Messages text effects and scheduled sends.
  - Hiking routes in Maps.
- **Point releases:**
  - **15.1** (October 2024): first Apple Intelligence features. Writing Tools, notification summaries, the
    Reduce Interruptions Focus, the new Siri look with Type to Siri, Smart Reply and Clean Up in Photos. Also
    drag and drop between iPhone Mirroring and the Mac.
  - **15.2** (December 2024): Image Playground, ChatGPT in Siri and Writing Tools, "Describe your change" and
    Compose in Writing Tools, Weather in the menu bar, and presenter preview for external displays and AirPlay.
  - **15.3** (January 2025): Genmoji on the Mac.
  - **Later 15.x:** Mail categorisation, more languages, the Sketch style in Image Playground.
- **Hardware:** Apple Silicon and some Intel Macs. Apple Intelligence needs an M1 or later.
- **Also changed:** you can no longer Control-click to bypass Gatekeeper for unsigned apps. Users now go through
  Privacy & Security, then Open Anyway. This matters for the installer study (`installer-and-app-lifecycle.md`).

### macOS 26 Tahoe (version 26, 2025)
- **Dates:** announced at WWDC on 9 June 2025, released on 15 September 2025. Latest update: 26.7.1
  (28 September 2026).
- **Version numbers:** Apple jumped from 15 to 26, year-based like car model years, across all its OSes. Apps
  built against older SDKs still see "16".
- **Theme:** the **Liquid Glass** redesign, the first big visual change since Big Sur. Alongside it:
  - a transparent menu bar;
  - a redesigned, customisable Control Center whose controls can also sit in the menu bar;
  - new icon looks (light, dark, clear and tinted);
  - folder colours with emoji or symbols;
  - the biggest Spotlight upgrade ever: browse views, actions, quick keys and clipboard history;
  - **Launchpad removed**, replaced by an Apps view in Spotlight;
  - the Phone app;
  - Live Activities from the iPhone in the menu bar;
  - Shortcuts automations;
  - Journal, Games (with Game Overlay) and Magnifier;
  - Live Translation;
  - a customisable lock-screen clock.
- **Point releases:**
  - **26.1** (3 November 2025): the **Liquid Glass Clear/Tinted** setting.
  - **26.2:** Edge Light (a ring light drawn by the display), AirDrop codes, Games filters.
  - **26.4:** Safari's compact tab bar returns, plus new emoji.
  - **Later 26.x:** the Spotlight index is prepared for macOS 27.
- **Reception:** mixed to harsh. Critics pointed to:
  - legibility problems with translucency;
  - inconsistent and oversized window corner radii, which also made windows hard to resize;
  - "icon jail" for non-squircle icons;
  - icons in every menu;
  - stability and performance problems.
- **Hardware:** the last release for Intel Macs, and only four Intel models run it.

### macOS 27 Golden Gate (version 27, 2026)
- **Dates:** announced at WWDC on 8 June 2026, released on 14 September 2026. Then 27.0.1 (28 September), and
  **27.2** (26 October 2026, per Wikipedia; MacRumors seeded the 27.2 release candidate on 19 October).
- **Hardware:** Apple Silicon only, including the A18 Pro MacBook Neo. It is the last release with full Rosetta 2.
- **Theme:** "refinement based on feedback", plus **Siri AI**:
  - **Siri AI** is an LLM Siri. On the Mac it lives in Spotlight as "Search or Ask", and there is also a Siri
    app.
  - Write with Siri, and Visual Intelligence (Shift-Cmd-Space).
- **Liquid Glass revisions:**
  - a **Liquid Glass slider** (from clear to tinted) in Appearance;
  - darker edges and brighter specular highlights;
  - uniform toolbars, and **one corner radius for all windows**;
  - edge-to-edge sidebars, with coloured sidebar icons again;
  - stronger active-window shadows;
  - **Aqua-like glass traffic lights** (beta 6);
  - fewer menu icons;
  - a "Show Borders" accessibility option.
- **Other changes:**
  - the Dock marks apps that still run in the background;
  - extra-large widgets;
  - better window restoration on external displays;
  - pull-to-refresh;
  - Shortcuts built from natural language, with new triggers;
  - AFP and Boot Camp removed.
- **Touch:** 27.2 adds touch-gesture code. A touchscreen OLED MacBook Pro with a **Dynamic Island** is reported
  for 28 October 2026, not yet announced. For Kiwi this validates the notch-as-Dynamic-Island direction.

### Anything newer
Nothing beyond 27 has been announced. MacRumors reports Apple's guidance that **macOS 28** will drop
general-purpose Rosetta 2. That has no desktop-feature impact for Kiwi.

---

## 2. macOS 15 Sequoia features

### F1. Window tiling: drag to edges, corners and the menu bar
- **Introduced / changed:** Sequoia 15.0. Settings refined in 15.x. Unchanged in Tahoe and Golden Gate.
- **What it is:**
  - **Drag to an edge.** Drag a window by its title bar to the left or right edge of the screen. Hold the pointer
    against the edge for a beat (a deliberate delay against accidental tiling). A translucent outline of the
    target fades in, and releasing tiles the window to that half.
  - **Corners and the menu bar.** Dragging to one of the four corners offers a quarter. Dragging onto the menu
    bar offers **Fill**, which maximizes the window without entering Full Screen.
  - **Option-drag.** Holding **Option** while dragging shows the outlines immediately. You don't have to reach the
    edge: the half zones are large. You still have to reach a corner or the menu bar for a quarter or Fill.
  - **Untiling.** Dragging a tiled window away restores its pre-tile size.
  - **Mission Control conflict.** Dragging all the way through the top edge still opens Mission Control unless
    "Drag windows to top of screen to enter Mission Control" is off.
  - **Settings** (System Settings › Desktop & Dock › Windows):
    - "Drag windows to screen edges to tile";
    - "Drag windows to menu bar to fill screen";
    - "Hold ⌥ key while dragging windows to tile";
    - "Tiled windows have margins" (F4).
- **Caveats (on macOS):**
  - The hold-at-edge delay feels slow to some users.
  - Windows that can't resize (iPhone Mirroring, System Settings) still slide into a tile. They leave a gap the
    neighbouring tile does not fill.
  - There is no Snap Assist (offering other windows for the empty half) and no thirds layouts, unlike Windows 11.
  - Third-party tilers (Rectangle, Magnet) conflict until you turn one of them off.
- **Port to GNOME 50:** Shell extension (GJS).
  - **Drag detection:** `global.display` `grab-op-begin`/`grab-op-end` plus a pointer poll while the grab is a
    move (`Meta.GrabOp.MOVING`). Kiwi's `apps/windowTiling.js` already listens to `grab-op-begin`.
  - **Zones:** computed from the work area (`Meta.Window.get_work_area_for_monitor`). Overhaul plan §4.2:
    `core/layout.js` owns the work area.
  - **Preview:** Kiwi's own faux-glass actor in `Main.layoutManager.uiGroup`, faded in after about 150 ms against
    the edge, immediately with the modifier.
  - **Apply:** `move_resize_frame(true, x, y, w, h)` with fractions from `LAYOUTS` in `windowTiling.js`.
  - **Restore:** remember the pre-tile frame per window (a `WeakMap`).
  - **Mutter's own edge tiling:** set `org.gnome.mutter edge-tiling` to false while Kiwi's version is on, and
    restore the user's value on disable. That keeps the left/right previews from doubling.
  - **Fill:** top edge → `maximizeWindow()` from `lib/compat.js`, or a frame the size of the work area.
  - **The ⌥ equivalent:** Alt is taken by the window-move modifier (`org.gnome.desktop.wm.preferences
    mouse-button-modifier`), so use **Ctrl while dragging**, or make the key a setting.
- **Blockers / risks:**
  - `meta_window_tile` is not introspected, so Kiwi's tiles are plain resized windows. Mutter does not know they
    are tiled: no tiled-pair resize (F4), and double-click on the title bar won't untile.
  - GTK4/libadwaita windows draw their own shadows (CSD), so a frame rect looks inset. Use the frame rect, not
    the buffer rect.
  - Changing a user's Mutter setting must be undone exactly (CLAUDE.md rule).
  - The default 10 px top drag already maximizes in GNOME. Keep the behaviour consistent.
- **Linux equivalents today:**
  - GNOME halves (Super+←/→, drag to the left or right edge) and drag-to-top maximize;
  - Tiling Assistant (quarters, a layout popup, tiled-pair resize; built into Ubuntu);
  - Tiling Shell (Windows-11-style snap layouts);
  - Forge and Pop Shell (auto-tiling).
- **Kiwi status:** partial. The `windowTiling.js` engine and the layout fractions exist. Edge snapping with a
  preview is planned (overhaul plan §5.7, P1).
- **Recommendation:** **Port (P1 core), effort L.** It is the single most-used new macOS feature in reviews (Ars,
  2025), and Kiwi already has the geometry engine.

### F2. Green-button tile menu and Window › Move & Resize
- **Introduced / changed:**
  - Sequoia 15.0 (the hover menu existed since Catalina in a simpler form).
  - The green button is mostly a "tiling junk drawer" now (512 Pixels, 2026).
  - Golden Gate redraws the button in glass (F59).
- **What it is:**
  - **The hover menu.** Hovering over (or long-clicking) the green button opens a menu.
    - **Move & Resize** offers single-window layouts: halves (left, right, top, bottom) and quarters.
    - **Fill & Arrange** offers Fill, plus multi-window arrangements that use the most recently used windows:
      Left & Right, Right & Left, Top & Bottom, Bottom & Top, Quarters, and Left/Right/Top/Bottom & Quarters.
    - **Full Screen:** Entire Screen, Left of Screen, Right of Screen (Split View).
  - **Option** reveals more layouts in the menu, including **Center**.
  - **Window menu.** The same items appear in the menu bar under **Window › Move & Resize** (Halves, Quarters,
    Arrange, Return to Previous Size) and **Window › Full Screen Tile**. **Center** and **Fill** are top-level
    Window menu items.
  - Every icon is a small glyph of the layout. The multi-window glyphs show ghosted panes.
- **Caveats (on macOS):**
  - Hover sensitivity: the menu pops up when you just want to click Zoom.
  - The quarter tiles have no keyboard shortcuts.
  - The meaning of "the second window" (most recently used) is not obvious.
- **Port to GNOME 50:** Shell extension.
  - The traffic lights already live in Kiwi's menu bar (`apps/windowControls`).
  - Add a hover popup (`PopupMenu.PopupMenu` or a custom `St.BoxLayout` with glyph buttons) on the green button
    after about 400 ms of hover. `windowTiling.js` already builds glyph button grids, including ghost panes.
  - "Second window" comes from `global.display.get_tab_list(Meta.TabList.NORMAL, workspace)`, item 1 (the MRU).
  - **Full Screen Left/Right:** GNOME has no Split View. Map it to fullscreen, or skip it.
  - **Window menu:** the planned generic *Window* menu (overhaul plan §5.1) adds Move & Resize, Center, Fill and
    Return to Previous Size.
- **Blockers / risks:**
  - Apps' own CSD title-bar buttons are not Kiwi's, so the menu works only on Kiwi's buttons (menu bar
    traffic lights or app-buttons mode), not inside app windows.
  - There is no Split View equivalent in Mutter.
- **Linux equivalents today:** Tiling Assistant's layout popup; Tiling Shell's snap-assistant over the top edge.
  Neither is on a title-bar button.
- **Kiwi status:** partial. The glyph menu existed in the dropped `tiling-title-menu`. The engine is reusable, and
  the green-button menu is planned (overhaul plan §5.7, P1).
- **Recommendation:** **Port (P1 core), effort M.** It is the most recognisable Sequoia UI, and most of the code
  exists.

### F3. Tiling keyboard shortcuts and multi-window arrangements
- **Introduced / changed:** Sequoia 15.0.
- **What it is:** Globe/Fn-Control shortcuts:

  | Shortcut | Action |
  |---|---|
  | Fn-Ctrl-F | Fill |
  | Fn-Ctrl-C | Center |
  | Fn-Ctrl-← → ↑ ↓ | Halves |
  | Fn-Ctrl-R | Return to Previous Size |
  | Fn-Ctrl-Shift-arrows | Two-window arrangements (active window on the arrow's side, the previous window opposite) |
  | Fn-Ctrl-Option-Shift-arrows | Half + two quarters (e.g. left half, the next two windows top-right and bottom-right) |

  The four single quarters and "Quarters" have no shortcut.
- **Caveats (on macOS):**
  - Fn-← and Fn-→ are Home and End, so the first press sometimes scrolls the document instead of tiling (Ars,
    2024).
  - Many users rebind them in Keyboard settings › App Shortcuts.
  - The shortcuts need a keyboard with a Fn/Globe key.
- **Port to GNOME 50:** Shell extension, using `lib/keybindings.js` (`Main.wm.addKeybinding` with `as` keys,
  rebindable, with conflict detection in `keybindingsModel.js`).
  - **Defaults:** Super+Ctrl+arrows (overhaul plan §5.7). Super+Ctrl+Shift+arrows for the two-window
    arrangements, Super+Ctrl+Alt+Shift+arrows for the half and quarters. Super+Ctrl+F for Fill, Super+Ctrl+C for
    Center, Super+Ctrl+R to restore.
  - **Conflicts:** GNOME's stock Super+←/→ (`toggle-tiled-left/right`) and Super+Up/Down (maximize/unmaximize)
    stay as they are. Super+Ctrl+arrows may collide with workspace switching on some setups; the model already
    detects that.
- **Blockers / risks:** the shortcuts must not be enabled by default if they clash with a user's custom
  bindings. Detect the clash and leave the shortcut unbound.
- **Linux equivalents today:** GNOME's Super+←/→; Tiling Assistant's quarter keys (Super+Ctrl+numpad); gTile.
- **Kiwi status:** partial. Ctrl+Super+arrows are planned in §5.7; the arrangements exist in `windowTiling.js`
  (`left-right`, `quarters`).
- **Recommendation:** **Port (P1 core), effort S.** It is cheap once F1 exists.

### F4. Tiled-window margins and the tiled-pair divider
- **Introduced / changed:** Sequoia (the "Tiled windows have margins" toggle).
- **What it is:**
  - **Margins.** By default tiled windows keep a few pixels of margin from each other and from the screen edges.
    The toggle removes all margins at once. You can't keep the inner gaps and drop the outer ones.
  - **The divider.** Between two tiled windows, the small gap acts as a **divider**: dragging it resizes both
    windows. A later tile respects a custom split instead of forcing 50/50.
- **Caveats (on macOS):** the margin is all or nothing, and the divider only appears with margins on.
- **Port to GNOME 50:** Shell extension.
  - **Margin:** a `windows-tile-gap` integer key (0 to 16 px), applied inside the zone rects.
  - **Divider:** Kiwi keeps its own tile groups (window → zone) in a pure model (`features/windows/model.js`).
    When one member is resized by the user (`size-changed` during a `Meta.GrabOp.RESIZING_*` grab), resize its
    neighbours to match. Optionally draw a thin glass grabber actor in the gap that drives both windows.
  - Mutter's native tiled-pair resize only works for its own halves, which Kiwi disables in F1.
- **Blockers / risks:**
  - Resize feedback loops: guard re-entry.
  - Windows with minimum sizes (min hints) can't shrink. Clamp, and let the gap absorb the difference.
  - Clients apply sizes asynchronously on Wayland, so apply on `size-changed` and debounce.
- **Linux equivalents today:** Tiling Assistant (tile groups, gaps, linked resize); Forge and Pop Shell (gaps).
- **Kiwi status:** none.
- **Recommendation:** **Port (P2), effort M.** Gaps are trivial (S). The linked divider is the macOS detail that
  makes tiling feel finished.

### F5. iPhone Mirroring
- **Introduced / changed:**
  - Sequoia 15.0. Drag and drop arrived in 15.1.
  - Its apps appear in Tahoe's Spotlight Apps view, and Live Activities open it (F45).
  - Golden Gate makes the window resizable and adds protected-video playback.
- **What it is:**
  - **The window.** A phone-shaped window streams the paired iPhone's screen (H.265 via `avconferenced`). It
    shows the real wallpaper, icons and the Dynamic Island.
  - **Control.** The Mac's keyboard, trackpad and mouse control the phone, and audio is streamed.
  - **Shortcuts.** Cmd-1 goes to the Home Screen, Cmd-2 opens the app switcher, Cmd-3 opens Spotlight. A hidden
    title strip on hover has Home and App Switcher buttons.
  - **Size:** three sizes (Smaller, Actual, Larger) in 15–26; free resizing in 27.
  - **Privacy.** The phone stays locked. Picking it up stops the session and shows a "used on Mac" notice. The
    phone keeps a log of the Macs that mirrored it.
- **Caveats (on macOS):**
  - It needs Apple Silicon or a T2 chip, iOS 18 on the same Apple Account, and two-factor authentication.
  - Not available in the EU (DMA).
  - Only one paired iPhone at a time. It stops other Continuity features (Sidecar, Continuity Camera, Personal
    Hotspot).
  - Full-tunnel VPNs break it.
  - No microphone, no Control Center, and no home button for older phones.
- **Port to GNOME 50:** no realistic port for iPhone. Apple's protocol is closed and attested.
  - For **Android**, `scrcpy` (USB or Wi-Fi ADB) already mirrors and controls the phone in a normal window.
  - Kiwi could at most offer a launcher tile ("Phone") that runs a user-installed `scrcpy` via `Gio.Subprocess`,
    and a phone-shaped window rule (rounded corners, no title bar). That is optional polish, not a feature.
- **Blockers / risks:** Apple services, device attestation and the closed protocol. A subprocess launcher must be
  async (EGO-X-004).
- **Linux equivalents today:** scrcpy and its GUI front ends; UxPlay (an AirPlay *receiver* that shows an iPhone
  screen view-only, no control); GSConnect, KDE Connect and Valent (no mirroring).
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort XL** (iPhone). Optionally a P3 S "Android mirroring" launcher if the owner
  wants it.

### F6. iPhone notifications on the Mac (and drag and drop with the phone)
- **Introduced / changed:** Sequoia 15.0 (notifications), 15.1 (drag and drop through Mirroring).
- **What it is:**
  - iPhone notifications appear in the Mac's Notification Center with a small phone badge on the icon and their
    own sound.
  - Clicking one opens the app in iPhone Mirroring.
  - Per-app allow lists live on the phone. Mirroring can be off while notifications stay on.
- **Caveats (on macOS):** same pairing limits as F5. Some users find news notifications pointless when they open
  in a tiny phone window.
- **Port to GNOME 50:** external, existing apps.
  - **Android:** GSConnect (a GNOME Shell extension) and Valent mirror Android notifications into GNOME's
    message tray. Kiwi's notch (`apps/notch`) already consumes tray notifications, so phone notifications show
    there for free.
  - **Kiwi's addition:** a small "phone" badge when `source.policy` / app id matches GSConnect.
  - **iPhone:** only via Bluetooth ANCS bridges such as `ancs4linux` (experimental, user-installed).
- **Blockers / risks:** Apple ecosystem; ANCS bridges are fragile; GSConnect is a separate extension and Kiwi must
  not depend on it.
- **Linux equivalents today:** GSConnect, KDE Connect, Valent; ancs4linux for iPhone (experimental).
- **Kiwi status:** partial (the notch shows whatever reaches the tray).
- **Recommendation:** **Later (P3), effort S**: only the badge and grouping for GSConnect sources.

### F7. The Passwords app
- **Introduced / changed:**
  - Sequoia 15.0 (split out of System Settings and Safari).
  - Tahoe: password history, passkey import and export (FIDO CXP/CXF), automatic passkey upgrades, and 2FA-code
    autofill from Messages/Mail into any browser (F53).
  - Golden Gate: AI-driven automatic changing of weak passwords, announced for a later update.
- **What it is:**
  - **The window.** A standalone app with a sidebar: All, Passkeys, Codes (TOTP), Wi-Fi, Security
    (weak/reused/compromised warnings) and Deleted, plus shared groups with family.
  - **Locking.** Unlocks with Touch ID or the account password.
  - **Sync and import.** CSV import on first launch, and iCloud end-to-end sync, including to Windows (iCloud
    Passwords) and Chrome/Edge extensions.
  - **Menu bar.** A menu bar extra for quick lookups.
- **Caveats (on macOS):**
  - There is no Linux or Android client, and no Firefox extension.
  - It is for individuals and families, not teams.
  - Third-party managers are still better for cross-platform use.
- **Port to GNOME 50:** not a Shell feature.
  - GNOME's keyring (`org.freedesktop.secrets`, libsecret) is the storage. Viewer and manager apps exist.
  - Kiwi could add a **Spotlight provider** that searches entries of a user-chosen manager that already offers a
    GNOME search provider (KeePassXC and Secrets do not by default; Bitwarden's desktop app does not), so this is
    thin.
  - Never handle secrets in Shell code.
- **Blockers / risks:**
  - Security: a Shell extension must not read or cache secrets.
  - EGO reviewers will reject clipboard or secret handling without explicit user action.
- **Linux equivalents today:**
  - KeePassXC (TOTP, passkeys, browser integration);
  - Secrets (GNOME Circle, KeePass);
  - Bitwarden and Proton Pass;
  - Key Rack (GNOME keyring viewer);
  - Passwords and Keys (Seahorse).
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort L.** Recommend KeePassXC or Secrets in the docs. Kiwi's clipboard already
  hides password-hinted items (`clipboard.md` reference).

### F8. Presenter preview and video-call background replacement
- **Introduced / changed:** Sequoia 15.0 (video apps); 15.2 extended presenter preview to external displays and
  AirPlay.
- **What it is:**
  - **Presenter preview.** When an app (FaceTime, Zoom, Webex) asks to share the screen, macOS shows a preview of
    exactly what will be shared, a single app or the whole screen. You can change it before and during sharing
    from the menu bar's video/screen-sharing item.
  - **Background replacement.** Built-in gradients, system wallpapers or your own photo, applied system-wide to
    the camera with Apple's segmentation.
  - Keynote adds "play preview".
- **Caveats (on macOS):** only for apps that use ScreenCaptureKit's picker. Background replacement costs GPU and
  can halo.
- **Port to GNOME 50:**
  - Screen sharing on Wayland goes through `xdg-desktop-portal-gnome`, and its picker dialog is a separate GTK
    process. The Shell cannot restyle or replace it.
  - The Shell does show the screen-sharing indicator in the panel, which Kiwi's menu bar can restyle. Kiwi could
    make that indicator open a glass popover with "Stop sharing" (it exists today as a stop button in GNOME's
    indicator).
  - Background replacement needs a PipeWire camera filter (an external helper), out of scope.
- **Blockers / risks:** the portal is out-of-process; camera processing is out of scope.
- **Linux equivalents today:**
  - GNOME's portal picker (lists windows and monitors);
  - OBS virtual camera;
  - Backscrub and LinuxBackgroundBlur-style tools.
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort L.** At most, restyle the screen-share indicator as part of the menu bar (S,
  folded into §5.1).

### F9. Apple Intelligence: Writing Tools
- **Introduced / changed:**
  - Sequoia 15.1: Proofread, Rewrite, tones, Summary, Key Points, List, Table.
  - 15.2: ChatGPT "Compose" and "Describe your change".
  - Tahoe: Writing Tools actions in Shortcuts.
  - Golden Gate: superseded by "Write with Siri" (F62).
- **What it is:**
  - **Invoking it.** Select text in almost any app and open **Writing Tools** from the right-click menu, the
    Edit menu, or a toolbar button in some apps.
  - **The panel.** A popover with:
    - **Proofread** (inline suggestions with explanations, accept or reject);
    - **Rewrite** (alternate versions you can cycle through);
    - **Friendly / Professional / Concise**;
    - **Summary, Key Points, List, Table**;
    - (15.2) **Describe your change** ("as a poem") and **Compose** from scratch with ChatGPT.
  - Results replace the selection in place, with Undo, or open in a panel for read-only text.
- **Caveats (on macOS):**
  - Needs an M1 or later and Apple Intelligence enabled, with a multi-gigabyte model download.
  - Language limits, and not in China.
  - Output is uneven.
  - Some apps (Electron, custom text views) get only the panel, not inline replacement.
- **Port to GNOME 50:** external helper plus a thin Shell part. This is the honest shape.
  1. **Get the text.** Read the **PRIMARY** selection: `St.Clipboard.get_default().get_text(St.ClipboardType.PRIMARY,
     cb)`. Mutter implements `zwp_primary_selection`, so most GTK/Qt/Electron apps fill it when text is
     selected.
  2. **Process it.** Send it to a user-installed local model through an **optional D-Bus helper** (Rust or Vala,
     see the `rust-gnome` and `vala` skills) that talks to llama.cpp or Ollama on localhost.
  3. **Show the result** in a Kiwi glass popover with Copy, and an optional "Replace". Replace sets CLIPBOARD and
     sends Ctrl+V through a Clutter virtual keyboard (`seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE)`).
  4. **Trigger:** a keybinding (off by default) or a Spotlight action.
- **Blockers / risks:**
  - Wayland gives no global text-field API, so "Replace" is a paste hack that can land in the wrong window.
  - EGO rules: clipboard use must be declared, and data must not go to a third party without explicit action
    (local-only by default; any remote model only on explicit opt-in).
  - Bundling a model or binary in the extension is not allowed, so the helper must be a separate package.
  - It is a large new surface for an extension whose core is desktop chrome.
- **Linux equivalents today:**
  - Newelle and Alpaca (GTK chat apps for local or remote LLMs);
  - Speech Note;
  - LanguageTool (grammar).
  - No system-wide writing tools.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort XL.** Feasible only as an opt-in, local-first helper. Not core to the
  desktop look; revisit after P8.

### F10. Notification summaries and the Reduce Interruptions Focus
- **Introduced / changed:**
  - Sequoia 15.1.
  - 15.3 restyled summaries (italic text plus a glyph) and paused News & Entertainment summaries after the BBC
    errors.
  - Tahoe splits summaries into three categories (News & Entertainment, Communication & Social, Others) with a
    red "verify information" disclaimer.
  - Golden Gate consolidates Tapback and Home notifications.
- **What it is:**
  - **Summaries.** A stack of notifications from one app collapses to a one-line LLM summary, marked "Summarized
    by Apple Intelligence". You can tune it per app.
  - **Reduce Interruptions.** A Focus mode where the model lets "urgent" notifications through and holds the
    rest.
- **Caveats (on macOS):** accuracy problems (wrong news headlines led Apple to switch news summaries off), small
  on-device model, tone flattening.
- **Port to GNOME 50:**
  - **The Shell side is easy.** Kiwi sees every notification: the notch hooks
    `Main.messageTray` `source-added` and each source's `notification-added`.
  - **A non-AI "summary" is the realistic Kiwi version.** Group by app and show "5 from Messages: Ana, Ben…" with
    counts, latest-first, in the notch and the Control Center fallback.
  - **A real LLM summary** reuses the optional helper from F9.
  - **Reduce Interruptions** maps to GNOME DND (`org.gnome.desktop.notifications show-banners`) plus a Kiwi
    allow-list (by app id or keyword) that still shows banners for chosen apps. Critical-urgency notifications
    still pass.
- **Blockers / risks:**
  - The LLM needs the helper (F9 risks).
  - Patching banner display must be restored on disable (the notch already owns this; see
    `notifications-and-message-tray.md`).
- **Linux equivalents today:** GNOME groups notifications per app in the calendar menu; DND; no summaries.
- **Kiwi status:** partial (the notch and its notification fallback exist).
- **Recommendation:**
  - Grouped stacks plus an allow-list DND: **Port (P2), effort M.**
  - LLM summaries: **Later (P3), effort L.**

### F11. The new Siri look, Type to Siri and ChatGPT in Siri
- **Introduced / changed:**
  - Sequoia 15.1: new look, Type to Siri, product knowledge.
  - 15.2: ChatGPT integration.
  - The "personal Siri" slipped from 2024 to Golden Gate's Siri AI (F60).
- **What it is:**
  - Siri gets a glowing, animated presentation that responds to your voice and lets you keep working.
  - **Type to Siri:** double-press the Command key (configurable).
  - Better follow-up context, and answers about Apple products.
  - From 15.2 it can hand questions to ChatGPT, with consent per request.
- **Caveats (on macOS):** still the old, limited Siri underneath until 27; mixed usefulness.
- **Port to GNOME 50:**
  - The look (a glowing glass entry, an edge glow) is easy with Kiwi's `ModalSurface`.
  - The intelligence needs an assistant backend. Kiwi already has Spotlight; an "Ask" mode is the F60 port.
- **Blockers / risks:** no assistant on GNOME; voice needs speech-to-text (an external helper).
- **Linux equivalents today:** Newelle, Alpaca; Speech Note (offline speech-to-text); no system assistant.
- **Kiwi status:** none.
- **Recommendation:** **Skip as Siri, effort XL.** Covered by F60 if the owner wants an "Ask" mode.

### F12. Image Playground and Genmoji
- **Introduced / changed:**
  - Image Playground: Sequoia 15.2 (Animation and Illustration styles), Sketch in a later 15.x.
  - Genmoji on Mac: 15.3.
  - Tahoe: ChatGPT styles, "Any Style", mixing two emoji into a Genmoji, Genmoji in Image Playground.
  - Golden Gate: photorealistic styles, region editing, "Describe a change" for Genmoji, and daily caps with more
    usage on iCloud+.
- **What it is:**
  - **Image Playground:** an app and an in-app sheet. Pick concepts, a description, a person from Photos and a
    style; it generates a carousel of candidates.
  - **Genmoji:** custom emoji from a text prompt, people, or a mix of two emoji, inserted inline like stickers.
- **Caveats (on macOS):** quality complaints (uncanny people); caps; ethical objections from some reviewers.
- **Port to GNOME 50:** out of scope for a desktop shell. The emoji picker already exists in GNOME (Ctrl+.,
  or Super+. on GNOME 50 via the input method).
- **Blockers / risks:** image models, GPU, licensing; EGO.
- **Linux equivalents today:** Stable Diffusion front ends (e.g. Krita AI Diffusion); GNOME Characters and
  Smile for emoji.
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort XL.** Not a desktop feature.

### F13. Math Notes and the redesigned Calculator
- **Introduced / changed:** Sequoia 15.0 (Notes and Calculator). 15.x: Calculator repeats the last operation on a
  second "=".
- **What it is:**
  - **Math Notes.** In Notes (and the Calculator's Math Notes mode), typing an expression followed by "=" offers
    the result in yellow. Variables work (`rent = 1200`, then `rent * 12 =`). Settings: Suggest Results (default),
    Insert Results, Off.
  - **Calculator.** Rewritten in SwiftUI with round buttons. It keeps Basic, Scientific and Programmer, adds a
    History sidebar instead of the Paper Tape, and keeps unit conversion and RPN.
- **Caveats (on macOS):** smaller buttons; no window size options.
- **Port to GNOME 50:**
  - App-level, so skip.
  - Kiwi's **Spotlight calculator** (`apps/spotlight/calculator.js`) could gain variables within a session, a
    "copy result" action, and a small **history** (last 10 expressions, in memory only).
- **Blockers / risks:** none.
- **Linux equivalents today:**
  - GNOME Calculator (has history);
  - Qalculate! (natural-language expressions, variables);
  - Numbat;
  - GNOME Shell's search provider from Calculator.
- **Kiwi status:** partial (the Spotlight calculator exists).
- **Recommendation:** **Later (P3), effort S**: calculator history and variables in Spotlight only.

### F14. Safari Highlights, Reader summaries, Viewer and Distraction Control
- **Introduced / changed:**
  - Sequoia 15.0 (Safari 18).
  - Tahoe (Safari 26): rounded floating tabs, then the compact tab bar back in 26.4.
  - Golden Gate: tab topics, "Create an Extension", Notify Me.
- **What it is:**
  - **Highlights:** a sparkle on the Page Menu button offers Maps locations, links and summaries for the page.
  - **Reader:** a summary and a table of contents.
  - **Viewer:** a video blown up to the window with system controls and Picture in Picture.
  - **Distraction Control:** click to hide page elements, with a "dissolving sand" animation; the choice
    persists for private tabs.
- **Caveats (on macOS):** inconsistent detection; Distraction Control is not an ad blocker.
- **Port to GNOME 50:** browser features, not a desktop shell. Skip.
- **Blockers / risks:** n/a.
- **Linux equivalents today:** Firefox Reader View, Picture-in-Picture, uBlock Origin's element zapper; GNOME Web
  Reader mode.
- **Kiwi status:** none (Firefox theming was dropped).
- **Recommendation:** **Skip, effort L.** Out of scope.

### F15. Weather in the menu bar
- **Introduced / changed:** Sequoia 15.2. Golden Gate animates the weather menu bar item (Wikipedia).
- **What it is:** an optional menu bar item showing the current condition icon and temperature. Clicking it opens
  a dropdown with an hourly and daily forecast and a link to Weather.
- **Caveats (on macOS):** uses menu bar space; location permission.
- **Port to GNOME 50:** Shell extension.
  - The Shell already ships `resource:///org/gnome/shell/misc/weather.js` (`WeatherClient`, backed by
    libgweather and GNOME Weather's chosen locations). The date menu uses it.
  - Kiwi adds a status item in the menu bar (`Main.panel.addToStatusArea`) with icon and temperature, plus a
    glass dropdown (hourly row and next days, from `WeatherClient.info` forecasts).
  - It could also be a notch widget (Widgets tab, overhaul plan §5.6).
- **Blockers / risks:**
  - It depends on GNOME Weather being installed and a location set; `WeatherClient` handles both and exposes
    `available`.
  - It is a private-ish Shell module: wrap and feature-detect it.
- **Linux equivalents today:** the GNOME date menu weather section; the OpenWeather Refined extension.
- **Kiwi status:** none (weather is planned only as a notch widget).
- **Recommendation:** **Port (P3), effort S.** Cheap, and visibly macOS.

### F16. Sequoia wallpapers
- **Introduced / changed:**
  - Sequoia: a dynamic Sequoia-forest photo (day and night, and moving when also set as the screen saver), an
    abstract colour wallpaper (the beta default), and "Macintosh" retro wallpapers.
- **What it is:**
  - Wallpapers that double as aerial-style moving screen savers: they move as the screen saver, then slow to a
    stop as the wallpaper.
  - Light and dark variants follow the appearance or the time of day.
- **Caveats (on macOS):** large downloads; Apple copyright.
- **Port to GNOME 50:**
  - Kiwi must not ship Apple's images (copyright).
  - GNOME already supports light/dark pairs (`picture-uri` and `picture-uri-dark`) and timed XML slideshows (a
    day-to-night transition).
  - Kiwi could ship **original** Kiwi wallpapers as light/dark pairs (XML under
    `~/.local/share/gnome-background-properties/`, which Kiwi creates and removes itself).
  - Moving wallpapers need an external app (Hidamari).
- **Blockers / risks:**
  - Copyright.
  - Writing into the user's data dir must be tracked and removed on uninstall (CLAUDE.md).
  - Video wallpapers on Wayland need a helper window.
- **Linux equivalents today:** GNOME's dark/light wallpapers; timed XML; Hidamari; Variety.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort S**: original Kiwi light/dark wallpapers, installed by the installer
  (P7).

### F17. System Settings reorganisation
- **Introduced / changed:** Sequoia (sidebar regrouped, a big General header). Tahoe adds a Menu Bar pane and
  moves Control Center settings into it (F43).
- **What it is:** a reordered sidebar (networking, hardware and appearance higher up), and a new iCloud pane that
  consolidates storage.
- **Caveats (on macOS):** users must re-learn where settings are; inconsistent headers.
- **Port to GNOME 50:** relevant only as a pattern for Kiwi's own preferences. The planned sidebar prefs (one page
  per feature, overhaul plan §6) mirror the Tahoe layout (Menu Bar, Control Center, Desktop & Dock, Appearance).
- **Blockers / risks:** none.
- **Linux equivalents today:** GNOME Settings; Extension Manager.
- **Kiwi status:** partial (the sidebar is planned in P0).
- **Recommendation:** **Port (P1 core), effort S**: name Kiwi's prefs pages like Tahoe's (Appearance, Menu Bar,
  Control Center, Desktop & Dock, Spotlight).

---

## 3. macOS 26 Tahoe: Liquid Glass in depth

Apple's own definition (newsroom, June 2025; HIG Materials):
- Liquid Glass is "a translucent material that reflects and refracts its surroundings". It uses real-time
  rendering and specular highlights that react to movement.
- Its colour is "informed by surrounding content" and it adapts between light and dark.
- It forms **a distinct functional layer for controls and navigation that floats above the content layer**. It is
  never used in the content layer itself, except for transient states such as a slider thumb while you drag it.
- There are two variants. **Regular** blurs and adjusts luminosity; it is used by most system components and
  anything with text. **Clear** is highly translucent, for controls over rich media; the HIG advises a **35 % dark
  dimming layer** under it when the content is bright.
- On the Mac, Apple tuned it down compared with iOS (Ars, 2025):
  - Menus, notifications, Spotlight and most menu bar dropdowns use the less translucent look.
  - Control Center uses the "glassier" one.
  - App toolbars come in two styles: a "soft" scroll-edge style that lets content show through (Photos), and a
    "hard-style" divider where text labels need clarity (Finder lists).

### F18. Liquid Glass material: the core look
- **Introduced / changed:**
  - Tahoe 26.0.
  - 26.1 added Clear/Tinted (F31).
  - Golden Gate: darker edges, brighter speculars, better diffusion of complex content, and a transparency slider
    (F57, F31).
- **What it is:** the shared material for the Dock, menu bar dropdowns, Control Center, notifications, Spotlight,
  sidebars, toolbars, buttons, sliders, switches, popovers and widgets. Its traits:
  1. **Translucency with blur:** the backdrop is blurred and its luminosity adjusted.
  2. **Lensing and refraction at the edges:** the backdrop bends near the rim, like the edge of a lens.
  3. **Specular highlights:** a bright rim that catches "light". On iOS it moves with the device; on the Mac it is
     mostly static.
  4. **Adaptive tint:** the colour is taken from the content behind; it flips light or dark with the backdrop.
  5. **Adaptive shadows:** they get stronger over busy content.
  6. **Concentric shapes:** controls are capsules and rounded rects whose radii are concentric with the window and
     hardware corners.
  7. **Grouping:** related toolbar buttons share one glass capsule. In Tahoe the groupings are always visible, not
     only on hover (MacStories).
- **Caveats (on macOS):**
  - Legibility suffers when fine text or detailed images scroll under other text (Ars, MacStories): Settings'
    search field, the top of Photos, Music's floating bottom controls.
  - Apple adds automatic shadows and opacity changes to compensate, and they are inconsistent across apps.
  - "Hacksaw, not scalpel": the only global escape is Reduce Transparency (F30).
  - It costs GPU time, and Tahoe was criticised for stutter.
- **Port to GNOME 50 (faux, no blur):** St CSS on Kiwi's own surfaces through `lib/glass.js` (`Glass.attach`,
  `kiwi-glass-*` fill classes).
  - **Translucency + blur →** a fill of rgba tint at 55–80 % alpha (light: white-ish, dark: graphite), higher than
    real glass would need, because there is no blur to hide what is behind. Optionally a subtle 2–3 % noise PNG as
    `background-image` (St supports background images) to fake frosting.
  - **Lensing →** an inset ring: `box-shadow: inset 0 0 0 1px rgba(255,255,255,0.18)` plus a second inner gradient
    band (via a child actor, since St draws one `box-shadow` per actor). This gives the "thick edge" look without
    sampling the backdrop.
  - **Specular →** a 1 px top rim highlight (lighter top border, or an inner child with
    `background-gradient-direction: vertical` from rgba(255,255,255,0.35) to transparent over the top 30 %).
    Optionally a radial-gradient corner glint (St supports `background-gradient-direction: radial`).
  - **Adaptive tint →** sample the wallpaper's average colour once per change (Kiwi can read the
    `org.gnome.desktop.background picture-uri` file asynchronously with `GdkPixbuf.Pixbuf.new_from_stream_at_scale_async`
    at 32×32 in the Shell process) and mix 5–10 % of it into the tint, as macOS does with "wallpaper tinting".
  - **Adaptive shadows →** a soft drop shadow (`box-shadow: 0 8px 24px rgba(0,0,0,0.25)`) on the outer wrapper;
    stronger in dark mode.
  - **Concentricity →** tokens from the `apple-design` skill: inner radius = outer radius − padding.
  - **Grouping →** button groups in a shared capsule actor.
- **Blockers / risks:**
  - No blur by owner decision; GNOME 51's `set_background_blur_params()` could add real blur later for Shell
    surfaces only.
  - App windows (GTK/libadwaita) can't be glassed from the Shell at all.
  - St has no backdrop sampling, so true refraction is impossible without a shader (experimental, and removed
    APIs on 51).
- **Linux equivalents today:**
  - Blur my Shell (now ships its own "Liquid Glass" effect on master);
  - Rounded Window Corners Reborn;
  - libadwaita 1.8+ has no glass.
- **Kiwi status:** partial (faux transparency fills exist; the rim and shadow structure is specified in
  `docs/features/liquid-glass.md`).
- **Recommendation:** **Port (P1 core), effort M.** The whole Kiwi look depends on it. See §6 for the cookbook.

### F19. "Liquid" motion: morphing, bouncing controls
- **Introduced / changed:** Tahoe. Golden Gate makes buttons animate "like iOS" and gives Control Center a
  consistent closing animation (Wikipedia, 27).
- **What it is:**
  - **Morphing:** controls fluidly change shape and size as options appear (a button grows into a menu).
  - **Press feedback:** pressed elements slightly enlarge and glow.
  - **Sliders and toggles:** their knobs turn into glass lenses while you drag them.
  - **Bounce:** Control Center and notifications spring in.
  - Ars: "a little playfulness never hurt anyone"; the animations don't add waiting.
- **Caveats (on macOS):** Reduce Motion replaces springs with fades; some find the bounce childish.
- **Port to GNOME 50:** Shell extension, in Kiwi's planned `core/motion.js` (shared springs, overhaul plan §4.2).
  - Clutter's `ease()` with `Clutter.AnimationMode.EASE_OUT_BACK` approximates a spring overshoot. A small
    custom spring (critically damped, with a `Clutter.Timeline` `new-frame` callback) gives true springs.
  - Popovers open from their source button: scale from 0.92 to 1 with pivot at the button
    (`set_pivot_point`) plus opacity.
  - **Press:** scale 1.04 plus a brighter rim class while held.
  - **Slider knob:** on drag start, widen the knob and switch it to the "clear glass" class (a lighter fill, white
    rim).
  - **Reduced motion:** honour it through `lib/compat.js` `reducedMotion` (GNOME's `enable-animations`), using a
    150 ms fade instead.
- **Blockers / risks:** per-frame JS callbacks must stay cheap; animate transforms and opacity only, never
  relayout (same rule as the notch performance pass).
- **Linux equivalents today:** GNOME's own ease animations; Burn My Windows for effects; nothing spring-based
  system-wide.
- **Kiwi status:** partial (springs are planned in P2 "Motion").
- **Recommendation:** **Port (P2), effort M.** It is what separates "Liquid Glass" from a translucent theme.

### F20. The transparent menu bar
- **Introduced / changed:**
  - Tahoe 26.0: fully transparent by default, with a "Show menu bar background" toggle in the new Menu Bar
    settings pane.
  - Golden Gate: menu icons reduced, and the Spotlight menu bar icon removed for Siri AI users (beta 3).
- **What it is:**
  - The menu bar has no background. Text and icons float on the wallpaper and switch between black and white by
    the wallpaper's brightness.
  - On mixed wallpapers macOS draws an almost invisible gradient or shadow under the bar for legibility (Ars:
    "break-glass-in-case-of-legibility-emergency").
  - **Show menu bar background** restores a Sequoia-like translucent bar. It is dark-only: there is no light
    variant on dark wallpapers anymore.
  - **Reduce Transparency** gives a fully solid bar.
  - **Behind windows:** when a window is maximized (or overlaps the bar), the bar reads against the window, not the
    wallpaper, and the bar background comes back for legibility.
  - It still hides in Full Screen and under the "Automatically hide and show the menu bar" options.
- **Caveats (on macOS):** busy wallpapers hurt legibility; there's no separation line between the menus and
  the desktop.
- **Port to GNOME 50:** Shell extension, part of Kiwi's menu bar (overhaul plan §5.1).
  - **Transparency:** `Main.panel` style class `kiwi-menubar-clear` with `background-color: transparent`.
  - **Legibility gradient:** a top-down gradient child (rgba(0,0,0,0.18) → 0) only when the wallpaper luminance
    test says the top band is mixed.
  - **Text colour:** sample the top 24 px band of the wallpaper (same async GdkPixbuf sampling as F18, per
    monitor) and pick dark or light text by relative luminance (WCAG). Re-run on `changed::picture-uri`,
    `picture-uri-dark`, and `color-scheme`.
  - **Over windows:** when any window touches the top edge (`window-added`, `position-changed`, maximize
    signals), switch to the solid glass bar. GNOME's own "transparent top bar" extensions use exactly this
    window-proximity check.
  - **Settings:** "Show menu bar background" (bool) and "Reduce transparency" (Kiwi's own, F30).
- **Blockers / risks:**
  - Wallpaper sampling must be async (EGO-X-002).
  - Animated or slideshow wallpapers need re-sampling on change.
  - In the overview (Mission Control), the panel sits over the dimmed overview background, so force light text
    there.
- **Linux equivalents today:** Transparent Top Bar (Adjustable transparency), Dynamic Panel, Blur my Shell's
  panel mode.
- **Kiwi status:** partial (the dropped panel-transparency did a static version; the menu bar is planned in P1).
- **Recommendation:** **Port (P1 core), effort M.** It is the most visible Tahoe trait on the desktop.

### F21. Glass Dock and app switcher
- **Introduced / changed:** Tahoe (the Dock crafted "from multiple layers of Liquid Glass"; the Cmd-Tab switcher
  in glass). Golden Gate: background-process dots (F63), and the Dock optimised for touch (reported).
- **What it is:**
  - The Dock is a highly transparent glass slab with a bright rim and opaque icons. MacStories finds maximum
    transparency works here because the icons are large and opaque.
  - The Cmd-Tab switcher uses the same glass.
  - Running-app dots and the minimise and magnification behaviours are unchanged.
- **Caveats (on macOS):** low contrast of the running dots on light wallpapers.
- **Port to GNOME 50:** Kiwi's own dock (overhaul plan §5.2) and app switcher (§5.7) use the **clear** glass
  variant:
  - a lower fill alpha (35–45 %);
  - a white 1 px rim at 30 %;
  - a top highlight band;
  - a soft shadow.
  - Running dots get a small dark halo for contrast.
- **Blockers / risks:** none beyond the dock itself.
- **Linux equivalents today:** Dash to Dock (translucent, no rim); Dash2Dock Animated.
- **Kiwi status:** partial (the dock and switcher are planned in P1 and P3).
- **Recommendation:** **Port (P1 core), effort S** (styling only, on top of the dock work).

### F22. Glass sidebars, toolbars and scroll-edge effects in apps
- **Introduced / changed:**
  - Tahoe: floating, inset glass sidebars that refract the content and reflect the wallpaper; toolbars as glass
    capsules; scroll-edge effects.
  - Golden Gate: sidebars are **edge-to-edge** again with coloured icons, and toolbars are uniform.
- **What it is:**
  - Sidebars float over the window content with their own corner radius and shadow.
  - Toolbars hold grouped glass capsules.
  - Content scrolls under both, with a soft or hard scroll-edge fade.
- **Caveats (on macOS):**
  - Floating sidebars waste space and look detached; Golden Gate reverted them.
  - Inconsistent between apps (Finder list vs icon view; Music vs Safari).
- **Port to GNOME 50:**
  - App chrome is drawn by GTK/libadwaita in the app process, so the Shell can't change it.
  - Kiwi dropped GTK theming (overhaul plan §2), so the only Kiwi use is **Kiwi's own Shell surfaces**:
    - Spotlight result lists, Control Center pages and the clipboard popover should use **scroll-edge fades**.
      `St.ScrollView` supports `-st-vfade-offset` in CSS, which is exactly a soft scroll-edge effect.
    - The prefs window (Adw) can use libadwaita's own sidebars.
- **Blockers / risks:** Wayland process separation; no supported way to theme libadwaita apps (and theming them
  was dropped).
- **Linux equivalents today:** libadwaita's `AdwNavigationSplitView` sidebars; no glass.
- **Kiwi status:** none.
- **Recommendation:**
  - Scroll-edge fades on Kiwi surfaces: **Port (P1 core), effort S.**
  - App sidebars and toolbars: **Skip.**

### F23. Redesigned controls: sliders, switches, buttons, segmented controls, tabs
- **Introduced / changed:** Tahoe (Liquid Glass controls; capsule buttons; rounded "sunken pill" tabs in Safari).
  Golden Gate: iOS-like button animations.
- **What it is:**
  - Buttons are taller capsules. Sliders have a glass knob that magnifies while dragging. Switches are glass
    toggles.
  - Segmented controls and tabs are pills sunk into a slot (Safari, MacStories).
  - Menu titles and selected items are separately rounded pills (criticised: they look "disconnected", MacRumors
    forum, 2026).
- **Caveats (on macOS):** extra height costs density; disconnected menus.
- **Port to GNOME 50:** St CSS for Kiwi's controls:
  - `.kiwi-slider` (a taller 6 px track, a 22 px knob that grows to 28 px while dragging);
  - `.kiwi-switch`;
  - `.kiwi-pill-button`;
  - segmented pills for Spotlight's browse tabs (F33) and the Control Center pages.
  - GNOME's Quick Settings sliders (`Slider` from `ui/slider.js`) can be restyled with CSS
    (`-slider-height`, `-slider-handle-radius`). The knob growth needs a style-class toggle on drag begin and end.
- **Blockers / risks:** `ui/slider.js` draws with Cairo from CSS properties: only those properties can be
  changed, not the shape.
- **Linux equivalents today:** GNOME Quick Settings' own pill toggles (already capsule-like).
- **Kiwi status:** partial (the Control Center restyles tiles and sliders).
- **Recommendation:** **Port (P1 core), effort S.**

### F24. Window corner radius: Tahoe's oversized and inconsistent corners
- **Introduced / changed:**
  - Tahoe 26.0: much larger radii that **vary by window type**; windows with toolbars get bigger corners than
    plain ones.
  - TinkerTool can change the radius on 26.4+.
  - Golden Gate beta 6: **one radius for all windows**, less rounded.
- **What it is:**
  - Tahoe made windows concentric with "the rounded corners of modern hardware", so radii grew, and grew more on
    windows with tall toolbars.
  - Resize problem (Norbert Heger, January 2026): the resize hot zone is a 19×19 px square at the corner. With
    the big radius about **75 % of it lies outside the visible window**, so grabbing the corner often misses.
    Scroll bars also clip against the round corner as if it were square (Gruber).
- **Caveats (on macOS):** described as "children's toys"; failing resize grabs; mixed radii look sloppy side by
  side; reverted in 27.
- **Port to GNOME 50:**
  - Kiwi's **rounded corners** feature (`apps/roundedCorners`) already rounds windows from the Shell.
  - The lesson for Kiwi:
    - **Use one moderate radius for every window** (Golden Gate's choice, roughly 10–12 px on a 1× display,
      scaled by the monitor's scale factor). Never vary it by window type.
    - Keep it concentric with Kiwi's own radii: menu bar dropdowns, Control Center (22), tiles.
    - Corners must not change the resize zone. Mutter's resize zone for SSD and Xwayland windows is its own;
      GTK CSD apps resize via their own invisible borders, so rounding in the Shell doesn't break them. Test that
      the corner is grabbable.
  - Tiled windows (F1) with margins keep their rounding; macOS keeps rounded corners when tiled.
- **Blockers / risks:**
  - Rounding is a per-window effect; it costs GPU on many windows.
  - Fullscreen and maximized windows should drop rounding.
- **Linux equivalents today:** Rounded Window Corners Reborn; libadwaita's own 12-ish px window radius on CSD apps.
- **Kiwi status:** have.
- **Recommendation:** **Port (P1 core), effort S**: tune to one consistent radius, add a "radius" setting and the
  rule that maximized, tiled-without-margins and fullscreen windows are square.

### F25. Liquid Glass app icons and squircle enforcement ("icon jail")
- **Introduced / changed:**
  - Tahoe: all icons must be squircles. A non-conforming icon is shrunk onto a grey squircle plate, and
    already-square icons get a glass border.
  - New layered `.icon` format and the Icon Composer app.
  - Golden Gate: more glass layers in icons and sharper detail; squircles still required.
- **What it is:**
  - Icons are built from a background layer and foreground layers. The system adds specular highlights,
    refraction and translucency.
  - Legacy icons are auto-processed. Even flat icons gain a glassy interior (Slack).
- **Caveats (on macOS):**
  - Loss of personality; abstract, hard-to-recognise icons (Kafasis, "Tahoe's terrible icons", Nov 2025).
  - A slight delay before Finder icons appear after a style change (the icon cache).
- **Port to GNOME 50:** applies only where Kiwi draws icons: dock, Launchpad/Apps view, app switcher, Spotlight.
  - **Optional "uniform icon plates":** draw each app icon on a squircle plate actor (a rounded rect with
    `border-radius` about 22.5 % of its size, glass fill), with the theme icon at about 80 % size on top. Apply it
    only to icons that are not already square-ish. Detecting that needs alpha analysis of the icon (costly), so
    make it a manual "plate all icons" toggle instead.
  - **Specular on icons:** a top-left highlight overlay actor, cheap.
- **Blockers / risks:**
  - GNOME's icon themes (Adwaita style) use varied shapes on purpose; plating everything fights the platform.
  - Users disliked icon jail.
- **Linux equivalents today:** icon themes with squircle shapes (WhiteSur, Colloid's macOS-like variants).
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort M**, off by default. Not a macOS feature people liked.

### F26. Icon and widget styles: Default, Dark, Clear, Tinted
- **Introduced / changed:**
  - Tahoe (from iOS 18's dark and tinted icons, plus the new **clear** look; light and dark variants of clear
    and tinted).
  - Golden Gate improves the sharpness of every variant.
- **What it is:**
  - In System Settings › Appearance › "Icon & widget style":
    - **Default**;
    - **Dark** (dark backgrounds, coloured glyphs);
    - **Clear** (decolourised glass icons);
    - **Tinted** (monochrome in a colour chosen from a pop-up, which also drives folder colour).
  - Widgets follow the same style.
  - Each has light and dark sub-variants.
- **Caveats (on macOS):** Clear and Tinted make many icons unreadable and indistinguishable, especially in
  System Settings' sidebar (Eclectic Light). Colour-blind users suffer.
- **Port to GNOME 50:** feasible **on Kiwi-drawn icons** with stock Clutter effects (no shaders):
  - **Dark:** `Clutter.BrightnessContrastEffect` (brightness −0.25) on the icon plus a dark plate (F25), or
    nothing on symbolic icons.
  - **Clear:** `Clutter.DesaturateEffect` (factor 1.0) plus `opacity` 200 on a clear-glass plate.
  - **Tinted:** `Clutter.DesaturateEffect` then `Clutter.ColorizeEffect` with the tint colour (GNOME's
    `org.gnome.desktop.interface accent-color` by default).
  - Apply these in the dock, Launchpad and app switcher through one helper (`lib/iconStyle.js`).
- **Blockers / risks:**
  - Effects per icon add offscreen redirects. Fine for about 30 dock icons; for a large app grid apply them once
    to a cached texture, or skip the grid.
  - Not system-wide (Files and app windows unaffected).
- **Linux equivalents today:** none as a runtime option; static icon themes only.
- **Kiwi status:** none.
- **Recommendation:** **Port (P2), effort M.** It is a distinctly Tahoe personalisation and cheap on Kiwi's own
  surfaces. Ship Dark and Tinted; Clear is optional.

### F27. Folder colours, emoji and symbols; theme and highlight colours
- **Introduced / changed:** Tahoe.
- **What it is:**
  - **Folder colour** follows the theme (accent) colour by default.
  - **Customize Folder:** right-click a folder › Customize Folder… to pick a colour, an **emoji**, or an
    **SF Symbol** stamped on it. Tags can also colour folders.
  - Folders animate when files drop in, and show a "paper sticking out" when non-empty.
  - **Colours:** nine theme colours, nine highlight colours and eight folder colours, plus custom colours. All
    are independent (MacStories).
- **Caveats (on macOS):**
  - Third-party custom folder icons (Dropbox) don't follow until updated.
  - Easy to create clashing combinations.
- **Port to GNOME 50:** not a Shell feature; Files (Nautilus) draws folders. Options:
  1. **Per-folder icons through gvfs metadata.** `Gio.File.set_attributes_async` with `metadata::custom-icon`
     pointing at a Kiwi-generated SVG (folder tinted, with an emoji or symbolic glyph composited in). Files
     honours `metadata::custom-icon` (verify on Files 50). This changes metadata, not the user's file: Kiwi must
     keep a list of the folders it changed and clear them on reset.
  2. **Global folder colour** would need an icon theme (writing `~/.local/share/icons`) or the accent-aware
     folders of a theme. Out of scope for an extension.
  3. **The UI:** a Spotlight action ("Customize folder…") or a Files context menu via a Nautilus extension.
     Nautilus extensions are separate (Python/C). Skip that.
  - GNOME 47+ already has accent colours (`accent-color`); Kiwi's highlight and theme colours should follow it.
- **Blockers / risks:**
  - Files' support for custom icons in GTK4 views needs checking.
  - Writing metadata for user folders is borderline for the "never touch user files" rule; it must be
    reversible and opt-in.
  - The SVG generation needs librsvg/Cairo (available in the Shell).
- **Linux equivalents today:** Folder Color (a Nautilus extension); `gio set <dir> metadata::custom-icon`; Files'
  Properties › custom icon (where available).
- **Kiwi status:** none.
- **Recommendation:**
  - Folder customisation: **Later (P3), effort M** (an opt-in Spotlight action).
  - Follow GNOME's accent colour everywhere: **Port (P1 core), effort S.**

### F28. Icons in menus (Tahoe) and the Golden Gate rollback
- **Introduced / changed:** Tahoe added SF Symbol icons next to most menu items, including standard items
  (Open, Paste, Window items) in non-updated apps. Golden Gate removes most of them (Wikipedia: "no icons by
  default"; MacRumors: kept only for some common actions).
- **What it is:** automatic glyphs beside menu commands.
- **Caveats (on macOS):** visual clutter, misaligned text; widely criticised, then reverted.
- **Port to GNOME 50:** Kiwi's app menus (overhaul plan §5.1) build their own `PopupMenu` items, so they can show
  icons or not. Follow Golden Gate: **no icons by default**, an optional icon only for a short list (New, Open,
  Copy, Paste, Share, Delete) using GNOME symbolic icons.
- **Blockers / risks:** none.
- **Linux equivalents today:** GNOME's menus are mostly icon-less; GTK3 apps can show menu icons.
- **Kiwi status:** none.
- **Recommendation:** **Port (P1 core), effort S**: a design decision for the app menu, not a feature.

### F29. Left-aligned system dialogs and pop-up power dialogs
- **Introduced / changed:** Tahoe (system alerts left-aligned; Restart and Shut Down shown as a pop-up rather than
  a window). Low-battery and AirPods alerts became menu-item popovers (F51).
- **What it is:**
  - Alerts switch from centred to left-aligned text, with the icon at the top left and buttons at the bottom
    right.
  - The power dialogs float as glass pop-ups.
- **Caveats (on macOS):** Ars found the asymmetric whitespace disorienting.
- **Port to GNOME 50:** St CSS on `ModalDialog` (`.modal-dialog`, `.end-session-dialog`) plus Kiwi's logo-menu
  power items (overhaul plan §5.1):
  - restyle the GNOME end-session dialog with faux glass, left-aligned headline, capsule buttons;
  - optionally make the logo menu's Restart… and Shut Down… open a compact glass popover with a 60 s countdown
    (macOS-like).
- **Blockers / risks:** the end-session dialog's logic is GNOME's; Kiwi only restyles it (`Main.wm` and
  `endSessionDialog` internals are private).
- **Linux equivalents today:** none specific.
- **Kiwi status:** none.
- **Recommendation:** **Port (P2), effort S.**

### F30. Reduce Transparency, Increase Contrast and the accessibility criticism
- **Introduced / changed:**
  - Long-standing settings, with new Tahoe behaviour.
  - 26.1 makes the Liquid Glass setting unavailable while they are on.
  - Golden Gate adds **Show Borders** (F65).
- **What it is:**
  - **Reduce Transparency** makes menus, Spotlight, Control Center and notifications opaque. Windows stop
    picking up a wallpaper tint, and the menu bar gets a solid background.
  - Finder, Photos and Messages regain a clearly delineated title-bar area.
  - Glassy outlines remain on some elements (Control Center, menus, Spotlight) but not notifications (Ars).
  - **Increase Contrast** (which implies Reduce Transparency) outlines controls, darkens system colours and the
    traffic lights.
  - **The criticism** (Ars, Eclectic Light, accessibility advocates): the defaults fail contrast over busy
    content, and pushing everyone to Accessibility settings is "an admission of failure in design". It is all or
    nothing.
- **Caveats (on macOS):** an all-or-nothing hacksaw (Ars); it loses the look entirely.
- **Port to GNOME 50:** Kiwi's glass variants (overhaul plan §5.8, "high contrast (solid) and reduced
  transparency"):
  - **Reduce transparency (Kiwi setting):** every `kiwi-glass-*` class switches to an opaque fill
    (`alpha 1.0`), the rim stays as a 1 px border, and the menu bar shows its background. It should also follow
    a system signal if one appears; GNOME 50 has no "reduce transparency" key, so it is Kiwi-only.
  - **High contrast:** follow `org.gnome.desktop.a11y.interface high-contrast`: solid fills, 1 px 60 %-contrast
    borders on every control, a stronger focus ring, and no gradients.
  - **Per-surface escape** (better than Apple's): `liquid-glass-surfaces` already lists surfaces, so the user can
    keep glass on the dock but not on menus.
  - Contrast check: the acceptance target of ≥ 4.5:1 text contrast over the worst wallpaper
    (`liquid-glass.md`) is exactly the bar Apple missed.
- **Blockers / risks:** none technical. It must be applied in one place (`lib/glass.js`) so no surface forgets it.
- **Linux equivalents today:** GNOME high contrast; reduced motion (`enable-animations`).
- **Kiwi status:** partial (the high-contrast rule is in the spec; the reduced-transparency variant is planned).
- **Recommendation:** **Port (P1 core), effort S.** Required, and Kiwi can beat Apple with per-surface control.

### F31. The Liquid Glass Clear/Tinted setting (26.1) and transparency slider (27)
- **Introduced / changed:**
  - Tahoe 26.1: System Settings › Appearance › Liquid Glass: **Clear** (default, "more transparent, revealing the
    content beneath") or **Tinted** ("increases opacity of the material in apps and notifications on the Lock
    Screen").
  - Golden Gate: a **continuous slider** from clear to tinted (MacRumors: "from ultra-clear to fully tinted").
    Even its clearest end is less clear than the WWDC 2025 demo.
- **What it is:**
  - User control over glass opacity.
  - In 26.1 the difference is subtle in light mode (Eclectic Light saw none in Finder) and clearer in dark mode
    (darker widgets, a white back/forward capsule).
  - It is disabled when Reduce Transparency or Increase Contrast is on.
- **Caveats (on macOS):** subtle; confusing overlap with Accessibility; "Tinted" collides in name with the
  icon "Tinted" style.
- **Port to GNOME 50:**
  - Kiwi already has the pieces: `liquid-glass-style` (tinted/clear) and a tint slider (`liquid-glass-tint`);
    `glassParams.js` maps them to 5 %-alpha buckets.
  - Present them as **one slider "Glass: Clear ↔ Tinted"** in the Appearance page, mapped to fill alpha (about
    35 % to 85 %) and rim strength.
  - Grey it out with a note when Reduce Transparency or High Contrast is on, like macOS.
- **Blockers / risks:** none.
- **Linux equivalents today:** Blur my Shell's sigma and brightness sliders.
- **Kiwi status:** partial (keys exist).
- **Recommendation:** **Port (P1 core), effort S.**

