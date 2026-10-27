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
- **Port to GNOME 50:** out of scope for a desktop shell. GTK apps already have an emoji chooser (Ctrl+. or
  Ctrl+;), and GNOME Characters covers the rest.
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

---

## 4. macOS 26 Tahoe: system features

### F32. Spotlight: one ranked list, filters, tab-to-scope and site search
- **Introduced / changed:** Tahoe 26.0 ("biggest update to Spotlight ever"). Golden Gate rebuilt the index for
  Siri AI (F60).
- **What it is:**
  - **One ranked list.** Results (apps, files, folders, events, messages, mail and more) are no longer in fixed
    sections. They form one list ranked by relevance and learned habits: typing "N" picks Numbers if you use it.
  - **Filter chips.** A row under the search field offers "Menu items" for the current app, Clipboard and
    relevant apps. ←/→ move along the row.
  - **Tab to scope.** **Tab** on a highlighted app scopes the search to that app's documents (Numbers + CSV) or
    its searchable content (Mail, Notes).
  - **Slash filters.** `/pdf`, `/screenshots`, `/folders`, `/gif`, `/png`, `/jpeg`, `/quicktime`, `/documents`,
    `/clipboard`, and cloud providers such as `/dropbox` or `/google drive`.
  - **Website search.** Type a site name (YouTube, Amazon, IMDb) then Tab to search that site.
  - **Other sources.** Open Safari tabs and windows, podcasts, and third-party File Provider clouds (Dropbox,
    Google Drive).
  - **Settings:** per-app and per-category exclusions (now sliders), "results from Apple partners", clear
    history, reset quick keys, clipboard off, and private query sharing.
- **Caveats (on macOS):** index rebuilds after updates slow it; adaptive ranking can surprise; web suggestions
  still clutter for some users.
- **Port to GNOME 50:** Kiwi Spotlight (`apps/spotlight`), Shell extension:
  - **Ranking:** a pure model (`model.js`) mixing provider score, a recency and frequency table (in-memory plus a
    small JSON in `~/.local/share/kiwi/` that Kiwi owns) and type boosts. Shell.AppSystem's usage
    (`Shell.AppUsage` / `get_default().compare`) gives app frequency for free.
  - **Filter chips:** St buttons in a row; ←/→ when the caret is at the end.
  - **Slash filters:** map `/pdf`, `/images`, `/folders` and so on to **LocalSearch (Tracker 3)** SPARQL over
    D-Bus (`org.freedesktop.LocalSearch3`, TinySPARQL) with `nie:mimeType` filters; async only.
  - **Tab to scope:** Tab on an app result restricts to files whose MIME type the app handles
    (`Gio.AppInfo.get_supported_types()`) or to that app's own `SearchProvider2` if it has one (Files,
    Calculator, Characters, Contacts, Calendar…).
  - **Site search:** a user-editable list of `name → URL template` entries.
- **Blockers / risks:**
  - LocalSearch may be disabled or not indexing.
  - Persistent ranking data is user data: keep it small, Kiwi-owned, and clear it with "Clear history".
  - There is no API for "open browser tabs" across browsers; skip that.
- **Linux equivalents today:** GNOME Shell search (search providers, no ranking learning); Ulauncher, Albert;
  Vicinae (a Raycast-like launcher); the Search Light extension.
- **Kiwi status:** partial (grouped results, top hit, calculator and keys exist; no chips, slash filters or
  learning).
- **Recommendation:** **Port (P2), effort M.**

### F33. Spotlight browse views (Apps, Files, Actions, Clipboard) and Apps replacing Launchpad
- **Introduced / changed:**
  - Tahoe 26.0: **Launchpad removed**, replaced by Spotlight's Applications view.
  - 26.1 widened the Apps grid from five to seven columns.
- **What it is:**
  - **The four views.** With Spotlight open and empty, four buttons appear to the right of the field after a
    moment: **Applications, Files, Actions, Clipboard**. **⌘1–⌘4** jump to them, and a shortcut (or the
    Launchpad/F4 key) opens Apps directly.
  - **Apps:**
    - five most-used apps at the top;
    - an alphabetical grid or list;
    - category filters (App Store categories);
    - Utilities folded at the bottom;
    - iPhone apps (via Mirroring) shown or hidden.
    - There are no folders or custom order (Launchpad users complained).
  - **Files:** app chips to filter by type, Suggestions, then a scrolling Recents list.
- **Caveats (on macOS):** no manual arrangement or pinning; iPhone apps clutter the list; Launchpad fans upset.
- **Port to GNOME 50:** Kiwi Spotlight plus Launchpad:
  - **The tab strip:** four segmented pills (F23) bound to Super+1..4 while Spotlight has the modal grab.
  - **Apps:** `Shell.AppSystem.get_default().get_installed()` grouped by the freedesktop `Categories=` field
    (map to about 10 macOS-like categories); a top row from app usage; grid or list toggle.
  - This is also how the plan's "Launchpad becomes part of the dock and app grid" (overhaul plan §3) can work:
    **one Apps view shared by Launchpad and Spotlight.** Kiwi can keep folders (GNOME's `app-folders` schema)
    because Kiwi users likely want them.
  - **Files:** recents from `Gtk.RecentManager` cannot be used in the Shell (no Gtk). Read
    `~/.local/share/recently-used.xbel` asynchronously (parse XBEL), or query LocalSearch for recently modified
    documents.
- **Blockers / risks:**
  - `recently-used.xbel` parsing must be async and tolerant.
  - Two app grids (Kiwi's and GNOME's overview grid) must not drift; reuse GNOME's folders.
- **Linux equivalents today:** GNOME's app grid (folders, custom order), the Activities overview, Search Light.
- **Kiwi status:** partial (Spotlight exists; Launchpad is being reworked; no browse views).
- **Recommendation:** **Port (P2), effort M.** It gives one Apps view for both Launchpad and Spotlight.

### F34. Spotlight Actions and Quick Keys
- **Introduced / changed:** Tahoe 26.0 (App Intents actions; quick keys). Golden Gate: faster indexing of
  intents; actions also used by Siri AI.
- **What it is:**
  - **The Actions view:** suggested actions (learned: "message Ana") and then all actions grouped by app, from
    App Intents and Shortcuts: send an email, create a note, start a timer, play a podcast, toggle settings, run
    a shortcut.
  - **Parameters** are typed inline: "tmr 2" starts a 2-minute timer.
  - **Quick keys:** 1–12 lowercase letters and digits, no symbols. Several actions can share a key (Spotlight
    lists them). Spotlight also auto-assigns quick keys to actions you use.
  - Quick keys don't sync between Macs. "Reset quick keys" is in Settings.
- **Caveats (on macOS):** only for apps with App Intents; quick keys can pollute normal results if they are real
  words.
- **Port to GNOME 50:** Kiwi Spotlight with an **action registry** (pure model plus adapters):
  - **Desktop actions:** `[Desktop Action …]` entries in .desktop files (New Window, New Private Window, Compose
    message…) through `Gio.DesktopAppInfo.list_actions()` / `launch_action()`. Every GNOME app with jump-list
    actions gets "actions" for free.
  - **Kiwi's own actions:** toggle Dark Style, DND, Night Light, Wi-Fi and Bluetooth (through the Quick Settings
    objects already used by Control Center), tile left/right (F1), Show Desktop, Stage Manager, Lock, Screenshot
    (`Main.screenshotUI.open()`), start a timer (a Kiwi notch timer).
  - **App menu commands** of the focused app (planned, overhaul plan §5.9) feed the same registry (F36).
  - **Quick keys:** a user table `alias → action id` in GSettings (`as` of `alias=id`), plus auto-suggest after
    three uses.
  - **Parameters:** a simple trailing argument for actions that declare one (timer minutes, a search term).
- **Blockers / risks:**
  - No cross-app intents framework on Linux: D-Bus activatable actions (`org.freedesktop.Application.ActivateAction`)
    exist for some GApplications but are not discoverable with labels, so only `.desktop` actions are reliable.
  - Timers need Kiwi's own state (the notch).
- **Linux equivalents today:** Ulauncher and Albert extensions (aliases, plugins); Vicinae; GNOME's desktop
  actions in the dash right-click menu.
- **Kiwi status:** none (Spotlight toggles Liquid Glass and Stage Manager only).
- **Recommendation:** **Port (P2), effort M.** High value for keyboard users, and it unifies with the app menu
  provider.

### F35. Spotlight clipboard history
- **Introduced / changed:** Tahoe 26.0.
- **What it is:**
  - Spotlight's Clipboard view (⌘4) lists everything copied in the **last 8 hours**: text, images and files. It
    is searchable from the main field, and items can be re-copied.
  - **Off by default** (privacy). It skips items from the Passwords app, but third-party managers' passwords do
    show up.
  - There is no length setting, no pinning, and no direct shortcut (Ars wants one).
- **Caveats (on macOS):** the fixed 8-hour window; no editing; buried "half an inch too deep".
- **Port to GNOME 50:** Kiwi already has clipboard history and Quick Paste (`apps/clipboard`).
  - Add the **Clipboard tab** in Spotlight's browse views (F33), backed by the same store.
  - Show clipboard results inline in searches only when `spotlight-clipboard` is on.
  - Offer "keep for: 8 h / 1 day / 1 week / forever", and keep **off by default** (EGO: clipboard shortcuts not
    enabled by default; declare clipboard access in metadata).
  - Skip items whose MIME targets include `x-kde-passwordManagerHint` (`clipboard.md`).
- **Blockers / risks:** EGO clipboard rules; images in memory.
- **Linux equivalents today:** Clipboard Indicator, Pano, Clipboard History extensions; CopyQ.
- **Kiwi status:** have (Quick Paste and history); the Spotlight tab is partial (recent clipboard in the empty
  state exists).
- **Recommendation:** **Port (P1 core), effort S.**

### F36. Spotlight menu-item search and search history
- **Introduced / changed:** Tahoe 26.0 (menu bar items searchable; up-arrow history).
- **What it is:**
  - **Menu items:** "Items from the menu bar for the app a user is currently working in are searchable", run with
    Return, like the Help menu search but global.
  - **History:** pressing **↑** in an empty Spotlight walks back through past searches, like a shell history.
    "Clear Spotlight history" is in Settings.
- **Caveats (on macOS):** only the frontmost app's menus.
- **Port to GNOME 50:**
  - **Menu items** come from the app menu providers (overhaul plan §5.1): GTK actions, exported `org.gtk.Menus`,
    DBusMenu, AT-SPI. Flatten them into `{label path, action}` and feed the F34 registry; it is already planned
    in §5.9.
  - **History:** a ring buffer of the last 50 queries (in memory, optionally persisted by Kiwi), with ↑/↓ when
    the field is empty.
- **Blockers / risks:** most libadwaita apps expose few menus (hamburger menus are built lazily; AT-SPI mode is
  experimental).
- **Linux equivalents today:** HUD-style menu search (Unity HUD, KDE's KRunner app-menu search, Plotinus for GTK3).
- **Kiwi status:** partial (planned in §5.9, P6).
- **Recommendation:**
  - History: **Port (P1 core), effort S.**
  - Menu-item search: **Port (P2), effort M**, after the app menu providers.

### F37. The redesigned, customisable Control Center (controls gallery)
- **Introduced / changed:** Tahoe 26.0 (iOS 18-style). Golden Gate: a consistent closing animation.
- **What it is:**
  - Control Center has **no fixed mandatory items** any more.
  - **Edit Controls** opens a gallery like the widget gallery: a searchable sidebar by app, and controls grouped
    by app.
  - Hovering a control shows a green **+**; you can also drag it into place in the panel, or drag it to the menu
    bar (F39).
  - **The controls:** timers, run a shortcut, **tile windows** (split the screen between the two most recent
    windows), new note, voice memo, Shazam, HomeKit scenes, Focus modes, screen recording, display and sound
    sliders, media.
  - **Third-party controls** come through WidgetKit/App Intents. Very few shipped at launch, partly because of a
    gallery bug (MacStories).
  - The panel height is capped (about half a Studio Display).
- **Caveats (on macOS):** few third-party controls; many controls are plain buttons without state; the capped
  height.
- **Port to GNOME 50:** Kiwi's Control Center (`apps/controlCenter`) restyles GNOME Quick Settings (`docs/features/control-center.md`):
  - **Edit Controls (v2 in the spec):** a glass gallery listing every available control:
    - GNOME's Quick Settings items (`quickSettings._grid` children, including other extensions' toggles: the
      "More" section);
    - plus **Kiwi controls**: Tile Windows (two recent windows side by side, F1), Stage Manager, Liquid Glass,
      Show Desktop, Screenshot, Screen Record (`Main.screenshotUI` in recording mode), Timer (notch), Keep Awake
      (an inhibitor via `org.gnome.SessionManager.Inhibit`), Dark Style, Night Light, Power Mode.
  - **Layout:** grid positions and sizes (1×1, 2×1, 2×2) stored as `as` keys; the pure layout model in
    `controlCenter/model.js`.
  - Drag to reorder (St drag via `DND.makeDraggable`).
- **Blockers / risks:**
  - Quick Settings items from GNOME and other extensions are private objects (`_grid`, `_indicators`); keep them
    wrapped and feature-detected per version (`version-matrix.md`).
  - Never drop unknown items.
- **Linux equivalents today:** GNOME Quick Settings (fixed order); Quick Settings Tweaker (reorder and hide).
- **Kiwi status:** have (fixed layout); Edit Controls is planned as v2.
- **Recommendation:** **Port (P2), effort L.** It is one of the most praised Tahoe changes, and Kiwi owns the
  surface.

### F38. Multiple Control Center panels
- **Introduced / changed:** Tahoe 26.0.
- **What it is:**
  - In the gallery, a **+** in the menu bar adds another Control Center with its own icon (one of 11 glyphs) and
    its own controls: a "Home" panel, a "Music" panel.
  - Empty panels vanish when you close the gallery.
- **Caveats (on macOS):** only 11 icons; adds menu bar items.
- **Port to GNOME 50:** each extra panel is a `PanelMenu.Button` with a glass popover reusing the Control Center
  grid renderer, holding a subset of controls. Store it as a JSON-ish `a(ssas)` (id, icon, controls) or simple
  parallel `as` keys.
- **Blockers / risks:** menu bar width (with the notch and app menus). The `core/layout.js` overflow rules apply.
- **Linux equivalents today:** none.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort M**, after F37.

### F39. Controls pinned to the menu bar
- **Introduced / changed:** Tahoe 26.0.
- **What it is:**
  - Any Control Center control can be dragged to the menu bar as a standalone icon.
  - Most such items are plain buttons (they open an app or flip a setting) without a dropdown or live state,
    unlike the purpose-built Wi-Fi or Sound extras (Ars).
  - When there are too many icons, app menus push them right while open.
- **Caveats (on macOS):** the notch eats space; you can make it ugly; many items lack state.
- **Port to GNOME 50:** Kiwi menu bar:
  - each pinned control becomes a `PanelMenu.Button` in `Main.panel._rightBox` (via `addToStatusArea` with a
    `kiwi-pin-<id>` role);
  - a toggle control shows its state by icon or opacity; a slider control opens a small glass popover with the
    slider;
  - the pure model decides order and overflow.
- **Blockers / risks:** panel space; mirrors in enable/disable.
- **Linux equivalents today:** many single-purpose extensions (Caffeine, Night Light toggle buttons).
- **Kiwi status:** none.
- **Recommendation:** **Port (P2), effort M**, together with F37.

### F40. Volume and brightness indicators from the menu bar
- **Introduced / changed:**
  - Tahoe 26.0: the 25-year-old centred square HUD is replaced by a glass bar that pops out under the Control
    Center or Sound menu bar item.
  - Golden Gate 27.2 beta: new volume and brightness slider designs (reported).
- **What it is:** pressing the volume or brightness keys shows a horizontal glass slider at the top right, under
  the Sound icon if it is in the menu bar, otherwise under Control Center. It is animated; it is not centred.
- **Caveats (on macOS):** hard to get used to (MacStories); it can cover menu bar extras.
- **Port to GNOME 50:** Shell extension.
  - GNOME's OSD is `Main.osdWindowManager` (`ui/osdWindow.js`).
  - Kiwi either injects into `OsdWindowManager.prototype.show` (InjectionManager) to position and restyle the
    OSD window under the menu bar's Control Center button, or replaces it with a Kiwi popover (a slider and
    icon) for volume and brightness while passing other OSDs (keyboard layout, airplane mode) through unchanged.
  - The target rect comes from the Control Center button's `get_transformed_extents()`.
  - Animate with F19 springs.
- **Blockers / risks:** private API (`osdWindow.js` internals change across versions); multi-monitor: show it on
  the monitor with the pointer or the primary one, as GNOME does.
- **Linux equivalents today:** GNOME's centred OSD; the Better OSD extension (moves the OSD).
- **Kiwi status:** none.
- **Recommendation:** **Port (P2), effort S.** It is a cheap, very visible Tahoe detail.

### F41. Lock screen clock customisation
- **Introduced / changed:** Tahoe 26.0 (Wallpaper › Clock Appearance).
- **What it is:**
  - About six typefaces and weights, as on iOS (no colour options on the Mac).
  - Shown on the lock screen, on the lock screen and screen saver, or off.
  - The lock screen is still notification-free and widget-free.
- **Caveats (on macOS):** buried in Wallpaper settings.
- **Port to GNOME 50:** Shell extension, but it needs `"session-modes": ["user", "unlock-dialog"]` in
  `metadata.json` to style `unlockDialog`'s clock (`.unlock-dialog-clock-time`).
  - EGO reviewers require a reason for unlock-dialog mode, and **every** Kiwi feature must then behave in that
    mode (the code map notes session-modes is not declared, so Kiwi is torn down on lock).
  - A stylesheet-only change (font-family, weight, size) applied while locked is small.
- **Blockers / risks:** the session-modes change affects the whole extension lifecycle; it is a big decision for a
  small feature.
- **Linux equivalents today:** extensions that theme the lock screen (Lock Screen Background, Blur my Shell's
  lock-screen blur).
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort M.** Only if the owner accepts unlock-dialog mode for other reasons.

### F42. Cursor redesign (Tahoe) and the hand cursor's return (Golden Gate)
- **Introduced / changed:**
  - Tahoe: a rounder arrow cursor.
  - Golden Gate: the link-hover "glove" (pointing hand) returns in a new design (Wikipedia).
- **What it is:** a system cursor shape refresh.
- **Caveats (on macOS):** none of note.
- **Port to GNOME 50:**
  - Cursors are an icon theme (`org.gnome.desktop.interface cursor-theme`).
  - Shipping a cursor theme and switching the user's setting is a user-file and setting change outside the Shell.
  - Recommend an existing macOS-like cursor theme from the installer instead.
- **Blockers / risks:** copyright of Apple cursor art; changing the user's settings.
- **Linux equivalents today:** Apple-like cursor themes (e.g. "macOS" cursors on GitHub/Flathub themes),
  Bibata.
- **Kiwi status:** none.
- **Recommendation:** **Skip** in the extension. Installer (P7) can offer an optional cursor theme, effort S.

### F43. The Menu Bar settings pane: hide any item, background, auto-hide
- **Introduced / changed:** Tahoe 26.0 (new System Settings › Menu Bar pane; the Control Center settings merged
  into it).
- **What it is:**
  - Per-app toggles to **allow or deny any app's menu bar item**, even when the app has no such option (the
    ScanSnap and Adobe Creative Cloud example).
  - The classic system items (Wi-Fi, Sound, Battery, Bluetooth, Spotlight, Siri, Time Machine, Fast User
    Switching, Weather…).
  - "Show menu bar background" (F20).
  - "Automatically hide and show the menu bar": Always, On Desktop Only, In Full Screen Only, Never.
  - "Recent documents, applications, and servers" counts.
  - A link into the controls gallery.
- **Caveats (on macOS):** it doesn't replace Bartender/Ice for ordering or overflow; no reordering beyond
  Cmd-drag.
- **Port to GNOME 50:** Kiwi menu bar prefs page plus Shell code:
  - **List** every `Main.panel.statusArea` role, including AppIndicator/KStatusNotifier items from the
    AppIndicator extension, which appear as status-area entries (`appindicator-…` roles), and GNOME's own items.
  - **Hide** by `actor.hide()` with a tracked restore, and **reorder** within `_rightBox` (remove and insert the
    container; restore the original index on disable).
  - Kiwi must never destroy other extensions' items.
  - **Auto-hide modes:** fold into the planned "fullscreen hides the menu bar" rule plus an optional "always
    auto-hide" (the removed auto-hide top bar returns as a menu bar option).
- **Blockers / risks:**
  - Other extensions may re-add or move their items: watch `actor-added` on the boxes and re-apply.
  - Private panel boxes (`_rightBox`).
  - The prefs window can't see the Shell's status area directly; send the list over a small D-Bus or GSettings
    "seen items" key that Kiwi writes.
- **Linux equivalents today:** Just Perfection (hide items), Top Bar Organizer (reorder), Hide Top Bar.
- **Kiwi status:** none.
- **Recommendation:** **Port (P2), effort M.**

### F44. The Phone app
- **Introduced / changed:** Tahoe 26.0 (Continuity). Golden Gate: Call Context (shows Mail details such as a
  flight code when you call a business).
- **What it is:**
  - The iPhone Phone app on the Mac: Favorites, Recents, Voicemails with transcripts, a keypad that takes
    keyboard input and paste, call screening settings that sync to the phone, Hold Assist and Live Translation.
  - Calls are relayed through the nearby iPhone.
- **Caveats (on macOS):** needs an iPhone on the same account; no Android.
- **Port to GNOME 50:**
  - GSConnect and KDE Connect show call notifications (mute ringer, reply by SMS) for Android, but don't relay
    call audio.
  - Phone audio over Bluetooth HFP (PipeWire supports HFP) lets the PC act as a headset for any phone; no dialer
    UI exists in GNOME.
  - Out of scope.
- **Blockers / risks:** Apple services; telephony stack.
- **Linux equivalents today:** GSConnect, KDE Connect; GNOME Calls (for modems and phones running Linux).
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort XL.**

### F45. Live Activities from the iPhone in the menu bar
- **Introduced / changed:** Tahoe 26.0.
- **What it is:**
  - Live Activities running on the paired iPhone (Uber, food delivery, flights via Flighty, sports scores, timers)
    appear automatically as a **small black capsule** at the left of the menu bar's status area, with an icon and
    a short status (an ETA).
  - Clicking expands it below the menu bar. A second click opens the app in iPhone Mirroring.
  - It needs Mirroring and notifications set up.
- **Caveats (on macOS):** the menu bar-height capsule is too small to read (MacStories); iPhone only.
- **Port to GNOME 50:**
  - This is **exactly Kiwi's notch v3 "Now" tab** (overhaul plan §5.6): live activities for charging, timers,
    screen recording, headphones, the next calendar event and download progress.
  - Phone sources are optional: GSConnect exposes Android MPRIS media and notifications, which the notch already
    reads.
  - The macOS pattern to copy is the **compact capsule** (an icon and a short text such as "3 min", or a progress
    ring) that expands on hover or click.
  - **Sources:**
    - UPower (`gi://UPowerGlib` or Shell's `Main.panel.statusArea.quickSettings._system` battery proxy);
    - MPRIS (already used);
    - Kiwi timers;
    - `Main.screenshotUI` recording state;
    - Bluetooth battery from BlueZ `org.bluez.Battery1`;
    - Evolution Data Server calendar via Shell's `ui/calendar.js` sources;
    - download progress from notifications with a progress hint (GNOME Web, Firefox via the portal).
- **Blockers / risks:** there is no generic "live activity" protocol on Linux. Every source is a custom adapter,
  and third-party apps can't publish one (the notification `x-kde`-style progress hints are not standard in
  GNOME).
- **Linux equivalents today:** none as a system feature; some "dynamic island" toy extensions.
- **Kiwi status:** partial (the notch has media; live activities are planned in P5).
- **Recommendation:** **Port (P2), effort M**: compact capsules in the notch for system sources first.

### F46. Shortcuts automations and intelligent actions
- **Introduced / changed:**
  - Tahoe 26.0: Automations on the Mac, and "Use Model" actions on on-device, Private Cloud Compute or ChatGPT
    models.
  - Golden Gate: Describe a Shortcut (natural language), and new triggers (screenshot taken, notification
    received) (F68).
- **What it is:** "if this, then run shortcut" triggers:
  - a time of day, sunrise or sunset (daily, weekly or monthly);
  - an email arriving (by sender, subject or account);
  - a message arriving;
  - a **folder changing** (items added, modified or removed);
  - an **external drive connected or ejected**;
  - joining or leaving a **Wi-Fi network**;
  - a **Bluetooth device** connecting;
  - an **external display** connecting;
  - **Stage Manager** turning on or off;
  - **battery level** thresholds;
  - Focus or DND changes.
  - Each automation runs silently or **asks for confirmation through a notification**, and can notify when run.
- **Caveats (on macOS):** trial-and-error authoring (Ars); the display trigger is not per display.
- **Port to GNOME 50:** not a Shell feature, but the Shell sees many triggers.
  - A small Kiwi **"Automations"** (P3 idea) could run user-chosen commands or `.desktop` actions on:
    - display connect (`Main.layoutManager` `monitors-changed`);
    - power thresholds (UPower);
    - Wi-Fi SSID (NetworkManager via `gi://NM`, already used by Shell);
    - Bluetooth connect (GnomeBluetooth);
    - Stage Manager toggling (Kiwi);
    - DND toggling;
    - a time of day (a GLib timeout).
  - Run commands with `Gio.Subprocess` (async). The confirmation step is a Kiwi notification with Run/Skip
    actions.
  - A full Shortcuts editor is out of scope.
- **Blockers / risks:**
  - Running arbitrary commands from an extension is an EGO red flag: only user-entered commands, never
    downloaded scripts; document it clearly.
  - Overlaps with systemd user units and udev.
- **Linux equivalents today:** systemd user timers and path units; Automate (KDE, Plasma 6 "automations" are
  limited); `gnome-shell` extensions like Auto Activities; Home Assistant for home triggers.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort L.** Stage Manager and display triggers are the Kiwi-flavoured part.

### F47. The Games app and Game Overlay
- **Introduced / changed:** Tahoe 26.0. 26.2: library filters and challenge score banners.
- **What it is:**
  - **Games:** a hub built on Game Center. Home (recent games, friends' activity, charts), Arcade, a Friends tab
    with asynchronous challenges, and a Library that includes **non-App Store games** such as Steam installs.
  - **Game Overlay (⌘⎋ or the rocket in the menu bar):** brightness, volume, energy mode, Game Mode and
    controllers; then achievements and leaderboards; then social.
- **Caveats (on macOS):** only Apple-implemented achievements show; no Mac-only filter.
- **Port to GNOME 50:**
  - A game library is an app (Lutris, Heroic, Steam).
  - A **Kiwi overlay** for fullscreen games is conceivable (a glass panel on a keybinding with brightness,
    volume, Power Mode via `net.hadess.PowerProfiles`, and DND), but fullscreen games often use direct scanout
    (unredirected), and showing Shell chrome over them forces compositing and can stutter.
- **Blockers / risks:** unredirection and VRR; games grabbing input.
- **Linux equivalents today:** Steam overlay, MangoHud, GameMode, Lutris, Heroic, Bottles.
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort L.**

### F48. Journal on the Mac
- **Introduced / changed:** Tahoe 26.0. Golden Gate: generative writing prompts.
- **What it is:** Apple's journaling app with multiple journals, a Places map of entries, photos, Touch ID lock,
  and iCloud sync.
- **Caveats (on macOS):** no journaling suggestions from Mac activity; iCloud only.
- **Port to GNOME 50:** an app, out of scope.
- **Blockers / risks:** n/a.
- **Linux equivalents today:** Iotas (notes), Folio, Diary-style apps on Flathub.
- **Kiwi status:** none.
- **Recommendation:** **Skip.**

### F49. Live Translation
- **Introduced / changed:** Tahoe 26.0 (Messages, FaceTime captions, Phone calls; on-device).
- **What it is:**
  - Messages are translated as you type and as they arrive (after a language download).
  - FaceTime shows translated live captions.
  - Phone calls get spoken translation.
- **Caveats (on macOS):** language list; Apple Intelligence hardware.
- **Port to GNOME 50:** app and model level, out of scope. Speech Note and Dialect (Translate) exist.
- **Blockers / risks:** models, audio pipeline.
- **Linux equivalents today:** Dialect; Speech Note (offline speech-to-text and translation); Firefox's local
  translation.
- **Kiwi status:** none.
- **Recommendation:** **Skip.**

### F50. Messages: backgrounds, polls, screening and typing indicators
- **Introduced / changed:** Tahoe 26.0.
- **What it is:**
  - Per-conversation backgrounds (animated presets, photos, Image Playground); bubbles become glass over them.
  - Polls, typing indicators in groups, and unknown-sender screening and spam filtering.
  - A slide-over Details panel with tabs.
- **Caveats (on macOS):** animated backgrounds hurt legibility; poor sync from Mac to iPhone.
- **Port to GNOME 50:** app-level, out of scope.
- **Blockers / risks:** n/a.
- **Linux equivalents today:** Fractal, Signal, Telegram (all have chat backgrounds or polls in some form).
- **Kiwi status:** none.
- **Recommendation:** **Skip.**

### F51. Low-battery and accessory alerts in the menu bar
- **Introduced / changed:** Tahoe 26.0 ("Notifications for low battery and AirPods have been reduced to alerts in
  their menu bar items").
- **What it is:**
  - The low-battery alert is an iPhone-style card with a **red circular meter**. It starts at 10 % and repeats
    with each percentage drop; it can't be dismissed and can't be configured.
  - Accessory (AirPods) connection and battery alerts appear from their menu bar item instead of as
    notifications.
- **Caveats (on macOS):** repeats too often and can't be tuned (Ars).
- **Port to GNOME 50:** the notch (live activity) or the battery status item.
  - Watch UPower's display device (`Percentage`, `State`, `WarningLevel`) and Bluetooth `org.bluez.Battery1`.
  - Show a compact glass capsule with a ring meter (St `DrawingArea` or a Cairo-drawn ring, cheap) at 20 % /
    10 % / 5 % thresholds (configurable, unlike macOS).
  - Headphone connect shows "AirPods-style" capsule art (an icon, a name and a battery ring).
  - GNOME's own low-battery notification (gsd-power) still fires. Suppress its banner only if the user opts in,
    by filtering that source's banner in the notch.
- **Blockers / risks:** gsd-power's notification is outside the Shell's control (it is a notification, so it can
  be filtered, not prevented).
- **Linux equivalents today:** gsd-power notifications; Bluetooth Battery Meter extension.
- **Kiwi status:** partial (battery live activities are planned for the notch).
- **Recommendation:** **Port (P2), effort S**, inside notch v3.

### F52. Tahoe wallpapers and the clock on the screen saver
- **Introduced / changed:** Tahoe 26.0 (Lake Tahoe dynamic photo wallpaper in Day, Morning, Evening and Night;
  an abstract blue glass swirl in light and dark; 15 new aerial screen savers, including Goa, the Himalayas and
  Kerala).
- **What it is:** wallpapers that become moving screen savers and settle back. They change by time of day or
  appearance. The clock can show over the screen saver (F41).
- **Caveats (on macOS):** large downloads; Apple copyright.
- **Port to GNOME 50:** same as F16: original Kiwi wallpapers (an abstract "glass swirl" style fits faux glass),
  light/dark pairs or timed XML. GNOME has no screen saver beyond blanking.
- **Blockers / risks:** copyright; no screensaver framework in GNOME.
- **Linux equivalents today:** timed XML wallpapers; Hidamari.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort S** (with F16).

### F53. One-time codes from Messages and Mail, autofilled in any browser
- **Introduced / changed:** Sonoma for Safari; Tahoe 26.0 extends it to **any browser**, with optional automatic
  deletion after use.
- **What it is:** when an SMS or email with a verification code arrives, the code is offered by autofill in
  Chrome, Firefox and others, and the message can be auto-deleted.
- **Caveats (on macOS):** SMS 2FA is weak; it relies on Messages and Mail.
- **Port to GNOME 50:**
  - A notch or notification helper: when a notification body matches a code pattern ("code", "verification",
    "OTP" plus 4–8 digits, localised keywords), show a **Copy code** button on the banner or notch capsule.
  - Copy only on click (EGO: explicit user action; no auto-copy).
  - Works for GSConnect SMS, Thunderbird or Geary mail notifications, and messaging apps.
- **Blockers / risks:**
  - No autofill API into other apps on Wayland; copy is the honest version.
  - False positives; keep the matching conservative.
- **Linux equivalents today:** none in GNOME; KDE Connect shows SMS.
- **Kiwi status:** none.
- **Recommendation:** **Port (P2), effort S.** A small, delightful notch feature.

### F54. Magnifier, Accessibility Reader and Vehicle Motion Cues
- **Introduced / changed:** Tahoe 26.0 (also Braille Access).
- **What it is:**
  - **Magnifier:** a camera magnifier (Continuity Camera or USB) with filters and perspective correction, and
    text reading.
  - **Accessibility Reader:** a system-wide reading mode.
  - **Vehicle Motion Cues:** animated dots at the screen edges that follow vehicle motion, against motion
    sickness; customisable.
- **Caveats (on macOS):** Motion Cues is not captured in screenshots; niche.
- **Port to GNOME 50:**
  - Magnifier is an app (Snapshot plus GNOME's zoom).
  - Motion Cues needs motion sensors (iio-sensor-proxy exposes an accelerometer on some laptops, but a laptop in
    a car is not the use case).
  - Skip.
- **Blockers / risks:** hardware and sensors.
- **Linux equivalents today:** GNOME Zoom (a11y magnifier), Snapshot, Orca, Speech Dispatcher.
- **Kiwi status:** none.
- **Recommendation:** **Skip.**

### F55. Edge Light (macOS 26.2)
- **Introduced / changed:** Tahoe 26.2.
- **What it is:**
  - A video effect that uses the **display as a ring light** in low light: a bright soft frame around the screen
    edges during video calls.
  - The width and colour temperature can be changed.
  - It **recedes where the mouse is** so you can reach content under it.
  - It can turn on automatically in low light on 2024+ Macs.
- **Caveats (on macOS):** it covers screen edges; auto mode only on newer Macs.
- **Port to GNOME 50:** Shell extension.
  - A chrome actor over the whole monitor (`Main.layoutManager.addTopChrome` with no input region:
    `reactive: false`). It draws a thick white-to-warm border with an inner fade (St `box-shadow: inset`, or four
    gradient strips).
  - It dims locally under the pointer (track `global.get_pointer()` on a 60 ms timeout only while on).
  - **Trigger:** a manual Control Center tile. Automatic "camera in use" detection would need PipeWire node
    monitoring (no Shell API; a `pw-dump` subprocess is heavy), so manual first.
- **Blockers / risks:**
  - Full-screen overlay actors force compositing (fine) and must not take input.
  - Avoid it during fullscreen games.
- **Linux equivalents today:** none known.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort S.** A fun Control Center tile, cheap to build.

### F56. Other app changes (Terminal, Notes, Safari 26, Photos, FaceTime)
- **Introduced / changed:** Tahoe 26.0–26.4.
- **What it is:**
  - **Terminal:** "Clear Light/Dark" glass themes, 24-bit colour, Powerline glyphs, a 120×30 default.
  - **Notes:** Markdown import and export.
  - **Safari 26:** floating rounded tabs, WebGPU, HDR images, SVG favicons; compact tabs return in 26.4.
  - **Photos:** pinned Collections.
  - **FaceTime:** a Contact Posters landing page.
  - **Reminders:** AI auto-categorise.
  - **Clock:** snooze 1–15 min.
- **Caveats (on macOS):** Music and Photos moved controls to floating bottom pills (criticised).
- **Port to GNOME 50:** app-level, out of scope. Note for Kiwi: Ptyxis (Fedora's terminal) already supports
  transparency, which a user can pair with Kiwi.
- **Blockers / risks:** n/a.
- **Linux equivalents today:** Ptyxis, Apostrophe and Iotas (Markdown), Firefox.
- **Kiwi status:** none.
- **Recommendation:** **Skip.**

---

## 5. macOS 27 Golden Gate features

### F57. Liquid Glass refinements: darker edges, brighter speculars, uniform toolbars, edge-to-edge sidebars, active-window shadows
- **Introduced / changed:** Golden Gate 27.0 (announced June 2026; tuned through beta 6).
- **What it is:**
  - **Opacity:** raised overall, and it "diffuses complex content more effectively", so busy content behind is
    smoothed more.
  - **Edges and speculars:** a **darkened edge** and **brighter specular highlights** give depth and separation.
  - **Toolbars:** uniform, with legible headings and control groups.
  - **Sidebars:** **no longer floating**; edge-to-edge again, without the extra shadow, and with **coloured
    sidebar icons**.
  - **Active windows:** **window shadows** were changed so the active window is easier to identify.
  - **Icons:** more glass layers (sharper).
  - **HDR:** used "for depth and dimension" on capable displays.
  - **Corners:** one window corner radius (F24).
- **Caveats (on macOS):** fans of the clear WWDC 2025 look call it "frosted glass high/mid"; critics (Gruber)
  call it the right direction.
- **Port to GNOME 50:** these are cheap faux-glass tweaks Kiwi should adopt directly:
  - **Darkened edge:** a 1 px outer border at rgba(0,0,0,0.18) (light) / rgba(0,0,0,0.45) (dark) under the white
    inner rim. The pair reads as a glass edge.
  - **Brighter specular:** a top rim at 45–55 % white instead of 25–35 %, with a short, bright corner glint.
  - **Active window shadows:** Mutter draws shadows only for server-side decorated windows; GTK CSD apps draw
    their own. The Shell can't change shadows on GTK windows. Kiwi could **dim inactive windows** slightly (an
    opacity of 0.97 or a `Clutter.BrightnessContrastEffect` on `Meta.WindowActor`s that are not focused), off by
    default.
  - **HDR:** skip (GNOME 50 HDR is for content, not UI).
- **Blockers / risks:** dimming inactive windows costs an effect per window; skip it on fullscreen and video.
- **Linux equivalents today:** the Inactive Window Dimming extensions.
- **Kiwi status:** partial (faux glass layers).
- **Recommendation:** **Port (P1 core), effort S** for the edge and specular tokens; **Later (P3), effort S** for
  the inactive-window dimming.

### F58. Golden Gate wallpapers that animate on unlock
- **Introduced / changed:** Golden Gate (the same default wallpaper as iOS/iPadOS 27; beta 3 added Golden Gate
  Sunset and Night photos; beta 6 added more).
- **What it is:** wallpapers that **animate when the Mac unlocks** and can be used as screen savers.
- **Caveats (on macOS):** Apple copyright.
- **Port to GNOME 50:** the unlock moment is visible to the Shell (`Main.screenShield` `locked-changed`, or the
  session mode change). Kiwi could play a short **zoom-settle** on the background actors
  (`Main.layoutManager._backgroundGroup`, scale from 1.04 to 1 over 600 ms) after unlock. It is cheap and gives
  "the desktop comes alive" without video.
- **Blockers / risks:** the Kiwi extension is disabled while locked (no unlock-dialog session mode), so the
  re-enable after unlock is the hook. That also means the effect runs on every enable, so gate it on "came from
  the lock screen".
- **Linux equivalents today:** none.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort S.**

### F59. Aqua-like glass traffic lights
- **Introduced / changed:** Golden Gate beta 6 (August 2026) and shipping.
- **What it is:**
  - The close, minimise and zoom buttons move from flat colours (used since Yosemite) to **little glass beads**
    with top and bottom highlights, echoing Mac OS X 10.0–10.4 Aqua.
  - The selected control animates slightly (Jeff Nadeau's demo).
  - Hover still reveals the glyphs.
  - Critique (512 Pixels): too bright in dark mode, the least saturated stoplights ever, and background windows'
    buttons are too prominent ("should drop the highlights").
- **Caveats (on macOS):** brightness in dark mode; inactive windows look active.
- **Port to GNOME 50:** Kiwi's traffic lights (`apps/windowControls`, in the menu bar or app-buttons mode) are St
  buttons, so this is pure CSS.
  - **The bead:** a base colour, a `background-gradient` (vertical, lighter top to base), a small white top
    "catchlight" child (an ellipse via `border-radius`, 40 % white), a 1 px darker rim and an inner bottom glow.
  - **Inactive window:** flat grey, no highlights (fixing 512 Pixels' complaint).
  - **Hover:** shows the glyphs.
  - **Press:** scale 0.94 with a spring.
  - Offer "Flat (Tahoe)" or "Glass (Golden Gate)" styles.
- **Blockers / risks:** none.
- **Linux equivalents today:** GTK themes with macOS buttons (WhiteSur); Kiwi's dropped titlebutton CSS sets.
- **Kiwi status:** have (flat traffic lights).
- **Recommendation:** **Port (P1 core), effort S.**

### F60. Siri AI in Spotlight ("Search or Ask") and the Siri app
- **Introduced / changed:**
  - Golden Gate 27.0, English first.
  - Also available in the EU on the Mac.
  - Built on Apple Foundation Models developed with Google's Gemini technology, running on device, on Private
    Cloud Compute, and on Google Cloud.
  - ChatGPT can be chosen instead (right-click › Ask…).
- **What it is:**
  - **Search or Ask.** ⌘Space opens a field that decides whether the query is a search or a request for Siri.
    Siri answers in a small pill that expands, with follow-ups, a **+** for files and photos, and rich cards
    (weather, calendar).
  - **Context.** Siri sees the screen and personal data (Mail, Messages, Notes…) through a rebuilt semantic
    index, and acts in apps via App Actions.
  - **The Siri app** keeps conversation history and pins, synced across devices.
  - Spotlight's menu bar icon is removed for waitlisted users (beta 3).
  - The advanced voice model needs an M3 or later with 12 GB.
- **Caveats (on macOS):** beta, waitlist, English only; daily caps on heavy AI features; privacy concerns about
  screen and personal context; Apple's 2026 Full Disk Access changes respond to AI agents.
- **Port to GNOME 50:**
  - The **UI pattern** (one field that searches *or* asks) can be built into Kiwi Spotlight: a final "Ask…" row
    sends the query to an **optional** assistant helper (the F9 D-Bus helper, local model by default; any cloud
    provider only with explicit opt-in and a visible indicator). The answer appears in an expanding glass card
    under the field.
  - Personal-data and screen context are out of scope: no screen reading by default, ever.
- **Blockers / risks:**
  - EGO: no third-party data flows without explicit user action; no bundled binaries.
  - LLM quality and resources.
  - The scope: an assistant is not a desktop shell.
- **Linux equivalents today:** Newelle (has a GNOME Shell integration via an extension), Alpaca, GPT4All.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort L.** Ship only the "Ask" hook, and leave the backend to optional helpers.

### F61. Visual Intelligence on the Mac
- **Introduced / changed:** Golden Gate 27.0.
- **What it is:**
  - **Shift-Cmd-Space** (or Shift-Cmd-6, or the icon in the Shift-Cmd-5 screenshot bar) lets you drag a region
    of the screen.
  - Siri then explains it, translates, searches for similar images, identifies plants, landmarks and objects, or
    acts on it: adding a flyer's events to Calendar, a business card to Contacts, a barcode to Wallet, splitting
    a bill (US).
- **Caveats (on macOS):** AI accuracy; privacy; some features US-only.
- **Port to GNOME 50:**
  - **Capture:** `Main.screenshotUI` (or `Shell.Screenshot.screenshot_area`, in-process, async) gives the
    pixels.
  - **The realistic, non-AI part:** **OCR the region and copy the text** (Tesseract in a helper or via
    `Gio.Subprocess` if installed), plus "search the web for this text". Optionally pass the image to the
    assistant helper.
- **Blockers / risks:** OCR dependency; image analysis needs models; must be strictly user-triggered.
- **Linux equivalents today:** Frog (Text Grabber, GNOME Circle-style OCR app); Normcap; Google Lens through a
  browser.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort M** (OCR "copy text from region" only).

### F62. Write with Siri
- **Introduced / changed:** Golden Gate 27.0 (replaces the Writing Tools entry point).
- **What it is:**
  - Anywhere you type: draft from a description, get feedback ("how does this sound?"), or edit by describing
    the change.
  - It can match your personal style in Mail and Messages.
  - **Automatic proofreading** while typing.
  - Related: Apple Intelligence **suggests file and folder names** from their contents when saving in Finder and
    TextEdit.
- **Caveats (on macOS):** users ask how to turn the bubble off (MacRumors comments).
- **Port to GNOME 50:** see F9 (same helper and same PRIMARY-selection plus paste mechanism). There is no hook
  into other apps' save dialogs (the portal file chooser is out of process), so file-name suggestions are not
  possible.
- **Blockers / risks:** as F9.
- **Linux equivalents today:** as F9.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort XL** (merged with F9).

### F63. The Dock's background-process indicator
- **Introduced / changed:** Golden Gate 27.0.
- **What it is:**
  - If you quit an app and it still runs a background process, its Dock indicator turns **light grey**.
  - Right-clicking offers **Stop Running in Background**.
  - Dock context menus list background processes (Wikipedia).
- **Caveats (on macOS):** a subtle grey on light Docks.
- **Port to GNOME 50:** Kiwi dock.
  - GNOME already tracks background apps: `xdg-desktop-portal`'s **Background** portal, monitored by the Shell
    over D-Bus (`org.freedesktop.background.Monitor`, the `BackgroundApps` property). GNOME's Quick Settings
    "Background Apps" menu uses it.
  - Kiwi's dock can read the same property (async `Gio.DBusProxy`) and draw a grey dot for apps that have no
    windows but are listed.
  - "Stop running in background" calls the same quit action the Shell's menu uses (`app.request_quit()` or
    `Shell.App.request_quit`).
- **Blockers / risks:** only Flatpak or portal-aware apps report background state; host apps with tray icons are
  not listed.
- **Linux equivalents today:** GNOME Quick Settings › Background Apps (GNOME 44+).
- **Kiwi status:** none.
- **Recommendation:** **Port (P2), effort S.** Tiny, and it maps directly onto a GNOME API.

### F64. Better window restoration across external displays
- **Introduced / changed:** Golden Gate 27.0.
- **What it is:**
  - The Mac "restores window positions, spaces, and screen assignments" when a display is unplugged and
    reconnected.
  - More high-resolution and high-refresh modes (5K 120 Hz ultrawide).
- **Caveats (on macOS):** a long-standing pain point, only partly solved.
- **Port to GNOME 50:** Shell extension.
  - On `monitors-changed`, snapshot each window's frame and monitor, keyed by the **monitor configuration**
    (connector plus EDID serial via `global.backend.get_monitor_manager()`, or `Meta.MonitorManager` and
    `get_monitor_for_connector`, which is private-ish).
  - When the same configuration returns, move windows back (`move_to_monitor`, then `move_resize_frame`).
  - Keep the snapshots in memory for the session only.
- **Blockers / risks:**
  - Window identity across reconnects is fine (same `Meta.Window` objects), but monitor matching needs the
    connector and serial.
  - Mutter may itself move windows during the change; apply after an idle.
- **Linux equivalents today:** the "Remember window positions" style extensions; Mutter keeps some per-monitor
  state.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort M.** Valuable for laptop and dock users; not a visible macOS "look"
  feature.

### F65. The Show Borders accessibility option
- **Introduced / changed:** Golden Gate 27.0.
- **What it is:** an Accessibility option that **draws borders around interface elements**, so controls and panels
  stay distinct where translucent surfaces blend together. It is lighter than Increase Contrast.
- **Caveats (on macOS):** it is an admission that the glass blends too much.
- **Port to GNOME 50:** one CSS class on Kiwi's glass: `kiwi-glass-borders` adds a 1 px 35 %-contrast border to
  every glass surface and control (the "darkened edge" at full strength). A toggle in Appearance, independent of
  High Contrast.
- **Blockers / risks:** none.
- **Linux equivalents today:** GNOME high contrast (heavier).
- **Kiwi status:** none.
- **Recommendation:** **Port (P1 core), effort S.**

### F66. Extra-large desktop widgets and live-updating widgets
- **Introduced / changed:** Golden Gate 27.0 (desktop widgets themselves date from Sonoma).
- **What it is:**
  - Right-click a desktop widget › **Extra-Large Portrait** (weather, Home, Reminders).
  - Widgets now update in real time while their app is open.
- **Caveats (on macOS):** widgets cover the desktop; dimmed when windows are on top.
- **Port to GNOME 50:**
  - Desktop widgets belong in the Sonoma file. For Kiwi, the notch Widgets tab (overhaul plan §5.6) is the
    widget surface.
  - Big desktop widgets need a desktop layer (`Main.layoutManager._backgroundGroup` children, below windows),
    which is feasible (Desktop Widgets extensions do it).
- **Blockers / risks:** input on background-layer actors; keeping them below windows; multi-monitor.
- **Linux equivalents today:** Desktop Widgets (Desktop Clock), Conky.
- **Kiwi status:** none (notch widgets planned).
- **Recommendation:** **Later (P3), effort L.** Covered by the Sonoma research file's widget entry.

### F67. Touch: pull-to-refresh, the "dynamic interface" and the Dynamic Island MacBook Pro (reported)
- **Introduced / changed:**
  - Golden Gate 27.0: pull-to-refresh in Safari, Mail, News, Podcasts and Calendar; Sidecar touch input.
  - 27.2: touch gesture recognisers in Safari, Photos, Notes and Quick Look.
  - **Reported** for 28 October 2026: a 14-inch and 16-inch touchscreen OLED MacBook Pro with a **Dynamic Island
    instead of the notch**, with a touch-aware "dynamic interface" (Bloomberg via MacRumors).
- **What it is (as reported):**
  - Controls adapt to whether you last used touch or the trackpad.
  - Touching a button can open a menu around the finger.
  - The Dock and menu bar are optimised for touch.
  - The Dynamic Island replaces the notch cut-out.
- **Caveats (on macOS):** not yet announced; details may change.
- **Port to GNOME 50:**
  - **The Dynamic Island** directly validates Kiwi's notch v3 direction (hover to expand, live activities). When
    Apple ships it, update the notch spec with its real sizes and animations.
  - **Touch:** GNOME Shell already handles touch (Clutter touch events and gestures, `Clutter.*Gesture` on 49+).
    Kiwi's menu bar, dock and Control Center should have ≥ 32 px touch targets on touchscreens (larger padding
    when the last input was touch: watch `Clutter.Seat` / `global.stage` `captured-event` device type).
  - Pull-to-refresh is app-level; skip.
- **Blockers / risks:** the Apple hardware is unannounced; no touch test hardware in Kiwi's test environment (it
  has a virtual mouse and keyboard only).
- **Linux equivalents today:** GNOME's touch support; Phosh.
- **Kiwi status:** partial (the notch exists; Dynamic Island behaviour is planned in P5).
- **Recommendation:**
  - Dynamic Island alignment of the notch: **Port (P2), effort S.**
  - Touch-adaptive sizing: **Later (P3), effort M.**

### F68. Shortcuts from natural language, and new automation triggers
- **Introduced / changed:** Golden Gate 27.0 ("Describe a Shortcut", in beta; triggers for screenshot taken and
  notification received).
- **What it is:**
  - Clicking New Shortcut opens a text box. Describe the automation ("every morning, show my first meeting,
    weather and reminders") and Apple Intelligence assembles the actions.
  - Test it, then refine it with "Describe a change".
  - New triggers: **taking a screenshot**, **receiving a notification**.
- **Caveats (on macOS):** beta; often needs manual fixes.
- **Port to GNOME 50:** see F46. The two new triggers are both visible to the Shell (the screenshot UI's
  `screenshot-taken` signal; notifications in the message tray), so a Kiwi "Automations" feature could include
  them. The natural-language authoring is out of scope.
- **Blockers / risks:** as F46.
- **Linux equivalents today:** as F46.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort L** (with F46).

---

## 6. Faux Liquid Glass cookbook (no blur)

How each Liquid Glass trait maps to St CSS and actors that Kiwi can draw today (GNOME 50, no shaders, no blur). It
belongs in `lib/glass.js` and the `apple-design` skill's tokens; the entries above refer to it.

| Liquid Glass trait (Apple) | Faux version in Kiwi (St) | Notes |
|---|---|---|
| Blurred, luminosity-adjusted backdrop ("regular") | Opaque-ish tint: light `rgba(246,246,248,0.78)`, dark `rgba(36,36,40,0.74)`; optional 2–3 % noise PNG as `background-image` | Higher alpha than real glass, since nothing hides the backdrop's detail. Kiwi's tint slider maps here (F31). |
| "Clear" variant over media | Light `rgba(255,255,255,0.32)` / dark `rgba(20,20,24,0.36)`; add the HIG's **35 % black dimming layer** when what is behind is bright (sample luminance) | Dock, app switcher, notch over video, Control Center (Apple uses the glassier style there). |
| Lensing at the edges | Inset ring: `box-shadow: inset 0 0 0 1px rgba(255,255,255,0.16)` plus an inner child with a 6–10 px inner gradient band (lighter at the rim) | St draws one `box-shadow` per actor, so use a wrapper (outer shadow) plus an inner child (inset ring), as `liquid-glass.md` §3 says. |
| Specular highlight | A 1 px top rim at 35–55 % white (brighter in Golden Gate, F57) + a top-to-30 % vertical gradient from `rgba(255,255,255,0.22)` to 0 + an optional radial corner glint | Static. Apple's moves with the device; the Mac's barely does. |
| Darkened edge (27) | A 1 px outer border `rgba(0,0,0,0.18)` (light) / `0.45` (dark) | Pairs with the white inner rim; with "Show Borders" (F65) make it 35 % contrast. |
| Adaptive tint from content | Mix 5–10 % of the wallpaper's average colour (async GdkPixbuf sample at 32×32) into the fill; re-sample on wallpaper change | "Wallpaper tinting", which macOS has done since Yosemite; Reduce Transparency turns it off. |
| Light and dark adaptation | Follow `org.gnome.desktop.interface color-scheme`; for the menu bar, also flip text by the sampled wallpaper luminance (F20) | WCAG relative luminance; hysteresis to avoid flicker. |
| Adaptive shadow | Outer `box-shadow: 0 10px 30px rgba(0,0,0,0.22)` (light) / `0.45` (dark); stronger for popovers than for bars | Keep shadows off the menu bar unless "Show background" is on. |
| Scroll-edge effect | `St.ScrollView` `-st-vfade-offset: 24px` (soft) or a hard 1 px divider line plus a solid band (hard) | Spotlight lists, the Control Center, the clipboard. |
| Concentric corners | Inner radius = outer − padding (tokens in `apple-design`); one window radius (F24) | Golden Gate's lesson: one consistent radius. |
| Grouped controls | A shared capsule actor behind related buttons | Toolbars in Kiwi popovers. |
| Interactive lens (slider knob, toggle) | On press or drag: knob width ×1.3 + switch to the "clear" fill + a brighter rim, springing back (F19) | Animate transform and opacity only. |
| Morphing popovers | Scale 0.92→1 from the source button's pivot + opacity; spring overshoot (`EASE_OUT_BACK`) | Reduced motion: a 150 ms fade only. |
| Reduce Transparency | Every glass class → opaque fill, the rim kept as a border, wallpaper tint off, the menu bar gets a background | One switch in `lib/glass.js`; per-surface overrides (`liquid-glass-surfaces`). |
| Increase Contrast / High Contrast | Solid fills, 1 px 60 % borders, no gradients, a stronger focus ring; follow `org.gnome.desktop.a11y.interface high-contrast` | Mirrors macOS (it also implies Reduce Transparency). |
| Clear ↔ Tinted (26.1 / 27 slider) | One slider mapped to fill alpha (about 35 %–85 %) and rim strength; greyed out under Reduce Transparency or High Contrast | Matches Apple's behaviour (F31). |

Real blur stays a possible GNOME 51 extra (`global.compositor.set_background_blur_params()`, Shell surfaces only),
never a requirement.

---

## 7. Summary table

Effort: S (days), M (one to two weeks), L (several weeks), XL (out of proportion, or a separate project).

| # | Feature | Release | Recommendation | Effort | Main blocker |
|---|---|---|---|---|---|
| F1 | Window tiling: edge, corner and menu-bar drag, ⌥-drag | 15.0 | Port (P1 core) | L | Mutter tiling is not introspected; must disable and restore `edge-tiling` |
| F2 | Green-button tile menu, Window › Move & Resize | 15.0 | Port (P1 core) | M | Works only on Kiwi's own buttons, not in-app CSD buttons |
| F3 | Tiling keyboard shortcuts and arrangements | 15.0 | Port (P1 core) | S | Shortcut clashes with user bindings |
| F4 | Tiled margins and linked divider resize | 15.0 | Port (P2) | M | Resize feedback loops; async Wayland resizes |
| F5 | iPhone Mirroring | 15.0 / 27 | Skip | XL | Closed, attested Apple protocol |
| F6 | iPhone notifications on Mac | 15.0 | Later (P3) | S | Apple-only; GSConnect is Android-only |
| F7 | Passwords app | 15.0 / 26 | Skip | L | Security; not a Shell feature |
| F8 | Presenter preview, video backgrounds | 15.0 / 15.2 | Skip | L | Portal picker is out of process |
| F9 | Writing Tools | 15.1 / 15.2 | Later (P3) | XL | No text-field API on Wayland; needs an LLM helper; EGO data rules |
| F10 | Notification summaries, Reduce Interruptions | 15.1 / 26 | Port (P2) grouping + DND allow-list; Later (P3) LLM | M | LLM helper for real summaries |
| F11 | New Siri look, Type to Siri, ChatGPT | 15.1 / 15.2 | Skip | XL | No assistant backend |
| F12 | Image Playground, Genmoji | 15.2 / 15.3 / 26 / 27 | Skip | XL | Image models; not a desktop feature |
| F13 | Math Notes, Calculator | 15.0 | Later (P3) (Spotlight calculator history) | S | none |
| F14 | Safari Highlights, Reader, Viewer, Distraction Control | 15.0 | Skip | L | Browser feature |
| F15 | Weather in the menu bar | 15.2 | Port (P3) | S | Needs GNOME Weather location; private `misc/weather.js` |
| F16 | Sequoia wallpapers | 15.0 | Later (P3) (original Kiwi wallpapers) | S | Apple copyright |
| F17 | System Settings reorganisation | 15.0 / 26 | Port (P1 core) (prefs naming) | S | none |
| F18 | Liquid Glass material | 26.0 / 27 | Port (P1 core) | M | No blur (by choice); app windows untouchable |
| F19 | Liquid motion: morphing, springs | 26.0 / 27 | Port (P2) | M | Per-frame JS cost |
| F20 | Transparent menu bar, adaptive text | 26.0 | Port (P1 core) | M | Async wallpaper sampling; window-proximity tracking |
| F21 | Glass Dock and app switcher | 26.0 | Port (P1 core) | S | Depends on Kiwi's dock |
| F22 | Glass sidebars and toolbars; scroll-edge effects | 26.0 / 27 | Port (P1 core) scroll fades; Skip app chrome | S | App chrome is out of process |
| F23 | Redesigned controls | 26.0 | Port (P1 core) | S | `ui/slider.js` draws from limited CSS |
| F24 | Window corner radius changes | 26.0 / 27 | Port (P1 core) (one radius) | S | GPU cost per window |
| F25 | Glass icons, squircle "icon jail" | 26.0 / 27 | Later (P3) | M | Fights GNOME icon shapes; disliked |
| F26 | Icon and widget styles: dark, clear, tinted | 26.0 | Port (P2) | M | Only on Kiwi-drawn icons; effect cost |
| F27 | Folder colours, emoji, symbols; theme colours | 26.0 | Later (P3) folders; Port (P1 core) accent | M | Files draws folders; user-metadata rule |
| F28 | Icons in menus (and the 27 rollback) | 26.0 / 27 | Port (P1 core) (design rule) | S | none |
| F29 | Left-aligned dialogs, pop-up power dialog | 26.0 | Port (P2) | S | Private end-session dialog |
| F30 | Reduce Transparency and Increase Contrast | 26.0 / 26.1 | Port (P1 core) | S | GNOME has no reduce-transparency key (Kiwi-only) |
| F31 | Liquid Glass Clear/Tinted, then slider | 26.1 / 27 | Port (P1 core) | S | none |
| F32 | Spotlight ranking, filters, tab-scope, site search | 26.0 | Port (P2) | M | LocalSearch availability |
| F33 | Spotlight browse views; Apps replaces Launchpad | 26.0 / 26.1 | Port (P2) | M | Recents without Gtk; two app grids |
| F34 | Spotlight Actions and Quick Keys | 26.0 | Port (P2) | M | No intents framework; `.desktop` actions only |
| F35 | Spotlight clipboard history | 26.0 | Port (P1 core) | S | EGO clipboard rules |
| F36 | Spotlight menu-item search and history | 26.0 | Port (P1 core) history; Port (P2) menu items | M | App menus sparse in libadwaita |
| F37 | Customisable Control Center gallery | 26.0 | Port (P2) | L | Private Quick Settings internals |
| F38 | Multiple Control Center panels | 26.0 | Later (P3) | M | Menu bar width |
| F39 | Controls pinned to the menu bar | 26.0 | Port (P2) | M | Panel space, overflow |
| F40 | Volume and brightness OSD from the menu bar | 26.0 / 27.2 | Port (P2) | S | Private `osdWindow.js` |
| F41 | Lock screen clock customisation | 26.0 | Later (P3) | M | Needs the unlock-dialog session mode |
| F42 | Cursor redesign, glove cursor | 26.0 / 27 | Skip (installer may offer one) | S | Changes user settings; art copyright |
| F43 | Menu Bar settings: hide or reorder any item | 26.0 | Port (P2) | M | Other extensions re-adding items |
| F44 | Phone app | 26.0 / 27 | Skip | XL | Apple Continuity; telephony |
| F45 | Live Activities in the menu bar | 26.0 | Port (P2) (in the notch) | M | No live-activity protocol on Linux |
| F46 | Shortcuts automations | 26.0 | Later (P3) | L | Running commands is an EGO red flag |
| F47 | Games app and Game Overlay | 26.0 / 26.2 | Skip | L | Unredirected fullscreen games |
| F48 | Journal | 26.0 | Skip | — | App |
| F49 | Live Translation | 26.0 | Skip | — | Models |
| F50 | Messages backgrounds, polls, screening | 26.0 | Skip | — | App |
| F51 | Low-battery and accessory alerts from the menu bar | 26.0 | Port (P2) | S | gsd-power notification duplicates |
| F52 | Tahoe wallpapers and aerial screen savers | 26.0 | Later (P3) | S | Copyright; no GNOME screen saver |
| F53 | Verification-code copy from notifications | 26.0 | Port (P2) | S | No autofill API; false positives |
| F54 | Magnifier, Accessibility Reader, Motion Cues | 26.0 | Skip | — | Sensors and apps |
| F55 | Edge Light | 26.2 | Later (P3) | S | No camera-in-use API |
| F56 | Other app updates (Terminal, Notes, Safari) | 26.x | Skip | — | Apps |
| F57 | Glass refinements: edges, speculars, shadows | 27.0 | Port (P1 core) tokens; Later (P3) inactive dimming | S | Can't change GTK CSD shadows |
| F58 | Wallpapers animate on unlock | 27.0 | Later (P3) | S | Extension is off while locked |
| F59 | Aqua-like glass traffic lights | 27.0 | Port (P1 core) | S | none |
| F60 | Siri AI "Search or Ask" and the Siri app | 27.0 | Later (P3) ("Ask" hook only) | L | LLM backend; EGO data rules |
| F61 | Visual Intelligence | 27.0 | Later (P3) (OCR region) | M | OCR dependency |
| F62 | Write with Siri, AI file names | 27.0 | Later (P3) (with F9) | XL | As F9; no save-dialog hook |
| F63 | Dock background-process indicator | 27.0 | Port (P2) | S | Only portal-aware apps report |
| F64 | Window restoration across displays | 27.0 | Later (P3) | M | Monitor identity matching |
| F65 | Show Borders | 27.0 | Port (P1 core) | S | none |
| F66 | Extra-large and live widgets | 27.0 | Later (P3) | L | Desktop-layer actors |
| F67 | Touch interface and Dynamic Island MacBook (reported) | 27.0 / 27.2 | Port (P2) notch alignment; Later (P3) touch sizing | M | Unannounced hardware; no touch test rig |
| F68 | Shortcuts from natural language; new triggers | 27.0 | Later (P3) (with F46) | L | As F46 |

**Count:** 68 features. By headline recommendation (the first one listed when an entry splits): Port (P1 core) 18,
Port (P2) 17, Port (P3) or Later (P3) 19, Skip 14.

---

## 8. Top port candidates and main blockers

**Top 8 port candidates** (value to the macOS feel ÷ effort, building on what Kiwi has):
1. **Window tiling** (F1–F4): edge, corner and menu-bar drag with a glass preview, Ctrl-drag for instant zones,
   the green-button menu, Super+Ctrl shortcuts, margins. Kiwi's `windowTiling.js` engine already exists. P1, L.
2. **The faux Liquid Glass system** (F18, F30, F31, F57, F65, §6): regular and clear variants, the rim, the dark
   edge, speculars, scroll-edge fades, one Clear↔Tinted slider, Reduce Transparency, High Contrast, Show
   Borders, per-surface control. P1, M.
3. **The transparent menu bar with adaptive text** (F20): the most visible Tahoe trait; solid when a window
   touches the top. P1, M.
4. **Spotlight browse views, actions, quick keys, clipboard and history** (F32–F36): one Apps view shared with
   Launchpad; `.desktop` actions and Kiwi actions; clipboard tab. P1/P2, M each.
5. **Customisable Control Center with controls in the menu bar** (F37, F39, F43): gallery, sizes, Kiwi controls
   (Tile, Stage Manager, Glass, Edge Light), pinning and hiding menu bar items. P2, L.
6. **Live activities in the notch** (F45, F51, F53, F67): compact capsules for battery, timers, recording,
   headphones, downloads, plus "Copy code" for one-time codes. It aligns with the reported Dynamic Island Mac.
   P2, M.
7. **Volume and brightness OSD under the menu bar** (F40) and **glass traffic lights** (F59): small, very visible.
   P2 and P1, S.
8. **Icon styles on Kiwi's surfaces** (F26) and the **Dock background-app indicator** (F63): Dark and Tinted
   icons with stock Clutter effects; grey dots from the Background portal. P2, M and S.

**Notable blockers:**
- **Wayland process separation:**
  - the Shell can't restyle or glass app windows, sidebars or toolbars (F22);
  - it can't change GTK CSD shadows (F57);
  - it can't reach into text fields (F9, F62) or the portal screen-share picker (F8).
- **No real blur** by owner decision. Faux glass needs higher opacity, and the cookbook (§6) compensates. GNOME 51
  blur is a possible extra for Shell surfaces only.
- **Mutter's tiling is not introspected** (`meta_window_tile`), so Kiwi tiles are plain resizes. Kiwi must manage
  tile groups itself and switch Mutter's `edge-tiling` off and on symmetrically.
- **Apple-only services:** iPhone Mirroring, the Phone app, iPhone Live Activities and notifications, Passwords
  sync, Siri and Apple Intelligence (F5–F7, F11, F44). Android has partial stand-ins (scrcpy, GSConnect).
- **AI features** need an optional, separately packaged local-model helper. EGO forbids bundled binaries and data
  sent to third parties without explicit action (F9, F10, F60–F62).
- **Private Shell internals** used by F37, F40, F43 (`quickSettings._grid`, `osdWindow.js`, `panel._rightBox`)
  must be wrapped and checked on each GNOME bump.
- **The session-modes decision:** lock-screen features (F41, F58) need `unlock-dialog`, which changes Kiwi's whole
  lifecycle.
- **User-file rule:** folder icons (F27), wallpapers (F16, F52) and cursor themes (F42) touch user data or
  settings. They must be opt-in, tracked and fully reversible (CLAUDE.md).

---

## 9. Sources

**Apple**
- Apple Newsroom: "macOS Sequoia takes productivity and intelligence on Mac to new heights" (June 2024): https://www.apple.com/newsroom/2024/06/macos-sequoia-takes-productivity-and-intelligence-on-mac-to-new-heights/
- Apple Newsroom: "macOS Tahoe 26 makes the Mac more capable, productive, and intelligent than ever" (June 2025): https://www.apple.com/newsroom/2025/06/macos-tahoe-26-makes-the-mac-more-capable-productive-and-intelligent-than-ever/
- Apple Newsroom: "Apple introduces a delightful and elegant new software design" (Liquid Glass, June 2025): https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/
- Apple Support: "Mac window tiling icons & keyboard shortcuts": https://support.apple.com/guide/mac-help/tile-app-windows-mchl9674d0b0/mac
- Apple Support: "Tile windows on Mac": https://support.apple.com/guide/mac-help/tile-windows-mchlef287e5d/mac
- Apple Support: "What's new in the updates for macOS Sequoia 15": https://support.apple.com/en-us/120283
- Apple Support: "What's new in the updates for macOS Tahoe 26": https://support.apple.com/en-us/122868
- Apple Human Interface Guidelines, Materials (Liquid Glass regular and clear, dimming layer): https://developer.apple.com/design/human-interface-guidelines/materials
- Apple HIG, The menu bar: https://developer.apple.com/design/human-interface-guidelines/the-menu-bar
- Apple HIG, App icons (layers; default, dark, clear, tinted): https://developer.apple.com/design/human-interface-guidelines/app-icons

**Reviews and analysis**
- Ars Technica, "macOS 15 Sequoia: The Ars Technica review" (Andrew Cunningham, 2024): https://arstechnica.com/gadgets/2024/09/macos-15-sequoia-the-ars-technica-review/
- Ars Technica, "macOS 26 Tahoe: The Ars Technica review" (2025): https://arstechnica.com/gadgets/2025/09/macos-26-tahoe-the-ars-technica-review/
- MacStories, "macOS 26 Tahoe: The MacStories Review" (design, p. 2; system features, p. 3): https://www.macstories.net/stories/macos-26-tahoe-the-macstories-review/2 and https://www.macstories.net/stories/macos-26-tahoe-the-macstories-review/3
- The Eclectic Light Company, "Appearance revisited: Get Tahoe 26.1 looking in better shape": https://eclecticlight.co/2025/11/05/appearance-revisited-get-tahoe-26-1-looking-in-better-shape/
- 9to5Mac, "macOS 26 windows are hard to resize because they aren't really rounded" (Jan 2026): https://9to5mac.com/2026/01/13/macos-26-windows-are-hard-to-resize-because-they-arent-really-rounded/
- MacMost, "New Small And Hidden Features In macOS Tahoe": https://macmost.com/new-small-and-hidden-features-in-macos-tahoe.html
- TidBITS, "How to Tame Sequoia's Window Tiling": https://tidbits.com/2024/11/08/how-to-tame-sequoias-window-tiling/
- MacRumors, "Apple Releases macOS Tahoe 26.1 With New Liquid Glass Setting": https://www.macrumors.com/2025/11/03/apple-releases-macos-tahoe-26-1/
- MacRumors, "macOS Golden Gate: Everything We Know" (roundup): https://www.macrumors.com/roundup/macos-27/
- MacRumors, "All the Liquid Glass Changes in macOS Golden Gate" (June 2026): https://macrumors.com/2026/06/09/macos-golden-gate-liquid-glass/
- MacRumors, "50 New macOS Golden Gate Features and Changes Worth Checking Out" (Sept 2026): https://www.macrumors.com/2026/09/17/new-features-changes-macos-27/
- MacRumors, "macOS 27.2 Adds Touch Gestures Ahead of MacBook Ultra" (Oct 2026): https://www.macrumors.com/2026/10/05/macos-27-2-touch-gestures/
- MacRumors, "Apple Reportedly Announcing New MacBook Pro With OLED Touchscreen on Wednesday" (25 Oct 2026): https://www.macrumors.com/2026/10/25/macbook-pro-with-touchscreen-on-wednesday/
- 512 Pixels, "Golden Gate Beta 6 Turns Stoplights into Liquid Glass" (Aug 2026): https://512pixels.net/2026/08/golden-gate-beta-6-stoplights-liquid-glass/
- Daring Fireball, "Nature Is Healing: macOS 27 Golden Gate Beta 6 Adds Redesigned Traffic Light Window Controls": https://daringfireball.net/linked/2026/08/18/golden-gate-27-window-controls

**Release histories**
- Wikipedia, macOS Sequoia: https://en.wikipedia.org/wiki/MacOS_Sequoia
- Wikipedia, macOS Tahoe: https://en.wikipedia.org/wiki/MacOS_Tahoe
- Wikipedia, macOS Golden Gate: https://en.wikipedia.org/wiki/MacOS_Golden_Gate

**Kiwi and GNOME context (in repo)**
- `docs/architecture/overhaul-plan.md`, `docs/architecture/code-map.md`, `docs/features/liquid-glass.md`,
  `docs/features/spotlight.md`, `docs/features/control-center.md`, `apps/windowTiling.js`
- `.claude/skills/gnome-shell-extension/SKILL.md` (EGO rules, version landmines 48–51)
