# Kiwi (is not Apple): notes for Claude Code

A GNOME Shell extension (GJS, ES modules) that brings macOS-style features to GNOME.
Supported shell versions: 48–51 (`metadata.json`).

## Start here: open only what you need
| Need | Read |
|---|---|
| What exists today and where | `docs/architecture/code-map.md` |
| Known conflicts, legacy patches, tech debt | `docs/architecture/tech-debt-and-conflicts.md` |
| How the new features will be built (layout, owners, phases) | `docs/architecture/new-features-architecture.md` |
| Locked spec for one planned feature | `docs/features/README.md` → one feature file |

## Skills (`.claude/skills/`)
Load them by task: `gnome-shell-extension` (Shell APIs, GNOME 45–51 changes, EGO review),
`gjs` (the language), `clean-architecture` (where code goes), `apple-design` (look, motion,
Liquid Glass). Only for native or out-of-process helpers: `c-gobject` (also `advanced/`),
`vala`, `rust-gnome`.

## Rules
- Enable/disable must be exact mirrors. Disconnect, remove and restore everything.
- Never delete or overwrite user files Kiwi did not create (see Phase 0 in the
  architecture doc).
- New source folders must be added to `--extra-source` in `.github/workflows/pack-release.yml`.
- Commits: author `blueyzx64`, no AI attribution trailers.
