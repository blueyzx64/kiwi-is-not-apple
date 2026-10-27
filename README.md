<!-- Row 1: install & reach -->
![Install on GNOME Extensions](https://img.shields.io/badge/Install_on-GNOME_Extensions-blue?logo=gnome)![EGO Downloads](https://img.shields.io/gnome-extensions/dt/kiwi@kemma?logo=gnome&label=EGO%20downloads)![GNOME 50](https://img.shields.io/badge/GNOME_Shell-50-informational?logo=gnome)![License](https://img.shields.io/github/license/kem-a/kiwi-kemma)![Latest release](https://img.shields.io/github/v/release/kem-a/kiwi-kemma?semver)![Stars](https://img.shields.io/github/stars/kem-a/kiwi-kemma?style=social)

# <img width="48" height="48" alt="kiwi_logo" src="https://github.com/user-attachments/assets/f7820666-899a-46b8-b022-d5349bb1731b" /> Kiwi (is not Apple)

Kiwi brings the macOS desktop to GNOME: traffic-light window controls, Spotlight, a Control Center, a notification notch, Stage Manager, clipboard history and more, in one design language. Every feature can be turned off, and the defaults follow macOS.

<img src="https://extensions.gnome.org/extension-data/screenshots/screenshot_8276_to4T5k0.png" />

## Features

- **Window controls**: close, minimize and maximize as macOS traffic lights in the top bar for the focused window (apps lose their own titlebar buttons; your GNOME button layout is saved and restored exactly), or in the apps' own titlebars, macOS or GNOME style.
- **Spotlight**: tap Super to search apps, files, settings, the clipboard and the web, and to calculate.
- **Control Center**: Quick Settings in a macOS layout, with toggles for Kiwi's features.
- **Notification notch**: notifications, Now Playing, volume and brightness in a pill at the top centre.
- **Stage Manager** (off by default, as on macOS): recent apps in a strip at the screen edge; sets, side by side, click the wallpaper to show the desktop.
- **Clipboard history** with Quick Paste (history saved in `~/.local/share/kiwi/clipboard/`; the shortcut is empty by default).
- **Show Desktop**: a top-bar button and Super+D slide the windows aside.
- **Liquid Glass**: translucent top bar, menus and overlays.
- **Rounded window corners**, **full screen in its own Space**, the **calendar card** with notifications in Quick Settings, and overview swipes that stop at the workspaces.

Coming next (the v3 plan): the macOS menu bar with app menus, Kiwi's own dock with Genie, Mission Control, tiling and the app switcher.

### Removed in v3
The Dash to Dock add-ons, Firefox and Thunderbird theming, the GTK3 hover module (`advanced/`), the small panel tweaks (transparency, styling, lock icons, username, keyboard indicator, battery percentage), the window and overview tweaks, the window title and the panel media menu. On first start Kiwi removes what it had written for them into your files (the Kiwi block in `userChrome.css`, its `user.js` line, its `gtk.css` imports and its `environment.d` entry), and nothing else.

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

- Close, minimize and maximize sit on the left of the top bar.
- A tap on Super opens Spotlight. The overview is still on Super+A and the touchpad gesture.
- Notifications, volume and brightness show in the notch at the top centre.
- Clipboard history is on, with no shortcut until you set one in preferences. Stage Manager is off until you turn it on (Control Center or preferences).

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
