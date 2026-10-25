# Apple architecture lessons for a GJS extension

Summary: ideas from SwiftUI, AppKit and Apple's extension model that suit
Kiwi: a single source of truth, state that renders the view, unidirectional
data flow, design tokens, and feature modules with explicit plug-in boundaries
like App Extensions and App Intents. Each idea has a concrete Kiwi example.
These are proposals, not existing code.

## Contents
1. Where Kiwi is today
2. Single source of truth (SwiftUI @State / @Observable)
3. State → view rendering and reconciliation
4. Unidirectional data flow (actions in, state out)
5. AppKit lessons: MVC, responder chain, window roles
6. Scenes ≈ surfaces
7. Plug-in boundaries: app extensions and App Intents
8. Design tokens and semantic colours as code
9. Lifecycle discipline
10. Suggested layout and a worked example
11. Sources

---

## 1. Where Kiwi is today

- `extension.js` imports about 37 `apps/*.js` modules, each exporting
  `enable()` / `disable()`, mostly with **module-level mutable state**.
- A single `changed` handler (`_on_settings_changed(key)`) re-evaluates many
  features on *any* key. Some modules get disabled and re-enabled to apply a
  change.
- Cross-feature knowledge is implicit. For example, the panel transparency,
  blur, styling and window-controls modules all touch `Main.panel` and the
  same classes.

This works, but new features such as glass everywhere, the island and Control
Center share state: glass tier, scheme, reduced motion and panel visibility.
They need a shared model.

## 2. Single source of truth

**Apple's idea:**
- Each piece of state has exactly one owner, such as `@State` or an
  `@Observable` model.
- Views *read* it, and children get bindings or derived values, never copies.
- Derived values are computed rather than stored.

**Kiwi:** a `KiwiStore`, a GObject with properties or a small signal emitter,
that owns *derived UI state*:

| Store property | Derived from |
|---|---|
| `glassTier` (`high`, `balanced`, `light`, `opaque`) | Kiwi glass keys, `high_contrast`, power profile, `enable_animations` |
| `motion` (`full`, `reduced`, `none`) | `enable_animations`, reduced-motion probe, Kiwi toggle |
| `scheme` (`dark`, `light`) | `color-scheme`, shell style |
| `panelVisible` | Auto-hide mode, pointer zone, fullscreen, overview, modal state |
| `activities[]` | Media, timers, downloads, calls, recording (island providers) |
| `clipboard[]` | Clipboard service (capped list, sensitive flags) |

Rules:
- GSettings stays the **persistent** truth, and the store is the **runtime**
  truth.
- Features never read `St.Settings` or other modules directly. They subscribe
  to the store.
- Never duplicate state in two modules, such as two "is panel hidden" flags.
  Panel visibility has one owner: the auto-hide controller.

## 3. State → view rendering and reconciliation

**Apple's idea:**
- `body` is a pure function of state. The framework diffs the result and
  applies minimal changes, so you don't write "on X changed, also fix Y".

**Kiwi:**
- Give each surface a `render(state)` that is **idempotent**. It sets classes,
  visibility and children from the state and nothing else.
- Example: `glass.render({tier, scheme})` toggles `.kiwi-glass-opaque`,
  `.kiwi-light` and so on, and creates or destroys the blur effect only when
  the tier crosses the blur boundary.
- Keep "what changed" logic out of features. The store emits
  `notify::glass-tier`, and every glass surface re-renders.
- Lists such as clipboard rows and search results use a **keyed diff**:
  reuse row actors by id, add or remove the difference, and reorder with
  `set_child_at_index`. This avoids destroying and rebuilding 50 St widgets on
  every keystroke.

## 4. Unidirectional data flow

**Apple's idea:**
- Views send actions, and the model mutates state.
- Views re-render, and nothing writes back sideways. TCA and Redux formalize
  this, and SwiftUI encourages it.

**Kiwi:**

```
user input / system signal ──► action(type, payload) ──► reducer/controller
        ▲                                                   │ mutates
        └──────────── render(state) ◄── store notify ◄──────┘
```

Concrete examples:
- The clipboard tracker sees a new owner-change and dispatches
  `clipboard/added {mime, text, sourceApp}`. The service dedups, caps, applies
  the sensitive filter and updates `clipboard[]`. Then the popover and Quick
  Paste both re-render.
- A Control Center tile dispatches `cc/toggle {id:'dnd'}`. The DND module
  writes GSettings, the change comes back through `changed::show-banners`,
  the store updates, and the tile re-renders. The tile never flips its own
  checked state optimistically unless it rolls back on failure.

## 5. AppKit lessons

| AppKit concept | Kiwi equivalent |
|---|---|
| **MVC**: NSViewController owns a view and talks to the model | One controller class per surface (`ControlCenterController`, `IslandController`) owns its actors, signals and timers |
| **Responder chain**: events go to the first responder and bubble up | Key events: the focused St actor goes first, then its container (`vfunc_key_press_event` returns `Clutter.EVENT_PROPAGATE`), then the surface controller, then the global keybinding. Esc is always handled by the topmost surface. |
| **Key / main / inactive windows** | `global.display.focus_window` is key. Traffic lights show colour only for the focused window and turn grey otherwise. |
| **Target–action** | `St.Button` `clicked` → `dispatch(action)`. Don't put logic in closures scattered across CSS-styled widgets. |
| **NSWindow vs NSPanel** | Main UI is a GNOME window. Kiwi surfaces are panels: they float, have no minimize, and hide when inactive. |
| **NSVisualEffectView / NSGlassEffectView content-in-glass** | A `GlassSurface` container that owns its blur. Content is its *child*. |

## 6. Scenes ≈ surfaces

**Apple's idea:**
- A *scene* is a unit of UI lifecycle (WindowGroup, MenuBarExtra, Settings).
  The system creates and destroys scenes, and they restore state.

**Kiwi:**
- Each top-level surface is a scene with an explicit lifecycle:
  `create → show(context) → hide → destroy`.
- Context includes the monitor index, the anchor actor and the opening source
  (keyboard or pointer).
- On monitor change, call `destroy` then `create`. Don't patch allocations in
  place.
- Remember per-scene state across opens, such as the last Quick Paste scope or
  an expanded CC module. Keep it in memory, or in GSettings if the user would
  expect it to persist.

## 7. Plug-in boundaries: app extensions and App Intents

**Apple's idea:**
- **App extensions** (widgets, Control Center controls, Spotlight importers)
  run behind a narrow, declared interface.
- **App Intents** describe actions with parameters, so Spotlight, Shortcuts,
  Siri and controls can all invoke them.

**Kiwi:** define three small registries so features plug in without editing
`extension.js`:

```js
// Feature module contract
export default {
  id: 'clipboard',
  settingsKeys: ['clipboard-enabled', 'clipboard-size'],
  enable(ctx) {},            // ctx = {store, dispatch, settings, gettext, tokens}
  disable() {},              // must remove everything it added
};

// Island activity provider (≈ Live Activity / ActivityKit)
registerActivityProvider({ id: 'media', priority: 50, start(ctx) {}, stop() {} });
// emits: ctx.update({id, compact:{leading, trailing}, expanded, progress?, endsAt?})

// Action / intent (≈ App Intents), invocable from Search, CC tiles and shortcuts
registerAction({ id: 'kiwi.clipboard.clear', title: _('Clear Clipboard History'),
                 icon: 'edit-clear-all-symbolic', params: {}, perform: ctx => {} });

// Search provider (≈ Spotlight importer). Same shape as GNOME's SearchProvider.
registerSearchProvider({ id: 'clipboard', scope: 'clipboard', getResults(terms) {} });
```

Benefits:
- Kiwi Search lists actions for free, the way Spotlight actions come from App
  Intents.
- CC tiles can bind to an action id.
- Keybindings map to action ids.
- Third-party Kiwi add-ons are possible later.

## 8. Design tokens and semantic colours as code

**Apple's idea:**
- Dynamic system colours are named by **role** (labelColor, separatorColor),
  not by value.
- They resolve differently for light, dark and increased contrast.

**Kiwi:**
- `lib/tokens.js` exports durations, radii, spacing and alpha roles (see the
  SKILL.md table).
- JavaScript reads `TOKENS.motion.standard`. CSS uses the same values, with a
  comment pointing back to tokens.js. St CSS has no variables, so keep a
  **single generated block**, or keep both in one PR.
- Mode variants are CSS classes on a root: `.kiwi-light`, `.kiwi-hc` and
  `.kiwi-opaque`, applied to `Main.layoutManager.uiGroup` children Kiwi owns.
  Never put them on global shell actors you don't own.
- Ban magic numbers in features. Review rule: a new px or ms literal outside
  tokens.js needs a comment.

## 9. Lifecycle discipline

GNOME's EGO review requires a clean `disable()`. Apple's model, where scenes
and extensions are torn down by the system, suggests these rules:

- Every `connect` goes through `connectObject(..., this)` and is paired with
  `disconnectObject(this)`.
- Every `GLib.timeout_add` id is stored and removed. Every actor added to a
  global parent is destroyed. Every `Main.pushModal` has a matching pop.
- Every effect added to a shell-owned actor is removed by name.
- Monkey-patches use `InjectionManager` (GNOME 45+) and are restored in
  `disable()`.
- Features must survive `enable → disable → enable` without leaks. Test by
  toggling each key 20 times and checking `global.stage` children count and
  Looking Glass for leaked actors.

## 10. Suggested layout and a worked example

```
lib/store.js        KiwiStore (GObject props: glassTier, motion, scheme, panelVisible…)
lib/tokens.js       durations, radii, spacing, alpha roles
lib/registry.js     features, actions, activity & search providers
lib/glass.js        GlassSurface widget (blur + tint + rim + highlight, renders from store)
features/<id>/index.js   feature module contract (§7)
apps/*.js           existing modules, migrated gradually behind the same contract
```

Worked example: **high contrast turns on.**
1. `St.Settings` `notify::high-contrast` reaches the store reducer, which sets
   `glassTier = 'opaque'`.
2. Store `notify::glass-tier` fires, and every `GlassSurface.render()` removes
   its blur effect and adds `.kiwi-opaque`.
3. The island, CC and Quick Paste don't contain any high-contrast code. They
   only consume tokens and classes.
4. When high contrast turns off, the tier is recomputed from the Kiwi keys and
   power profile, and the blur is recreated with the repaint hack attached.

Migration tip: wrap existing `enable`/`disable` pairs in the contract first,
with no behaviour change. Then replace the big `_on_settings_changed` with a
key → feature-id map built from `settingsKeys`, so a change re-applies only the
features that declared that key.

## 11. Sources

- SwiftUI data flow, "Managing model data in your app": https://developer.apple.com/documentation/swiftui/managing-model-data-in-your-app
- Observation (`@Observable`): https://developer.apple.com/documentation/observation
- WWDC20 "Data Essentials in SwiftUI": https://developer.apple.com/videos/play/wwdc2020/10040/
- AppKit responder chain, "Event Architecture" (archived guide): https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/EventOverview/EventArchitecture/EventArchitecture.html
- Scenes: https://developer.apple.com/documentation/swiftui/scenes
- App Intents: https://developer.apple.com/documentation/appintents ; App extensions: https://developer.apple.com/app-extensions/
- HIG Color, dynamic system colours: https://developer.apple.com/design/human-interface-guidelines/color
- GNOME Shell extension review guidelines: https://gjs.guide/extensions/review-guidelines/review-guidelines.html
- Note: the URLs above are canonical Apple doc paths, not all re-fetched in this research pass. **[verify links]**
