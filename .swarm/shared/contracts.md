# Contracts (frozen APIs; only the orchestrator edits)

_S1 froze lib/ and features.js (below). S3's lib/glass.js comes later._

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
