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

## Owner decisions, part 2: window controls and title bars (for R2A)
1. **Where the controls show:**
   - **App with no controls of its own:** a plain title bar showing only the title and buttons (server-side frames, plain GTK3 title bars). Its window controls always show in Kiwi's top bar while it is focused.
   - **App with its own controls:** a GTK4/libadwaita or GTK3 header bar with app buttons. Its controls stay on the app while it neither touches the top bar nor is maximized.
   - **When a window is maximized, full screen, or touching the top bar:** its controls move to the top bar and its own buttons are hidden for that window only.
2. **"Touching the top bar"** means every layout in the green-button menu whose top edge is the work area's top: left and right halves, top halves and quarters, Fill, and every arrangement. It also covers a window dragged up so its top edge sits against the bar. The rule is per window: other windows keep their own buttons.
   - GTK only knows "tiled" states when Mutter tiles the window, so investigate whether Kiwi's tiling can set Mutter's tiled state on GNOME 50 so apps hide their own buttons via their CSS state.
   - If that's impossible, find the best per-window alternative and report the limits.
3. **Optional setting "Hide title bars of maximized windows", OFF by default.** It acts only where it's safe: server-side and X11 frames (via _MOTIF_WM_HINTS on Xwayland windows) and plain GTK3 title bars (CSS). It never hides GTK4/libadwaita header bars.
- Green button click stays FULL SCREEN (owner, option A). Zoom stays on Alt-click and the green menu.

## Round 3: owner feedback (2026-10-28). The same quality bar applies.
1. REMOVE the top-bar window controls entirely. Window buttons always stay on the app's own titlebar (side right by default). The "Hide title bars of maximized windows" option goes too, because maximized windows would have no buttons otherwise.
2. Stage Manager flickers into view and disappears again on minimize or maximize.
3. Dock Downloads popup: once it's open, clicking other dock items doesn't work and the popup doesn't dismiss.
4. Notch shelf drag-out fails when a window is maximized or touching the top bar.
5. Widgets card or gallery: clicking outside doesn't close it, while items under it can still be clicked.
6. Windows in the Stage Manager strip (not on stage) must not show in Mission Control.
7. Going from Mission Control back to the desktop, the top bar glitches and briefly loses its transparency.
8. (owner) The drag-to-top tiling picker must look and animate like Windows 11 Snap Layouts, as the GNOME extension Tiling Shell's "Snap Assistant" does it. Dragging a window towards the top centre reveals a small handle, which expands into a bar of layouts; hover a zone to preview; drop to snap. This is queued after R3A (agent R3F).
9. (owner) Maximize, then full screen: the top bar stays visible (a glitch). In full screen it must hide and reveal only on a push, with a darker tinted bar while revealed over full screen → R3E.
10. (owner) The overview has no button to add a new desktop (the + isn't visible) → R3B.
11. (owner) Maximized windows touch the dock; they need a gap above the dock equal to its bottom margin → R3C.
12. (owner) Top-bar menus open a few px off from the clicked item; align them under the item's leading edge as on macOS → R3E.
