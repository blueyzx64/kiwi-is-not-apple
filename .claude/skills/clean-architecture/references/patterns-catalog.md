# Patterns catalog for Kiwi

Summary: the handful of patterns that pay for themselves in a GNOME Shell extension —
adapter, facade, observer/signals, strategy for per-version code, feature flags via
GSettings, disposable/cleanup registry, plus coordinator (mediator) and null object.
Each entry: when to use, a GJS sketch, and where the repo already does it.

## Contents
1. Adapter (Shell internals → port)
2. Facade (one entry to a messy subsystem)
3. Observer / signals (GObject signals, event bus)
4. Strategy for per-GNOME-version code
5. Feature flags via GSettings
6. Disposable / cleanup registry
7. Coordinator (mediator) for shared Shell resources
8. Null object / degraded adapter
9. Choosing quickly

---

## 1. Adapter

**Use when** a feature needs something from Shell internals or Mutter. The adapter
converts live objects into plain snapshots and plain intents into Shell calls; it is
the only file allowed to reference private fields.

```js
// apps/stageManager/shellAdapter.js
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class StageShell {
    constructor(signals) { this._signals = signals; }
    windows() {
        return global.display.list_all_windows()
            .filter(w => !w.skip_taskbar)
            .map(w => ({ id: w.get_id(), app: w.get_wm_class(), minimized: w.minimized,
                         rect: w.get_frame_rect(), workspace: w.get_workspace()?.index() }));
    }
    onWindowsChanged(cb) {
        this._signals.connect(global.display, 'window-created', cb);
        this._signals.connect(global.workspace_manager, 'active-workspace-changed', cb);
    }
    focus(id) { global.display.list_all_windows().find(w => w.get_id() === id)?.activate(global.get_current_time()); }
}
```

In-repo precedent: `apps/dockUtils.js` centralises Dash-to-Dock lookups
(`dockActive`, `isDockExtension`, `resetDockSettings`, laters at `:48-52`).

## 2. Facade

**Use when** many features need the same complicated subsystem. The facade hides
multi-step sequences (e.g. "add an indicator into Quick Settings' private
`_indicators` box at the right index") behind one call.

```js
// lib/quickSettingsFacade.js
export const QuickSettings = {
    addIndicator(actor, { first = false } = {}) {
        const box = Main.panel.statusArea.quickSettings?._indicators;   // private, 48–51
        if (!box) return { destroy() {} };
        first ? box.insert_child_at_index(actor, 0) : box.add_child(actor);
        return { destroy: () => actor.get_parent() === box && box.remove_child(actor) };
    },
};
```

Today `_indicators` is reached from five modules: `apps/batteryPercentage.js:23`,
`apps/addUsernameToQuickMenu.js:117`, `apps/calendar.js:56`,
`apps/quickSettingsDnDRemoval.js:130`, `apps/quickSettingsNotifications.js:356`.
A Shell rename would break all five; with a facade, one.

## 3. Observer / signals

Two flavours:

- **GObject signals** for Shell → feature (`notify::focus-window`, `changed::key`).
  Always via `SignalTracker` so teardown is automatic.
- **Event bus** for feature → feature *facts*. Keep it tiny and synchronous:

```js
// lib/eventBus.js
export class EventBus {
    #h = new Map();
    on(evt, fn) {
        if (!this.#h.has(evt)) this.#h.set(evt, new Set());
        this.#h.get(evt).add(fn);
        return { destroy: () => this.#h.get(evt)?.delete(fn) };
    }
    emit(evt, payload) {
        for (const fn of [...(this.#h.get(evt) ?? [])]) {
            try { fn(Object.freeze(payload)); } catch (e) { console.error(`Kiwi bus ${evt}`, e); }
        }
    }
}
// usage: d.use(ctx.bus.on('panel:visibility', ({ visible }) => notch.setOffset(visible)));
```

Rules: names `feature:fact`; payloads are plain values; no return values; a listener
throwing never breaks the emitter. Do not use the bus for things that need ordering —
that is a coordinator's job.

## 4. Strategy for per-GNOME-version code

`metadata.json` declares 48–51. When Shell API differs, select an implementation once:

```js
// lib/shellVersion.js
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
export const SHELL_MAJOR = parseInt(Config.PACKAGE_VERSION.split('.')[0], 10);
export function pick(table) {            // { 48: implA, 50: implB } → highest key ≤ major
    const key = Object.keys(table).map(Number).filter(v => v <= SHELL_MAJOR).sort((a, b) => b - a)[0];
    return table[key ?? Math.min(...Object.keys(table).map(Number))];
}
```

```js
// apps/appButtons/shellAdapter.js
const maximize = pick({
    48: w => w.maximize(Meta.MaximizeFlags.BOTH),
    49: w => w.maximize(),              // Mutter 49 dropped the MaximizeFlags argument
});
```

(GNOME 49 also removed `get_maximized()` → `is_maximized()` and added
`set_maximize_flags()`.) Prefer **feature detection** (`'set_maximize_flags' in w`) when the API surface itself
is detectable; use version tables when behaviour changed without a visible API change.
`apps/windowTiling.js` already isolates `isMaximized/maximizeWindow/unmaximizeWindow`
(imported at `apps/appButtons.js:14`) — that is the right seam; move it to `lib/`.

## 5. Feature flags via GSettings

Each feature: one boolean `enabledBy` key, read by the `FeatureHost`, never by the
feature itself. Config keys are read through the feature's `settings.js`:

```js
// apps/autoHideBar/settings.js
export const KEYS = ['auto-hide-bar-delay', 'auto-hide-bar-fullscreen-only'];
export function readConfig(s) {
    return Object.freeze({
        delayMs: s.get_uint('auto-hide-bar-delay'),
        fullscreenOnly: s.get_boolean('auto-hide-bar-fullscreen-only'),
    });
}
```

The host watches only `changed::<key>` for the feature's keys and either calls
`feature.reconfigure(readConfig(s))` or restarts it (`restartOn`). Experimental
features: add an `experimental-features` `as` key and gate in `features.js`.
`prefs.js` binds directly to the same keys (`settings.bind`, `prefs.js:64`), so UI and
runtime share one source of truth.

## 6. Disposable / cleanup registry

The single most valuable pattern for extensions: register the undo at the moment of
the effect, dispose LIFO.

```js
enable() {
    const d = this._d = new DisposableStack();
    const signals = d.use(new SignalTracker());
    const timers = d.use(new Timeouts());
    const inj = d.use(new Injections());            // wraps InjectionManager.clear()
    Main.panel.add_style_class_name('kiwi-glass');
    d.defer(() => Main.panel.remove_style_class_name('kiwi-glass'));
    inj.override(Workspace.prototype, '_isOverviewWindow', orig => function (w) {
        return orig.call(this, w) && !w.minimized;
    });
    timers.timeout(300, () => this._settle());
}
disable() { this._d?.dispose(); this._d = null; }
```

Good precedents: `apps/hideMinimizedWindows.js` (all overrides on one
`InjectionManager`, `clear()` on disable, idempotent `enable`), `apps/panelStyling.js`
(effect = a CSS class, undo = remove it).

## 7. Coordinator (mediator)

**Use when** two or more features mutate the same Shell resource: panel boxes, panel
visibility, message tray, overview, blur effects. The coordinator owns the resource;
features submit *requests* that return disposables; the coordinator recomputes the
result deterministically from all live requests (order-independent).

See `kiwi-layering.md` §7 (panel layout) and §8 (notification router). A third likely
need: `blurBudget` — Liquid Glass, dock blur (`apps/dockBlur.js`), panel blur
(`apps/panelTransparency.js`) and overview wallpaper blur each create
`Shell.BlurEffect`s; a coordinator can share/repaint them (cf. the shared
`apps/blurPaintSignal.js`) and cap cost.

## 8. Null object / degraded adapter

When an optional dependency (Rust helper, Dash-to-Dock, UPower) is missing, inject an
adapter with the same interface that does the minimal safe thing instead of sprinkling
`if (this._proxy)`:

```js
const store = helperAvailable ? new HelperStore(client) : new MemoryHistoryStore();
const model = new ClipboardModel(store);   // never knows which
```

## 9. Choosing quickly

| Symptom | Pattern |
|---|---|
| Private Shell field referenced from feature logic | Adapter |
| Same private field used by 3+ features | Facade |
| Feature needs to know something happened elsewhere | Observer (bus) |
| Two features fight over order/visibility | Coordinator |
| `if (SHELL_MAJOR >= 49)` inside logic | Strategy |
| `if (helper)` everywhere | Null object |
| Long manual `disable()` | Disposable registry |
| New branch in `_on_settings_changed` | Feature flag in `features.js` |

Sources: Gamma et al., *Design Patterns* (1994) — adapter, facade, observer, strategy,
mediator; Martin, *Clean Architecture* ch. 22 (boundaries/adapters); GNOME Shell
`InjectionManager` and `misc/config.js` — https://gitlab.gnome.org/GNOME/gnome-shell
(read via GitHub mirror); gjs.guide "Extension anatomy"/"Session modes" —
https://gjs.guide/extensions/overview/anatomy.html , https://gjs.guide/extensions/topics/session-modes.html ;
`maximize()` change in §4 — https://gjs.guide/extensions/upgrading/gnome-shell-49.html .
