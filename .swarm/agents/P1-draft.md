# Kiwi: release notes and manual test list (draft, P1)

Sources: `.swarm/agents/*.md` on this branch, the notch lead's newer `S8.md` from the worktree `/home/user/kiwi-notch`, `.swarm/shared/decisions.md`, `board.md`, `docs/features/README.md` and `git log main..ccr-f3c1f44c-rv5a8r`.

Status at the time of writing (per `board.md`):
- Merged on the branch: Wave 0 Firefox fix, foundation, advanced/ fixes, window controls, Liquid Glass (plus two audit fixes), clipboard, Spotlight, auto-hide (plus fix), Control Center, Stage Manager, debt modules D1 to D8.
- **Notch (S8): NOT merged yet.** The board says "R8 CHANGES; S8 fixing". Its code and manual list live only in the `feat/notch` worktree. Everything about the notch below is conditional on that merge.
- **Still open in the board:** D9 (small modules), D10 (window move), L1 (lint), A2 (audit of Control Center, Stage Manager, clipboard, Spotlight), X1 (Shell smoke harness). Their branches exist but there is no report for them, so this draft does not describe their changes. Add them when they land.

## 1. Summary

- **Firefox/Thunderbird data-loss fix (shipped first).** Kiwi no longer deletes a user's own `chrome/` folder in a Firefox or Thunderbird profile. Wave 0 went to main as its own PR (#1). Later work made all profile file access async, stopped writing empty files, and removes Kiwi's `user.js` line again on disable.
- **Foundation.** `extension.js` shrank to about 60 lines. A new feature registry (`features.js`, `lib/featureRegistry.js`) starts and stops features in order. Shared helpers cover cleanup (`lib/disposables.js`), settings and migrations (`lib/settings.js`) and Shell-version differences (`lib/compat.js`, 48 to 51). Shell behaviour was meant to stay the same. Four small bug fixes went in separately.
- **`advanced/` GTK3 module fixes.** No more 800 ms polling; hover state is recomputed so highlights can't stick; `GTK3_MODULES` is appended to instead of overwritten; the `.so` is installed by temp file plus rename; the prebuilt binary gets a sha256 and x86_64 check; README Wayland note fixed.
- **Window controls in the top bar.** Close, minimize and maximize move into the panel for any focused window, including dialogs. A layout coordinator places them, scope and position are settings, and Kiwi can remove the apps' own titlebar buttons (GTK3/GTK4).
- **Liquid Glass.** A shared glass service (blur, tint, rim, highlight) used by the panel, menus, dock and overlays. Styles, sliders, high-contrast, reduced-motion and power-saver handling are included; refraction is experimental. Old `panel-blur`/`dock-blur` keys migrate into it.
- **Auto-hide top bar.** A pressure-barrier reveal replaces the old "show panel on hover in fullscreen" feature. Menus, overview and a "hold" API keep the bar up when needed.
- **Clipboard history, Spotlight, Control Center, Stage Manager.**
  - Clipboard: popover plus Quick Paste, saved to disk.
  - Spotlight: apps, files, settings, calculator and unit conversion, clipboard, web search. A Super tap opens it.
  - Control Center: the Quick Settings menu rearranged into a 4-column macOS-style layout.
  - Stage Manager: a left-edge strip of app cards; other apps' windows are hidden, not minimized.
- **Notification notch (pending merge).** A black pill at top centre for notifications, volume and brightness feedback and Now Playing, built on a new notification router and a shared MPRIS watcher.
- **Debt fixes.**
  - D1: Firefox/Thunderbird/GTK theme managers moved to async I/O.
  - D2: panel transparency tracks windows on all workspaces; the 2 s poll and sync wallpaper read are gone.
  - D3: overview patches go through the cleanup registry.
  - D4: shared window helpers, and `transparentMove` keyed by window instead of pid.
  - D5: dock retry unified, and Dash to Dock colours are saved so a crash can be repaired.
  - D6: CSS rules gated behind Kiwi classes.
  - D7: Makefile, CI workflow, and the archived release-upload action replaced.
  - D8: code map and docs refreshed.

## 2. Behaviour changes users will notice

New features default to ON (owner decision); users opt out in prefs.

- **Window controls:**
  - Controls appear in the top bar for any focused normal window, not only maximized ones. New settings are scope (all / maximized / fullscreen), position and `remove-titlebar-buttons`.
  - `remove-titlebar-buttons` defaults to ON, so GTK apps lose their own titlebar buttons.
  - Dialogs and modal dialogs also get panel controls, greyed per capability.
  - `show-window-controls-fullscreen-only` migrates to scope `fullscreen`.
- **Firefox/Thunderbird styling gate:** their profiles are touched only when the per-app styling key is on. Hiding Firefox's native buttons (`Hidden.css`) now also needs that key plus window controls plus `remove-titlebar-buttons`. This is an orchestrator default; the owner should confirm.
- **Super tap opens Spotlight, not the overview.**
  - The overview stays on the hot corner, gesture, Super+A and the Activities button.
  - Super+Space is untouched. Spotlight can be turned off, or the tap setting alone, in prefs.
  - Kiwi blocks only the Shell's own `overlay-key` handler and restores it on disable.
- **Auto-hide top bar is ON:**
  - The bar is hidden until the pointer pushes at the top edge (about 0.15 s dwell), and hides about 0.6 s after leaving.
  - `panel-hover-fullscreen` migrates to `panel-autohide` plus the fullscreen-only option, so users who had fullscreen hover keep similar behaviour.
- **Clipboard history is saved to disk by default**, in `~/.local/share/kiwi/clipboard/` (directory 0700, files 0600), and reloaded on enable. Password-manager secrets are not recorded, and nothing is recorded while locked. **The shortcut is empty by default** (EGO rule); a prefs button sets Super+Shift+V.
- **Liquid Glass is ON.** With it on, the old `panel-blur`/`dock-blur` keys do nothing; the surfaces list rules. Old values migrate into that list.
- **Control Center is ON.**
  - The Quick Settings grid becomes 4 columns with a new order, a user row (avatar, name, battery with time left) and a Now Playing tile.
  - It owns Do Not Disturb. The old username-in-menu setting migrates to `control-center-user-row`.
  - `battery-percentage-always` is a new, off-by-default key.
- **Stage Manager is ON and wins over minimize-to-dock.**
  - While it is on, `minimize-to-dock`, `move-window-to-new-workspace` and `tiling-title-menu` are paused. Their saved values are kept.
  - Windows are hidden (opacity 0), never minimized.
- **Notch (once merged) replaces stock banners and the stock OSD** on the primary monitor. History stays in the calendar menu. Do Not Disturb still rules. Turning the notch off restores stock banners.
- **Panel transparency** now reacts to windows on all workspaces; the 2 s poll is gone.
- **Prefs:** new pages in this order after the existing ones: Liquid Glass, Window Controls, Auto-hide Top Bar, Control Center, Clipboard, Spotlight, Notch, Stage Manager; Advanced stays last. The old fullscreen-hover row and the username row are removed.
- **Minimize-to-dock snapshots:** snapshots are cleared on disable except while locked. After disable and re-enable, a minimized window's tile may fall back to its icon (accepted).
- **Dock colours:** Dash to Dock original colours are saved in `dock-colors-saved` and restored on the next enable after a crash.
- **Window title:** a whitespace-only title now clears the label instead of showing a blank one.

## 3. Manual test list for GNOME 48 to 51

Run each item on 48, 49, 50 and 51 where possible, on Wayland and X11 where noted. Watch `journalctl -f -o cat /usr/bin/gnome-shell` for `[Kiwi]` errors throughout. Toggling "20x" means flipping the switch in prefs or dconf 20 times.

### Foundation / Phase 0
- [ ] Enable Kiwi on each Shell version. Expected: no `[Kiwi]` errors in the journal.
- [ ] Flip every prefs switch off and on once. Expected: each feature appears and disappears as before.
- [ ] With window controls on, toggle button-type, enable-app-window-buttons, move-calendar-right and keep-notification-panel. Expected: controls end rightmost each time.
- [ ] Disable and enable the Dash to Dock extension while dock features are on. Expected: Kiwi dock features follow it.
- [ ] Disable Kiwi in the Extensions app and re-enable 5x. Expected: no leftover actors in Looking Glass.
- [ ] Lock with all features on, then unlock. Expected: features return; minimize-to-dock tiles keep their thumbnails.
- [ ] Disable then re-enable Kiwi with a minimized window. Expected: tile may fall back to its icon (accepted).
- [ ] On a laptop, unplug or drop below 20%. Expected: battery label animates, no stall at login; the DND button shows with custom-dnd-button on (also with move-calendar-right).
- [ ] Fullscreen a window. Expected: panel transparency reacts.
- [ ] Run `bash tests/run.sh` and `make check`. Expected: green.
- [ ] Run `gnome-extensions pack` via `make pack` and install the zip. Expected: loads with no missing-file errors (new source folders are in the pack list).

### Firefox / Thunderbird fix and user-file handling (Wave 0, D1)
- [ ] Put your own files in a Firefox profile `chrome/` folder, then toggle Kiwi's Firefox styling on and off. Expected: your `chrome/` content is never deleted.
- [ ] Turn Firefox styling on. Expected: `user.js` has a Kiwi-tagged pref. Turn it off. Expected: the line is gone and your own `chrome/` is restored from `chrome.bak`.
- [ ] Add your own pref line (no Kiwi tag) to `user.js`, then disable. Expected: your line stays.
- [ ] Turn Firefox styling off. Expected: Kiwi does not write into the profile at all, including `Hidden.css`.
- [ ] Lock and unlock. Expected: no profile churn errors in the journal.
- [ ] Kill the Shell and check `~/.config/gtk-3.0/gtk.css`, then re-enable. Expected: Kiwi block cleaned up on re-enable.

### `advanced/` GTK3 module
- [ ] Run `./install-extra.sh`, then log out and in. Expected: `systemctl --user show-environment | grep GTK3_MODULES` keeps any other modules.
- [ ] Hover a titlebutton in Files or Text Editor. Expected: all three light up.
- [ ] Minimize a hovered window. Expected: no stuck highlight.
- [ ] Run `./uninstall-extra.sh`. Expected: the module is removed.

### Window controls
- [ ] Open any non-maximized window. Expected: three buttons left of the app icon and name; close, minimize and maximize work on the focused window.
- [ ] Alt-tab, then click other windows. Expected: buttons follow focus at once; they hide on an empty desktop and in the overview.
- [ ] Hover one button. Expected: glyphs show on all three (Kiwi png mode). Turn app-window-buttons off. Expected: symbolic icons.
- [ ] Set scope to maximized, then fullscreen. Expected: floating windows hide the controls under "maximized"; only fullscreen shows them under "fullscreen"; changes apply live.
- [ ] Set position left, right and system, and set `button-layout` to `appmenu:minimize,maximize,close` with position system. Expected: controls sit right, last slot; with calendar-right on they are still last.
- [ ] Play a fullscreen video. Expected: minimize greyed, close inert for 3 s.
- [ ] Open a GTK3 app and a GTK4 app (Files). Expected: own titlebar buttons gone and the window is still draggable. Turn remove-titlebar-buttons off. Expected: buttons return.
- [ ] Check `gtk-3.0/gtk.css` and `gtk-4.0/gtk.css`. Expected: Kiwi block only, your rules intact; after disable the block is gone and a file Kiwi wrote alone is removed.
- [ ] Try a Flatpak GTK app with the README override. Expected: same as the GTK result above.
- [ ] Open a Qt, Electron or server-side-decorated window. Expected: it keeps its own buttons (known limit).
- [ ] Open a file chooser or GTK dialog. Expected: panel buttons show, greyed per capability; closing via the panel works.
- [ ] Toggle `show-window-controls` 20x, then lock and unlock. Expected: no leaks, panel box unchanged, buttons return.
- [ ] Upgrade with `show-window-controls-fullscreen-only=true`. Expected: scope reads fullscreen.
- [ ] Enable Dash to Dock and Blur my Shell. Expected: no overlap.
- [ ] Check `window-title` on a helper window (`com.*`/`gjs*`) and a whitespace-only title. Expected: label cleared.
- [ ] Open the app menu. Expected: Quit and New Window accelerator labels still show.

### Liquid Glass
- [ ] Liquid Glass on, panel-transparency off. Expected: frosted panel that hides in the overview and over fullscreen; 20x toggle leaves no actors and no errors.
- [ ] Before upgrading set `panel-blur=true`, `dock-blur=false`. Expected: surfaces become menus, overlays, panel (check dconf).
- [ ] Liquid Glass off. Expected: panel and dock blur as before; Dash to Dock blur survives resize, auto-hide and disabling Dash to Dock.
- [ ] Switch light/dark scheme. Expected: overview wallpaper blur unchanged; brightness follows.
- [ ] Move the tint and blur sliders, switch to Clear style, toggle Highlight. Expected: live update; text readable on white and black wallpapers.
- [ ] Turn on high contrast. Expected: glass goes solid, panel opaque; back to normal when off.
- [ ] Turn on reduced motion (50+ a11y reduced-motion; 48 to 49 animations off). Expected: no glass fade.
- [ ] Use Performance mode or Power Saver (with off-in-powersave). Expected: still blurred wallpaper copy, aligned on multi-monitor.
- [ ] Turn on experimental refraction on 48 to 50 and on 51. Expected: works, or journal says "[Kiwi] shader effect unavailable" and plain glass still works.
- [ ] Open Control Center and the calendar. Expected: tinted bubble and blur only while open (note any corner bleed).
- [ ] Install Blur my Shell. Expected: the prefs notice shows.

### Auto-hide top bar
- [ ] Fresh profile. Expected: bar hidden, slides in on a push to the top edge (about 0.15 s) and out 0.6 s after the pointer leaves.
- [ ] Maximize a window. Expected: full height, no jump as the bar shows and hides; turn the setting off and windows shrink once.
- [ ] Play fullscreen video and use a GTK4 app (gnome-text-editor). Expected: bar reveals over it and hides again; fullscreen-only mode shows a normal bar off fullscreen.
- [ ] Open a panel menu (clock, Quick Settings). Expected: bar stays while open, leaves after. Ctrl+Alt+Tab to Top Bar reveals it.
- [ ] Use the hot corner and push right of it (also RTL). Expected: hot corner still opens the overview; pushing right of it reveals the bar; mirrored in RTL.
- [ ] Open the overview. Expected: bar shown, search and workspaces not under it; on exit it hides with no layout jump.
- [ ] Drag a window to the top edge on a Dash to Dock setup. Expected: dock unaffected, bar not revealed.
- [ ] Multi-monitor with a monitor above primary, one beside, then unplug and replug. Expected: monitor above still reachable; none on the side monitor; rebuilds cleanly.
- [ ] Turn keep-on-desktop on. Expected: bar stays with no windows and hides when one opens. Reduced motion on: no slide.
- [ ] Toggle the feature 20x. Expected: no leftover `kiwi-panel-autohide` class, translation or barrier; panel transparency uses the overlay style while auto-hiding.
- [ ] Before upgrade set `panel-hover-fullscreen=false` in dconf. Expected: `panel-autohide` is false afterward.
- [ ] Toggle auto-hide on and off, and check the panelBox chrome flags. Expected: restored to the values recorded at enable.
- [ ] Two workspaces: maximize a window on ws2 while on ws1, then switch. Expected: panel opaque at once; unmaximize elsewhere and switch, panel transparent.
- [ ] Move a maximized window between workspaces, and add and remove a workspace. Expected: panel state follows with no stall.
- [ ] Change wallpaper or color scheme. Expected: foreground contrast updates without a stall.

### Clipboard (Wayland and X11)
- [ ] Enable the feature. Expected: top-bar icon shows. Click "Use Super+Shift+V" in prefs, then press it. Expected: Quick Paste opens; copied text from 3 apps appears with app names.
- [ ] Copy the same text twice. Expected: one row, moved to the top. Pin one, copy 30 others. Expected: pinned stays; the 25-entry cap holds.
- [ ] Paste from Quick Paste into gedit, Firefox and a terminal. Expected: text lands in the previous window; the terminal gets Ctrl+Shift+V.
- [ ] Copy a screenshot to the clipboard. Expected: thumbnail shows and pastes into an image editor; an image over 5 MB is skipped.
- [ ] Copy from KeePassXC and Bitwarden. Expected: not recorded (check `~/.local/share/kiwi/clipboard/history.json`).
- [ ] Copy, lock, unlock. Expected: history is back; copies made while locked are not recorded; `ls -l` shows directory 700, files 600.
- [ ] Log out and in. Expected: history is back. Turn persist off. Expected: files deleted, history stays for the session only.
- [ ] Use Clear History and remove one image. Expected: files gone, pinned entries stay; the image file is deleted.
- [ ] Open the popover while Quick Paste or the Downloads fan is open. Expected: only one stays; glass blur visible; reduced motion means no fade.
- [ ] Toggle the feature 20x. Expected: no leftover icon; shortcut dead when off; no journal errors.
- [ ] Type a bad accelerator in the shortcut field; try Super+V. Expected: bad accel shows red; Super+V shows the GNOME conflict note.

### Spotlight
- [ ] Tap Super, then tap again. Expected: Spotlight opens with no overview flash, then closes.
- [ ] Press Super+A, Super+Tab, Super+Left, Super+L. Expected: stock behaviour, no Spotlight.
- [ ] Use the hot corner, 3-finger gesture and Activities button; tap Super while the overview is open. Expected: overview opens; the tap closes it.
- [ ] Turn "Open with a tap of Super" off. Expected: Super tap opens the overview. Turn it on, then turn Spotlight off. Expected: back to stock.
- [ ] Disable the extension, then re-enable; toggle 20x. Expected: Super tap opens the overview while disabled, Spotlight when enabled; no double open or errors.
- [ ] Type "fire" and use Up/Down/Tab/Shift+Tab/Enter/Esc. Expected: app first with a larger Top hit; Ctrl+Enter on a file shows it in Files; Ctrl+C on "2+2" copies 4.
- [ ] Type "5 km in miles", "72 f to c", "2^10", "1/0", "sqrt(-1)". Expected: conversions and 1024 shown; the last two give no result.
- [ ] Type "wifi", then "liquid glass" and Enter. Expected: Liquid Glass toggles and the subtitle flips; the "stage manager" row shows only if its key exists.
- [ ] Type a file name and press Enter; slow or kill a search provider. Expected: file opens; other groups still appear within 1.8 s.
- [ ] Open with an empty query. Expected: recent apps and recent clipboard; no clipboard group when the clipboard feature is off.
- [ ] Use the web row, a custom engine, and "gnome.org". Expected: browser opens with the engine; "gnome.org" gives an Open row.
- [ ] Open Spotlight and lock (Super+L); also open it with the Downloads fan up. Expected: no modal after unlock and the keyboard works; only one overlay stays.
- [ ] Turn on reduced motion and text scale 1.5, and try two monitors. Expected: no fade, no clipping, shows on the primary monitor.
- [ ] Open Spotlight, then press the Quick Paste shortcut. Expected: only one stays open.

### Control Center
- [ ] Open Quick Settings. Expected: blocks for Wi-Fi/Bluetooth, DND/Stage Manager/Liquid Glass, brightness, volume, toggles, with the footer last.
- [ ] Open every stock item (Wi-Fi, Bluetooth, VPN menus, Night Light, Dark Style, Power Mode menu, screenshot, settings, lock, power menu). Expected: all reachable; rows don't jump in the power menu.
- [ ] Toggle control-center 20x. Expected: grid returns to stock order and 2 columns each time; no leftover tiles or errors.
- [ ] Use the DND tile, with custom-dnd-button on, then turn Control Center off. Expected: tile toggles banners; no second DND button; panel moon sane; stock toggle back, and the Kiwi button back if legacy-configured.
- [ ] Click the Stage Manager and Liquid Glass tiles. Expected: they flip `stage-manager` / `liquid-glass`; menu blur and tile translucency follow.
- [ ] Check the user row and `battery-percentage-always` while plugging and unplugging. Expected: % and time left show; the top-bar label appears; it is off when GNOME `show-battery-percentage` is on.
- [ ] Press lock, unlock, then open the menu; suspend and resume. Expected: lock works; layout is still Control Center.
- [ ] Install a third-party QS extension (Caffeine, Tailscale QS) and toggle it while on. Expected: tile appears under "More" and works.
- [ ] Use `move-calendar-right` with `keep-notification-panel` off. Expected: notification list shows above the footer at full width.
- [ ] Play music. Expected: Now Playing tile appears with working play/pause and next, fades in; hidden when nothing plays; no fade under reduced motion.
- [ ] Turn on high contrast and switch dark/light. Expected: tiles stay solid and follow the scheme.
- [ ] Play a long track title. Expected: menu width stays near stock.
- [ ] Before upgrade set `add-username-to-quick-menu=true`. Expected: user row is on afterward.

### Stage Manager
- [ ] Open 3+ windows from 2+ apps. Expected: glass pill at the left edge with one card per other app; the focused app is not in it.
- [ ] Open two windows of one app. Expected: card shows a small stack offset toward the screen edge. Cards should lean toward the stage; if wrong, flip the sign in `cardTilt()`.
- [ ] Click a card. Expected: that app's last used window gets focus and the strip updates.
- [ ] Play a video in an unfocused window. Expected: its thumbnail stays live.
- [ ] Auto-hide on: drag the focused window over the strip, then move the pointer to the left edge. Expected: strip slides away, then back. Off: always shown.
- [ ] Open the overview and fullscreen a window. Expected: strip gone in both, back after; overview shows all windows including staged ones and re-hides them on close.
- [ ] Change side to right, group-by-app off, recent count 2, switch off. Expected: all apply live; off removes the strip with no leftovers.
- [ ] Turn on reduced motion. Expected: strip snaps with no slide.
- [ ] Switch stage. Expected: the previous app shrinks toward the strip and vanishes but keeps running (video plays); click-through works where it was.
- [ ] Minimize a staged window from the panel, then toggle Kiwi off. Expected: it goes to the strip and the next app takes the stage; on disable all windows return and that one is minimized.
- [ ] Toggle stage-manager 20x and lock/unlock. Expected: no window stuck invisible; sizes and places unchanged.
- [ ] Check conflicts. Expected: with Stage Manager on, minimize-to-dock, move-window-to-new-workspace and tiling-title-menu are paused with saved values kept; alt-tab to a hidden window switches to its stage.

### Notch (only once feat/notch is merged)
- [ ] Log in fresh with the notch on. Expected: black 190x32 pill at top centre, clock at right, no overlap.
- [ ] Run `notify-send "Hi" "body"`. Expected: card grows (spring), stays 5 s, shrinks; no banner at top right; the notification is still listed in the calendar and Quick Settings menus.
- [ ] Run `notify-send -u critical`, then `-u low`, then 3 quick sends. Expected: critical stays until dismissed; low shows compact; newest shown with a "+2" badge.
- [ ] Hover the card, click it, right-click or x it, and press an action button. Expected: hover keeps it open (closes about 1.5 s after leaving); click focuses the app; actions (max 2) work.
- [ ] Turn DnD on. Expected: normal notifications show nothing, critical still shows, the music pill still shows; DnD off brings banners back.
- [ ] Fullscreen video. Expected: normal notify shows nothing; critical shows a pill over the video which keeps playing; volume key shows a pill with no bar.
- [ ] Play media in Firefox, Spotify and Rhythmbox. Expected: pill shows art, title and bars; pause removes it; click opens the dashboard (prev/play/next); two players means the playing one wins; the panelMedia menu still lists all.
- [ ] Press volume and brightness keys, hold for repeat, and check a second monitor. Expected: pill with bar and number, smooth repeat, open card returns; the second monitor shows the stock OSD.
- [ ] Auto-hide on, then send a notification. Expected: bar slides in with the pill and leaves after; no pill when idle.
- [ ] Turn the notch off, then only Notifications, OSD or Live activities. Expected: stock banners and OSD return at once; each partial toggle reverts only its part; the timeout spin works.
- [ ] Toggle the notch 20x. Expected: no leftover actors, no double banner, banner position back; Looking Glass shows no kiwi notch actors; no errors.
- [ ] Set calendar-right off with the notch on, then disable Kiwi. Expected: date menu still goes right; with Kiwi off the banner position and bin alignment are stock.
- [ ] Turn on reduced motion. Expected: no spring and no bar movement.

### Debt modules (D2 to D7)
- [ ] Toggle `overview-seamless-zoom` off and on in the overview and use a touchpad swipe. Expected: normal; wallpaper strip stock after off.
- [ ] Lock and unlock, and log in fresh. Expected: overview not forced shown or hidden; no overview on first login.
- [ ] Toggle `reduce-window-animations` while opening a window. Expected: no stuck scale or opacity.
- [ ] Drag and resize a window, including two windows of one app. Expected: fades to 230 and restores; each restores its own opacity.
- [ ] Hover a window in the overview, then leave. Expected: panel title follows the hover; leaving the overview focuses the hovered window.
- [ ] Dash to Dock with `dock-blur` on, enabling the dock late. Expected: blur matches the pill, appears when the dock appears; disabling Kiwi blur removes it.
- [ ] Turn adaptive dock colours on and off (watch dconf). Expected: dot/background colour keys change; originals return when off.
- [ ] Turn adaptive colours on, kill the Shell hard (`killall -3 gnome-shell` on X11, or force logout), log in. Expected: Dash to Dock keys restored to originals after Kiwi enables.
- [ ] Turn Launchpad on and off. Expected: icon after the first favourite, click opens the app grid; off removes the icon and cleans favourites.
- [ ] Turn popup styling off and on. Expected: stock look when off; unchanged when on.
- [ ] Open the Quick Settings notification list. Expected: Clear button, close/expand and titles unchanged; window-controls hover shows no pill background.
- [ ] Push a PR. Expected: CI is green on the Ubuntu runner (eslint@9, strict schema check, tests, `make pack`).
- [ ] Publish a test release. Expected: the zip is attached by the new `gh release upload` step.

## 4. Known limits / needs your decision

- **Server-side-decorated windows keep their own buttons.** Kiwi doesn't write the system `button-layout` key. Qt and Electron windows are the usual case. Documented limit.
- **Firefox styling gate:** `Hidden.css` (hiding Firefox's native buttons) now also needs the per-app styling key. This is an orchestrator default; the owner needs to confirm.
- **Super-tap takeover is an untested assumption.** It blocks the oldest `overlay-key` handler on the display (assumed to be the Shell's overview handler). S5 read the 51.1 source; 48 to 50 were not read. If the handler isn't found, Kiwi warns and the stock behaviour stays. While Spotlight is open, Kiwi handles Super release itself because the modal mode doesn't pass `overlay-key`.
- **Clipboard shortcut default is empty** (EGO forbids default clipboard shortcuts). The spec asked for `<Super><Shift>v`; the owner may override. `metadata.json` must declare clipboard access (orchestrator owns this); D7 also proposed dropping the "panel on hover in fullscreen" wording and adding the new features to the description. Both are still to do.
- **Quick Paste uses a virtual-keyboard Ctrl+V** (Ctrl+Shift+V for terminals), against the skill note. The spec wins by decision. Whether it pastes into the right window is untested.
- **Liquid Glass refraction is experimental.** A shader can only see its own texture, so refraction forces the still wallpaper-copy path and cannot bend the live backdrop. The 51 shader snippet facts were not verified against a real Shell 51. Blur rects are square, so rounded corners can bleed slightly. Tinted style floors alpha at 0.62 for the 4.5:1 contrast, but a slider below 55 can break it by user choice. Reduced motion drops fades, not blur (a deliberate deviation from the design reference).
- **Shell-version coverage:** facts for 48 to 51 were checked from source reads of the GNOME gitlab (48.0, 49.0, 50.0, main) but no run on those versions. Verification was on Shell 46 typelibs only.
- **Stage Manager details unseen on a real Shell:** whether the clone of an opacity-0 window paints, tilt sign, clone clip, overview with hidden windows. Chrome root is pill-sized only (not the whole strip). The stage shortcut waits for the keybinding service and was left out until Wave D; it is not in the reports as done.
- **Control Center:** small tiles are not 1x1 icon-only (stock toggles keep labels); the footer width has a risk with avatar, name, battery and 4 buttons in 4 columns. Now Playing used its own source (to be replaced by the shared MPRIS watcher after the notch lands).
- **Notch is not merged.** Review round R8 asked for changes; S8 is fixing, including the Now Playing port. Deferred in the notch itself: timer, recording and charging activities, clipboard and up-next in the dashboard (the "Copied" pill hook exists in the clipboard service but isn't built), hardware-notch alignment, a second activity circle, a per-app absorb list. S6 also noted that drag-and-drop hold and banner offset belong to the notch.
- **Auto-hide:** the panel is parked by translation and opacity, not hidden, so Ctrl+Alt+Tab still finds it. The overview inset injects a private `_updateWorkAreaBox`, guarded and to be checked on 48 to 51.
- **Crash leftovers:** Dash to Dock colours stay changed if Kiwi is switched off after a crash before the next enable (restore only runs in enable).
- **Order differences in the new registry** (no known effect): stop runs in reverse registration order; the registry catches errors per feature where old code aborted the whole refresh.
- **Open leftovers from D1 and D2:** a prefs "Remove Kiwi GTK changes" button needs a shared cleanup helper that D1 did not export; D1 asks the orchestrator whether it is wanted. A dangling gtk.css import after an uninstall or crash is documented, not fully fixed.
- **Release chores:** run `make pot` before release (CI doesn't); lint baseline is 150 to 161 warnings, 0 errors. D8's docs pass 2 is still to run after the last merges.
- **Unreported work:** D9, D10, L1, A2 and X1 had no memory files when this was written. This draft does not describe them.

## 5. Not tested

**No GNOME Shell ran in the cloud.** Nothing in this branch has been run on a real GNOME Shell 48, 49, 50 or 51, on Wayland or X11. What was run:
- Pure-logic unit tests with `gjs -m` (via `bash tests/run.sh`).
- eslint (0 errors; warning counts are in the debt notes).
- Strict schema compiles (`glib-compile-schemas --strict --dry-run`).
- Packaging checks with `gnome-extensions pack`.
- Prefs smoke tests under Xvfb on libadwaita.
- A gcc build and Xvfb hover smoke test of the `advanced/` module (no valgrind run).
- One D-Bus fake-provider test for Spotlight.

The container only has GNOME Shell 46 typelibs, which is older than the 48 to 51 floor, so even those checks are not proof that any feature works on a supported Shell. CI results are not yet known. Every item in section 3 is for you to run on a real machine.
