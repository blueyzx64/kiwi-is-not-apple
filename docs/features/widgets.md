# Desktop widgets

## What it does
Widgets on the desktop, above the wallpaper and below windows. Registry id `desktop-widgets` (key `widgets`, on). The same widget model feeds the Notification Center and the notch's Widgets tab (`core/widgets/`). Code: `features/widgets/`.

## Use
- Right-click the desktop and choose **Edit Widgets** to open the gallery (also from the Notification Center). Add Default Widgets is offered when the desktop is empty; nothing is placed by default.
- Drag a widget to place it on a snapping grid (hold Ctrl for finer placement). Right-click for its size, options and Remove.
- Built-in kinds (`core/widgets/kinds/`), each in macOS's sizes:

| Widget | Sizes | Acts in place | Data |
|---|---|---|---|
| Clock / World Clock | S M L | | local time; GNOME Clocks' cities, else Cupertino, Tokyo, Sydney, Paris, New York, London |
| Calendar | S M L | | Evolution Data Server through the Shell's calendar server |
| Up Next | S M L | | the same events: the next one ("In 15 min"), then a day-by-day list |
| Reminders | S M L XL | tick a reminder done | EDS task lists over D-Bus (Endeavour's data), not libecal |
| Weather | S M L | | the Shell's weather client |
| Note | S M L XL | type on it | Kiwi's own key `widgets-notes`; colours of macOS Stickies or glass |
| Photos | S M L XL | Next Photo | ~/Pictures (no Screenshots/Wallpapers), decoded in a helper process |
| Batteries | S M L | | UPower, Bluetooth devices included |
| Now Playing | S M | play, pause, skip | MPRIS |
| Timers | S M L | start, pause, resume, stop | Kiwi's timers (`core/timers.js`), the notch's |
| Favorites | S M L XL | launch an app | the dock's favourites, else the most used apps |
| Recent Files | S M L | open a file | `~/.local/share/recently-used.xbel`, read only |
| System | S M L | | CPU, memory, home disk, network (/proc) |

- Controls that act in place are St.Buttons, St.Entries or `kiwi-widget-interactive`: a press on them never drags or opens the widget.
- **Style (`widgets-style`, `automatic`):** automatic dims widgets to monochrome while a window is in front and shows full colour when the desktop is. Also `monochrome` and `full-color` choices.
- The layout is JSON in `widgets-layout`, per monitor.

## Limits
- Widget data runs only while widgets can be seen: not in the overview and not under a maximized or full-screen window. With no widget placed nothing runs.
- Reminders reads every enabled EDS task list and closes them when no Reminders widget is visible. Recurring reminders are not ticked here (EDS would complete the whole series): the circle opens Endeavour.
- Kiwi never writes the user's files: Photos and Recent Files only read; a Note's text lives in Kiwi's settings (removing the widget keeps the text for the next Note widget; Reset clears it).
- Kiwi's desktop icons flow around widgets ([desktop-icons.md](desktop-icons.md)).
