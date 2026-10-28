# Window controls

## What it does
Close, minimize and maximize ("traffic lights") for the focused window in the top bar, plus the green-button menu. Registry ids `window-controls` and `app-buttons` (mirrors: only one runs), `gtk-theme`.

## Use
- **When they show (`window-controls-scope`, default `maximized`):** a window with no controls of its own (Mutter draws its title bar) always has them in the top bar. A window with its own header bar keeps its buttons until it is maximized, full screen, or touching the top bar (a tile whose top is the work area top, or a window dragged against the bar). Then the controls move to the top bar and the app's own are taken off. Other scopes: `all`, `fullscreen`.
- **Side:** right by default; left is the macOS side (`window-controls-side`). The apps' own buttons follow.
- **Look:** glass beads (default) or flat PNG buttons (`windows-traffic-style`); size `small`/`normal` (`button-size`).
- **Green button:** a click enters full screen (`windows-green-click`, default `fullscreen`; `zoom` fills the screen). Alt-click does the other. Hover it for 0.6 s, or press and hold, for the menu: Move & Resize, Fill & Arrange, Center, Return to Previous Size, Enter/Exit Full Screen, Zoom, Move to Workspace, Move to Display. The tile sections need window tiling ([windows.md](windows.md)).
- **Minimize and maximize** work on every window, including dialogs and fixed-size windows.
- **Controls off (`show-window-controls`):** apps get their own buttons back on the chosen side, as macOS traffic lights (`app-buttons-style` default `macos`) or the GNOME look, either all three or close only (`app-buttons-set`, default `all`).

## Settings (default)
`show-window-controls` on · `window-controls-scope` `maximized` · `window-controls-side` `right` · `remove-titlebar-buttons` on · `hide-maximized-titlebars` off · `windows-traffic-style` `glass` · `windows-green-click` `fullscreen` · `windows-green-menu` on · `button-size` `small` · `enable-app-window-buttons` on · `app-buttons-style` `macos` · `app-buttons-set` `all`.

## How the apps' buttons are removed
While the controls are in the top bar, Kiwi owns GNOME's `button-layout` (the original is saved by `core/originals.js` and restored exactly on disable, also after a crash). GTK CSS in `~/.config/gtk-{3,4}.0/gtk.css`, between Kiwi's marker comments, hides the buttons of client-side windows; the rest of that file is never touched. GTK has no tiled state Kiwi can set, so the layout is global: other windows lose their buttons while a window with top-bar controls has focus.

## Limits
- Apps that hard-code their own layout keep their buttons (Electron and KDE apps with client-side decorations).
- Flatpak GTK apps need the `flatpak override` lines in the README to see the CSS.

## Code
`features/windowControls/` (`index.js`, `model.js`, `greenMenu.js`, `buttonLayout.js`, `appButtons.js`, `gtkTheme.js`, `x11Titlebars.js`, `gtk/`).
