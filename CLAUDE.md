# Kiwi (is not Apple): notes for Claude Code

A GNOME Shell extension (GJS, ES modules) that brings macOS-style features to GNOME.
Supported: GNOME 50 (Fedora 44) for this release; 48/49/51 code paths kept for later (`metadata.json`).

## Start here: open only what you need
| Need | Read |
|---|---|
| What exists today and where (core/, features/, lib/, prefs/) | `docs/architecture/code-map.md` |
| How to write a feature (folder, model/adapter, core services, CSS, prefs, tests, harness) | `docs/architecture/conventions.md` |
| The v3 plan: phases, owner decisions, macOS defaults | `docs/architecture/overhaul-plan.md` |
| Known conflicts and tech debt (with the v3 status) | `docs/architecture/tech-debt-and-conflicts.md` |
| Locked spec for one planned feature | `docs/features/README.md` → one feature file |
| Real GNOME Shell test harness (probes, screenshots) | `tools/harness/README.md` |

## Skills (`.claude/skills/`)
Load them by task: `gnome-shell-extension` (Shell APIs, GNOME 45–51 changes, EGO review),
`gjs` (the language), `clean-architecture` (where code goes; the v3 layout in
`docs/architecture/conventions.md` wins where they differ), `apple-design` (look, motion,
Liquid Glass). Only for native or out-of-process helpers: `c-gobject`, `vala`, `rust-gnome`.

## Rules
- Enable/disable must be exact mirrors. Disconnect, remove and restore everything.
- Never delete or overwrite user files Kiwi did not create (see Phase 0 in the
  architecture doc).
- New source folders must be added to `--extra-source` in `.github/workflows/pack-release.yml`
  and to `EXTRA` in the Makefile.
- `stylesheet.css` is generated: edit `styles/base.css` or `features/<name>/style.css`, then
  `make css`. `make check` must pass.
- Commits: author `blueyzx64`, no AI attribution trailers.
