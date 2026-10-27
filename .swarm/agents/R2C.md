## Status
done: v3/r2-dock committed
## Plan
1 dock band clip; 2 genie frames audit (SM off/on, bottom/left/right); 3 maximized dock visibility
## Progress log
- 2026-10-27: band clip_to_allocation now false at rest, true only while auto-hide slides (view.js); magnify no longer toggles it. Verified: icon drawn 70px above dock (run 20261027-190116 bounce-high.png).
- Scenario /tmp/claude-0/r2c/s.sh (run2.out): genie frames at 10/25/50/75/90, 3 positions, SM on/off, maximize. Run 1 had Stage Manager on (target was SM strip, edge left) so genie frames were invalid; rerun with KIWI_ONLY=liquid-glass.
- Dock code has no intellihide; strut reserved unless autohide.
## Findings for orchestrator
- Harness default turns Stage Manager on; minimize target then is the SM strip.
## Handoff
Review run2 shots, fix genie if wrong, check maximize, make check, commit.
- Genie fixed (strips on a container+clone). perf: genie p95 25.4ms 0 jumps/reversals/flickers vs overview baseline p95 36.2; scale p95 31. Final run 0 Kiwi errors.
- Maximize (super+Up): dock stays, window ends at dock top (frame 0,32,1280,694; band y=726). Dock code has no intellihide. Likely owner case = green button = full screen (windowControls default 'fullscreen') -> trackFullscreen hides top bar AND dock. Shared cause with R2B.
- Stage Manager on: minimize goes to SM strip with no Genie run (SM path).
