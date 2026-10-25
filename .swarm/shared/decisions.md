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
- Settings migrations: use `runMigrations` from lib/settings.js (idempotent; no version key).
  Old key stays readable until removed.
- Key overlaps (S10 key table in `.swarm/agents/S10.md`):
  - `panel-blur`/`dock-blur` -> S3 maps them onto `liquid-glass-surfaces` by migration.
  - `panel-hover-fullscreen` -> S6 migrates into `panel-autohide` mode.
  - `minimize-to-dock` vs `stage-manager`: Stage Manager wins (see above); keep saved value.
  - stock notification keys vs notch: notch replaces banners; history stays in calendar menu.
- Container tools (installed 2026-10-25): gettext (`xgettext`, `msgfmt`), `gnome-extensions`
  (pack check: `gnome-extensions pack --force --extra-source=… --podir=po -o <dir> .`),
  GNOME Shell 46 + libadwaita typelibs. Shell 46 is older than our 48–51 floor: use it for
  packaging and prefs smoke tests only, never as proof a feature works on 48–51.
- Review rules from S10 (all leads):
  - No sync file I/O on the Shell main loop in enable paths; use async Gio.
  - New code reads settings through `KiwiSettings` (lib/settings.js), one path per feature.
  - Per-version checks only through lib/compat.js.
- Window controls also show for focused DIALOG and MODAL_DIALOG windows (otherwise titlebar
  removal leaves them with no buttons). Greyed out per capability.
- Prefs page order (fixed; S10 enforces): General/existing pages first, then new feature pages
  in this order: Liquid Glass, Window Controls, Auto-hide Top Bar, Control Center, Clipboard,
  Spotlight, Notch, Stage Manager; Advanced stays last.
- `Glass.configure(settings)` is called by extension.js on enable (null on disable). Features
  never look up their own extension (EGO X-006).
- Prefs files run outside the Shell: there is no global `N_`/`_`. Import gettext from
  `resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js` or define `const N_ = s => s;`.
- Stage Manager adds `conflictsWith: ['minimize-to-dock']` only in the round that really hides
  windows (S9 Wave D). It is not added while the feature is strip-only.
- Team size (owner, 2026-10-25): up to **30 Sonnet agents** live. Extra leads run the debt
  cards in `.swarm/shared/debt-cards.md`; R1 is a second reviewer next to S10.
- New source folders: add them to the Makefile `EXTRA` list and the pack-release.yml loop. Run `make check`
  before handing off. Run `make pot` before release (CI does not).
- Stage Manager pauses minimize-to-dock, move-window-to-new-workspace and tiling-title-menu while on
  (feature spec §5). Alt-tab to a hidden window switches to its stage, as on macOS.
- Clipboard shortcut: the schema default is `[]` (EGO: "MUST NOT ship default keyboard shortcuts for
  clipboard interaction"). Prefs gives a one-click "Use Super+Shift+V". Owner may override.
- Clipboard dir: one sync `GLib.mkdir_with_parents(dir, 0o700)` in enable is allowed. It creates the
  dir with the right mode atomically. Repair a wrong mode on an existing Kiwi dir.
- Quick Paste uses a virtual keyboard Ctrl+V, against the skill note "set clipboard and close". The
  spec wins. Paste only if not locked and the target window really has focus.
- Window controls: server-side-decorated windows keep their own buttons. Kiwi does not write the
  system `button-layout` key, which is a user setting outside the extension. This is a documented limit.
- Notch deferrals (deferred explicitly, so they don't block done): the "Up next" dashboard panel (MPRIS
  has no reliable queue API), the timer/recording/charging live activities, and "toggle changed"
  confirmations. Phase 1 includes the Clipboard dashboard panel and the "Copied" confirmation.
- The notch forces the calendar-right layout (clock moves right; notifications list in Quick Settings).
  Prefs must say so: the notch master row gets a subtitle, and the move-calendar-right row is greyed
  out with "On while the notch is on".
- The notch live activity replaces the panel media button (panel-media is hidden while the notch shows
  media). The Control Center Now Playing tile stays.
- Smoke harness: `make smoke` (tools/smoke). Leads run it after enable/disable changes. In this
  container use KIWI_SMOKE_SHELL_VERSION=46 KIWI_SMOKE_SHIM=1. Results there are indicative only.
- Adversarial round (V1–V10). Privacy defaults chosen by the orchestrator, owner may override:
  - `notch-show-clipboard` defaults to false.
  - Spotlight shows no clipboard rows for an empty query by default; typing still searches the clipboard.
  - Clipboard history stays saved to disk by default (owner decision), but it gets content heuristics:
    private-key blocks, likely card numbers by Luhn check, long high-entropy tokens.
  - The metadata wording must not overpromise secret detection.
- **Real Shell test env (X2):** GNOME Shell 51.1 headless in an Arch chroot. Run
  `KIWI_SRC=<your worktree> /tmp/x2/run-real.sh [toggles]`. Output goes to /tmp/x2/last-run.txt and the log to
  /tmp/x2/shell.log. Probe JS with `gdbus call --session --dest org.x2.Probe --object-path /org/x2/Probe
  --method org.x2.Probe.Eval "<js>"` (from /tmp/x2/enter.sh). Every fix must be verified there.
- Shell 48+ has no `vertical:` on St.BoxLayout. Use `orientation: Clutter.Orientation.VERTICAL`.
- `/tmp/x2/run-real.sh` is serialized with flock. Outputs go per run to /tmp/x2/runs/<ts>-<src>/, and the
  path is printed at the end. Expect to wait in the queue. Read your own run dir, not last-run.txt.
- Real-Shell runs between about 14:20 and 14:30 UTC are INVALID (stale bus socket: "Connection refused", probe
  never up, "Kiwi errors: 0" is meaningless). Re-run. A run counts only if shell.log has "GNOME Shell
  started" and your probe answered.
- Test fixtures must never contain full literal secret-shaped strings (GitHub push protection blocks
  the push). Split them at runtime, e.g. `'glpat-xYz' + '123…'`.
- Real Shell test roots: 51.1 (/tmp/x2/arch, arch2: `/tmp/x2/run-real.sh N`) and 48.1 (/tmp/x2/arch48:
  `/tmp/x2/run-real48.sh N`). Both take `KIWI_SRC=` and `KIWI_ONLY="feature …"`. They print PROBE PASS/FAIL,
  and print INVALID RUN when the Shell or the probe never came up. Verify a fix on both.
- **Scope change (owner, 2026-10-25):** support and test **only Fedora 44 Workstation with GNOME 50** for this
  release. `metadata.json` shell-version is ["50"]. Other versions come later: keep the 48/49/51 code paths
  in lib/compat.js (harmless, ready), but don't claim them. Tests and verification run on a GNOME 50 root
  (Fedora 44 if it can be built, else Arch archive GNOME 50.x).
