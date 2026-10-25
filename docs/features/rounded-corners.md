# Rounded window corners

Status: shipped in UX round 1; UX round 2 made it top-corners-only and on by default (owner request).
`rounded-corners` defaults to true, `rounded-corners-which` to 'top'.

## What it does
- Rounds the top-left and top-right corners of normal and dialog windows and keeps the bottom square (`rounded-corners-which` = 'top', the default), or all four ('all'). Radius `rounded-corners-radius` (default 12, range 0–24).
- Skips maximized, tiled and fullscreen windows; override-redirect, popup, menu, tooltip and DND windows; desktop and dock windows; Shell-owned windows.
- Skips apps in `rounded-corners-blacklist`. Entries match WM_CLASS, its instance, GTK and sandboxed app ids, or the tracker app id, ignoring case and `.desktop`.

## How
- One `Shell.GLSLEffect` subclass per `MetaWindowActor` (`apps/roundedCorners/effect.js`).
  - It masks the frame rect inside the buffer rect, with one screen pixel of antialiasing.
  - It is disabled, not removed, while a window doesn't qualify.
  - A `vec4` uniform masks which corners it touches (model.cornerMask: TL, TR, BR, BL).
- Pixels near the arc take the window's own edge (content, CSD outline or shadow) at the same distance from the straight edges. So shadows bend around the corner instead of being cut square.
- Corners the app already rounds at least as much (libadwaita) are left as drawn. So in 'top' mode a libadwaita window keeps its own rounded bottom; plain GTK3/GTK4 and SSD windows get square bottoms.
- The pure geometry and the rules for which windows qualify are in `apps/roundedCorners/model.js` and unit-tested.

## Limits
- GNOME 51 removed `Shell.GLSLEffect`. The feature logs once and does nothing there.
- Each rounded window renders offscreen (one FBO per window). Maximized, tiled and fullscreen windows have the effect disabled, so they paint directly. Fullscreen games keep direct scanout: mutter 50 picks a scanout candidate without painting the stage, and its checks (`find_candidate` in meta-compositor-view-native.c) look at window-actor effects in progress (map/minimize animations) and transitions, not at Clutter effects.
- The shadow around the arc is an approximation of the straight-edge shadow.
