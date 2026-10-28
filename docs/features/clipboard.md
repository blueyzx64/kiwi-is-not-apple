# Clipboard history

## What it does
Keeps a history of what you copy (text, links, colours, images) with a top-bar popover and a keyboard-driven Quick Paste window. Registry id `clipboard-history` (key `clipboard-history`, on). Code: `features/clipboard/`.

## Use
- **Popover (top-bar icon):** search, filters (All, Text, Links, Images), Pinned and Recent sections. Pin and Remove show on hover. Footer: Recording/Paused switch and Clear History.
- **Quick Paste:** a centred glass window, list on the left and preview on the right. Enter pastes into the window that had focus, through a virtual Ctrl+V on Wayland.
- **Super+V** (`clipboard-shortcut`) opens and closes **Quick Paste**, not the popover. Decision: the shortcut is the keyboard path, and Quick Paste is the keyboard surface (it pastes into the window you came from and works with the top-bar icon hidden); the popover belongs to the top-bar icon, like every macOS menu-bar extra. Super+V is GNOME's "Show notification list" (`org.gnome.shell.keybindings toggle-message-tray`, `['<Super>v', '<Super>m']`): while clipboard history runs, that key loses only the accelerators `clipboard-shortcut` uses, through `core/originals` (`SettingOwner` + `freeAccels`), so Super+M still opens the notification list. Disabling the feature, or changing the shortcut, writes the user's exact value back (also after a crash, through `restoreStale`). Prefs say "Kiwi takes it over from GNOME" for Super+V instead of the conflict note.
- **Keyboard (both surfaces):** typing filters (the search field keeps focus); Up/Down move the selection and the list scrolls so the selected row stays in view (a short ease, no jump); Left/Right switch the category tabs All, Text, Links, Images (plain arrows only: with Shift, Ctrl or Alt they edit the search text); Enter pastes (Quick Paste) or copies (popover); Esc closes. Quick Paste also has Page Up/Down, Ctrl+P pin and Ctrl+D remove.
- **Scrollbar:** a thin overlay bar, shown only while the list scrolls or the pointer is on it, in a gutter the rows leave free on the right, so it never covers the time labels or the selection.
- Spotlight and the notch's Tray can show clipboard entries.

## Settings (default)
`clipboard-history` on · `clipboard-recording` on (a pause switch) · `clipboard-shortcut` Super+V · `clipboard-panel-icon` on · `clipboard-history-size` 25 (pinned items do not count and never expire) · `clipboard-images` on (over 5 MB never kept) · `clipboard-persist` on · `clipboard-ignore-sensitive` on · `clipboard-excluded-apps` empty.

## Privacy and limits
- History is saved in `~/.local/share/kiwi/clipboard/` (files readable only by you, images as separate files), because Kiwi tears down on every screen lock. Clear History and Remove delete the files. Turn `clipboard-persist` off to keep history in memory only.
- Nothing is recorded while the screen is locked. Copies marked secret and copies from password managers are skipped.
- It watches the selection `owner-changed` signal; there is no polling.
