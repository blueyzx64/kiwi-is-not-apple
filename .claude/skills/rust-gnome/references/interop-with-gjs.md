# Interop between Kiwi (GJS) and Rust helpers

Summary: the extension and a helper share nothing but a versioned D-Bus interface.
Design the XML first, keep one adapter file per helper on the GJS side, let the bus
activate the helper, and make every helper-backed feature degrade gracefully.

## Contents
1. Responsibility split
2. Contract-first workflow
3. Interface design rules
4. Versioning and evolution
5. Lifecycle: activation, watching, shutdown
6. Degraded mode (helper missing)
7. Sandbox and security
8. Worked example: clipboard history
9. Worked example: Spotlight file index

---

## 1. Responsibility split

| Concern | Owner |
|---|---|
| Reading the clipboard, showing UI, keybindings, St widgets | Extension (GJS, in Shell) |
| Persisting / deduping / searching / thumbnailing | Helper (Rust, out of process) |
| Settings UI | `prefs.js` (libadwaita, separate process already) |
| Settings values | GSettings (extension schema); pushed to helper over D-Bus |

The Shell never waits on the helper for anything frame-critical (e.g. the popup opens
with the in-memory recent list; persisted older items stream in).

## 2. Contract-first workflow

1. Write `helpers/dbus/io.github.kem_a.Kiwi.<Name>1.xml` with docs in `<!-- -->` or
   `<annotation name="org.gtk.GDBus.DocString" .../>`.
2. Review it as an API (it is one).
3. Implement `#[interface]` in Rust to match; implement the GJS adapter loading the
   same XML (copy into `apps/<feature>/dbus.js` at build time, or keep a single string
   constant and a test that compares it).
4. Contract test: introspect the running helper and diff with the XML
   (see `dbus-with-zbus.md` §7). Run it in CI under `dbus-run-session`.

## 3. Interface design rules

- Coarse-grained calls: `List(limit)` not N × `Get(i)`. Each call is a context switch
  for the compositor.
- Fixed types: prefer structs (`a(tssx)`) over `a{sv}` except for extensible option
  bags (`a{sv}` "options" arg is a good forward-compat hook).
- Ids in signals, data via methods; no sensitive payloads in broadcast signals.
- Idempotent writes where possible (`AddText` with content hash dedupes).
- Big blobs via fd (`h`) or file path in the helper's data dir, not `ay`.
- A read-only `Version` (u) property with the interface revision.

## 4. Versioning

- **Additive** change (new method, new optional key in `a{sv}`, new signal) → same
  interface name, bump `Version` property. Clients check `Version >= n` before using it.
- **Breaking** change (signature or semantics) → new interface `...Clipboard2` served
  side by side on the same object for at least one release; extension prefers 2,
  falls back to 1.
- The bus name never changes. Object paths are stable.
- Record the supported range in the extension: `const HELPER_MIN = 1, HELPER_MAX = 2`.

## 5. Lifecycle

**Preferred: D-Bus activation.** Install `io.github.kem_a.Kiwi.Clipboard.service`
(see packaging reference). The first method call auto-starts the helper; the helper
exits after N minutes idle and is restarted on the next call. No supervision code in
the extension.

**Watch, do not poll:**

```js
// lib/helperWatcher.js
import Gio from 'gi://Gio';

export function watchHelper(name, { onAppeared, onVanished }) {
    const id = Gio.bus_watch_name(Gio.BusType.SESSION, name,
        Gio.BusNameWatcherFlags.AUTO_START,     // triggers activation if installed
        () => onAppeared(), () => onVanished());
    return { destroy: () => Gio.bus_unwatch_name(id) };
}
```

**Startup race:** `enable()` must not await the helper. Create the proxy
asynchronously; until it resolves the feature runs in degraded mode.

**Shutdown:** `disable()` cancels the `Gio.Cancellable`, disconnects proxy signals,
unwatches the name. It does not kill the helper (it may serve other clients and will
idle-exit). If the extension *spawned* the helper itself (fallback when no service
file can be installed), it must `force_exit()` the `Gio.Subprocess` on disable — and
note that spawning from the Shell is a review-sensitive pattern.

**Shell restarts / lock screen:** extensions without `unlock-dialog` in
`session-modes` are disabled on lock and re-enabled on unlock; the helper survives, so state persists — one reason to have it.

## 6. Degraded mode

| Helper state | Clipboard history | Spotlight files |
|---|---|---|
| Not installed | In-memory ring buffer (lost on Shell restart); prefs shows "Install kiwi-helpers for persistence" | File results hidden; apps/settings still searched in GJS |
| Installed, `Version` too old | Same as not installed + log once | Same |
| Running | Full | Full |

Express this as a port in the feature's model (`HistoryStore` with `MemoryStore` and
`HelperStore` adapters) — see the clean-architecture skill.

## 7. Sandbox and security

- Session bus is per-user but **any** process of that user can call the helper. Do not
  expose destructive methods without validation. If a method must be restricted, the
  bus's `org.freedesktop.DBus.GetConnectionCredentials(sender)` returns the caller's
  UnixUserID/ProcessID (D-Bus spec); a design choice — not needed for v1.
- Store data in `$XDG_STATE_HOME/kiwi/` (history) or `$XDG_CACHE_HOME/kiwi/` (index),
  mode 0600. Offer "Clear history" and honour a GSettings "pause" key.
- Respect password managers: skip entries whose source app sets the
  `x-kde-passwordManagerHint` mime (a convention, not a standard — verify which apps use it).
- Flatpak helper: see packaging reference for filesystem permissions trade-offs.

## 8. Worked example: clipboard history

```
Shell (GJS)                                   kiwi-clipboardd (Rust)
apps/clipboard/shellAdapter.js
  Meta.Selection 'owner-changed' ──► model.js decides "record?"
                                       └──► helperClient.AddTextAsync(text, mime) ──► store.push()
popup opens ──► model.recent() (memory)                                  │
            └─► helperClient.ListAsync(50) ◄──────────────────────────────┘
helper signal EntryRemoved(id) ──► model.remove(id) ──► view.js re-renders
```

Interface sketch: `AddText(s text, s mime) → t id`, `AddImage(h fd, s mime) → t id`,
`List(u limit) → a(tssx)`, `Search(s query, u limit) → a(tssx)`, `Remove(t id)`,
`Clear()`, property `MaxEntries u rw`, `Version u r`, signal `EntryRemoved(t)`.

## 9. Worked example: Spotlight file index

First choice: query LocalSearch (formerly Tracker Miners; renamed in 3.8.alpha,
first stable 3.8.0 = GNOME 47, Sept 2024) over its own D-Bus/SPARQL endpoint; no helper needed. Only
if that is unavailable or too slow, `kiwi-indexd` offers
`Query(s text, u limit, a{sv} options) → a(sssd)` (uri, display name, mime, score) and
a `Reindex()` method, using `notify`-style inotify watching plus a fuzzy matcher.
The Shell side implements a search provider in GJS that calls `QueryAsync` with a
cancellable per keystroke (cancel the previous one).

Sources: freedesktop D-Bus specification (activation, naming) —
https://dbus.freedesktop.org/doc/dbus-specification.html ;
gtk-rs book *Building with Meson* (service file, `DBusActivatable`) —
https://gtk-rs.org/gtk4-rs/stable/latest/book/meson.html ; GJS `Gio.bus_watch_name`
and `makeProxyWrapper` — https://gjs.guide/guides/gio/dbus.html ; session modes ("when
the session mode changes between user and unlock-dialog, GNOME Shell may call disable()
and enable()") — https://gjs.guide/extensions/topics/session-modes.html ; LocalSearch
rename — https://gitlab.gnome.org/GNOME/localsearch/-/blob/main/NEWS .
