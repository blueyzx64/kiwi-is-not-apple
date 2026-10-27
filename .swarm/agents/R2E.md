## Status
nearly done: v3/r2-mission committed; final run-f44.sh 20 pending

## Plan
done: 1 chrome as thumbnail children; 2 sharp previews (rounded-corner effect off in overview); 3 centringShift for add/remove.

## Progress log
- 2026-10-27: root causes found. Bug1: layer in overviewGroup above whole overview; ControlsManager/ThumbnailsBox allocate no foreign children, so chrome became children of each thumbnail (FixedLayout), translations set on notify::allocation (same frame). Bug2: KiwiRoundedCornersEffect's offscreen texture on WindowActor, painted by overview Clutter.Clone, 40% less edge contrast (36040 -> 21495 gradient sum at p90); scaling filters did not help; effect disabled while overview visible. Bug3: stock ThumbnailsBox centres with n incl. collapsed thumbs and assumes it gets n*maxW width: 33px jump then glide; centringShift as box.translation_x.
- Evidence: scratchpad e/ (main.sh, out-*), runs 20261027-203645 (before) vs 20261027-213816 (after).

## Findings for orchestrator
- roundedCorners hunk (features/roundedCorners/index.js) is outside missionControl: effect off while overview.visible.
- Pre-existing: GLib-GObject-CRITICAL "-nan translation-y" once at shell start (also in the before run), not from Kiwi MC.
- 9+ Spaces: the + clips at the screen edge.

## Handoff
Commit on v3/r2-mission. Do not push.
