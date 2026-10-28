# Pointer: shake to locate, hide while typing, size and colours

Like macOS Accessibility > Display > Pointer, plus AppKit's habit of hiding the pointer while
you type. Preferences: Appearance > Pointer. Registry id `pointer` (runs while any of its
settings is on). Code: `features/pointer/`.

## Shake mouse pointer to locate (`pointer-shake-to-locate`, on)
Shake the mouse, or move a finger quickly side to side on the touchpad, and the pointer grows to
about four times its size; it shrinks back shortly after you stop. A shake is three quick
reversals of side-to-side strokes of at least 50 px within 0.8 s (`features/pointer/model.js`
`ShakeDetector`); slow back-and-forth, small wiggles, a long straight move and vertical shaking
do not count. The big pointer is the current cursor sprite drawn by Kiwi at the pointer, while the
real one is hidden. Reduced motion: it jumps to the big size and back instead of growing.

## Hide pointer while typing (`pointer-hide-while-typing`, on)
The pointer hides when you type in a text field and comes back as soon as the mouse moves.
Typing is the text cursor moving twice with the pointer still (one move alone is a click that
placed the caret, or a focus change). It never hides while a mouse button is held, during a
window grab, over the overview or a Shell modal, or after you switch windows.

Limit: it needs an app that reports its text cursor (the same source as the text cursor badges:
GTK, Qt and most Wayland apps through IBus; apps that never report one keep the pointer).

## Pointer size (`pointer-size`, 'system')
System (GNOME's own size, untouched), Normal 24, Large 32, Larger 48, Largest 64, Huge 96. Kiwi
owns `org.gnome.desktop.interface cursor-size` while it is set and gives your own size back
when you pick System or Kiwi stops.

## Custom colours (`pointer-custom-colors`, off; `pointer-fill-color` '#000000', `pointer-outline-color` '#ffffff')
Pick the outline and fill colours; Reset puts back the macOS defaults (white outline, black fill).
Kiwi makes a recoloured copy of your cursor theme (dark parts take the fill, light parts the
outline, the soft shadow stays) in `~/.local/share/icons/Kiwi-Pointer-<colours>/` and selects it
through `cursor-theme` (given back when the option is off or Kiwi stops). A change of colour makes
a new folder and removes Kiwi's older ones; turning the option off removes them all. Only
folders with Kiwi's `.kiwi-pointer` marker are ever touched.

Limit: only Xcursor themes are recoloured (Adwaita and most themes are). Apps that draw their own
cursor images keep theirs.

## Tests
`tests/pointerModel.test.js`; real Shell: `tools/smoke/scenarios/pointer.sh`
(`KIWI_SMOKE_EXTRA=tools/smoke/scenarios/pointer.sh tools/smoke/run-headless.sh 3`).
