# Volume pill, glass dialogs and colour filters

## Volume and brightness (`osd`)
`osd-location` chooses where changes show: `notch` (default, while the notch runs; otherwise the pill), `menu-bar` (a compact glass pill that drops under the menu bar) or `system` (GNOME's centred pop-up). Volume, brightness and keyboard backlight are routed to one place; other OSDs and other monitors stay stock. The pill shows the output name and mute state and does not take clicks.

`osd-style` picks the pill's look:
- `golden-gate` (default, macOS 27.2): one larger icon on the left and a segmented bar of 16 steps (muted lights none; any audible level lights at least one), centred under the menu-bar item that matches the change: the pinned Sound item or GNOME's volume icon for volume, the pinned Keyboard Brightness item or GNOME's backlight icon for the keyboard backlight, GNOME's brightness icon for the display. Without a matching item it hangs under the Control Center button. It follows the kind of each change while it is open.
- `tahoe` (macOS 26): icon, caption and a continuous track, its right edge on the Control Center button.

Code: `core/osd.js`, `features/osd/` (`model.js`: `segmentFill`, `pickAnchor`, `ggPosition`). Real-Shell scenario: `tools/smoke/scenarios/osd.sh`.

## Glass dialogs (`dialogs`, key `dialogs-glass`, on)
The Shell's modal dialogs (authentication, log out, restart, shut down, Run a Command, other extensions' dialogs) open as glass alerts: icon on top, buttons at the right, the default one in the accent colour. Theme only: the dialogs' logic is untouched. Each dialog is dressed when it opens and undressed when it closes or on disable. There is no preferences row; turn it off with `gsettings set org.gnome.shell.extensions.kiwi dialogs-glass false`. Code: `features/dialogs/`.

## Colour filters (`color-filters`, key `color-filter`, off)
Accessibility filters on the whole screen: greyscale, red/green (protanopia), green/red (deuteranopia) and blue/yellow (tritanopia) corrections, and a colour tint. Settings: `color-filter-kind` (`greyscale` default), `color-filter-intensity` 100, `color-filter-hue` 40 (for the tint). Found on the Appearance page. One shader effect on the Shell's UI group does the work, so changing the type or intensity only updates uniforms. Code: `features/colorFilters/`.

