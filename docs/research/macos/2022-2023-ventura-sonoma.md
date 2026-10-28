# macOS 13 Ventura (2022) and macOS 14 Sonoma (2023): feature research for Kiwi

Scope: the user-facing desktop and system features of Ventura and Sonoma, plus the bundled-app
changes that shape the desktop. Each feature uses the template in `README.md`. Stage Manager and
desktop widgets get the most depth, because Kiwi is rebuilding Stage Manager (overhaul plan §5.5,
phase P4) and widgets are a natural extension of the notch and the calendar card.

Target for every "Port" judgement: **GNOME Shell 50 on Fedora 44, Wayland only** (Mutter has no X11
session any more; Xwayland still runs X11 apps). APIs named below were checked against the GNOME
Shell 50 sources where it mattered (`js/ui/layout.js`, `backgroundMenu.js`, `misc/inputMethod.js`,
`ibusCandidatePopup.js`, `misc/weather.js`, `dateMenu.js`, `status/camera.js`,
`status/backgroundApps.js`, `shellEntry.js`). Private Shell members (`_foo`) are marked as such:
they can change in any release.

Kiwi status words: **have** (shipping code in `apps/`), **partial** (some of it ships or a spec
exists), **none**.

---

## Release overviews

### macOS 13 Ventura
- **Announced** at WWDC on 6 June 2022, **released** 24 October 2022. Supports 2017 and later Macs.
  Point releases ran to 13.7.x in 2024.
- **Headline desktop features:**
  - **Stage Manager**: an optional window manager mode with a "stage" and a strip of recent apps.
    It is off by default.
  - **System Settings** replaces System Preferences, with an iOS-style sidebar written in SwiftUI.
    First-party apps rename "Preferences…" to "Settings…".
  - **Continuity Camera**: an iPhone as the webcam, with Desk View, Center Stage, Portrait and
    Studio Light.
  - **Spotlight** gets a new design, Quick Look on results, image search with Live Text, rich
    results and Quick Actions.
- **Apps and services:**
  - **Passkeys** in Safari 16 and apps, synced by iCloud Keychain.
  - **Mail**: undo send, scheduled send, remind me, follow-up suggestions, missing-attachment
    warnings and better search.
  - **Messages**: edit and unsend.
  - **New apps:** Weather and Clock arrive as Catalyst ports of the iPad apps. **Freeform**
    shipped later, in 13.1 (December 2022).
- **Accessibility:** Live Captions (beta, Apple silicon, US/Canada English) and Type to Speak.
- **Security:** Lockdown Mode, Rapid Security Response (the first one arrived in 13.3.1), USB-C
  accessory approval prompts, Launch Constraints, and a stricter Gatekeeper. A background-items
  notification also lands, plus a new Login Items list.
- **Other UI redesigns:** the Share sheet, the Print dialog, About This Mac, Font Book and Siri.
  The "Desktop & Dock" settings page now holds Stage Manager.
- **Reception.** Reviewers called Stage Manager "surprisingly good on the Mac" but "too laborious
  to set up". They found System Settings divisive: it reorganises everything, swaps checkboxes for
  switches, hides settings behind "i" buttons, and is less keyboard-navigable (Ars Technica,
  MacStories).

### macOS 14 Sonoma
- **Announced** at WWDC on 5 June 2023, **released** 26 September 2023. It drops the 2017 Macs.
- **Headline desktop features:**
  - **Desktop widgets.** Interactive WidgetKit widgets can sit on the desktop as well as in
    Notification Center. iPhone widgets come over through Continuity. The widgets dim to
    monochrome while windows are in front.
  - **"Click wallpaper to reveal desktop"** is on by default and moves all windows aside.
  - **Aerial screen savers** (Apple TV slow-motion videos) double as wallpapers that stop moving
    after login.
  - **Redesigned lock and login screen:** a large clock, the login field at the bottom, and the
    user's wallpaper or aerial as the background.
  - **Text-cursor indicators** for Caps Lock, the input source and dictation.
- **Apps and services:**
  - **Safari 17:** profiles, **web apps in the Dock**, and locked private windows.
  - **Video conferencing:** Presenter Overlay, Reactions triggered by gestures, a Video menu-bar
    item, and window sharing from the green button.
  - **Game Mode** and the Game Porting Toolkit.
  - **PDF AutoFill** in Preview (enhanced in 14.2).
  - **Shared password and passkey groups**, and one-time codes from Mail autofilled in Safari.
- **Smaller changes:** autocorrect and inline predictions, Personal Voice and Live Speech, pausing
  animated images, and a high-performance Screen Sharing app.
  - System Settings reshuffles again: "Automatically hide and show the menu bar" moves to Control
    Center settings with four choices.
- **Reception.** Widgets were "a better stab than the last couple of tries". Reviewers called the
  click-to-reveal-desktop default "disorienting", and many guides told users how to turn it off.
  The aerials were "the coolest-looking thing in Sonoma" but use a lot of disk and GPU.
  - More features now need Apple silicon: Presenter Overlay, Game Mode, and high-performance
    screen sharing.

---

## Ventura features

### Stage Manager: the stage and the strip (core model)
- **Introduced / changed:** Ventura 13.0 (new). Sonoma 14 regrouped its settings (see "Desktop
  items, widgets and wallpaper clicks in Stage Manager"). Sequoia and later are covered in the
  2024+ file.
- **What it is:**
  - **Turning it on.** Stage Manager is an optional mode, **off by default**. The user turns it on
    from the Stage Manager tile in Control Center, or in System Settings → Desktop & Dock →
    Desktop & Stage Manager. It needs "Displays have separate Spaces" on, and greys out without it.
  - **The stage.** The front app's windows (or a user-built *set* of windows from several apps)
    sit in the middle of the screen. Up to ~4–6 other recent apps or sets appear as small, tilted,
    **live-updating** thumbnails in a column at the left edge: the *strip*, which Howard Oakley
    calls the "Cast".
    - The number of entries depends on the screen: 4 on a 13" MacBook Air, 6 on a Studio Display.
    - The strip moves to the right edge when the Dock is on the left.
  - **Windows behave as they always do.** Inside a stage they keep the sizes and positions the user
    gave them; they may overlap and may cover the strip. Stage Manager imposes no layout, unlike
    iPadOS.
  - **Switching.** Clicking a strip entry puts it on the stage. The previous stage flies into the
    slot the new one left, so slots swap in place instead of reshuffling. Opening or activating an
    app from the Dock, Launchpad, Spotlight or ⌘-Tab does the same: the app takes the stage, and
    the whole previous stage goes to the strip as one entry.
  - **No empty stage in Ventura.** The only way to clear the stage is to click the wallpaper, which
    sends everything to the strip and shows the desktop.
  - **Scope.** Each display has its own stage and strip, and so does each Space. Full-screen apps
    and Split View stay in their own Spaces and never appear in the strip.
- **Caveats (on macOS):**
  - The "Stage Manager dance" (MacStories): to put a new app next to the current one you must open
    it, which sends the current work to the strip, and then drag or Shift-click it back.
  - Apps that open with an Open dialog (Pages, Numbers, Keynote) make the old stage flash back for
    a moment, because the stage is briefly empty when the dialog closes.
  - Apps assigned to "All Desktops" never appear in the strip.
  - Animations are fast but feel repetitive. Reduce Motion is the only way to calm them.
  - Users did not want Stage Manager to replace Spaces, and it has no keyboard model (see the
    controls section).
- **Port to GNOME 50:**
  - **A Shell extension, which Kiwi already has in round-2 form** (`apps/stageManager/`: model,
    strip, windowHider, flight, dropTarget). The v3 rebuild (overhaul §5.5) puts one pure state
    machine in `features/stageManager/model.js` and has it consume `core/desktop.js`.
  - **Hiding non-stage windows.** Use their `Meta.WindowActor` (`win.get_compositor_private()`):
    translate or hide the actor and mark it non-reactive. **Never call `minimize()`**, so apps keep
    running and `notify::minimized` consumers are not fooled. Track window state in
    `core/desktop.js`'s registry (`staged`).
  - **Live thumbnails** are `Clutter.Clone`s of the window actors. Mutter keeps sending frame
    callbacks to a surface that has mapped clones; that is how the overview's window previews stay
    live.
  - **The strip** is one container added with `Main.layoutManager.addChrome()` per monitor, with
    no strut (macOS does not reserve the strip either). `core/layout.js` only uses its rect to
    place new windows and to decide when the strip "steps aside".
  - **Per-workspace and per-monitor state:** `global.workspace_manager`
    (`active-workspace-changed`) and `Main.layoutManager.monitors`, plus `win.get_monitor()` and
    `window-entered-monitor`.
  - **Detecting a stage switch.** Read `global.display` `notify::focus-window`. A window that gets
    focus outside the current stage (from Super+Tab, the dock or a notification) brings its whole
    set onto the stage.
- **Blockers / risks:**
  - Mutter 50 has no public tiling API, so side-by-side layouts use `move_resize_frame`.
  - Wayland apps choose their own sizes: there are minimum sizes, and some windows refuse to
    resize.
  - **Transients and portal dialogs.** GTK file choosers belong to `xdg-desktop-portal-gnome`, a
    different app; they are parented through xdg-foreign, so use `get_transient_for()`. Without
    that they would open a new stage, which is exactly macOS's Open-dialog flash.
  - New windows must be placed after `Meta.WindowActor::first-frame`, not in `window-created`.
  - Keyboard focus can stay on a hidden window unless Kiwi moves it.
  - DING (Desktop Icons NG) draws a DESKTOP-type window that must be excluded.
  - Conflicts with minimize-to-dock and with fullscreen isolation are listed in
    `tech-debt-and-conflicts.md` §1.6.
- **Linux equivalents today:**
  - None that copy Stage Manager on GNOME. The closest ideas are KDE Activities, GNOME workspaces,
    PaperWM / Tiling Shell (layouts) and "Window Thumbnails"-style extensions.
- **Kiwi status:** partial. Round 2 ships sets, the strip, wallpaper click and per-workspace
  strips; v3 is a rebuild.
- **Recommendation:** **Port (P1 core), effort XL.** It is the owner's must-have. Build it on
  `core/desktop.js` and `core/layout.js` so the dock, switcher and Mission Control agree with it.

### Stage Manager: the recent-apps strip (thumbnails, piles, reveal)
- **Introduced / changed:** Ventura 13.0.
- **What it is:**
  - **Look.** Each strip entry is a small 3D-tilted live thumbnail of a stage, badged with the app
    icon (one badge per app in a set). Several windows of one app are stacked into a *pile*.
  - **Clicking.** A click on the thumbnail switches to that stage. A click on the small **app icon
    badge** instead spreads all of that app's windows out beside the strip, including windows that
    belong to other sets. You can then pick or drag one; clicking the desktop collapses them again.
    Users find this click-target split confusing (Tao of Mac: "maddening").
  - **Getting out of the way.** When a stage window is dragged over the strip, the strip slides
    off-screen. Moving the pointer to the left edge brings it back for a moment.
  - **"Show recent apps in Stage Manager" off:** the strip stays hidden until the pointer reaches
    the edge.
  - **Minimize** sends the window into its set's strip entry, not into the Dock. The order is
    remembered, so the windows come back out in sequence.
  - **Mission Control** slides the strip entries up into the spread along with every other window.
- **Caveats (on macOS):**
  - The count depends on the display and cannot be changed (4–6). Older stages beyond that still
    exist but are reachable only through ⌘-Tab, the Dock or Mission Control.
  - Piles are hard to see in dark mode.
  - With the strip on the left, the Dock really has to be at the bottom.
  - Because minimized windows go into the strip, Mission Control always shows them. Ars Technica
    found there is then "no good way to make a window stop appearing in Mission Control other than
    closing it".
- **Port to GNOME 50:**
  - **Thumbnails.** Kiwi's strip already has `Clutter.Clone` thumbnails and a CSS
    perspective/`rotateY` tilt (`stage-manager-tilt`).
  - **Slot count:** derive it from the monitor work-area height (≈ 116 px thumbnail plus gaps)
    instead of a fixed `stage-manager-recent-count`. Keep the key as an upper bound.
  - **Badge click → spread** that app's windows in a small exposé next to the strip. Reuse
    `Workspace` layout math or Kiwi's App Exposé (P3).
  - **Auto-hide:** watch the stage windows' frame rects (`position-changed` / `size-changed`)
    against the strip rect. Reveal with a `Meta.Barrier` or a pointer-watch at the edge; keep an
    edge-dwell timeout.
  - **Minimize:** inject on Kiwi's own minimize paths (traffic lights, app switcher "H") and
    handle `Meta.Window::notify::minimized` by un-minimizing into the strip. Mutter's minimize
    animation must aim at the strip slot via `set_icon_geometry` (the Genie target from §5.3).
- **Blockers / risks:**
  - Clutter's 3D tilt needs `pivot_point` and `rotation_angle_y`; perspective comes from the stage.
    It is cheap, but mipmapping clones costs GPU on 4K.
  - Apps that minimize themselves (Electron "minimize to tray") race with the "minimize to strip"
    interception.
  - Barrier-based reveal fails when the strip side borders another monitor. Use pointer dwell
    there.
- **Linux equivalents today:** none.
- **Kiwi status:** partial. The round-2 strip has hover peek, app names, tilt, animation speed and
  auto-hide.
- **Recommendation:** **Port (P1 core), effort L.** It is half of what users see of Stage Manager.

### Stage Manager: sets (grouping windows from several apps)
- **Introduced / changed:** Ventura 13.0. The behaviour did not change in Sonoma.
- **What it is:**
  - **Building a set:**
    - drag a strip entry, or one window from a pile, onto the stage;
    - **Shift-click** a strip entry to add it to the current stage;
    - Shift-⌘-click a pile edge to pick one window (an undocumented trick);
    - drag a stage window onto another strip entry to move it into that set.
  - **Taking a window out:** drag it back to the strip (dropping it on its app's entry), or use
    **Window → Remove Window from Set**. The same command is in the green button's hover menu.
  - **Restoring.** A set comes back with its exact window layout.
  - **Persistence.** Sets are remembered across app quits *if the app is quit with that window
    still open*. Stage Manager groups **windows, not apps**, and identifies apps by **bundle ID**,
    so two app versions with the same ID are treated as one. AppKit apps keep their groups; some
    SwiftUI apps (Twitter clients) never do (Eclectic Light).
  - **Popbacks.** When two windows of one app are in different sets and refer to each other (an
    editor showing a tag popup from its main window), the stages flip back and forth.
- **Caveats (on macOS):**
  - It is "too laborious to set up" (MacStories). There is no way to open an app *into* the
    current stage from the Dock or Spotlight: you cannot drag from the Dock as iPadOS allows, and
    there is no modifier key.
  - Only the top window of a mixed set can be dragged out of the strip.
  - Windows sometimes reopen in the wrong set after their window was closed inside another set.
  - Moving a window to another display creates a new set there instead of joining the visible one.
  - There are no keyboard shortcuts, no right-click menu, and no Shortcuts or AppleScript actions
    for building sets.
  - Shift-click is "a gigantic kludge" that often switches stages by mistake (Tao of Mac).
- **Port to GNOME 50:**
  - **Model.** A pure model of `sets[] = {id, workspace, monitor, windows[], layout, lastUsed}`.
    Key windows by `Meta.Window.get_stable_sequence()` and apps by `Shell.App.get_id()`.
  - **Gestures.** Strip drags use `DND.makeDraggable` on thumbnails. Real-window drags come from
    `global.display` `grab-op-begin` / `grab-op-end` plus pointer position; Kiwi's round-2
    `dropTarget.js` already does this.
  - **Shift-click:** a `Clutter.ClickGesture` that checks `Clutter.get_current_event().get_state()`
    for `SHIFT_MASK`.
  - **"Remove Window from Set":**
    - add it to the Shell window menu (inject `WindowMenu` from `js/ui/windowMenu.js` with
      `InjectionManager`; GTK CSD titlebar right-click lands there);
    - add it to Kiwi's green-button tile menu (§5.7);
    - keep the existing shortcut (Ctrl+Super+Down).
  - **Do better than macOS:**
    - **Super+click** (or **Shift+Enter in Spotlight**) opens an app *into* the current stage;
    - add "Open in Current Stage" to dock right-click menus;
    - add keyboard shortcuts to cycle sets (Super+Alt+↑/↓) and to move the focused window to the
      next or previous set.
  - **Persistence across launches.** Remember `(app id, window title pattern or role)` →
    set membership in GSettings for the session, and optionally across logins. GNOME has no state
    restoration, so a re-launched app's first window joins its old set by app id alone.
- **Blockers / risks:**
  - Wayland exposes no stable window identity across app restarts, so persistence is heuristic.
  - Titles change, and GTK4 apps have no `WM_WINDOW_ROLE`.
  - Popback loops can happen when apps raise their own windows (`activate` requests →
    `window-demands-attention` / focus-stealing prevention). The model must debounce
    focus-triggered stage switches (e.g. ignore a re-switch within 300 ms of the last one).
- **Linux equivalents today:** none. Window groups exist only as tiling layouts (Tiling Shell,
  Forge).
- **Kiwi status:** partial. Round 2 has drop and Shift-click sets, side-by-side drops, remove by
  titlebar drag or shortcut, and in-memory sets per workspace.
- **Recommendation:** **Port (P1 core), effort L.** Sets are what make Stage Manager more than a
  window switcher. Add the keyboard and "open into stage" paths macOS lacks.

### Stage Manager: "Show windows from an application" (All at Once / One at a Time)
- **Introduced / changed:** Ventura 13.0. Same in Sonoma.
- **What it is:** a pop-up in the Stage Manager settings.
  - **All at Once:** switching to an app brings all of its available windows (those not in other
    sets) onto the stage. A new window joins the current stage.
  - **One at a Time:** only the app's most recent window comes. Clicking the app's strip entry
    again cycles to the next window. A new window (a Mail message, a new Safari window) gets its
    own stage, and the previous windows go to the strip.
  - It only affects stages that hold several windows of the *same* app.
- **Caveats (on macOS):**
  - Reviewers recommend All at Once. One at a Time "sends things to the strip more often than I'd
    like" (MacStories).
  - ⌘-` (cycle windows) becomes erratic with Finder because the Desktop counts as a Finder window.
- **Port to GNOME 50:**
  - Pure model logic: Kiwi's `stage-manager-group-by-app` already maps to it. The open question is
    a new window of an app already on stage. With All at Once it joins (Kiwi's
    `stage-manager-new-windows=join`); with One at a Time it replaces.
  - Detect "same app" with `Shell.WindowTracker.get_window_app()`.
- **Blockers / risks:**
  - Dialogs and transients must never count as a "new window" (check `get_transient_for()` and
    `Meta.WindowType.DIALOG`/`MODAL_DIALOG`).
  - Splash screens of Electron apps arrive as separate windows.
- **Linux equivalents today:** none.
- **Kiwi status:** have (round 2).
- **Recommendation:** **Port (P1 core), effort S.** Keep it inside the v3 model, with All at Once
  as the default.

### Stage Manager: desktop items, widgets and wallpaper clicks in Stage Manager
- **Introduced / changed:**
  - **Ventura 13:** a "Desktop Items" toggle. Desktop icons are hidden while Stage Manager is on,
    and clicking the desktop sends the stage to the strip and shows them.
  - **Sonoma 14 reorganised it:**
    - Show Items: ☐ On Desktop ☐ In Stage Manager;
    - Show Widgets: ☐ On Desktop ☐ In Stage Manager;
    - "Click wallpaper to reveal desktop": *Always* / *Only in Stage Manager*.
- **What it is:**
  - With Stage Manager on, a click on empty wallpaper always moves the whole stage into the strip.
    The desktop, its icons and its widgets show, and no stage is active.
  - Clicking a strip entry, a Dock app or the wallpaper again returns the stage.
  - If "Show items in Stage Manager" is on, icons stay visible behind windows. The Ventura version
    also lost the click-to-clear behaviour (MacMost).
- **Caveats (on macOS):**
  - Clicking "between icons" counts as a wallpaper click, which makes accidental stage clears
    common.
  - The rule is confusing: in Stage Manager the wallpaper click always clears the stage, whatever
    the "Always" setting says (PopSci).
- **Port to GNOME 50:**
  - Kiwi already has `toggleDesktop()` and `stage-manager-wallpaper-click`.
  - **Click detection:** add a primary `Clutter.ClickGesture` to each
    `Main.layoutManager._bgManagers[i].backgroundActor` (private). Shell 50 already makes it
    reactive for the background menu (`backgroundMenu.js` uses `ClickGesture` and
    `LongPressGesture`). Re-attach on the bgManager `changed` signal.
  - **Widgets in Stage Manager:** the widget layer's `inStageManager` flag hides or dims widgets
    (see the widgets section).
  - **Desktop icons:** n/a by default. If DING is installed, its DESKTOP window gets the clicks; to
    clear the stage then, Kiwi would need DING's D-Bus or a click on its window.
- **Blockers / risks:**
  - The background actor is behind every window, so clicks only reach it where no window covers
    it. That is correct behaviour.
  - `_bgManagers` is private.
  - A long-press on touch already opens the background menu. Ignore a click that turns into a
    long-press.
- **Linux equivalents today:** none (GNOME's background only has a right-click menu).
- **Kiwi status:** have (round 2, wallpaper click). Widgets: none.
- **Recommendation:** **Port (P1 core), effort S.** Copy Sonoma's settings shape: "Click wallpaper
  to reveal desktop: Always / Only in Stage Manager" (shared with Show Desktop).

### Stage Manager: integration with the Dock, switchers, Mission Control, Spaces and displays
- **Introduced / changed:** Ventura 13.0.
- **What it is:**
  - **Dock, Launchpad, ⌘-Tab and Spotlight** activate an app's last stage, or create a new one.
  - **⌘-` cycles windows within the current set**, not within the current app (MacMost).
  - **⌘-H** hides the app and removes it from the strip; un-hiding brings it back.
  - **Minimize** goes to the strip.
  - **Mission Control** shows every window, strip windows included. Strip windows slide up into the
    spread.
  - **Spaces:** each Space has its own Stage Manager state. Full-screen apps are separate Spaces
    and are not in the strip.
  - **Multiple displays:** each display has its own stage and strip.
  - **Dock on the left** puts the strip on the right.
  - **Reduce Motion** removes the flights.
- **Caveats (on macOS):**
  - **Multi-display:** disconnecting or reconnecting a monitor resets all the carefully arranged
    stages (MacRumors). Dragging a window between displays makes a new set.
  - **Floating windows:**
    - Help Viewer windows (they float on top) can freeze Stage Manager on Apple silicon when
      minimized (Eclectic Light, 13.1–13.2);
    - Help windows stay on the stage whatever stage is shown;
    - utility floaters (Quick Look panels) stay over every stage, which users like.
  - **Odd bugs:** Sonoma users reported a red menu bar with missing app menus when switching stages
    (Eclectic Light, Nov 2023). Mail and Safari windows sometimes "balloon" past the screen edge
    when stages switch (Apple Community).
  - **Background apps.** Apps that open no window (or only panels) are not in the strip at all.
    Short-lived helpers (Archive Utility, emptying the Trash) briefly take the stage and then hand
    it back.
- **Port to GNOME 50:**
  - **Kiwi's dock** (§5.2): clicking an app → `stageManager.activateApp(app)`. Running dots come
    from `core/desktop.js`.
  - **Kiwi's switcher** (P3 Super+Tab): `focus-window` handling switches stages. **Super+`**
    cycles `currentSet.windows`.
  - **Mission Control** (P3): hide the strip (round 2 slides it out) and let overview clones show
    every window at its real `get_frame_rect()`. Kiwi only moves actors, so frames stay where they
    are and the overview is correct.
  - **Fullscreen** (`Meta.Window.is_fullscreen()`) and always-on-top windows (`is_above()`) stay
    out of sets. **Sticky windows** (`is_on_all_workspaces()`) are excluded, as on macOS.
  - **Monitors:** key the strips by connector (`Meta.MonitorManager` → `get_connector`) so a
    replug restores them, which beats macOS.
  - **Reduced motion:** GNOME 50 has a Reduced Motion setting in Accessibility → Seeing. Read it
    in `core/motion.js`, together with `org.gnome.desktop.interface enable-animations`.
- **Blockers / risks:**
  - Shell's own Alt-Tab and the dash still activate windows behind Kiwi's back. React to focus
    changes rather than patching every caller.
  - Notifications' "default action" focuses windows the same way.
  - `Main.activateWindow` also switches workspaces.
- **Linux equivalents today:** n/a.
- **Kiwi status:** partial. Overview slide-out and per-workspace strips ship; the dock and switcher
  are new in v3.
- **Recommendation:** **Port (P1 core), effort M.** These rules belong in the "one window model"
  (§4.2) and in the scenario suite.

### Stage Manager: toggles, Control Center module, shortcuts and gestures
- **Introduced / changed:** Ventura 13.0. A later update added an assignable (unset by default)
  "Turn Stage Manager on/off" shortcut under Keyboard Shortcuts → Mission Control (MacMost update
  note).
- **What it is:**
  - **Control Center** has a Stage Manager tile that turns it on or off, and the tile shows a
    "Recent apps" switch.
  - It can be added to the menu bar. In Ventura you drag it out of Control Center; in Sonoma you use
    Control Center settings → "Show in Menu Bar". The menu-bar item opens a small panel with the
    switch and a recent-apps toggle.
  - MacMost reports that **Option-click** on the menu-bar item turns it off and on.
  - **No shortcuts at launch.** There are no Stage Manager gestures either: the usual Mission
    Control and App Exposé gestures, and the spread-to-show-desktop gesture, apply.
  - iPadOS has keyboard shortcuts for switching sets; the Mac did not.
- **Caveats (on macOS):** the lack of keyboard control is the most repeated complaint (Tao of Mac,
  FB12194002), and there are no Shortcuts or AppleScript actions (Michael Tsai).
- **Port to GNOME 50:**
  - Kiwi already plans toggles in the top bar, the Control Center tile, Spotlight and a shortcut
    (`stage-manager-shortcut`, via `Main.wm.addKeybinding`).
  - **Add set navigation:** Super+Alt+↑/↓ (next/previous set), Super+Alt+1…6 (strip slot n),
    Super+Alt+Backspace (remove from set).
  - **Gestures (§ gestures):** with Stage Manager on, the spread gesture or Show Desktop calls
    `toggleDesktop()`.
  - **Scripting:** a D-Bus interface (`org.gnome.Shell.Extensions.Kiwi.StageManager` with
    `Toggle`, `NextSet` and `ActivateSet`) would give power users what macOS lacks. Keep it opt-in
    for EGO.
- **Blockers / risks:**
  - Keybinding conflicts with GNOME defaults: Super+Alt is free in 50, but check the
    `org.gnome.desktop.wm.keybindings` set.
  - EGO reviewers ask for justification of D-Bus interfaces.
- **Linux equivalents today:** n/a.
- **Kiwi status:** partial (toggle and shortcut keys exist; no set navigation).
- **Recommendation:** **Port (P1 core), effort S.** Cheap, and the place where Kiwi can be better
  than macOS.

### Stage Manager: motion (flights, swaps, peek)
- **Introduced / changed:** Ventura 13.0.
- **What it is:**
  - Windows shrink and fly into their strip slot as they turn into the tilted thumbnail.
  - The incoming stage flies out of its slot and grows to its saved frame in the same moment
    (~0.4–0.5 s, spring-like).
  - Hovering a strip thumbnail lifts or brightens it slightly.
  - The strip slides off the edge when covered.
  - With Reduce Motion, the flights become cross-fades.
- **Caveats (on macOS):** power users want faster animations (Peter Ammon). The flights "get really
  boring" because everything goes to the same place (Tao of Mac).
- **Port to GNOME 50:**
  - Use `actor.ease()` on `translation_x/y` and `scale_x/y` of the window actor (or of a clone, for
    the flight) with springs from `core/motion.js`. Kiwi's `flight.js` already does this.
  - Make every ease cancellable (`remove_all_transitions()`) and run them from one container that
    `disable()` destroys (§5.5 rules). Keep `stage-manager-animation-speed`.
- **Blockers / risks:**
  - Easing the real window actor while the app commits new buffers can stutter on large windows.
    Flying a `Clutter.Clone` and hiding the source is smoother.
  - Watch `Main.wm` animations (map, destroy, minimize) for double effects.
- **Linux equivalents today:** n/a.
- **Kiwi status:** have (round 2), to be rebuilt on shared springs.
- **Recommendation:** **Port (P1 core), effort M**, in P2 Motion and P4.

### Stage Manager: lessons for Kiwi v3 (not a feature)
Scenario seeds for the §5.5 suite, taken from the macOS complaints above. Each is a behaviour Kiwi
should either match or fix on purpose:
1. **Open a new app next to the current work** (the "dance"). Provide Super+click in the dock,
   Shift+Enter in Spotlight and "Open in Current Stage" so it takes one step.
2. **An Open dialog closes before the document window maps.** There must be no flash of the
   previous stage. Debounce "stage became empty" for ~400 ms and keep transients with their parent.
3. **An app with no windows** (a tray app, or a GApplication launched with `--gapplication-service`)
   must not create an empty stage.
4. **A short-lived helper** (a file-operation progress dialog, a polkit prompt) must not steal the
   stage. Treat `MODAL_DIALOG`, `get_transient_for()` and `skip_taskbar` windows as "joins its
   parent's stage".
5. **Two windows of one app in different sets that raise each other** (popbacks). Rate-limit
   focus-driven switches.
6. **Monitor unplug and replug.** Restore the strips by connector.
7. **Dragging a window to the other monitor** should offer to join that monitor's stage (macOS
   creates a new set).
8. **A floating, always-on-top window** (`is_above()`) stays visible across stages and never
   freezes the model. This is the Help Viewer bug.
9. **Minimize from the traffic lights, Super+H and app-initiated minimize** all land in the strip.
   Disable restores everything.
10. **Super+Tab to a window in another set** moves the whole set onto the stage, and Super+`
    stays within the set.
11. **Toggling Stage Manager off** restores every frame and maximized state, and un-hides every
    actor. Run 20 toggle cycles with no leaked clones.
12. **Fullscreen, sticky and DESKTOP-type windows** never enter sets.
13. **Keyboard-only use:** every set operation needs a shortcut. macOS's biggest gap is Kiwi's
    cheapest win.

### System Settings redesign (System Preferences → System Settings)
- **Introduced / changed:** Ventura 13.0 (new app). Sonoma 14 reshuffled it again: new Sharing
  icons; the menu-bar auto-hide option and the recent-items count moved to Control Center;
  FileVault and Lockdown Mode got their own subpages; the screen saver preview is a hover-click on
  the thumbnail.
- **What it is:**
  - **Layout.** An iOS-style sidebar of panes with coloured icon tiles: the Apple ID card on top,
    then Wi-Fi, Bluetooth and Network, then Notifications, Focus and Screen Time, then General,
    Appearance, Accessibility, Control Center, Siri & Spotlight, Privacy & Security, Desktop &
    Dock, Displays and so on. Accessory panes (Mouse, Game Controllers) appear only when the
    device is connected.
  - **Detail panes** are grouped, inset lists ("form" style) built in SwiftUI, with **switches
    instead of checkboxes**, pop-up buttons, and "i" buttons and "Options…" buttons that open
    sheets.
  - **Search** is at the top of the sidebar. The window resizes **vertically only**.
  - **Panes moved or split.** The old panes were moved or split, sometimes 3–4 ways (Battery,
    Users & Groups, Privacy & Security). Software Update, Date & Time, Sharing, Time Machine and
    Startup Disk moved under General.
  - Third-party `.prefPane`s still load, at the bottom of the list.
  - Across first-party apps, the "Preferences…" menu item became **"Settings…"** (⌘,).
- **Caveats (on macOS):**
  - Longtime users "didn't know where to find anything".
  - It breaks Apple's own HIG: switches for minor settings, unpredictable pop-ups, hidden settings
    behind "i" icons.
  - Scrollable panes show no hint that they scroll, keyboard navigation is weaker, contrast is low,
    and you can no longer sort panes alphabetically or hide them (Ars Technica).
  - It is slow on Intel Macs.
- **Port to GNOME 50:**
  - Don't replace GNOME Settings. Its libadwaita sidebar design is already this layout. Two
    Kiwi-level ports instead:
    1. **Kiwi's preferences window** (overhaul §6) follows the same shape: an
       `Adw.NavigationSplitView` sidebar with coloured icon tiles per feature, `Adw.PreferencesGroup`
       inset lists, and a search entry (`Adw.PreferencesDialog` has built-in search).
    2. **The menu-bar wiring:** the logo menu "System Settings…" launches `org.gnome.Settings`, and
       the generic app menu maps `app.preferences` to "Settings…" (⌘, shown as Super+,).
  - Avoid macOS's mistakes. Use `Adw.SwitchRow` only for real on/off features and checkboxes or
    combo rows for minor ones; keep panes keyboard-navigable.
- **Blockers / risks:** none technical. prefs.js must stay Gtk/Adw-only (EGO-I-002).
- **Linux equivalents today:** GNOME Settings (libadwaita, sidebar and search) is already the
  Ventura model.
- **Kiwi status:** partial (the sidebar prefs regroup is planned in P0/§6).
- **Recommendation:** **Port (P1), effort S**, as the design pattern for Kiwi's prefs and the
  Settings wiring only.

### About This Mac (redesigned window)
- **Introduced / changed:** Ventura 13.0.
- **What it is:**
  - The old tabbed window is replaced by a single, compact, vertical window: the Mac's picture,
    model name and year, chip or CPU, memory, startup disk, serial number and macOS version.
  - **More Info…** opens System Settings → General → About, which links to Displays and Storage.
  - **System Report…** opens System Information.
- **Caveats (on macOS):** less information at a glance than the old Overview/Displays/Storage tabs.
  Storage moved into Settings.
- **Port to GNOME 50:**
  - The overhaul plan's logo menu already has **"About This PC"** (§5.1). It is a Kiwi modal (St,
    faux glass).
  - **Data sources, all read asynchronously:**
    - `GLib.get_os_info()` (NAME, VERSION and LOGO from os-release);
    - `Config.PACKAGE_VERSION` (the GNOME version);
    - the `org.freedesktop.hostname1` D-Bus properties (`HardwareVendor`, `HardwareModel`,
      `Chassis`, `PrettyHostname`);
    - `/proc/cpuinfo` and `/proc/meminfo` through `Gio.File.load_contents_async`;
    - GPU names from `net.hadess.SwitcherooControl` (`GPUs`);
    - displays from `global.backend.get_monitor_manager()`.
  - "More Info…" opens `gnome-control-center system`; "System Report…" opens GNOME System Monitor
    or `hardinfo2` if installed.
- **Blockers / risks:**
  - The serial number needs root (DMI `product_serial`), so skip it.
  - A device picture needs a model→image map, so use the chassis icon (`computer-laptop-symbolic`
    and so on).
- **Linux equivalents today:** GNOME Settings → System → About (with "System Details").
- **Kiwi status:** none (planned in §5.1).
- **Recommendation:** **Port (P1), effort S.** Small, visible, and part of the logo menu.

### Continuity Camera (iPhone as webcam), Desk View and the camera effects
- **Introduced / changed:** Ventura 13.0 with iOS 16.
  - The wireless camera needs an iPhone XR or later; Center Stage and Desk View need an iPhone 11
    or later; Studio Light needs an iPhone 12 or later.
  - Sonoma moved the effects into a new Video menu-bar item.
- **What it is:**
  - **Becoming the webcam.** A locked iPhone in landscape, stationary, near the Mac and on the same
    Apple ID becomes the default camera and microphone. That happens automatically after first use,
    or the user picks "iPhone camera" in any app.
  - **Effects** are in Control Center → Video Effects: Portrait, Center Stage, Studio Light and
    Desk View.
  - **Desk View** is a separate app that crops and de-warps the ultra-wide view of the desk, to
    share as a second feed.
  - **Mic Mode:** Standard, Voice Isolation or Wide Spectrum.
  - It works over USB too, which frees Wi-Fi for AirPlay and Sidecar.
- **Caveats (on macOS):**
  - You need a mount.
  - It will not run while AirPlay or Sidecar use the wireless link.
  - Desk View is noisy and distorted.
  - Center Stage drift feels like a glitch at a desk (Ars Technica).
- **Port to GNOME 50:**
  - Out of the Shell's scope. A camera source is a PipeWire or V4L2 device. The Linux routes are
    scrcpy 2.x `--video-source=camera` with a `v4l2loopback` sink (Android), DroidCam, or Iriun,
    all of them user-installed.
  - Kiwi could only *show* the state: Shell 50 already has a camera-in-use indicator
    (`js/ui/status/camera.js`), and Kiwi's menu bar and notch can restyle it as a "camera in use"
    live activity.
- **Blockers / risks:** iPhone protocols are proprietary, so no iPhone path exists on Linux. Effects
  (portrait blur, auto-framing) would need a PipeWire filter node, which is a separate project.
- **Linux equivalents today:** DroidCam, Iriun, scrcpy+v4l2loopback, OBS Virtual Camera, Webcamoid
  (effects).
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort XL.** Hardware and ecosystem bound. At most, add a "camera in
  use" live activity in the notch (P5, S).

### Spotlight: new design and rich results
- **Introduced / changed:** Ventura 13.0.
- **What it is:**
  - A redesigned Spotlight bar and results list, consistent with iOS.
  - **Rich results** for artists, movies, actors, TV shows, businesses and sports; image results
    from Photos, Messages, Notes, Finder and the web.
  - **Photo search** by location, people, scenes or objects, and **Live Text search** for text
    inside images.
  - Results stream in as you type. ⌘-Return shows a result in Finder, and ⌘-dragging a result
    copies the file.
- **Caveats (on macOS):** web and "Siri Suggestions" results send queries to Apple, and many users
  turn them off. Image subject search depends on Photos' on-device analysis.
- **Port to GNOME 50:**
  - Kiwi's Spotlight already uses `org.gnome.Shell.SearchProvider2` providers. Files come from the
    Files provider, which uses LocalSearch (formerly Tracker).
  - **Image results:** query LocalSearch through its search provider or TinySPARQL over D-Bus for
    `nmm:Photo` filtered by filename, tags and EXIF location. **Text in images** needs OCR, which
    LocalSearch does not index, so skip it.
  - **Rich web results:** skip them (privacy, no free API). Kiwi already has a "Web" row that hands
    off to the browser.
- **Blockers / risks:**
  - Remote providers are slow. Keep the 50 ms first-paint rule.
  - The TinySPARQL bus names changed in GNOME 47 (`org.freedesktop.LocalSearch3`). Feature-detect
    them.
- **Linux equivalents today:** the GNOME Shell overview search, Ulauncher, Albert, KRunner.
- **Kiwi status:** have (the round-2 Spotlight); image search: none.
- **Recommendation:** **Port (P2), effort M**, for image results from LocalSearch. Skip the rich
  web results.

### Quick Look in Spotlight
- **Introduced / changed:** Ventura 13.0.
- **What it is:**
  - With a result selected, ⌘-Y (or the Space bar once the selection is in the results list)
    opens a **full-size Quick Look preview** of nearly any file: documents, images, video, PDFs.
    It works for web image results too.
  - Inside the preview you can scroll, select text and share. Esc returns to Spotlight.
- **Caveats (on macOS):** Space types a space while the text field has focus, so users must arrow
  into the list first.
- **Port to GNOME 50:**
  - **Sushi** (GNOME's previewer) exposes `org.gnome.NautilusPreviewer` with
    `ShowFile(uri, parentWindowHandle, closeIfShown)`. Kiwi's Spotlight can call it
    asynchronously (`Gio.DBusProxy` / `Gio.DBus.session.call`), passing an empty handle because the
    Shell has no toplevel.
  - **Keys:** Ctrl+Y or Super+Y (the ⌘Y analogue) at any time, and Space only when the selection
    has left the entry.
  - The Spotlight modal must close or step back (lower its opacity) while Sushi has focus, then
    restore. Sushi is a normal app window above the Shell's modal only if Kiwi drops its grab, so
    the flow is: release the modal, then show Sushi, then re-open Spotlight on Sushi's
    `close`/`Closed` or on focus return.
  - **Fallback when Sushi is missing:** an in-Shell preview for images (`St.ImageContent` via
    `GdkPixbuf` async loading) and text (first 4 KB).
- **Blockers / risks:**
  - Sushi is not installed by default on every distro. Fedora Workstation ships it with Files;
    check the bus name with `NameHasOwner`.
  - Modal grabs: the Shell's pushModal blocks input to app windows, so the hand-off order matters.
- **Linux equivalents today:** Sushi (Space in Files), GNOME Files' preview, Kiwi none.
- **Kiwi status:** none.
- **Recommendation:** **Port (P2), effort S.** One D-Bus call gives a macOS-grade preview.

### Spotlight Quick Actions (timers, alarms, Focus, Shortcuts, new documents)
- **Introduced / changed:** Ventura 13.0 (Spotlight "actions"). It grew in later releases.
- **What it is:** typing an action gives you a result that *does* something instead of opening
  something:
  - "timer 10 minutes" or "Clock → Create Timer" (it asks for a duration);
  - "set an alarm";
  - "turn on Do Not Disturb" or a Focus by name;
  - **run any Shortcut by name**;
  - create a new document in an app.
- **Caveats (on macOS):** you have to know the phrasing. Only Shortcuts and some first-party apps
  expose actions.
- **Port to GNOME 50:** Kiwi-native actions in the Spotlight model, so no new APIs:
  - **Timers and alarms:** Kiwi's own timer service, shown as notch live activities (§5.6).
    GNOME Clocks has no timer D-Bus API.
  - **Do Not Disturb:** `org.gnome.desktop.notifications show-banners`.
  - **Toggles:** Stage Manager, dark mode (`org.gnome.desktop.interface color-scheme`), Night
    Light.
  - **App actions:** an app's `.desktop` `Actions=` (`Gio.DesktopAppInfo.list_actions()` →
    `launch_action`), for example "New Private Window" or "New Document".
  - **Shortcuts:** the user-defined custom keybinding commands in
    `org.gnome.settings-daemon.plugins.media-keys custom-keybindings` as runnable entries.
- **Blockers / risks:** none technical. Parsing natural phrases must stay deterministic and local.
- **Linux equivalents today:** KRunner and Albert plugins; GNOME's search shows desktop actions in
  the app grid only.
- **Kiwi status:** partial (the calculator and toggling features from Spotlight exist).
- **Recommendation:** **Port (P2), effort M.** High value, and it builds on the notch timers.

### Passkeys (Safari 16 and apps)
- **Introduced / changed:** Ventura 13.0, Safari 16. Sonoma added shared passkeys in groups and the
  API for third-party credential providers.
- **What it is:**
  - **FIDO / WebAuthn credentials.** A per-site key pair; the private key stays on the device and
    syncs end-to-end encrypted through iCloud Keychain. Signing in uses Touch ID or the login
    password.
  - **Other devices:** they show a QR code that an iPhone scans (the hybrid transport).
  - Passkeys are phishing-resistant because they are bound to the domain.
- **Caveats (on macOS):**
  - Non-Safari browsers on Ventura can't read iCloud Keychain passkeys and must use the phone QR
    flow.
  - Site adoption takes years.
  - It ties you to iCloud, and exporting passkeys only came later.
- **Port to GNOME 50:**
  - Not a Shell feature. On Linux, passkeys live in browsers (Chrome's Google Password Manager,
    hardware security keys in Firefox and Chrome) or in password managers (Bitwarden, 1Password,
    KeePassXC 2.7.7+).
  - A system-wide credential API is still at the proposal stage: an xdg credentials portal and the
    `credentialsd` effort.
  - Kiwi could only add a "Passwords" entry in Spotlight that opens the user's manager.
- **Blockers / risks:** there is no system platform authenticator API. Fingerprint (fprintd) is
  not exposed to WebAuthn.
- **Linux equivalents today:** browser-built-in passkeys, Bitwarden, 1Password, KeePassXC, YubiKey.
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort XL.** It is a browser and password-manager domain.

### Mail improvements (undo send, schedule send, remind me, follow-up, smarter search)
- **Introduced / changed:** Ventura 13.0.
- **What it is:**
  - **Undo Send:** a short send delay (10, 20 or 30 s, or off; Apple's footnote quotes "within 30
    seconds"). Quitting Mail before it sends leaves the mail stuck.
  - **Scheduled send**, which works even if Mail is quit.
  - **"Remind Me"** brings a message back to the top later.
  - **Follow-up suggestions** when no reply has arrived.
  - **Detection of missing attachments or Cc recipients.**
  - Rich link previews.
  - **Search:** typo-tolerant, with top hits and suggestions before you type.
  - Sonoma later added large emoji, and verification codes from Mail autofilling in Safari.
- **Caveats (on macOS):** these are features Gmail and Outlook had for years. Undo works only while
  Mail runs.
- **Port to GNOME 50:** app territory, not a desktop feature. The only desktop hook is
  notifications: Kiwi's notch could show the "message sent / undo" toast if mail clients posted
  one. They don't on Linux.
- **Blockers / risks:** needs app cooperation.
- **Linux equivalents today:**
  - Thunderbird: Send Later, and undo through add-ons;
  - Geary: undo send;
  - Evolution;
  - Kiwi could recommend Geary for macOS-like behaviour.
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort L.**

### Clock app
- **Introduced / changed:** Ventura 13.0 (a Catalyst port of the iPad app). Sonoma listed "multiple
  timers", but Ars could not run two at once at launch.
- **What it is:**
  - **Tabs:** World Clock (with a day/night map), Alarms, Stopwatch and Timers.
  - Siri can set Mac timers and alarms, which had been missing for years.
  - Clock widgets: analog city clocks, in groups of up to four.
- **Caveats (on macOS):** an iPad app in a window that is "not optimized for the extra screen
  space". Alarms only fire when the Mac is awake.
- **Port to GNOME 50:**
  - Don't port the app: GNOME Clocks already has the same four tabs.
  - **Desktop integration Kiwi can do:**
    - read `org.gnome.shell.world-clocks` / `org.gnome.clocks world-clocks` for world-clock
      widgets (`dateMenu.js` already renders a World Clocks section from it);
    - run Kiwi's own timers in the notch and Spotlight (see Quick Actions).
- **Blockers / risks:** Clocks exposes no D-Bus API for its running timers and alarms, so the notch
  can't mirror them.
- **Linux equivalents today:** GNOME Clocks; the Shell calendar menu's World Clocks.
- **Kiwi status:** partial (calendar card; notch timers planned).
- **Recommendation:** **Skip the app, effort S** (the widgets and timers are covered elsewhere).

### Weather app
- **Introduced / changed:** Ventura 13.0 (a Catalyst port of the iPadOS 16 app). Sonoma added moon
  phases, wind gusts, averages, a precipitation chart, a wind map and wider hourly forecasts.
- **What it is:**
  - A sidebar of locations and animated condition backgrounds.
  - Tiles for UV, wind, air quality, precipitation and so on, plus maps.
  - Severe-weather and next-hour precipitation notifications.
  - Widgets.
- **Caveats (on macOS):** iPad-like. Data and notifications depend on Apple Weather's regions.
- **Port to GNOME 50:**
  - GNOME Weather exists, so don't port the app.
  - The Shell's `js/misc/weather.js` `WeatherClient` (GWeather, and the location configured in
    GNOME Weather) is what Kiwi's weather widget and notch "Widgets" tab should use, exactly as the
    Shell's calendar menu does.
- **Blockers / risks:** `WeatherClient` needs GNOME Weather installed to pick a location (or
  automatic location through GeoClue).
- **Linux equivalents today:** GNOME Weather; the Shell's weather section in the calendar menu.
- **Kiwi status:** none for weather (planned in the notch Widgets tab).
- **Recommendation:** **Skip the app, effort S.** Reuse `WeatherClient` for the widgets (see the
  widgets section).

### Freeform
- **Introduced / changed:** macOS 13.1 (December 2022). Sonoma added a Share-to-Freeform widget,
  diagramming improvements and "follow along"; later 14.x updates added Scenes.
- **What it is:**
  - An infinite-canvas whiteboard ("boards") with sticky notes, text, a library of 700+ shapes,
    connectors, images, files, PDFs, links and audio. iPad and iPhone also have pen drawing.
  - **Real-time collaboration** through iCloud and Messages, with a FaceTime hand-off.
  - Boards sync across devices.
- **Caveats (on macOS):** iCloud-only collaboration. The Mac has no pen, so drawing is limited.
  It feels like an iPad app.
- **Port to GNOME 50:** not a desktop feature. Recommend apps.
- **Blockers / risks:** n/a.
- **Linux equivalents today:** Rnote (GNOME Circle), Xournal++, Excalidraw (web, collaborative),
  Lorien, Drawing.
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort XL.**

### Live Captions and Type to Speak
- **Introduced / changed:** Ventura 13.0 (beta: Apple silicon, US/Canada English). It was later
  expanded to more languages and FaceTime.
- **What it is:**
  - **Live Captions** is a floating, resizable window that transcribes on-device either the
    **computer's audio output** or the **microphone**. You switch between them with a button in the
    window or from the menu-bar item.
  - **Appearance:** font family, size, text colour and background colour. "Keep Onscreen" holds the
    window even when there is no audio, and the default position can be restored.
  - **Type to Speak:** a text field in the window that speaks what you type during calls.
  - It can be toggled with the Accessibility Shortcut or assignable keyboard shortcuts.
- **Caveats (on macOS):** a beta whose accuracy "should not be relied upon in high-risk
  situations". Apple silicon only.
- **Port to GNOME 50:**
  - An app-level feature. A GJS Shell extension should not run speech recognition in the
    compositor.
  - The Linux app **Live Captions** (`net.sapples.LiveCaptions`, Flathub) already captions
    PipeWire output or the microphone on-device.
  - Kiwi could add a Control Center tile that launches or toggles it when installed (via
    `Shell.AppSystem.lookup_app`).
- **Blockers / risks:**
  - On-device ASR is heavy, and in-Shell processing would block the compositor (EGO-X).
  - The Live Captions app has no control D-Bus API, so a tile can only launch it.
- **Linux equivalents today:** Live Captions (abb128), Speech Note, Orca (speech the other way).
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort S** (as a launcher tile only).

### Live Text in video, Visual Look Up and subject lift
- **Introduced / changed:** Ventura 13.0.
- **What it is:**
  - Select and copy text in **paused video frames** in any AVKit player.
  - Data detectors on text in images: flight numbers, tracking numbers, addresses.
  - Visual Look Up recognises animals, plants, landmarks and statues.
  - **Lift a subject** from a photo (Preview, Photos, Safari) and drop it into another app.
  - Japanese, Korean and Ukrainian OCR; Safari translates text in images.
- **Caveats (on macOS):** some parts need Apple silicon; it works only in apps using AppKit or
  AVKit views.
- **Port to GNOME 50:**
  - The Shell's screenshot UI (`js/ui/screenshot.js`) is the only system-wide place to capture
    pixels. Kiwi could add an "extract text" action that runs Tesseract out of process
    (`Gio.Subprocess`, async), or open **Frog** with the capture.
  - Subject lift needs a segmentation model: skip it.
- **Blockers / risks:**
  - Wayland forbids reading other windows' pixels except through the Shell's own screenshot path
    or a portal.
  - Tesseract may not be installed.
- **Linux equivalents today:** Frog / TextSnatcher (OCR), GNOME Screenshot plus Frog, Normcap.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort M** (screenshot → OCR → clipboard, tied into Kiwi's
  clipboard history).

### Share sheet, Print dialog and Font Book redesigns
- **Introduced / changed:** Ventura 13.0.
- **What it is:**
  - **Share sheet:** a speech-bubble popover with recent contacts, share extensions and Shortcuts.
    It also offers "Collaborate", which shares a copy or an iCloud link.
  - **Print dialog:** a continuously scrolling page list where each page can be unchecked, live
    previews, and collapsible option sections. Page Setup's preview shows Clarus the dogcow.
  - **Font Book:** a grid of font samples, filters, and a sample-sentence view.
- **Caveats (on macOS):**
  - The Share sheet is slower than the old menu and ignores the user's extension order.
  - Switches everywhere in Print.
  - Font Book users miss the column view.
- **Port to GNOME 50:**
  - All three are app or toolkit dialogs. GTK's print dialog and the xdg-desktop-portal print and
    file dialogs are drawn by apps or portals, not by the Shell, so Kiwi can't restyle them.
  - There is no Linux "share sheet" standard. A portal was discussed upstream but none ships;
    GSConnect's "Send to" and Files' "Send to…" are app-specific.
- **Blockers / risks:** needs toolkit or portal changes.
- **Linux equivalents today:** GTK print dialog, GNOME Fonts (`gnome-font-viewer`), Font Manager.
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort L.**

### Focus filters
- **Introduced / changed:** Ventura 13.0.
- **What it is:**
  - Each Focus (Work, Personal, Sleep…) can apply **filters** to apps: only work calendars in
    Calendar, only certain Mail accounts, a specific Safari Tab Group, filtered Messages. There are
    also system filters such as Dark Mode and Low Power.
  - Focus is shared across devices.
- **Caveats (on macOS):** few third-party apps adopt the Focus Filter API. Setup is deep inside
  System Settings.
- **Port to GNOME 50:**
  - GNOME only has Do Not Disturb (moved into Quick Settings in GNOME 49).
  - **Kiwi could add simple "Focus modes":**
    - DND plus an app allow-list for banners (filtering notification sources in
      `Main.messageTray`, which the notch already intercepts);
    - optional dark mode and power profile (`net.hadess.PowerProfiles`).
  - App content filters are impossible without app cooperation.
- **Blockers / risks:** per-app notification filtering means patching `MessageTray` (private),
  which conflicts with the notch's source handling unless one owner is defined.
- **Linux equivalents today:** GNOME Do Not Disturb, per-app notification switches in Settings.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort M** (Focus modes as a Control Center feature).

### Login Items and background-items notifications
- **Introduced / changed:** Ventura 13.0.
- **What it is:**
  - **Notification.** Installing an app that adds a launch agent or daemon (updaters, helpers)
    shows a "Background Items Added" notification.
  - **The list.** System Settings → General → Login Items shows "Open at Login" apps and "Allow in
    the Background" switches per developer. Turning one off stops its processes.
- **Caveats (on macOS):** the wording is ambiguous (is it login items or a background
  permission?), and the "hide at launch" option for login items was lost (Ars Technica).
- **Port to GNOME 50:**
  - GNOME already has the pieces: the **Background Apps** section in Quick Settings
    (`js/ui/status/backgroundApps.js`, through the xdg background portal), "Run in background" in
    Settings → Apps, and autostart `.desktop` files in `~/.config/autostart`.
  - If Kiwi's Control Center replaces Quick Settings, it must keep a **Background Apps** row.
  - Kiwi's dock "Open at Login" toggles a `~/.config/autostart` copy of the app's `.desktop` file
    (only files Kiwi created; CLAUDE.md rule).
- **Blockers / risks:**
  - Systemd user units and Flatpak autostart (the portal's `RequestBackground`) are separate
    worlds.
  - A "new background item" notification would need a file monitor on autostart directories and
    the portal's permission store.
- **Linux equivalents today:** Quick Settings → Background Apps, GNOME Tweaks' Startup
  Applications, Settings → Apps.
- **Kiwi status:** partial (the dock's "Open at Login" is planned in §5.2).
- **Recommendation:** **Port (P2), effort S** (Background Apps in Control Center plus Open at
  Login in the dock).

### Ventura security changes (Lockdown Mode, Rapid Security Response, USB-C approval, Gatekeeper, Launch Constraints)
- **Introduced / changed:**
  - Ventura 13.0.
  - **Rapid Security Response** first shipped in 13.3.1 (a). Later macOS versions replaced it with
    Background Security Improvements.
  - **Sonoma** added a USB accessory policy pop-up: Ask every time / Ask for new accessories /
    Automatically when unlocked / Always.
  - **Advanced Data Protection** came in 13.1 (US) and 13.2 (worldwide).
- **What it is:**
  - **Lockdown Mode** is extreme hardening: most Messages attachments are blocked, complex web
    technologies are disabled (Safari only), and wired accessories are blocked while locked.
  - **RSR** patches cryptex-based components (Safari, WebKit) without a full update.
  - **USB-C accessories** must be approved on first connect.
  - **Gatekeeper** re-checks notarization at every launch.
  - **Launch Constraints** stop system apps that were moved from running.
- **Caveats (on macOS):** Lockdown Mode affects only Safari, not Chrome. The USB prompts are
  frequent and hubs are a loophole.
- **Port to GNOME 50:** system or security features, not Shell features.
- **Blockers / risks:** n/a.
- **Linux equivalents today:**
  - Settings → Privacy → "Device Security";
  - USBGuard (and GNOME's USB protection setting in Privacy);
  - Fedora's SELinux;
  - Flatpak sandboxing;
  - dnf offline updates or rpm-ostree on Silverblue.
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort L.**

### Game controllers settings and Metal 3
- **Introduced / changed:** Ventura 13.0.
- **What it is:**
  - **Game Controllers settings pane:** per-controller and per-game button remapping profiles,
    DualShock lightbar and touchpad options.
  - Switch Pro and Joy-Con (as a pair) are supported.
  - **Share gestures:** a double-press records the screen.
  - The controller's home button opens Launchpad.
  - **Metal 3:** MetalFX upscaling and fast resource loading.
- **Caveats (on macOS):** Buddy Controller was removed before release. Launchpad as a game launcher
  is crude.
- **Port to GNOME 50:**
  - Kiwi could map a controller's Home button to open Kiwi's Launchpad. Controller input reaches
    the Shell only through evdev or libinput, and GNOME has no gamepad navigation. Skip that.
  - Remapping is Steam Input's job.
- **Blockers / risks:** there is no gamepad API in Mutter or Shell.
- **Linux equivalents today:** Steam Input, SDL's game controller DB, InputPlumber (handhelds),
  gamescope; upscaling through FSR, gamescope and Proton.
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort L.**

### Saved Wi-Fi networks with copyable passwords
- **Introduced / changed:** Ventura 13.0.
- **What it is:** Wi-Fi → Advanced lists every known network. You can **copy the password** of any
  of them (after authenticating) and remove old ones. Network Locations were removed.
- **Caveats (on macOS):** it is buried in Advanced… The removal of Network Locations hurt a few
  users.
- **Port to GNOME 50:**
  - GNOME Settings → Wi-Fi already shows known networks and a **"Share" QR code with the
    password**.
  - Kiwi's Control Center Wi-Fi page could add "Copy password". NetworkManager's
    `GetSecrets(connection, '802-11-wireless-security')` over D-Bus works; NM asks polkit or the
    secret agent, and the Shell is the secret agent.
- **Blockers / risks:**
  - Reading secrets in-Shell is privacy-sensitive, so require an explicit click and copy to the
    clipboard with a timeout.
  - Clipboard declaration rules apply (EGO rule 7).
- **Linux equivalents today:** GNOME Settings' Wi-Fi share QR code; `nmcli dev wifi show-password`.
- **Kiwi status:** none (Control Center has Wi-Fi tiles).
- **Recommendation:** **Later (P3), effort S.**

### Ventura's bundled-app changes that touch the desktop
- **Introduced / changed:** Ventura 13.0–13.x.
- **What it is:**
  - **Messages:** edit (15 min, up to 5 times) and unsend (2 min), mark as unread, recover deleted
    messages (30 days), shared-file collaboration, SharePlay.
  - **Photos:** duplicate detection and merge, password-locked Hidden and Recently Deleted
    albums, copy and paste edits, iCloud Shared Photo Library (13.1).
  - **Safari 16:** Shared Tab Groups, per-group start-page backgrounds, extension sync, editable
    generated passwords.
  - **FaceTime Handoff** between devices.
  - **Notes:** date-grouped lists, smart folders with many filters, locking with the login password.
  - **Reminders:** pinned lists, templates, and a Completed list.
  - **Home:** a redesign and Matter support.
  - **Siri:** a compact orb in the corner; transcription hidden by default.
  - **"Preferences…" → "Settings…"** in all first-party apps.
- **Caveats (on macOS):** Catalyst and SwiftUI apps feel like iPad apps (Weather, Clock, Home).
  iCloud ties.
- **Port to GNOME 50:**
  - Only the naming convention matters to Kiwi: the global app menu (§5.1) should show "Settings…"
    for `app.preferences`, and "About <App>" and "Quit <App>" in the app menu.
  - Everything else is app territory.
- **Blockers / risks:** n/a.
- **Linux equivalents today:** Fractal/Element (editable messages), Shotwell/digiKam (duplicates),
  GNOME Web, Endeavour (tasks), Errands, Home Assistant.
- **Kiwi status:** partial (generic app menus planned in P1).
- **Recommendation:** **Skip** for the apps. The "Settings…" naming goes into §5.1 (S).

---

## Sonoma features

### Desktop widgets: placement, sizes and layout
- **Introduced / changed:** Sonoma 14.0 (new). Widgets had been in Notification Center only since
  Big Sur. Sequoia and later changes are in the 2024+ file.
- **What it is:**
  - **Where they live.** WidgetKit widgets can sit **on the desktop**, among desktop icons, on any
    display. They show on every Space. Notification Center widgets can be dragged to the desktop and
    back.
  - **Sizes:** small (1×1), medium (2×1), large (2×2) and **extra-large (4×2, desktop only)**. You
    pick a size in the gallery or later from the widget's right-click menu.
  - **Placement rules:**
    - The first widget in empty space goes anywhere inside the screen.
    - Near the screen edges and corners a **snap-to-grid outline** keeps it a margin away from the
      edge. Widgets can also snap below the Dock area.
    - Each later widget **snaps to an alignment grid relative to the existing ones**, so widgets
      never overlap.
    - Holding ⌘ while dragging loosens the snapping (an Ars reader's tip).
    - Desktop icons move out of a widget's way temporarily and snap back. Existing widgets never
      move by themselves.
  - **Moving.** Widgets can be dragged at any time, without an edit mode.
  - **Multiple displays.** Widgets on the laptop's built-in (primary) display migrate to the
    primary display when docked. Widgets placed on a secondary display disappear until that display
    returns.
  - **Click behaviour.** A plain click on a widget opens its app at the right place (a deep link).
    Interactive widgets act in place (see below).
- **Caveats (on macOS):**
  - The grid is "pretty rigid": a widget must line up with an edge of a neighbour and can't sit
    between two.
  - Widgets are hidden behind windows most of the time, which is why Apple added the wallpaper
    click.
  - Few third-party Mac apps ship widgets.
  - Desktop icons and widgets fight for space.
- **Port to GNOME 50:**
  - **A Shell extension layer:** one `St.Widget` per monitor, inserted into `global.window_group`
    **directly above `Main.layoutManager._backgroundGroup`** (private; Shell 50 `layout.js` places
    the background group first in `window_group`). It sits above the wallpaper and below every
    window.
  - **Input.** Reactive St actors there get pointer events, because the Shell is the compositor.
    They swallow background-menu clicks only where a widget is.
  - **Shared behaviour.** The window group is hidden in the overview, so widgets vanish in Mission
    Control as on macOS, and they stay put during workspace switches (they belong to every
    workspace).
  - **Geometry.** Use a fixed grid unit (≈ 170 px for 1×1, 16 px gaps; scale with
    `St.ThemeContext.scale_factor`). Snapping is pure code in `features/widgets/model.js`: the
    edge-margin snap, then neighbour-alignment snap and overlap rejection. Ctrl-drag loosens it.
  - **Persistence.** Store `{id, kind, size, config, monitorKey, x, y}` as JSON in one GSettings
    string key, with `monitorKey` taken from the monitor connector and vendor/serial
    (`global.backend.get_monitor_manager()`). Kiwi can do better than macOS by restoring a
    secondary display's widgets when it returns.
  - **Interplay with `core/layout.js`.** Widgets avoid the menu bar, dock, strip and notch rects.
    They never reserve work area.
- **Blockers / risks:**
  - `_backgroundGroup` is private. Feature-detect it and fall back to inserting at index 1 of
    `global.window_group`.
  - Kiwi's own Stage Manager hider and Show Desktop move window actors only, so they don't touch
    the layer.
  - **DING** (if installed) draws icons in a DESKTOP-type window *above* the background group, so
    Kiwi's widgets would sit under DING's transparent window and lose clicks. Detect DING and either
    stack the layer above DESKTOP-type window actors or document the conflict.
  - **Performance.** Widgets must update on aligned timers (once a minute for clocks, event-driven
    for MPRIS and UPower) and stop updating when fully covered.
- **Linux equivalents today:**
  - GNOME extensions: **Desktop Widgets (Desktop Clock, `azclock@azclock.gitlab.com`)**, and
    Conky (X11 and Xwayland; awkward on Wayland).
  - Other desktops: KDE Plasma widgets (the best Linux reference for the UX) and Cinnamon desklets.
- **Kiwi status:** none (a calendar card and the notch's planned Widgets tab exist).
- **Recommendation:** **Port (P2), effort L.** It is the second big Sonoma feature, reuses the
  notch and calendar data sources, and is safe on Wayland because it lives inside the Shell.

### Widget gallery and editing (Edit Widgets…)
- **Introduced / changed:** Sonoma 14.0.
- **What it is:**
  - **Opening the gallery.** Control-click the wallpaper → **Edit Widgets…** Windows fade away and
    a **widget gallery** slides up from the bottom.
  - **Gallery layout.** A search field and a category list (one per app). Each widget shows a
    preview at each size, and a "Mac / iPhone" source switch sits at the top right.
  - **Adding.** Click a widget, or its + button, to auto-place it. Or drag it to an exact spot.
    While editing, every widget shows a − button.
  - **Done** closes the gallery.
  - **Right-click on a widget** offers "Edit <Widget>…" (flips it to its configuration face:
    choose a list, city, album…), the size choices and Remove Widget. In Notification Center,
    Option-hover shows remove buttons.
- **Caveats (on macOS):**
  - The gallery lists every iPhone widget too, even useless ones (QR-code loyalty cards).
  - Configuration options are limited to what each widget's intent defines.
- **Port to GNOME 50:**
  - **Menu entry.** Add "Edit Widgets…" to the Shell's background menu. Each
    `bgManager.backgroundActor._backgroundMenu` is a `PopupMenu` built in
    `backgroundMenu.js:addBackgroundMenu` (private). Add an item after construction for each
    `Main.layoutManager._bgManagers[i]`, re-apply on bgManager `changed`, and remove on disable.
  - **The gallery** is a Kiwi faux-glass panel at the bottom of the primary monitor, shown with
    `lib/modal` (pushModal while editing). It has a search `St.Entry` and categories (Clock, Weather,
    Calendar, Media, Batteries, Photos, Shortcuts, System).
  - **Flipping a widget** to its config face uses an in-place St form. Complex options open a
    small prefs page.
  - Previews are live instances at reduced size.
- **Blockers / risks:**
  - The background menu is private API.
  - The modal must be dropped if the screen locks (Kiwi's Spotlight rule).
  - Dragging from a modal to the desktop layer needs `DND.makeDraggable` with a custom drop target
    on the widget layer.
- **Linux equivalents today:** Plasma's "Add Widgets…" sidebar; azclock's prefs-based editor.
- **Kiwi status:** none.
- **Recommendation:** **Port (P2), effort M** (ships with the widget layer).

### Widget dimming and visibility settings (monochrome while windows are in front)
- **Introduced / changed:** Sonoma 14.0.
  - **Desktop & Dock → Widgets**, as first shipped:
    - Show Widgets: ☐ On Desktop ☐ In Stage Manager;
    - **Widget style: Automatic / Monochrome / Full-color**;
    - Use iPhone widgets;
    - Default web browser.
  - **Later wording** in Apple's current guide: "Dim widgets on desktop: Automatically / Always /
    Never".
- **What it is:**
  - Widgets **fade to a translucent grey or monochrome tint** as soon as any app window is
    frontmost, so they "blend with the wallpaper" and don't distract. They stay **interactive**
    while dimmed.
  - They return to full colour when the desktop (Finder) is focused or the desktop is revealed.
  - "In Stage Manager" off hides widgets while Stage Manager is on, until the wallpaper is clicked.
- **Caveats (on macOS):** dimmed widgets are hard to read on busy wallpapers. The monochrome tint
  uses the wallpaper's colour, which can look muddy.
- **Port to GNOME 50:**
  - Add a `Clutter.DesaturateEffect` (factor 1.0) plus an opacity ease (~0.55–0.65) on each widget
    while any normal, non-minimized window on that monitor is focused. Watch
    `global.display` `notify::focus-window`; there is no focus when the desktop is clicked, and the
    Show Desktop or Stage Manager desktop state also counts.
  - Use full colour when no window is focused or the desktop is revealed. Tint with the wallpaper's
    average colour for the "monochrome" look (a 1×1 downscale of the background's `Meta.Background`
    is not exposed, so compute it from the wallpaper file in prefs and store it, or use a neutral
    grey).
  - **Settings:** `widgets-show-desktop`, `widgets-show-stage-manager`, and
    `widgets-dim=auto|always|never`.
- **Blockers / risks:**
  - `DesaturateEffect` on many actors means offscreen redirects. Apply it to one container per
    monitor, not per widget.
  - Honour high contrast (no dimming) and reduced transparency.
- **Linux equivalents today:** none (Plasma widgets don't dim).
- **Kiwi status:** none.
- **Recommendation:** **Port (P2), effort S.** Cheap, and it is what makes desktop widgets
  livable.

### Interactive widgets (buttons and toggles that act in place)
- **Introduced / changed:** Sonoma 14.0 (WidgetKit + App Intents interactivity, shared with iOS 17).
- **What it is:**
  - Widgets can hold **Buttons and Toggles** that run an App Intent without opening the app: check
    off a reminder, play or pause media, toggle a HomeKit accessory, run a Shortcut, start a timer.
  - The widget re-renders from its timeline after the action, with a brief animated transition.
  - Everything else in a widget is a deep link that opens the app.
- **Caveats (on macOS):**
  - Interactivity is limited to buttons and toggles: no text fields and no scrolling.
  - iPhone widgets' buttons run on the phone. Their deep links say "Open <app> on your iPhone to
    continue".
- **Port to GNOME 50:**
  - Kiwi's widgets are native St actors, so interactivity is free. What's missing on Linux is a
    *data and action* source per widget kind:
    - **Media:** MPRIS through the Shell's `js/ui/mpris.js` players (Kiwi's notch already uses
      them).
    - **Batteries:** UPower `org.freedesktop.UPower` → `EnumerateDevices` (laptop, mouse, keyboard,
      headset, phone through GSConnect, which exposes a UPower-like battery).
    - **Calendar** ("Up Next", list): the Shell's `org.gnome.Shell.CalendarServer` (Evolution Data
      Server), as in `js/ui/calendar.js`.
    - **Weather:** `js/misc/weather.js` `WeatherClient`.
    - **World clocks:** the `org.gnome.shell.world-clocks` locations, `GLib.TimeZone`.
    - **Quick toggles:** Wi-Fi, Bluetooth, DND and dark mode, through the same backends as Kiwi's
      Control Center.
    - **Shortcuts:** buttons that launch `.desktop` actions or custom commands.
    - **Photos:** a folder or album slideshow loaded asynchronously.
    - **Reminders:** EDS task lists; heavy, so later.
  - **A third-party widget API.** Linux has no WidgetKit. Kiwi could later define a simple D-Bus
    interface or a declarative JSON widget (title, rows, buttons → D-Bus method or command). Skip it
    in v1.
- **Blockers / risks:**
  - Each data source runs async on the compositor thread, so never block (EGO-X).
  - EDS task access from GJS is heavy.
  - Third-party widgets would need a stable protocol and EGO review of any command execution.
- **Linux equivalents today:** Plasma widgets (interactive, QML); GNOME's Quick Settings and
  calendar menu cover some of the same data.
- **Kiwi status:** partial (the notch has media; Control Center has toggles).
- **Recommendation:** **Port (P2), effort M**, starting with a built-in widget set: Clock, World
  Clock, Calendar, Weather, Media, Batteries, Toggles and Shortcuts.

### iPhone widgets on the Mac (Continuity)
- **Introduced / changed:** Sonoma 14.0 (needs iOS 17 on the same Apple ID, nearby or on the same
  Wi-Fi).
- **What it is:**
  - Any widget of any app on the user's iPhone can be added to the Mac's desktop or Notification
    Center. The phone renders the widgets and they sync over Continuity, even for apps not
    installed on the Mac.
  - The gallery labels them "From iPhone".
  - If several iPhones are signed in, Settings picks which one.
  - Widgets stop updating when the phone is away.
- **Caveats (on macOS):**
  - Tapping usually says "Open <app> on your iPhone to continue".
  - Many phone widgets are useless on a desk.
  - Updates stall out of range.
- **Port to GNOME 50:** impossible for iPhones. Rendering Android widgets on Linux is also not
  available: KDE Connect and GSConnect sync notifications, battery, media and clipboard, but not
  widgets. Kiwi could make phone *data* widgets from GSConnect's D-Bus (battery, notifications,
  media).
- **Blockers / risks:** Apple's protocol is proprietary. GSConnect is an optional extension.
- **Linux equivalents today:** GSConnect and KDE Connect (phone battery, notifications, media
  control).
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort XL.** A GSConnect "phone" widget can be **Later (P3), S**.

### Notification Center widgets (shared with the desktop)
- **Introduced / changed:** Big Sur added NC widgets. Sonoma made them interactive and
  drag-transferable to the desktop, and added the new widget kinds.
- **What it is:**
  - Clicking the date and time in the menu bar opens Notification Center: notifications on top,
    widgets below in a column, with an "Edit Widgets" button at the bottom.
  - Widgets dragged between NC and the desktop **keep their configuration**, so NC works as a
    "holding place" (MacMost).
  - Extra-large widgets cannot go into NC.
- **Caveats (on macOS):** a crowded NC, small widgets only, and the column order is manual.
- **Port to GNOME 50:**
  - Kiwi's notch "Widgets" tab (§5.6) and the calendar card play NC's role. Use **one widget
    model** for both surfaces, so a widget instance can move between "desktop" and "notch/calendar"
    containers without losing its config. The model stays in `features/widgets/`, and the surfaces
    only render it.
  - The Shell's calendar menu (`dateMenu.js`) already holds Weather and World Clocks sections that
    Kiwi can hide or replace.
- **Blockers / risks:** a dependency between the notch and calendar card owners. Define the widget
  model as a shared service in `core/`.
- **Linux equivalents today:** the GNOME calendar menu's Weather and World Clocks sections.
- **Kiwi status:** partial (calendar card, notch).
- **Recommendation:** **Port (P2), effort M.**

### Sonoma's new widget kinds (Batteries, Contacts, Photos, Shortcuts, Home, extra-large)
- **Introduced / changed:** Sonoma 14.0.
- **What it is:**
  - **Batteries:** the Mac, AirPods and iPhone.
  - **Contacts:** favourite people, with mail, message and call actions.
  - **Photos:** a featured photo or an album shuffle. Users make one-photo albums to pin a picture
    or a cheat sheet.
  - **Shortcuts:** buttons for a folder of shortcuts.
  - **Home:** accessories and scenes.
  - **Extra-large** variants for Calendar, Podcasts and Stocks.
  - **Clock widgets:** city clocks in groups of four.
  - **Freeform** got a share widget.
- **Caveats (on macOS):** Ars found Battery, Home and Shortcuts the "three most useful" ones. The
  rest are niche.
- **Port to GNOME 50:** the same mapping as under interactive widgets.
  - Batteries come from UPower and GSConnect.
  - Contacts would read Evolution Data Server address books (Folks); that is heavy, so later.
  - Photos come from a chosen folder.
  - Shortcuts are `.desktop` actions or commands.
  - Home: skip, or Home Assistant via a user-supplied URL and token (later and opt-in, because of
    network and EGO privacy).
- **Blockers / risks:** EDS contacts and Home Assistant credentials are sensitive; keep them out of
  v1.
- **Linux equivalents today:** Plasma's battery, photo frame and quick-launch widgets.
- **Kiwi status:** none.
- **Recommendation:** **Port (P2), effort M** for Batteries, Photos and Shortcuts. Contacts and
  Home are **Later (P3)**.

### Click wallpaper to reveal desktop
- **Introduced / changed:** Sonoma 14.0. It is on by default ("Always"). The option sits in
  Desktop & Dock: *Always* / *Only in Stage Manager*.
- **What it is:**
  - Clicking any empty part of the wallpaper (even between icons) makes **all windows fly to the
    screen edges** and leaves thin slivers visible. Desktop icons and widgets are then in front,
    and widgets go full colour.
  - Clicking the wallpaper again, a window sliver, a Dock app or ⌘-Tab brings everything back.
  - It is the same as the five-finger spread trackpad gesture (Show Desktop).
  - With Stage Manager on, it sends the whole stage to the strip instead.
- **Caveats (on macOS):**
  - **The most-complained-about Sonoma default.** Users click the desktop to deselect or focus
    Finder and lose their windows. Many how-tos explain setting it to "Only in Stage Manager"
    (PopSci).
  - Accidental triggers happen between icons.
- **Port to GNOME 50:**
  - Kiwi has **Show Desktop** (`apps/showDesktop/`, which delegates to Stage Manager's
    `toggleDesktop()`).
  - **Click detection:** a primary-button `Clutter.ClickGesture` on each bgManager
    `backgroundActor` (already reactive in Shell 50 for the background menu). Ignore drags and
    long-presses (the background menu uses `LongPressGesture`), and ignore clicks while a Kiwi modal
    is open.
  - **Animation:** ease each window actor's translation toward its nearest monitor edge, keeping
    ~24 px slivers. Put a reactive transparent catcher strip over each sliver, so a click there
    restores instead of hitting the app.
  - Drop keyboard focus with `global.display.unset_input_focus(global.get_current_time())`.
  - Restore on a second wallpaper click, a sliver click, `focus-window` to any window, a dock or
    switcher activation, or a workspace switch.
  - Never use `minimize()`, so window state stays truthful.
  - **Setting:** `click-wallpaper-reveals-desktop = always | stage-manager | never`, **default
    `stage-manager`**. GNOME users don't expect windows to fly away, and Sonoma's default is its
    most-reverted change.
- **Blockers / risks:**
  - The actor-only move keeps the real frames. Mutter's input picking follows the actor transform,
    but the slivers must not take clicks, hence the catchers.
  - Fullscreen windows are excluded.
  - With DING, wallpaper clicks land on DING's window, so the feature doesn't trigger.
  - Workspace-switch animations reparent window actors. Restore before a switch.
- **Linux equivalents today:** GNOME's Super+D / Show Desktop (minimizes everything); Kiwi's Show
  Desktop.
- **Kiwi status:** partial (Show Desktop and the Stage Manager wallpaper click exist; the
  non-Stage-Manager wallpaper click does not).
- **Recommendation:** **Port (P1), effort M.** Desktop widgets need it, and it shares code with
  Show Desktop. Default it to "Only in Stage Manager".

### Aerial screen savers
- **Introduced / changed:** Sonoma 14.0.
- **What it is:**
  - **Content.** 134 (at release) slow-motion 4K videos from Apple TV's aerials in four themes:
    Landscape, Cityscape, Underwater and Earth. You can shuffle by theme.
  - **Downloads.** Only "Sonoma" and "Sonoma Horizon" are local. Each other video downloads on
    first use: 100 MB to 1.5 GB, all 118 videos ≈ 54 GB, in
    `/Library/Application Support/com.apple.idleassetsd/Customer/4KSDR240FPS`.
  - The videos are stored as **purgeable** space, so Finder's free-space figure ignores them.
  - **Transitions.** Apps recede and the screen dissolves into the video. Waking dissolves back as
    the apps pop in.
  - **"Show as wallpaper"** uses the same video as the desktop picture.
- **Caveats (on macOS):**
  - Default energy settings turn the screen off before the saver starts, so most people never see
    it.
  - Frame drops on Intel Macs.
  - The free-space confusion.
  - Custom videos are officially impossible. A file-swap hack is unreliable (Ars).
  - Animated login backgrounds made Screen Sharing logins choppy (Michael Tsai).
- **Port to GNOME 50:**
  - GNOME has **no screen saver**: idle → dim → blank (`org.gnome.desktop.session idle-delay`) →
    lock. A Kiwi "aerial" would be an idle overlay before blanking.
  - **Rendering:** an out-of-process **GTK4 + GStreamer helper** (`gtk4paintablesink`, VA-API
    decode) whose fullscreen window the extension promotes above everything while the session is
    idle. Use the Mutter idle monitor (`global.backend.get_core_idle_monitor().add_idle_watch()`),
    and dismiss on user activity.
  - **Assets:** never Apple's videos (copyright). Use user-chosen video files, or a downloadable,
    openly licensed pack.
- **Blockers / risks:**
  - The Shell lock screen is drawn above all windows, so the video can't continue on the lock
    screen.
  - Video in the Shell process itself is not realistic: no GTK4 in the Shell, and per-frame texture
    uploads from GJS are slow.
  - Battery cost; it must stop on battery or when the screen blanks.
  - Bundling and spawning a helper is allowed (DING does it), but EGO reviewers look closely.
- **Linux equivalents today:** **Hanabi** (a GNOME extension with a GTK4/GStreamer video wallpaper
  helper), xscreensaver (X11 only), KDE's screen locker themes.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort L.** It looks great, but the lock-screen hand-off, which
  is the magic part, isn't possible.

### Aerial live wallpapers (the wallpaper that comes alive)
- **Introduced / changed:** Sonoma 14.0.
- **What it is:**
  - With the aerial chosen as both screen saver and wallpaper, the desktop shows a **still frame**.
  - When the saver starts, icons and windows fade and **the wallpaper starts moving**.
  - On wake or login, the video **keeps moving for a few seconds, then eases to a stop** as the
    icons and apps fade back.
  - The login window uses the same video.
- **Caveats (on macOS):** the same disk and GPU costs as the screen savers. Third-party videos
  crash to black on exit (Ars). Some Intel Macs showed a red menu-bar glitch that users linked to
  animated wallpapers.
- **Port to GNOME 50:**
  - **A still frame is easy:** set the wallpaper to an extracted frame (`gst` thumbnail, done in
    the helper).
  - **The "comes alive" effect** needs the video behind windows. The Hanabi approach is a helper
    window kept at the bottom of the stack: the extension sets it below, sticky and skip-taskbar,
    and re-parents its `Meta.WindowActor` into the background area.
  - **The ease-to-stop:** play the video at decreasing rate, then swap to the still image.
  - The lock screen part is impossible (see above).
- **Blockers / risks:**
  - Restacking a client window under the background is a private-actor hack.
  - The Shell's overview and workspace animations clone background actors, not windows, so the
    video freezes or disappears there.
  - GPU and battery cost.
- **Linux equivalents today:** Hanabi; KDE Plasma video wallpaper plugins; GNOME dynamic
  (time-of-day XML) wallpapers.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort L.** Ship time-of-day dynamic wallpapers first.

### Redesigned lock screen and login window
- **Introduced / changed:** Sonoma 14.0.
  - **Lock Screen settings:** "Show large clock: On Screen Saver and Lock Screen / On Lock Screen /
    Never" (default: lock screen only).
  - Login window options: user list vs name and password, and so on.
- **What it is:**
  - **Clock.** A **large clock and date** sit at the top centre in a bold rounded font.
  - **Login controls** are at the **bottom**: the user avatar and name with a password field.
    Other accounts hide behind the most recent one.
  - **Background:** the **user's own wallpaper or aerial**, not blurred, instead of the system
    default.
  - **Bottom row:** Sleep, Restart and Shut Down, plus keyboard and input-source and accessibility
    menus.
- **Caveats (on macOS):** looks only. There are no font choices, depth effect or lock-screen
  widgets as on iOS (Ars). Animated backgrounds are choppy over remote screen sharing.
- **Port to GNOME 50:**
  - **The lock screen** (`js/ui/unlockDialog.js`, `screenShield.js`) can be restyled by an
    extension that lists `"session-modes": ["user", "unlock-dialog"]`:
    - a big top clock (restyle the `unlock-dialog-clock` actors with CSS);
    - the auth prompt pinned to the bottom (CSS or layout injection on `UnlockDialog`);
    - a less-blurred background (inject on `UnlockDialog._updateBackgroundEffects`, private);
    - keep GNOME 49's lock-screen media controls and the notification list.
  - **GDM's login screen is out of reach.** GDM runs its own Shell as the `gdm` user and doesn't
    load user extensions, so that would need system-wide dconf for GDM, which is out of scope.
- **Blockers / risks:**
  - EGO requires a justification for `unlock-dialog`, and the extension must not weaken the lock
    (no keyboard shortcuts or extra entry points).
  - Kiwi must then keep only the lock-screen styling alive in that mode and disable everything else
    when the mode changes. Watch `Main.sessionMode` `updated` and split the code paths cleanly.
  - Private members of `UnlockDialog`.
- **Linux equivalents today:** GNOME's lock screen (clock centred, blurred wallpaper, swipe up for
  auth); extensions such as "Blur my Shell" (lock-screen blur control) and lock-screen clock
  stylers.
- **Kiwi status:** none (Kiwi has `lockIcon.js`, which is being dropped).
- **Recommendation:** **Port (P3), effort M**, for the lock screen only. Skip GDM.

### Web apps in the Dock (Safari 17)
- **Introduced / changed:** Sonoma 14.0 (Safari 17 on Sonoma only; not on Ventura or Monterey).
- **What it is:**
  - **Making one.** Safari → File (or the Share menu) → **Add to Dock…**. You edit the name, URL
    and icon. It creates `~/Applications/<Name>.app` and a Dock icon.
  - **Running it.** The web app runs in its own window with a minimal toolbar (back, forward,
    share) and no address bar. It is **its own app** for ⌘-Tab, the Dock, Stage Manager and Focus,
    and it can post **notifications** and get its own badge.
  - **Data.** It has separate cookies (Safari's are copied at creation) and its own Settings for
    the icon, name, URL and toolbar. Clicking an out-of-scope link opens the default browser.
- **Caveats (on macOS):**
  - No extensions.
  - Some sites loop through the browser for login (Plex, in Ars's test).
  - Icons are sometimes stale.
  - Each web app spawns its own process group.
- **Port to GNOME 50:**
  - The browsers do the creation:
    - **GNOME Web** (Epiphany) "Install as Web Application" through the
      **xdg-desktop-portal DynamicLauncher** portal → `org.gnome.Epiphany.WebApp_<id>.desktop`;
    - **Chromium/Chrome** "Install page as app" → `chrome-<id>-Default.desktop` with
      `StartupWMClass=crx_<id>`.
  - **Kiwi's dock must:**
    1. match web-app windows through `Shell.WindowTracker.get_window_app()` (not raw `wm_class`);
    2. pin and launch them like any app, and show running dots and badges (from the notification
       source's app);
    3. show them in Launchpad and Spotlight (they are `Shell.AppSystem` apps already).
  - An optional "Add Site to Dock…" in Kiwi is not needed: the browser owns the flow.
- **Blockers / risks:**
  - Firefox has no Linux web apps (its "Taskbar Tabs" are Windows-only).
  - Chrome PWAs on Wayland report `app_id` values that must match the `.desktop` id. Test VS Code,
    Chrome and Edge PWAs under both Wayland and Xwayland.
- **Linux equivalents today:** GNOME Web web apps, Chromium and Chrome PWAs, Webapp Manager (Linux
  Mint), WebApps.
- **Kiwi status:** none (the dock is new in P1).
- **Recommendation:** **Port (P1), effort S**, as dock correctness for web apps.

### Text-cursor indicators (Caps Lock, input source, dictation)
- **Introduced / changed:** Sonoma 14.0 (a redesigned text insertion point).
- **What it is:**
  - **Caps Lock:** pressing Caps Lock in any text field shows a small **⇪ up-arrow badge right
    under the caret**, coloured with the app's **accent colour**. It hides while you type and
    reappears after a pause.
  - **Input source:** switching input sources (Globe/fn or ⌃Space) shows a small **badge with the
    new source** (flag or abbreviation) at the caret.
  - **Dictation** shows its microphone and language indicator at the caret too.
  - It works in every app that uses the system text system, without app updates.
- **Caveats (on macOS):**
  - There is no setting to turn it off. The only way is an unsupported
    `defaults`/FeatureFlags hack (`redesigned_text_cursor` in UIKit.plist, or
    `TSMLanguageIndicatorEnabled`), which can break the caret in some fields.
  - Some users find the input-source popup slow or intrusive.
- **Port to GNOME 50:**
  - **A Shell extension.** It needs two inputs, both available in Shell 50:
    1. **The caret rectangle.** GNOME Shell is the IBus panel. The IBus `PanelService`
       `set-cursor-location` signal (used by `js/ui/ibusCandidatePopup.js`) carries the focused
       client's caret rect for Wayland text-input clients and for X11 apps through ibus-x11.
       Reach the service through `IBusManager.getIBusManager()` (private `_panelService`).
       `Main.inputMethod._cursorRect` is the Wayland-only fallback; the AT-SPI
       `FocusCaretTracker` (`js/ui/focusCaretTracker.js`) is the accessibility fallback.
    2. **The state:** `Clutter.get_default_backend().get_default_seat().get_keymap()`
       (`state-changed`, `get_caps_lock_state()`, as `ShellEntry.CapsLockWarning` does), and
       input-source changes from `Main.inputSourceManager` (`current-source-changed`).
  - **Drawing.** Draw a tiny accent-coloured pill (⇪, or the source's short name such as "EN" or
    "DE") as chrome at `(caret.x, caret.y + caret.height + 2)`. Fade it out on the next key press
    and after 1.5 s idle. Offer an option to hide GNOME's own centred input-source switcher popup.
- **Blockers / risks:**
  - Apps that don't use IBus or text-input-v3 give no caret: some Electron builds without
    `--enable-wayland-ime`, and games. In those, show it near the pointer, or not at all.
  - `_panelService` and `_cursorRect` are private.
  - IBus must be running (it is on Fedora Workstation).
- **Linux equivalents today:** none on GNOME (only the panel's input-source indicator and the
  password-field Caps Lock warning). KDE has no caret badge either.
- **Kiwi status:** none (`keyboardIndicator.js` is being dropped; it was a panel indicator).
- **Recommendation:** **Port (P2), effort S–M.** Unique, noticeable and Wayland-safe.

### Presenter Overlay
- **Introduced / changed:** Sonoma 14.0 (Apple silicon, Apple camera or Continuity Camera; any
  video app using the system camera).
- **What it is:** while sharing a screen or window in a call, two modes from the Video and Screen
  Sharing menu:
  - **Small:** your cut-out head floats in a draggable bubble over the shared content. What you see
    is what others see; placing the bubble beside the window extends the canvas.
  - **Large:** the shared content becomes a screen behind you, newscaster style. Its size is
    adjustable within limits.
  - It uses on-device segmentation (the Neural Engine).
- **Caveats (on macOS):** Apple silicon only. Intel Macs and generic USB webcams on some models
  don't get it. Gimmicky for some.
- **Port to GNOME 50:**
  - Composing camera and screen into one stream is a **PipeWire / video pipeline** job, not a
    compositor-UI job. The Shell's screencast and portal paths have no compositing hooks for
    extensions.
  - A Linux equivalent would be an OBS-like virtual camera (OBS + background removal) that apps
    pick as their camera.
- **Blockers / risks:**
  - The ScreenCast portal hands raw streams to apps, so Kiwi can't inject an overlay.
  - Segmentation models are heavy.
- **Linux equivalents today:** OBS Studio (+ obs-backgroundremoval, Virtual Camera), Webcamoid.
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort XL.**

### Video Reactions (gesture-triggered effects)
- **Introduced / changed:** Sonoma 14.0 (Apple silicon or Continuity Camera; works in FaceTime,
  Zoom, Teams and others through the system camera pipeline).
- **What it is:** eight 3D effects rendered into the camera feed, triggered from the Video
  menu-bar item or **hand gestures**:
  - one thumb up → thumbs-up bubble;
  - one thumb down → thumbs-down bubble;
  - two thumbs up → fireworks;
  - two thumbs down → rain;
  - one-hand peace sign → balloons;
  - two-hand peace signs → confetti;
  - two-hand heart → hearts;
  - two-hand rock-on → lasers.
- **Caveats (on macOS):**
  - Accidental triggers in serious meetings; users had to find the "Reactions" toggle in the Video
    menu.
  - Effects appear in other apps unexpectedly, unless turned off per app.
  - "Goofy but cute" (Ars).
- **Port to GNOME 50:** same as Presenter Overlay: a camera-pipeline feature. No Shell hook.
- **Blockers / risks:** needs a virtual camera and gesture recognition.
- **Linux equivalents today:** none built in (OBS plugins at most).
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort XL.**

### The Video menu-bar item (camera preview and effects)
- **Introduced / changed:** Sonoma 14.0. In Ventura the effects were in Control Center → Video
  Effects. The Sonoma item appears while an app uses the camera.
- **What it is:**
  - A green camera icon in the menu bar while the camera is in use.
  - **Its menu:** a **live self-view preview**, per-app toggles for Portrait (with an intensity
    slider), Studio Light, Center Stage and Reactions, plus Presenter Overlay. Microphone modes sit
    next to it.
  - It is the system-wide control surface for camera effects in every app.
- **Caveats (on macOS):** the effects depend on hardware. The preview duplicates the in-app view.
- **Port to GNOME 50:**
  - Shell 50 already shows a **camera-in-use indicator** (`js/ui/status/camera.js`) driven by
    PipeWire camera nodes.
  - Kiwi can restyle it into a menu-bar item or notch live activity that lists *which apps* use the
    camera (and the microphone, from the existing privacy indicators). A self-view preview would
    require Kiwi itself to open the camera through the Camera portal or PipeWire, which is
    privacy-hostile and complex, so skip that part. Effects: none.
- **Blockers / risks:**
  - Opening the camera from the Shell is a privacy and EGO red flag.
  - PipeWire node metadata for the app name is not always set.
- **Linux equivalents today:** the GNOME Shell camera, mic and screen-share privacy indicators.
- **Kiwi status:** none.
- **Recommendation:** **Port (P3), effort S**, for the indicator restyle and the app list only.

### Window and app sharing from the green button (new screen-sharing picker)
- **Introduced / changed:** Sonoma 14.0 (ScreenCaptureKit picker).
- **What it is:**
  - During a call, hovering the **green button** offers **"Share on <app>"**, which shares that
    window directly.
  - A system **Screen Sharing menu-bar item** lists what is shared and lets you add, remove or
    switch windows or apps. Apps that adopt the system picker get this for free.
  - The shared window is marked in its corner.
  - It also allows remote control requests.
- **Caveats (on macOS):** apps must adopt the new picker. Zoom and Teams took time.
- **Port to GNOME 50:**
  - Screen sharing goes through **xdg-desktop-portal ScreenCast**, and the picker is
    `xdg-desktop-portal-gnome`'s dialog. The Shell's `ScreenSharingIndicator` (`status/remoteAccess.js`)
    shows when sharing is active.
  - Kiwi can:
    1. restyle the indicator as a notch live activity ("Sharing <window>", with Stop);
    2. mark shared windows with an outline. The shared window id is not exposed to extensions, so
       this part is mostly blocked.
  - "Share this window" from the traffic lights would need a portal API to pre-select a source,
    which does not exist.
- **Blockers / risks:** the portal decides. There is no Shell API to start sharing a chosen window
  into an app's request.
- **Linux equivalents today:** the portal picker plus the Shell's sharing indicator.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort S**, for the indicator only.

### Screen Sharing app (High Performance mode)
- **Introduced / changed:** Sonoma 14.0.
- **What it is:**
  - Screen Sharing becomes a real app in Utilities, with a list of recent Macs, groups, and
    blocking.
  - **High Performance mode** (Apple silicon to Apple silicon, fast networks): low latency, HDR, up
    to two **virtual displays**, and **Dynamic Resolution**.
  - Each remote display can open in its own window.
  - It still speaks VNC to other systems.
- **Caveats (on macOS):** Dynamic Resolution is buggy or limited. Lag with large virtual displays.
  "Nowhere near" RDP (Ars).
- **Port to GNOME 50:** already done upstream. **GNOME Remote Desktop** (RDP) has hardware
  encoding (Vulkan, VA-API), HiDPI, camera redirection and headless sessions (GNOME 50), and
  extended virtual monitors (GNOME 49). Clients: GNOME Connections, Remmina.
- **Blockers / risks:** n/a.
- **Linux equivalents today:** GNOME Remote Desktop, Connections, Remmina, RustDesk.
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort XL.** GNOME has it.

### Game Mode
- **Introduced / changed:** Sonoma 14.0 (Apple silicon; the game must use macOS full screen).
  Sequoia and later folded it into the Game Overlay.
- **What it is:**
  - Game Mode **turns on automatically when a game goes full screen** and off when it quits. There
    is no global switch.
  - **What it changes:**
    - the game gets top CPU and GPU priority and background tasks are throttled;
    - the **Bluetooth sampling rate doubles**, lowering latency for AirPods and controllers.
  - **The menu-bar item.** A **Game menu-bar item** appears while Game Mode is active. "Turn Game
    Mode Off" from it is remembered for that game.
- **Caveats (on macOS):** no visible input-lag gain in Ars's test, but clear audio-latency gains.
  It only works for full-screen games.
- **Port to GNOME 50:**
  - **Feral GameMode** (`gamemoded`, D-Bus `com.feralinteractive.GameMode`) provides the CPU
    governor, ionice and GPU tweaks. Games or launchers (Steam, Lutris) usually opt in, but the
    D-Bus API also has **`RegisterGameByPID(callerPid, gamePid)`**.
  - **What Kiwi can do:**
    - when a window goes fullscreen (`notify::fullscreen`) and its app's `.desktop` has
      `Categories=Game` (or it is a Steam/Proton `steam_app_*` window), register its
      `get_pid()` with gamemoded and unregister when it closes or leaves fullscreen;
    - show a **Game** menu-bar item or notch activity with "Turn Game Mode Off for <game>"
      (remembered in GSettings);
    - optionally turn on Do Not Disturb and the `performance` power profile
      (`net.hadess.PowerProfiles`).
  - The Bluetooth latency part is not reachable. Linux uses the controller's or the headset's own
    low-latency codecs.
- **Blockers / risks:**
  - gamemoded may not be installed (Fedora ships the `gamemode` package but not by default).
  - Flatpak games' PIDs are in a sandbox; GameMode supports it via its portal.
  - Steam may already register the game, so check `ClientCount` / `QueryStatusByPID` to avoid
    double counting.
- **Linux equivalents today:** Feral GameMode (plus the "GameMode Shell Extension" indicator),
  gamescope, power-profiles-daemon.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort S.** Cheap, and it ties into the fullscreen rules
  (§4.2).

### Game Porting Toolkit
- **Introduced / changed:** Sonoma 14.0 (a developer tool: Wine + D3DMetal).
- **What it is:** a translation layer that lets developers evaluate Windows DirectX games on Apple
  silicon, used by end users through wrappers such as Whisky.
- **Caveats (on macOS):** not meant for distribution; no AVX under Rosetta.
- **Port to GNOME 50:** n/a. Linux already has Proton and Wine with DXVK and VKD3D.
- **Blockers / risks:** n/a.
- **Linux equivalents today:** Proton (Steam), Wine, Bottles, Lutris, Heroic.
- **Kiwi status:** none.
- **Recommendation:** **Skip.**

### PDF AutoFill (Preview)
- **Introduced / changed:** Sonoma 14.0. "Enhanced AutoFill" needs **14.2+**.
- **What it is:**
  - Preview detects form fields, **even in flat PDFs without real form widgets**, using on-device
    recognition.
  - An **AutoFill Form** button above the PDF, or clicking a field, fills in your name, address,
    phone and email from your **My Card** in Contacts. "Choose Other" uses another contact.
  - Signatures can be inserted (from trackpad or camera).
  - Mail suggests smart recipients for attachments.
- **Caveats (on macOS):** only some PDFs; recognition is hit or miss on complex layouts.
- **Port to GNOME 50:**
  - App territory. GNOME 50's **Papers** (Document Viewer) has forms and a rebuilt annotation tool,
    but no AutoFill.
  - The only desktop-level angle is Kiwi's clipboard: a "Quick Paste" set of the user's contact
    details (name, address) as pinned clipboard entries. That stays opt-in for privacy.
- **Blockers / risks:** needs the app. Field detection on flat PDFs needs ML.
- **Linux equivalents today:** Papers (forms, annotations), Okular, Xournal++ (writing on PDFs),
  LibreOffice Draw.
- **Kiwi status:** none (clipboard pins exist in Quick Paste).
- **Recommendation:** **Skip, effort L.** At most, pinned "My details" snippets in Quick Paste
  (P3, S).

### Shared password and passkey groups
- **Introduced / changed:** Sonoma 14.0 (iOS 17). Later releases moved them into the Passwords app.
- **What it is:**
  - In Settings → Passwords, you create a **group** and invite contacts. Each member chooses which
    of their passwords and passkeys to share, and every member can add and edit. It is end-to-end
    encrypted through iCloud Keychain.
  - It needs all devices on Sonoma or iOS 17.
  - The iCloud Passwords extension for Chrome and Edge now also works on macOS.
- **Caveats (on macOS):** contacts-only, Apple devices only, and the old-device warnings.
- **Port to GNOME 50:** no system password manager service beyond the Secret Service keyring
  (GNOME Keyring, KeePassXC), which has no sharing.
- **Blockers / risks:** n/a for a Shell extension.
- **Linux equivalents today:** Bitwarden Organizations, 1Password shared vaults, KeePassXC with a
  synced database.
- **Kiwi status:** none.
- **Recommendation:** **Skip, effort XL.**

### One-time codes from Mail and auto-delete of used codes
- **Introduced / changed:** Sonoma 14.0.
- **What it is:**
  - Safari's verification-code AutoFill, which already read Messages, now also reads codes arriving
    in **Mail**.
  - Optionally, used SMS and Mail codes are **deleted after insertion** (Passwords → Password
    Options → "Clean Up Automatically").
- **Caveats (on macOS):** Safari only; it encourages weaker SMS 2FA.
- **Port to GNOME 50:**
  - Kiwi could watch **notification banners** (the notch already sees them) for code patterns
    (`\b\d{6}\b` with a "code" keyword), offer "Copy code" on the banner, and put the code in the
    clipboard with a short expiry.
  - It must be opt-in. Clipboard rules apply (no third party, declared in metadata), and Kiwi must
    not store codes in history.
- **Blockers / risks:**
  - Privacy: notification content is sensitive. Keep it on-device and opt-in.
  - GSConnect-mirrored SMS notifications are the main source on Linux.
- **Linux equivalents today:** none built in. GSConnect shows SMS notifications.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort S** (a "copy code" action on notch banners).

### Autocorrect, inline predictions and dictation updates
- **Introduced / changed:** Sonoma 14.0.
- **What it is:**
  - A transformer-model autocorrect. Corrected words are briefly underlined, and a click reverts
    them.
  - **Inline predictive text** in grey that Tab or Space accepts.
  - Spelling and grammar suggestions on click even with autocorrect off.
  - Emoji suggestions from the Globe key.
  - It learns profanity.
  - Dictation mixes typing and speech.
- **Caveats (on macOS):** some find the inline predictions distracting. They are on by default.
- **Port to GNOME 50:**
  - Input-method territory. **IBus Typing Booster** gives completions and emoji. GNOME Shell shows
    IBus candidates in `ibusCandidatePopup`, which Kiwi could restyle in faux glass.
  - Inline (preedit) predictions depend on the engine and the app's text-input support.
- **Blockers / risks:** needs an IBus engine. A Shell extension can't do it itself.
- **Linux equivalents today:** IBus Typing Booster, Fcitx5 + plugins, Speech Note / Nerd
  Dictation.
- **Kiwi status:** none.
- **Recommendation:** **Later (P3), effort S**, for restyling the IBus candidate popup only.

### Personal Voice and Live Speech
- **Introduced / changed:** Sonoma 14.0 (accessibility; English).
- **What it is:**
  - **Personal Voice:** you record 150 phrases (about 15 minutes) and the Mac trains a voice
    on-device overnight (≈ 6.5 h on an M2). The voice syncs through iCloud.
  - **Live Speech:** a floating text field speaks typed text in calls and FaceTime, in a system
    voice or your Personal Voice.
- **Caveats (on macOS):** the voice is flat and uncanny (Ars). Training is long.
- **Port to GNOME 50:** not Shell work. Text-to-speech on Linux is Speech Dispatcher, Piper or
  eSpeak; voice cloning lives in third-party tools.
- **Blockers / risks:** n/a.
- **Linux equivalents today:** Spiel and Piper voices, Orca, Speech Note.
- **Kiwi status:** none.
- **Recommendation:** **Skip.**

### Pause animated images (auto-play animated images setting)
- **Introduced / changed:** Sonoma 14.0. The setting is Accessibility → Display → "Auto-play
  animated images".
- **What it is:** GIFs and animated images in WebKit-based apps (Safari, Mail, Messages) stop
  auto-playing. You click to play.
- **Caveats (on macOS):** Chromium and Electron apps ignore it.
- **Port to GNOME 50:**
  - A system preference would be honoured only by apps that read it.
  - Kiwi's own UI (the notch, widgets, Spotlight previews) should honour GNOME 50's **Reduced
    Motion** setting and `enable-animations` for any animated content it shows.
- **Blockers / risks:** app cooperation.
- **Linux equivalents today:** GNOME 50 Reduced Motion (system animations); per-browser settings.
- **Kiwi status:** partial (motion settings planned in `core/motion.js`).
- **Recommendation:** **Port (P2), effort S**, only as "Kiwi honours reduced motion everywhere".

### Menu-bar auto-hide options (Always / On Desktop Only / In Full Screen Only / Never)
- **Introduced / changed:** Sonoma 14.0 moved "Automatically hide and show the menu bar" from
  Desktop & Dock to Control Center settings and made it a four-choice pop-up. The default is "In
  Full Screen Only". "Recent documents, applications and servers" moved there too.
- **What it is:**
  - **Always:** the menu bar always auto-hides.
  - **On Desktop Only:** it hides only when no full-screen app is up.
  - **In Full Screen Only:** the classic behaviour.
  - **Never:** it stays even in full screen; some full-screen apps then show a black bar.
- **Caveats (on macOS):** the setting moved to an unexpected pane, and "Never" causes the full-screen
  black bar.
- **Port to GNOME 50:**
  - The owner **removed Kiwi's auto-hide top bar**, because the bar houses the notch.
  - Only the **"In Full Screen Only"** behaviour stays relevant. The overhaul's conflict rules
    already say fullscreen windows hide the menu bar and dock, with the notch on hover (§4.2).
    Keep exactly that, with a reveal at the top edge.
- **Blockers / risks:** Shell's fullscreen tracking (`Main.layoutManager` `_updateVisibility`,
  `primaryMonitor.inFullscreen`) is private-ish. Use `global.display` `in-fullscreen-changed`.
- **Linux equivalents today:** the stock Shell hides the top bar for fullscreen windows; Just
  Perfection and Hide Top Bar extensions.
- **Kiwi status:** partial (fullscreen rule planned; auto-hide removed by decision).
- **Recommendation:** **Port (P1), effort S**, for the fullscreen-only reveal. Don't bring back the
  full auto-hide.

### Safari 17 profiles and locked private browsing
- **Introduced / changed:** Sonoma 14.0 (Safari 17; profiles also on Ventura and Monterey, but the
  private lock is off by default there).
- **What it is:**
  - **Profiles:** separate history, cookies, extensions, Tab Groups and Favorites, each with an icon
    and colour. You switch them in the window, or right-click the Dock icon → "New <Profile>
    Window".
  - **Private windows lock** after inactivity, sleep or lock, and unlock with Touch ID or the
    password.
  - **Advanced tracking and fingerprinting protection**, and link tracking-parameter removal.
  - Also new: JPEG XL and HEIC support, and favicons in the Favorites bar.
- **Caveats (on macOS):** profiles can't use different iCloud accounts. Web apps don't support
  extensions.
- **Port to GNOME 50:**
  - Browser territory. The desktop-level piece is the dock: right-click menus should list an app's
    `.desktop` **Actions** (Firefox's "New Private Window", Chrome profile actions), which the
    overhaul's dock menu (§5.2) should include.
- **Blockers / risks:** n/a.
- **Linux equivalents today:** Firefox and Chrome profiles; Firefox's private-window lock does not
  exist.
- **Kiwi status:** none (the dock menu is planned).
- **Recommendation:** **Skip** for the browser. Desktop actions in the dock menu go into §5.2 (S).

### Sonoma's bundled-app changes that touch the desktop
- **Introduced / changed:** Sonoma 14.0–14.x.
- **What it is:**
  - **Notes:** inline full-width PDFs and scans, **linked notes** (type `>>`), block quotes and a
    monostyle format.
  - **Reminders:** **grocery lists** that auto-sort into sections, sections, and a column (kanban)
    view.
  - **Messages:** stickers from any photo (Live Stickers), search filters, swipe to reply, 2× audio
    playback, auto-delete of verification codes.
  - **Photos:** Sync Now, pets in People & Pets, editable Memories.
  - **Weather:** moon, wind map, averages.
  - **Home:** an Energy (grid forecast) tab.
  - **Clock:** multiple timers (shaky at launch).
  - **Freeform:** a share widget.
  - **Siri:** just say "Siri" (Apple silicon with AirPods Pro 2).
  - **Contacts:** pronouns.
  - **Privacy:** write-only Calendar access, a per-photo picker, app data-container access prompts,
    and Sensitive Content Warning for AirDrop, Messages and FaceTime.
  - **Accessibility:** hearing-aid pairing, and text-size control across apps.
- **Caveats (on macOS):** many features "coming later this year" at launch (Messages). Some need
  Apple silicon.
- **Port to GNOME 50:** app territory. The desktop-relevant one is **Clock's multiple timers**,
  which Kiwi's notch timers (§5.6) should support from day one, as several concurrent live
  activities.
- **Blockers / risks:** n/a.
- **Linux equivalents today:** GNOME Notes alternatives (Folio, Notesnook), Errands and Endeavour,
  GNOME Clocks (multiple timers), Fractal.
- **Kiwi status:** none.
- **Recommendation:** **Skip** for the apps. Concurrent timers go into the notch spec (S).

---

## Summary table

| Feature | Release | Recommendation | Effort | Main blocker |
|---|---|---|---|---|
| Stage Manager: stage + strip core | Ventura | Port (P1 core) | XL | No Mutter tiling API; transients and portal dialogs; focus handling |
| Stage Manager: recent-apps strip | Ventura | Port (P1 core) | L | Minimize interception races; edge reveal on multi-monitor |
| Stage Manager: sets | Ventura | Port (P1 core) | L | No stable window identity across app restarts (persistence) |
| Stage Manager: All at Once / One at a Time | Ventura | Port (P1 core) | S | Classifying dialogs, splash and transient windows |
| Stage Manager: desktop items, widgets and wallpaper clicks | Ventura, Sonoma | Port (P1 core) | S | `_bgManagers` is private; DING takes desktop clicks |
| Stage Manager: Dock, switcher, Mission Control, Spaces, displays | Ventura | Port (P1 core) | M | Shell paths that activate windows behind Kiwi's back |
| Stage Manager: toggles, shortcuts, gestures | Ventura | Port (P1 core) | S | Keybinding conflicts; EGO review of a D-Bus API |
| Stage Manager: motion | Ventura | Port (P1 core) | M | Easing live window actors stutters (fly clones instead) |
| System Settings redesign | Ventura, Sonoma | Port (P1), as Kiwi prefs pattern | S | None (prefs must stay Gtk/Adw-only) |
| About This Mac | Ventura | Port (P1) | S | Serial and model picture need root or a model map |
| Continuity Camera and Desk View | Ventura | Skip | XL | Proprietary iPhone protocol; effects need a PipeWire filter |
| Spotlight: new design and rich results | Ventura | Port (P2), image search only | M | No OCR index; web results are a privacy issue |
| Quick Look in Spotlight | Ventura | Port (P2) | S | Modal grab hand-off to Sushi; Sushi may be missing |
| Spotlight Quick Actions | Ventura | Port (P2) | M | Clocks has no timer API (use Kiwi's own timers) |
| Passkeys | Ventura | Skip | XL | No Linux platform-authenticator API |
| Mail improvements | Ventura | Skip | L | App territory |
| Clock app | Ventura | Skip (use GNOME Clocks) | S | Clocks has no D-Bus for timers or alarms |
| Weather app | Ventura | Skip (reuse Shell `WeatherClient`) | S | Needs GNOME Weather for location |
| Freeform | Ventura 13.1 | Skip | XL | App territory |
| Live Captions and Type to Speak | Ventura | Later (P3), launcher tile | S | ASR can't run in the compositor |
| Live Text video, Visual Look Up, subject lift | Ventura | Later (P3), OCR from screenshots | M | Wayland pixel access only via the Shell screenshot UI |
| Share sheet, Print, Font Book | Ventura | Skip | L | Toolkit and portal dialogs, not the Shell |
| Focus filters | Ventura | Later (P3), Focus modes | M | Patching MessageTray shared with the notch |
| Login Items and background items | Ventura | Port (P2) | S | Autostart vs portal vs systemd are separate worlds |
| Security changes (Lockdown, RSR, USB, Gatekeeper) | Ventura, Sonoma | Skip | L | System or security scope |
| Game controllers and Metal 3 | Ventura | Skip | L | No gamepad API in Shell |
| Copyable Wi-Fi passwords | Ventura | Later (P3) | S | Secret handling and clipboard rules |
| Ventura bundled-app changes | Ventura | Skip ("Settings…" naming goes into §5.1) | S | App territory |
| Desktop widgets: placement and layout | Sonoma | Port (P2) | L | Private `_backgroundGroup`; DING stacking; performance |
| Widget gallery and editing | Sonoma | Port (P2) | M | Private background-menu internals; DnD from a modal |
| Widget dimming and visibility settings | Sonoma | Port (P2) | S | Offscreen cost of `DesaturateEffect` |
| Interactive widgets | Sonoma | Port (P2) | M | Async data sources; no third-party widget protocol |
| iPhone widgets | Sonoma | Skip (GSConnect phone widget later) | XL | Proprietary Continuity |
| Notification Center widgets | Sonoma | Port (P2) | M | Shared model between notch, calendar and desktop owners |
| New widget kinds (Batteries, Photos, Shortcuts…) | Sonoma | Port (P2) / Later (P3) | M | EDS contacts and Home credentials are sensitive |
| Click wallpaper to reveal desktop | Sonoma | Port (P1) | M | Slivers must not take input; DING; workspace switch |
| Aerial screen savers | Sonoma | Later (P3) | L | No screen saver in GNOME; lock screen covers windows; licences |
| Aerial live wallpapers | Sonoma | Later (P3) | L | Video below windows needs a helper plus actor hacks |
| Lock screen and login window | Sonoma | Port (P3), lock screen only | M | `unlock-dialog` EGO justification; GDM unreachable |
| Web apps in the Dock | Sonoma | Port (P1) | S | Matching PWA app_ids; Firefox has none |
| Text-cursor indicators (Caps Lock, input source) | Sonoma | Port (P2) | S–M | Private IBus panel service; non-IME apps give no caret |
| Presenter Overlay | Sonoma | Skip | XL | Camera pipeline; no compositor hook in portals |
| Video Reactions | Sonoma | Skip | XL | Camera pipeline and gesture ML |
| Video menu-bar item | Sonoma | Port (P3), indicator only | S | Opening the camera from the Shell is a privacy flag |
| Window sharing from the green button | Sonoma | Later (P3), indicator only | S | The portal owns source choice |
| Screen Sharing app, High Performance | Sonoma | Skip (GNOME Remote Desktop) | XL | Already upstream |
| Game Mode | Sonoma | Later (P3) | S | gamemoded optional; Bluetooth latency unreachable |
| Game Porting Toolkit | Sonoma | Skip | n/a | Linux already has Proton and Wine |
| PDF AutoFill | Sonoma 14.2 | Skip (Quick Paste "My details" later) | L | App territory; ML field detection |
| Shared password groups | Sonoma | Skip | XL | No shared system vault |
| One-time codes from Mail | Sonoma | Later (P3) | S | Notification privacy |
| Autocorrect and inline predictions | Sonoma | Later (P3), restyle IBus popup | S | Needs an IBus engine |
| Personal Voice and Live Speech | Sonoma | Skip | L | Not Shell work |
| Pause animated images | Sonoma | Port (P2), reduced motion in Kiwi | S | App cooperation for anything else |
| Menu-bar auto-hide options | Sonoma | Port (P1), fullscreen-only | S | Auto-hide removed by owner decision |
| Safari 17 profiles and private lock | Sonoma | Skip (desktop actions in dock menu) | S | Browser territory |
| Sonoma bundled-app changes | Sonoma | Skip (concurrent notch timers) | S | App territory |

**Count:** 57 feature sections (28 Ventura-era, including the 8 Stage Manager sections, and 29
Sonoma-era), plus one non-feature "lessons" section for Stage Manager v3.

**Top port candidates for Kiwi (in order):**
1. **Stage Manager v3**: core, strip, sets and integration.
2. **Click wallpaper to reveal desktop**, shared with Show Desktop, defaulting to "Only in Stage
   Manager".
3. **Desktop widget layer**, with dimming and the gallery.
4. **Interactive built-in widgets** (Clock, Calendar, Weather, Media, Batteries, Toggles), sharing
   one model with the notch and the calendar card.
5. **Quick Look in Spotlight** through Sushi.
6. **Text-cursor Caps Lock and input-source indicator.**
7. **Spotlight Quick Actions**, with Kiwi timers as notch live activities.
8. **About This PC**, and **web apps handled correctly by the dock**.

**Notable blockers:**
- Mutter has no public tiling API.
- Several hooks Kiwi needs are private: `_bgManagers`, `_backgroundGroup`, the IBus
  `_panelService`, and `UnlockDialog` internals.
- Wayland and portals own screen sharing and the camera, so Presenter Overlay, Reactions and
  window-share pre-selection are impossible.
- GNOME has no screen saver, and the lock screen covers windows (aerials).
- GDM can't load user extensions.
- iPhone and Continuity features are proprietary.
- EGO review sensitivity for `unlock-dialog`, helper processes, D-Bus APIs and clipboard or
  notification content.

---

## Sources

**Apple**
- Apple Newsroom: macOS Ventura is now available (Oct 2022): https://www.apple.com/newsroom/2022/10/macos-ventura-is-now-available/
- Apple Newsroom: macOS Sonoma brings new capabilities (WWDC, June 2023): https://www.apple.com/newsroom/2023/06/macos-sonoma-brings-new-capabilities-for-elevating-productivity-and-creativity/
- Apple Newsroom: macOS Sonoma is available today (Sept 2023): https://www.apple.com/newsroom/2023/09/macos-sonoma-is-available-today/
- Apple Support, Organize your Mac desktop with Stage Manager: https://support.apple.com/guide/mac-help/use-stage-manager-mchl534ba392/mac
- Apple Support, Add and customize widgets on Mac: https://support.apple.com/guide/mac-help/add-and-customize-widgets-mchl52be5da5/mac
- Apple Support, Get captions of spoken and computer audio (Live Captions): https://support.apple.com/guide/mac-help/use-live-captions-mchldd11f4fd/mac
- Apple Support, Use Game Mode: https://support.apple.com/en-us/105118
- Apple Support, Fill out and sign PDF forms in Preview: https://support.apple.com/guide/preview/prvw35725/mac
- Apple Support, Continuity Camera: https://support.apple.com/en-us/102546

**Reviews and analysis**
- Ars Technica, macOS 13 Ventura review (Andrew Cunningham): https://arstechnica.com/gadgets/2022/10/macos-13-ventura-the-ars-technica-review/
- Ars Technica, macOS 14 Sonoma review: https://arstechnica.com/gadgets/2023/09/macos-14-sonoma-the-ars-technica-review/
- MacStories, macOS Ventura review, Stage Manager page (John Voorhees): https://www.macstories.net/stories/macos-ventura-the-macstories-review/2/
- MacStories, macOS Sonoma review: https://www.macstories.net/stories/macos-sonoma-the-macstories-review/
- Michael Tsai, Stage Manager in macOS 13.0 (roundup incl. Jason Snell, David Pierce, Howard Oakley): https://mjtsai.com/blog/2022/10/25/stage-manager-in-macos-13-0/
- Tao of Mac, Stage Manager Should just Exit, Stage Left (Rui Carmo): https://taoofmac.com/space/blog/2023/05/20/1130
- Eclectic Light, Stage Manager for the unimpressed 1: https://eclecticlight.co/2023/01/11/stage-manager-for-the-unimpressed-1-getting-started/
- Eclectic Light, Stage Manager for the unimpressed 2: https://eclecticlight.co/2023/01/13/stage-manager-for-the-unimpressed-2-workflow-strategies/
- Eclectic Light, Stage Manager for the unimpressed 3: https://eclecticlight.co/2023/01/17/stage-manager-for-the-unimpressed-3-apps-and-windows/
- Eclectic Light, How Stage Manager works in the log: https://eclecticlight.co/2023/01/19/how-stage-manager-works-in-the-log/
- Eclectic Light, Curious bugs in Help Viewer and Stage Manager: https://eclecticlight.co/2023/01/25/curious-bugs-in-help-viewer-and-stage-manager/
- Eclectic Light, Red menu bar in Sonoma: https://eclecticlight.co/2023/11/24/red-menu-bar-in-sonoma/
- MacMost, The Comprehensive Guide To Mac Stage Manager: https://macmost.com/the-comprehensive-guide-to-mac-stage-manager.html
- MacMost, 19 Tips For Using Desktop Widgets: https://macmost.com/19-tips-for-using-desktop-widgets-on-your-mac.html
- MacMost, Turning Off the Caps Lock and Other Text Cursor Indicators: https://macmost.com/turning-off-the-caps-lock-and-other-text-cursor-indicators-on-your-mac.html
- MacMost, 10 Useful Spotlight Actions: https://macmost.com/10-useful-spotlight-actions.html
- Popular Science, Stop macOS Sonoma from hiding your windows: https://www.popsci.com/diy/macos-sonoma-hiding-windows/
- Intego, How to use desktop widgets on macOS Sonoma: https://www.intego.com/mac-security-blog/how-to-use-desktop-widgets-on-macos-sonoma/
- Macworld, How to add widgets to the desktop: https://www.macworld.com/article/1981562/how-to-add-widgets-desktop-macos-sonoma.html
- 9to5Mac, macOS Sonoma lock screen wallpaper: https://9to5mac.com/2023/06/05/macos-sonoma-new-lock-screen-wallpaper/
- Michael Tsai, Sonoma wallpapers block Screen Sharing login: https://mjtsai.com/blog/2023/10/16/sonoma-wallpapers-block-screen-sharing-login
- OWC, How to hide the menu bar in Ventura and Sonoma: https://eshop.macsales.com/blog/86298-how-to-hide-the-menu-bar-in-macos-ventura-and-sonoma/
- macos-defaults, toggle language indicator: https://macos-defaults.netlify.app/keyboard/toggle-language-indicator.html
- MacRumors forum, Stage Manager complaints: https://forums.macrumors.com/threads/did-they-fix-stage-manager-in-os-ventura-yet.2358506
- Apple Community, Stage Manager bugs thread: https://discussions.apple.com/thread/254657679
- Wikipedia, macOS Ventura: https://en.wikipedia.org/wiki/MacOS_Ventura
- Wikipedia, macOS Sonoma: https://en.wikipedia.org/wiki/MacOS_Sonoma

**GNOME / Linux**
- GNOME 50 release notes: https://release.gnome.org/50/
- GNOME 49 release notes: https://release.gnome.org/49/
- GNOME Shell 50 source (`js/ui/layout.js`, `backgroundMenu.js`, `misc/inputMethod.js`, `ibusCandidatePopup.js`, `focusCaretTracker.js`, `misc/weather.js`, `dateMenu.js`, `status/camera.js`, `status/backgroundApps.js`, `status/remoteAccess.js`, `shellEntry.js`): https://gitlab.gnome.org/GNOME/gnome-shell
- Feral GameMode (D-Bus API incl. RegisterGameByPID): https://github.com/FeralInteractive/gamemode
- Hanabi video wallpaper extension: https://github.com/jeffshee/gnome-ext-hanabi
- Desktop Widgets (Desktop Clock) extension: https://extensions.gnome.org/extension/5156/desktop-clock/
- Sushi (GNOME previewer, org.gnome.NautilusPreviewer): https://gitlab.gnome.org/GNOME/sushi
- Live Captions for Linux: https://github.com/abb128/LiveCaptions
- xdg-desktop-portal DynamicLauncher (web apps): https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.DynamicLauncher.html
