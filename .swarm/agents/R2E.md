## Status
working (started; no code changes yet)

## Plan
1. Probe overview structure (controls group order, thumbnailsSlider) in the real Shell; reproduce bug 1 (spaces layer in overviewGroup is above windows).
2. Move the Spaces chrome layer next to the thumbnails slider (below workspacesDisplay), mirror slider opacity/translation, position via relative transforms; drop per-frame resync.
3. Bug 2: compare clone sharpness at progress 0.9 stock vs Kiwi; try scaling filters / no offscreen redirect.
4. Bug 3: new-Space animation; track_actor on thumbnails, labels, plus: 0 jumps.
5. make check, make pack-check, final run-f44.sh 20, commit.

## Progress log
- 2026-10-27: read briefs and missionControl/index.js, spaces.js. Layer is added to Main.layoutManager.overviewGroup (above everything) with a per-frame laters resync while animationInProgress.

## Findings for orchestrator
(none yet)

## Handoff
Worktree /home/user/kiwi-r2-mission, branch v3/r2-mission, clean. Scenario scripts go in the scratchpad.
