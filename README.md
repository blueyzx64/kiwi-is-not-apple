![GNOME Shell 50](https://img.shields.io/badge/GNOME_Shell-50-informational?logo=gnome)
![License](https://img.shields.io/github/license/blueyzx64/kiwi-is-not-apple)
![Latest release](https://img.shields.io/github/v/release/blueyzx64/kiwi-is-not-apple?semver)
![Stars](https://img.shields.io/github/stars/blueyzx64/kiwi-is-not-apple?style=social)

# Kiwi (is not Apple)

Kiwi brings the macOS desktop to GNOME Shell 50 (tested on Fedora 44 Workstation, Wayland). The menu bar, dock, windows, Mission Control, Spotlight, Control Center, notch and more share one design language. Every feature can be turned off in Kiwi's preferences, and the defaults follow macOS.

Unofficial; not affiliated with Apple.

## Features

Each area has a page in [docs/features](docs/features/README.md) with its settings, limits and where it lives in the code.

### Menu bar
- A transparent menu bar with a logo menu (About This PC, System Settings, Force Quit, Sleep, Restart, Shut Down, Lock Screen, Log Out). The logo is Fedora, Kiwi or none.
- The focused app's name and menus. Menus come from GTK menu bars, and from Qt, Electron and LibreOffice apps under Xwayland; other apps get generic File, Edit, Window and Help menus. Help search finds any menu item. Ctrl+F2 moves to the menus from the keyboard. See [app menus](docs/features/app-menus.md).
- Status icons of apps (tray icons), Control Center controls you pin to the bar, item order and an overflow chevron.
- Privacy dots (microphone, camera, screen sharing), shortcut glyphs, Force Quit (Super+Alt+Esc), and the clock and calendar at the right.

### Windows
- Window buttons stay on each app's own titlebar, on the right by default (left is a setting), with the macOS traffic-light look or the stock GNOME one. Kiwi draws none in the top bar.
- Sequoia-style tiling: drag to edges, corners or the top bar; drag to the top centre for Windows 11-style snap layouts; Ctrl+Super shortcuts for halves, Fill, Center, Return to Previous Size and arrangements of several windows.
- Full screen in its own Space, Split View (Ctrl+Super+Alt+Left or Right on a full-screen window), and Hide and Hide Others (Super+H, Alt+Super+H).
- Show Desktop (top-bar button, Super+D, click on empty wallpaper) and rounded window corners.

### Dock
- Kiwi's own dock at the bottom (or a side): pinned, running and recent apps, badges and progress, bounce, grey dots for background apps, Downloads and folder Stacks (Fan, Grid, List), and the Trash.
- Genie or Scale minimize, magnification and auto-hide.

### Stage Manager
- The window you work in at the centre, other apps as live tilted previews in a strip. Sets of windows, drag to add or remove, a strip on each Space, and keyboard shortcuts. Off by default.

### Mission Control and Launchpad
- Mission Control (F3, Ctrl+Up) with a Spaces bar you can add to, remove from and reorder, and App Exposé (Ctrl+Down).
- Launchpad (Super+A, F4) with pages, search, folders and jiggle mode.
- The app switcher (Super+Tab or Alt+Tab, and Super+` for the front app's windows), trackpad gestures and hot corners.

### Spotlight
- A tap of Super opens a search for apps, files, settings, the clipboard, a calculator and the web, with `/` filters, Quick Keys, history, Quick Look and the focused app's menu items.
- Clipboard history with a popover and Quick Paste.

### Control Center and notifications
- Quick Settings laid out as a Control Center, with Edit Controls and Low Power Mode.
- Notification Center (click the clock) and Focus modes with schedules and app triggers.

### Notch
- A pill at the top centre for notifications, live activities (media, timers, recording, charging, headphones, next event, downloads, one-time codes) and volume. Hover to open Now, Tray (a file shelf) and Widgets.

### Desktop
- Desktop widgets above the wallpaper and below windows, and Finder-style desktop icons.

### Input and screenshots
- Screenshots (Shift+Super+3, 4, 5) with a toolbar and a floating thumbnail.
- Emoji & Symbols (Super+Ctrl+Space), and a Caps Lock and input-source badge at the text cursor.
- A volume and brightness pill, glass system dialogs and colour filters.

### Appearance
- Liquid Glass (a translucent look, no blur), Auto Light and Dark, accent and highlight colours, icon styles, and a Setup Assistant that offers the main choices on first login.

## Install

Kiwi supports **GNOME Shell 50**. Other GNOME versions are not claimed.

### From a release

Download from the [releases page](https://github.com/blueyzx64/kiwi-is-not-apple/releases):

- `kiwi@kemma.shell-extension-<version>.zip`: the extension.
- `kiwi-shelf-helper-<version>.noarch.rpm`: optional. It lets you drag files out of the notch's file shelf into other apps. Without it the shelf keeps its Open and Copy actions.

```sh
gnome-extensions install --force kiwi@kemma.shell-extension-<version>.zip
sudo dnf install ./kiwi-shelf-helper-*.noarch.rpm   # optional
```

Log out and back in (GNOME 50 on Wayland cannot restart the Shell in place), then:

```sh
gnome-extensions enable kiwi@kemma
```

You can also use the Extensions app. To open Kiwi's preferences: `gnome-extensions prefs kiwi@kemma`.

### From source

```sh
sudo dnf install git make gettext
git clone https://github.com/blueyzx64/kiwi-is-not-apple.git
cd kiwi-is-not-apple
make install       # builds the zip in dist/ and installs it for your user
make helper-rpm    # optional: builds dist/helper/RPMS/noarch/kiwi-shelf-helper-*.rpm (needs rpm-build)
```

Then log out and back in, and run `gnome-extensions enable kiwi@kemma`.

To keep your current settings in case you want to go back:

```sh
dconf dump /org/gnome/shell/extensions/kiwi/ > ~/kiwi-settings-backup.ini
```

## First login

The defaults follow macOS. Each can be changed in preferences.

- The Setup Assistant opens once in preferences. Not Now keeps every default; you can run it again from About.
- The menu bar is transparent and shows the logo menu and the focused app's menus. Window buttons stay on each app's own titlebar.
- Kiwi's dock is at the bottom, with Genie minimize. Magnification and auto-hide are off.
- Super (tap) opens Spotlight. F3 or Ctrl+Up opens Mission Control, Ctrl+Down App Exposé, Super+A or F4 Launchpad. Clicking the clock opens the Notification Center.
- The notch is on and the clock sits at the right.
- Stage Manager and hot corners are off. No desktop widgets are placed until you add some (right-click the desktop, Edit Widgets).
- Clipboard history is on; Super+V opens Quick Paste. While it runs, GNOME's notification list keeps only Super+M (your own toggle-message-tray value comes back when clipboard history is off).

## Update

```sh
cd kiwi-is-not-apple
git pull
make install
```

Or install the newer release zip as above. Then log out and back in.

## Uninstall

```sh
gnome-extensions disable kiwi@kemma   # turn it off; GNOME's own settings come back
make uninstall                        # or: gnome-extensions uninstall kiwi@kemma
sudo dnf remove kiwi-shelf-helper     # if you installed the helper
```

Clipboard history is kept in `~/.local/share/kiwi/clipboard/`. Delete that folder if you want it gone.

## Known issues

- Qt and Electron app menus reach the menu bar only when those apps run under X11 (Xwayland). See [app menus](docs/features/app-menus.md).
- Electron apps use Wayland with their own title bar by default, and KDE apps do the same, so their window buttons can look different or stay in the window. Workarounds that run the app under Xwayland: `--ozone-platform=x11` for Electron, `QT_QPA_PLATFORM=xcb` for Qt.
- Spaces are shared across displays, because GNOME has no per-display workspaces.
- Flatpak GTK apps need these overrides to see Kiwi's titlebar CSS:

  ```sh
  flatpak override --user --filesystem=xdg-config/gtk-3.0:ro
  flatpak override --user --filesystem=xdg-config/gtk-4.0:ro
  flatpak override --user --filesystem=$HOME/.local/share/gnome-shell/extensions/kiwi@kemma/:ro
  ```

- Two-finger swipe from the trackpad edge cannot open the Notification Center (GNOME gives the Shell only three-finger and four-finger gestures). Click the clock or use a hot corner.

To report a problem, watch the log while you use Kiwi and include any `[Kiwi]` lines in your issue:

```sh
journalctl -f -o cat /usr/bin/gnome-shell | grep -i kiwi
```

## For developers

`make check` runs lint, the schema check, the stylesheet check and the unit tests. `make pack-check` packs the zip and checks its contents. `make smoke` starts a headless GNOME Shell and turns Kiwi on and off many times without touching your session ([tools/smoke/README.md](tools/smoke/README.md)). The code layout is in [docs/architecture/code-map.md](docs/architecture/code-map.md) and the rules for writing a feature in [docs/architecture/conventions.md](docs/architecture/conventions.md).

## Translations

To help translate Kiwi, see the [translation guide](translating/README.md).

## License and credits

GPL-3.0-or-later; see [LICENSE](LICENSE). Kiwi began as [kiwi-kemma](https://github.com/kem-a/kiwi-kemma) by kem-a, which this repository derives from.
