# Auto-hide top bar (removed)

> **Removed in UX round 1 (owner decision).** "Remove the option to minimize (auto-hide) the top
> bar, since it houses the notch." The coordinator (`coordinators/panelVisibility*.js`), the prefs
> page, the Control Center *Hide Top Bar* tile and its CSS are gone. The `panel-autohide*` keys
> stay in the schema, marked deprecated and unread, so existing dconf settings stay valid; a user
> who had it on simply gets the stock, always-shown bar with its normal strut. The spec below is
> kept for the record only; do not build from it.

## 1. Summary
The top bar slides out of view so windows get the full height. It slides back in when
the pointer reaches the top edge. Canvas board: "Auto-hide top bar + button-free windows".

## 2. Locked decisions
- It is a user toggle, **on by default** (owner decision).
- It reveals when the pointer **reaches the top edge**, with a short dwell; it hides
  after the pointer leaves.
- Windows get the full height: no strut while the bar is hidden.

## 3. UI
- Slide: translateY(-height) + fade, 0.32 s ease-out. Reveal dwell 0.15 s by default.
  Hide delay 0.6 s.
- While shown, the bar overlays the window; it does not push it down.
- It also reveals on: the overview, an open panel menu, keyboard focus into the panel
  (Ctrl+Alt+Tab), a notification arriving (only the notch, see notch.md), and the lock screen.
- Optional: stay visible on an empty desktop.
- Multi-monitor: only the primary monitor has the panel; other monitors are unaffected.

## 4. Settings (proposed)
`panel-autohide` b=true · `panel-autohide-reveal-delay` i=150 (ms) ·
`panel-autohide-hide-delay` i=600 (ms) · `panel-autohide-keep-on-desktop` b=false

## 5. Interactions
- **Supersedes `panel-hover-fullscreen` / `apps/panelHover.js`.** Both must share one
  reveal engine; migrate that key to "auto-hide only in fullscreen".
- **Panel transparency:** while it is auto-hiding, the bar always uses its overlay style
  (glass or solid). The "opaque when a window touches it" logic is off.
- **`overviewSeamlessZoom.js`:** check that its strip behind the panel still works when the
  panel is translated.

## 6. Acceptance
- [ ] Uses a pointer barrier or pressure barrier, or a thin input-region actor; no timers
  polling the pointer.
- [ ] Turning it off restores struts, the panel position and the trackChrome flags exactly.
