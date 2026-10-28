> **Superseded in v3.** The layout is now `core/` + `features/` (see `code-map.md` and
> `conventions.md`); `coordinators/` moved into `core/`. This file is kept for the reasoning
> behind the 2.x shared layer.

# New-features architecture and change guidelines

> **Summary (read this, stop if it's enough):** the eight planned features
> ([../features/README.md](../features/README.md)) are built on a small shared layer in
> `lib/` (plumbing) and `coordinators/` (owners). That layer has a feature registry, a cleanup registry, one owner for each
> contested Shell area (panel slots, blur, notifications, the panel's visibility, window
> state), and a shared glass helper. Every new feature lives in its own folder under
> `apps/<feature>/`, split into pure logic, the view, and a Shell adapter. Phase 0 fixes
> the blockers found in the audit before any feature work.
> Read [tech-debt-and-conflicts.md](tech-debt-and-conflicts.md) for the *why*, and
> [code-map.md](code-map.md) for *where things are today*.

## Contents
1. [Principles](#1-principles)
2. [Target layout](#2-target-layout)
3. [Shared services (lib/ and coordinators/)](#3-shared-services-lib-and-coordinators)
4. [Where each feature changes code](#4-where-each-feature-changes-code)
5. [Conflict resolutions](#5-conflict-resolutions)
6. [Phased plan](#6-phased-plan)
7. [Coding rules for every change](#7-coding-rules-for-every-change)
8. [Testing matrix](#8-testing-matrix)
9. [Open questions for the owner](#9-owner-decisions-answered)

Skills to load while working: `gnome-shell-extension` (Shell APIs, version facts),
`gjs` (the language), `clean-architecture` (layering details), `apple-design` (look and
motion). `c-gobject`, `vala` and `rust-gnome` are only for out-of-process or native
helpers.

---

## 1. Principles
1. **One owner per contested resource.** Panel slots, blur effects, notification banners,
   the panel's position and struts, and window visibility each have exactly one module that
   changes them. Features ask that owner; they never patch the resource directly.
2. **Enable and disable are mirror images.** Everything a feature does is registered in its
   cleanup registry; `disable()` = `registry.dispose()`. No feature may leave state behind
   when it is turned off or when the screen locks.
3. **No work at import time.** Modules export a class; the registry constructs it.
4. **Pure logic is testable without a Shell.** Ranking, history policy, calculator,
   layout maths and notch state machines live in `model.js` files with no `gi://` imports.
5. **Never touch the user's files destructively.** Writing outside the extension's own
   folder needs backup-and-restore that is idempotent and tested. See Phase 0.
6. **This release supports GNOME 50 (Fedora 44) only**; 48/49/51 code paths are kept for later. Code that differs by version goes behind `lib/compat.js`,
   never inline.

## 2. Target layout
```
extension.js                 # thin: builds ctx (settings, gettext, coordinators), starts the feature host
features.js                  # FeatureRegistry: key → feature class, dependencies, conflicts
lib/                         # plumbing, no feature knowledge
  disposables.js             # CleanupRegistry: signals, sources, injections, actors, files
  compat.js                  # per-version shims (48–51 kept; 50 supported now)
  settings.js                # typed getters, key migrations, change-scoped dispatch
  glass.js                   # GlassService: the one blur + tint + highlight implementation
  keybindings.js             # addKeybinding / removeKeybinding with schema keys
  modalSurface.js            # shared glass modal used by Spotlight and Quick Paste
coordinators/                # the single owners of contested Shell resources
  panelLayout.js             # owns ordering in _leftBox/_centerBox/_rightBox
  panelVisibility.js         # owns panel translation, struts, reveal (auto-hide + fullscreen hover)
  notificationRouter.js      # owns banner suppression and redirection (notch, DND)
  windowState.js             # owns per-window flags: staged, parked, hiddenFromOverview
apps/
  <existing modules>.js      # migrated gradually
  clipboard/   { index.js, model.js, store.js, popover.js, quickPaste.js }
  spotlight/   { index.js, model.js, providers/*.js, view.js }
  notch/       { index.js, stateMachine.js, view.js, activities/*.js }
  controlCenter/ { index.js, layout.js, tiles/*.js }
  stageManager/  { index.js, model.js, strip.js, shellAdapter.js }
  liquidGlass/   { index.js }   # applies lib/glass.js to the surfaces chosen in settings
```
This matches `.claude/skills/clean-architecture/references/kiwi-layering.md` (the per-feature
split `index / model / view / shellAdapter / settings` is described there in detail).

**Packaging:** `.github/workflows/pack-release.yml` only ships `--extra-source=icons,apps,css`.
Adding `lib/`, `coordinators/` and `features.js` to that list belongs in the same PR that
creates them, or the release zip breaks.

`windowControls.js` and `panelHover.js` stay where they are but are rewritten on top of
`panelLayout` and `panelVisibility`. They are not copied into new folders.

## 3. Shared services (lib/ and coordinators/)
| Service | Replaces / fixes | API sketch |
|---|---|---|
| `FeatureRegistry` | The `extension.js:57-277` dispatcher that re-runs every module on any key change | `register({key, cls, needs:[], conflictsWith:[]})`; enables only on its own keys' changes; resolves conflicts (for example stage-manager ⟂ minimize-to-dock) |
| `CleanupRegistry` | Scattered disconnects and timeouts, unlimited retries | `connect(obj, sig, fn)`, `timeout(ms, fn)`, `idle(fn)`, `inject(proto, name, fn)`, `actor(a)`, `dispose()` |
| `PanelLayout` | The window-controls "stay rightmost" ordering hack (`extension.js:121-127`) | `claim(slotId, box, priority)`; recomputes order once per change |
| `GlassService` | Three blur implementations (`panelTransparency.js`, `dockBlur.js`, `overviewWallpaper.js`) and inline-style rewrites | `attach(actor, {variant, radius})` → handle; listens to the glass settings; static-wallpaper mode in performance mode |
| `NotificationRouter` | `calendar.js` banner pinning, 5 s polled dot, duplicate lists | `setBannerSink(sink)`; the stock banner is the default sink and the notch registers itself as a sink |
| `PanelVisibility` | `panelHover.js` private-layout tricks, fake open menu, 1 s polling | `request(reason)` / `release(reason)`; modes `always`, `autohide`, `fullscreen-hover`; pressure-barrier reveal |
| `WindowState` | `minimize()` being used for staging and parking; `extension.js:178` forcing other features | `set(win, flag)`; hide-from-overview and alt-tab read the flags |
| `Keybindings` | None today | Schema-backed `add(name, handler)`; restores GNOME defaults it moved (Super+Space) |
| `ModalSurface` | Ad-hoc modal in `downloadsStack.js:421,504` | `open({content, onKey})`, safe `pushModal`/`popModal`, closes on session-mode change |

## 4. Where each feature changes code
| Feature | New files | Existing files touched | Settings |
|---|---|---|---|
| Window controls | — | `apps/windowControls.js` (visibility gate `:357-360`, side detection `:42-55`), `apps/gtkThemeManager.js:66-72`, `css/hide-titlebar*.css`, Firefox/Thunderbird `*Hidden.css` | migrate `show-window-controls-fullscreen-only` → `window-controls-scope` |
| Liquid Glass | `apps/liquidGlass/`, `lib/glass.js` | `panelTransparency.js`, `dockBlur.js`, `overviewWallpaper.js` (delegate to the service), `stylesheet.css` (glass classes) | `liquid-glass-*`; `panel-blur` and `dock-blur` become "handled by Liquid Glass" when it is on |
| Clipboard | `apps/clipboard/`, `lib/modalSurface.js`, `lib/keybindings.js` | `prefs.js` (new page), schema | `clipboard-*` |
| Spotlight | `apps/spotlight/` | schema (keybinding), prefs | `spotlight-*` |
| ~~Auto-hide bar~~ (**removed** in UX round 1: the bar houses the notch) | ~~`coordinators/panelVisibility.js`~~ | `panelHover.js` (folded in), `panelTransparency.js:634-647`, `windowTiling.js:128`, `overviewSeamlessZoom.js:129-141` | `panel-autohide-*`; migrate `panel-hover-fullscreen` |
| Control Center | `apps/controlCenter/` | absorbs `addUsernameToQuickMenu.js`, `quickSettingsDnDRemoval.js`, the `custom-dnd-button` path in `extension.js:106-119`; works with `batteryPercentage.js` and `lockIcon.js` | `control-center-*` |
| Notch | `apps/notch/`, `coordinators/notificationRouter.js` | `calendar.js:197-228`, `quickSettingsNotifications.js` (retry `:131`), `panelMedia.js` / `mediaPlayback.js` (one shared MPRIS watcher) | `notch-*` |
| Stage Manager | `apps/stageManager/`, `coordinators/windowState.js` | `minimizedToDock.js:92-147,641-664`, `moveFullscreenWindow.js:107,130`, `hideMinimizedWindows.js`, `windowTiling.js` | `stage-manager-*` |

## 5. Conflict resolutions
- **Titlebar buttons vs panel controls:** do **not** change `button-layout` to hide buttons,
  because the panel controls read their side from it. Hide titlebar buttons with GTK CSS
  for *all* windows (new CSS file alongside `hide-titlebar*.css`). Read the side from a
  cached copy of the original `button-layout`.
- **Panel blur vs glass tint:** `panelTransparency.js` stops writing inline `style`. It
  sets CSS classes; GlassService owns the effect. One code path, so no overwrite.
- **Auto-hide vs fullscreen hover:** both are modes of `PanelVisibility`. Turning on
  auto-hide makes "show panel in fullscreen on hover" redundant; prefs shows that.
- **Notch vs calendar:** `calendar.js` keeps moving the date menu right but gives up banner
  positioning to `NotificationRouter`. The notch claims the centre slot via `PanelLayout`.
- **Stage Manager vs minimize-to-dock:** the registry declares them as conflicting. Enabling
  Stage Manager pauses `minimize-to-dock` without changing its saved value, and shows a note
  in prefs.
- **Control Center vs QS modules:** the four modules that write into the QS indicator row
  register "tiles" or "indicators" with the controlCenter layout instead of inserting
  actors themselves. The DnD toggle is found by type (`instanceof`), not by guessing.
- **Spotlight vs input-source switching:** ask the user on first enable; store the old
  binding and restore it on disable.

## 6. Phased plan
**Phase 0: blockers (before any feature)**
1. Fix Firefox/Thunderbird chrome-folder deletion (`mozillaThemeManager.js:78-85,136`):
   never delete a folder Kiwi did not create; use a Kiwi-only subfile plus `@import`.
   Also gate the Firefox and Thunderbird managers on their own settings only
   (`extension.js:227,233`).
2. Add `lib/disposables.js` and `features.js` (the feature registry). Move `extension.js` to the registry
   while keeping behaviour identical.
3. Decide `session-modes` (see §9) and the lock-screen policy.
4. Fix the cheap correctness bugs from the audit: `panelTransparency.js:701` wrong
   property, blocking D-Bus call in `batteryPercentage.js:52`, unlimited retry
   `quickSettingsNotifications.js:131`, kept thumbnails `minimizedToDock.js:794`.

**Phase 1:** window controls (feature 1) → `coordinators/panelLayout.js`.
**Phase 2:** Liquid Glass + `lib/glass.js`, migrating the three blur users.
**Phase 3:** Clipboard → Spotlight (shared `modalSurface`, `keybindings`).
**Phase 4:** `coordinators/panelVisibility.js` + auto-hide, folding in `panelHover.js`.
**Phase 5:** Control Center.
**Phase 6:** `coordinators/notificationRouter.js` + notch.
**Phase 7:** `coordinators/windowState.js` + Stage Manager.

Each phase is one PR. It must not change existing settings' defaults and must include key
migrations.

## 7. Coding rules for every change
- Match the existing style: ES modules, 4-space indent, `console.error('[Kiwi] …')`,
  translatable strings via `_()`.
- Every signal, source, injection, actor and file write goes through `CleanupRegistry`.
- Private Shell API (`Main.panel._leftBox`, `_delegate`, prototype patches) is allowed
  only inside a feature's `shellAdapter.js` or a `coordinators/` owner, with a comment naming the
  Shell versions it was checked against.
- No polling where a signal exists. A timer needs a comment explaining why.
- New settings: add them to the schema with a summary and description, add prefs UI in the
  same PR, and give a migration path when replacing an old key.
- CSS: new shell styles live in `stylesheet.css` under a `/* feature: <name> */` heading;
  class names use a `kiwi-` prefix.
- Keep files under ~500 lines. Split by model, view and adapter.

## 8. Testing matrix
| Check | How |
|---|---|
| Lint | GNOME's eslint config (see the `gjs` skill) |
| Pure logic | `gjs -m` unit tests for `model.js` files |
| Enable/disable leaks | Toggle each feature 20× in a nested shell; watch `journalctl` and Looking Glass actor counts |
| Lock/unlock | Lock the screen with every feature on; nothing must stay on the lock screen |
| Versions | GNOME 50 on Fedora 44 (`--devkit` nested shell); 48/49/51 later |
| Interop | Dash to Dock, Blur my Shell, AppIndicator on and off |

## 9. Owner decisions (answered)

Answered 2026-10-25; the full list is in `.swarm/shared/decisions.md`. The questions below
are kept for history. Answers: (1) always save to disk; (2) a Super tap opens Spotlight;
(3) yes, Phase 0 is its own change, and the Firefox data-loss fix ships first as its own PR.

### Original questions
1. **Clipboard across lock:** EGO made Kiwi tear down fully on lock. Options:
   (a) history is lost on lock;
   (b) opt-in persistence to disk (`clipboard-persist`);
   (c) declare `unlock-dialog` session mode for the clipboard store only.
   The recommendation is (b), because (c) needs reviewer justification.
2. **Spotlight shortcut:** keep Super+Space and move input-source switching, or default to
   another shortcut such as Super+S?
3. **Refactor scope:** Phase 0 moves the existing modules onto the registry. Is it OK to land
   that as its own PR with no visible changes?
