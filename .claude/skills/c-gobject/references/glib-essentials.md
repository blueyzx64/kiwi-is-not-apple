# GLib essentials for C

Summary: GLib supplies portable types, UTF-8 string helpers, containers, the main
loop and logging that every GNOME C program (and the GTK3 module) uses. Know
which functions allocate (free with `g_free`/the type's free func), and drive
all asynchronous work from a `GMainContext`.

## Contents
1. Basic types and macros
2. Strings (allocation rules, UTF-8, GString, GStrv)
3. Containers: GList/GSList, GPtrArray, GArray, GHashTable, GQueue
4. Main loop, contexts and sources
5. Logging and assertions
6. Files and paths (GLib level)
7. Quarks and object data
8. Complete tested example
9. Sources

## 1. Basic types and macros

| Type | Note |
|---|---|
| `gboolean` | `int`; compare with truthiness, never `== TRUE` |
| `gint`, `guint`, `gint64`, `gsize`, `gssize` | `gsize` for sizes, `gssize` for "-1 = NUL-terminated" lengths |
| `gchar *` / `char *` | modern GNOME code uses plain `char`, `int` |
| `gpointer`, `gconstpointer` | `void *` |
| `GINT_TO_POINTER`/`GPOINTER_TO_INT`, `GUINT_TO_POINTER` | store ints in pointer slots |
| `G_N_ELEMENTS (arr)` | static array length |
| `G_STRFUNC`, `G_STRLOC` | for messages |
| `G_GNUC_WARN_UNUSED_RESULT`, `G_GNUC_PRINTF (fmt, args)` | attributes for your API |
| `G_BEGIN_DECLS`/`G_END_DECLS` | C++ guards in headers |
| `G_LIKELY`/`G_UNLIKELY` | branch hints |

## 2. Strings

Rule: functions returning `char *` (non-const) give you ownership → `g_free`.
`const char *` returns are borrowed.

```c
g_autofree char *name = g_strdup ("Kiwi");
g_autofree char *greeting = g_strdup_printf ("Hello %s", name);
g_autoptr(GString) s = g_string_new (NULL);       /* growable buffer */
g_string_append_printf (s, "%s/%d", greeting, 42);
char *out = g_string_free (g_steal_pointer (&s), FALSE);  /* keep the char* */
g_free (out);

g_auto(GStrv) parts = g_strsplit ("a,b,c", ",", -1);      /* NULL-terminated */
g_autofree char *joined = g_strjoinv ("|", parts);
gboolean eq = g_strcmp0 (maybe_null, "x") == 0;           /* NULL-safe */
gboolean pfx = g_str_has_prefix (name, "Ki");
g_autofree char *esc = g_markup_escape_text (user_text, -1);  /* for Pango markup */
g_autofree char *path = g_build_filename (g_get_user_cache_dir (), "kiwi", "x.json", NULL);
```

UTF-8: validate untrusted bytes with `g_utf8_validate`; iterate with
`g_utf8_next_char`; `g_utf8_strlen` counts characters; `g_utf8_casefold` +
`g_utf8_normalize` for search keys. Never use `strcpy`/`sprintf`/`strcat`; use
`g_strlcpy`, `g_snprintf`, `GString`.

Since GLib 2.68: `GStrvBuilder` builds `GStrv` incrementally;
`g_strv_builder_end` returns `(transfer full)`.

## 3. Containers

| Container | Use | Free |
|---|---|---|
| `GPtrArray` | default list of pointers; O(1) index/append | `g_ptr_array_new_with_free_func (free)` + `g_ptr_array_unref` |
| `GArray` | list of structs/ints | `g_array_unref` |
| `GHashTable` | maps/sets | `g_hash_table_new_full (hash, eq, key_free, val_free)` + `g_hash_table_unref` |
| `GList`/`GSList` | legacy APIs (e.g. `gtk_container_get_children`) | `g_list_free` (container) / `g_list_free_full (l, free)` |
| `GQueue` | deque | `g_queue_free_full` |

```c
g_autoptr(GHashTable) counts = g_hash_table_new_full (g_str_hash, g_str_equal, g_free, NULL);
g_hash_table_replace (counts, g_strdup ("x"), GINT_TO_POINTER (2));   /* replace frees old key */
GHashTableIter iter; gpointer k, v;
g_hash_table_iter_init (&iter, counts);
while (g_hash_table_iter_next (&iter, &k, &v)) { /* don't modify table except via iter */ }

g_autoptr(GPtrArray) arr = g_ptr_array_new_with_free_func (g_free);
g_ptr_array_add (arr, g_strdup ("one"));

/* GList: prepend + reverse, never append in a loop (O(n^2)) */
GList *list = NULL;
list = g_list_prepend (list, g_strdup ("a"));
list = g_list_reverse (list);
g_list_free_full (list, g_free);

/* (transfer container) list from GTK: free only the list */
g_autoptr(GList) kids = gtk_container_get_children (GTK_CONTAINER (box));
```

`g_autoptr(GList)` calls `g_list_free` (container only) — correct for
`(transfer container)`; for `(transfer full)` lists use
`g_list_free_full (l, g_object_unref)` or `g_autolist(GObject)`.

## 4. Main loop, contexts and sources

```c
GMainLoop *loop = g_main_loop_new (NULL, FALSE);   /* default context */
guint id = g_timeout_add_seconds (30, on_tick, data);   /* coarse, battery-friendly */
guint idle = g_idle_add_once (on_idle_once, data);      /* GLib >= 2.74 */
g_main_loop_run (loop);
g_clear_handle_id (&id, g_source_remove);           /* remove + zero */
g_main_loop_unref (loop);
```

- Callbacks return `G_SOURCE_CONTINUE` / `G_SOURCE_REMOVE`.
- A source keeps `user_data` alive only if you give it a ref and a destroy
  notify: `g_timeout_add_full (G_PRIORITY_DEFAULT, ms, cb, g_object_ref (obj), g_object_unref)`.
  Otherwise `user_data` may dangle when the source fires.
- `g_timeout_add_seconds` coalesces wakeups across processes; prefer it for
  anything ≥ 1 s. Polling every 800 ms in every GTK3 app (as `advanced/` does)
  costs wakeups in each process.
- Threads with their own context: `g_main_context_push_thread_default`.
  Dispatch to the main thread with `g_main_context_invoke (NULL, fn, data)` or
  `g_idle_add`.
- Unix signals: `g_unix_signal_add (SIGTERM, cb, data)` (`<glib-unix.h>`).

## 5. Logging and assertions

```c
#define G_LOG_DOMAIN "kiwi-tbhover"   /* before including glib.h, or -DG_LOG_DOMAIN=... */
g_debug ("wired %u buttons", n);       /* only with G_MESSAGES_DEBUG=all|kiwi-tbhover */
g_message ("info");
g_warning ("unexpected: %s", what);    /* fatal with G_DEBUG=fatal-warnings */
g_critical ("bug");                    /* fatal with G_DEBUG=fatal-criticals */
g_return_val_if_fail (GTK_IS_WIDGET (w), FALSE);  /* programmer-error precondition */
g_assert_nonnull (ptr);                /* tests; g_assert* compiled out by G_DISABLE_ASSERT */
g_error ("unrecoverable");             /* aborts — never in a module/library */
```

In a GTK module the log domain distinguishes your messages from the host app's.
Structured logging: `g_log_structured`; GNOME sessions route to the journal.

## 6. Files and paths

`g_get_user_config_dir ()`, `g_get_user_cache_dir ()`, `g_get_user_data_dir ()`,
`g_get_user_runtime_dir ()` honour XDG variables (and Flatpak remaps).
`g_file_get_contents`/`g_file_set_contents_full (…, G_FILE_SET_CONTENTS_CONSISTENT, 0600, &error)`
for small files (atomic). `g_mkdir_with_parents (dir, 0700)`.

## 7. Quarks and object data

```c
static GQuark wired_quark;
wired_quark = g_quark_from_static_string ("kiwi-tb-wired");   /* once */
g_object_set_qdata (G_OBJECT (w), wired_quark, GINT_TO_POINTER (1));
g_object_set_qdata_full (G_OBJECT (w), data_quark, g_new0 (State, 1), g_free);
```

`g_object_get_data ("string")` hashes the string every call; use a quark in hot
paths. Prefix keys (`kiwi-`) so they cannot collide with the host app's keys.

## 8. Tested example

Compiled with `-Wall -Wextra` and run under valgrind (GLib suppressions) with
no definite leaks; only GLib's worker-thread stack is reported as "possibly
lost", which is expected.

```c
#include <glib.h>
#include <glib-unix.h>

typedef struct { GMainLoop *loop; guint ticks; } App;

static gboolean
on_tick (gpointer user_data)
{
  App *app = user_data;
  if (++app->ticks == 3)
    {
      g_main_loop_quit (app->loop);
      return G_SOURCE_REMOVE;
    }
  return G_SOURCE_CONTINUE;
}

static gboolean
on_sigterm (gpointer user_data)
{
  g_main_loop_quit (((App *) user_data)->loop);
  return G_SOURCE_REMOVE;
}

int
main (void)
{
  g_autoptr(GPtrArray) arr = g_ptr_array_new_with_free_func (g_free);
  g_ptr_array_add (arr, g_strdup ("one"));

  App app = { g_main_loop_new (NULL, FALSE), 0 };
  g_timeout_add (10, on_tick, &app);
  guint sig_id = g_unix_signal_add (SIGTERM, on_sigterm, &app);
  g_main_loop_run (app.loop);
  g_clear_handle_id (&sig_id, g_source_remove);
  g_main_loop_unref (app.loop);
  g_print ("%u items, %u ticks\n", arr->len, app.ticks);
  return 0;
}
```

```sh
gcc -Wall -Wextra -o ex ex.c $(pkg-config --cflags --libs glib-2.0)
valgrind --leak-check=full --suppressions=/usr/share/glib-2.0/valgrind/glib.supp ./ex
```

## 9. Sources

- GLib API reference: https://docs.gtk.org/glib/ (strings, data structures, main loop)
- Main loop: https://docs.gtk.org/glib/main-loop.html
- Running GLib apps (G_DEBUG, G_MESSAGES_DEBUG, G_SLICE): https://docs.gtk.org/glib/running.html
  (read from the `GNOME/glib` mirror, `docs/reference/glib/running.md`)
- Auto-cleanup: https://docs.gtk.org/glib/auto-cleanup.html
- `g_idle_add_once` since 2.74, `GStrvBuilder` since 2.68: from GLib API docs
  (confirmed: https://docs.gtk.org/glib/func.idle_add_once.html ,
  https://docs.gtk.org/glib/struct.StrvBuilder.html).
