# GIO async (GTask) and GDBus in C

Summary: GIO async APIs come in `foo_async (…, GCancellable*, GAsyncReadyCallback, gpointer)`
+ `foo_finish (…, GAsyncResult*, GError**)` pairs; implement your own with
`GTask`. GDBus provides name ownership, object registration from introspection
XML (or `gdbus-codegen` skeletons), and proxies. Both run on the thread-default
main context.

## Contents
1. The async/finish contract
2. Implementing async with GTask (tested)
3. Chaining async steps and cancellation
4. Threads: `g_task_run_in_thread`
5. GDBus server from XML (tested)
6. GDBus client calls
7. gdbus-codegen with meson
8. Security and robustness for a session helper
9. Sources

## 1. The async/finish contract

- `_async` never blocks and never calls the callback synchronously; the
  callback runs later on the **thread-default main context of the caller**.
- `_finish` is called exactly once, from the callback, and returns the result
  or sets `GError`.
- Cancellation: a cancelled operation completes with `G_IO_ERROR_CANCELLED`
  (the callback still runs).
- `(scope async)` on the callback, `(closure)` on user_data in annotations.

## 2. Implementing async with GTask

Tested: built into a shared library, introspected and called from GJS via
`Gio._promisify`.

```c
static void
load_thread (GTask *task, gpointer source, gpointer task_data, GCancellable *cancellable)
{
  GFile *file = task_data;
  g_autoptr(GError) error = NULL;
  g_autofree char *contents = NULL;
  (void) source;

  if (!g_file_load_contents (file, cancellable, &contents, NULL, NULL, &error))
    g_task_return_error (task, g_steal_pointer (&error));
  else
    g_task_return_pointer (task, g_steal_pointer (&contents), g_free);
}

void
kiwi_counter_load_async (KiwiCounter *self, GFile *file, GCancellable *cancellable,
                         GAsyncReadyCallback callback, gpointer user_data)
{
  g_autoptr(GTask) task = NULL;

  g_return_if_fail (KIWI_IS_COUNTER (self));
  g_return_if_fail (G_IS_FILE (file));

  task = g_task_new (self, cancellable, callback, user_data);
  g_task_set_source_tag (task, kiwi_counter_load_async);
  g_task_set_task_data (task, g_object_ref (file), g_object_unref);
  g_task_run_in_thread (task, load_thread);
}

char *
kiwi_counter_load_finish (KiwiCounter *self, GAsyncResult *result, GError **error)
{
  g_return_val_if_fail (g_task_is_valid (result, self), NULL);
  g_return_val_if_fail (g_task_get_source_tag (G_TASK (result)) == kiwi_counter_load_async, NULL);
  return g_task_propagate_pointer (G_TASK (result), error);
}
```

Notes:
- `g_task_new` refs `self` (source object) for the task's lifetime.
- `g_autoptr(GTask)` in `_async` is correct: running the task holds its own ref.
- With `-Wpedantic`, the source-tag function-pointer cast warns; use
  meson `warning_level=2` (GNOME default) rather than 3.
- Return helpers: `g_task_return_boolean`, `_int`, `_pointer`, `_value`,
  `_error`, `_new_error`, `g_task_return_error_if_cancelled`.

## 3. Chaining async steps

```c
typedef struct { GFile *dest; } SaveData;
static void save_data_free (SaveData *d) { g_clear_object (&d->dest); g_free (d); }

static void
on_replaced (GObject *source, GAsyncResult *res, gpointer user_data)
{
  g_autoptr(GTask) task = user_data;            /* we own the ref passed below */
  g_autoptr(GError) error = NULL;

  if (!g_file_replace_contents_finish (G_FILE (source), res, NULL, &error))
    g_task_return_error (task, g_steal_pointer (&error));
  else
    g_task_return_boolean (task, TRUE);
}

void
kiwi_save_async (GFile *dest, GBytes *bytes, GCancellable *cancellable,
                 GAsyncReadyCallback callback, gpointer user_data)
{
  GTask *task = g_task_new (NULL, cancellable, callback, user_data);
  SaveData *d = g_new0 (SaveData, 1);

  d->dest = g_object_ref (dest);
  g_task_set_task_data (task, d, (GDestroyNotify) save_data_free);
  g_file_replace_contents_bytes_async (dest, bytes, NULL, FALSE,
                                       G_FILE_CREATE_PRIVATE | G_FILE_CREATE_REPLACE_DESTINATION,
                                       cancellable, on_replaced, task);   /* ref moves */
}

gboolean
kiwi_save_finish (GAsyncResult *result, GError **error)
{
  return g_task_propagate_boolean (G_TASK (result), error);
}
```

Cancellation from an object: keep a `GCancellable *cancellable` field, pass it
to every operation, `g_cancellable_cancel` + `g_clear_object` in `dispose`.
In callbacks, check for `G_IO_ERROR_CANCELLED` **before** touching `user_data`
that may already be disposed.

## 4. Threads

- `g_task_run_in_thread` uses GLib's thread pool; the task callback still runs
  on the original context.
- Never touch GTK widgets or call non-thread-safe GObject API in the worker.
- Pass copies (`g_strdup`, `g_object_ref` of immutable objects like `GFile`) via
  `g_task_set_task_data`.
- `g_task_set_return_on_cancel (task, TRUE)` lets cancellation complete
  immediately while the worker keeps running — the worker must then not touch
  shared state.

## 5. GDBus server from XML (tested)

Tested with `dbus-run-session` + `gdbus call` (results: normal reply, an
`org.freedesktop.DBus.Error.InvalidArgs` error reply, and a property read).

```c
#define MAX_QUERY 256
static const char introspection_xml[] =
  "<node>"
  "  <interface name='org.example.Kiwi.Search1'>"
  "    <method name='Query'>"
  "      <arg type='s' name='text' direction='in'/>"
  "      <arg type='u' name='limit' direction='in'/>"
  "      <arg type='as' name='results' direction='out'/>"
  "    </method>"
  "    <signal name='IndexChanged'><arg type='u' name='count'/></signal>"
  "    <property name='Count' type='u' access='read'/>"
  "  </interface>"
  "</node>";

static void
handle_method_call (GDBusConnection *connection, const char *sender,
                    const char *object_path, const char *interface_name,
                    const char *method_name, GVariant *parameters,
                    GDBusMethodInvocation *invocation, gpointer user_data)
{
  Daemon *d = user_data;

  if (g_strcmp0 (method_name, "Query") == 0)
    {
      const char *text;          /* "&s": borrowed from parameters */
      guint32 limit;
      g_autoptr(GVariantBuilder) b = g_variant_builder_new (G_VARIANT_TYPE ("as"));

      g_variant_get (parameters, "(&su)", &text, &limit);
      if (strlen (text) > MAX_QUERY || limit > 100)
        {
          g_dbus_method_invocation_return_error (invocation, G_DBUS_ERROR,
                                                 G_DBUS_ERROR_INVALID_ARGS,
                                                 "query too long or limit > 100");
          return;
        }
      /* … fill b … */
      d->count++;
      g_dbus_connection_emit_signal (connection, NULL, object_path,
                                     "org.example.Kiwi.Search1", "IndexChanged",
                                     g_variant_new ("(u)", d->count), NULL);
      g_dbus_method_invocation_return_value (invocation, g_variant_new ("(as)", b));
      return;
    }
  g_dbus_method_invocation_return_error (invocation, G_DBUS_ERROR,
                                         G_DBUS_ERROR_UNKNOWN_METHOD, "No such method %s", method_name);
}

static const GDBusInterfaceVTable vtable = { handle_method_call, handle_get_property, NULL, { 0 } };

static void
on_bus_acquired (GDBusConnection *connection, const char *name, gpointer user_data)
{
  Daemon *d = user_data;
  g_autoptr(GError) error = NULL;

  d->registration_id = g_dbus_connection_register_object (connection, "/org/example/Kiwi/Search",
                                                          d->info->interfaces[0],
                                                          &vtable, d, NULL, &error);
  if (d->registration_id == 0)
    g_warning ("register_object: %s", error->message);
}

/* main(): */
d.info = g_dbus_node_info_new_for_xml (introspection_xml, &error);
owner_id = g_bus_own_name (G_BUS_TYPE_SESSION, "org.example.Kiwi.Search",
                           G_BUS_NAME_OWNER_FLAGS_NONE,
                           on_bus_acquired, NULL, on_name_lost, &d, NULL);
```

- Every invocation must be completed exactly once (`return_value`/`return_error`);
  for slow work keep the `GDBusMethodInvocation` (it is a GObject, ref it) and
  return from a GTask callback.
- `g_variant_new` returns floating refs consumed by `return_value`/`emit_signal`.
- `GDBusInterfaceVTable` has padding (`{ 0 }`) — initialise all fields.

## 6. Client calls

```c
static void
on_query_done (GObject *source, GAsyncResult *res, gpointer user_data)
{
  g_autoptr(GError) error = NULL;
  g_autoptr(GVariant) reply = g_dbus_connection_call_finish (G_DBUS_CONNECTION (source), res, &error);
  g_autofree const char **results = NULL;

  if (reply == NULL)
    {
      if (!g_error_matches (error, G_IO_ERROR, G_IO_ERROR_CANCELLED))
        {
          g_dbus_error_strip_remote_error (error);
          g_warning ("Query failed: %s", error->message);
        }
      return;
    }
  g_variant_get (reply, "(^a&s)", &results);   /* borrowed strings, owned array */
  for (gsize i = 0; results[i] != NULL; i++)
    g_print ("%s\n", results[i]);
}

static void
query (GDBusConnection *bus, GCancellable *cancellable)
{
  g_dbus_connection_call (bus, "org.example.Kiwi.Search", "/org/example/Kiwi/Search",
                          "org.example.Kiwi.Search1", "Query",
                          g_variant_new ("(su)", "kiwi", 10), G_VARIANT_TYPE ("(as)"),
                          G_DBUS_CALL_FLAGS_NONE, 5000 /* ms */, cancellable,
                          on_query_done, NULL);
}
```

`g_bus_get (G_BUS_TYPE_SESSION, cancellable, cb, data)` gets the connection
asynchronously; `g_bus_watch_name` tracks the service appearing/vanishing.
`GDBusProxy` caches properties and is convenient for signals
(`g-signal`/`g-properties-changed`).

## 7. gdbus-codegen with meson

```meson
gnome = import('gnome')
dbus_src = gnome.gdbus_codegen('kiwi-search-generated',
  sources: 'org.example.Kiwi.Search1.xml',
  interface_prefix: 'org.example.Kiwi.',
  namespace: 'Kiwi',
  autocleanup: 'all')
executable('kiwi-search', 'main.c', dbus_src, dependencies: dependency('gio-unix-2.0'))
```

Generates `KiwiSearch1Skeleton` (server: connect `handle-query`, call
`kiwi_search1_complete_query`) and `KiwiSearch1Proxy` (client:
`kiwi_search1_call_query`). Codegen gives type-safe signals and properties at
the cost of a build step; hand-written vtables (above) are fine for one or two
methods.

## 8. Security and robustness

- Session-bus services are callable by any process of the user; treat every
  argument as untrusted: bound lengths, reject `..`/absolute paths unless the
  method is about paths, never pass strings to a shell.
- Use versioned interface names (`…Search1`) and keep the XML committed so the
  GJS side can use it with `Gio.DBusProxy.makeProxyWrapper`.
- Reply quickly; push long work to GTask and return later.
- `G_BUS_NAME_OWNER_FLAGS_NONE` + quit on `name_lost` gives single-instance
  semantics; `on_name_lost` also fires when no bus connection could be made.
- Run under `systemd --user` with `Type=dbus`; let D-Bus activation start it.

## 9. Sources

- GTask: https://docs.gtk.org/gio/class.Task.html
- Async conventions: https://docs.gtk.org/gio/iface.AsyncResult.html
- GDBus overview: https://docs.gtk.org/gio/migrating-gdbus.html ,
  https://docs.gtk.org/gio/method.DBusConnection.register_object.html
- `gnome.gdbus_codegen`: https://mesonbuild.com/Gnome-module.html#gnomegdbus_codegen
- gdbus-codegen generated names: `man gdbus-codegen`, source
  https://gitlab.gnome.org/GNOME/glib/-/blob/main/docs/reference/gio/gdbus-codegen.rst
  (names confirmed by running gdbus-codegen 2.80 on the XML above)
