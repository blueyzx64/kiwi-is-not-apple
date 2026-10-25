# Rounded window corners

Status: shipped in UX round 1 (owner request). Opt-in: `rounded-corners` defaults to false.

## What it does
- Rounds all four corners of normal and dialog windows, macOS style, radius `rounded-corners-radius` (default 12, range 0–24).
- Skips maximized, tiled and fullscreen windows; override-redirect, popup, menu, tooltip and DND windows; desktop and dock windows; Shell-owned windows.
- Skips apps in `rounded-corners-blacklist`. Entries match WM_CLASS, its instance, GTK and sandboxed app ids, or the tracker app id, ignoring case and `.desktop`.

## How
- One `Shell.GLSLEffect` subclass per `MetaWindowActor` (`apps/roundedCorners/effect.js`).
  - It masks the frame rect inside the buffer rect, with one screen pixel of antialiasing.
  - It is disabled, not removed, while a window doesn't qualify.
- Pixels near the arc take the window's own edge (content, CSD outline or shadow) at the same distance from the straight edges. So shadows bend around the corner instead of being cut square.
- Corners the app already rounds at least as much (libadwaita) are left as drawn.
- The pure geometry and the rules for which windows qualify are in `apps/roundedCorners/model.js` and unit-tested.

## Limits
- GNOME 51 removed `Shell.GLSLEffect`. The feature logs once and does nothing there.
- Each rounded window renders offscreen, so direct scanout is off for it. Maximized and fullscreen windows keep scanout.
- The shadow around the arc is an approximation of the straight-edge shadow.
