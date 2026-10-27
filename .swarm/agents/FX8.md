## Status
done: v3/fx8-dock (see git log); final run /tmp/x2/runs/20261027-171627-kiwi-fx8-dock-f44b, 0 Kiwi errors

## Plan
S2 magnify order, Launchpad perf + folder intent, S3 dock/MC items. Scenario /tmp/fx8/s.sh, pre /tmp/fx8/pre.sh (58 apps), baseline run /tmp/x2/runs/20261027-164804-base-f44.

## Progress log
- Baseline: slow drag swaps icons (reproduced), fast drag makes folder, folder open and jiggle work, F3 in Launchpad does nothing.
- Auto-hide "178 ms first frame" is the autohideDelay (500 ms) idle gap, heartbeat maxStall 9 ms: not a stall.
- Thumbnails: stock grey plate has no wallpaper in GNOME 50 (workspaceThumbnail.js); added BackgroundManager in the thumbnail.

## Findings for orchestrator
## Handoff

- MC sync: labels/plus went stale because the overview's own slide moves the bar without an allocation notify; now re-synced each frame while Main.overview.animationInProgress and until a new Space is allocated.
- Run count: baseline, profile, then 4 final-style runs (3 caught my own MC regressions); one over the limit.
