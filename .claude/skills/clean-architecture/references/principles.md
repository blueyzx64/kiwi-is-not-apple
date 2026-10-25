# Principles, mapped onto a GNOME Shell extension

Summary: SOLID, the dependency rule, boundaries, ports & adapters and functional core /
imperative shell, each restated for GJS code that lives inside gnome-shell. The big
inversion: in Kiwi the "database and web framework" is the Shell itself.

## Contents
1. Clean Architecture rings, Kiwi edition
2. The dependency rule
3. Boundaries and what crosses them
4. Ports & adapters
5. Functional core, imperative shell
6. SOLID, one paragraph each
7. Lifecycle as a first-class concern
8. When *not* to abstract

---

## 1. Rings, Kiwi edition

| Martin's ring | Meaning | Kiwi equivalent |
|---|---|---|
| Entities | Enterprise rules, stable | Domain values: `ClipEntry`, `PanelSlot`, `NotificationDecision`, `GlassStyle` |
| Use cases | Application rules | `model.js` functions: "should the bar hide?", "which stage group gets this window?" |
| Interface adapters | Convert data between use cases and outside | `view.js` (state → St actors), `shellAdapter.js` (Shell signals → model events), `settings.js` (GSettings → config) |
| Frameworks & drivers | Details | gnome-shell JS (`Main`, `ui/*.js`), Mutter/Clutter/St via GI, GSettings, D-Bus, Rust helpers |

## 2. The dependency rule

> Source code dependencies can only point inwards. (Martin, 2012)

Concretely, in `apps/<feature>/model.js`:

```js
// allowed
import { clamp } from '../../lib/pure/math.js';
// forbidden in model.js
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { enable as tilingEnable } from '../windowTiling.js';
```

Data crossing inward is plain JS (numbers, strings, frozen objects), never a
`Meta.Window` or actor. If a model needs "the focused window's rect", the adapter
passes `{x, y, width, height, maximized, fullscreen}`.

An outer layer may depend on an inner one: `view.js` imports model constants.
Inner layers call outward only through an interface they own (a port) — in JS that is a
documented object shape passed into the constructor.

## 3. Boundaries

Bernhardt's "Boundaries" talk: use **simple values** as the interface between
components; keep mutation and I/O at the edges. For Kiwi this gives four boundary types:

| Boundary | Crosses as | Example |
|---|---|---|
| Shell → feature | adapter callbacks with plain snapshots | `onFocusChanged({ wmClass, fullscreen })` |
| Settings → feature | frozen config object | `{ hideDelayMs: 300, fullscreenOnly: true }` |
| Feature → feature | events on the bus, or coordinator requests | `bus.emit('stage:changed', {...})` |
| Extension → helper | D-Bus interface (versioned XML) | `Clipboard1.List(u) → a(tssx)` |

## 4. Ports & adapters

Cockburn's aim: an application "equally driven by users, programs, automated test or
batch scripts, and developed and tested in isolation from its eventual run-time
devices". Kiwi ports:

| Port (owned by feature) | Production adapter | Test adapter |
|---|---|---|
| `HistoryStore` (`add`, `list`, `remove`) | `HelperStore` (D-Bus → Rust) / `MemoryStore` | array |
| `WindowSource` (`windows()`, `onChanged`) | `shellAdapter` over `global.display` | fake emitter |
| `PanelSlots` (`request(id, side, priority)`) | `coordinators/panelLayout.js` | records calls |
| `Clock` (`now()`, `after(ms, fn)`) | `lib/timeouts.js` (GLib) | manual clock |

Driving side (input): Shell signals, keybindings, settings changes.
Driven side (output): actors, injections, D-Bus calls, CSS classes.

## 5. Functional core, imperative shell

```js
// apps/autoHideBar/model.js — functional core
export function barVisibility(state, cfg) {
    if (state.overview) return 'shown';
    if (cfg.fullscreenOnly && !state.focusFullscreen) return 'shown';
    if (state.pointerAtTopEdge || state.menuOpen) return 'shown';
    return state.windowOverlapsBar ? 'hidden' : (cfg.hideAlways ? 'hidden' : 'shown');
}
```

```js
// apps/autoHideBar/index.js — imperative shell
const next = barVisibility(adapter.snapshot(), config);
if (next !== current) view.animateTo(next);
```

All branches are testable with a table of inputs. The shell has almost no branches.
Compare `apps/batteryPercentage.js:93-126`, where the decision (`percentage ===
BATTERY_TRIGGER_PERCENTAGE && state === 2`) and the animation live in one method.

## 6. SOLID

- **S — Single responsibility.** "One reason to change." `view.js` changes for design,
  `shellAdapter.js` for a GNOME release, `model.js` for behaviour. `apps/windowControls.js`
  currently changes for all three.
- **O — Open/closed.** Adding a feature should add a file to `features.js`, not edit a
  577-line conditional. `extension.js:57-277` violates this today.
- **L — Liskov.** Every `HistoryStore` adapter honours the same contract (ordering,
  dedupe), so the model cannot tell memory from helper. Contract tests enforce it.
- **I — Interface segregation.** Give a feature only what it uses: `ctx.panelLayout`, not
  `Main`. Small ports keep fakes small.
- **D — Dependency inversion.** The model defines `HistoryStore`; the D-Bus adapter
  implements it. `index.js` is the only place that picks the concrete one.

## 7. Lifecycle

GNOME Shell's extension contract: `enable()` may be called many times per session
(lock/unlock), and `disable()` must undo everything `enable()` did (gjs.guide review
guidelines; unverified exact wording). Architecturally this means:

- Effects are *owned* — each has a registered undo at creation time (DisposableStack).
- Teardown order is the reverse of setup order, automatically (LIFO stack).
- Cross-feature teardown constraints (e.g. `extension.js:356-359`, downloads stack must
  release the minimized strip first) are expressed as explicit dependencies in
  `features.js`, not as a comment plus manual ordering.

## 8. When not to abstract

- Tiny cosmetic features (e.g. `apps/panelStyling.js`, 25 lines; `apps/hideActivitiesButton.js`)
  can stay single-file. Rule: split when a module has logic worth testing *or* touches
  private Shell API in more than one place.
- Do not invent ports for things with one adapter and no test value.
- Do not build an event bus for direct parent→child calls inside a feature.

Sources: Martin, "The Clean Architecture", https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
(quote via secondary sources; not fetched); Martin, *Clean Architecture* (2017);
Cockburn, "Hexagonal architecture", https://alistair.cockburn.us/hexagonal-architecture/
(quote via https://herbertograca.com/2017/09/14/ports-adapters-architecture/);
Bernhardt, "Boundaries", https://www.destroyallsoftware.com/talks/boundaries ;
SOLID — Martin, *Agile Software Development: Principles, Patterns, and Practices* (2002).
