# Desktop icons (Finder desktop)

## 1. Summary
The files and folders of `~/Desktop` (and optionally mounted drives) as large icons on the desktop layer, laid out
from the TOP-RIGHT corner, down the right-most column and then to the left, as the Finder desktop does.
Feature id `desktop-icons`, folder `features/desktopIcons/`.

## 2. Locked decisions
- On by default. Stays idle while Desktop Icons NG (DING or a fork) is enabled; the preferences page says so.
- Layer order: wallpaper < icons (rank 10) < widgets (rank 20) < windows (`core/desktopLayers.js`). Icons flow around the widget cards (reserved rectangles), automatic places move, places the user chose stay.
- Kiwi changes user files only through explicit actions: rename, Move to Trash (Gio trash, never a delete), New Folder. Open, Show in Files and Eject do not change files.
- Previews come from GNOME's thumbnail cache (`thumbnail::path`); a missing preview is requested from `GnomeDesktop.DesktopThumbnailFactory` (async, two at a time).

## 3. Behaviour
Click selects (Ctrl toggles, Shift ranges). Double-click opens with the default app. A rubber band from the wallpaper selects. Dragging moves the whole selection to the nearest free cells; places are remembered in `desktop-icons-layout`. Dragging in a sorted desktop sets Sort By to None. Right-click: Open, Show in Files, Rename, Move to Trash (Eject for drives), New Folder; the wallpaper menu gets New Folder and Sort By. Keys (after a click, or Ctrl+Alt+Tab to "Desktop"): arrows, Enter, F2, Delete, Ctrl+A, Ctrl+Shift+N, Esc, Menu, typing a name.

## 4. Settings
`desktop-icons` (on), `desktop-icons-size` (32..128, 64), `desktop-icons-show-drives` (on), `desktop-icons-sort` (none|name|kind|date-modified|date-created|size), `desktop-icons-layout` (JSON `{version, cells: {key: [col, row, user?]}}`).

## 5. Dragging files out to other apps (hook, not built)
A Shell actor cannot start a Wayland drag: the press must land on a client surface. The notch's shelf helper
(`helpers/kiwi-shelf-helper`, round 2 R2F) solves this by keeping a transparent window with a `GtkDragSource` exactly over
the items. Desktop icons expose the hook for it: the event `desktop-icons-selection` (`core/events.js`) carries the
selected icons' `uris` and their stage `rects` whenever the selection or the layout changes, and costs nothing with no listener.
To finish: a helper feature listens, puts the helper window over the selected rects, and maps the helper's `click` events
back to select/open. Status when this was written: the helper was uncommitted work in another worktree, so nothing listens yet.

## 6. Tests
`tests/desktopIconsModel.test.js`, `tests/desktopLayersModel.test.js`; real-Shell scenario with ten files, pointer and keys.
