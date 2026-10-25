# start-workflow.md: build the eight features with an agent swarm

> **Orchestrator:** read §0–§3, then run §8. **Worker agent:** read §0, then only your own
> card in §5 or §6 and the files that card names. Do not read the rest.

## 0. One-screen summary
- **Goal:** ship the 8 features in `docs/features/README.md` to completion on GNOME 48–51.
- **Team:** 1 orchestrator (the main session), up to **10 Sonnet** leads, and up to **50 Haiku**
  helpers working at the same time.
- **Plan of record:** `docs/architecture/new-features-architecture.md` (phases, owners,
  folder layout). Do not invent a different structure.
- **Memory:** `.swarm/shared/` is read-only for workers and written only by the orchestrator.
  `.swarm/agents/<ID>.md` is each agent's own memory, written only by that agent.
- **Tokens:** every agent loads `caveman` plus **at most 3** other skills (named on its card).
  Notes and reports are written caveman-style; code, docs and commit messages are written
  normally.
- **Git:** one branch per Sonnet lead. Only the orchestrator merges into
  `ccr-f3c1f44c-rv5a8r`, and opens one final PR into the fork's `main`. Author is `blueyzx64`,
  with no AI trailers.
- **All owner questions are answered** in `.swarm/shared/decisions.md`. Workers never ask the
  owner; they ask the orchestrator.

## Contents
1. [Roles and limits](#1-roles-and-limits)
2. [Memory protocol](#2-memory-protocol)
3. [Token rules](#3-token-rules)
4. [Shared-file ownership](#4-shared-file-ownership)
5. [Sonnet lead cards (S1–S10)](#5-sonnet-lead-cards)
6. [Haiku helper pools (H-*)](#6-haiku-helper-pools)
7. [Definition of done](#7-definition-of-done)
8. [Orchestrator run-book](#8-orchestrator-run-book)
9. [Report format](#9-report-format)

---

## 1. Roles and limits
| Role | Model | Max live | Does | Never |
|---|---|---|---|---|
| Orchestrator | main session | 1 | Plans, spawns, merges, owns `.swarm/shared/`, answers questions, talks to the owner | Writes feature code |
| Lead `S#` | Sonnet | 10 | Owns one feature or service end to end, splits work into Haiku tasks, reviews Haiku output, commits on its branch | Edits another lead's folder or the shared files in §4 |
| Helper `H-*` | Haiku | 50 | One small, exact task from a lead or the orchestrator | Makes design decisions, touches more than the files it was given |

- A lead may run **up to 5 Haiku helpers** at once. The orchestrator keeps the total ≤ 50.
- Haiku tasks must be **mechanical and checkable**: a given input file and line range, a given
  output file, and an acceptance rule. If a task needs judgement, a Sonnet lead does it.
- When stuck for more than 2 attempts, stop and write `BLOCKED:` in your memory file. Do not
  guess at Shell internals.

## 2. Memory protocol
```
.swarm/
  shared/            # orchestrator writes; everyone reads (read-only for workers)
    README.md        # these rules, short
    board.md         # task board: ID · owner · status · branch
    decisions.md     # owner answers + defaults chosen; workers obey
    contracts.md     # APIs of lib/ and coordinators/ once frozen
  agents/
    S1.md … S10.md   # each lead's own memory: progress, findings, questions, handoffs
    H-<pool>-<n>.md  # each helper's own memory (optional; short tasks report inline)
```
Rules:
1. **Workers never edit `.swarm/shared/`.** The orchestrator rejects any branch that touches it.
2. Workers write **only their own** `agents/<ID>.md`. To talk to another agent, add a line
   `TO <ID>: …` under `## Outbox`. The orchestrator relays it or promotes it to `shared/`.
3. Read `shared/decisions.md` and `shared/contracts.md` **once** at start and again only when
   the orchestrator says `SHARED UPDATED`.
4. Own-memory layout (caveman style, under 60 lines; prune old lines):
   ```
   ## State     phase · branch · last commit
   ## Done      bullets
   ## Next      bullets
   ## Found     facts others may need (file:line)
   ## Outbox    TO <ID>: …   |  ASK ORCH: …   |  BLOCKED: …
   ```

## 3. Token rules
- **Skills:** `caveman` + max 3 from: `gnome-shell-extension`, `gjs`, `clean-architecture`,
  `apple-design`, `c-gobject`, `vala`, `rust-gnome`. Read the skill's `SKILL.md` index and
  then only the one reference you need. Never read whole skills.
  If `caveman` is not installed, follow its rules by hand: short words, no filler, fragments
  are fine, keep exact file paths, code and numbers.
- **Docs:** open `CLAUDE.md` → the one doc your card names → only the section you need.
  The architecture and feature docs put a summary first; stop reading when you have enough.
- **Code:** use `grep -n` and read line ranges. Never cat a file over 300 lines. Do not re-read
  a file you just edited.
- **Output:** reports follow §9 (≤ 15 lines). No restating the task, no long explanations.
- **Delegation:** a lead never pastes whole files into a Haiku prompt; it passes paths, line
  ranges and the acceptance rule.
- **Caveman applies to:** memory files, reports, agent messages. **Not to:** code, comments,
  docs in `docs/`, prefs UI strings, commit messages.

## 4. Shared-file ownership
These files are touched by many features. Exactly one owner merges changes; everyone else sends
a **fragment** through their memory Outbox or a file under their own folder.

| File | Owner | Others send |
|---|---|---|
| `schemas/org.gnome.shell.extensions.kiwi.gschema.xml` | S10 | key XML fragment in `.swarm/agents/<ID>.schema.xml` |
| `prefs.js` | S10 | an Adw page/group builder function in `apps/<feature>/prefs.js`; S10 wires it in |
| `stylesheet.css` | S3 (glass tokens) then S10 | `apps/<feature>/style.css` block, merged under `/* feature: <name> */` |
| `extension.js`, `features.js` | S1 | a registry entry line in their Outbox |
| `.github/workflows/pack-release.yml` | S10 | — (S10 adds `lib/`, `coordinators/`, `features.js`) |
| `po/*.po`, `po/POTFILES*` | H-i18n via S10 | nothing; strings are extracted |
| `metadata.json` | orchestrator | — |

## 5. Sonnet lead cards
Each card lists: **Skills** (besides caveman) · **Read** · **Build** · **Depends on** · **Haiku pools to use**.

**S1 Foundation (Wave 0 + Phase 0, runs first and alone among leads)**
- Skills: `gnome-shell-extension`, `gjs`, `clean-architecture`
- Read: architecture doc §2, §3 and §6 Phase 0; `docs/architecture/tech-debt-and-conflicts.md`
  "Phase 0 / blockers" items; `extension.js`.
- Build:
  1. `lib/disposables.js`, `lib/compat.js`, `lib/settings.js`.
  2. `features.js` registry; move `extension.js:57-277` onto it with **identical behaviour**.
  0. **Wave 0, before anything else:** the Firefox/Thunderbird data-loss fix
     (`apps/mozillaThemeManager.js:78-85,136`; `extension.js:227,233`) on its own branch
     `fix/mozilla-chrome-dataloss`, kept minimal. The orchestrator opens a PR into `main` for it.
  4. The four cheap bug fixes listed in Phase 0.
- Then freeze the APIs: write them in your Outbox; the orchestrator copies them to `contracts.md`.
- **After the contracts are frozen**, fix `advanced/` on branch `feat/advanced-fixes`, with
  skills swapped to `c-gobject` + `clean-architecture`. Read
  `c-gobject` → `references/review-of-advanced-module.md` (all items; the event-driven
  replacement is described there).
- Haiku: H-recon, H-lint, H-tests.

**S2 Window controls + panelLayout (Phase 1)**
- Skills: `gnome-shell-extension`, `gjs`, `apple-design`
- Read: `docs/features/window-controls.md`; `apps/windowControls.js:42-55,177-208,357-360`;
  `apps/gtkThemeManager.js:66-72`; `css/hide-titlebar*.css`.
- Build: `coordinators/panelLayout.js`; controls for all focused windows; titlebar-button
  removal via GTK CSS for all windows (not `button-layout`); key migration.
- Depends on: S1 contracts.
- Haiku: H-css, H-schema, H-i18n.

**S3 Liquid Glass + lib/glass.js (Phase 2)**
- Skills: `gnome-shell-extension`, `apple-design`, `gjs`
- Read: `docs/features/liquid-glass.md`; `apple-design` → `references/liquid-glass.md`;
  `gnome-shell-extension` → `references/blur-shaders-and-effects.md`.
- Build: `lib/glass.js` GlassService; migrate `panelTransparency.js`, `dockBlur.js` and
  `overviewWallpaper.js` to it; `apps/liquidGlass/`; glass CSS tokens in `stylesheet.css`;
  per-version refraction path (GNOME 51 has no `Shell.GLSLEffect`); reduced-motion and
  high-contrast handling.
- Depends on: S1. **Publish the GlassService API early**, because S4–S9 consume it.
- Haiku: H-css, H-recon.

**S4 Clipboard history (Phase 3a)**
- Skills: `gnome-shell-extension`, `gjs`, `clean-architecture`
- Read: `docs/features/clipboard.md`; `gnome-shell-extension` → `references/clipboard.md`,
  `references/input-keybindings-and-modals.md`.
- Build: `apps/clipboard/`, the `model.js` history policy (pure, unit-tested),
  `lib/keybindings.js`, the popover, Quick Paste. Lock-screen policy per `decisions.md`.
- Depends on: S1, S3 (glass). Shares `lib/modalSurface.js` with S5: **S4 writes it, S5 reviews it.**
- Haiku: H-tests, H-schema, H-i18n.

**S5 Spotlight (Phase 3b)**
- Skills: `gnome-shell-extension`, `gjs`, `apple-design`
- Read: `docs/features/spotlight.md`; `gnome-shell-extension` →
  `references/input-keybindings-and-modals.md`.
- Build: `apps/spotlight/` (model ranking + calculator, pure and tested; providers: apps,
  search-provider D-Bus, settings, clipboard via S4's model). Shortcut policy per `decisions.md`.
- Depends on: S1, S3, and S4's `modalSurface`.
- Haiku: H-tests, H-recon, H-i18n.

**S6 Auto-hide top bar + panelVisibility (Phase 4)**
- Skills: `gnome-shell-extension`, `gjs`, `clean-architecture`
- Read: `docs/features/autohide-top-bar.md`; `gnome-shell-extension` →
  `references/layout-chrome-and-panel-hiding.md`; `apps/panelHover.js` (whole file);
  `panelTransparency.js:634-647`; `windowTiling.js:128`; `overviewSeamlessZoom.js:129-141`.
- Build: `coordinators/panelVisibility.js` using a pressure barrier; fold `panelHover.js` into
  it; key migration for `panel-hover-fullscreen`.
- Depends on: S1, S2 (panelLayout).
- Haiku: H-recon, H-schema.

**S7 Control Center (Phase 5)**
- Skills: `gnome-shell-extension`, `apple-design`, `gjs`
- Read: `docs/features/control-center.md`; `gnome-shell-extension` →
  `references/panel-and-quick-settings.md`; `quickSettingsDnDRemoval.js`,
  `addUsernameToQuickMenu.js`, `batteryPercentage.js`, `lockIcon.js` (grep for touch-points first).
- Build: `apps/controlCenter/` re-layout of the stock QuickSettings grid; tiles for Stage
  Manager and Liquid Glass (they call the registry, not the features directly); absorb the
  three old modules; key migrations.
- Depends on: S1, S3.
- Haiku: H-css, H-recon, H-schema.

**S8 Notch + notificationRouter (Phase 6)**
- Skills: `gnome-shell-extension`, `apple-design`, `gjs`
- Read: `docs/features/notch.md`; `gnome-shell-extension` →
  `references/notifications-and-message-tray.md`; `calendar.js:197-228`;
  `quickSettingsNotifications.js`; `panelMedia.js`; `mediaPlayback.js`.
- Build: `coordinators/notificationRouter.js`; `apps/notch/` (the state machine is pure and
  tested); one shared MPRIS watcher; OSD replacement.
- Depends on: S1, S2 (centre slot), S3, S6 (reveal while the bar is hidden).
- Haiku: H-tests, H-recon.

**S9 Stage Manager + windowState (Phase 7)**
- Skills: `gnome-shell-extension`, `gjs`, `clean-architecture`
- Read: `docs/features/stage-manager.md`; `gnome-shell-extension` →
  `references/windows-workspaces-and-actors.md`; `minimizedToDock.js:92-147,641-664`;
  `moveFullscreenWindow.js:107,130`; `hideMinimizedWindows.js`; `extension.js:178`.
- Build: `coordinators/windowState.js`; `apps/stageManager/` (layout maths pure and tested;
  Clutter.Clone strip); registry conflict with minimize-to-dock.
- Depends on: S1, S3. It may start the model and strip while S7 and S8 are running.
- Haiku: H-tests, H-recon.

**S10 Integrator and reviewer (runs from Phase 1 to the end)**
- Skills: `gnome-shell-extension`, `gjs`, `clean-architecture`
- Owns the shared files in §4. Merges fragments; writes the prefs pages per the "Kiwi settings"
  canvas board; adds the packaging sources; does EGO-guideline review of every lead branch
  (`gnome-shell-extension` → `references/review-guidelines-and-pitfalls.md`) before the
  orchestrator merges it.
- Haiku: H-schema, H-i18n, H-lint, H-docs.

## 6. Haiku helper pools
Spawned by a lead (or S10 or the orchestrator) with: input paths and line ranges, the output
path, an acceptance rule, and a skill (at most 1 besides caveman).

| Pool | Typical task | Skill | Acceptance |
|---|---|---|---|
| H-recon | "List every reference to X in apps/*.js with file:line and one-line purpose" | `gjs` | A table, no edits |
| H-schema | Turn a key list into gschema XML with summary and description | — | `glib-compile-schemas --strict --dry-run schemas/` passes |
| H-css | Write St CSS for a given class list using the tokens in `contracts.md` | `apple-design` | Only `kiwi-` classes; no `backdrop-filter` |
| H-i18n | Wrap new UI strings in `_()`, update `po/POTFILES`, regenerate the template | — | `xgettext` lists the new strings |
| H-tests | Write `gjs -m` unit tests for a given `model.js` function list | `gjs` | Tests run green with `gjs -m` |
| H-lint | Run eslint on the given files and fix only auto-fixable or trivial issues | `gjs` | Zero new warnings; no logic changes |
| H-docs | Update one doc section after a merge (code-map rows, feature status) | — | Only the given section changed |
| H-migration | Write a settings migration (old key → new key) per a given mapping | `gjs` | Idempotent; covered by a test |

Haiku output always comes back as a §9 report to the lead that spawned it. The lead checks it
before committing.

## 7. Definition of done (per feature)
1. Every box in the feature spec's "Acceptance" section is ticked, or explicitly deferred in
   `decisions.md`.
2. Enable and disable are mirror images. Toggle the feature 20× and check for no leftover
   actors, signals or sources.
3. eslint is clean; pure-logic tests are green; the schema compiles.
4. Prefs UI exists and strings are translatable.
5. S10 has done its EGO review and found nothing.
6. **Manual test list** written to the lead's memory: the steps the owner must run in a real
   GNOME 48–51 session. A cloud container has no GNOME Shell, so never claim a feature was
   tested in the Shell unless it really was.

## 8. Orchestrator run-book
1. **Seed memory:** `.swarm/shared/*` already exists and `decisions.md` is complete.
   Update it only when the owner changes something.
2. **Wave 0:** spawn S1 for the Firefox fix only. Merge it and open its PR into `main`.
   **Wave A:** S1 continues with Phase 0; spawn S10. Wait for S1's contracts, copy them to `contracts.md`, and post
   `SHARED UPDATED`.
3. **Wave B:** spawn S2 and S3. When S3's GlassService API is frozen, add it to `contracts.md`.
4. **Wave C:** spawn S4, S5, S6, S7 and S9 (model and strip only). Then **Wave D:** S8, and S9 in full.
   Keep ≤ 10 leads live; reuse a finished lead's slot.
5. **Each round:**
   - read the leads' Outboxes;
   - relay `TO` lines;
   - answer `ASK ORCH` lines, or escalate them to the owner;
   - update `board.md`;
   - merge only branches S10 approved;
   - push.
6. **Merge:** `git merge --no-ff feat/<name>` into `ccr-f3c1f44c-rv5a8r`. Never force-push.
   Commit author is `blueyzx64`, with no AI trailers.
7. **Finish:** update `docs/features/README.md` status, `docs/architecture/code-map.md`
   (H-docs), and the release notes. Open **one PR** from `ccr-f3c1f44c-rv5a8r` into `main`
   whose body holds the combined manual-test list, grouped by feature, for the owner to run
   on GNOME 48–51.

Starting prompt for a lead (fill in the brackets):
```
You are [S#] in the Kiwi swarm. Load skill caveman + [skills]. Read start-workflow.md §0 and your card in §5 only, then .swarm/shared/decisions.md and contracts.md. Work on branch feat/[name] in your own worktree. Keep .swarm/agents/[S#].md updated (§2 layout). Spawn ≤5 Haiku helpers using §6 pools. Report with §9 when done or blocked.
```

## 9. Report format
```
ID: S4 | STATUS: done|partial|blocked | BRANCH: feat/clipboard @ abc1234
DID: bullets (≤5)
FILES: paths
TESTS: what ran, pass/fail
MANUAL: steps owner must run (or "none")
ASK/BLOCKED: … (or "none")
```
