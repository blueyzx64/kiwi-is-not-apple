# Decisions (workers obey; only the orchestrator edits)

All answered by the owner on 2026-10-25. Do not ask the owner again; ask the orchestrator.

## Scope and delivery
- Features and look: `docs/features/*.md` + design canvas https://claude.ai/artifact/PJTdauCxK1VKQvpXditZpz
- **Supported shells: GNOME 48–51.** Per-version code only in `lib/compat.js`.
- **Every new feature is ON by default.** Users opt out in prefs.
- Delivery: leads merge into `ccr-f3c1f44c-rv5a8r`. At the end the orchestrator opens **one PR
  into `blueyzx64/kiwi-is-not-apple` main**. No upstream PR.
- **Wave 0:** the Firefox/Thunderbird `chrome/` deletion fix ships **first**, as its own small
  PR into main (branch `fix/mozilla-chrome-dataloss`).
- **advanced/ fixes are in scope:** 800 ms polling, the `GTK_MODULES` overwrite (append to
  `GTK3_MODULES`), the in-place `.so` copy (install via a temp file + rename), stuck hover,
  README Wayland note, checksum for the prebuilt binary.
- Testing: the cloud has no GNOME Shell. **The owner tests on a real machine.** Every lead
  delivers a manual test list. Never claim Shell testing that did not happen.
- Commits: author blueyzx64, no AI trailers. Never force-push. Old commit authors stay as they are.

## Feature decisions
- The app menu is the icon and name only. No global menus.
- Window controls show for all focused windows. Titlebar-button removal is on by default.
- Clipboard: **history always saved to disk by default** (`~/.local/share/kiwi/clipboard/`,
  mode 0600) and reloaded on enable, because Kiwi tears down on lock. Never store
  password-manager secrets; stop recording while locked. No `unlock-dialog` session mode.
- Spotlight: **a Super tap opens Spotlight** (take over `overlay-key`; restore on disable). The
  overview stays reachable through the hot corner, gesture, Super+A and the Activities
  button. Super+Space is left alone.
- **Stage Manager wins** over minimize-to-dock: pause it while Stage Manager is on and keep
  its saved value.
- The notch replaces stock banners (on by default); history stays in the calendar menu.
- Auto-hide top bar is on by default.
- Reduced motion: `org.gnome.desktop.a11y.interface reduced-motion` on GNOME 50+;
  `org.gnome.desktop.interface enable-animations` on 48–49.
- Phase 0 refactor lands as its own change with no visible behaviour change.
