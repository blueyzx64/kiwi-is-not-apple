# Board (orchestrator-owned)

| ID | Model | Package | Worktree / branch | Depends on | Status |
|---|---|---|---|---|---|
| P1-menubar | (earlier agent) | Menu bar, logo menu, app menu P1 | kiwi-v3-menubar / v3/p1-menubar | | merged |
| P1-windows | (earlier agent) | Tiling, green menu, Hide | kiwi-v3-windows / v3/p1-windows | | running |
| L1 | sonnet | P2 Dock motion & extras: Genie/Scale minimize, bounce, magnification, LauncherEntry badges, grey background-app dots, folder Stacks | kiwi-l1 / v3/l1 | dock merged | merged |
| L2 | sonnet | P2 System surfaces: Tahoe volume/brightness OSD under the menu bar, centred dialogs, colour filters | kiwi-l2 / v3/l2-surfaces | | started |
| L3 | sonnet | P2 Screenshot toolbar (Shift+Super+3/4/5) + floating thumbnail | kiwi-l3 / v3/l3-screenshot | | started |
| L4 | sonnet | P2 Input: Caps Lock / input-source badge, emoji popover, icon styles (dark/tinted) | kiwi-l4 / v3/l4-input | | started |
| L5 | sonnet | P3 Mission Control + App Exposé + start-on-desktop | kiwi-l5 / v3/l5-mission | | started |
| L6 | sonnet | P3 App switcher (Super+Tab, Super+`) + trackpad gestures + hot corners | kiwi-l6 / v3/l6 | | merged |
| L7 | sonnet | P3 Launchpad (folders, jiggle delete with installer/Flatpak rules) + click-wallpaper/Show Desktop wiring + full screen Split View | kiwi-l7 / v3/l7-launchpad | | merged |
| L8 | sonnet | P4 Stage Manager v3 rebuild on core (sets, strip, other-side rule with dock, scenario + fuzz suites) | kiwi-l8 / v3/l8-stage | | started |
| L9 | sonnet | P5 Notch v3: hover, tabs, live activities, file shelf, perf | kiwi-l9 / v3/l9-notch | | started |
| L10 | sonnet | P5 Notification Center column (clock click), Focus modes, time-sensitive | kiwi-l10 / v3/l10-nc | | started |
| L11 | sonnet | P5 Widget model + desktop widget layer + gallery + built-in widgets | kiwi-l11 / v3/l11-widgets | | started |
| L12 | sonnet | P6 App menu providers: GTK menubar, DBusMenu registrar, AT-SPI, Help search | kiwi-l12 / v3/l12 | P1-menubar | started |
| L13 | sonnet | P6 Spotlight Tahoe features | kiwi-l13 / v3/l13-spotlight | | merged |
| L14 | sonnet | P6 Control Center customisation, pinned controls, status-item (SNI) host, menu bar item manager, Low Power/battery rows | kiwi-l14 / v3/l14 | P1-menubar | started |
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
