<!-- Row 1: install & reach -->
![Install on GNOME Extensions](https://img.shields.io/badge/Install_on-GNOME_Extensions-blue?logo=gnome)![EGO Downloads](https://img.shields.io/gnome-extensions/dt/kiwi@kemma?logo=gnome&label=EGO%20downloads)![GNOME 50](https://img.shields.io/badge/GNOME_Shell-50-informational?logo=gnome)![License](https://img.shields.io/github/license/kem-a/kiwi-kemma)![Latest release](https://img.shields.io/github/v/release/kem-a/kiwi-kemma?semver)![Stars](https://img.shields.io/github/stars/kem-a/kiwi-kemma?style=social)

# <img width="48" height="48" alt="kiwi_logo" src="https://github.com/user-attachments/assets/f7820666-899a-46b8-b022-d5349bb1731b" /> Kiwi (is not Apple)

Kiwi brings the macOS desktop to GNOME: traffic-light window controls, Spotlight, a Control Center, a notification notch, Stage Manager, clipboard history and more, in one design language. Every feature can be turned off, and the defaults follow macOS.

<img src="https://extensions.gnome.org/extension-data/screenshots/screenshot_8276_to4T5k0.png" />

## Features

Kiwi 3 rebuilds the whole macOS desktop on GNOME, with every part working together. Each feature can be turned off in preferences, and the defaults follow macOS.

- **Menu bar**: the logo menu, the focused app's menus (from GTK, Qt and Electron apps, with generic File/Edit/View/Window/Help otherwise), Help search across all menus, Ctrl+F2 to reach the menus from the keyboard, and adaptive text colour over the wallpaper.
- **Dock**: Kiwi's own dock (replaces Dash to Dock). Recent apps, magnification, launch and attention bounce, badges and progress, Downloads and folder Stacks (Fan, Grid, List), Trash, Open at Login, and **Genie** or Scale minimize.
- **Windows**: traffic-light controls, Sequoia tiling (drag to edges and corners, keyboard shortcuts, arrangements), the green-button menu, full screen in its own Space, **Split View**, and Hide (Super+H).
- **Stage Manager** (off by default): rebuilt from scratch with sets, a strip on the side away from the dock, drag to add or remove, and Genie into the strip.
- **Mission Control** and **App Exposé** (F3, Ctrl+Up, Ctrl+Down), a Spaces bar you can add to, remove from and reorder, and start on the desktop.
- **Launchpad** with pages, search, folders and jiggle mode, the **app switcher** (Super+Tab, Super+`), touchpad gestures and **hot corners**.
- **Spotlight**: apps, files, actions, the clipboard and menu items, with `/` filters, Quick Keys, history and Quick Look.
- **Control Center** with Edit Controls, controls pinned to the menu bar, a status-icon host, menu bar item ordering and Low Power Mode.
- **Notch**: hover to expand, live activities (media, timers, recording, charging, headphones, downloads, one-time codes), a file shelf and widgets.
- **Notification Center** (click the clock) and **Focus** modes with schedules.
- **Desktop widgets** with a gallery.
- **Screenshots** (Shift+Super+3/4/5) with a toolbar and a floating thumbnail; a volume and brightness pill; glass dialogs; colour filters.
- **Input**: a Caps Lock and input-source badge, and Emoji & Symbols (Super+Ctrl+Space).
- **Liquid Glass** (faux, no blur), accent colours, icon styles, a Setup Assistant and a Login Items page.
- **Clipboard history** with Quick Paste, and rounded window corners.

### Removed in v3
The Dash to Dock add-ons (Kiwi's own dock replaces Dash to Dock), Firefox and Thunderbird theming, the GTK3 hover module (`advanced/`), the small panel tweaks (transparency, styling, lock icons, username, keyboard indicator, battery percentage), the window and overview tweaks, the window title and the panel media menu. On first start Kiwi removes what it had written for them into your files (the Kiwi block in `userChrome.css`, its `user.js` line, its `gtk.css` imports and its `environment.d` entry), and nothing else.

<details>
<summary><H2>Recommended Gnome Shell Extensions</H2> <b>(click to open)</b></summary>

- [**Kiwi Menu**](https://extensions.gnome.org/extension/8697/) by kem-a (Me)
- [**Superbar**](https://github.com/Furkan-rgb/superbar) by Furkan-rgb
- [**Compiz alike magic lamp effect**](https://extensions.gnome.org/extension/3740/) by hermes83
- [**AppIndicator Support**](https://extensions.gnome.org/extension/615/) by 3v1n0
- [**Blur My Shell**](https://github.com/aunetx/blur-my-shell) by aunetx
- [**Light Style**](https://extensions.gnome.org/extension/6198/) by fmuellner
- [**Weather or Not**](https://extensions.gnome.org/extension/5660/) by somepaulo
</details>

## Release notes (2.x)

All of these are on by default unless noted, and each can be turned off in Kiwi's preferences or from the Kiwi section of the Control Center.

- **Window controls in the top bar** for every focused window: close, minimize and maximize on the left, macOS style. While they are in the top bar, apps' own titlebar buttons are removed (Kiwi saves your GNOME button layout and restores it exactly when you turn this off). Minimize and maximize work on every window, including dialogs and fixed-size windows.
- **No Activities button**: the workspace pill at the top left is hidden (setting: *Hide Activities Button*).
- **Liquid Glass**: translucent, rounded top bar, menus and overlays (plain transparency, no blur; solid in high contrast).
- **Clipboard history** with Quick Paste. History is saved in `~/.local/share/kiwi/clipboard/`. The shortcut is empty by default; set it in preferences ("Use Super+Shift+V").
- **Spotlight**: tap Super to search apps, files, settings, clipboard and the web, and to calculate, in a rounded panel that stays readable on any background.
- **Control Center**: the Quick Settings menu in a calmer macOS-style layout with rounded-square tiles, plus a *Kiwi* section with toggles for the notch, Stage Manager, window buttons, clipboard, Spotlight, Liquid Glass and rounded corners.
- **Stage Manager**: other apps sit on a rounded floor at the screen edge, as live, tilted previews; windows fly to and from the strip. Parked windows are hidden from the overview (still in Alt+Tab).
- **Notification notch**: notifications, Now Playing controls (previous, play/pause, next), volume and brightness in a pill at the top centre. Click it to open the dashboard; click outside or press Esc to close it. Do Not Disturb silences it.
- **Rounded window corners** (off by default): rounds every app window, including GTK 3, Qt and Electron apps. Maximized and fullscreen windows stay square. Radius and excluded apps are in preferences.

### Changes in update 2
- **Stage Manager:** group windows into sets: drag a strip entry onto the stage or Shift+click it, and drop on the left or right half to place two windows side by side. A set shows in the strip as one stack. Opening a new app replaces the stage and moves the old set to the strip (or make new windows join the set). Click the wallpaper to reveal the desktop. Each workspace has its own strip, which never shows over the overview. Hover peek, tilt and speed settings.
- **Show Desktop:** a top-bar button and Super+D slide windows to the screen edges, macOS style; with Stage Manager on, the stage moves into the strip.
- **Notch:** redesigned like the Dynamic Island. Music is the hero (art, title, progress, controls), with a clock when nothing plays, a tidy notification list, a moon toggle for Do Not Disturb, a compact pill with a waveform, spring animations, and curved "ears" where it meets the top edge.
- **Control Center, clipboard, calendar:** minimal macOS-style layouts with larger text. Notifications are no longer listed in the Control Center while the notch is on.
- **Super key** toggles Spotlight (tap again to close).
- **Gestures:** swiping up stops at the workspace overview, never the app grid. The hot corner is off (setting).
- **Window buttons:** with the top-bar controls off, apps get stock GNOME minimize/maximize/close on the right; switch them to the left or to macOS style.
- **Rounded corners:** now on by default, top corners only (or all four).
- **Fixed:** a mark at the top-left of each workspace in the overview.

### Changes in this update
- **Removed: auto-hide top bar.** The top bar now always shows, because it holds the notch and the window controls.
- **Added:** rounded window corners; Kiwi feature toggles in the Control Center; Hide Activities on by default.
- **Fixed:** square backgrounds behind rounded menus, the notch and the top bar; Spotlight with no backing; notch media buttons and Do Not Disturb; clipboard history not listing copies; minimize/maximize greyed out on some windows; apps keeping their own buttons next to the top-bar ones.
- **Redesigned:** preferences now use a sidebar with readable labels and search; new features are grouped under *macOS Features*.

## Installation

Kiwi supports **GNOME Shell 50**, tested on **Fedora 44 Workstation** (Wayland). Other GNOME versions will come in later releases.

### 1. Install the tools

```sh
sudo dnf install git make gettext
```

`gnome-extensions` already comes with GNOME Shell.

### 2. Back up your current Kiwi settings (optional, for rolling back)

```sh
dconf dump /org/gnome/shell/extensions/kiwi/ > ~/kiwi-settings-backup.ini
```

### 3. Download and install

```sh
git clone https://github.com/blueyzx64/kiwi-is-not-apple.git
cd kiwi-is-not-apple
make install    # builds the zip in dist/ and installs it for your user
```

### 4. Log out and back in

GNOME 50 runs on Wayland only, so the Shell has to restart through a new login. Alt+F2 `r` does not work.

### 5. Enable Kiwi

```sh
gnome-extensions enable kiwi@kemma
```

You can also use the Extensions app. To open Kiwi's preferences, run `gnome-extensions prefs kiwi@kemma`.

### What you get on first login

The defaults follow macOS; each feature can be turned off in preferences.

- The Setup Assistant opens once in preferences (Not Now skips it; About → Run Again).
- The menu bar shows the logo menu and the focused app's menus; traffic lights sit on the left.
- Kiwi's dock is at the bottom (Dash to Dock is turned off while it runs and comes back when it stops). Minimize uses Genie.
- A tap on Super opens Spotlight; F3 opens Mission Control; Super+A or F4 opens Launchpad; clicking the clock opens the Notification Center.
- Stage Manager, hot corners and magnification are off until you turn them on.

### Update

```sh
cd kiwi-is-not-apple
git pull
make install
```

Then log out and back in.

### Report a problem

Watch the log while you use Kiwi:

```sh
journalctl -f -o cat /usr/bin/gnome-shell | grep -i kiwi
```

Include any `[Kiwi]` lines when you open an issue.

### Uninstall or roll back

```sh
gnome-extensions disable kiwi@kemma   # turn it off
make uninstall                        # or remove it completely
```

Then log out and back in. To restore your old settings, run `dconf load /org/gnome/shell/extensions/kiwi/ < ~/kiwi-settings-backup.ini`. Clipboard history is stored in `~/.local/share/kiwi/clipboard/`, and you can delete that folder.

### For developers

`make check` runs lint, the schema check, the stylesheet check and the unit tests; `make pack-check` packs the zip and checks its contents. The code layout is described in `docs/architecture/code-map.md` and `docs/architecture/conventions.md`. `make smoke` starts a headless GNOME Shell and turns Kiwi on and off many times to catch errors, without touching your session (see `tools/smoke/README.md`).

## Known Issues

- Qt and Electron app menus reach the menu bar only when those apps run under X11 (Xwayland); see `docs/features/app-menus.md`.
- Spaces are shared across displays, as GNOME does not have per-display workspaces.
- in multimonitor setup sometimes max number of workspaces are created. See issue #49.
- *move to fullscreen* can behave unexpectedly due to built in GNOME dynamic workspace management. Disabling it might help.
- Window controls in the top bar hide the titlebar buttons of GTK client-side decorated windows only. Windows drawn by the compositor (server-side decorations, some Qt/X11 apps) keep their own buttons. Flatpak GTK apps need the overrides under *Flatpak theming* for the hide-titlebar CSS to apply.
- Electron apps now by default have wayland enabled which causes to use CSD and thus many title bar issues, like blurry icons or completely different window control icons. There is no CSS fix. Workaround (runs the app under Xwayland): avoid forced Wayland, or pass `--ozone-platform=x11`.
- similarly to electron apps also KDE apps by default uses CSD on wayland causing the same issues. Workaround (runs the app under Xwayland): set the environment variable `QT_QPA_PLATFORM=xcb`.

<details>
<summary><H2>Flatpak theming</H2> <b>(click to open)</b></summary>
Run this command to override `xdg-config` and theme window control buttons for Flatpak apps:

```sh
flatpak override --user --filesystem=xdg-config/gtk-3.0:ro
flatpak override --user --filesystem=xdg-config/gtk-4.0:ro
flatpak override --user --filesystem=$HOME/.local/share/gnome-shell/extensions/kiwi@kemma/:ro
```
</details>

## Contributing Translations

Want to help translate Kiwi to your language? See the [translation guide](translating/README.md) for instructions.
