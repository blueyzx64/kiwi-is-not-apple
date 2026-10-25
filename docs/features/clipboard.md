# Clipboard history

## 1. Summary
Keeps a history of what was copied (text, links, colours, images). It has a top-bar
popover and a keyboard-driven **Quick Paste** window. There is no default shortcut (GNOME
extension rules forbid one); the prefs row has a *Use Super+Shift+V* button.

## 2. Locked decisions
- It is a must-have.
- Two surfaces: the panel popover (mouse) and Quick Paste (keyboard). See the canvas boards
  "Clipboard: panel popover" and "Quick Paste".
- Pinned items sit at the top and never expire.

## 3. UI
- **Popover:** title + count, search field, filter buttons (All · Text · Links · Images),
  then Pinned and Recent sections. Each row has a type tile, a one-line preview, and
  "source app · age". Pin and Remove buttons appear on hover. The footer has the
  Recording/Paused switch, the shortcut hint and Clear History.
- **Quick Paste:** a centred glass window. The list is on the left and a large preview with
  metadata on the right. Paste and Pin buttons sit under the preview and keyboard hints in
  the footer. Enter pastes into the previously focused window.
- **Copy feedback:** a short "Copied" pill in the notch (feature 5). If the notch is off,
  show nothing.

## 4. Settings (proposed)
`clipboard-history` b · `clipboard-shortcut` as=`[]` (empty by default; the prefs button *Use Super+Shift+V* sets `['<Super><Shift>v']`) · `clipboard-panel-icon` b ·
`clipboard-history-size` i=25 · `clipboard-images` b=true · `clipboard-persist` b=**true** ·
`clipboard-ignore-sensitive` b=true

## 5. Interactions
- **Spotlight** shows clipboard matches as a result group.
- **Notch dashboard** shows the three latest items.
- **Persistence (owner decision: always saved by default):** Kiwi fully tears down on lock
  (an EGO requirement), so history is written to `~/.local/share/kiwi/clipboard/` (mode
  0600, images as separate files) and reloaded on enable. Clear History and Remove delete
  the files too. Users can turn persistence off.
- **Privacy:** never record entries marked `x-kde-passwordManagerHint=secret`. Stop
  recording while locked.

## 6. Acceptance
- [ ] Watches `Meta.Selection` `owner-changed` for clipboard changes; no polling.
- [ ] Image entries are capped by size and thumbnails are generated lazily.
- [ ] Paste works on Wayland: set the clipboard, then send a virtual Ctrl+V to the
  previous focus.
