---
name: vala
description: Use when writing, reviewing, building or debugging Vala code for Kiwi (is not Apple) — out-of-process GNOME helpers such as a small D-Bus service (clipboard persistence, file search), a GTK4/libadwaita helper app, or a GObject library exported as a GIR/typelib so GJS (prefs.js or a helper) can import it. Covers language basics, GObject classes/signals/properties, async + GIO + D-Bus, ownership (owned/unowned/weak), GTK4/Adw templates, meson + valac + GIR, and pitfalls. Do NOT use for code loaded into gnome-shell itself (that is GJS only) or for the GTK3 C module in advanced/ (use c-gobject).
---

# Vala in the GNOME ecosystem (for Kiwi)

Vala compiles to C that uses GObject; every Vala class is a real GType, so the
output is a normal C library/executable that GJS can consume through GObject
Introspection or talk to over D-Bus. Toolchain verified locally 2026-10-25:
`valac 0.56.16`, `meson 1.3.2`, GLib 2.80, GTK 4.14, libadwaita 1.5, gjs 1.80
(Ubuntu 24.04 packages). Upstream docs moved from wiki.gnome.org to
https://docs.vala.dev (source: https://github.com/vala-lang/vala-docs).

## When Vala is a good fit here

| Need | Best choice | Why |
|---|---|---|
| Anything inside gnome-shell (panel, actors, window controls, blur) | **GJS** | Extensions may not load native code; review on extensions.gnome.org rejects binaries. |
| Small session D-Bus helper (clipboard persistence, indexing) | **Vala** or Rust | `[DBus]` attributes give a service in ~50 lines; tiny runtime (GLib only). |
| GTK4/libadwaita helper window beyond `prefs.js` | GJS first, Vala if it must be native | Templates + Blueprint work identically; Vala is closer to C performance. |
| GObject library that GJS imports (`gi://Foo`) | **Vala** or C | `--gir` + `g-ir-compiler` is trivial; no hand-written annotations. |
| GTK3 module loaded via `GTK3_MODULES` (`advanced/`) | **C** | Needs exact exported symbols and zero extra runtime; see `c-gobject`. |
| Heavy parsing, untrusted input, concurrency | Rust | Memory safety; Vala has C's failure modes underneath. |

## Golden rules

1. **Out of process only.** A Vala helper is a separate binary the extension
   reaches over D-Bus (or a typelib loaded by `prefs.js`/a helper, never by the
   Shell). The extension must degrade gracefully when it is absent.
2. **Run a main loop.** `async`, D-Bus, timeouts and signals from GIO need
   `new MainLoop ().run ()` or `Application.run ()`.
3. **Every `throws` is caught or re-declared.** valac only warns on unhandled
   errors; treat warnings as errors (`--fatal-warnings` / `werror=true`).
4. **Ownership is explicit.** Default is owned (ref/copy); use `unowned` for
   borrowed returns, `GLib.WeakRef` (not the `weak` keyword) when you need a
   reference that becomes null, and `(owned)` to transfer delegates/strings.
5. **Closures capture `this` strongly.** A `Timeout.add (() => {...})` that uses
   `this` keeps the object alive until the source is removed. Store the source id
   and `Source.remove ()` it in `dispose`/shutdown.
6. **Async: `.begin()`/`.end()` or `yield`.** Never call an async method like a
   sync one; pass a `Cancellable` and honour it.
7. **GIR-facing API = GJS-facing API.** No default argument values (GJS still
   requires them), no generics/structs-with-ownership surprises, version the
   namespace (`Foo-0.1`), and pass `--shared-library` to `g-ir-compiler`.
8. **D-Bus input is untrusted.** Validate sizes/paths; throw `DBusError.*`.
   Use a reverse-DNS, versioned interface name (`org.example.Kiwi.Clipboard1`).
9. **Build with meson** (`project(..., 'vala', 'c')`); keep `valac` one-liners
   for experiments only.
10. **GTK4 has no `GTK_MODULES`.** You cannot inject Vala code into other apps on
    GTK4; only GTK3 supports loadable modules (see `c-gobject`).

## Decision table — open only what you need

| Task | Read |
|---|---|
| Syntax, types, strings, arrays, nullability, control flow, errors | `references/language-basics.md` |
| Classes, construct, properties, signals, interfaces, abstract/virtual | `references/gobject-classes-signals-properties.md` |
| `async`/`yield`, `MainLoop`, threads, D-Bus service + client, GTask interop | `references/async-gio-dbus.md` |
| owned/unowned/weak, refcount cycles, closures, `(owned)` casts, compact classes | `references/memory-ownership.md` |
| GTK4/libadwaita app, `[GtkTemplate]`, `[GtkChild]`, Blueprint, GResource | `references/gtk4-libadwaita.md` |
| meson + valac, `.vapi`, `.gir`, `.typelib`, importing a Vala lib from GJS | `references/build-meson-and-gir.md` |
| Something compiles but misbehaves; review checklist | `references/pitfalls.md` |

## Build cheat-sheet

```sh
# one-off experiments
valac --pkg gio-2.0 hello.vala -o hello
valac --pkg gtk4 --pkg libadwaita-1 --gresources=app.gresource.xml app.vala
valac -C file.vala                    # emit C only: inspect ownership/ref calls
valac --library=foo --gir=Foo-0.1.gir -H foo.h --vapi=foo.vapi \
      -X -fPIC -X -shared foo.vala -o libfoo.so
g-ir-compiler --shared-library=libfoo.so Foo-0.1.gir -o Foo-0.1.typelib

# meson (preferred)
meson setup _build -Dwerror=true      # add -Db_sanitize=address,undefined for debug
meson compile -C _build
meson test -C _build --print-errorlogs
meson devenv -C _build                # env with GI_TYPELIB_PATH/LD_LIBRARY_PATH set

# run / debug
G_MESSAGES_DEBUG=all ./_build/helper  # show debug() output
G_DEBUG=fatal-criticals gdb --args ./_build/helper
GTK_DEBUG=interactive ./_build/app    # GTK Inspector
GI_TYPELIB_PATH=_build LD_LIBRARY_PATH=_build gjs -m test.js
busctl --user introspect org.example.Kiwi.Clipboard /org/example/Kiwi/Clipboard
```

Verified in this sandbox: a Vala D-Bus service and client (under `dbus-run-session`),
a GTK4/Adw template app (under Xvfb), and a Vala library imported from GJS via
`gi://KiwiHelper?version=0.1`, including `Gio._promisify` on a Vala `async`
method.

## Sources

- Vala tutorial/guides: https://docs.vala.dev (async 4.8, ownership 4.10, weak refs 4.9, D-Bus 4.14, memory-management guide, shared-library introspection sample)
- Meson Vala: https://mesonbuild.com/Vala.html ; GNOME module: https://mesonbuild.com/Gnome-module.html
- GObject Introspection: https://gi.readthedocs.io/en/latest/
- API reference: https://valadoc.org (not reachable from this sandbox; signatures checked against local `/usr/share/vala-0.56/vapi/*.vapi`)
