# macOS shell patterns: reference behaviour for Kiwi

Summary: how the macOS 26 Tahoe system UI behaves. Covers the menu bar and its
extras, Control Center, notifications, Spotlight, Stage Manager, Mission
Control, Dock, window controls and full-screen reveal. Each section ends with
a "Kiwi translation" line. Values marked **[unverified]** come from community
sources or observation, not Apple documentation.

## Contents
1. Menu bar
2. Menu bar extras (status items)
3. Control Center
4. Notifications and Notification Center
5. Live Activities on Mac
6. Spotlight (Tahoe)
7. Stage Manager
8. Mission Control and Spaces
9. Dock
10. Window controls (traffic lights)
11. Full-screen and auto-hide menu bar
12. Popovers, panels, menus
13. Sources

---

## 1. Menu bar

- It is **24 pt tall** (HIG, The menu bar).
- The leading edge holds the Apple menu, then the bold app name, then the
  app's menus in fixed order: File, Edit, Format, View, app menus, Window,
  Help. Extras sit on the trailing edge.
- When space runs short, the system shrinks spacing and truncates titles, and
  it hides extras before app menus.
- In Tahoe the menu bar is **transparent by default**: glyphs sit directly on
  the wallpaper. A "Show menu bar background" setting in System Settings >
  Menu Bar restores a bar background. (Apple newsroom; Apple Support
  mchlad96d366)
- Window controls **never** appear in the macOS menu bar (HIG platform table).
  iPadOS does put them there for full-screen apps.

**Kiwi translation:** Kiwi's "window controls in top bar" feature follows the
*iPadOS* precedent, not the macOS one. Say so in its docs. Keep the GNOME
centre clock unless the island replaces it. Default the panel to transparent
glass, offer "Show top bar background", and keep 28px height.

## 2. Menu bar extras

- A menu bar extra is a monochrome template glyph. The system recolours it for
  light or dark bars and for the selected state.
- Clicking one should open **a menu, not a popover**, unless the content is
  too complex for a menu (HIG). Control Center and Wi-Fi are system exceptions.
- The user, not the app, decides whether the extra is shown. Don't rely on its
  position.
- You rearrange extras by Command-dragging and remove one by Command-dragging
  it off the bar. In Tahoe, third-party app controls can be added to Control
  Center and the menu bar. (Apple Support mchlp1446, 122868)

**Kiwi translation:**
- Status icons use `-st-icon-style: symbolic`, 16px icons in a 28px hit area,
  and 8px `-natural-hpadding` (matching the existing `.kiwi-panel-styled`).
- Clipboard history can be a panel *menu* with rich rows. That is acceptable
  because the HIG allows popovers for complex content.

## 3. Control Center

- It opens from a menu bar glyph as a glass panel of **modules**: Wi-Fi,
  Bluetooth, AirDrop, Focus, Display, Sound, Now Playing, Screen Mirroring,
  Stage Manager and more.
- Some modules **expand in place** into a detail view, such as the Wi-Fi network
  list.
- In Tahoe it is fully customizable. Choose *Edit Controls* to add, remove or
  resize controls, including third-party controls built with App Intents.
  Menu-bar placement is managed in System Settings > Menu Bar or by dragging
  from Edit Controls. (Apple Support mchl4af84660, 122868)
- Control anatomy is a **symbol, a title and an optional value**. The tint
  colour shows the "on" state. Toggles animate between states. Controls with a
  duration animate until they finish. (HIG Controls)
- A control shows only its symbol at the small size, and adds its title and
  value at larger sizes (HIG Controls). The medium/large split and grid units
  are **[unverified: not in Apple docs]**.

**Kiwi translation:** extend GNOME Quick Settings into a 4-column grid of
modules. Full rules are in `feature-design-specs.md` §6.

## 4. Notifications and Notification Center

- Banners appear at the **top-right** and dismiss themselves after a few
  seconds. *Alerts* stay until the user acts. Both styles are set per app.
- A notification shows the app icon on the leading side, a title, a body and
  up to **4 actions** in the expanded view. Keep text concise and in sentence
  case, and let the system truncate. (HIG Notifications)
- Use an alert, not a notification, for errors. Don't send duplicate
  notifications for the same thing.
- Notification Center opens when you click the clock. It holds notifications
  grouped by app, plus widgets.
- Badges show unread counts **only**.

**Kiwi translation:** GNOME banners appear at the top centre. Kiwi's island
(feature spec §4) can *absorb* banners into the pill, or Kiwi can move them
top-right. Never do both. Respect GNOME Do Not Disturb (Kiwi already has a
custom DND button).

## 5. Live Activities on Mac

- In Tahoe, a nearby iPhone's Live Activities appear **in the Mac menu bar**,
  using the compact, minimal and expanded presentations. Clicking one opens
  iPhone Mirroring. (HIG Live Activities; Apple newsroom)
- Rules:
  - Use them for tasks with a defined start and end, **≤ 8 h**.
  - Show glanceable data, in medium-or-heavier weight text.
  - Don't show ads or sensitive data.
  - Update only when the data changes.
  - Animations are capped at **2 s**.
  - Compact presentations should fit a **28 pt circle** when width is limited.
  - The Lock Screen margin is 14 pt.
  - The Dynamic Island uses an opaque black background with a key line
    around it in dark mode.
- Mac sizes follow the iOS table: compact 52–62 × 36.67 pt, minimal
  36.67–45 pt, expanded 371–408 × 84–160 pt.

**Kiwi translation:** the centre "island" pill. See spec §4.

## 6. Spotlight (Tahoe)

- **Cmd-Space** opens a floating glass search bar near the upper middle of the
  screen. Results appear below it in categories.
- Tahoe adds:
  - Browse modes reached with **Cmd-1** Applications, **Cmd-2** Files,
    **Cmd-3** Actions and **Cmd-4 Clipboard**. (Apple Support mchl4d69efd3)
  - **Actions** such as sending a message, creating an event or running a
    shortcut, exposed by apps through App Intents.
  - **Quick keys**, short user-definable codes (Apple's example: "ft" for a
    FaceTime call). Suggested ones are assigned after an action's first run.
    (Apple Support mchl4953dfeb)
  - **Clipboard history** must be enabled on first use and can be searched
    or cleared (Clear History). An entry is **copied** with its button or
    Cmd-C, then pasted with Cmd-V. (Apple Support mchl40d5b86b) Retention
    (reports say about 8 h) is **[unverified: Apple doesn't state it]**.
- Search field guidance (HIG):
  - Search as the user types.
  - Use placeholder text that names the search scope.
  - Show recent searches or suggestions before typing.
  - Put the most relevant results first and categorize them.
  - Scopes and tokens narrow the search.

**Kiwi translation:** a "Kiwi Search" overlay with a provider architecture.
Quick Paste is the clipboard scope of that same overlay. See specs §2 and §3.

## 7. Stage Manager

- The current window or group sits **in the centre**. Recent apps appear as
  thumbnails in a strip on the **left**. Click a thumbnail to switch.
- Drag a thumbnail onto the stage to **group** apps. Drag it back to the strip
  to ungroup.
- If you turn off "Recent apps", the strip hides and returns when the pointer
  touches the left edge. A window that overlaps the strip also hides it.
- Turn it on from Control Center or from System Settings > Desktop & Dock.
- Desktop items can be hidden, and apps can show "all windows at once" or "one
  at a time". (Apple Support 102355)
- The strip shows about 4–6 recent stages, depending on screen height.
  **[unverified: Apple Support doesn't give a count]**

**Kiwi translation:** spec §5. Map one stage to a set of windows on the current
workspace.

## 8. Mission Control and Spaces

- Mission Control spreads all windows out and shows a Spaces bar along the
  top. Full-screen apps get their own Space.
- Kiwi already has related features: "Focus on Overview Exit", "Move fullscreen
  window to new workspace" and "Hide minimized windows". Treat the GNOME
  overview as Mission Control and don't reinvent it.

## 9. Dock

- The Dock offers magnification, running indicators, a minimize-into-app
  option and Stacks (Downloads).
- In full-screen mode the Dock must stay revealable (HIG, Going full screen).
- Kiwi already implements Downloads Stack, minimize-to-dock, dock blur and
  adaptive colours, using Dash to Dock.

## 10. Window controls (traffic lights)

- Order from the leading edge: **close (red), minimize (yellow), zoom/full
  screen (green)**.
- Circles are about **12 px in diameter, 8 px apart**, and inset about 8–12 px
  from the window's top-left corner. **[unverified, observed: no Apple spec]**
- Colours are about close `#FF5F57`, minimize `#FEBC2E` and zoom `#28C840`,
  each with a darker 0.5px rim. **[unverified, community: no Apple spec]**
  Kiwi's existing `css/titlebuttons*.css` is the source of truth.
- **Hover:** when the pointer enters the *group*, all three show glyphs at
  once: × for close, − for minimize, and ⤢ for full screen, or + with Option
  for zoom.
- **Press:** the button darkens about 15 %.
- **Inactive window:** all three turn grey (about `#DDD` light / `#555` dark)
  until hovered. (HIG Windows: the key window shows colour)
- **Unavailable:** a button that is disabled (such as minimize on a panel)
  stays visible but greyed. It isn't removed.
- Clicking and holding green in Tahoe shows a tiling and arrangement menu.
  Kiwi has a tiling menu on the window title.

**Kiwi translation:** spec §8. Draw them as Kiwi's own SVG or CSS circles.
Never use Apple glyph artwork.

## 11. Full-screen and auto-hide menu bar

- In full screen, the menu bar is hidden. It **slides down** when the pointer
  reaches the top edge and slides back up once the pointer leaves it. The Dock
  is revealed the same way at its edge.
- The full-screen titlebar and toolbar come down together with the menu bar.
- There is a short dwell before the reveal, and a slightly longer delay
  before it hides again. **[unverified timing, not in Apple docs: about
  0.25 s reveal / 0.5–1 s hide]**
- Tahoe's "Automatically hide and show the menu bar" (System Settings > Menu
  Bar) has four options: **Always**, **On Desktop Only**, **In Full Screen
  Only** and **Never** (Apple Support mchlad96d366). That In Full Screen Only
  is the default is **[unverified: secondary sources]**.
- HIG: always let people choose when to enter and leave full screen, and keep
  the Dock reachable.

**Kiwi translation:** spec §7. Kiwi's existing "Show Panel in Fullscreen on
Hover" is the starting point.

## 12. Popovers, panels, menus (HIG)

- **Popover:**
  - Holds a small amount of functionality.
  - Points its arrow at the element that opened it, and only one is open at a
    time.
  - Never shows a popover from a popover, and nothing goes over a popover
    except an alert.
  - Saves work when it closes automatically.
  - Animates size changes.
  - Opening a sibling popover takes one click.
- **Panel (macOS):**
  - Gives quick access to controls related to the current content.
  - Has a short noun title, and no minimize button.
  - Hides when the app is inactive.
  - The HUD style is dark, small and uses little colour.
- **Menus (Tahoe):**
  - Menu-bar and context menus show icons in a single scannable column.
  - Use one symbol for a group of related items (WWDC25 session 310/356).

## 13. Sources

- HIG The menu bar: https://developer.apple.com/design/human-interface-guidelines/the-menu-bar
- HIG Windows: https://developer.apple.com/design/human-interface-guidelines/windows
- HIG Going full screen: https://developer.apple.com/design/human-interface-guidelines/going-full-screen
- HIG Notifications: https://developer.apple.com/design/human-interface-guidelines/notifications
- HIG Live Activities: https://developer.apple.com/design/human-interface-guidelines/live-activities
- HIG Controls: https://developer.apple.com/design/human-interface-guidelines/controls
- HIG Search fields: https://developer.apple.com/design/human-interface-guidelines/search-fields
- HIG Popovers / Panels: https://developer.apple.com/design/human-interface-guidelines/popovers , …/panels
- Apple Support, Stage Manager: https://support.apple.com/102355 and https://support.apple.com/guide/mac-help/mchl534ba392
- Apple Newsroom, macOS Tahoe 26: https://www.apple.com/newsroom/2025/06/macos-tahoe-26-makes-the-mac-more-capable-productive-and-intelligent-than-ever/
- Apple Support (Tahoe 26): Menu Bar settings https://support.apple.com/guide/mac-help/mchlad96d366/26/mac/26 ; menu bar https://support.apple.com/guide/mac-help/mchlp1446/26/mac/26 ; customize menu bar https://support.apple.com/guide/mac-help/mchl4af84660/26/mac/26 ; Spotlight browse modes https://support.apple.com/guide/mac-help/mchl4d69efd3/26/mac/26 ; actions/quick keys https://support.apple.com/guide/mac-help/mchl4953dfeb/26/mac/26 ; clipboard https://support.apple.com/guide/mac-help/mchl40d5b86b/26/mac/26 ; Tahoe updates https://support.apple.com/en-us/122868
- Secondary (Tahoe Spotlight and clipboard): https://www.ithinkdiff.com/spotlight-macos-tahoe-quick-keys-clipboard/ , https://www.igeeksblog.com/what-to-do-with-spotlight-in-macos-tahoe/
- Secondary (Menu Bar settings, auto-hide options): https://twit.tv/posts/tech/take-full-control-your-macos-tahoe-menu-bar , https://appleinsider.com/inside/macos-tahoe/tips/inside-control-center-on-macos-tahoe
