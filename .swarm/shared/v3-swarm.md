# Kiwi v3 swarm: roster and protocol (orchestrator-owned)

## Memory
- **Shared memory** is `/home/user/kiwi-is-not-apple/.swarm/shared/*`. Only the orchestrator writes it. Read it at start: this file, `v3-build.md`, `../../docs/architecture/overhaul-plan.md`.
- **Your memory** is `/home/user/kiwi-is-not-apple/.swarm/agents/<YOUR-ID>.md`. Only you write it, and you never write anyone else's. Keep it current; it is how you resume after a rate-limit stop. Use these sections:
  - `## Status`: one line, e.g. `working`, `blocked: …` or `done: <branch>@<sha>`
  - `## Plan`
  - `## Progress log` (dated bullets)
  - `## Findings for orchestrator`: facts others need, proposed contract changes, bugs found outside your scope. The orchestrator promotes the good ones into shared memory.
  - `## Handoff`: what's left, if you stop
- Never read or edit another agent's memory unless the orchestrator tells you to. Coordinate only through your Findings section.

## Tiers
- **Leads (sonnet, L1–L15):** own a feature package end to end in their own worktree and branch: design within the plan, implement, test in the real Shell, and report.
- **Helpers (haiku, H1–H50):** small, sharply scoped tasks (tests, verification, docs, assets, scenario scripts, audits) in their own worktree, or read-only research that writes only to their memory.
- **Adversarial reviewers (sonnet, R1–R5):** read-only on code. They try to break merged work: read the code, run scenarios in the real Shell, and write findings with evidence to their memory. They never edit code.

## Real-Shell test roots
`/tmp/x2/run-f44.sh` picks a free root among 8 (f44, f44b–h). Runs queue when all are busy, so batch your scenarios into few runs. A failure saying "no editor window" or "need 2 windows" under heavy load is a harness flake: re-run once.

## Board
Kept in `board.md` (orchestrator-owned): package → agent → branch → status.

## Hard rule
Never call any `mcp__claude-code-remote__*` tool (sessions, triggers, interrupts). They act outside this swarm.

## Verified GNOME 50 facts (from H4, checked on Fedora 44's gnome-shell 50.x and the 50.0 tag)
- **Reduced motion:** `org.gnome.desktop.a11y.interface reduced-motion` (enum `no-preference` | `reduce`). The Shell itself doesn't read it; it only uses `org.gnome.desktop.interface enable-animations` (St.Settings). Kiwi honours both via `core/motion` (`watchReducedMotion` in lib/compat.js).
- **Notifications:**
  - There is no NotificationGroup class. Grouping is one `MessageTray.Source` per app (notificationDaemon `_getSourceForApp`); the UI group is `NotificationMessageGroup` in messageList.js.
  - Source signals: `notification-added`, `notification-removed`, `notification-request-banner`, `destroy`.
  - MessageTray signals: `source-added`, `source-removed`, `queue-changed`; `getSources()`.
  - Notification props: `urgency` (LOW 0, NORMAL 1, HIGH 2, CRITICAL 3), `isTransient`, `resident`, `acknowledged`, `for-feedback`. Actions come from `addAction(label, cb)`, with `action-added`/`action-removed` signals.
