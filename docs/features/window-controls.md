# Window controls in the top bar + button-free windows

## 1. Summary
macOS-style close, minimize and maximize buttons ("traffic lights") in the top bar,
always acting on the **focused** window, placed before the app icon and name.
Optionally, real windows lose their own titlebar buttons.

## 2. Locked decisions
- Show the buttons for **every focused window**, not only maximized ones (today's default
  in `apps/windowControls.js` is maximized/fullscreen only).
- Removing the buttons from real windows is **on by default** when the feature is on, and
  the user can turn it off.
- The app menu stays as it is now (icon + name). No global menu.

## 3. UI
- Order on the left of the top bar: `[● ● ●] [icon] App Name`.
- The buttons use the existing Kiwi styles (Default / Alternative / Glass) and sizes.
- Hovering shows the glyphs (×, −, ⤢) on all three buttons at once, like macOS.
- No focused window (empty desktop): hide the buttons; the name reads "Desktop" or is hidden.
- Removing the buttons from windows: CSD apps (GTK 3/4) get CSS that hides the titlebar
  buttons. Server-side decorated windows get the `button-layout` with no buttons
  (`':'`), and the original value is restored on disable.
  Electron, Qt and Firefox are best effort: Firefox and Thunderbird have their own CSS
  files; others keep their buttons.

## 4. Settings (proposed)
| Key | Type | Default |
|---|---|---|
| `show-window-controls` | b | existing |
| `window-controls-scope` | s: `all` \| `maximized` \| `fullscreen` | `all` |
| `window-controls-position` | s: `system` \| `left` \| `right` | `system` |
| `remove-titlebar-buttons` | b | `true` |

`show-window-controls-fullscreen-only` gets migrated to `window-controls-scope=fullscreen`.

## 5. Interactions
- **Auto-hide top bar:** the controls go with the bar. When the bar is hidden there are no
  buttons on screen; that is accepted, the same as on macOS in full screen.
- **Stage Manager:** minimize moves the window to the strip instead of the dock.
- **Existing `hide-titlebar*.css`:** reuse it; do not add a second copy of this CSS.

## 6. Acceptance
- [ ] The buttons follow focus changes within 1 frame and ignore unmanaged windows.
- [ ] Turning the feature off restores `button-layout` and the GTK CSS exactly.
- [ ] Works with GTK 3 and GTK 4 apps, Flatpak included (with the documented overrides).
