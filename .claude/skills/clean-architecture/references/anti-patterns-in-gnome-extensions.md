# Anti-patterns in GNOME Shell extensions (with Kiwi examples)

Summary: recurring structural mistakes in extensions — global mutable state, unrestored
patches, orphaned timers, logic buried in widgets, blocking calls on the compositor
thread, order-dependent coordination — each with real `file:line` examples from this
repo (checkout of v2.3.1) and the fix. Not a blame list: much of the code is careful.

## Contents
1. God settings handler
2. Order-dependent coordination and timing hacks
3. Global mutable module state
4. Patching prototypes / instances without the InjectionManager
5. Timers and polling without a strong reason
6. Blocking calls in the Shell process
7. Logic inside widgets
8. Private Shell API scattered across modules
9. Feature-to-feature imports
10. Hand-rolled signal bookkeeping
11. Magic numbers for external enums
12. Good examples to copy

---

## 1. God settings handler

`extension.js:57-277` — `_on_settings_changed(key)` runs for *every* key change and
re-applies ~30 features, with special cases keyed on specific keys (`:60-69`, `:100-104`,
`:121-127`, `:269-276`). Consequences: O(features) work per keystroke in prefs; adding a
feature edits a shared method (open/closed violation); subtle interactions hidden in
branch order.

**Fix:** feature registry + host that subscribes to each feature's keys
(`kiwi-layering.md` §3). Idempotent `enable()` (which most modules already have) makes
the migration safe.

## 2. Order-dependent coordination

- `extension.js:121-127` — calendar re-enable moves `dateMenu` to the end of
  `_rightBox`, so window controls are torn down to be re-added after it.
- `apps/calendar.js:74-88` — notification badge inserted after a 500 ms timeout "to
  ensure all other indicators are added first".
- `extension.js:356-359` — downloads stack must be disabled before minimized-to-dock
  because it borrows the strip; correctness depends on a comment.

**Why bad:** ordering by timing is a race (slow machine, other extensions); ordering by
call sequence breaks the first time someone reorders lines.
**Fix:** a `panelLayout` coordinator with priorities; declare `after:` dependencies in
the registry so teardown order is computed.

## 3. Global mutable module state

`apps/calendar.js:11-26` (16 module-level `let`s), `apps/dockColors.js:71-83`,
`apps/downloadsStack.js:62-75`, `apps/launchpadApp.js:24-34`.

Module scope in ESM is a singleton for the life of the Shell process — it survives
`disable()`. Any variable not reset in `disable()` leaks into the next `enable()`, and
the state cannot be instantiated twice in a test.

```js
// before
let dateMenu, enabled = false, originalParent, originalParentIndex;
export function enable(ext) { … }

// after
export default class CalendarFeature {
    constructor(ctx) { this._ctx = ctx; }
    enable() { this._state = { originalParent: null, originalIndex: -1 }; … }
    disable() { …; this._state = null; }
}
```

## 4. Patching without the InjectionManager

`apps/overviewSeamlessZoom.js:143-149` replaces `Workspace.prototype._init` directly and
restores it at `:236-237` only if nobody else re-patched it in between (good guard, but
if another extension patched after us, our restore is skipped and our patch stays
live). `:152-157` replaces `_touchpadGesture.emit` on an instance and restores with
`delete` at `:243` — correct only because the original lives on the prototype.

**Fix:** use `InjectionManager.overrideMethod` (it saves/restores per prototype and
`clear()` asserts nothing is left — see gnome-shell `js/extensions/extension.js`), as
`apps/hideMinimizedWindows.js:22-30` and `apps/focusOnOverviewExit.js:76-79` do. Wrap
instance patches in a `lib/injections.js` helper that records the own-property
descriptor and restores it exactly.

Classic, worse variant (not present here): saving `_orig` in a module variable and never
restoring on disable, or restoring unconditionally over someone else's patch.

## 5. Timers and polling

- `apps/calendar.js:166-171` — a 5 s `GLib.timeout_add` "fallback periodic check" for
  notifications, alongside correct `source-added/removed` handlers (`:151-161`). It is
  cleaned up (`:112-118`), but it wakes the Shell every 5 s forever.
- `apps/dockBlur.js:294` and `apps/dockUtils.js:115` — 1 s polling to find the dock.

**Rules:** every source ID stored and removed in `disable()` (the repo is good at
this); prefer signals (`extension-state-changed`, `child-added`, `Meta.LaterType`)
to polling; if a poll is unavoidable, back off and stop after N tries.
Anti-pattern to watch for in new code: a `timeout_add` whose ID is not stored, or one
that captures `this` of a destroyed actor.

## 6. Blocking calls in the Shell process

`apps/batteryPercentage.js:52` — `proxy.call_sync('EnumerateDevices', …)` inside an
async init callback. A synchronous D-Bus round-trip blocks the compositor thread: if
UPower is slow, the whole desktop stalls (input, animation, frame clock).

**Fix:**

```js
Gio._promisify(Gio.DBusProxy.prototype, 'call');   // once, at module top
const reply = await proxy.call('EnumerateDevices', null,
    Gio.DBusCallFlags.NONE, -1, cancellable);
const [devices] = reply.deep_unpack();
```

(GJS's own overrides only promisify `init_async` on `Gio.DBusProxy`; gnome-shell's
`ui/environment.js` adds `DBusConnection.call`, `DBusProxy.new` and
`DBusProxy.call_with_unix_fd_list` but **not** `DBusProxy.prototype.call`, so do it
explicitly.)
Same rule for files (`load_contents_async`), subprocesses (`communicate_utf8_async`)
and any future Rust helper (`…Async` proxy methods only).

## 7. Logic inside widgets

`apps/appButtons.js` — `WindowControlsIndicator` (a `PanelMenu.Button`) owns
settings subscriptions (`:32-39`), WM-settings parsing (`:42-55`, `:177-208`), window
actions (`:119-140`), lock-screen handling (`:153-171`) and icon state. Pure logic like
`_parseButtonLayout` cannot be tested without constructing an St actor inside a Shell.

`apps/batteryPercentage.js:93-126` — threshold/state decisions intertwined with
animation calls.

**Fix:** move decisions to `model.js`, Shell calls to `shellAdapter.js`; the widget only
renders state and emits intents (`kiwi-layering.md` §4).

## 8. Private Shell API scattered

`Main.panel._rightBox/_leftBox/_centerBox`: `apps/appButtons.js:545-566`,
`apps/calendar.js:34,55,81,198-200`. `quickSettings._indicators`: five modules (see
`patterns-catalog.md` §2). `Main.messageTray._sources`: `apps/calendar.js:163`.
`Main.overview._swipeTracker._touchpadGesture`: `apps/overviewSeamlessZoom.js:153`.
`_delegate`: `apps/dockUtils.js:258,286-290`, `apps/launchpadApp.js:62`,
`apps/minimizedToDock.js:484`.

Private fields are the least stable API in the Shell. **Fix:** one adapter/facade per
private surface, `?.` guards, and a comment with the Shell source location and the
versions verified, so a GNOME bump is a one-file review.

## 9. Feature-to-feature imports

`apps/appButtons.js:14` imports `isMaximized/maximizeWindow/unmaximizeWindow` from
`apps/windowTiling.js`; `apps/panelMedia.js:10` imports from `apps/mediaPlayback.js`.
Shared *capabilities* belong in `lib/` (or `lib/pure/`); otherwise disabling or
refactoring one feature silently changes another.

## 10. Hand-rolled signal bookkeeping

`apps/appButtons.js:246-260` and `:511-533` track seven named handler IDs plus an
array; `destroy()` must remember each. One omission = a handler on a disposed object
("already disposed" warnings in the journal). **Fix:** `SignalTracker` per owner, plus
`disconnectFrom(window)` for per-focus-window handlers.

## 11. Magic numbers for external enums

`apps/batteryPercentage.js:110,115-120` — `state === 2` / `state === 1` for UPower
device states (comment explains, constant does not). **Fix:**
`const UPowerState = Object.freeze({ CHARGING: 1, DISCHARGING: 2 })` in the adapter,
model receives `{ charging: boolean }`.

## 12. Good examples to copy

- `apps/hideMinimizedWindows.js` — idempotent enable, all overrides on one
  `InjectionManager`, single `clear()`.
- `apps/panelStyling.js` — effects as CSS classes gated by one class name; trivially
  reversible.
- `apps/calendar.js:128-146` — per-source signal tracking that drops handles when a
  source is removed (avoids disconnecting dead objects).
- `apps/launchpadApp.js:24-25` — `_enabled` guard + `Gio.Cancellable` for async init that
  may outlive `disable()`.
- `apps/gtkThemeManager.js:4-7,12-20` — writes to user config inside marked, removable
  blocks only; cleans legacy output.

Sources: gnome-shell `InjectionManager` — https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/extensions/extension.js
and `js/ui/environment.js` (promisified methods) — https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/environment.js ;
GJS overrides — https://gitlab.gnome.org/GNOME/gjs/-/blob/master/modules/core/overrides/Gio.js ;
gjs.guide review guidelines ("Use disable() to cleanup anything done in enable()";
they recommend async/await but have no explicit sync-I/O rule) —
https://gjs.guide/extensions/review-guidelines/review-guidelines.html .
Line numbers verified against this checkout on 2026-10-25.
