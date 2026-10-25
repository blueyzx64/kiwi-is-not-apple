# Writing GIR-friendly C APIs for GJS

Summary: GObject Introspection scans your headers + gtk-doc comments
(`g-ir-scanner`) into a `.gir`, compiles it to a `.typelib`, and GJS imports it as
`gi://Namespace?version=X`. Bindings are only as correct as your annotations:
transfer, nullability, arrays, scopes and async pairs must be explicit.

## Contents
1. Pipeline and naming
2. The annotations you will actually use
3. Patterns that bind well / badly
4. Async functions for `Gio._promisify`
5. Tested library: header, source, meson, GJS
6. Troubleshooting
7. Sources

## 1. Pipeline and naming

```
foo.h + foo.c (doc comments) --g-ir-scanner--> Kiwi-0.1.gir --g-ir-compiler--> Kiwi-0.1.typelib
```

- Namespace `KiwiC`, identifier prefix `Kiwi` (types `KiwiCounter` →
  `KiwiC.Counter`), symbol prefix `kiwi` (`kiwi_counter_bump` →
  `counter.bump()`).
- Follow GObject naming exactly: functions taking `KiwiCounter *self` first
  and named `kiwi_counter_*` become methods; `kiwi_counter_new*` become
  constructors (`KiwiC.Counter.new()`), but GJS `new KiwiC.Counter({...})`
  calls `g_object_new` — keep `_new` a thin wrapper.
- Every public type/function needs a doc comment, or the scanner warns
  (with `fatal_warnings: true` in meson, the build fails — good).

## 2. Annotations you will use

```c
/**
 * kiwi_thing_lookup:
 * @self: a #KiwiThing
 * @key: (not nullable): the key
 * @fallback: (nullable): returned when @key is missing
 * @out_len: (out) (optional): location for the length, or %NULL
 *
 * Returns: (transfer none) (nullable): the value, owned by @self
 */
```

| Annotation | Meaning |
|---|---|
| `(transfer full\|none\|container\|floating)` | ownership of return/out (in-params: whether callee takes it) |
| `(nullable)` | NULL allowed (in) / may return NULL |
| `(optional)` | for `(out)`: caller may pass NULL to skip |
| `(out)`, `(out caller-allocates)`, `(inout)` | output parameters (avoid inout) |
| `(array length=n)`, `(array zero-terminated=1)`, `(array fixed-size=4)` | C arrays |
| `(element-type utf8)`, `(element-type utf8 GObject)` | contents of GList/GPtrArray/GHashTable |
| `(scope call\|async\|notified\|forever)` | callback lifetime |
| `(closure)` / `(closure data)` | user_data for a callback |
| `(destroy notify)` | GDestroyNotify for a callback |
| `(skip)` | hide from bindings |
| `(rename-to name)` | expose under another name |
| `(type GObject.Object)` | override a C type (e.g. `gpointer`) |
| `(finish-func f)` / `(async-func f)` | link async pairs explicitly (g-ir-scanner 1.80 emitted `glib:finish-func` for our `_async`/`_finish` pair automatically — verified in the generated GIR) |
| `Since: 0.2`, `Deprecated: 0.3: Use …` | versioning |

Scopes (from the GI docs): `call` valid during the call; `async` valid until
the callback is invoked once (e.g. `g_file_read_async`); `notified` valid until
the destroy notify runs (e.g. `g_idle_add_full`); `forever` until process exit.

## 3. Patterns that bind well / badly

Do:
- GObject classes with properties and signals (GJS gets `notify::`,
  `bind_property`, `connect`).
- Strings as `const char *`/`char *` UTF-8; `GStrv` with
  `(array zero-terminated=1) (transfer full)`.
- `GBytes` for binary data; `GVariant` for structured blobs; `GListModel` for
  lists that change.
- Boxed types (`G_DEFINE_BOXED_TYPE`) for small value structs with copy/free.
- `GError **error` last → GJS throws a `GLib.Error`.
- `_async`/`_finish` pairs.

Avoid (GI "Writing bindable APIs"):
- API only reachable through macros or inline functions.
- Public struct fields on GObjects — provide accessors.
- Varargs-only functions (`foo_set (self, "a", 1, NULL)`) — add an array/`GValue`
  variant.
- Many `(out)` params; `(inout)` for non-scalars.
- Structs with custom memory management not registered as boxed types.
- Callbacks without `user_data`/`GDestroyNotify`.

## 4. Async for GJS

```c
/**
 * kiwi_counter_load_async:
 * @self: a #KiwiCounter
 * @file: file to read
 * @cancellable: (nullable): a #GCancellable
 * @callback: (scope async): callback to invoke
 * @user_data: (closure): data for @callback
 */
/**
 * kiwi_counter_load_finish:
 * @self: a #KiwiCounter
 * @result: the #GAsyncResult
 * @error: return location for a #GError
 *
 * Returns: (transfer full): the file contents, or %NULL on error
 */
```

```js
Gio._promisify(KiwiC.Counter.prototype, 'load_async', 'load_finish');
const text = await counter.load_async(file, null);
```

## 5. Tested library

Built with meson (`gnome.generate_gir`, `fatal_warnings: true` → zero scanner
warnings), then driven from gjs 1.80: properties, `notify::value`, `changed`
signal, `GStrv` return and the promisified GTask method all worked.

`kiwi-counter.h`:

```c
#pragma once
#include <gio/gio.h>

G_BEGIN_DECLS

#define KIWI_TYPE_COUNTER (kiwi_counter_get_type ())
G_DECLARE_FINAL_TYPE (KiwiCounter, kiwi_counter, KIWI, COUNTER, GObject)

KiwiCounter *kiwi_counter_new         (const char *name);
const char  *kiwi_counter_get_name    (KiwiCounter *self);
int          kiwi_counter_get_value   (KiwiCounter *self);
void         kiwi_counter_bump        (KiwiCounter *self, int by);
GStrv        kiwi_counter_dup_history (KiwiCounter *self);
void         kiwi_counter_load_async  (KiwiCounter *self, GFile *file, GCancellable *cancellable,
                                       GAsyncReadyCallback callback, gpointer user_data);
char        *kiwi_counter_load_finish (KiwiCounter *self, GAsyncResult *result, GError **error);

G_END_DECLS
```

`kiwi-counter.c` (properties/finalize/class_init as in
`gobject-type-system.md`; the async pair as in `gio-dbus-and-async.md`), with doc
comments on everything public:

```c
/**
 * KiwiCounter:
 *
 * A counter that remembers its history.
 */

/**
 * KiwiCounter:name:
 *
 * The counter's display name.
 */

/**
 * KiwiCounter::changed:
 * @self: the counter
 * @new_value: the new value
 *
 * Emitted after the value changes.
 */

/**
 * kiwi_counter_new:
 * @name: (nullable): a display name
 *
 * Returns: (transfer full): a new #KiwiCounter
 */
KiwiCounter *
kiwi_counter_new (const char *name)
{
  return g_object_new (KIWI_TYPE_COUNTER, "name", name, NULL);
}

/**
 * kiwi_counter_get_name:
 * @self: a #KiwiCounter
 *
 * Returns: (nullable) (transfer none): the name
 */

/**
 * kiwi_counter_dup_history:
 * @self: a #KiwiCounter
 *
 * Returns: (transfer full) (array zero-terminated=1): the history; free with g_strfreev()
 */
GStrv
kiwi_counter_dup_history (KiwiCounter *self)
{
  g_autoptr(GStrvBuilder) builder = g_strv_builder_new ();

  g_return_val_if_fail (KIWI_IS_COUNTER (self), NULL);
  for (guint i = 0; i < self->history->len; i++)
    g_strv_builder_add (builder, g_ptr_array_index (self->history, i));
  return g_strv_builder_end (builder);
}
```

`meson.build`:

```meson
project('kiwi-c', 'c', version: '0.1.0', meson_version: '>= 0.62',
        default_options: ['warning_level=2', 'c_std=gnu11'])
gnome = import('gnome')
gio_dep = dependency('gio-2.0', version: '>= 2.76')
lib = shared_library('kiwi-c', 'kiwi-counter.c', dependencies: gio_dep, install: true)
gnome.generate_gir(lib,
  sources: ['kiwi-counter.c', 'kiwi-counter.h'],
  namespace: 'KiwiC', nsversion: '0.1',
  identifier_prefix: 'Kiwi', symbol_prefix: 'kiwi',
  includes: ['Gio-2.0'], header: 'kiwi-counter.h',
  install: true, fatal_warnings: true)
```

GJS:

```js
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import KiwiC from 'gi://KiwiC?version=0.1';

Gio._promisify(KiwiC.Counter.prototype, 'load_async', 'load_finish');
const c = new KiwiC.Counter({name: 'x'});
c.connect('notify::value', () => print(`notify ${c.value}`));
c.connect('changed', (_o, v) => print(`changed ${v}`));
c.bump(3);
c.bump(-1);
print(`${c.name} history=${c.dup_history().join(',')}`);   // x history=+3,-1
const text = await c.load_async(Gio.File.new_for_path('meson.build'), null);
```

Run uninstalled: `GI_TYPELIB_PATH=_build LD_LIBRARY_PATH=_build gjs -m test.js`
(or `meson devenv`). `generate_gir` records `shared-library="libkiwi-c.so"`
in the GIR automatically, unlike Vala's `--gir`.

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Typelib file for namespace 'X', version 'Y' not found` | `GI_TYPELIB_PATH` / install dir `libdir/girepository-1.0`; version string mismatch |
| `Could not locate function` / symbol lookup errors | wrong `shared-library` in GIR; library not on loader path |
| Scanner: "Unknown namespace for symbol" | prefixes don't match `identifier_prefix`/`symbol_prefix` |
| Scanner: "missing (transfer) annotation" / unannotated `gpointer` | add annotations; fail the build with `fatal_warnings` |
| GJS leaks or double frees | wrong `(transfer)`; test with valgrind under gjs |
| `No module named 'giscanner._giscanner'` | system Python ≠ Python g-ir-scanner was built for (seen here: 3.13 vs 3.12); run `python3.12 /usr/bin/g-ir-scanner …` or fix the distro install |
| JS `null` rejected | parameter not `(nullable)` |

## 7. Sources

- Annotations reference: https://gi.readthedocs.io/en/latest/annotations/giannotations.html
- Writing bindable APIs: https://gi.readthedocs.io/en/latest/writingbindableapis.html
  (both read from `GNOME/gobject-introspection` mirror `docs/website/`)
- `gnome.generate_gir`: https://mesonbuild.com/Gnome-module.html#gnomegenerate_gir
- GJS imports (`gi://`) and `Gio._promisify`: https://gjs.guide/guides/gjs/asynchronous-programming.html
  (site not reachable here; behaviour verified with gjs 1.80)
