# Board (orchestrator-owned)

| ID | Model | Package | Worktree / branch | Depends on | Status |
|---|---|---|---|---|---|
| P1-menubar | (earlier agent) | Menu bar, logo menu, app menu P1 | kiwi-v3-menubar / v3/p1-menubar | | merged |
| P1-windows | (earlier agent) | Tiling, green menu, Hide | kiwi-v3-windows / v3/p1-windows | | merged |
| L1 | sonnet | P2 Dock motion & extras: Genie/Scale minimize, bounce, magnification, LauncherEntry badges, grey background-app dots, folder Stacks | kiwi-l1 / v3/l1 | dock merged | merged |
| L2 | sonnet | P2 System surfaces: Tahoe volume/brightness OSD under the menu bar, centred dialogs, colour filters | kiwi-l2 / v3/l2-surfaces | | merged |
| L3 | sonnet | P2 Screenshot toolbar (Shift+Super+3/4/5) + floating thumbnail | kiwi-l3 / v3/l3-screenshot | | merged |
| L4 | sonnet | P2 Input: Caps Lock / input-source badge, emoji popover, icon styles (dark/tinted) | kiwi-l4 / v3/l4-input | | merged |
| L5 | sonnet | P3 Mission Control + App Exposé + start-on-desktop | kiwi-l5 / v3/l5-mission | | merged |
| L6 | sonnet | P3 App switcher (Super+Tab, Super+`) + trackpad gestures + hot corners | kiwi-l6 / v3/l6 | | merged |
| L7 | sonnet | P3 Launchpad (folders, jiggle delete with installer/Flatpak rules) + click-wallpaper/Show Desktop wiring + full screen Split View | kiwi-l7 / v3/l7-launchpad | | merged |
| L8 | sonnet | P4 Stage Manager v3 rebuild on core (sets, strip, other-side rule with dock, scenario + fuzz suites) | kiwi-l8 / v3/l8-stage | | merged |
| L9 | sonnet | P5 Notch v3: hover, tabs, live activities, file shelf, perf | kiwi-l9 / v3/l9-notch | | merged |
| L10 | sonnet | P5 Notification Center column (clock click), Focus modes, time-sensitive | kiwi-l10 / v3/l10-nc | | merged |
| L11 | sonnet | P5 Widget model + desktop widget layer + gallery + built-in widgets | kiwi-l11 / v3/l11-widgets | | merged |
| L12 | sonnet | P6 App menu providers: GTK menubar, DBusMenu registrar, AT-SPI, Help search | kiwi-l12 / v3/l12 | P1-menubar | merged |
| L13 | sonnet | P6 Spotlight Tahoe features | kiwi-l13 / v3/l13-spotlight | | merged |
| L14 | sonnet | P6 Control Center customisation, pinned controls, status-item (SNI) host, menu bar item manager, Low Power/battery rows | kiwi-l14 / v3/l14 | P1-menubar | merged |
| L15 | sonnet | P7 Installer integration (Kiwi side) + onboarding | kiwi-l15 / v3/l15-installer | | started |
| R1–R5 | sonnet | Adversarial review of merged work | read-only | merges | R1, R2, R3 done; R4 once after wave 3 |
| H* | haiku | see helper list below | | | |

## Helper tasks (haiku)
| ID | Task | Status |
|---|---|---|
| H1 | Unit-test hardening: core/events + core/layout models | merged |
| H2 | Unit-test hardening: core/desktop + core/motion models | merged |
| H3 | Unit-test hardening: core/originals (incl. ListMembersOwner, crash restore) | merged |
| H4 | Verify on GNOME 50 source: the reduced-motion key and the notification-grouping API | done (findings in v3-swarm.md) |
| H5 | Verify: Input Capture portal, localsearch xattr tags, Clocks timer D-Bus, Night Light location keys | done (findings in v3-swarm.md) |
| H6 | SVG icon set for new features (symbolic, GNOME style): show-desktop, logo-kiwi, mission-control, launchpad, stage-manager, notification-center, widgets | merged |
| H7 | Accessibility audit: accessible names and keyboard focus for every new Kiwi actor (report only) | done (30 findings logged) |
| H8 | Prefs consistency audit: every schema key has a prefs row or is internal (report only) | done |
| H9 | Harness library: reusable scenario helpers (launch app, wait window, click actor, drag, shot) → /home/user/kiwi-swarm-tools/lib.sh | done (/home/user/kiwi-swarm-tools; README there) |
| H10 | Dock scenario script set using H9's library (regression suite) | cancelled |
| H11 | Glass/Appearance scenario script set (regression suite) | cancelled |
| H12 | i18n audit: user-visible strings missing _() / N_() (report only) | queued |

Concurrency cap: 20 agents at once (environment limit). H2–H12 are queued and start as slots free.

## Open findings to fix (orchestrator triage)
- ✅ F1 (H2, fixed by H3): `core/motionModel resolve(req, {reducedMotion:true})` with no `animations` field is treated as animations OFF. It should default to animations on.
- ✅ F2 (H2, fixed by H3): `core/desktopModel windows({minimized:true})` doesn't filter (only `false` does); it should return only minimized windows.
- ✅ F3 (H2, fixed by H3): `upsertWindow(id, {appId: undefined})` stores undefined instead of keeping the default.
- F4 (H1): EventHub snapshots listeners per emit, so an owner released mid-emit still receives that emit (acceptable, documented).
- F5 (H1): a layout claim with `stack:false` and `reserve:'soft'` doesn't shrink the work area (intended: soft means no strut).
- A11y (H7): 30 violations (10 medium, 20 low); the list is in .swarm/agents/H7.md. Biggest: the modal overlay has no dialog role or name (lib/modalSurface.js:112); no keyboard entry to the notch; Spotlight rows have no role or focus; no keyboard context menu on dock files. Plan: a fixer pass after the P2–P6 leads merge, because many of these files are changing now.
- Prefs (H8): all 97 live user keys have prefs rows, and no row points at a missing or deprecated key. Defaults match §12. `clipboard-recording` / `dock-recent-apps` Reset Everything fix → FX1. The accent default `multicolor` matches macOS's default ("Multicolor"). Click-wallpaper "Always / Only in Stage Manager" → L7 adds the key. The planned keys (hot corners, magnification, Genie, input-source, SNI, Focus) belong to L6, L1, L14 and L10.

## Pacing (owner, 2026-10-27)
Deploy conservatively, sized to the scope and type of work. Resume in waves of about 8, closest-to-done first; the rest wait in the queue.
- Wave 1: P1-windows, FX1, FX2, L6, L7, L13, H9, R2
- Wave 2: L1, L2, L3, L4, L5, L8
- Wave 3: L9, L10, L11, L12, L14, L15
- Reviewers R4 and R5 and helpers H10–H12 run only after waves land, on merged code.

## Merges (2026-10-27, after the reset)
- L6 → merged (switcher, gestures, hot corners; core/desktopActions; events `app-expose-requested` for L5 and `launchpad-requested` for L7).
- FX1 → merged (R1 F1–F5, F7–F15, F21; dock view.js guard; Reset Everything uses schema "(internal)" summaries). R1's F6 and F16–F20 (S3) are deferred. The final 20-cycle run will be done on ccr by the orchestrator.

## Pacing update (owner, 2026-10-27, later): be conservative on tokens
- At most 4 or 5 agents running at once. No new agent starts until one finishes.
- Agents: read only the files they need, do one final 20-cycle Shell run plus at most one targeted run, and keep reports to 20 lines or fewer.
- Cut: H10 and H11 are folded into H9's library (no separate agents). H12 becomes an orchestrator grep. R4 and R5 become one reviewer (R4), run once after wave 3.
- Order after the current eight: L2, L3, L4, L8, then L9, L10, L11, L12, L14, L15.

## R2 (glass, appearance, dock) findings → FX3 (queued: starts after FX2 merges, because FX2 touches the wallpaper decode in adaptiveBar)
- S1 F1: the wallpaper tint decode freezes the Shell (lib/wallpaperTint.js:129, adaptiveBar.js:273). Use one shared decode: GNOME's thumbnail or a capped size off the main loop.
- S2 F2: both docks run when DtD is enabled live (originals.js:347 `_strip` is synchronous, so strip from idle or yield). F3: theme outer shadow on glass menus (explicit `box-shadow:none`). F4: no session-modes, so lock/unlock flips settings and flashes DtD (keep the holds while locked). F5: the stack freezes on big folders (lazy rows, debounce, ignore .part). F6: menu-bar glass contrast 3.92:1 on white (tint floor).
- S3 F7 (autostart through a dangling symlink), F8 (trash.js:89 after destroy), F10 (web-app minimize target), F11 (click on a focused app unminimizes). F9 is fixed by FX1. F12 is unconfirmed, so skip it.
- ccr@a175d6a after the L6 and FX1 merges: run-f44.sh 20 gave 0 Kiwi errors and 8/8 probes PASS (/tmp/x2/runs/20261027-150204-kiwi-is-not-apple-f44d).
- L1 → merged (Genie/Scale `minimize-effect`, magnification, bounce, LauncherEntry badges, background-app dots, folder Stacks; core `ctx.motion.tween`). Note for L8: Stage Manager flags windows, so they get GNOME's own minimize effect. L8 must call minimizeEffect `setTargetProvider(owner, fn(win)->{rect,edge})` so Genie targets the strip. Perf note: magnification costs 15.8 ms/frame in software rendering because the dock re-lays out and redraws its glass on every pointer move (R4 to check on hardware).
- L13 → merged (Spotlight views, LocalSearch files, actions, Quick Keys, "/" filters, history, Quick Look via Sushi, menu items; core event `timer-start-requested {seconds,label,source}` for L9). Open: Stage Manager puts the Sushi preview into the strip instead of on stage (→ L8). The dock view.js destroyed-widget error is still seen with KIWI_ONLY=spotlight (→ FX3). The EmptyTrash D-Bus signature is untested live.
- Resumed L2 (cap: 5 running).
- L7 → merged (Launchpad with folders and jiggle delete for Flatpak/Installer apps only, a dock tile, click-wallpaper key, Split View). The conflicts with L1 in dock/model, dock/index, events and code-map were combined by the orchestrator. Follow-ups: once P1-windows merges, its green menu emits `split-view-requested` and Split View's own hover menu goes. With DING running, wallpaper clicks are never taken. Split View has no divider.
- FX2 → merged (R3 #4–6, #12, #16, #17; wallpaper decode for the menu bar runs in a helper process `features/menuBar/wallpaperProbe.js`; default focus shortcut is Ctrl+F2; XML slide support `xmlSlideAt`). Left: R3 #14 and #13 (design). The unsafe `%s` replace at core/appMenus/model.js:183 → L12. The decode in lib/wallpaperTint.js `decodeWallpaper` (shared with Launchpad) is still in-process → FX3.
- FX3 started (R2 fixes): worktree kiwi-fix-glass, branch v3/fix-glass.
- L5 → merged (Mission Control on the overview: Spaces bar with +/×/reorder, App Exposé with minimized strip, F3/Ctrl+Up/Ctrl+Down, start on desktop, static Spaces via originals; API `ctx.features.instance('mission-control')`). The conflicts with L1/L7 in dock, schema, tests and code-map were combined by the orchestrator. Limits: no per-display Spaces; you reorder by dragging the label.
- Resumed L4 (cap 5: P1-windows, L2, L3, FX3, L4).
- ccr after the L7 merge: run-f44.sh 20 gave 0 Kiwi errors, 8/8 PASS (/tmp/x2/runs/20261027-150951-kiwi-is-not-apple-f44).
- P1-windows → merged (Sequoia tiling `window-tiling`, green-button menu, Hide `app-hide`, glass traffic lights; core/tileActions.js; events `window-tiled`, `app-hidden`; WindowState `hidden`). Orchestrator follow-up done: with the green menu on, full-screen Left/Right go to Split View (`split-view-requested`), and Split View's own hover menu shows only when the green menu is off. To FX3: the dock must skip `hidden` windows among minimized ones, and the square grey shadow behind the green menu is the same issue as R2 F3. Open: press-and-hold opens on release, not while held; Move to Display is untested (one monitor); tile memory is lost on lock.
- L3 → merged (Shift+Super+3/4/5, glass toolbar, timer, floating thumbnail, macOS file naming; events `recording-started`/`recording-stopped` for L9). Fact for L9/L10: on GNOME 50, `Source.iconName` is null for themed-icon sources, so match `gicon.get_names()`. Limits: no real recording was tested (no recorder in the roots); GNOME still copies every shot to the clipboard.
- Resumed L8 Stage Manager (cap 5: L2, L4, FX3, L8). Notes for L8: minimizeEffect `setTargetProvider`; the Sushi preview must stay on stage; skip `hidden` and `splitView` windows; `click-wallpaper-reveals-desktop` lives in lib/clickModel.js.
- ccr after the L5 merge: run-f44.sh 20 gave 0 Kiwi errors, 8/8 PASS (/tmp/x2/runs/20261027-151342-kiwi-is-not-apple-f44). A run on HEAD with P1-windows and L3 is in progress (scratchpad/ccr-run4.txt).
- L4 → merged (Caps Lock/input badge with lib/caret.js, Emoji & Symbols on Super+Ctrl+Space from the IBus dict, icon styles via lib/iconStyle.js, shared lib/paste.js). Facts: `St.Clipboard.get_content` crashed Shell 50 in the harness, so use `Meta.Selection.transfer_async`; `addTopChrome` rejects `affectsInputRegion` on 50. Open (R4 to judge): the paste fallback restores the clipboard after a fixed 1 s (Mutter has no "read" signal); clipboard history records pasted emoji; the Launchpad, Downloads and Trash dock tiles are not icon-styled.
- Resumed L9 notch (running: L2, FX3, L8, L9).
- FX3 → merged (R2 F1–F8, F10, F11): one off-process wallpaper decode (lib/wallpaperProbe.js + wallpaperDecode.js, 64 MP cap); deferred DtD strip; glass rim selector outranks the theme shadow; originals kept across a lock (no session-modes); lazy stack rows plus debounce; tint floor for 4.5:1. Not shown visually: the F3 shadow fix. Not measured: F5 on 3000 files. Harness note: inner-real.sh's ALL list lacks the v3 keys, so KIWI_ONLY doesn't isolate them.
- L2 done (v3/l2@becd643, OSD routing core/osd.js, glass dialogs, colour filters). HELD, not merged: waiting on the owner's decision about a pre-merge review gate. Open: black wallpaper under a colour filter in the roots (no wallpaper file there).
- L8 done (v3/l8@7b306b8, StageMachine model plus fuzz). HELD, not merged. Open: the panel minimize on a window in a set failed after the merge (it passed before); the new Page Up/Down cycle keys are untested in the Shell; two sF failures were not re-run; a 400 ms wait after the last stage window closes (a magic timeout, for the reviewer to judge). Waiting on the owner's review-gate decision.
- L2 → merged.

## Verification phase (owner, 2026-10-27): after all features are complete
Deploy test agents per feature group (read-only on code, findings go to fixers). Each one checks: works as specified (vs the macOS research); displays as expected (the orchestrator also reviews key screenshots); no jitter, lag or hiccups. Use H13's frame-time and jitter probes: frames over 16.7 ms, main-loop stalls over 50 ms, frame-by-frame position deltas (no jumps, reversals or flicker). Note the limit: software rendering, so a real-hardware checklist goes to the owner at the end.
Groups (about 6 agents): (1) dock and minimize effects; (2) Stage Manager and window tiling/Split View; (3) Mission Control, Launchpad, switcher, gestures and hot corners; (4) menu bar, app menu, Control Center and OSD/dialogs; (5) notch, Notification Center and widgets; (6) Spotlight, screenshots, input/emoji, appearance/glass and installer/onboarding.
- H13 (now): build the frame-time and jitter probes into the harness library so the leads' final runs and the verifiers can use them.
- L8: resumed to fix its 3 open failures before it merges.
- Next leads: L10, L12 (running with L9, L8 and H13); then L11, L14, L15.
- L9 → merged (hover expand, tabs, live activities, file shelf via Mutter DnD, core/timers.js `ctx.timers`). The orchestrator dropped L9's own `notch-osd` part in favour of L2's core/osd routing. For verification: drop-onto-notch was not confirmed in the final full run (it was in a notch-only run); the expand animation's worst frame is 29 ms in software rendering; the source app shows a drop onto the notch as a cancelled drag.
- ccr runs: after P1-windows and L3 (20261027-151727-…-f44), and after L2, L4, FX3 and L9 (20261027-153451-…-f44d): both 0 Kiwi errors, 8/8 PASS.
- L12 → merged (GTK exported menus, DBusMenu registrar with Qt verified, R3 #1–3 and the `%s` fix; keys `menubar-native-menus` on, `menubar-atspi-*` off). OPEN, owner asked for all layers: the AT-SPI ☰ menu read does not work (it finds the button, not the popover's items, and may leave the menu open). Needs a focused follow-up (FX4) or an explicit deferral. Electron is untested. Qt/Electron need X11 (docs/features/app-menus.md).
- H13 → done: /home/user/kiwi-swarm-tools/perf-lib.sh + classify.js (PERF and JITTER lines). Software-rendering baseline for the stock overview: mean 26.6 ms, p95 42 ms. Warm up first (the first frame is about 290 ms of shader setup). Spotlight open has jumps=1, to be checked in verification.

- Orchestrator fix: Mission Control's start-on-desktop hid the overview mid-startup, so the Shell's startup never completed and its reactive cover pane blocked top-bar and desktop clicks (found by L8, L10, L11 and L14). Now it hides after `startup-complete`. Verified in the real Shell: startingUp=false, cover gone, overview hidden (4/4). Lesson: pointer-click probes must stay in every lead's final run.
- L8 → merged (round 2: Page Up/Down cycle keys verified, sF re-run passed, GRACE_MS kept with its reason; the minimize-button failure was the cover pane).
- L11 → merged (core/widgets model and registry, desktop widget layer, gallery, 6 built-ins). Open: the notch Widgets tab should use `Widgets.acquire()` providers (proposal in L11.md); DING stacking and multi-monitor untested.
- L14 → merged (Edit Controls, pinned controls, SNI host, item manager, Low Power). Open: the pinned Wi-Fi menu misses network rows under the NM mock; two DBusMenu parsers (core/appMenus and menuBarItems) should be unified; AppIndicator and other-watcher modes untested. PERF cc: mean 24 ms, p95 49 ms, jitter 0.
- L10 → merged (Notification Center column, Focus modes with schedules and app triggers, DND sync). The orchestrator ported the Focus icon onto L9's Widgets-tab toggle (L10 had edited the pre-L9 dashboard). Open: an expanded notch banner swallows the first outside click.
- Remaining: L15 running. Then the verification phase.
- ccr after L8, L10, L11, L14 and the cover-pane fix: run-f44.sh 20 gave 0 Kiwi errors, 8/8 PASS (/tmp/x2/runs/20261027-160247-kiwi-is-not-apple-f44b).
- L15 → merged (core/installer.js client plus contract doc, Setup Assistant in prefs, Login Items page; duplicates removed). Open for L7's code: use `ctx.installer` and `can_uninstall`; GNOME Software's `uninstall` action is unverified.
- ALL FEATURE PACKAGES MERGED. Verification phase started (brief: verify.md). V1 dock + minimize; V2 Stage Manager + tiling + Split View; V3 Mission Control, Launchpad, switcher, gestures, hot corners; V4 menu bar, app menu, Control Center, OSD/dialogs; V5 notch, Notification Center/Focus, widgets; V6 Spotlight, screenshots, input/emoji, appearance/glass, installer/onboarding.

## Installer integration: PAUSED INDEFINITELY (owner, 2026-10-27)
No more installer work: no new pieces (Trash-drag uninstall, fly-to-dock, update dot, installing Kiwi itself), no installer cleanups (Launchpad `ctx.installer` / `can_uninstall`), and no verification of installer paths. The merged code stays as it is: it is idle and does nothing when no installer is on the bus. Onboarding and Login Items are not installer work and stay in scope. V6 skips the installer paths.

## Verification results
- V3 (Mission Control, Launchpad, switcher, hot corners, Show Desktop): no S1.
  - S2: Launchpad session stalls (p95 168 ms, 4 stalls up to 84 ms; the open has a 94 ms gap before the fade, likely the backdrop load). A slow drag onto an icon swaps instead of making a folder (the 200 ms reflow at launchpad/view.js:49 fires before the centre zone). Folder open and jiggle are not verified.
  - S3s in V3.md.
  - MC perf beats the stock overview (p95 26 vs 60 ms, 0 jitter).
  - Orchestrator screenshot review:
    - MC (mc-open.png): good structure. The Spaces thumbnails show no wallpaper (grey) and the current Space is a rounded inset card, not full-bleed as on macOS (S3).
    - Launchpad (lp2-open.png): clean grid, search and dots.
    - Switcher (switcher.png): matches macOS Cmd-Tab, with the menu bar app name and menus correct.
- Pending: Launchpad re-test (fast drag to folder, folder open, jiggle) goes to the Launchpad fixer.
- V5 (notch, NC/Focus, widgets): no S1.
  - S2:
    - The pinned notch dashboard takes a modal grab and swallows the first outside click (notch/view.js:260-274). Fix: a stage captured-event listener, no pushModal.
    - Every tab switch has a ~95 ms frame plus jitter (prebuild or defer the body).
    - The widget gallery layout is broken (orchestrator confirms in v5-widgets-gallery.png: tiles misaligned vertically, Now Playing and System on another baseline, System clipped, chips at the edge).
  - S3:
    - a 288 ms tick frame while expanded;
    - the NC placeholder "Widgets arrive with the widget gallery": L11 never registered `addWidget`, so wire the NC widget slot to core/widgets;
    - the banner stays beside the open NC (macOS hides banners while NC is open);
    - duplicate dock icons for the test windows;
    - "kiwi-notch needs an allocation" warnings.
  - Orchestrator review:
    - NC (v5-nc-open-after-banner.png) looks right.
    - The expanded notch (v5-notch-now.png) covers the menu bar's "Window" menu and status icons; acceptable on macOS for the island, but the Now tab is mostly empty (S3).
    - Real drop onto the notch passed.
- V1 (dock, minimize): no S1; 42 functional probes pass.
  - S2: magnify.js:167 `_reset` touches a destroyed button. dock/index.js:284 calls `invalidate()` after `setItems()`; invalidate first.
  - view.js:130 root cause found (Shell shutdown → panelBox notify → layout work-area-changed → setRect on a destroyed band). It is already fixed by FX3's `alive` guard: 0 errors in 3 runs. Optional hardening: guard `_syncOverview`/`_syncGeometry`, or have EventHub skip disposed owners.
  - S3:
    - stack grid/list open has one 120 ms frame (prebuild);
    - auto-hide reveal has a 178 ms first frame;
    - the magnification pill wobbles 1 px;
    - minimizeEffect/index.js:61 unblocks by signal id, giving "handler not blocked" and mutter "minimize accounting" errors with SM on (block exact handler ids);
    - icon styles skip the Launchpad, Downloads and Trash tiles;
    - list badges overlap;
    - 4 `insert_child_below` assertions on enable (candidates notch/view.js:298, menuBar/appMenuBar.js:378);
    - `-nan` translation-y (menuBar/fullscreenReveal.js:126).
  - Perf: Genie p95 27 ms with 0 jitter, Scale p95 32 ms, bounce p95 17 ms.
  - Orchestrator review: the stack grid (stack-grid.png) looks right. The Stage Manager strip sits on an opaque dark panel, where macOS Sequoia floats thumbnails on the wallpaper (S3, for V2/L8). genie-mid is inconclusive (a small funnel near the dock).
- Owner: REMOVE the installer code too. FX5 is removing it in kiwi-rm-installer / v3/remove-installer: core/installer*, the contract doc, the mock, the dock's "Open with Installer", and Launchpad's installer delete path. Kept: Flatpak delete via GNOME Software, package badges, Setup Assistant, Login Items.
- V4 (menu bar, CC, OSD, dialogs, filters): no S1.
  - S2:
    - Ctrl+F2 over a full-screen window reveals the bar but opens no menu (open after the slide ends).
    - The colour filter blacks out the wallpaper while a window is mapped. It is real, not harness-only: stock DesaturateEffect on the stage does it too (MetaBackgroundActor culling). Try per-group effects or force a background redraw.
    - **The ghost rectangle behind glass menus is still there.** The orchestrator confirms it in m5b-help-typed.png and c1-cc-open.png: a square lighter area extends past the rounded menu at right and bottom, and in the CC at bottom-left. The suspect is the shadow host `_boxPointer.bin` in lib/glass.js attachMenu (~405), which has no radius and doesn't track resizes. FX3's F3 rim fix did not cover it.
  - S3:
    - dialogs stay dark in light mode;
    - the logo is near-invisible on mid-blue;
    - wallpaperProbe "too large (0x0)";
    - StLabel -10x0 warnings;
    - CC p95 50–98 ms;
    - rapid menu switching max 203 ms.
  - Orchestrator review:
    - The OSD pill (o1-osd-volume.png) looks right.
    - CC: a stray empty circle left of the battery row; the Wi-Fi icon shows the disconnected glyph while connected to "Kiwi Home" (S3).
- FX5 → merged: installer code removed (core/installer*, contract doc, mock, dock Open with Installer, Launchpad installer path, installer-* events). Real Shell run clean (/tmp/x2/runs/20261027-163344-kiwi-rm-installer-f44d).
- V2 (Stage Manager, tiling, green menu, Split View, Hide):
  - **S1:** the green menu leaves a stuck modal grab after Esc plus a hover wiggle. Main.modalCount stays 1 and the shortcuts are dead (greenMenu.js ~97, windowControls/index.js 149-160 and 220-243).
  - S2:
    - Esc during a tile drag still tiles (windows/drag.js `_end`).
    - App.activate() doesn't unhide a Super+H app (windows/hide.js; maybe a harness artefact).
  - S3:
    - the first SM flight frame jumps;
    - the green menu square shadow (same root as V4's ghost rect);
    - the tile outline is a dark slab in light mode;
    - the strip autohides while the pointer is at x=0 (strip starts at x=3);
    - Split View exit keeps the half size.
  - All Stage Manager flows, tiling shortcuts and zones, Split View and Hide otherwise pass. SM swaps p95 22 ms.
  - Orchestrator review:
    - SM with 6 windows (sm-01-six.png) is correct apart from the opaque strip panel;
    - the green menu (w-05) has the ghost shadow box at its left and bottom;
    - the Split View picker (w5-03) is fine.

## Fix round after verification (started)
- FX6 menus/glass (kiwi-fx6-menus): green-menu stuck modal (S1), ghost rect behind glass menus, Ctrl+F2 in full screen, dialogs in light mode, logo contrast, CC stray circle and Wi-Fi glyph, menu-bar warnings.
- FX7 windows (kiwi-fx7-windows): tile-drag Esc, Hide activate, colour-filter black wallpaper, SM first-frame jump, strip x=0, Split View exit size, outline in light mode, minimizeEffect handler ids, SM strip panel look.
- FX8 dock/Launchpad/MC (kiwi-fx8-dock): magnify destroyed actor, Launchpad stalls, folder drag, folder and jiggle verification, stack and auto-hide first frames, icon styles on tiles, badges, MC Space labels, F3 from Launchpad, wallpaper in Space thumbnails.
- FX9 notch/NC/widgets (kiwi-fx9-notch): pinned dashboard grab, tab-switch hitch, gallery layout, NC widget slot, notch providers via Widgets.acquire, hide banners while NC is open, live tick, allocation warnings, Now tab balance.
- V6 still running; its findings get their own fixer.
- V6 (Spotlight, screenshots, input, glass, onboarding):
  - **S1:** the Dock, Mission Control and Colour Filters prefs pages failed to build (subtitle undefined). FIXED by the orchestrator (`subtitle ?? ''` in 8 row helpers).
  - S2:
    - The stock "Screenshot captured" banner still shows beside the thumbnail (screenshots/index.js:428-441) → FX10.
    - The QS menu shadow has a hard cut 42 px below the menu → FX6.
  - S3 → FX10:
    - the toolbar overlaps the dock;
    - the Spotlight list height snaps while typing (animate it) and typing p95 89 ms;
    - no empty state for "/files" with no hits;
    - identical icons for menu-item rows;
    - the Setup Assistant icons are tiny and faint;
    - the screenshot toolbar's first frame takes 183 ms.
  - Wallpaper ".jxl too large (0x0)" → FX6 (wallpaperProbe). The notch/view.js:92 disposed actor in motion → FX9.
  - Everything else passes: Spotlight open has 0 jitter (H13's jump not reproduced), emoji keeps the clipboard, and the tint runs off-process.
- FX9 → merged:
  - Fixed: the notch outside click (no modal); NC shows real widgets with Edit Widgets; banners are held while NC is open; the gallery tiles share a baseline (the orchestrator checked fx9-gallery.png: aligned, but the row scrolls horizontally with System cut at the edge, acceptable as a scroller); Now tab centring; disposed-actor criticals; the `insert_child_below` in menuBar/appMenuBar.js:378 (set_child_below_sibling; FX6 must keep it).
  - STILL OPEN:
    - tab-switch ~95 ms frame (bodies are prebuilt now; the cost is at animation start, cause unknown);
    - "kiwi-notch needs an allocation" warnings (12, unchanged);
    - the notch Widgets tab not yet on Widgets.acquire (needs its own change).
- FX7 → merged:
  - Esc during a tile drag cancels.
  - Hide is not a bug (`app.activate()` from a script has no event time).
  - Colour filter: the black wallpaper is FIXED by paint-volume opt-out plus one effect per uiGroup child; it costs nothing measurable.
  - SM: first flight frame fixed, the strip reaches x=0, the panel is removed so thumbnails float (macOS), Split View exit restores the size.
  - The outline follows the scheme. minimizeEffect blocks the exact stock handler ids.
  - Limit: the GNOME 51 snippet shader path lacks the paint-volume override.
- FX10 → merged:
  - The stock screenshot banner is gone (root cause: Source has `icon`, not `gicon`).
  - The toolbar sits above the dock.
  - The Spotlight list height eases (reversals 17→0, stalls 6→0; the typing p95 number isn't comparable because the probes differ, so R4 re-measures).
  - "No Results" empty state, app icons on menu rows, Setup Assistant icons (not rendered in the harness).
- FX8 → merged:
  - magnifier invalidate order;
  - Launchpad lazy pages (open p95 168→~77 ms, stalls 4→1);
  - folder intent (a slow drag makes a folder; folder open and jiggle verified);
  - stack prebuild (grid p95 99→29 ms);
  - icon styles on the system tiles; badges;
  - MC labels, the new-Space layout, F3 from Launchpad, wallpaper in Space thumbnails.
  For R4: MC now re-syncs the Spaces bar every frame while the overview animates (check its cost); the magnification sweep still reverses 32 times on x/w; auto-hide's "first frame" is the 500 ms autohideDelay (by design).
- FX6 → merged:
  - Green-menu stuck grab FIXED (the panel's dummy menu shared the source actor; regression scenario tools/scenarios/menus-regress.sh).
  - Square corner gone (the theme box-shadow; rim set inline).
  - Ctrl+F2 in full screen fixed.
  - Also fixed: -nan, StLabel -10x0, wallpaperProbe 0x0, symbolic logo, light dialogs, CC avatar hidden.
  - STILL OPEN:
    - the glass shadow tail ends in a faint box edge (~13 levels), also the QS cut;
    - Wi-Fi glyph (likely the mock).
  - Orchestrator review of g3-cc-open.png:
    - the square rect is gone, but a faint grey strip shows at the window's right edge beside the CC (the shadow tail);
    - a dark empty circle is still left of the screenshot button;
    - the logo is now a generic GNOME foot instead of the distro logo (check intended);
    - CC rows are missing in this run (mocks not loaded?).
- Orchestrator: the full-branch run after FX6 had 1 Kiwi error (dock magnify.resume on a destroyed frame during shutdown, an idle sync). FIXED (guard in `_sync` and `resume`); the re-run has 0 Kiwi errors and 8/8 (/tmp/x2/runs/20261027-172756-kiwi-is-not-apple-f44). Still in the log, for the next fixer: `-nan` translation-y at startup (source not found; FX6's fix didn't cover it); notch "no BlueZ" WARNING on every enable when BlueZ is absent (should be silent or debug).
- Running: FX11 (a11y), R4 (final review).
- Owner: FIX the AT-SPI ☰ menu. FX12 is working in kiwi-fx12-atspi / v3/fx12-atspi (open via Action, wait on events, read the popover and its submenus, close invisibly, activate via doAction; it decides the default from evidence).
- R4 (final review): no S1. modalCount stays 0 and no Kiwi actor leak.
  - Re-measures close the notch tab-switch item (40 ms isolated; the old 95 ms was input gaps), Spotlight typing (better than stock) and the MC re-sync (negligible).
  - S2 → FX13:
    - the colour filter still blacks the wallpaper after a Genie minimize/unminimize;
    - colour-filter cogl viewport CRITICALs on 0x0 children;
    - the Fedora logo falls back to the GNOME foot (no -symbolic icon in fedora-logos);
    - the glass shadow tail hard edge (St blur truncation).
  - S3 and tech debt → FX13: duplicate DBusMenu parser (menuBarItems is unbounded, can freeze), the isDark and clamp duplicates, magic timeouts (showDesktop:376, clipboard:483, stageManager/view.js:557), Split View `_settling` watchdog, `-nan` at start, the toolbar rect sized once, jagged SM thumbnails, the CC battery capsule, the notch BlueZ warning.
- FX11 → merged: 24 of 28 H7 findings fixed (4 obsolete) plus about 40 sweep fixes; lib/a11y.js; Ctrl+Alt+Tab to the dock, notch, strip and top bar; keyboard-only run 38/38. Remaining: desktop widgets are pointer-only; Tab in Quick Paste and Emoji; text scaling unchecked.
- PR #8 merged into main (94a6ed4). FX12 and FX13 go in a follow-up PR from a fresh branch off main.
- FX12 → merged: the AT-SPI ☰ menu works for Text Editor (read, shortcuts, checked state, activation opens a new window, clean close). It stays OFF by default because focus moves into the popover for about 1 s during a read. Not done: submenu pages, Calculator through Kiwi.
