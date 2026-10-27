# Board (orchestrator-owned)

| ID | Model | Package | Worktree / branch | Depends on | Status |
|---|---|---|---|---|---|
| P1-menubar | (earlier agent) | Menu bar, logo menu, app menu P1 | kiwi-v3-menubar / v3/p1-menubar | | merged |
| P1-windows | (earlier agent) | Tiling, green menu, Hide | kiwi-v3-windows / v3/p1-windows | | running |
| L1 | sonnet | P2 Dock motion & extras: Genie/Scale minimize, bounce, magnification, LauncherEntry badges, grey background-app dots, folder Stacks | kiwi-l1 / v3/l1-dock-motion | dock merged | started |
| L2 | sonnet | P2 System surfaces: Tahoe volume/brightness OSD under the menu bar, centred dialogs, colour filters | kiwi-l2 / v3/l2-surfaces | | started |
| L3 | sonnet | P2 Screenshot toolbar (Shift+Super+3/4/5) + floating thumbnail | kiwi-l3 / v3/l3-screenshot | | started |
| L4 | sonnet | P2 Input: Caps Lock / input-source badge, emoji popover, icon styles (dark/tinted) | kiwi-l4 / v3/l4-input | | started |
| L5 | sonnet | P3 Mission Control + App Exposé + start-on-desktop | kiwi-l5 / v3/l5-mission | | started |
| L6 | sonnet | P3 App switcher (Super+Tab, Super+`) + trackpad gestures + hot corners | kiwi-l6 / v3/l6-switcher | | started |
| L7 | sonnet | P3 Launchpad (folders, jiggle delete with installer/Flatpak rules) + click-wallpaper/Show Desktop wiring + full screen Split View | kiwi-l7 / v3/l7-launchpad | | started |
| L8 | sonnet | P4 Stage Manager v3 rebuild on core (sets, strip, other-side rule with dock, scenario + fuzz suites) | kiwi-l8 / v3/l8-stage | | started |
| L9 | sonnet | P5 Notch v3: hover, tabs, live activities, file shelf, perf | kiwi-l9 / v3/l9-notch | | started |
| L10 | sonnet | P5 Notification Center column (clock click), Focus modes, time-sensitive | kiwi-l10 / v3/l10-nc | | started |
| L11 | sonnet | P5 Widget model + desktop widget layer + gallery + built-in widgets | kiwi-l11 / v3/l11-widgets | | started |
| L12 | sonnet | P6 App menu providers: GTK menubar, DBusMenu registrar, AT-SPI, Help search | kiwi-l12 / v3/l12 | P1-menubar | started |
| L13 | sonnet | P6 Spotlight Tahoe features | kiwi-l13 / v3/l13-spotlight | | started |
| L14 | sonnet | P6 Control Center customisation, pinned controls, status-item (SNI) host, menu bar item manager, Low Power/battery rows | kiwi-l14 / v3/l14 | P1-menubar | started |
| L15 | sonnet | P7 Installer integration (Kiwi side) + onboarding | kiwi-l15 / v3/l15-installer | | started |
| R1–R5 | sonnet | Adversarial review of merged work | read-only | merges | R1–R3 started |
| H* | haiku | see helper list below | | | |

## Helper tasks (haiku)
| ID | Task | Status |
|---|---|---|
| H1 | Unit-test hardening: core/events + core/layout models | merged |
| H2 | Unit-test hardening: core/desktop + core/motion models | merged |
| H3 | Unit-test hardening: core/originals (incl. ListMembersOwner, crash restore) | started |
| H4 | Verify on GNOME 50 source: the reduced-motion key and the notification-grouping API | queued |
| H5 | Verify: Input Capture portal, localsearch xattr tags, Clocks timer D-Bus, Night Light location keys | queued |
| H6 | SVG icon set for new features (symbolic, GNOME style): show-desktop, logo-kiwi, mission-control, launchpad, stage-manager, notification-center, widgets | queued |
| H7 | Accessibility audit: accessible names and keyboard focus for every new Kiwi actor (report only) | queued |
| H8 | Prefs consistency audit: every schema key has a prefs row or is internal (report only) | queued |
| H9 | Harness library: reusable scenario helpers (launch app, wait window, click actor, drag, shot) → /home/user/kiwi-swarm-tools/lib.sh | queued |
| H10 | Dock scenario script set using H9's library (regression suite) | queued |
| H11 | Glass/Appearance scenario script set (regression suite) | queued |
| H12 | i18n audit: user-visible strings missing _() / N_() (report only) | queued |

Concurrency cap: 20 agents at once (environment limit). H2–H12 are queued and start as slots free.

## Open findings to fix (orchestrator triage)
- F1 (H2): `core/motionModel resolve(req, {reducedMotion:true})` with no `animations` field is treated as animations OFF. It should default to animations on.
- F2 (H2): `core/desktopModel windows({minimized:true})` doesn't filter (only `false` does); it should return only minimized windows.
- F3 (H2): `upsertWindow(id, {appId: undefined})` stores undefined instead of keeping the default.
- F4 (H1): EventHub snapshots listeners per emit, so an owner released mid-emit still receives that emit (acceptable, documented).
- F5 (H1): a layout claim with `stack:false` and `reserve:'soft'` doesn't shrink the work area (intended: soft means no strut).
