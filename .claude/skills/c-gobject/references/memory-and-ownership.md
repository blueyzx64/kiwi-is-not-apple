# Memory and ownership in GLib/GObject C

Summary: every pointer crossing a function boundary has an ownership transfer
mode; GObjects are reference counted (with floating refs for widgets and
GVariants); `g_autoptr`/`g_autofree`/`g_steal_pointer` make ownership explicit in
code. Most leaks and crashes in GTK modules come from callbacks holding borrowed
pointers.

## Contents
1. Transfer modes (the vocabulary)
2. Reference counting basics and helpers
3. Floating references
4. Weak references (three kinds)
5. Automatic cleanup (`g_auto*`)
6. Defining cleanup for your own types
7. Callbacks, user_data and lifetimes
8. GError ownership
9. Tested example
10. Debugging leaks and use-after-free
11. Sources

## 1. Transfer modes

| Annotation | Return value | `(out)` param | In param |
|---|---|---|---|
| `(transfer full)` | caller owns, must free/unref | same | callee takes ownership |
| `(transfer none)` | borrowed; valid while owner keeps it | same | callee borrows (default for in) |
| `(transfer container)` | caller frees container, not elements | same | rare |
| `(transfer floating)` | floating ref (widgets/GVariant) | — | — |

Defaults inferred by g-ir-scanner: `const` returns → none; non-const `char *`
returns must be annotated. Examples from GTK3 relevant to `advanced/`:

| Call | Transfer | Cleanup |
|---|---|---|
| `gtk_container_get_children ()` | container | `g_list_free` (or `g_autoptr(GList)`) |
| `gtk_window_list_toplevels ()` | container | `g_list_free` |
| `gtk_widget_get_style_context ()` | none | nothing |
| `gtk_widget_get_parent ()` | none | nothing |
| `g_object_get_data ()` | none | nothing |
| `g_strdup_printf ()` | full | `g_free` |

## 2. Reference counting

```c
GFile *f = g_file_new_for_path ("/tmp");      /* (transfer full): we own 1 ref */
GFile *also = g_object_ref (f);                /* now 2 */
g_object_unref (also);
g_clear_object (&f);                           /* unref + set NULL (safe if NULL) */

g_set_object (&self->file, new_file);          /* ref new, unref old, handles same ptr */
g_clear_pointer (&self->table, g_hash_table_unref);
g_clear_handle_id (&self->source_id, g_source_remove);
g_clear_signal_handler (&self->handler_id, emitter);
```

Rules: whoever increments must decrement; store a ref in a struct field only if
you own it; never unref something you got with `(transfer none)`.

## 3. Floating references

`GInitiallyUnowned` subclasses (GTK3 `GtkWidget`, `GVariant` builders) start
with a *floating* ref. The first `g_object_ref_sink` "sinks" it instead of
adding a ref. Containers sink children.

```c
GtkWidget *label = gtk_label_new ("x");              /* floating */
gtk_container_add (GTK_CONTAINER (box), label);      /* box sinks it */
GtkWidget *box = g_object_ref_sink (gtk_box_new (GTK_ORIENTATION_VERTICAL, 0)); /* we own */
g_object_unref (box);
```

GTK3 toplevel windows are owned by GTK itself (destroy with
`gtk_widget_destroy`). GTK4 widgets are still `GInitiallyUnowned`, but
toplevels are destroyed with `gtk_window_destroy`. Verified: a new
`GtkLabel` is floating, and it is no longer floating after `gtk_container_add`.

## 4. Weak references

| Mechanism | Thread-safe | Use |
|---|---|---|
| `g_set_weak_pointer (&ptr, obj)` / `g_clear_weak_pointer (&ptr)` | no | a field that auto-NULLs on finalize (verified) |
| `g_object_weak_ref (obj, notify, data)` | no | run a callback when obj is finalized |
| `GWeakRef` + `g_weak_ref_init/get/clear` | yes | cross-thread; `get` returns a strong ref or NULL |

```c
g_set_weak_pointer (&self->target, widget);
/* ... later, maybe after widget died: */
if (self->target != NULL)
  gtk_style_context_add_class (gtk_widget_get_style_context (self->target), "x");
g_clear_weak_pointer (&self->target);   /* in dispose: removes the weak ref */
```

A `GWeakRef` must not be moved/copied after `g_weak_ref_init` (it registers its
address). Do not store a weak pointer in memory that may be freed before you
call `g_clear_weak_pointer`, or GLib will write NULL into freed memory.

## 5. Automatic cleanup

```c
g_autofree char *path = g_build_filename (dir, "x", NULL);     /* g_free */
g_autoptr(GFile) file = g_file_new_for_path (path);            /* g_object_unref */
g_autoptr(GError) error = NULL;                                 /* g_error_free */
g_autoptr(GList) kids = gtk_container_get_children (c);         /* g_list_free */
g_autolist(GObject) objs = list_of_owned_objects ();            /* g_list_free_full + unref */
g_auto(GStrv) parts = g_strsplit (s, ",", -1);                  /* g_strfreev */
g_auto(GValue) v = G_VALUE_INIT;                                /* g_value_unset */
g_autoptr(GVariant) var = g_variant_ref_sink (g_variant_new_string ("x"));

return g_steal_pointer (&file);   /* hand ownership to caller, var becomes NULL */
```

Rules (GLib auto-cleanup docs):
- Always initialise (`= NULL` or a value) — cleanup runs on scope exit even on
  an early `return`.
- Only for local variables, never struct fields or globals.
- GCC/Clang only (uses `__attribute__((cleanup))`); MSVC unsupported.
- `g_autoptr(T)` takes the type name, not a pointer type.

## 6. Cleanup for your own types

```c
typedef struct { char *text; int n; } Entry;
static void entry_free (Entry *e) { g_free (e->text); g_free (e); }
G_DEFINE_AUTOPTR_CLEANUP_FUNC (Entry, entry_free)

static Entry *
entry_new_checked (const char *text, GError **error)
{
  g_autoptr(Entry) e = g_new0 (Entry, 1);
  if (text == NULL || *text == '\0')
    {
      g_set_error_literal (error, G_IO_ERROR, G_IO_ERROR_INVALID_ARGUMENT, "empty text");
      return NULL;                    /* e freed automatically */
    }
  e->text = g_strdup (text);
  return g_steal_pointer (&e);        /* (transfer full) */
}
```

`G_DECLARE_FINAL_TYPE`/`G_DECLARE_DERIVABLE_TYPE` define the autoptr cleanup
for GObject types automatically. For stack structs with a clear function:
`G_DEFINE_AUTO_CLEANUP_CLEAR_FUNC (Type, type_clear)` → `g_auto(Type)`.

## 7. Callbacks, user_data and lifetimes

This is where GTK modules crash. A callback's `user_data` is a raw pointer; GLib
does not keep it alive.

| Pattern | Safe? |
|---|---|
| `g_signal_connect (a, "sig", cb, b)` where `b` may die before `a` | **No** — dangling `b` |
| `g_signal_connect_object (a, "sig", cb, b, 0)` | Yes — disconnected when `b` is finalized |
| `g_signal_connect_data (a, "sig", cb, g_object_ref (b), (GClosureNotify) g_object_unref, 0)` | Yes, but `b` lives as long as the connection (possible cycle) |
| `g_timeout_add (ms, cb, widget)` | **No** if widget can be destroyed first |
| `g_timeout_add_full (prio, ms, cb, g_object_ref (w), g_object_unref)` | Yes (keeps `w` alive until the source ends) |
| `g_idle_add (cb, g_object_ref (w))` + unref in `cb` | Yes, if `cb` always runs (it does unless removed) |
| Weak pointer in a heap struct passed as user_data | Yes, if the struct outlives both |

Also: a module's code must stay mapped while any callback can still fire — see
`g_module_make_resident` in `gtk-modules-and-theming.md`.

## 8. GError ownership

```c
gboolean
kiwi_save (const char *path, const char *data, GError **error)
{
  g_autoptr(GError) local = NULL;

  g_return_val_if_fail (path != NULL, FALSE);
  g_return_val_if_fail (error == NULL || *error == NULL, FALSE);

  if (!g_file_set_contents_full (path, data, -1, G_FILE_SET_CONTENTS_CONSISTENT, 0600, &local))
    {
      g_propagate_prefixed_error (error, g_steal_pointer (&local), "Saving %s: ", path);
      return FALSE;
    }
  return TRUE;
}
```

- `error` may be NULL (caller doesn't care) — never dereference it.
- Set it at most once; `g_propagate_error` transfers ownership.
- On error return `FALSE`/`NULL`; on success leave `*error` untouched.
- Match with `g_error_matches (err, G_IO_ERROR, G_IO_ERROR_CANCELLED)`.

## 9. Tested example

`g_set_weak_pointer`, `GWeakRef`, floating refs, `G_DEFINE_AUTOPTR_CLEANUP_FUNC`
+ `g_steal_pointer` and `g_set_object` were exercised in one GTK3 program under
Xvfb:

```
floating=1
label floating after add=0
weak ptr after destroy=(nil)
weakref alive=1
error: empty text
```

## 10. Debugging

```sh
valgrind --leak-check=full --show-leak-kinds=definite \
  --suppressions=/usr/share/glib-2.0/valgrind/glib.supp ./app
meson setup _b -Db_sanitize=address,undefined && meson test -C _b
G_DEBUG=fatal-criticals gdb -ex run --args ./app    # crash at first critical
G_DEBUG=gc-friendly ./app                           # zero freed GLib memory (helps valgrind)
```

Refcount bugs: in gdb `break g_object_unref if object == 0x...`; the GTK
Inspector (`GTK_DEBUG=interactive`) shows object counts in its Statistics tab
when GLib is built with `G_ENABLE_DEBUG` and `GOBJECT_DEBUG=instance-count` is
set (https://docs.gtk.org/gobject/func.type_get_instance_count.html; **unverified**
per distro — `meson.options` says distros typically disable `glib_debug`).

## 11. Sources

- GI annotations (transfer, nullable): https://gi.readthedocs.io/en/latest/annotations/giannotations.html
- Object memory management, floating refs, weak refs: https://docs.gtk.org/gobject/concepts.html#object-memory-management
- Floating refs: https://docs.gtk.org/gobject/floating-refs.html
- Auto-cleanup rules: https://docs.gtk.org/glib/auto-cleanup.html (read from `GNOME/glib` mirror)
- GNOME memory-management guideline: https://developer.gnome.org/documentation/guidelines/programming/memory-management.html
  (checked: ownership/transfer vocabulary matches)
