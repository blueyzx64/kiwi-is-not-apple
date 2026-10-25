# Planned features: locked specs

> **Read this page first.** It lists every planned feature in one line each. Open a
> feature file only when you are working on that feature. Each feature file has the
> same sections in the same order, so you can jump straight to the one you need.

Interactive design canvas (source of truth for the look):
https://claude.ai/artifact/PJTdauCxK1VKQvpXditZpz (private to the repo owner until shared)

| # | Feature | Spec | Size | Status |
|---|---|---|---|---|
| 1 | Window controls in the top bar + button-free windows | [window-controls.md](window-controls.md) | S | Locked |
| 2 | Liquid Glass (toggleable) | [liquid-glass.md](liquid-glass.md) | M | Locked |
| 3 | Clipboard history (popover + Quick Paste) | [clipboard.md](clipboard.md) | M | Locked |
| 4 | Spotlight | [spotlight.md](spotlight.md) | M–L | Locked |
| 5 | Notification notch | [notch.md](notch.md) | M–L | Locked |
| 6 | Control Center | [control-center.md](control-center.md) | M | Locked |
| 7 | Auto-hide top bar | [autohide-top-bar.md](autohide-top-bar.md) | S–M | Locked |
| 8 | Stage Manager | [stage-manager.md](stage-manager.md) | L | Locked |

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
