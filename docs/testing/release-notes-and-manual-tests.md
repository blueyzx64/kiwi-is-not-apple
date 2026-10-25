# Release notes and manual test list (new-features branch)

Brings the 8 planned macOS-style features (window controls, Liquid Glass, auto-hide top bar, clipboard history, Spotlight, Control Center, Stage Manager, notification notch) to GNOME 48–51, on top of a new foundation (feature registry, shared `lib/` services, `coordinators/`) and a round of tech-debt fixes.

**Checks run in the cloud:**
- `make check`: eslint 0 errors / 0 warnings, strict schema compile, `gjs -m` unit tests green.
- `make pack`, and the prefs pages smoke-built under Xvfb.
- `make smoke`: headless Shell 46 with shims.
- **Headless real GNOME Shell 48.1 and 51.1** (Arch chroot): 20 enable/disable cycles each, 7 functional probes PASS on both, 0 Kiwi errors. See section 4d.

Headless runs can't check looks, real input, real apps or GNOME 49/50, so please still work through the manual list on real 48 and 51 at least.

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
- **Notification notch.** A black pill at top centre for notifications, volume and brightness feedback and Now Playing, built on a new notification router and a shared MPRIS watcher.
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
  - An empty search shows recent apps only. Recent clipboard rows appear only with `spotlight-recent-clipboard` on (default off). Typing still searches the clipboard.
- **Auto-hide top bar is ON:**
  - The bar is hidden until the pointer pushes at the top edge (about 0.15 s dwell), and hides about 0.6 s after leaving.
  - `panel-hover-fullscreen` migrates to `panel-autohide` plus the fullscreen-only option, so users who had fullscreen hover keep similar behaviour.
  - Strut fix: turning auto-hide off (or re-showing the bar) restores a correct work-area strut, so maximized windows no longer sit under the bar. The bar re-parks on monitor changes.
- **Clipboard history is saved to disk by default**, in `~/.local/share/kiwi/clipboard/` (directory 0700, files 0600), and reloaded on enable. Password-manager secrets are not recorded, and nothing is recorded while locked. Text that looks like a private key, API token, JWT, card number (Luhn check) or long random token is skipped too (heuristics, not a guarantee). Images over 8192 px a side or 40 Mpx, and SVGs, are not stored. **The shortcut is empty by default** (EGO rule); a prefs button sets Super+Shift+V.
- **Liquid Glass is ON.** With it on, the old `panel-blur`/`dock-blur` keys do nothing; the surfaces list rules. Old values migrate into that list.
- **Control Center is ON.**
  - The Quick Settings grid becomes 4 columns with a new order, a user row (avatar, name, battery with time left) and a Now Playing tile.
  - It owns Do Not Disturb. The old username-in-menu setting migrates to `control-center-user-row`.
  - `battery-percentage-always` is a new, off-by-default key.
- **Stage Manager is ON and wins over minimize-to-dock.**
  - While it is on, `minimize-to-dock`, `move-window-to-new-workspace` and `tiling-title-menu` are paused. Their saved values are kept.
  - Windows are hidden (opacity 0), never minimized.
  - Always-on-top, sticky and picture-in-picture windows are exempt, as are windows on other monitors. Dialogs follow their owner's stage. The strip reveal uses a pressure barrier.
  - Lock/unlock restarts the stage order (windows are kept).
- **Notch replaces stock banners and the stock OSD** on the primary monitor. History stays in the calendar menu. Do Not Disturb still rules. Turning the notch off restores stock banners.
- **Media is shown once:** with the notch on, the notch live activity replaces the panel media button (the Control Center Now Playing tile stays).
- **Notch forces the calendar-right layout** (clock on the right, notifications in Quick Settings); the move-calendar-right row is greyed with "On while the notch is on".
- **Clipboard in the notch:** a "Copied" pill, and a Clipboard dashboard panel that is **off by default** (`notch-show-clipboard=false`, switch "Show clipboard in the dashboard"; screen-share privacy). Notification bodies are markup-escaped like stock banners. Critical notifications are requeued; transient ones expire.
- **Stage Manager shortcut:** new key, empty by default (prefs suggests Ctrl+Super+S only if no known conflict). The binding lives even while Stage Manager is off.
- **Hide-minimized-windows** is aware of Stage Manager; opening a modal (Spotlight, Quick Paste) closes open menus first.
- **Panel transparency** now reacts to windows on all workspaces; the 2 s poll is gone.
- **Prefs:** new pages in this order after the existing ones: Liquid Glass, Window Controls, Auto-hide Top Bar, Control Center, Clipboard, Spotlight, Notch, Stage Manager; Advanced stays last. The old fullscreen-hover row is removed; the username row is back and defers to Control Center.
  - A feature page that fails to build no longer breaks the prefs window.
  - Restore Defaults skips internal keys.
- **Settings migrations run once:** they run before the features start, and each is recorded in the internal key `migrations-done`. If you reset a new key, the old value is not copied back.
- **Feature registry:** a feature whose enable fails no longer keeps the features it overrides paused.
- **Reduced motion is detected on GNOME 50/51** (the a11y key is an enum; it was read wrongly before).
- **Minimize-to-dock snapshots:** snapshots are cleared on disable except while locked. After disable and re-enable, a minimized window's tile may fall back to its icon (accepted).
- **Dock colours:** Dash to Dock original colours are saved in `dock-colors-saved` and restored on disable and after a crash. Keys that were at their default are `reset()`; a colour you change while Kiwi runs is left alone. Launchpad removes only its own id from `favorite-apps`.
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
- [ ] Make `gtk.css` and `user.js` symlinks (dotfiles), then enable and disable. Expected: both are still symlinks with the targets edited in place.
- [ ] Edit `userChrome.css` outside the Kiwi block, then relogin and disable. Expected: your edits survive.
- [ ] Use two Firefox installs, then switch the default profile. Expected: both profiles styled; the old one is cleaned on disable.

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
- [ ] Copy a screenshot to the clipboard. Expected: thumbnail shows and pastes into an image editor; images over 8192 px a side or 40 Mpx, and SVGs, are skipped.
- [ ] Copy a test PEM private-key block, a test card number and a long random token. Expected: none are recorded.
- [ ] Copy during a slow load (big history), then check `history.json`. Expected: nothing lost; the loaded and new entries are merged.
- [ ] While an input method is composing in Quick Paste, press the arrow keys. Expected: the arrows go to the IME, not the list.
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
- [ ] Open with an empty query. Expected: recent apps only. Turn on "Show recent clipboard when the search is empty". Expected: the recent clipboard group appears. Typing still finds clipboard entries.
- [ ] Use the web row, a custom engine, and "gnome.org". Expected: browser opens with the engine; "gnome.org" gives an Open row.
- [ ] Open Spotlight and lock (Super+L); also open it with the Downloads fan up. Expected: no modal after unlock and the keyboard works; only one overlay stays.
- [ ] Turn on reduced motion and text scale 1.5, and try two monitors. Expected: no fade, no clipping, shows on the primary monitor.
- [ ] Open Spotlight, then press the Quick Paste shortcut. Expected: only one stays open.
- [ ] Enable another extension that handles Super (for example Dash to Dock "Super key" options). Expected: a Super tap opens Spotlight; with Kiwi disabled, the other extension's Super behaviour works. The blocked handler id is in the debug log.
- [ ] With Spotlight open, press Super+Space, Super+Left and a long Super hold, then a bare Super tap. Expected: it stays open for the first three and closes on the bare tap.
- [ ] Compose with IBus (for example Pinyin) in the field and press Return. Expected: the text is committed and no result opens.
- [ ] Tap Super while dragging a window by its title bar. Expected: Spotlight does not open.
- [ ] Type `e`, `pi`, `10:30`, `2024-10-25`. Expected: no calculator Top hit.

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
- [ ] Open a dialog (for example Save As) from a staged app. Expected: focus goes to the owner's stage; the dialog is not a separate card.
- [ ] Use an always-on-top window, a sticky window and a picture-in-picture video. Expected: they are never hidden by stage switches.
- [ ] With two monitors, open windows on the second monitor. Expected: they stay untouched; the strip works on the primary.
- [ ] Minimize the only window of the only stage. Expected: it really minimizes, and a minimized window shows as an icon tile.
- [ ] Push the pointer at the strip edge with strip auto-hide on. Expected: the strip reveals on pressure, not on a plain edge touch.
- [ ] Open the overview with staged windows on several workspaces, then close it. Expected: all are shown in the overview and re-hidden after.
- [ ] Lock, then unlock. Expected: windows are kept; the stage order starts fresh.

### Notch
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
- [ ] Copy text with the clipboard feature on. Expected: a "Copied" pill appears; the dashboard shows a Clipboard panel with the latest entries.
- [ ] Send a critical notification, then others, then dismiss it. Expected: the critical card is requeued rather than lost; transient notifications expire on their own.
- [ ] With the notch on, check the panel. Expected: no separate panel media button (media only in the notch); move-calendar-right is greyed "On while the notch is on".
- [ ] Open the dashboard with default settings, then turn on "Show clipboard in the dashboard". Expected: no Clipboard panel by default; it appears when on and goes at once when off. Clicking an evicted entry gives no error.
- [ ] Run `notify-send 'T' '<b>bold</b> <script>x</script> & <a href="https://x">l</a>'`. Expected: bold shown, the rest escaped as text, no blank card; an app without the markup flag shows the tags literally.

### Stage Manager shortcut
- [ ] Set a Stage Manager shortcut in prefs (try the Ctrl+Super+S suggestion). Expected: it toggles Stage Manager; the field is empty by default.
- [ ] Turn Stage Manager off, then press the shortcut. Expected: it still works (binding lives while the feature is off); clearing it removes the binding.
- [ ] With Stage Manager on and hide-minimized-windows on, minimize and restore windows. Expected: no window stuck hidden or visible; paused features are noted in prefs.

### Debt modules (D2 to D10)
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
- [ ] Open the Downloads fan. Expected: thumbnails appear after a brief generic icon; "N More in Files" is pluralised correctly.
- [ ] Log in and toggle Caps/Num Lock. Expected: indicators show at login and on toggle (no fixed delay).
- [ ] Battery at or below 20% discharging, then plug in, and start at 15%. Expected: label slides in, slides out when plugged, and shows at start.
- [ ] Move a fullscreen window to a new workspace and use tiling drag-restore, with and without Stage Manager. Expected: normal when off; paused while Stage Manager is on.
- [ ] Before upgrading set `panel-hover-fullscreen=false`, upgrade, then reset `panel-autohide` and re-enable Kiwi. Expected: the migration ran once; the reset value is not overwritten.
- [ ] Break one feature's prefs page (for example by removing its file in a test copy), then open prefs. Expected: the other pages still open.
- [ ] Turn auto-hide on, then off, with a maximized window. Expected: the window shrinks once to the correct work area, not under the bar.
- [ ] With adaptive dock colours on, change a Dash to Dock colour by hand, then disable Kiwi. Expected: your colour is kept; untouched keys go back to their defaults.
- [ ] Push a PR. Expected: CI is green on the Ubuntu runner (eslint@9, strict schema check, tests, `make pack`).
- [ ] Publish a test release. Expected: the zip is attached by the new `gh release upload` step.

## 4. Known limits / needs your decision

### Owner decisions still open
- **Firefox `Hidden.css` gate:** hiding Firefox's native buttons now needs the per-app styling key (plus window controls and `remove-titlebar-buttons`). This is an orchestrator default; please confirm.
- **Defaults that differ from main:** `panel-transparency` true → false, `keyboard-indicator` false → true, `dock-blur` false → true. Confirm or revert.
- **Auto-hide plus titlebar removal:** both are on by default, so a window has no titlebar buttons and its panel controls sit in a hidden bar until you push the top edge. Decide whether one default should change.
- **`button-layout` default shows close only:** with window-controls position `system`, Kiwi follows GNOME's default `appmenu:close`, so the panel shows only a close button. Positions `left`/`right` show all three. Decide whether the default position should change.
- **Clipboard persisted to disk by default** (owner decision, kept): the secret detection is a heuristic, so the metadata wording must not promise more. The shortcut stays empty by default (EGO); the spec asked for `<Super><Shift>v`.
- **Privacy defaults chosen by the orchestrator, you may override:** `notch-show-clipboard` off, and Spotlight empty-query clipboard off.

### Known limits
- **Server-side-decorated windows keep their own buttons.** Kiwi doesn't write the system `button-layout` key (Qt, Electron).
- **Super-tap takeover:** Kiwi blocks the oldest `overlay-key` handler (assumed to be the Shell's). A Spotlight open/close probe passed on headless 48.1 and 51.1, but the probe did not press a real Super key.
- **Quick Paste uses a virtual-keyboard Ctrl+V** (Ctrl+Shift+V for terminals). Pasting into a real app window has not been tested.
- **Liquid Glass refraction is experimental.**
  - It forces the still wallpaper-copy path and cannot bend the live backdrop.
  - Blur rects are square, so rounded corners can bleed slightly.
  - Below tint 55, text can drop under 4.5:1 contrast (user choice).
  - Reduced motion drops fades, not blur.
- **Stage Manager visual details not seen:** the card tilt sign, clone painting and clipping were never looked at on a screen (the headless probe checks opacity only).
- **Control Center:** small tiles are not 1x1 icon-only, and the footer width is a risk with long names.
- **Notch deferrals:** "Up next" dashboard panel, timer/recording/charging activities, "toggle changed" confirmations, hardware-notch alignment, a second activity circle, a per-app absorb list.
- **Auto-hide:** the panel is parked by translation and opacity, not hidden. The overview inset uses a guarded private `_updateWorkAreaBox`.
- **D1 leftovers:** no prefs "Remove Kiwi GTK changes" button. A dangling gtk.css import after an uninstall is documented, not fully fixed.
- **Release chores:** run `make pot` (writes `translating/kiwi.pot`) before release; existing `.po` files were not `msgmerge`d. D7's metadata description refresh is still open.

## 4b. EGO submission notes

- **Version coverage:** `metadata.json` lists shell-version 48, 49, 50, 51. Only headless 48.1 and 51.1 were run (section 4d); 49 and 50 were not run at all. The owner must test at least 48 and 51 on a real desktop before uploading to extensions.gnome.org.
- **`overlay-key` handler block (Spotlight):** Kiwi finds the oldest `overlay-key` handler on the display (assumed to be the Shell's overview handler) with `signal_handler_find` and blocks only that id, then connects its own. Disable disconnects its own handler and unblocks that id. If not found, it warns and stock behaviour stays. Other extensions' handlers are untouched; the blocked handler id is logged at debug level. The assumption was read from the 51.1 source only.
- **Dash to Dock settings writes:** the adaptive-colours feature writes Dash to Dock colour keys. Originals are saved to the Kiwi key `dock-colors-saved`, restored on disable, and restored on the next enable after a crash (`restoreStaleColors`). Keys that were at their default are `reset()`, and keys the user changed while Kiwi ran are left alone.
- **`favorite-apps` write (Launchpad):** `launchpadApp.js` inserts a synthetic Launchpad desktop id into the shell's `favorite-apps` after the first favourite. On disable it removes only its own id, and resets the key when it was the default before and is the default again.
- **Clipboard:** history is persisted to disk by default (`~/.local/share/kiwi/clipboard/`, dir 0700, files 0600). The `metadata.json` description declares clipboard access and local storage. The shortcut default is empty (EGO rule). Password-manager entries and secret-looking text (heuristics) are skipped, and nothing is recorded while locked. The metadata wording must not promise complete secret detection. One sync `mkdir_with_parents` in enable is a documented exception.
- **Private Shell APIs used (guarded, with feature detection):**
  - `MessageTray._showNotification`, `_notificationQueue`, `_updateState`, `_bannerBin` (notification router, via `lib/compat.js`).
  - `osdWindowManager._showOsdWindow` (notch OSD).
  - `Main.overview._overview.controls.layout_manager._updateWorkAreaBox` (auto-hide overview inset).
  - Quick Settings internals (`_backgroundApps`, `_doNotDisturb`) in Control Center, and `AppMenu` privates in window title.
  - Per-version differences go through `lib/compat.js`. Source was read for 48.0, 49.0, 50.0 and main, not run.
- **Other EGO-sensitive points:** a virtual keyboard injects Ctrl+V for Quick Paste; Kiwi writes `gtk.css` (Kiwi block only) and Firefox/Thunderbird profile files (only with the styling key on); the `advanced/` native module is not in the zip.
- **Packaging:** run `make check` and `make pack`; run `make pot` first (writes `translating/kiwi.pot`).

## 4c. How to smoke test locally: `make smoke`

`make smoke` runs `tools/smoke/run-headless.sh`: a headless GNOME Shell (`--headless --wayland --virtual-monitor 1280x800`) with Kiwi enabled in a temp HOME with a private session bus, then disable/enable 10 times (argument sets the count). It never touches your real profile. Exit 0 means no Kiwi-related errors, 1 means errors, 2 means setup failure. It needs `gnome-shell`, `dbus-run-session`, `gsettings`, `glib-compile-schemas`, `gdbus`, `python3`. In the cloud container use `KIWI_SMOKE_SHELL_VERSION=46 KIWI_SMOKE_SHIM=1 make smoke`. Container result: 0 Kiwi CRITICALs; the remaining JS errors come from a Shell-46-only shim. That result is indicative only and not proof for 48 to 51; on your machine run it on 48 and 51 first.

## 4d. Real GNOME Shell testing

Headless real GNOME Shell sessions ran in an Arch Linux chroot (`gnome-shell --headless --wayland --virtual-monitor 1280x800`, surfaceless renderer, no GPU):
- **GNOME Shell 51.1** (mutter 51.1). Run `/tmp/x2/runs/20261025-185207-kiwi-is-not-apple-arch`.
- **GNOME Shell 48.1** (mutter 48.2). Run `/tmp/x2/runs/20261025-185207-kiwi-is-not-apple-arch48`.

Each run did the following:
- Enabled Kiwi with default settings and read the feature status, panel boxes and Kiwi chrome actors.
- Launched a GTK app and sent a notification.
- Flipped settings, then toggled Kiwi 20 times.
- Scanned the Shell log.

Result on both versions: **all 7 functional probes PASS, `Kiwi errors: 0`.**

| Probe | What it checks | 51.1 | 48.1 |
|---|---|---|---|
| overview-hidden | the overview is not shown after login with Kiwi on | PASS | PASS |
| notch-receives-notification | a notification goes to the notch (notchShown=true), not to a stock banner (stockBannerShown=false) | PASS | PASS |
| spotlight-open-close | Spotlight opens and closes again | PASS | PASS |
| quick-settings-columns | Control Center grid has 4 columns (382 px wide) | PASS | PASS |
| maximize-workarea | a maximized window fills the work area (1280x800 with auto-hide), unmaximizes back to 700x520; window-controls indicator visible while maximized | PASS | PASS |
| stage-manager-hide-reveal | of two app windows, the off-stage one has opacity 0; switching swaps them (opacity 255 / 0), none minimized | PASS | PASS |
| clipboard-history-increments | a copy adds one history entry while recording | PASS | PASS |

Noise in the logs, not counted as Kiwi errors by the harness:
- Clutter "needs an allocation" warnings name `kiwi-glass-quickSettings` and `kiwi-glass-spotlight`.
- Two `clutter_actor_allocate` NaN assertions with no actor named appear on both versions.
- Shell warnings come from the fake login user ("Could not get a proxy for user 0").
- One probe-harness eval had a SyntaxError in the probe's own code.

Worth a look on a real desktop, but they did not fail any probe.

Headless can't cover:
- **Visual look and animations:** glass blur and tint, the notch spring, the Stage Manager shrink and tilt, auto-hide slides, reduced-motion feel. There is no GPU and nobody looked at the screen.
- **Real input devices and IME:** a physical Super tap, keyboard repeat, touchpad gestures and pressure barriers with a real pointer, IBus composition.
- **Wayland paste into real apps:** Quick Paste's virtual Ctrl+V into gedit, Firefox or a terminal.
- **Multi-monitor hardware:** the 1280x800 virtual monitor only; S9's 2-virtual-monitor run is not real hardware.
- **Specific apps and extensions:** Firefox and Thunderbird profile styling, Dash to Dock (dock blur, colours, Launchpad), third-party Quick Settings extensions, password managers.
- **Lock screen and suspend:** a real session lock, suspend/resume, login.
- **GNOME 49 and 50:** not run at all. X11 was not run either (both runs are Wayland).

## 5. Not tested

Real GNOME Shell **48.1 and 51.1 ran headless only** (section 4d). Nobody has used these features on a real desktop with a screen, GPU, real input and real apps. **GNOME 49 and 50 were not run at all**, and X11 was not run on any version.

Also run in the cloud:
- Pure-logic unit tests with `gjs -m` (`bash tests/run.sh`).
- eslint (0 errors, 0 warnings) and strict schema compiles.
- `gnome-extensions pack`, and prefs smoke tests under Xvfb on libadwaita.
- A gcc build and Xvfb hover smoke test of the `advanced/` module (no valgrind).
- A D-Bus fake-provider test for Spotlight.
- `make smoke` against Shell 46 with shims.

Everything in the section 4d "can't cover" list, and every item in section 3, is for you to run on a real machine on 48 and 51 at least, and on 49 and 50 if you can. CI results on the PR are not confirmed in this document.
