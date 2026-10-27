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

