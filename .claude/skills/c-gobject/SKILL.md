---
name: c-gobject
description: Use when writing, reviewing, building or debugging C code on GLib/GObject/GIO/GTK for Kiwi (is not Apple) — especially the GTK3 titlebutton-hover module in advanced/ (loaded via GTK3_MODULES/GTK_MODULES), and any future GTK module, GObject library with introspection (GIR/typelib) for GJS, GDBus helper, or meson build. Covers GLib essentials, the GObject type system, ownership/transfer annotations and g_autoptr, GTask/GDBus, GTK3 modules vs GTK4 limitations, GNOME C style and safety, and a line-by-line review of advanced/. Do NOT use for code that runs inside gnome-shell (GJS only) or for Vala (use the vala skill).
---

# C with GLib/GObject/GTK (for Kiwi)

Kiwi is a GJS extension. The only native code today is `advanced/titlebuttons_hover.c`:
a GTK **3** module that GTK loads into every GTK3 app via `GTK_MODULES`, adding a
`titlebuttons-hover-alt` CSS class to the headerbar while any titlebutton is
hovered (CSS in `css/titlebuttons-alt3.css`). Toolchain verified 2026-10-25 in a
sandbox: GLib 2.80, GTK 3.24.41, GTK 4.14, gobject-introspection 1.80, meson 1.3.2,
gcc 13, gjs 1.80, Xvfb.

## Golden rules

1. **Never inside gnome-shell.** Native code runs in app processes (GTK3 module)
   or in separate helpers (D-Bus). Code loaded into *every* GTK3 app must be tiny,
   crash-proof, idle when unused, and never block.
2. **Ownership is part of the API.** Every pointer return/param has a transfer
   mode: `(transfer full)` caller frees; `(transfer none)` borrowed;
   `(transfer container)` free the container only. Document it with GI
   annotations even for private code.
3. **Use `g_autoptr`/`g_autofree`/`g_auto` + `g_steal_pointer`** for every
   owned local; `g_clear_object`/`g_clear_pointer`/`g_clear_handle_id` for fields.
   No early-return leaks.
4. **Signals and sources outlive you.** Every `g_signal_connect` and
   `g_timeout_add`/`g_idle_add` must be disconnected/removed, or use
   `g_signal_connect_object` so it dies with the receiver. Never pass a
   borrowed widget as `user_data` without a ref or a weak pointer.
5. **GError discipline.** `GError **error` last; return `FALSE`/`NULL` on
   failure *and* set the error; never set an error twice; callers free with
   `g_autoptr(GError)`; use `g_return_val_if_fail` only for programmer errors.
6. **Threads:** GTK and most GObjects are main-thread only. Do blocking work in
   `GTask`/`g_task_run_in_thread` and deliver results on the main context.
7. **Prefer events to polling.** Hook signals/emission hooks
   (`g_signal_add_emission_hook` after `g_type_class_ref`) instead of periodic
   tree walks.
8. **GTK4 has no `GTK_MODULES`** (verified: libgtk-4 has no module loader).
   The `advanced/` technique works only for GTK3 apps; GTK4 apps need CSS only.
9. **GIR-friendly APIs** for anything GJS should call: GObject types, annotated
   transfer/nullable/array/scope, `_async`/`_finish` pairs, no varargs-only API.
10. **Build with warnings on** (`-Wall -Wextra`, meson `warning_level=2`,
    `werror=true` in CI) and test under `G_DEBUG=fatal-criticals`.

## Decision table — open only what you need

| Task | Read |
|---|---|
| Types, strings, GList/GHashTable/GPtrArray, main loop, sources, logging | `references/glib-essentials.md` |
| Defining a GObject: G_DECLARE_*, properties, signals, dispose/finalize, interfaces | `references/gobject-type-system.md` |
| Refcounts, floating refs, weak refs, g_auto*, transfer rules | `references/memory-and-ownership.md` |
| GTask/GAsyncResult, GCancellable, GDBus server/client, gdbus-codegen | `references/gio-dbus-and-async.md` |
| GTK3 module entry points, hooking widgets, CSS providers, GTK4/Wayland/Flatpak limits | `references/gtk-modules-and-theming.md` |
| Making a C library importable from GJS (annotations, meson `generate_gir`) | `references/introspection-annotations.md` |
| GNOME C style, security pitfalls, defensive coding | `references/coding-style-and-safety.md` |
| Working on `advanced/` — bugs, leaks, fixes, script problems | `references/review-of-advanced-module.md` |

## Build / debug cheat-sheet

```sh
# current module (manual build, with warnings)
gcc -shared -fPIC -O2 -g -Wall -Wextra -Wl,--as-needed -Wl,-z,defs \
    -o libtitlebuttons_hover.so titlebuttons_hover.c $(pkg-config --cflags --libs gtk+-3.0)
nm -D --defined-only libtitlebuttons_hover.so      # exports: gtk_module_init only

# load into one app only (do this before touching environment.d)
GTK3_MODULES=$PWD/libtitlebuttons_hover.so gnome-calculator   # any GTK3 app
GTK_DEBUG=modules GTK3_MODULES=... app                         # loader messages (GTK3)
GTK_DEBUG=interactive app                                      # Inspector (GTK3/4)

# meson
meson setup _build -Dwarning_level=2 -Dwerror=true -Db_sanitize=address,undefined
meson compile -C _build && meson test -C _build --print-errorlogs

# runtime diagnostics (GLib)
G_MESSAGES_DEBUG=all app              # show g_debug / g_info
G_DEBUG=fatal-criticals gdb --args app   # stop at first g_critical / g_return_if_fail
G_DEBUG=fatal-warnings app
G_ENABLE_DIAGNOSTIC=1 app             # deprecation diagnostics (property/signal)
valgrind --leak-check=full --suppressions=/usr/share/glib-2.0/valgrind/glib.supp app
xvfb-run -a ./test-app                # headless GTK tests (used for the review)
journalctl --user -f                  # GTK3 module messages from session apps
```

Notes: `G_SLICE=always-malloc` is obsolete since GLib 2.76 (GSlice now wraps
malloc). ASan inside a GTK module requires the *host app* to be ASan-built or
`LD_PRELOAD=libasan.so` — test modules with a small ASan-built GTK3 test app.

## Sources

- GLib env vars: https://docs.gtk.org/glib/running.html
- GTK3 env vars/modules: https://docs.gtk.org/gtk3/running.html ; GTK4: https://docs.gtk.org/gtk4/running.html
- GObject tutorial + concepts: https://docs.gtk.org/gobject/tutorial.html , https://docs.gtk.org/gobject/concepts.html
- GI annotations: https://gi.readthedocs.io/en/latest/annotations/giannotations.html
- Meson GNOME module: https://mesonbuild.com/Gnome-module.html
- GNOME programming guidelines: https://developer.gnome.org/documentation/guidelines/programming.html
  (not reachable from this sandbox; content cited from memory is marked **unverified**)
