# Input: text cursor badges and Emoji & Symbols

## Text cursor indicators (`input-indicator`, on)
A small glass badge at the text cursor when Caps Lock turns on or off (`input-indicator-caps-lock`, on) or the input source changes (`input-indicator-source`, on). It fades out by itself. The cursor position comes from the IBus panel service; in apps that do not report one the badge shows near the pointer. Code: `features/inputIndicator/`, `lib/caret.js`.

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
