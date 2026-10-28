# Input: text cursor badges, input sources and Emoji & Symbols

## Text cursor indicators (`input-indicator`, on)
A small glass badge at the text cursor, like macOS Sonoma. The cursor position comes from the IBus panel service; in apps that do not report one the badge shows near the pointer. Code: `features/inputIndicator/`, `lib/caret.js`.
- **Caps Lock** (`input-indicator-caps-lock`, on): ⇪ in the accent colour stays under the cursor and follows it for as long as Caps Lock is on. Without a known cursor it shows by the pointer and fades out. Not in the Shell's own password fields, which have their own cue (below).
- **Caps Lock off** (`input-indicator-caps-off`, off): a muted ⇪ for a moment when Caps Lock is turned off. macOS shows nothing, so it is opt-in.
- **Input source** (`input-indicator-source`, on): the new source's short name for a moment. GNOME's own switcher popup still shows when the shortcut cycles sources; the badge shows after it. While Caps Lock is on, the ⇪ comes back when the source badge fades.

## ⇪ in password fields (`dialogs-caps-lock-icon`, on; needs `dialogs-glass`)
The Shell's password dialogs (authentication, keyring, Wi-Fi, encrypted disks) show ⇪ inside the password field, before its show-password button, while Caps Lock is on, like the macOS login window. The Shell's "Caps lock is on" line under the field is kept hidden while the dialog is restyled and gets its visibility back after. Code: `features/dialogs/capsLock.js`.

## Caps Lock switches the input source (`input-caps-lock-switch`, off)
macOS "Use the Caps Lock key to switch to and from ABC". With a Latin and a non-Latin source (for example English and Russian, or English and Chinese), a tap of Caps Lock switches to the most recent source of the other kind and leaves Caps Lock off; holding it (longer than 350 ms) turns Caps Lock on as usual. The Shell sees no key release, so tap and hold are told apart by the core idle monitor: 350 ms after the press, an idle time of about 350 ms means the key is still held. A tap's Caps Lock is turned back off with a virtual key press. No effect with only Latin sources. The ⇪ badge waits for the decision, so a tap shows only the new source. Code: `features/inputIndicator/capsSwitch.js`.

## Input source per window (`input-per-window`, 'system')
macOS "Automatically switch to a document's input source". 'document' gives each window its own source, 'global' one source everywhere; Kiwi owns GNOME's `org.gnome.desktop.input-sources per-window` through `core/originals` and gives your value back with 'system' (the default, untouched) or when Kiwi is off. Code: `features/inputIndicator/perWindow.js`.

## The input key (`input-key-action`, 'none'; `input-key-shortcut`, empty)
macOS "Press fn (Globe) key to". Linux keyboards have no Globe key that reaches the desktop, so you pick the key (Menu, F13, or a chord) and what it does: 'input-source' switches to the previous source, 'emoji' opens Emoji & Symbols. Runs only with an action and a key set. Code: `features/inputIndicator/inputKey.js`.

## Emoji & Symbols (`emoji-picker`, on)
Super+Ctrl+Space (`emoji-shortcut`) opens a popover at the text cursor (centred when the app reports none) with a searchable emoji grid, recents, categories and skin tones (`emoji-skin-tone`, `emoji-recents`). Choosing an emoji types it into the window that had focus: through the input method when that window is a text-input client (the clipboard is untouched), otherwise by the Quick Paste technique (the emoji goes on the clipboard, a virtual keyboard sends the paste, and the old clipboard comes back). Names and data come from IBus's emoji dictionary. Code: `features/emoji/`, `lib/paste.js`.

## Tests
Unit: `tests/inputIndicatorModel.test.js`. Real Shell: `KIWI_SMOKE_EXTRA=tools/smoke/scenarios/caret.sh tools/smoke/run-headless.sh 3` (badge lifetime and caret following, the dialog ⇪, Caps Lock tap and hold with US + Russian, per-window ownership and restore, the input key).
