# Kiwi Advanced - Native Titlebuttons Hover Module

## Why This Module Is Not Included

The GNOME Extensions platform has security policies that prevent the distribution of compiled native libraries (`.so` files) through the official extensions repository. This is because:

1. **Security Concerns**: Native libraries can execute arbitrary code and potentially compromise system security
2. **Sandboxing Limitations**: Extensions are designed to run in a sandboxed environment, and native libraries bypass these protections
3. **Cross-platform Compatibility**: Native libraries are platform-specific and would not work across different architectures
4. **Review Process**: The GNOME Extensions review team cannot easily audit compiled binaries for malicious code

## What This Module Does

The `titlebuttons_hover` module provides a macOS-like hover effect for window titlebuttons in GTK3 only applications. When you hover over any titlebutton (minimize, maximize, close), all titlebuttons in that window get highlighted, creating a visual effect similar to macOS window controls. GTK4 apps are not affected and works fine with extension.

## Installation

The module is installed per user. It is loaded into every GTK3 app you start after you log in again.

### Quick installation

```bash
git clone https://github.com/kem-a/kiwi-kemma && cd kiwi-kemma/advanced
./install-extra.sh
```

This installs the prebuilt `libtitlebuttons_hover.so` from this folder. It is built for **x86_64 only**,
and the installer refuses to install it if its SHA-256 does not match `libtitlebuttons_hover.so.sha256`
or if your machine is not x86_64. On any other architecture, or if you would rather not run a binary
you did not build, build it yourself (below).

Where things go:
- Library: `~/.local/share/kiwi/gtk3-modules/libtitlebuttons_hover.so`. It is installed through a temporary
  file and a rename, so apps that are already running keep the old copy safely.
- Setting: `~/.config/environment.d/10-gtk3-titlebuttons.conf` sets `GTK3_MODULES`. It **appends** to any
  `GTK3_MODULES` set by an earlier file in `environment.d`. `GTK_MODULES` is not touched.

### Build from source

Needs `gcc` (or another C compiler via `$CC`), `pkg-config` and the GTK3 development files.

```bash
sudo apt install gcc libgtk-3-dev pkg-config      # Ubuntu/Debian
sudo dnf install gcc gtk3-devel pkg-config        # Fedora
sudo pacman -S gcc gtk3 pkg-config                # Arch
```

```bash
cd kiwi-kemma/advanced
./compile-extra.sh     # builds libtitlebuttons_hover.so here and marks it as locally built
./install-extra.sh
```

`compile-extra.sh` honours `$CC`, `$CFLAGS` and `$LDFLAGS`.

Log out and back in afterwards. Check with `systemctl --user show-environment | grep GTK3_MODULES`.

## How it works

The module hooks `GtkWidget::realize` once per process and wires each window titlebutton the moment it
is created. It does not poll and does no work while you are not hovering. The "hovered" state is read
from the buttons' real state, so a button that is hidden or rebuilt while hovered cannot leave the
highlight stuck. The module code is `titlebuttons_hover.c`.

## Uninstallation

```bash
./uninstall-extra.sh
```

It removes the library and `10-gtk3-titlebuttons.conf` (and the copy that older versions put in
`~/.config/environment.d/`). Log out and back in afterwards.

## Troubleshooting

### Module not loading
- Log out and back in after installing.
- Check the files exist:
  - `~/.local/share/kiwi/gtk3-modules/libtitlebuttons_hover.so`
  - `~/.config/environment.d/10-gtk3-titlebuttons.conf`
- Check the active value: `systemctl --user show-environment | grep GTK3_MODULES`
- Launch a GTK3 app from a terminal and look for `Failed to load module` messages.

### Compilation errors
- Install the GTK3 development headers.
- Check that `pkg-config --exists gtk+-3.0` succeeds.

### No visual effect
- The module only affects GTK3 apps that draw their own title bar (a `GtkHeaderBar`). On Wayland with
  Mutter that is every GTK3 app, so Wayland sessions are supported.
- It does not affect: GTK3 apps that use server-side decorations on X11, GTK4/libadwaita apps (they
  are styled by the Kiwi extension directly), Flatpak apps (the host path is not visible inside the
  sandbox), and non-GTK apps (Qt, Electron).
- Try a standard GNOME app such as Files or Text Editor.
