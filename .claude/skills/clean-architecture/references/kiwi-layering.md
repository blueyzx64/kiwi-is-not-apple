# Kiwi layering (proposal)

Summary: a concrete folder layout and wiring for this repo: a thin composition root,
shared `lib/`, coordinators for contested Shell resources, and one folder per feature
split into lifecycle / model / view / adapter / settings. Includes migration steps.

## Contents
1. Target tree
2. The context object
3. Feature registry (replaces `_on_settings_changed`)
4. Anatomy of a feature folder (worked: window controls)
5. Shared `lib/`
6. How modules talk: direct, events, coordinators
7. Coordinator: panel layout
8. Coordinator: notification router
9. Planned features → where they plug in
10. Migration plan

---

## 1. Target tree

```
extension.js                 composition root (≈60 lines)
features.js                  registry of feature descriptors
lib/
  lifecycle.js               DisposableStack
  signals.js                 SignalTracker (connect/disconnectAll, auto-drop on destroy)
  timeouts.js                Timeouts (timeout/idle/later; clearAll)
  injections.js              Injections: InjectionManager + instance patches
  settings.js                snapshot(), watch(keys, cb)
  shellVersion.js            SHELL_MAJOR + pick({48: implA, 50: implB})
  glass.js                   applyGlass(actor, level) / removeGlass(actor)
  eventBus.js                on/off/emit, names namespaced 'feature:event'
  pure/                      shared pure helpers (geometry, parsing)
coordinators/
  panelLayout.js
  notificationRouter.js
  blurBudget.js              (later) caps simultaneous Shell.BlurEffect instances
apps/
  appButtons/{index,model,view,shellAdapter,settings}.js
  clipboard/{index,model,view,shellAdapter,settings,helperClient}.js
  ...                         small legacy single-file modules may stay as-is
tests/unit/                  *.test.js for model.js and lib/pure
helpers/                     optional Rust (see rust-gnome skill)
```

## 2. The context object

`extension.js` builds one immutable `ctx` and passes it to every feature. Features get
capabilities, not globals:

```js
// extension.js
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { FeatureHost } from './lib/featureHost.js';
import { PanelLayout } from './coordinators/panelLayout.js';
import { NotificationRouter } from './coordinators/notificationRouter.js';
import { EventBus } from './lib/eventBus.js';
import { FEATURES } from './features.js';

export default class KiwiExtension extends Extension {
    enable() {
        this._settings = this.getSettings();          // one Gio.Settings for everyone
        const ctx = Object.freeze({
            settings: this._settings,
            gettext: this.gettext.bind(this),
            path: this.path,
            bus: new EventBus(),
            panelLayout: new PanelLayout(),
            notificationRouter: new NotificationRouter(),
        });
        this._host = new FeatureHost(ctx, FEATURES);
        this._host.start();
    }
    disable() {
        this._host?.stop();                            // reverse order, coordinators last
        this._host = null;
        this._settings = null;
    }
}
```

Today each module calls `_extension.getSettings()` itself (`apps/appButtons.js:32`,
`apps/windowTitle.js:80`, `apps/gtkThemeManager.js:149`), creating separate
`Gio.Settings` objects and needing a module-level `_extension` global.

## 3. Feature registry

```js
// features.js
export const FEATURES = [
    {
        id: 'window-controls',
        enabledBy: 'show-window-controls',
        restartOn: ['button-type', 'enable-app-window-buttons'],
        load: () => import('./apps/appButtons/index.js'),
    },
    {
        id: 'downloads-stack',
        enabledBy: 'downloads-in-dock',
        requires: ['dock'],                 // environment condition, see host
        after: ['minimized-to-dock'],       // enable after / disable before
        load: () => import('./apps/downloadsStack.js'),
    },
];
```

`FeatureHost` listens to `changed::<key>` only for keys in `enabledBy`/`restartOn`,
toggles exactly the affected feature, resolves `after` into an order (topological
sort), and evaluates `requires` (`dock` = `dockActive()` from `apps/dockUtils.js`,
re-checked on `extension-state-changed`). Every feature exposes the same shape:

```js
export default class Feature { constructor(ctx) {}  enable() {}  disable() {} }
```

This replaces the per-key branches in `extension.js:57-277` and the manual teardown
list in `extension.js:313-364`. Legacy modules exporting `enable/disable` functions can
be wrapped by a 5-line adapter in the host during migration.

## 4. Anatomy (worked: window controls)

```js
// apps/appButtons/model.js — pure, testable
export function parseButtonLayout(layout) {         // moved from appButtons.js:177-208
    const valid = ['close', 'minimize', 'maximize'];
    const [left = '', right = ''] = layout.split(':');
    const pick = s => [...new Set(s.split(',').map(b => b.trim()).filter(b => valid.includes(b)))];
    const l = pick(left), r = pick(right);
    if (l.length >= r.length && l.length > 0) return { side: 'left', buttons: l };
    if (r.length > 0) return { side: 'right', buttons: r };
    return { side: 'right', buttons: ['minimize', 'maximize', 'close'] };
}

export function visibleFor({ focus, overview, cfg }) {
    if (overview || !focus) return false;
    return cfg.fullscreenOnly ? focus.fullscreen : (focus.maximized || focus.fullscreen);
}
```

```js
// apps/appButtons/shellAdapter.js — the only file touching Shell/Meta
export class WindowControlsShell {
    constructor(signals) { this._signals = signals; }
    focusSnapshot() {
        const w = global.display.focus_window;
        return w ? { fullscreen: w.is_fullscreen(), maximized: w.maximized_horizontally && w.maximized_vertically } : null;
    }
    overviewVisible() { return Main.overview.visible; }
    onFocusChanged(cb) { this._signals.connect(global.display, 'notify::focus-window', cb); }
    onOverview(cb) {
        this._signals.connect(Main.overview, 'showing', () => cb(true));
        this._signals.connect(Main.overview, 'hidden', () => cb(false));
    }
    act(action) {                                  // close | minimize | toggle-maximize
        const w = global.display.focus_window;
        if (!w) return;
        if (action === 'close') w.delete(global.get_current_time());
        else if (action === 'minimize') w.minimize();
        // toggle-maximize: version-specific strategy (see patterns-catalog §4)
    }
}
```

```js
// apps/appButtons/index.js — lifecycle and wiring
export default class WindowControls {
    constructor(ctx) { this._ctx = ctx; }
    enable() {
        const d = this._d = new DisposableStack();
        const signals = d.use(new SignalTracker());
        const shell = new WindowControlsShell(signals);
        const cfg = readConfig(this._ctx.settings);                  // settings.js
        const view = d.use(new WindowControlsView(cfg, a => shell.act(a)));
        d.use(this._ctx.panelLayout.request('window-controls', view, cfg.side, 90));
        const render = () => view.setVisible(visibleFor({ focus: shell.focusSnapshot(), overview: shell.overviewVisible(), cfg }));
        shell.onFocusChanged(render); shell.onOverview(render); render();
    }
    disable() { this._d?.dispose(); this._d = null; }
}
```

## 5. Shared lib

```js
// lib/lifecycle.js
export class DisposableStack {
    #items = [];
    use(x) { this.#items.push(() => (x.destroy ?? x.dispose).call(x)); return x; }
    defer(fn) { this.#items.push(fn); }
    dispose() {
        while (this.#items.length) {
            try { this.#items.pop()(); } catch (e) { console.error('Kiwi: cleanup failed', e); }
        }
    }
}
```

```js
// lib/signals.js
export class SignalTracker {
    #ids = [];
    connect(obj, name, cb) {
        const id = obj.connect(name, cb);
        this.#ids.push([obj, id]);
        return id;
    }
    disconnectFrom(obj) {
        this.#ids = this.#ids.filter(([o, id]) => (o === obj ? (o.disconnect(id), false) : true));
    }
    destroy() { for (const [o, id] of this.#ids.splice(0)) try { o.disconnect(id); } catch {} }
}
```

The repo already does this ad hoc: `[obj, id]` arrays in `apps/appButtons.js:76-140`,
`apps/dockColors.js:75-76`, `{obj, id}` in `apps/calendar.js:22,112-118`.
`lib/timeouts.js` wraps `GLib.timeout_add`/`idle_add`/`global.compositor.get_laters()`
(already wrapped once in `apps/dockUtils.js:48-52`). `lib/injections.js` wraps Shell's
`InjectionManager` and adds `patchInstance(obj, name, fn)` that restores via `delete`
(as `apps/overviewSeamlessZoom.js:243` does by hand).

## 6. How modules talk

| Situation | Mechanism | Why |
|---|---|---|
| Inside a feature (index → view/model) | direct calls | simplest; same lifetime |
| Feature A needs to *react* to B ("stage changed", "bar hidden") | `ctx.bus` event, namespaced | A survives B being disabled; no import |
| Several features want the *same Shell resource* | coordinator request returning a disposable | arbitration needs one owner |
| Feature needs B's *capability* (window tiling helpers) | move it to `lib/` (pure) or a shared adapter | features never import features (`apps/appButtons.js:14` imports `windowTiling.js` today) |

Events are facts (`'notch:expanded'`), not commands. If you need a reply, it is not an
event; use a coordinator or a lib function.

## 7. Coordinator: panel layout

Problem in the code today: calendar moves `dateMenu` to the end of `_rightBox`
(`apps/calendar.js:198-200`), which pushes window controls off the last slot, so
`extension.js:121-127` tears window controls down to re-add them; the notification
badge waits 500 ms "to ensure all other indicators are added first"
(`apps/calendar.js:74-88`). Window title, window controls, panel media, battery label,
keyboard indicator, Control Center and auto-hide bar will all compete.

```js
// coordinators/panelLayout.js
export class PanelLayout {
    #slots = new Map();      // id -> { actor, side, priority }
    request(id, actor, side, priority) {
        this.#slots.set(id, { actor, side, priority });
        this.#relayout();
        return { destroy: () => { this.#slots.delete(id); this.#detach(actor); this.#relayout(); } };
    }
    #relayout() {
        for (const side of ['left', 'center', 'right']) {
            const box = PanelBoxes[side]();           // adapter: Main.panel._leftBox etc.
            const mine = [...this.#slots.values()].filter(s => s.side === side)
                .sort((a, b) => a.priority - b.priority);
            // place ours relative to stock children; deterministic, idempotent
            mine.forEach((s, i) => placeAt(box, s.actor, anchorIndex(box, side) + i));
        }
    }
}
```

Priorities are a documented table (e.g. right box: battery 10, media 20, quick
settings stock, clock 80, window controls 90). Ordering becomes data, enable order
stops mattering, and the 500 ms timer goes away.

## 8. Coordinator: notification router

Notification notch, Control Center, Quick Settings notifications
(`apps/quickSettingsNotifications.js`) and the calendar badge (`apps/calendar.js:148-172`)
all observe `Main.messageTray`. One router subscribes once (adapter), turns each
notification into a plain value `{ source, urgency, title, isTransient }`, asks a pure
policy `route(n, state) → 'banner' | 'notch' | 'center' | 'silent'`, and dispatches to
registered sinks. Sinks register like panel slots and return a disposable. Benefits: a
single place to honour DND, one set of `source-added/removed` handlers (cf. the careful
per-source tracking at `apps/calendar.js:128-146`), no 5 s polling fallback.

## 9. Planned features → plug-in points

| Feature | Coordinators / lib | Shell adapter surface | Helper |
|---|---|---|---|
| Clipboard history | panelLayout (icon), glass | `Meta.Selection`/`St.Clipboard`, keybinding | optional `kiwi-clipboardd` |
| Spotlight search | glass, bus (`spotlight:open`) | modal dialog, search providers | optional `kiwi-indexd` |
| Notification notch | notificationRouter, glass | message tray, banner bin | — |
| Stage Manager | bus (`stage:changed`) | windows, workspaces, overview injections | — |
| Control Center | panelLayout, notificationRouter, glass | quick settings menu/indicators | — |
| Auto-hide top bar | bus (`panel:visibility`) | layout manager struts, hot edge | — |
| Window controls in panel | panelLayout | focus window, WM settings | — |
| Liquid Glass theme | lib/glass, blurBudget | `Shell.BlurEffect`, stylesheet classes | — |

Auto-hide bar and `apps/panelHover.js` / `apps/panelTransparency.js` must agree on
panel state → one owner of panel *visibility* (part of panelLayout or its own
coordinator), the others subscribe.

## 10. Migration plan

1. Add `lib/lifecycle.js`, `lib/signals.js`, `lib/timeouts.js`; use in new code only.
2. Add `FeatureHost` + `features.js` wrapping existing `enable/disable` exports
   unchanged; delete branches from `_on_settings_changed` one by one.
3. Introduce `panelLayout`; migrate window controls, window title, calendar badge.
4. Build new features (clipboard, notch, …) in the folder layout from day one.
5. Split large legacy modules (`appButtons.js`, `calendar.js`,
   `quickSettingsNotifications.js`) when touched for other reasons.
6. Add unit tests + CI step once the first `model.js` exists. Note `.gitignore` already
   ignores `tests/` (and `.c[a-z]*/`), so either use `test/` or adjust `.gitignore`.
7. Every new top-level source dir/file (`lib/`, `coordinators/`, `features.js`) must be
   added to `gnome-extensions pack --extra-source=...` in
   `.github/workflows/pack-release.yml`, or it will be missing from the release zip.

No big-bang rewrite: each step keeps the extension shippable on GNOME 48–51.
