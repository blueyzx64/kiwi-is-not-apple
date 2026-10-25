# Stage Manager

## 1. Summary
The focused app's windows sit on a centre "stage". Other apps become tilted, stacked
live thumbnails in a strip at the side; clicking one swaps it onto the stage.

## 2. Locked decisions
- It is a must-have and is built last (largest and riskiest).
- v1: thumbnails, click to switch, auto-hide strip, group by app. Dragging a thumbnail onto
  the stage to group it is v2.
- It can be toggled from the top bar, the Control Center tile, Spotlight and a shortcut.

## 3. UI
- Strip: 200px wide, left side (right side optional), up to 6 stacks. Thumbnails are
  180×116 with `perspective rotateY(24°)` and a stacked shadow layer. The app icon badge is
  34px.
- Stage: the focused window is centred in the remaining area. It keeps the user's size
  unless it would overlap the strip.
- Motion: windows going to the strip scale to about 0.22 toward it over 0.5 s.
- Auto-hide strip: hides when a stage window overlaps the strip and reveals at the edge.

## 4. Settings (proposed)
`stage-manager` b=false · `stage-manager-side` s=`left` · `stage-manager-autohide` b=true ·
`stage-manager-group-by-app` b=true · `stage-manager-recent-count` i=6 ·
`stage-manager-shortcut` as

## 5. Interactions
- While it is on, `minimize-to-dock` is turned off: minimized windows go to the strip.
- `move-window-to-new-workspace` and tiling are paused while it is on.
- **Window controls:** minimize sends the window to the strip.
- **Overview:** the strip is hidden in the overview.

## 6. Acceptance
- [ ] Uses `Clutter.Clone` of window actors for thumbnails, never screenshots.
- [ ] Non-stage windows are hidden by moving their actors, not by minimizing them, so the
  apps keep running normally.
- [ ] Turning it off restores every window's position, size and visibility.
