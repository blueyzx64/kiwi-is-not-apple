# R2A
## Status
done: v3/r2-windows (2 commits on 383ce32)
## Findings for orchestrator
- Root cause drag: TileDrag tracked the pointer via the window's position-changed; Mutter clamps the window under the bar so no event arrives at y<32 (+150ms dwell, release needed _shown). Now pointer watcher (16ms) + immediate top zones.
- Harness: /tmp/x2/inner-real.sh uses --no-x11; copies in /tmp/r2a (run-f44-x.sh). Probe window-controls-left in inner-real.sh expects the old left default and now fails.
- Not verified: SSD/X11 (rhythmbox X11 never mapped), green-menu hover open in fullscreen (button hover=false under virtual pointer).
