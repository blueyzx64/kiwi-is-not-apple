# Planned features: locked specs

> **Read this page first.** It lists every planned feature in one line each. Open a
> feature file only when you are working on that feature. Each feature file has the
> same sections in the same order, so you can jump straight to the one you need.

Interactive design canvas (source of truth for the look):
https://claude.ai/artifact/PJTdauCxK1VKQvpXditZpz (private to the repo owner until shared)

| # | Feature | Spec | Size | Status |
|---|---|---|---|---|
| 1 | Window controls in the top bar + button-free windows | [window-controls.md](window-controls.md) | S | Merged, untested on Shell |
| 2 | Liquid Glass (toggleable) | [liquid-glass.md](liquid-glass.md) | M | Merged, untested on Shell |
| 3 | Clipboard history (popover + Quick Paste) | [clipboard.md](clipboard.md) | M | Merged, untested on Shell |
| 4 | Spotlight | [spotlight.md](spotlight.md) | M–L | Merged, untested on Shell |
| 5 | Notification notch | [notch.md](notch.md) | M–L | Merged, untested on Shell (phase 1; see notch.md §4) |
| 6 | Control Center | [control-center.md](control-center.md) | M | Merged, untested on Shell |
| 7 | ~~Auto-hide top bar~~ | [autohide-top-bar.md](autohide-top-bar.md) | S–M | **Removed** (UX round 1): the top bar houses the notch, so it stays on screen |
| 8 | Stage Manager | [stage-manager.md](stage-manager.md) | L | Merged, untested on Shell |
| 9 | Desktop icons | [desktop-icons.md](desktop-icons.md) | M | Round 2 |

Status words: *Merged, untested on Shell* means the code is on the integration branch and passes
`bash tests/run.sh` and eslint, but nobody has run it on a real GNOME Shell yet. Features may still carry deferred parts; see the spec's Settings or Interactions section.

Owner decisions that apply to all features:
- **On by default.** Every new feature ships enabled; users opt out in prefs.
- **This release: GNOME 50 on Fedora 44 Workstation only.** The 48/49/51 code paths in `lib/compat.js` stay for later releases but are not claimed.
- Testing on a real desktop is done by the owner from each feature's manual test list.

Out of scope (decided):
- **Global menus** (File / Edit / View… of the app in the top bar): dropped.
- **App menu:** the top bar shows only the app icon and name, as today.

Build order: 1 → 2 → 3 → 4 → 7 → 6 → 5 → 8. Liquid Glass comes early so that every
new surface is built on the shared glass helper from the start.

How to build them: [../architecture/new-features-architecture.md](../architecture/new-features-architecture.md).

## Sections in every spec
1. **Summary**: what it is, in two lines
2. **Locked decisions**: settled with the owner; do not change them without asking
3. **UI**: states, sizes, behaviour
4. **Settings**: proposed GSettings keys
5. **Interactions with other features**
6. **Acceptance checklist**
- [Rounded window corners](rounded-corners.md): opt-in per-window corner mask (UX round 1).
