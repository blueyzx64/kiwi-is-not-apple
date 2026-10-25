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

## 4. Settings (proposed)
`notch` b · `notch-notifications` b=true · `notch-live-activities` b=true · `notch-osd` b=true

## 5. Interactions
- **Auto-hide top bar:** when a notification arrives while the bar is hidden, only the
  pill slides in, not the whole bar.
- **Do Not Disturb:** no banners; live activities still show.
- **Collisions:** `panelMedia.js`, `quickSettingsNotifications.js`, `calendar.js` and the
  OSD all touch this area. See the tech-debt doc for how to resolve them.

## 6. Acceptance
- [ ] No notification is lost. Everything banner-suppressed still reaches the message list.
- [ ] Turning the notch off restores the stock banners and OSD.
