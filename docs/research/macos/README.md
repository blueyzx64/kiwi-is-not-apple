# macOS feature research (2018 → now) for Kiwi

Purpose: a complete, deep catalogue of macOS desktop features from Mojave (2018) to the latest release. For each feature it records what the feature is, its caveats, how Kiwi could port it to GNOME 50 / Fedora 44, and what blocks it. It feeds `docs/architecture/overhaul-plan.md`.

## Files
| File | Scope |
|---|---|
| `2018-2019-mojave-catalina.md` | macOS 10.14 Mojave, 10.15 Catalina |
| `2020-2021-bigsur-monterey.md` | macOS 11 Big Sur, 12 Monterey |
| `2022-2023-ventura-sonoma.md` | macOS 13 Ventura, 14 Sonoma |
| `2024-now-sequoia-tahoe.md` | macOS 15 Sequoia, 26 Tahoe, and anything newer that has been announced |
| `native-apps-and-system-ui.md` | Core system UI and bundled apps, across releases (Finder, Dock, Menu bar, Mission Control, Spotlight, Quick Look, Preview, System Settings, screenshots, …) |
| `signifiers-and-typing.md` | Signifiers, feedback and typing aids across Catalina → Golden Gate (caret badges, modifiers, pointer, menu/window cues, HUDs), with what replaced what |
| `porting-matrix.md` | Synthesis: every feature, a recommendation and a phase (written last) |

## Per-feature template (all files use it)
```
### <Feature name>
- **Introduced / changed:** <release(s)>
- **What it is:** detailed behaviour, UI, interactions, settings, keyboard/trackpad
- **Caveats (on macOS):** limits, hardware/Apple-ID/iCloud ties, known complaints
- **Port to GNOME 50:** how. Name the mechanism: Shell extension (GJS, which Shell/Mutter APIs), external helper (D-Bus service, GTK4/libadwaita app), GTK module, or a system tool.
- **Blockers / risks:** Wayland security model, missing Mutter/Shell APIs, app cooperation needed, Apple services, hardware, EGO review rules
- **Linux equivalents today:** existing GNOME features, extensions, apps
- **Kiwi status:** have / partial / none
- **Recommendation:** Port (P1 core) / Port (P2) / Later (P3) / Skip, with **effort** S/M/L/XL and one line of why
```
Sources go at the end of each file as links.
