# App menus in the menu bar (P6)

> **Summary:** the menu bar shows the focused app's own menus when the app exports them, and
> Kiwi's generic menus otherwise. Kiwi's App menu (bold name), Window and Help always stay.
> Code: `core/appMenus/` (providers) and `features/menuBar/appMenuBar.js` (the view).

## Providers, in priority order

| App | Provider | How Kiwi reads it | Activation |
|---|---|---|---|
| Every app | generic | Shell: About, Hide, Quit, New Window, Minimize, Zoom, Tile, Move to Workspace… | Shell / Mutter |
| GTK 3/4 (`GtkApplication`) | GTK actions | `org.gtk.Actions` on the window's bus name: well-known actions fill the generic slots | `org.gtk.Actions.Activate` |
| GTK apps with `gtk_application_set_menubar()` | GTK exported menus | `org.gtk.Menus` at `get_gtk_menubar_object_path()` (+ GTK 3 app menu) | `org.gtk.Actions.Activate` |
| Qt 5/6, Chromium/Electron, LibreOffice under Xwayland | DBusMenu | Kiwi's `com.canonical.AppMenu.Registrar`, then `com.canonical.dbusmenu` | `Event(id, 'clicked')` |
| Apps with a menu bar in the window (experimental) | AT-SPI | the accessibility bus: the window's `MENU_BAR` | `org.a11y.atspi.Action.DoAction` |
| libadwaita apps (experimental, its own switch) | AT-SPI popover | opens the ☰ menu with its popup transparent, reads it, closes it; cached per app | reopens it the same way, then `DoAction` |

The first menu bar provider that returns a menu bar wins (GTK exported menus, then DBusMenu,
then AT-SPI). A native menu bar replaces Kiwi's File, Edit and View. A native Window or Help
menu adds its items to Kiwi's; items with a label Kiwi already shows are left out. Help ▸
Search searches every item of the menus on screen, native ones and their submenus included.

Settings (Menu Bar page): `menubar-native-menus` (on), `menubar-atspi-menus` (off,
experimental), `menubar-atspi-popovers` (off, experimental).

## What users need

- **GTK apps:** nothing. Most GNOME apps have no menu bar (they use a ☰ menu); Kiwi shows
  their generic menus filled with the actions they export.
- **Qt apps:** run them on X11 (`QT_QPA_PLATFORM=xcb`, the default for apps that force
  Xwayland) with the GNOME or GTK platform theme (Qt's default on GNOME). Qt checks for the
  registrar once, when the app starts, so apps started before Kiwi keep their in-window menu
  bar until restarted. Native Wayland Qt windows have no X11 id and no registrar protocol on
  GNOME, so they keep their in-window menu bar. Kiwi never sets `QT_QPA_PLATFORM` or
  `QT_QPA_PLATFORMTHEME` for you.
- **Chromium and Electron (VS Code, Slack…):** start them on X11 (`--ozone-platform=x11`);
  they export their menus to the registrar when it is there at start.
- **Another registrar** (an appmenu-registrar package, a Unity/Plasma component): Kiwi does not
  take the name; it asks that registrar for each window's menu instead.
- **AT-SPI:** GTK exposes its tree whenever the accessibility bus runs (GNOME starts it).
  Firefox, Chromium and Qt expose theirs only with accessibility on
  (`org.gnome.desktop.interface toolkit-accessibility`, or a screen reader). Kiwi does not
  change that setting.

## Limits

- DBusMenu submenus are told `AboutToShow` only at the top level when the menus are read;
  apps that build deeper submenus lazily show them as they were last built.
- The AT-SPI popover read is a real open and close for the app: it is hidden from the screen
  (its popup is transparent from the moment Mutter creates it) but the app's focus moves into
  the popover and back. It runs once per app (then cached) and once per activation.
- AT-SPI reads are async with a timeout and a node budget (1500 nodes), so a huge window may
  not be read completely; the Shell never waits on them.
- Flatpak apps: the accessibility app is matched by process id, which a sandbox may hide.
