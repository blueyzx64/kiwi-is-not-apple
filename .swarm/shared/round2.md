# Round 2: owner's test feedback (2026-10-27, orchestrator-owned)

The owner tested 3.0.0 on real hardware (Fedora 44, GNOME 50) and reported the bugs below. Every fixer reads this file, plus v3-swarm.md (protocol; Hard rule: never call mcp__claude-code-remote__* tools), v3-build.md (build rules) and verify.md (how to test).

## Quality bar (the owner's words: "no jitter, frame drops, lags, low quality, or low-resolution rendering")
- Reproduce each bug first with real virtual-pointer and keyboard input in the real Shell (/tmp/x2/run-f44.sh; helpers /home/user/kiwi-swarm-tools: lib.sh, perf-lib.sh, README). Then fix it and show the same scenario passing.
- Screenshots: look at them yourself, before and after.
- Smoothness: perf-lib PERF/JITTER lines before and after for every animation you touch: 0 jumps, 0 reversals (one settling spring overshoot allowed), 0 flickers; p95 no worse than the stock baseline you record in the same run.
- Rendering quality: clones and thumbnails must sample at full resolution (no blurry scaled textures). Check with a crop of the screenshot compared against the real window, and say how. Hints:
  - Clutter's `set_content_scaling_filters(Clutter.ScalingFilter.TRILINEAR, Clutter.ScalingFilter.LINEAR)` on scaled clones;
  - avoid offscreen redirect on scaled or rotated actors;
  - use whole-pixel positions;
  - use `Meta.WindowActor` clones, not `get_image()` snapshots.
- If the root cause is in GNOME, Mutter or Fedora, say so with evidence and find a workaround. Installing extra packages in the test roots is allowed (`/tmp/x2/<root>.enter.sh dnf -y --setopt=proxy=$HTTPS_PROXY install …`).
- Code: clean architecture, pure logic in models with tests, enable/disable stay exact mirrors, no magic timeouts, no dead code. `make check` and `make pack-check` pass. Finish with `KIWI_SRC=$PWD /tmp/x2/run-f44.sh 20`: 0 Kiwi errors.
- Commit with `git -c user.name=blueyzx64 -c user.email=samh74490@gmail.com commit`, with no AI trailers. Never push. Work only in your worktree.
- Budget: up to 4 targeted Shell runs plus the final one. Batch your scenarios.

## Owner decisions
- **Window controls:** they live in the app's own titlebar by default and move to the top bar only while a window is maximized or full screen. A new option puts them on the RIGHT side, and RIGHT is now the default. With "right" in the top bar, they sit at the far right of the bar.
- **Top bar:** transparent by default, always. A toggle makes it go solid when a window touches it, off by default. Rounded window corners must stay visible under a transparent bar.
- **Alt+Tab:** opens Kiwi's macOS app switcher by default, replacing GNOME's own. Keep Super+Tab too.
- **Fedora logo:** use the real Fedora logo from the system (fedora-logos, for example `fedora-logo-icon`), recoloured to match the bar's text colour; don't bundle Fedora's artwork. Keep Kiwi's own mark as the fallback.
- **Notch file shelf drag-out:** build the helper app in this repo (helpers/, an RPM spec, its own make target; it is not shipped in the extension zip).
- **Drag to the top-centre of the screen:** shows the tiling layout picker (as on the green-button hover); drop on a layout to tile. Dragging to the top edge elsewhere fills (maximizes) immediately and reliably.
