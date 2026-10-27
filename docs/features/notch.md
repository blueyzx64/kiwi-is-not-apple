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

## Real-player test, round 3 (Rhythmbox + a GStreamer MPRIS player)
- A paused player keeps its pill with the waveform at rest; a stopped one leaves. With several
  players, playing beats paused beats stopped, and the one that started playing last wins
  (`lib/mprisModel.js`, tested).
- A player with nothing loaded (Rhythmbox at startup: empty Metadata, Stopped) is not a player
  yet, so the dashboard keeps the clock instead of "Unknown title".
- A click on the dashboard scrubber seeks there (MPRIS SetPosition).
- Dashboard list bodies honour notification markup like the card (Rhythmbox sends `<i>`).

## Notch v3 (P5)

**Behaviour.** The pointer resting on the notch for `notch-hover-delay` (300 ms) opens it
(`notch-hover-expand`, on); it closes 0.6 s after the pointer leaves. A click opens it too, or pins
a hovered one: then the notch holds a grab, and a click outside or Escape closes it (2.5 s after
leaving otherwise). A notification card under the pointer is never replaced by a hover.

**Expanded view: one 648x192 shape for every tab** (no resize when switching; the body slides
24 px from the side of the tab and crossfades through core/motion):
- *Now*: the media hero (art, title, scrubber, controls) or a large clock, then up to three rows:
  live activities first (with their buttons: pause/resume/cancel a timer, stop a recording, copy a
  code), then recent notifications and "N more".
- *Tray*: the file shelf (below), and the clipboard column when `notch-show-clipboard` is on.
- *Widgets*: calendar day (today's next events from the calendar server), weather (the date menu's
  own WeatherClient; no second client), and controls: Focus (Do Not Disturb), microphone mute
  (the Shell's mixer) and 1/5/15-minute Kiwi timers.

**Live activities.** Sources in `sources/`, each switchable (`notch-activity-*`, `notch-copy-codes`):

| Source | From | Pill | Now tab |
|---|---|---|---|
| Battery | UPower DisplayDevice (signals) | "Charging 62%" 4 s on plug-in; "Low Battery" 8 s when crossing 20 % / 10 % | "Charging" while charging |
| Headphones | BlueZ ObjectManager + Battery1 | "connected" 4 s with battery | a row per connected audio device |
| Timers | `core/timers.js` (Kiwi's own; Spotlight can call `ctx.timers.startTimer`) | countdown; "Done" 10 s with the system "complete" sound | pause/resume, cancel |
| Recording | core events `recording-started/stopped`, emitted from the Shell's `screenshotUI.screencast-in-progress` until a recording owner emits them | red dot, elapsed, stop | stop |
| Next event | the Shell's `DBusEventSource` (own instance) | from 15 min before ("in 9 min", then "Now") | later events of the day |
| Downloads | LauncherEntry `progress` + partial files in Downloads (`.part`, `.crdownload`, ...) | name or count, progress bar or bytes | same |
| One-time codes | every notification in the tray, read locally (`model.detectCode`) | "Code 482913 [Copy]" 30 s | Copy |

Priority (model.js `KINDS`): alerts first for their few seconds (timer done > code > low battery
> charger / headphones connected), then recording > timer > playing media > download > event soon
> paused media. Quiet state (charging, connected headphones, a later event) never takes the pill.
Equal priority: newest wins.

**File shelf: how files get in on Wayland (measured on GNOME Shell 50.6).** A drag that starts in
a Wayland app is not delivered to Shell actors as Clutter DnD; the app sees no drop target and
cancels. But Mutter shares the drag with the compositor: `global.backend.get_dnd()` (Meta.Dnd, as
the Shell's xdndHandler uses) emits `dnd-enter`, `dnd-position-change(x, y)` for every move and
`dnd-leave` at the end, and the dragged data is the **DND selection**: `Meta.Selection`
`get_mimetypes(SELECTION_DND)` lists `text/uri-list` and `transfer_async()` returns the links. At the
release the selection is dropped *before* `dnd-leave`, so `drop.js` reads the links as soon as the
drag enters the notch's drop zone (at least 420x72 at the top centre), opens the Tray as a drop
area, and adds them if the drag ends there. The source app still animates a cancelled drag (it
got no drop), which is the one visible difference from macOS. Also in: "Add from Clipboard" (files
copied in Files: `x-special/gnome-copied-files`, `text/uri-list`, or a copied path), finished
downloads (`notch-shelf-downloads`) and screenshots (`notch-shelf-screenshots`). **Out:** a Shell
actor cannot start a Wayland drag (Mutter exposes no compositor-side data source to GJS), so items
offer Open, Show in Files (FileManager1), Copy (`text/uri-list`, pastes as the file in Files) and
Remove. Only links are stored (`notch-shelf`); files are never copied, moved or deleted.

**Look and motion.** Pure black, no glass layer, the ears kept; Apple's dark system colours for
tints (orange timers, red recording/low battery, green charging, blue downloads); 12 px minimum
type, tabular figures for times and codes. Shape springs through `core/motion`
(`{response 0.42, damping 0.8}` growing, critically damped shrinking); reduced motion and
animations-off jump with a short crossfade. The waveform scales fixed-height bars (transforms,
no relayout).
