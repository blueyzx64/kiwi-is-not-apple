# Control Center

## 1. Summary
GNOME Quick Settings re-laid out as a macOS-style Control Center: grouped glass tiles,
big sliders, Now Playing, and drill-down pages. Canvas board: "Control Center".

## 2. Locked decisions
- It restyles and rearranges GNOME's own Quick Settings items rather than replacing their
  logic. All toggles keep working through GNOME's own code.
- Liquid Glass and Stage Manager get tiles here.

## 3. UI (352px wide, 12px padding, 10px gaps)
1. **Connectivity block** (2×2): Wi-Fi, Bluetooth, VPN. The round button toggles; the label
   opens a device or network list with a back button.
2. **Do Not Disturb** (2×1) + **Stage Manager** and **Liquid Glass** (1×1 each).
3. **Display** slider (brightness; Night Light status at the right).
4. **Sound** slider (the arrow at the right picks the output).
5. **Now Playing** (art, title, play/pause, next).
6. **Small tiles** ×4: Dark Style, Night Light, Power Saver, Screenshot.
7. **User row:** avatar, name, battery % and time left, then Settings, Lock and Power.
8. "Edit Controls…" (v2: reorder or hide tiles).

## 4. Settings (proposed)
`control-center` b · `control-center-user-row` b (replaces `add-username-to-quick-menu`) ·
`battery-percentage-always` b

## 5. Interactions
- Absorbs `addUsernameToQuickMenu.js`, `quickSettingsDnDRemoval.js` and the
  `custom-dnd-button` behaviour. Those keys migrate.
- Items from other extensions (unknown QuickToggles) go into an "More" section at the
  bottom, never dropped.
- The drill-down pages reuse GNOME's existing menus (the network and Bluetooth submenus).

## 6. Acceptance
- [ ] Every stock Quick Settings item is still reachable.
- [ ] Turning it off restores the stock grid order and styling exactly.
