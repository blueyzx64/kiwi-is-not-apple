# Vala pitfalls and review checklist

Summary: most Vala bugs are C bugs in disguise: hidden refcount cycles,
dangling `weak`/`unowned` pointers, name clashes in generated C, and API that
looks fine in Vala but is wrong through GObject Introspection. Items marked
**(verified)** were reproduced with valac 0.56.16 / gjs 1.80 in this sandbox.

## Contents
1. Names and generated C
2. Memory and lifetime
3. Construction and properties
4. Errors and async
5. GIR / GJS boundary
6. GTK4 / GIO specifics
7. Build and toolchain
8. Review checklist
9. Sources

## 1. Names and generated C

| Pitfall | Symptom | Fix |
|---|---|---|
| Top-level function named like libc (`div`, `abs`, `index`, `time`) **(verified)** | C error "conflicting types for 'div'" | Put functions in a namespace or rename. |
| Own type named `Source`, `Error`, `Object`, `File`… **(verified)** | "The name `remove' does not exist in the context of `Source'" — shadows `GLib.Source` | Use specific names (`ScanSource`) or fully qualify `GLib.Source.remove`. |
| Local variable named like an inherited method (`var quit = …` in an `Application`) **(verified)** | "invocation not supported in this context" | Rename (`quit_action`). |
| Digit separators `60_000` **(verified)** | "The name `60_000' does not exist" | Write `60000`. |
| `string.length` assumed to be characters | Broken slicing of non-ASCII text | `char_count ()`, `index_of_nth_char ()`, `get_char ()`. |

## 2. Memory and lifetime

| Pitfall | Why | Fix |
|---|---|---|
| Any lambda in an instance method owns `this` **(verified)** — even if it never uses `this` | Closure block does `g_object_ref (self)`; a repeating `Timeout`/`Idle` or a signal on a long-lived emitter keeps the object alive forever, `dispose`/`~Foo` never run | Keep source ids and remove them in an explicit `stop ()`; build long-lived closures in a `static` method capturing a `WeakRef`; prefer method handlers. |
| Method signal handlers **(verified)** | `emitter.sig.connect (this.on_sig)` → `g_signal_connect_object`: no ref, auto-disconnect | This is the *safe* default — prefer it. |
| `weak` field assumed to become null **(verified)** | It is a raw pointer; no `g_object_add_weak_pointer` | Use `GLib.WeakRef` when the target may die first. |
| Copying a `GLib.WeakRef` by value (e.g. `owned WeakRef` parameter) **(verified: hang)** | `GWeakRef` registers its own address | Create it where it lives; pass the object instead. |
| `unowned Foo x = new Foo ();` | Temporary freed at end of statement | Keep it owned. |
| Property getter returning a new value | Getters are unowned → dangling | `owned get { … }` or make it a method. |
| Dropping a `FileMonitor`/`DBusProxy`/`Settings` you connected to | Finalized → signals stop silently | Store it in a field. |
| Not removing sources on shutdown | Callbacks on finalized objects (if unowned data), or leaks | `Source.remove (id)`; `cancellable.cancel ()`. |

## 3. Construction and properties

- Logic in a Vala constructor body beyond `Object (...)` is **skipped** when the
  object is created by GJS (`new Kiwi.Foo({...})`), GtkBuilder or
  `Object.new ()` **(verified: `new Thing()` in GJS ran `construct {}` but not
  the constructor body; `Thing.new()` ran both)**. Put it in `construct { }`.
- `construct`-only properties must be passed in `Object (...)`.
- Custom setters always notify unless you return early; auto-properties
  already skip unchanged values **(verified via `valac -C`)**.
- Reading a property in `construct {}` of a base class that a subclass sets
  later: order is base-class construct → subclass construct.

## 4. Errors and async

- Calling a `throws` method without `try` is only a **warning**; at runtime the
  error becomes a `critical` and the method continues with garbage. Use
  `--fatal-warnings`.
- `error ()` aborts the whole process — never in a service; use `critical`/`warning`.
- `new GLib.Settings ("id")` with a schema that is not installed **aborts the
  process** **(verified: "GLib-GIO-ERROR: Settings schema … is not installed")**. For the extension's schema use
  `SettingsSchemaSource.from_directory` + `Settings.full`, and check
  `lookup ()` for null.
- Forgetting a main loop: async callbacks, D-Bus replies, timeouts never fire.
- `foo.begin ()` without `.end ()` swallows errors; always pass a callback that
  calls `.end ()` inside `try`.
- Vala D-Bus proxy methods declared without `async` are synchronous and block
  the main loop.
- `Bus.own_name` "name lost" also fires when the bus connection could not be
  made; quit cleanly instead of spinning.
- Treat `IOError.CANCELLED` as non-error on shutdown.

## 5. GIR / GJS boundary

| Pitfall | Result | Fix |
|---|---|---|
| Default argument values **(verified)** | GJS: "At least 1 argument required" | Overloads with distinct names, or a no-arg variant. |
| `--gir=Name-Ver.gir` ≠ Vala namespace **(verified)** | GIR namespace taken from file name | Keep them identical. |
| Two top-level namespaces **(verified)** | Hard error | One namespace per library. |
| No `--shared-library` to `g-ir-compiler` **(verified: GIR lacks the attribute)** | typelib loads, every call fails to resolve | Always pass it (versioned soname). |
| Non-nullable param receives `null` from JS | GJS throws | Mark `?`. |
| `[Compact]`, generics, Gee, struct-with-pointers in public API | Not introspectable / leaks | GObject classes, `string[]`, `ListModel`, `Variant`. |
| Typelib loaded into gnome-shell | Extension rejected; crash kills session | Out-of-process helper + D-Bus. |

## 6. GTK4 / GIO specifics

- `[GtkChild]` fields must be `unowned`; names must match `id`s; enable
  `--gresources` so mismatches fail at compile time.
- `[GtkCallback]` methods are needed for `<signal handler=…>` in templates.
- `Gtk.StyleContext.add_provider_for_display` warns as deprecated in Vala (the
  vapi marks the class) although the C function is not deprecated **(verified)**.
- No GTK_MODULES in GTK4 **(verified)** — you cannot inject code into other
  GTK4 apps. Window positioning/raising is impossible on Wayland.
- Worker threads must not touch widgets or exported D-Bus objects; return to
  the main context with `Idle.add`.
- `FileCreateFlags.PRIVATE` for user data files; `replace_contents` for
  atomic writes.

## 7. Build and toolchain

- Generated C produces many C warnings **(verified)**; GCC ≥ 14 makes
  `incompatible-pointer-types` an error by default (GCC 14 porting notes;
  **unverified** against every valac release). Use `-w` for C or
  `-Wno-error=incompatible-pointer-types`, and `--fatal-warnings` for Vala.
- valac versions differ by distro (0.56 is the long-lived series; newer
  features may need `--target-glib`). Pin `meson_version` and dependency
  versions (`libadwaita-1 >= 1.4` for `ToolbarView`, `>= 1.5` for `AboutDialog`).
- `g-ir-scanner` is Python; a mismatched system Python breaks it (seen here:
  `No module named 'giscanner._giscanner'` with Python 3.13 vs a 3.12 build).
  Vala's own `--gir` does not need g-ir-scanner — one more reason to prefer it.

## 8. Review checklist

- [ ] Out-of-process only; extension works without the helper.
- [ ] Every `Timeout`/`Idle`/lambda `connect` has a matching remove/disconnect.
- [ ] No lambda in an instance method used as a long-lived callback without a
      stop path; `WeakRef` used where targets may die.
- [ ] No `weak` field that can outlive its target.
- [ ] All `throws` handled; no `error ()` in services; cancellations quiet.
- [ ] Logic lives in `construct {}`; constructors only `Object (...)`.
- [ ] D-Bus: versioned interface name, input size limits, `DBusError` replies,
      no sync proxy calls in UI code, signals documented in committed XML.
- [ ] GIR: one namespace, file name matches, no default args, nullability
      marked, typelib built with `--shared-library`.
- [ ] GSettings schema lookup cannot abort the process.
- [ ] Builds with `--fatal-warnings`; tested under `G_DEBUG=fatal-criticals`;
      no leaks under `valgrind --leak-check=full` or `-Db_sanitize=address`.

## 9. Sources

- docs.vala.dev tutorial ch. 3–4, memory-management guide (`vala-lang/vala-docs`)
- GSettings constructor docs: https://docs.gtk.org/gio/ctor.Settings.new.html
- GCC 14 porting notes: https://gcc.gnu.org/gcc-14/porting_to.html (**unverified** here)
- Reproductions: valac 0.56.16, gjs 1.80.2, GLib 2.80, GTK 4.14 (Ubuntu 24.04).
