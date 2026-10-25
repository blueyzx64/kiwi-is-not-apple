<!-- Row 1: install & reach -->
![Install on GNOME Extensions](https://img.shields.io/badge/Install_on-GNOME_Extensions-blue?logo=gnome)![EGO Downloads](https://img.shields.io/gnome-extensions/dt/kiwi@kemma?logo=gnome&label=EGO%20downloads)![GNOME 50](https://img.shields.io/badge/GNOME_Shell-50-informational?logo=gnome)![License](https://img.shields.io/github/license/kem-a/kiwi-kemma)![Latest release](https://img.shields.io/github/v/release/kem-a/kiwi-kemma?semver)![Stars](https://img.shields.io/github/stars/kem-a/kiwi-kemma?style=social)

# <img width="48" height="48" alt="kiwi_logo" src="https://github.com/user-attachments/assets/f7820666-899a-46b8-b022-d5349bb1731b" /> Kiwi (is not Apple)

Kiwi is a GNOME Shell extension that mimics various macOS features. This extension provides a collection of small quality-of-life functionalities such as moving windows to new workspaces, adding the username to the quick menu, focusing launched windows, and more.

<img src="https://extensions.gnome.org/extension-data/screenshots/screenshot_8276_to4T5k0.png" />

## Panel

- **Panel Transparency**: Make the top panel transparent, with optional blur and opaque mode when a window is maximized.
- **Show Panel in Fullscreen on Hover**: Show the panel when the mouse is near the top edge in fullscreen. Bugged for GTK4 apps.
- **Show Window Title**: Display the current window title in the top panel, with a tiling layouts menu.
- **Move Calendar to Right**: Move the calendar to the right side and move notifications and media controls to Quick Settings.
- **Battery Percentage**: Show battery percentage in the top bar when below 20%.
- **Caps Lock and Num Lock**: Show a Caps Lock and Num Lock icon in the top panel.
- **Custom Do Not Disturb Button**: Replace the system Do Not Disturb button with Kiwi's own.
- **Hide Activities Button**: Hide the Activities button in the top panel.
- **Add Username**: Add the username to the quick settings menu.
- **Panel Styling**: Tighter button spacing, smaller status icons, no dropdown arrows and a transparent panel in the overview.
- **Menu and App Styling**: Narrower shell menu items with accent colored hover and selection, plus GTK/Adwaita app fixes.
- **Style Keyboard Indicator**: Uppercase and border the keyboard/input source indicator, or hide it.

## Dock

These features work only when [Dash to Dock](https://extensions.gnome.org/extension/307/) is installed and enabled (except Launchpad Application). Fedora Workstation does not ship it by default. Without it, these features stay off.

- **Minimize Windows to Dock**: Park minimized windows as thumbnails after the apps and before the trash, macOS style.
- **Downloads Folder in Dock**: Add a Downloads folder before the trash that fans its newest files out over the desktop, macOS stack style.
- **Launchpad Application**: Add a custom Launchpad icon to the dock that opens the application overview.
- **Dock Styling**: Tighter icon spacing, no icon highlight and darker icons while pressed.
- **Dock Blur**: Blur the background behind the dock.
- **Adaptive Dock Colors**: Flip running indicators and separators between light and dark to suit whatever is behind the dock.

## Buttons

- **macOS Window Buttons**: Replace window control buttons with macOS style. Default, Alternative and Glass styles in two sizes, plus Firefox and Thunderbird styling.
- **Show Window Controls on Panel**: Move window controls to the top panel for maximized windows and remove their titlebars for maximum space.

## Options

- **Overview Wallpaper Blur**: Use the blurred current wallpaper as overview background.
- **Seamless Overview Zoom**: Zoom the whole desktop, including the strip behind the panel, in and out of the overview.
- **Focus on Overview Exit**: Focus the window under the cursor when leaving the overview, like macOS Mission Control.
- **Skip to Desktop**: Do not show the overview when logging in.
- **Hide Minimized Windows**: Hide minimized windows in the overview.
- **Move Window to New Workspace**: Move fullscreen windows to a new workspace.
- **Reduce App Animations**: Mimic macOS window opening and closing with a subtle scale and fade.
- **Focus New Windows**: Focus newly launched windows instead of showing window-ready notifications.
- **Transparent Move**: Make windows slightly transparent while moving.
- **Multilingual UI**: Fully translatable interface, easy to extend via `po/` files.

<details>
<summary><H2>Recommended Gnome Shell Extensions</H2> <b>(click to open)</b></summary>

- [**Kiwi Menu**](https://extensions.gnome.org/extension/8697/) by kem-a (Me)
- [**Dash to Dock**](https://extensions.gnome.org/extension/307/) by michele_g
- [**Superbar**](https://github.com/Furkan-rgb/superbar) by Furkan-rgb
- [**Compiz alike magic lamp effect**](https://extensions.gnome.org/extension/3740/) by hermes83
- [**AppIndicator Support**](https://extensions.gnome.org/extension/615/) by 3v1n0
- [**Blur My Shell**](https://github.com/aunetx/blur-my-shell) by aunetx
- [**Light Style**](https://extensions.gnome.org/extension/6198/) by fmuellner
- [**Weather or Not**](https://extensions.gnome.org/extension/5660/) by somepaulo
</details>

## New in this version

All of these are on by default and can be turned off in Kiwi's preferences.

- **Window controls in the top bar** for every focused window: close, minimize and maximize on the left, macOS style (Position setting: left, right or follow GNOME), with the apps' own titlebar buttons removed.
- **Liquid Glass**: translucent, blurred top bar, menus, dock and overlays (solid in high contrast).
- **Auto-hide top bar**: push the pointer against the top edge to reveal it.
- **Clipboard history** with Quick Paste. History is saved in `~/.local/share/kiwi/clipboard/`. The shortcut is empty by default; set it in preferences ("Use Super+Shift+V").
- **Spotlight**: tap Super to search apps, files, settings, clipboard and the web, and to calculate. The overview stays on the hot corner, Super+A and the Activities button.
- **Control Center**: the Quick Settings menu in a macOS-style layout.
- **Stage Manager**: a strip of other apps at the screen edge; other apps' windows are hidden, not minimized.
- **Notification notch**: notifications, volume, brightness and Now Playing in a pill at the top centre.

## Installation

Kiwi supports **GNOME Shell 50**, tested on **Fedora 44 Workstation** (Wayland). Other GNOME versions will come in later releases.

### 1. Install the tools

```sh
sudo dnf install git make gettext
```

`gnome-extensions` already comes with GNOME Shell. For the Dash to Dock features, also install [Dash to Dock](https://extensions.gnome.org/extension/307/) (optional).

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

All new features are on by default. Each one can be turned off in preferences.

- Close, minimize and maximize sit on the left of the top bar.
- The top bar hides automatically. Push the pointer against the top edge to bring it back.
- A tap on Super opens Spotlight. The overview is still on the hot corner, Super+A and the Activities button.
- Notifications, volume and brightness show in the notch at the top centre.
- Stage Manager and clipboard history are on. Clipboard history has no shortcut until you set one in preferences.

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

`make check` runs lint, the schema check and the unit tests. `make smoke` starts a headless GNOME Shell and turns Kiwi on and off many times to catch errors, without touching your session (see `tools/smoke/README.md`).

## Known Issues

- in multimonitor setup sometimes max number of workspaces are created. See issue #49.
- *move to fullscreen* can behave unexpectedly due to built in GNOME dynamic workspace management. Disabling it might help.
- Advanced triple button hover effect will not work for GTK3 flatpak apps due to sandboxing
- Window controls in the top bar hide the titlebar buttons of GTK client-side decorated windows only. Windows drawn by the compositor (server-side decorations, some Qt/X11 apps) keep their own buttons. Flatpak GTK apps need the overrides under *Flatpak theming* for the hide-titlebar CSS to apply.
- Electron apps now by default have wayland enabled which causes to use CSD and thus many title bar issues, like blurry icons or completely different window control icons. There is no CSS fix. Workaround (runs the app under Xwayland): avoid forced Wayland, or pass `--ozone-platform=x11`.
- similarly to electron apps also KDE apps by default uses CSD on wayland causing the same issues. Workaround (runs the app under Xwayland): set the environment variable `QT_QPA_PLATFORM=xcb`.

<details>
<summary><H2>Flatpak theming</H2> <b>(click to open)</b></summary>
Run this command to override `xdg-config` and theme window control buttons for Flatpak apps:

```sh
flatpak override --user --filesystem=xdg-config/gtk-3.0:ro
flatpak override --user --filesystem=xdg-config/gtk-4.0:ro
flatpak override --user --filesystem=xdg-config/environment.d/:ro
flatpak override --user --filesystem=$HOME/.local/share/gnome-shell/extensions/kiwi@kemma/:ro
```
</details>

## Contributing Translations

Want to help translate Kiwi to your language? See the [translation guide](translating/README.md) for instructions.

## Advanced

The `advanced/` folder contains additional features that cannot be distributed through the GNOME Extensions platform due to security policies:

- **Titlebuttons Hover Effect**: Provides macOS-like hover effects for window controls for GTK3 apps
- Requires manual compilation and installation
- See [advanced/README.md](advanced/README.md) for detailed installation instructions