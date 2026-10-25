# UX round 2: owner feedback after installing round 1 on Fedora 44 / GNOME 50

Read-only for workers. The orchestrator merges every `r2/*` branch into `ccr-f3c1f44c-rv5a8r`, then into main.
The rules, harness and evidence standards from `.swarm/shared/ux-round.md` still apply (read it).

The owner's latest screenshot: `/tmp/claude-0/-home-user-kiwi-is-not-apple/1c9cfc23-1f6c-5ceb-aec3-03f023179fb0/scratchpad/user-shots/r2-overview-strip.png`. It shows the overview on another workspace, with the Stage Manager floor floating awkwardly over the left workspace thumbnail.

## The owner's items (verbatim intent)
1. **Stage Manager window grouping.** Windows should be able to appear side by side: drag a window onto another in Stage Manager, or drag a strip window onto the left or right part of the stage to group the two. "How does macOS handle this? And when I open a new app, will the group be minimized?"
2. On another workspace, the Stage Manager strip sits awkwardly in the overview, right over the previous workspace. Fix this.
3. The Control Center is better but still cluttered and doesn't look like macOS. Make it minimal. The same goes for the **clipboard history** popover and the **calendar card** (date menu).
4. Pressing the Super key should open Spotlight, and pressing it again should close it (toggle).
5. Disable scrolling or swiping up into the apps grid. Up gestures are only for the workspace overview.
6. Window edges: rounded corners on the **top-left and top-right only**.
7. Stage Manager: research it more and implement what you find (UX, animations, feature support, customization).
8. When the global mac window controls (top-bar controls) are disabled: revert to **stock GNOME controls on the apps, on the right**. The user can toggle back to macOS-style icons, and the position from right to left.
9. Disable hot gestures (the hot corner).
10. Can Stage Manager minimize all windows? Research this.
11. Add a **"show desktop"** option to the top bar, like macOS. Port the features and the animations.
12. Notch: add the little **outward curves** at the top-left and top-right of the notch, where it meets the screen edge, like the inverse corners of a MacBook notch.

## Global
- Polished, smooth and minimal, like macOS. Plain transparency, no blur.
- Enable and disable stay exact mirrors.
- GNOME 50 only. Don't break `lib/compat.js`.
- `make check` must pass. Real-Shell screenshots are the evidence.
