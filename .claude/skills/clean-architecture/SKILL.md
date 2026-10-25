---
name: clean-architecture
description: Use when adding, restructuring or reviewing a Kiwi (is not Apple) feature module (apps/*.js, extension.js, prefs.js, shared lib/), when two features fight over the same Shell UI (panel slots, notifications, blur), when deciding where logic vs. Shell API calls belong, or when planning tests. Applies Clean Architecture, ports & adapters and functional-core/imperative-shell to a GJS GNOME Shell extension. Planned features this targets: clipboard history, Spotlight search, notification notch, Stage Manager, Control Center, auto-hide top bar, window controls in panel, Liquid Glass blur.
---

# Clean architecture for Kiwi

Kiwi today: `extension.js` imports ~33 `apps/*.js` modules, each exporting
`enable()/disable()` and holding module-level state. One handler
(`extension.js:57-277`) re-evaluates every feature on every settings change, and
features coordinate by ordering tricks (`extension.js:121-127`, `apps/calendar.js:74-88`).
That works at 30 features; it will not survive Stage Manager + Control Center +
notch + auto-hide bar all touching the panel and overview.

## Principles, condensed

1. **Dependency rule** (Martin): source dependencies point inward. Pure feature logic
   never imports `gi://`, `Main`, or another feature.
2. **GNOME Shell is the framework/driver ring.** `Main`, `St`, `Clutter`, `Meta`, private
   `_fields` and prototypes are details. Touch them only in adapters.
3. **Ports & adapters** (Cockburn): a feature states what it needs ("a slot in the panel",
   "notifications stream", "a history store"); adapters bind that to Shell internals,
   GSettings, or a Rust helper over D-Bus.
4. **Functional core, imperative shell** (Bernhardt): decisions are pure functions over
   plain values (`model.js`); side effects (actors, signals, timers) sit in a thin shell.
5. **Every effect is reversible.** `disable()` must restore the Shell exactly; this is
   the extension equivalent of a transaction. Register cleanups as you create effects.
6. **Mediate shared resources.** Panel layout, notification routing and blur/glass
   effects each get one coordinator; features request, coordinators arbitrate.
7. **Configuration is a port.** GSettings is read in one place per feature and turned
   into an immutable config object; models never see `Gio.Settings`.
8. **Version differences are strategies**, selected once at enable time, not `if`s
   scattered through logic.

## Proposed Kiwi layering

```
extension.js            composition root: build context, register features, nothing else
lib/                    shared infrastructure (no feature knowledge)
  lifecycle.js          DisposableStack: add(fn), signals, timeouts, injections, dispose()
  injections.js         wrapper over Shell's InjectionManager (+ instance patches)
  settings.js           snapshot(keys) -> plain object, onChanged(keys, cb), bindings
  shellVersion.js       major version + strategy picker
  glass.js              Liquid Glass style/blur helpers (St classes, Shell.BlurEffect)
  eventBus.js           tiny typed pub/sub for cross-feature *events* only
coordinators/
  panelLayout.js        owns ordering of left/center/right panel slots
  notificationRouter.js decides banner vs notch vs Control Center vs drop
apps/<feature>/
  index.js              enable(ctx)/disable(): wires settings+model+view+adapter
  model.js              pure state + decisions; runs under plain gjs or node
  view.js               St/Clutter widgets; renders state, emits user intents
  shellAdapter.js       every Main.*, private field and prototype override
  settings.js           GSettings keys -> config object for this feature
features.js             registry: id, enable key, requires (e.g. dock), factory
```

Allowed imports: `index → {model, view, shellAdapter, settings, lib, coordinators}`;
`view → {model types, lib/glass}`; `shellAdapter → {lib}`; `model → nothing`
(except other pure helpers); `coordinators → lib`. Features never import features.

## Checklist: adding a feature module

- [ ] Add schema keys in `schemas/org.gnome.shell.extensions.kiwi.gschema.xml`; one
      boolean enable key + config keys. Add rows in `prefs.js` via existing helpers
      (`_addSwitchRows`, `_createEnumComboRow`).
- [ ] Create `apps/<feature>/` with the five files; start from `model.js` + its tests.
- [ ] `model.js` has no `gi://` or `resource://` imports; exports pure functions/classes.
- [ ] All Shell touch-points live in `shellAdapter.js` with a comment naming the Shell
      file/function they depend on and the GNOME versions verified (48–51 today).
- [ ] Overrides go through `InjectionManager`, never raw `X.prototype.m = …`.
- [ ] Every `connect`, `timeout_add`, `idle_add`, `add_child`, style class, injection and
      D-Bus proxy is registered on the feature's `DisposableStack` at creation time.
- [ ] Panel UI goes through `ctx.panelLayout.request(...)`; notifications through
      `ctx.notificationRouter`. No `Main.panel._rightBox.insert_child_at_index` in features.
- [ ] `enable()` is idempotent and does not await I/O; `disable()` restores everything,
      even if `enable()` failed half-way.
- [ ] Register in `features.js`; do not add a branch to `_on_settings_changed`.
- [ ] No synchronous D-Bus/file I/O; no polling where a signal exists.
- [ ] Unit tests for model; manual matrix run in a nested/devkit shell (lock/unlock,
      disable/enable ×3, monitor hotplug, overview, fullscreen).
- [ ] Optional Rust helper? Follow the `rust-gnome` skill; feature must work without it.

## Decision table → references

| Question | Read |
|---|---|
| What exactly do SOLID / dependency rule / boundaries / functional core mean here? | `references/principles.md` |
| Where does this file go? How do features talk? Who owns the panel? Migration plan? | `references/kiwi-layering.md` |
| How do I test pure logic, D-Bus contracts, and Shell behaviour? | `references/testing-strategy.md` |
| Which pattern (adapter, facade, observer, strategy, feature flag, disposables)? | `references/patterns-catalog.md` |
| Is this code smell a known problem? Real examples in this repo | `references/anti-patterns-in-gnome-extensions.md` |

## Quick rules of thumb

- If a function can take values and return values, it belongs in `model.js`.
- If it names a private Shell field (`_rightBox`, `_indicators`, `_sources`), it belongs
  in `shellAdapter.js` — and should be guarded with `?.` and a version note.
- If two features need the same actor, introduce or extend a coordinator; do not
  sequence their enables.
- If you are adding a timeout to "wait for the Shell", look for a signal or
  `Meta.LaterType` first.

## Sources

- R. C. Martin, "The Clean Architecture" (2012): https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html ; *Clean Architecture* (2017, ISBN 9780134494166). Not fetched this session (host blocked); content from the book and secondary summaries.
- A. Cockburn, "Hexagonal Architecture" (2005): https://alistair.cockburn.us/hexagonal-architecture/ (not fetched; URL unverified).
- G. Bernhardt, "Boundaries" talk: https://www.destroyallsoftware.com/talks/boundaries ; "Functional Core, Imperative Shell" screencast (DAS season 4).
- GNOME Shell `InjectionManager`: https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/extensions/extension.js (read via GitHub mirror).
- gjs.guide extension docs & review guidelines: https://gjs.guide/extensions/ (unverified this session).
