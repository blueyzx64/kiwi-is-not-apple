# Window buttons

## What it does
Close, minimize and maximize stay on each app's own titlebar, always. Kiwi draws no window buttons in the top bar (the top-bar controls and the green-button menu were removed in round 3). Registry ids `app-buttons` and `gtk-theme`. Code: `features/appButtons/`.

## Use
- **Side (`window-controls-side`, default `right`):** the GNOME side. `left` is the macOS side. Kiwi sets the GNOME `button-layout`, so GTK 3, GTK 4/libadwaita, Chromium/Electron and server-side frames follow it. Other entries of the layout (app menu, icon) stay, mirrored to the opposite side when the buttons move.
- **Buttons (`app-buttons-set`, default `all`):** close, minimize and maximize, or close only (the stock Fedora layout).
- **Look (`app-buttons-style`, default `macos`):** macOS traffic lights, in GTK CSS, or the stock GNOME look. Size `small`/`normal` (`button-size`). Open apps pick up a new look when restarted.
- **Unsaved dot (`app-buttons-unsaved-dot`, default on):** with the macOS look, a dark dot sits in the red close button of a window whose title marks unsaved changes (a leading `*`, a `•`/`●` before or after the name, `[Modified]`/`(modified)`). It is a Shell actor on the window's actor, placed from the frame rect (`model.js` `isModifiedTitle`, `closeDotCenter`).
- **Bounce (`app-buttons-bounce`, default on):** the traffic lights shrink while pressed and spring back (macOS 27), a GTK CSS transition on the button image; not imported with Reduce Motion or animations off.
- **More distinct active window (`app-buttons-distinct-active`, default on):** the focused window casts a deeper shadow, inactive windows a lighter one and their titles fade (macOS 27). GTK CSS for apps that draw their own titlebar.
- **Show toolbar button shapes (`app-buttons-toolbar-shapes`, default off):** a subtle border around headerbar and toolbar buttons (macOS Accessibility > Display), GTK 3 and 4.
- **Tiling and Split View** do not need a button: use the drag-to-top layout picker and the shortcuts ([windows.md](windows.md)). Kiwi cannot add a hover menu to GTK apps' own buttons.

## Settings (default)
`window-controls-side` `right` · `app-buttons-set` `all` · `app-buttons-style` `macos` · `button-size` `small` · `app-buttons-unsaved-dot` on · `app-buttons-bounce` on · `app-buttons-distinct-active` on · `app-buttons-toolbar-shapes` off.
Deprecated and unread: `show-window-controls`, `window-controls-scope`, `remove-titlebar-buttons`, `hide-maximized-titlebars`, `windows-traffic-style`, `windows-green-click`, `windows-green-menu`, `enable-app-window-buttons` (migrated to `app-buttons-style`).

## How it works
Kiwi owns GNOME's `button-layout` while it runs. The user's original is saved by `core/originals.js` and restored exactly on disable, also after a crash and after an upgrade from a build that had the top-bar controls (those stripped the buttons from the layout). GTK CSS in `~/.config/gtk-{3,4}.0/gtk.css`, between Kiwi's marker comments, gives the traffic-light look; the rest of that file is never touched.

## Limits
- Apps that hard-code their own layout keep their buttons (Electron and KDE apps with client-side decorations).
- Flatpak GTK apps need the `flatpak override` lines in the README to see the CSS.
- Without top-bar controls, an app that hides its own titlebar when maximized has no buttons: use its own shortcuts.
- Unsaved dot: only the window title is read. Apps that mark changes only inside the window get no dot (GNOME Text Editor shows "•" in its headerbar but not in the title). One button geometry, measured on libadwaita headerbars; plain GTK 4 and GTK 3 headerbars sit a few pixels further in, so the dot may be off-centre there. It stays while the pointer is over the button (macOS shows × instead). Server-side frames get no dot.
- Distinct active window and toolbar shapes: GTK apps with client-side decorations only; Qt, Electron and server-side frames keep their look. Like the traffic lights, open apps pick up a change when restarted.

## Code
`features/appButtons/` (`index.js`, `model.js`, `buttonLayout.js`, `gtkTheme.js`, `unsavedDots.js`, `prefs.js`, `style.css`, `gtk/`: `titlebuttons*`, `titlebuttons-bounce-*`, `active-window*`, `toolbar-shapes*`, `fixes*`).
