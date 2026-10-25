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
- Removing the buttons from windows (owner decision, UX round 1, replaces the earlier
  "never write `button-layout`" limit): with scope `all` and `remove-titlebar-buttons` on, Kiwi
  saves the user's `org.gnome.desktop.wm.preferences button-layout` in the Kiwi key
  `saved-button-layout` and sets it to the same layout without close/minimize/maximize. GTK 3,
  GTK 4/libadwaita, Chromium/Electron (GTK titlebar) and Mutter's server-side frames follow it
  live. The original is written back exactly when the controls or the option are turned off, the
  scope changes, or Kiwi is disabled, and once at start-up after a crash. `system` placement reads
  the saved original. With scope maximized/fullscreen the layout is untouched and GTK CSS hides
  the buttons of GTK windows in those states. Firefox and Thunderbird have their own CSS files.
  Apps that hard-code their own layout keep their buttons.
  **Flatpak:** GTK apps in Flatpak only see the hide-titlebar CSS when the `flatpak override`
  lines in the README (Flatpak theming) are applied.

## 4. Settings (proposed)
| Key | Type | Default |
|---|---|---|
| `show-window-controls` | b | existing |
| `window-controls-scope` | s: `all` \| `maximized` \| `fullscreen` | `all` |
| `window-controls-position` | s: `system` \| `left` \| `right` | `left` |
| `remove-titlebar-buttons` | b | `true` |

`show-window-controls-fullscreen-only` gets migrated to `window-controls-scope=fullscreen`.

## 5. Interactions
- **Auto-hide top bar:** the controls go with the bar. When the bar is hidden there are no
  buttons on screen; that is accepted, the same as on macOS in full screen.
- **Stage Manager:** minimize moves the window to the strip instead of the dock.
- **Existing `hide-titlebar*.css`:** reuse it; do not add a second copy of this CSS.

## 6. Acceptance
- [ ] The buttons follow focus changes within 1 frame and ignore unmanaged windows.
- [ ] Turning the feature off restores the GTK CSS and the saved `button-layout` exactly.
- [ ] Works with GTK 3 and GTK 4 apps, Flatpak included (with the documented overrides).
