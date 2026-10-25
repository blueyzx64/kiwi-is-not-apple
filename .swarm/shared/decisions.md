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

## Orchestrator defaults (owner may override)
- Wave 0: Firefox/Thunderbird profiles are touched only when the per-app styling key is on.
  Hiding Firefox's native buttons (`Hidden.css`) under panel controls now needs that key too.
  Owner to confirm; S2 must not re-add writes into a user `chrome/` without the styling key.
- Settings migrations: add int key `settings-version`; every key rename is an idempotent
  migration (pool H-migration) run once on enable, old key kept readable until removed.
- Key overlaps (S10 key table in `.swarm/agents/S10.md`):
  - `panel-blur`/`dock-blur` -> S3 maps them onto `liquid-glass-surfaces` by migration.
  - `panel-hover-fullscreen` -> S6 migrates into `panel-autohide` mode.
  - `minimize-to-dock` vs `stage-manager`: Stage Manager wins (see above); keep saved value.
  - stock notification keys vs notch: notch replaces banners; history stays in calendar menu.
- Container tools (installed 2026-10-25): gettext (`xgettext`, `msgfmt`), `gnome-extensions`
  (pack check: `gnome-extensions pack --force --extra-source=… --podir=po -o <dir> .`),
  GNOME Shell 46 + libadwaita typelibs. Shell 46 is older than our 48–51 floor: use it for
  packaging and prefs smoke tests only, never as proof a feature works on 48–51.
