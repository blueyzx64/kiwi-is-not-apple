# Kiwi v3 build rules (every phase agent reads this)

Read first:
- `CLAUDE.md`
- `docs/architecture/overhaul-plan.md`: your phase row in §7, the specs in §5, defaults in §12
- `docs/architecture/conventions.md`: how a feature is written
- `docs/architecture/code-map.md`
- `docs/research/macos/porting-matrix.md`, plus the research sections it links for your items. Implement what the research describes, not a guess.

## Owner rules
- Replicate the macOS experience on GNOME 50 (Fedora 44, Wayland). Faux Liquid Glass only, no real blur. No AI features.
- **Defaults follow macOS, and every behaviour is toggleable** in prefs. The owner's explicit choices win (plan §12).
- Clean architecture:
  - pure `model.js` with unit tests;
  - thin Shell adapters;
  - use `core/` services (events, desktop, layout, motion, originals) instead of private tracking;
  - no duplicated helpers.
- Readable, maintainable, extensible and reusable code. No tech debt: no TODO hacks, no magic timeouts, no dead code.
- Performance:
  - no sync IO in enable;
  - no per-frame allocation or relayout;
  - idle cost near zero;
  - animations via `core/motion` (springs, reduced motion, cancellable).
- Integration: features talk through `core/events` and `core/layout` edge claims, not by reaching into each other.
- Enable and disable are exact mirrors. GNOME settings Kiwi changes go through `core/originals` (crash-safe restore).
- Never delete or overwrite user files Kiwi did not create.

## Work rules
- Work in your worktree and branch only. Commit with `git -c user.name=blueyzx64 -c user.email=samh74490@gmail.com commit`. No AI trailers. Never push.
- **Never commit screenshots or images** except Kiwi's own icon assets.
- Shared files (features.js, the schema, the prefs page list, `styles/` and the generated stylesheet.css): keep your hunks small and in your feature's place. Regenerate stylesheet.css with the Makefile (`make check` verifies it).
- New folders: check pack-release.yml and the Makefile pack rules (`make pack-check`).

## Proof before you report
- `make check` and `make pack-check` pass.
- Real GNOME Shell 50.6 with real apps:
  - harness: `.swarm/shared/ux-round.md`; KIWI_PRE/KIWI_EXTRA; SHOT screenshots;
  - real apps in the roots: nautilus, gnome-calculator, rhythmbox, gnome-text-editor;
  - mocks: see /tmp/claude-0/-home-user-kiwi-is-not-apple/1c9cfc23-1f6c-5ceb-aec3-03f023179fb0/scratchpad/t-cc/pre.sh and t-notch/;
  - drive scenarios with the virtual pointer and keyboard;
  - finish with `KIWI_SRC=$PWD /tmp/x2/run-f44.sh 20`: 0 Kiwi errors, all probes pass.
- Look at your screenshots critically against macOS (from the research) and iterate until it looks right.
- Report in ≤35 lines: what you built (per item), settings and defaults, core APIs you added or used, evidence paths, and limits.
