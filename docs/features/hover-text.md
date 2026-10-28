# Hover Text, Hover Typing, Hover Color, keyboard focus highlight

macOS System Settings > Accessibility > Hover Text (Hover Text, Hover Typing, Hover Color) and
Keyboard > Full Keyboard Access (its highlight). One feature, registry id `hover-text`, that runs
while any of its four parts is on. All four are **off by default**, as on macOS. Preferences:
Features > Hover Text.

## Hover Text (`hover-text`, off)
Hold the activation modifier (`hover-modifier`, default Super, the macOS ⌘; also Control, Alt or
Shift) and point at text: a large panel by the pointer shows the text under it (the sentence
under the pointer for long text), and an outline (`hover-highlight-color`, empty = accent) marks
the element. Release the modifier and both go away.

**Activation lock:** press the modifier three times quickly (each within 450 ms of the last) to
keep Hover Text on without holding it; three more presses turn the lock off.

Look: `hover-text-size` (36 px), `hover-text-color` (empty = theme), `hover-background-color`
(empty = Kiwi glass; a colour gives a solid panel).

**Super and Spotlight:** a bare Super tap opens Spotlight (or the overview). While Super is the
activation modifier, a Super release after a hover, and the second and third press of a triple
press, are kept from that (Kiwi blocks Meta.Display `overlay-key` for that release only). The
first press of a triple press is still a tap, so the lock with Super also opens Spotlight once:
choose Control or Alt if that is in the way.

## Hover Color (`hover-color`, off)
The same activation shows a large swatch and the hex value (`#RRGGBB`) of the pixel under the
pointer, alone or under the Hover Text panel. Reads the screen through `Shell.Screenshot.pick_color`.

## Hover Typing (`hover-typing`, off)
While you type in a text field, a large copy of the line being typed, with the insertion point
drawn (`hover-insertion-point-color`, empty = theme), and an outline around the field.
`hover-typing-position`: by the text cursor (default; the IBus caret, else the field) or a screen
corner. `hover-typing-size` (36 px). **Password fields are never shown** (AT-SPI role
PASSWORD_TEXT). The panel goes away when the focus moves to another field or window, and while
the Hover Text panel is up.

## Keyboard focus highlight (`hover-focus-highlight`, off)
A ring around the item that has the keyboard focus in apps, moved as the focus moves:
`hover-focus-color` (empty = accent), `hover-focus-width` (3 px; macOS "Increase size"),
`hover-focus-contrast` (a dark or light edge around the ring), `hover-focus-autohide` (seconds
after the focus last moved; 0 = always shown). Only the highlight is Kiwi's: moving the focus
(Tab, arrows) and activating (Space, Enter) stay with the apps, which GTK already does for every
control.

## Where the text comes from, and limits
Everything an app shows Kiwi comes from the accessibility bus (AT-SPI), read with async D-Bus
calls with timeouts (`lib/atspiBus.js`), at most one pointer query in flight, debounced to 60 ms:
a slow or hung app never stalls the desktop.
- **GTK 4** (GNOME apps, libadwaita): text, focus and caret work. Checked on Shell 50.6 with GNOME
  Text Editor (`tools/smoke/scenarios/hover-text-atspi.sh`): Hover Typing, the focus ring and Hover
  Text read the text view, and its rect lands inside the window frame.
- **GTK 3**: expected to work; coordinates count from the window's surface (with its client-side
  shadow), so Kiwi maps them through the buffer rect. Not checked in the test session.
- **Firefox, Chromium/Electron, Qt**: they expose their tree only while accessibility is on
  (`org.gnome.desktop.interface toolkit-accessibility`, or a screen reader running); Kiwi does not
  change that setting. Their window coordinates are treated like GTK 4's; not checked.
- Under Wayland apps cannot report screen coordinates. Kiwi asks for window coordinates and adds
  the window's position, so rects are right for normal windows; popovers that are separate
  surfaces may be offset.
- Terminals (VTE) expose their text; very long documents are read 4000 characters at a time.
- Apps send AT-SPI events only while someone listens: the first focus change after the feature
  starts is what Hover Typing and the focus ring wait for.

## Code
`features/hoverText/`: `model.js` (pure: settings, the triple-press lock, coordinate mapping, text
windows, placement, colours; `tests/hoverTextModel.test.js`), `atspiSource.js` (AT-SPI reads and
events), `view.js` (the panel and outline actors), `index.js` (the adapter), `prefs.js`.
Real-Shell scenarios: `tools/smoke/scenarios/hover-text.sh` (every path through test seams; no a11y
bus in the smoke session) and `hover-text-atspi.sh` (a real a11y bus and GTK 4 app).
