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

## 4. Settings
`stage-manager` b=true · `stage-manager-side` s=`left` · `stage-manager-autohide` b=true ·
`stage-manager-group-by-app` b=true ·
`stage-manager-shortcut` as · `stage-manager-new-windows` s=`replace`|`join` ·
`stage-manager-wallpaper-click` b=true · `stage-manager-tilt` i=22 (0–40) ·
`stage-manager-animation-speed` d=1.0 (0.5–2) · `stage-manager-remove-shortcut` as=Ctrl+Super+Down

## 5. Interactions
- **Stage Manager wins** (owner decision): while it is on, `minimize-to-dock` is paused
  (its saved value is kept) and minimized windows go to the strip. Prefs shows the pause.
- `move-window-to-new-workspace` and tiling are paused while it is on.
- **Window controls:** minimize sends the window to the strip.
- **Overview:** the strip slides out (animated) when the overview opens and back after.
- **Show desktop:** the top bar button calls `inst('stage-manager').toggleDesktop()` (idempotent toggle, `isDesktopShown`).

## 6. Acceptance
- [ ] Uses `Clutter.Clone` of window actors for thumbnails, never screenshots.
- [ ] Non-stage windows are hidden by moving their actors, not by minimizing them, so the
  apps keep running normally.
- [ ] Turning it off restores every window's position, size and visibility.

## 7. Research notes, UX round 2
macOS Stage Manager (Ventura 13, Sonoma 14, Sequoia 15), from Apple's Mac User Guide
("Use Stage Manager") and hands-on write-ups:
- **Sets.** Drag a strip thumbnail onto the centre window, or Shift-click it, to add that app to
  the stage. Drag a window back to the strip to take it out. A set shows in the strip as one
  entry: its windows overlap, slightly offset, all tilted, each app badged.
- **Opening an app** puts it on the stage alone; the whole previous set goes to the strip as one
  entry (it is not minimized, it waits there). A new window of an app already on the stage
  stays in that set.
- **Click wallpaper to reveal desktop** (Sonoma, "Desktop & Dock"): a wallpaper click moves the
  stage aside so the desktop shows; a click on a window or the wallpaper again brings it back.
  In Stage Manager there is no separate "minimize all": the stage itself steps aside.
- **Show recent apps in Stage Manager**: off, the strip stays hidden until the pointer reaches the
  screen edge. The strip also steps aside by itself when a window covers it.
- **Show windows from an application**: *All at Once* (all of an app's windows come with it) or
  *One at a Time* (one window per entry; the others wait).
- **Desktop items** can be shown or hidden while Stage Manager is on (not applicable: GNOME has no
  desktop icons by default).
- **Motion.** Windows shrink and turn into their thumbnail and back (spring curves, ~0.4 s);
  hovering a thumbnail lifts it a little; the strip slides out at the edge; it is not shown in
  Mission Control.

Built in round 2 (Kiwi): sets by drop and Shift-click, side-by-side drops (left or right part of
the stage; middle band = add as is), one stacked entry per set, a set returns with its layout,
new windows replace the stage or join the set (`stage-manager-new-windows`), `toggleDesktop()`
and wallpaper click (`stage-manager-wallpaper-click`), remove from set by dragging the titlebar
onto the strip or `stage-manager-remove-shortcut` (Ctrl+Super+Down), hover peek with app names,
strip tilt and animation speed settings, "Windows from an app" as All at once / One at a time
(`stage-manager-group-by-app`), the strip hidden (animated) in the overview, per-workspace strips
that slide on a workspace switch. Sets live in memory per workspace for the session.

Limits: side by side uses `move_resize_frame` (mutter's tiling has no public API on 50); the
frames and maximized state are put back when the set breaks up or Stage Manager turns off.
A set of more than two windows dropped side by side gets equal columns. An app whose minimum size is wider than its column keeps that size (and mutter then ignores the move), so a second pass places the windows at the sizes they took: equal gaps when they fit, else overlapping evenly, always inside the stage; a fixed-size window is centred in its column. Without auto-hide, the strip still steps aside for a maximized or fullscreen stage window and comes back from the screen edge, as on macOS.
