---
name: gnome-shell-extension
description: Use when writing, reviewing, debugging or porting GNOME Shell extension code in this repo (Kiwi, GJS ESM, shell-version 48-51) - extension.js, apps/*.js, prefs.js, stylesheet.css, schemas - including panel/Quick Settings items, notifications, windows/workspaces, keybindings and modals, chrome and panel hiding, clipboard, blur/shaders and EGO review compliance.
---

# GNOME Shell extension development (Kiwi)

Kiwi is `kiwi@kemma`. It supports shell 48, 49, 50 and 51 (`metadata.json`). Each
feature lives in `apps/<feature>.js` and exports `enable(...)`/`disable()`.
`extension.js` (`KiwiExtension extends Extension`) switches features on and off
from GSettings `org.gnome.shell.extensions.kiwi`. Prefs are in `prefs.js`
(Adw, a separate process). For the JS runtime (GObject classes, async, Gio),
load the `gjs` skill.

Read this file first, then open only the reference you need. Each reference
starts with a summary and a table of contents.

## Golden rules (reviewers on extensions.gnome.org, or EGO, enforce these)

1. **No work at import or in the constructor.** Module top level and
   `constructor(metadata)` may only set up static data: no GObjects, no signal
   connections, no main-loop sources, no Shell changes. Create everything in
   `enable()`. (Guideline "Only use initialization for static resources",
   shexli rule EGO-L-001.)
2. **enable() and disable() must be symmetric.** `disable()` undoes everything:
   it destroys every actor and object, disconnects every signal, removes every
   `GLib.timeout_add`/`idle_add` source, restores every injection, and sets the
   fields back to `null`. An extension is disabled and re-enabled on every
   screen lock unless it lists `unlock-dialog` in `session-modes`. That makes
   leaks visible fast. (EGO-L-002..005, EGO-L-007.)
3. **disable() is synchronous.** GNOME 51 throws `disable() must not be async`
   (`js/ui/extensionSystem.js`). Cancel pending async work with a
   `Gio.Cancellable` and guard callbacks with an `_enabled` check.
4. **Use the supported hooks:** `InjectionManager` for monkey-patching,
   `connectObject(..., this)`/`disconnectObject(this)` for signals,
   `Main.panel.addToStatusArea`, and `QuickSettings.addExternalIndicator`.
   Always restore with `injectionManager.clear()`.
5. **Process separation.** Never import Gtk, Gdk or Adw in shell code, and never
   import Clutter, Meta, St or Shell in `prefs.js` (EGO-I-002, EGO-I-003).
6. **Never block the compositor.** Don't use synchronous file I/O or
   subprocesses in shell code (EGO-X-002, EGO-X-004). Use `Gio._promisify`
   and the async variants.
7. **Clipboard access must be declared** in the `metadata.json` description.
   Clipboard data must never go to a third party without explicit user action,
   and clipboard keyboard shortcuts must not be enabled by default
   (review-guidelines.md).
8. **No excessive logging, no obfuscation, no telemetry, no AI-slop code.**
   Use `this.getLogger()` (48+) or gated `console.debug`.
9. **Feature-detect, don't version-sniff** where you can, for example
   `if (Clutter.ShaderEffect.prototype.set_shader_source)`. Where you must
   check the version, use `Config.PACKAGE_VERSION` (see `apps/windowTiling.js`).
10. **Private APIs (`_foo`) can change in any release.** Wrap their use, check
    that they exist, and re-check them against `version-matrix.md` on each
    GNOME bump.

**Version landmines for 48 to 51** (details: `references/version-matrix.md`):
- 49: `maximize()`/`unmaximize()` take no flags, `get_maximized()` is gone,
  `Clutter.ClickAction` and the other actions are replaced by `*Gesture`.
- 50: X11 is gone, and so is the `affectsInputRegion` chrome param (passing it throws).
- 51: `disable()` must be sync, St `vertical` is gone (use `orientation`),
  `Shell.GLSLEffect` and `ShaderEffect.set_shader_source` are gone,
  `menu.open()`/`close()` take `{animate}`, and `ui/pointerWatcher.js` is gone.

## Decision table: "I need to X" → read

| I need to... | Read |
|---|---|
| Know what broke or changed in 45/46/47/48/49/50/51, or which Fedora ships what | `references/version-matrix.md` |
| Set up metadata.json, the Extension class, schemas, gettext, packing or installing | `references/extension-anatomy.md` |
| Add a panel button, a Control Center tile, a slider, or replace a built-in QS item | `references/panel-and-quick-settings.md` |
| Build the notification "notch", suppress or redirect banners, or handle DND | `references/notifications-and-message-tray.md` |
| Build Stage Manager or window thumbnails, or minimize/maximize/focus windows and workspaces | `references/windows-workspaces-and-actors.md` |
| Build a Spotlight modal, a global shortcut, St.Entry focus, search providers, barriers or hot corners | `references/input-keybindings-and-modals.md` |
| Auto-hide the top bar, handle struts or fullscreen, add chrome actors | `references/layout-chrome-and-panel-hiding.md` |
| Add clipboard history, images, password hints or persistence | `references/clipboard.md` |
| Add Liquid Glass blur, custom GLSL, or tune performance | `references/blur-shaders-and-effects.md` |
| Write stylesheet.css, accent color, dark/light variants | `references/styling-st-css.md` |
| Write Adw preference pages and bind settings | `references/prefs-adwaita.md` |
| Prepare an EGO submission or review code for leaks | `references/review-guidelines-and-pitfalls.md` |
| Run a nested shell, read logs, use Looking Glass, lint, unit test | `references/testing-and-debugging.md` |
| Remove titlebar buttons or put window controls in the panel | `windows-workspaces-and-actors.md` §Window controls, and `apps/appButtons.js`, `apps/gtkThemeManager.js` |

## Kiwi module skeleton (match existing style)

```js
// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const OWNER = {}; // plain JS key for connectObject tracking (static, allowed at import)
let _enabled = false;
let _timeoutId = null;

function _sync() { /* react to focus changes */ }

export function enable(_settings) {
    if (_enabled) return;
    _enabled = true;
    global.display.connectObject('notify::focus-window', _sync, OWNER);
}

export function disable() {
    if (!_enabled) return;
    _enabled = false;
    global.display.disconnectObject(OWNER);
    if (_timeoutId) { GLib.Source.remove(_timeoutId); _timeoutId = null; }
}
```

Note: `connectObject`/`disconnectObject` are Shell additions on
`GObject.Object.prototype` (`js/ui/environment.js`, `js/misc/signalTracker.js`).
The last argument is the owner key. If the owner is a destroyable GObject (an
actor, for example), its connections are also dropped automatically when it is
destroyed.

## Testing and debug cheat sheet

```sh
# Nested shell. 49+ use --devkit (Fedora: dnf install mutter-devkit). 48 used --nested.
dbus-run-session gnome-shell --devkit --wayland          # GNOME 49, 50, 51
dbus-run-session -- gnome-shell --nested --wayland       # GNOME 48 and older
dbus-run-session gnome-shell --devkit --wayland --virtual-monitor 1600x1000  # sized output (DUMMY_MODE_SPECS is nested-only)

journalctl -f -o cat /usr/bin/gnome-shell                # live shell log (JS errors, console.*)
journalctl -f -o cat /usr/bin/gjs                        # prefs process log
gnome-extensions list --enabled | grep kiwi
gnome-extensions enable kiwi@kemma ; gnome-extensions disable kiwi@kemma
gnome-extensions prefs kiwi@kemma
gnome-extensions pack --extra-source=icons --extra-source=apps --extra-source=css --podir=po .  # as in CI
gnome-extensions install --force kiwi@kemma.shell-extension.zip
glib-compile-schemas schemas/                            # only for local dev installs
# Looking Glass: Alt+F2, type lg. On Wayland a real session cannot restart:
# log out and back in, or use the nested shell.
```

Reviewers run `shexli` (PyPI `shexli`) for automated checks. Run it on the
packed zip before you submit (see `review-guidelines-and-pitfalls.md`).

## Repo-specific notes

- Compatibility shims already exist. Reuse them:
  - maximize args: `apps/windowTiling.js`, `MAXIMIZE_ARGS`
  - ShaderEffect source vs snippet: `apps/minimizedToDock.js`
  - menu `close()` params: `apps/windowTitle.js`, `MENU_CLOSE_ARGS`
  - BlurEffect repaint workaround: `apps/blurPaintSignal.js`
- `.claude/` and `docs/` are tracked through `!.claude/**` in `.gitignore`, which
  overrides the `.c[a-z]*/` rule. Keep them out of the extension zip: `pack`
  only adds `--extra-source` paths.
- CI packs the extension with `.github/workflows/pack-release.yml`. A new
  top-level folder needs an `--extra-source` there.
