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

## Keyboard accessibility (`keyboard-access`, on)
macOS System Settings > Accessibility > Keyboard, on top of GNOME's own Sticky Keys, Slow Keys and Zoom. Code: `features/keyboardAccess/`, `lib/a11ySettingsModel.js`. Prefs: Keyboard page.

- **Display pressed keys on screen** (`kbd-a11y-sticky-display`, on; `kbd-a11y-sticky-corner`, top right): while Sticky Keys (`org.gnome.desktop.a11y.keyboard stickykeys-enable`) is on, a glass strip shows the latched modifiers outlined and the locked ones filled, in macOS order ⌃ ⌥ ⇧ ⌘ (Alt and AltGr are ⌥, Super is ⌘). The modifier beep is GNOME's `stickykeys-modifier-beep` (Mutter rings the bell); the prefs mirror it.
- **Slow Keys** (`kbd-a11y-slowkeys-indicator`, off as on macOS): a "Slow Keys" chip in the same place while Slow Keys is on. Limit: Mutter gives no signal when a key is accepted or rejected (only its bell, `slowkeys-beep-*`), so there is no acceptance progress.
- **Accessibility Shortcuts** (`kbd-a11y-panel-shortcut`, Super+Alt+F5 for macOS ⌥⌘F5): a glass panel of switches, each a GNOME key: Zoom, VoiceOver (screen reader), Sticky Keys, Slow Keys, Bounce Keys, Mouse Keys, Accessibility Keyboard, Increase Contrast, Reduce Motion, Locate Pointer. Tab and arrows move, Space toggles, Esc closes.
- **Zoom follows the keyboard focus** (`kbd-a11y-zoom-follow`, system): always (focus and caret tracking "push", macOS's "just enough"), only when typing (caret only), never; owned through `core/originals` and given back exactly when set to "As GNOME is set" or when Kiwi is off.
- **Keyboard Viewer** (`kbd-a11y-viewer-shortcut`, none; also "Show Keyboard Viewer" in GNOME's input-source menu): a floating glass keyboard of the current input source, read from the XKB symbols files (includes and variants followed). Holding Shift or AltGr shows the other levels; Caps Lock shifts letters only; dead keys are highlighted. Clicking a key types it into the focused window through a virtual keyboard; clicking ⇧ ⌃ ⌥ ⌘ latches it for the next key. Drag it by its header. Limits: ANSI/ISO main block only (no function row or keypad); IBus input methods show their XKB base layout.

Test: `KIWI_SMOKE_EXTRA=tools/smoke/scenarios/keyboard-access.sh tools/smoke/run-headless.sh 3`.
## Tests
Unit: `tests/inputIndicatorModel.test.js`. Real Shell: `KIWI_SMOKE_EXTRA=tools/smoke/scenarios/caret.sh tools/smoke/run-headless.sh 3` (badge lifetime and caret following, the dialog ⇪, Caps Lock tap and hold with US + Russian, per-window ownership and restore, the input key).

## Press and hold for accents, Text Replacements (Kiwi input engine)
macOS types accents by holding a letter, and expands Text Replacements ("omw" → "On my way!"). A GNOME Shell extension cannot see the keys typed into apps on Wayland, so both live in a small IBus engine that ships as its own package: `helpers/kiwi-input/`, installed with `sudo make input-install` or the RPM from `make input-rpm`. IBus reads engines only from `/usr/share/ibus/component`, so there is no per-user install.

- **Input sources.** One engine per keyboard layout, listed as "English (US) (Kiwi)" and so on: the curated Latin layouts in `enginesModel.js` plus every layout the user has in GNOME (read when IBus starts). The engine keeps the layout and variant; GNOME switches to it like any input source. Settings > Keyboard > Text Input > "Add Kiwi input sources" appends a Kiwi source for each of the user's layouts and never removes or reorders theirs.
- **Press and hold (`input-press-and-hold`, on).** A press of a letter with accents types the letter; if the key is still down after the key-repeat delay, the variants appear in GNOME's input-method popup at the caret, numbered 1–9 in the macOS (English, US) order. A number, ← → and Return, or a click picks one and replaces the letter; Esc keeps the letter; any other key closes the popup and types as usual. Repeats of the held key are swallowed (the engine types the letter itself, so the app never starts its own key repeat). Off while key repeat is off, as on macOS. The `g` row (ğ ġ ģ) is a Kiwi addition.
- **Text Replacements (`input-replacements`, on; list `input-replacements-list`, default `omw` → "On my way!").** A shortcut typed as a whole word and followed by a space or punctuation becomes its phrase; Backspace right after puts the shortcut back. The engine follows what was typed since the last focus change or cursor key (and since a click, in apps that reset the input method on a click, as GTK does). The list is edited in the preferences.
- **Deleting the typed letter.** Through the app's surrounding text when it supports it (GTK, Qt and most Wayland apps), else with a forwarded Backspace.
- **Limits.** Works only while a "(Kiwi)" source is selected; inside other IBus engines (Chinese, Japanese …) the user's engine wins. Apps that bypass the input method (some games, `xdotool`) do not see it. The popup is GNOME's own candidate popup, not a Kiwi-drawn one.

Code: `helpers/kiwi-input/`, `lib/inputSourcesModel.js`, `prefs/textInput.js`. Tests: `tests/kiwiInputModel.test.js`, `tools/input/engine-test.sh` (`make input-test`: the engine on a private ibus-daemon, driven like an app).
