# Notification notch

## 1. Summary
A black pill hanging from the centre of the top bar. It grows to show notifications,
live activities and quick confirmations, and opens a dashboard on click. Canvas board:
"Notification notch states".

## 2. Locked decisions
- The pill sits in the centre of the top bar; the clock moves right (this reuses
  `calendar.js`).
- It replaces GNOME's notification banners (optional, on by default). The notification
  history stays in the calendar menu.

## 3. UI: five states
| State | Size (w×h) | Content |
|---|---|---|
| Idle | 190×32 | Empty |
| Live activity | 250×32 | Media art + waveform, timer, recording, charging |
| Confirmation | 250–290×32 | Copied, volume, brightness, a toggle changed. 1.5 s |
| Notification | 430×116 (156 with actions), radius 32 | Icon, app · time, title, body, actions (≤2) |
| Dashboard | 648×192 with media, 476×144–168 without, radius 32 | Player or clock · notifications · (clipboard) |

- Motion: grows with a spring (≈ 0.45 s, slight overshoot) and shrinks with ease-out.
- Ears: two 10px concave fillets flare the notch into the screen's top edge at its top-left and
  top-right, like a MacBook notch. They follow the island through every width (snap constraints)
  and stay while it is expanded, so the card also flows out of the top edge.
- Hover keeps a notification open. With several queued, show the newest and a "+2" badge.
- On screens with a real hardware notch, align to it (future).

## 4. Settings
`notch` b=true · `notch-notifications` b=true · `notch-live-activities` b=true · `notch-osd` b=true ·
`notch-timeout` i=5 (range 2 to 30 s): how long a notification stays in the notch. Hovering keeps it
open and urgent ones stay until dismissed.

**Calendar forcing.** While the notch is on, the clock moves right and the notification list lives in
Quick Settings, whatever `move-calendar-right` says (`calendarRight` in `features.js`). Prefs shows a
subtitle on the notch row and greys out the `move-calendar-right` row with "On while the notch is on".

**Status:** merged, untested on Shell. Phase 1 has notification cards, the media live activity,
the volume and brightness confirmations, the Clipboard dashboard panel and the "Copied" confirmation.

**Deferred to phase 2 (decided):**
- the "Up next" dashboard panel (MPRIS has no reliable queue API);
- the timer, recording and charging live activities;
- "toggle changed" confirmations.

## 5. Interactions
- **Auto-hide top bar:** removed (the bar houses the notch and is always on screen).
- **Do Not Disturb:** no banners; live activities still show.
- **Collisions:** `panelMedia.js`, `quickSettingsNotifications.js`, `calendar.js` and the
  OSD all touch this area. See the tech-debt doc for how to resolve them.

## 6. Acceptance
- [ ] No notification is lost. Everything banner-suppressed still reaches the message list.
- [ ] Turning the notch off restores the stock banners and OSD.

## Research notes, UX round 2
Sources: Apple HIG (Live Activities, Typography, Layout), the iPhone Dynamic Island as shipped,
and the open macOS notch utilities (boring.notch / TheBoringNotch, DynamicNotchKit) plus the
published screenshots of NotchNook and Alcove. Web pages gave little exact geometry, so the
numbers below come from those apps' layouts and Apple's type scale, not from specs.

- **Dynamic Island.** Three presentations. *Compact*: a leading and a trailing view either
  side of the cutout (music: album art left, an animated waveform tinted from the art right;
  no title). *Minimal*: one round view when two activities compete. *Expanded* (long press):
  leading / trailing / centre / bottom regions; music shows art (~rounded square) at the top
  left, title and artist beside it, the waveform at the top right, then a full-width scrubber
  with elapsed and remaining time and a centred prev / play / next row. Black, no borders;
  content keeps a uniform inset from the curved edge.
- **Motion.** The shape morphs on a spring (slight overshoot growing, none shrinking); the
  content fades in only once the shape is nearly there and fades out at once on collapse, so
  text never squeezes. HIG caps live-activity animations at 2 s; reduced motion → no bounce.
- **macOS notch apps.** boring.notch: a closed notch that widens for music (art at left,
  visualizer at right), an open panel of ~640×190 with a header row level with the menu bar
  (tabs Home / Shelf at left, settings at right), the player as the hero (large rounded art,
  title / artist, scrubber, controls), calendar beside it. NotchNook: "Nook" and "Tray"
  (file shelf) tabs in the header, media widget left, calendar / shortcuts right. Alcove:
  Dynamic-Island-like compact states, HUD replacement, a clean expanded player. Shared traits:
  pure black, ~16–20px outer padding, one header band, two balanced columns with tops
  aligned, no captions such as "Now Playing", controls as bare white glyphs.
- **Type and spacing (HIG).** macOS body 13 pt, headline 13 bold, title 3 15 semibold,
  caption 10–11; for a glanceable overlay we use 15 semibold media title, 14 semibold primary,
  12–13 secondary at 60 % white, never below 12. 4-pt spacing grid; 28-pt hit targets
  (32 here); concentric radii.

**Decisions.** Header band (32px, level with the top bar): the date at left when a player is
shown, a 28px moon toggle for Do Not Disturb at right (accent fill when on). With media: hero
column (68px art at 12px radius, 15/13 text, app icon top-right, 4px scrubber with times
when MPRIS gives a length and position, 32px bare glyph controls), list beside it. Without
media: a 40px clock and the date replace the player, no "Nothing is playing" block. List:
44px rows, 20px icons, title 14 semibold with the time at right, body (or app) 12; at most 2
rows and an "N more" text button that opens the message list. Grid, sizes and the spring
live in `apps/notch/dashboardModel.js` (tested). Not done: the next calendar event (needs
the calendar server; later), remote cover art keeps square corners (only local art is
clipped to the radius, remote art loads as an icon through GIO).
