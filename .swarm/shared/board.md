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
