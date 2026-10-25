# Contracts (frozen APIs; only the orchestrator edits)

_Frozen: lib/ + features.js (S1), prefs builder, panelLayout (S2), lib/glass.js (S3)._

## Prefs builder (frozen by orchestrator, owner S10)
- Each `apps/<feature>/prefs.js`: ESM, Adw/Gtk/Gio only, no Shell libs.
- `export const PAGE = {id, title: N_('…'), icon}` for a new page, or
  `{into: 'panel'|'dock'|'windowControls'|'advanced'}` to join an existing page.
- `export function buildPrefs({settings, window, extension}) -> Adw.PreferencesGroup[]`.
  Groups only; S10 places them in a fixed page order in `fillPreferencesWindow`.
- Cleanup via `window.connect('close-request', …)`.
- Shared rows (switch, enum combo, shortcut row) live in `prefs/rows.js` (S10 owns).

## lib/ and features.js (frozen from S1, feat/foundation)
### lib/disposables.js: `export class CleanupRegistry`
- `add(fn)->token` runs fn on dispose. `connect(obj, sig, fn)->token` GObject signal.
- `timeout(ms, fn, {name, priority}?)->token`: return `GLib.SOURCE_CONTINUE` to repeat. `idle(fn, {name}?)` runs once.
- `inject(obj, name, fn)`: `obj[name] = function(...a) { return fn.call(this, orig, ...a) }`; restored on dispose.
- `actor(a)->a` destroyed on dispose. `file(path|GFile)` deleted on dispose (only files Kiwi wrote).
- `release(token)`; `dispose()` newest first, errors logged, safe twice, reusable; `size` getter.
### lib/settings.js: `export class KiwiSettings(gsettings)` (no gi imports)
- `raw, has(key)`, getters `bool/int/double/string/strv/enum`, setters `setBool/setInt/setDouble/setString/setStrv`.
- `watch(keys|'*', fn(key))->unwatch`; `attach(registry)` once.
- `migrate(list)` / `export runMigrations(gs, [{from, to, map?}])`: copies only if `from` is
  user-set and `to` is not. Never resets `from`. Idempotent. **No `settings-version` key**
  (this replaces the earlier orchestrator note).
### lib/compat.js: the only place that compares Shell versions
- `SHELL_MAJOR, atLeast(n), SHELL_HAS_SYSTEM_DND` (49+), `maximizeWindow(win)`, `unmaximizeWindow(win)`,
  `MENU_CLOSE_ARGS` (pass to `menu.close()`), `reducedMotion()->bool`, `watchReducedMotion(registry, fn(bool))`.
### lib/featureRegistry.js: `export class FeatureRegistry`
- `register, registerAll, start(ctx), refresh(key|null), apply(id), stop()` (reverse order), `status(id)` ('active'|'paused'|'off'), `isActive(id)`.
### features.js: `export const FEATURES = [entry…]` (order = start order)
- `ctx = {extension, settings (raw Gio.Settings), gettext, interfaceSettings}`
- entry: `id`; `setting: 'bool-key'` or `when: ctx=>bool`; `enable(ctx, cleanup)/disable(ctx, cleanup)` or
  `cls` (`new cls(ctx, cleanup)` with `.enable()/.disable()`); `restartOn: [keys]`; `needs: [ids]`;
  `conflictsWith: [ids]` (this entry wins; the losers pause and keep their settings); `startOnly`;
  `reapply` is **legacy only**, so new features must not set it.
- Edge-triggered: `enable` when wanted flips on, `disable` when it flips off. `cleanup` is the entry's
  own CleanupRegistry, disposed after `disable()`. Put every signal, timer, actor and injection there.
  enable/disable are **sync**. Errors are caught per feature.
- New feature = an import plus ONE appended entry (S1 owns the file; send the line through your Outbox).
- Existing ids: minimize-to-dock, hide-minimized-windows, downloads-in-dock, window-controls,
  panel-hover-fullscreen, panel-transparency, calendar, quick-settings-notifications, panel-media,
  dock-blur, dock-styling, dock-adaptive-colors, battery-percentage, lock-icon,
  add-username-to-quick-menu, window-title, tiling-title-menu, keyboard-indicator, launchpad-app,
  firefox-theme, thunderbird-theme, gtk-theme.

## coordinators/panelLayout.js (frozen from S2, feat/window-controls)
- `import { PanelLayout } from '../coordinators/panelLayout.js';`
- `const slot = PanelLayout.claim(cleanup, {id, actor, box: 'left'|'center'|'right', anchor?})`
  - `actor` = the panel-box child (e.g. `indicator.container`). Released on `cleanup.dispose()`;
    PanelLayout never destroys the actor. Same `id` replaces the old claim.
  - `anchor` (default `{last:true}`): `{first:true}` | `{last:true}` |
    `{before:[ids], fallback?:'first'|'last'}` | `{after:[ids], fallback?}`. ids = a
    `Main.panel.statusArea` role or another claim id; unknown ids use the fallback.
- `slot.update({box?, anchor?})`, `slot.release()`, `PanelLayout.claimed() -> string[]`.
- Re-sorts in one idle on `child-added` of a claimed box.
- Claims in use: `window-controls` (left before `window-title`, or right last).
  The notch (S8) claims box `center`.

## lib/glass.js: GlassService (frozen from S3, feat/liquid-glass)
`import { Glass } from '../lib/glass.js'`: a module singleton with no ctx. It starts on the first attach/watch and stops after the last destroy.
**Rules:** never write your own blur. Put content in a sibling above the glass layer, not in a child.
Attach in `enable()` and add `cleanup.add(() => h.destroy())`. Check `Glass.motion` before animating.
- `Glass.attach(target, opts) -> handle`: refcounted per (target, surface).
  - `surface`: 'panel'|'menus'|'dock'|'overlays' (default) | 'wallpaper' (plain cached blur, mode self).
  - `parent` (default `target.get_parent()`; the layer goes in at index 0) and `below` (insert just under that child).
  - `layers`: 'glass' (blur + tint + rim + highlight [+ shadow], the default) | 'blur' (blur only; the caller keeps its tint).
  - `mode`: 'backdrop' (default) | 'self'. `follow`: true (default) | false (the caller uses `handle.setRect`).
  - `radius`: corner px. Concentric inner radius = max(outer - padding, 4).
  - `role`: 'small' | 'large' (+0.10 tint). `shadow` defaults to false for panel/dock and true otherwise.
  - `isDark: () => bool` (default: St color-scheme), `name`, and `brightness(dark)` for self/wallpaper only.
- handle: `setVisible(bool)`, `setRect(x, y, w, h)`, `refresh()`, `invalidate()`, `destroy()` (idempotent),
  `tier` ('off'|'blur'|'light'|'opaque'), `params` (read-only).
- `Glass.wants(surface, rawGsettings?) -> bool`: liquid-glass is on and the surface is enabled, or glass is off and the legacy key is on.
- `Glass.motion` (false under reduced motion), `Glass.snapshot`, `Glass.watch(registry, fn({snapshot, env}))`.
- `Glass.configure(gsettings)` is optional.
- The service owns: tiers (high contrast gives opaque), the still wallpaper copy for Performance and Power Saver modes,
  the repaint throttle, the legacy keys, and the migration into liquid-glass-surfaces.
- compat shims: `SHADER_API`, `createShaderEffect({declarations, effectFn})` in lib/compat.js.
- Known limit: refraction bends only the actor's own texture, so it uses the still-wallpaper path.

## coordinators/panelVisibility.js (frozen from S6, feat/autohide)
`import { PanelVisibility } from '../coordinators/panelVisibility.js'`
- `hold(cleanup, name) -> {release()}`: keeps the bar shown until release or dispose. Works before the controller starts.
  The notch uses `hold(cleanup, 'notch')`, and Spotlight and other modals use their own name.
- `reveal()`: show now, then hide after the hide delay unless something holds it.
- `isVisible()`, `autoHiding()` (true only in mode autohide), `mode()` ('always'|'fullscreen-hover'|'autohide').
- `connect(cleanup, fn({visible, autoHiding, mode}))` fires on visibility or mode changes.
- Feature id `panel-autohide`. Style class `kiwi-panel-autohide` is on Main.panel while it runs.
- Not done: no banner-offset hold and no drag-and-drop hold.

## coordinators/windowState.js (frozen from S9, feat/stage-manager; not merged yet)
`import { WindowState } from '../coordinators/windowState.js'` is a singleton. `WindowStateRegistry` is the class, for tests.
- FLAGS: `staged | isolatedFullscreen | tiled | parkedInDock`.
- `set(win, flag, on=true) -> changed`, `has(win, flag)`, `flags(win)`, `list(flag)`, `clear(win)`.
  Call `clearFlag(flag)` in your disable().
- `skipsDock(win)` is true for staged windows, and minimizedToDock skips them.
  `hiddenFromSwitcher(win)` = parkedInDock && !staged, and only those are hidden by hideMinimizedWindows.
- The `stageActive` getter and `setStageActive(bool)` are for Stage Manager only.
  moveFullscreenWindow and windowTiling pause while it is true.
- `watch(cleanup|fn, fn(win, flag, on)) -> stop`. The stage-mode event is `(null, 'stageActive', on)`.
- `win._kiwiStaged` mirrors staged. Flags drop when the window emits 'unmanaged'.
