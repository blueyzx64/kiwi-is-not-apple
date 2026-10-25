# UX round 1: fixes the owner found on real Fedora 44 / GNOME 50

Read-only for workers. The orchestrator merges every `ux/*` branch into `ccr-f3c1f44c-rv5a8r`.

## The owner's report, with screenshots
(The owner's screenshots are not kept; descriptions below.)

| File | What it shows |
|---|---|
| 3c49507c | notch expanded (Now Playing / Notifications): a square dark rect behind the rounded card |
| 25272fe0, b4241e48 | Control Center: heavy green pills, a rectangular backing behind the rounded menu |
| d5e18502 | notch pill with music |
| 71bb3c80 | clipboard popover: a rectangular backing; count 0 although text was copied |
| c7cdec69, dd4c194f | Spotlight: no backing at all, unreadable over bright content |
| c465051a | the GNOME 50 Activities / workspace pill at top-left (to remove) |
| 6374869a | prefs bottom view-switcher: 13 squashed icons, labels cut |
| 016dbfed | titlebar where minimize / maximize are greyed out (the Extensions prefs window) |
| 87222099 | Stage Manager strip: blurry, low-res thumbnails, ugly rectangles |
| 6002a849 | Stage Manager over the prefs |

Owner's words (abridged). Each of these must hold:
1. The notch, Control Center, clipboard and Stage Manager cards, and the top bar, all have a weird **rectangular background** although they should be rounded.
2. Control Center: add toggles for the notch, Stage Manager and other Kiwi features. Tone the UI down; "it looks terrible". Tiles must be **squircle-ish (rounded-square), not pills or ovals**.
3. Stage Manager:
   - Make it high quality: sharp, high-resolution, smoothly rounded previews, no jagged edges.
   - The minimize-into-strip and restore-from-strip move must be **our own end-to-end animation**: the window visibly travels to its strip card and back.
4. Remove the Activities icon (top-left).
5. Spotlight: needs a rounded, translucent backing panel so its bounds and contents are readable on any background. Icons must stay legible on bright wallpapers. No square background behind it.
6. Notch media prev, play/pause and next do nothing.
7. Do Not Disturb does not work. Notifications may not reach the notch. An expanded notch must collapse on a click anywhere outside it.
8. Clipboard history records nothing on the real desktop.
9. Prefs: the bottom icon bar is squashed and its text unreadable on small windows. Redesign so every label is readable, and group the new features in their own section.
10. Window controls: minimize and maximize are greyed out on some windows (e.g. the extension prefs window). **Force them for every window**; don't depend on what the app allows.

Global:
- Polished, smooth, "magical" animations.
- **Liquid Glass: use plain transparency (translucent fills), no blur or shader layers**, to minimize bugs.

## Rules
- Work only in your worktree and on your branch. Commit there with
  `git -c user.name=blueyzx64 -c user.email=samh74490@gmail.com commit`. No AI trailers. Never push. Never touch other worktrees.
- Edit only the files you own (your brief lists them). If you must change a file you don't own, keep it to a minimal hunk and say so in your report.
- `stylesheet.css` is shared. Edit only the selectors of your feature, and keep the edits in that feature's section.
- Enable/disable must stay exact mirrors (CLAUDE.md). GNOME 50 APIs only matter, but don't break `lib/compat.js` paths.
- Before you report: run `make check` (lint 0 warnings, schema check, tests) in your worktree. Add unit tests for pure logic you add.

## Real GNOME Shell 50.6 (Fedora 44 packages), headless, with screenshots
```sh
cd <your worktree>
KIWI_SRC=$PWD KIWI_EXTRA=/path/to/your-extra.sh /tmp/x2/run-f44.sh 1   # 1 = enable/disable cycles
```
- It prints the probes and `RUN DIR: /tmp/x2/runs/<ts>-<name>-f44X`. `shell.log` and `shots/*.png` are in there; look at your PNGs with the Read tool.
- Your extra script is sourced inside the session after the standard probes. It has:
  - `P '<js>'`: evaluate async JS in the Shell. `Main`, `GLib`, `Gio`, `St`, `Clutter`, `Meta` and `Shell` are in scope; return a value.
  - `$SL`: a prefix defining `sl(ms)` (sleep) and `inst("<feature-id>")` (a running Kiwi feature instance), e.g. `P "$SL"'inst("spotlight").toggle(); await sl(1000); return 1'`.
  - `SHOT name`: a full-screen PNG of the 1280x800 virtual monitor.
  - `gs key value`: set a Kiwi gsetting.
  - Two windows exist (Text Editor and a GTK4 test window), and a test notification was sent.
- Feature ids: notch, liquid-glass, control-center, stage-manager, clipboard-history, spotlight, show-window-controls, …
- Never edit `/tmp/x2/*.sh` or the roots. Runs are serialized across 4 roots and may queue. A probe failing with "no editor window" or "need 2 windows" under load is a harness flake: re-run once.
- Software rendering: real blur and GPU effects look different. Judge shape, layout, rounding, legibility and the absence of rectangles.
- MPRIS, DND, clipboard and click handling can be exercised from `P` scripts (e.g. `gdbus`/`Gio.Subprocess`, synthetic Clutter events, `St.Clipboard`, `Meta.Selection`). Note: the existing clipboard probe passes with `St.Clipboard.set_text` inside the Shell, but the owner's real copies from apps are not recorded. Test with an external client: `wl-copy` if the root has it, or a GTK4 app setting the clipboard.

## Report (≤40 lines)
- Branch and commit SHA(s).
- What changed, per owner item.
- Evidence: run dirs and screenshot paths.
- `make check` result.
- Anything you couldn't do, or that you changed outside your files.

## Never commit screenshots
Screenshots stay in /tmp only. Never add PNG/JPG files to the repo, except Kiwi's own icon assets.
