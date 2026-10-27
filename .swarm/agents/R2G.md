## Status
working: v3/r2-desktop (worktree /home/user/kiwi-r2-desktop), code done, final harness runs + commit left
## Plan
1. features/desktopIcons (model+tests, source/layer/tile/rename/ops, prefs, css), core/desktopLayers (stack + reserved rects), lib/backgroundMenu, lib/contextMenu
2. widgets: macOS sizes 170/364x170/364x382/715x382 (core/widgets/model.js SIZE_PX), radius 24, padding 16, typography, kinds redesigned
3. harness runs with real pointer/keys, perf-lib, screenshots
## Progress log
- 2026-10-27 icons: top-right flow, thumbnails (GNOME cache), click/double/rubber band/drag/rename/trash/new folder/keys/menus/DING all verified in real Shell (f44 root only: installed glycin-thumbnailer there; run with ARCH=/tmp/x2/f44 /tmp/x2/run-real.sh)
- GNOME 50 Clutter.Event has NO get_click_count (use isDoubleClick in model with Clutter.Settings)
- Non-reactive actor gets no key events: layer handles KEY_PRESS from stage captured-event while stage.key_focus === layer
- Test root cannot generate thumbnails (bwrap sandbox) -> scenario seeds the cache via GnomeDesktop save_thumbnail
## Findings for orchestrator
- no new top-level source folder was added (all under features/, core/, lib/ already in EXTRA and --extra-source)
- extension.js: 'desktop-icons-layout' added to KEYS_THAT_NEVER_AFFECT_FEATURES
- Notification Center WIDTH 380 -> 392 so a Medium widget (364) fits
- harness: window-controls-left probe fails on this branch (key window-controls-side absent) - not mine
- drag-out to apps: event 'desktop-icons-selection' is the hook (docs/features/desktop-icons.md section 5); shelf helper in r2-notch was uncommitted
## Handoff
commit on v3/r2-desktop; screenshots only in /tmp/x2/runs
