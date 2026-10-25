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
| Notification | 430×140, radius 32 | Icon, app · time, title, body, actions (≤2) |
| Dashboard | 640×200, radius 36 | Now Playing · Up next · Clipboard |

- Motion: grows with a spring (≈ 0.45 s, slight overshoot) and shrinks with ease-out.
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
- **Auto-hide top bar:** when a notification arrives while the bar is hidden, only the
  pill slides in, not the whole bar.
- **Do Not Disturb:** no banners; live activities still show.
- **Collisions:** `panelMedia.js`, `quickSettingsNotifications.js`, `calendar.js` and the
  OSD all touch this area. See the tech-debt doc for how to resolve them.

## 6. Acceptance
- [ ] No notification is lost. Everything banner-suppressed still reaches the message list.
- [ ] Turning the notch off restores the stock banners and OSD.
