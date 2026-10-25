# The GObject type system in C

Summary: declare types with `G_DECLARE_FINAL_TYPE`/`G_DECLARE_DERIVABLE_TYPE`
(header) and `G_DEFINE_*TYPE*` (source); register properties with static
`GParamSpec`s and signals with `g_signal_new` in `class_init`; release
references in `dispose`, free memory in `finalize`, always chain up.

## Contents
1. Header boilerplate (final vs derivable)
2. Source boilerplate and instance private data
3. Construction order (`init`, properties, `constructed`)
4. Properties
5. Signals
6. Virtual methods and chaining up
7. Interfaces
8. Destruction: `dispose` vs `finalize`
9. Tested examples
10. Sources

## 1. Header boilerplate

```c
/* kiwi-counter.h */
#pragma once
#include <gio/gio.h>

G_BEGIN_DECLS

#define KIWI_TYPE_COUNTER (kiwi_counter_get_type ())
G_DECLARE_FINAL_TYPE (KiwiCounter, kiwi_counter, KIWI, COUNTER, GObject)

KiwiCounter *kiwi_counter_new       (const char *name);
int          kiwi_counter_get_value (KiwiCounter *self);
void         kiwi_counter_bump      (KiwiCounter *self, int by);

G_END_DECLS
```

`G_DECLARE_FINAL_TYPE (ModuleObjName, module_obj_name, MODULE, OBJ_NAME, ParentName)`
gives you `KiwiCounter`, `KiwiCounterClass`, `KIWI_COUNTER ()`,
`KIWI_IS_COUNTER ()`, and a `g_autoptr(KiwiCounter)` cleanup. The instance
struct stays private to the `.c` file → you can change fields without ABI
breaks.

Derivable (subclassable) types expose the class struct in the header:

```c
#define KIWI_TYPE_SOURCE (kiwi_source_get_type ())
G_DECLARE_DERIVABLE_TYPE (KiwiSource, kiwi_source, KIWI, SOURCE, GObject)

struct _KiwiSourceClass
{
  GObjectClass parent_class;

  char *(*describe) (KiwiSource *self);   /* virtual method */

  gpointer padding[8];                     /* room for future vfuncs (ABI) */
};

char *kiwi_source_describe (KiwiSource *self);
```

Choose **final** unless subclassing is a supported feature; final types can
grow freely and `G_TYPE_IS_FINAL` is set (GLib ≥ 2.70 `G_DEFINE_FINAL_TYPE`).

## 2. Source boilerplate

```c
struct _KiwiCounter
{
  GObject    parent_instance;   /* must be first */
  char      *name;
  int        value;
  GPtrArray *history;
};

G_DEFINE_FINAL_TYPE (KiwiCounter, kiwi_counter, G_TYPE_OBJECT)
```

Derivable types keep state in a private struct:

```c
typedef struct { char *label; } KiwiSourcePrivate;
G_DEFINE_TYPE_WITH_PRIVATE (KiwiSource, kiwi_source, G_TYPE_OBJECT)

static void
kiwi_source_init (KiwiSource *self)
{
  KiwiSourcePrivate *priv = kiwi_source_get_instance_private (self);  /* gpointer: assign first */
  priv->label = g_strdup ("x");
}
```

`G_DEFINE_TYPE_WITH_CODE (…, G_IMPLEMENT_INTERFACE (…))` adds interfaces;
`G_DEFINE_FINAL_TYPE_WITH_CODE` likewise. Every macro requires you to provide
`*_class_init` and `*_init`.

## 3. Construction order

`g_object_new (TYPE, "prop", value, NULL)`:

1. `class_init` (once per type, on first use or `g_type_class_ref`)
2. instance memory zeroed; `*_init` of each class from the root down
3. construct / construct-only properties set via `set_property`
4. `constructed` vfunc (chain up first) — all construct properties available
5. remaining properties set

Put validation that needs construct properties in `constructed`, not in
`init`. Constructors like `kiwi_counter_new ()` must be thin wrappers around
`g_object_new` so bindings (GJS calls `g_object_new` directly) get identical
objects.

## 4. Properties

```c
enum { PROP_0, PROP_NAME, PROP_VALUE, N_PROPS };
static GParamSpec *properties[N_PROPS];

static void
kiwi_counter_get_property (GObject *object, guint prop_id, GValue *value, GParamSpec *pspec)
{
  KiwiCounter *self = KIWI_COUNTER (object);
  switch (prop_id)
    {
    case PROP_NAME:  g_value_set_string (value, self->name); break;
    case PROP_VALUE: g_value_set_int (value, self->value); break;
    default: G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    }
}

static void
kiwi_counter_set_property (GObject *object, guint prop_id, const GValue *value, GParamSpec *pspec)
{
  KiwiCounter *self = KIWI_COUNTER (object);
  switch (prop_id)
    {
    case PROP_NAME:
      g_free (self->name);
      self->name = g_value_dup_string (value);
      break;
    default: G_OBJECT_WARN_INVALID_PROPERTY_ID (object, prop_id, pspec);
    }
}

/* in class_init: */
properties[PROP_NAME] =
  g_param_spec_string ("name", NULL, NULL, NULL,
                       G_PARAM_READWRITE | G_PARAM_CONSTRUCT_ONLY | G_PARAM_STATIC_STRINGS);
properties[PROP_VALUE] =
  g_param_spec_int ("value", NULL, NULL, G_MININT, G_MAXINT, 0,
                    G_PARAM_READABLE | G_PARAM_EXPLICIT_NOTIFY | G_PARAM_STATIC_STRINGS);
g_object_class_install_properties (object_class, N_PROPS, properties);

/* on change: */
g_object_notify_by_pspec (G_OBJECT (self), properties[PROP_VALUE]);
```

- `G_PARAM_STATIC_STRINGS` always (names are literals). Nick/blurb may be `NULL`
  (GLib ≥ 2.66 style).
- `G_PARAM_EXPLICIT_NOTIFY` + manual notify only when the value really changed
  avoids spurious `notify::` emissions (GTK bindings, GJS `bind_property`).
- `g_object_notify_by_pspec` is faster than `g_object_notify (obj, "name")`.
- Freeze bursts: `g_object_freeze_notify` / `g_object_thaw_notify`.

## 5. Signals

```c
enum { CHANGED, N_SIGNALS };
static guint signals[N_SIGNALS];

/* class_init */
signals[CHANGED] =
  g_signal_new ("changed",
                G_TYPE_FROM_CLASS (klass),
                G_SIGNAL_RUN_LAST,
                0,                 /* class offset of default handler, or 0 */
                NULL, NULL,        /* accumulator */
                NULL,              /* marshaller: NULL = generic (libffi) */
                G_TYPE_NONE, 1, G_TYPE_INT);

/* emit */
g_signal_emit (self, signals[CHANGED], 0, self->value);
```

Connecting safely:

```c
/* auto-disconnect when `receiver` is finalized */
g_signal_connect_object (emitter, "changed", G_CALLBACK (on_changed), receiver, 0);

/* or keep and clear the id */
self->handler_id = g_signal_connect (emitter, "changed", G_CALLBACK (on_changed), self);
g_clear_signal_handler (&self->handler_id, emitter);          /* GLib >= 2.62 */
```

Signal ids exist only after `class_init` ran: `g_signal_lookup ("realize",
GTK_TYPE_WIDGET)` returns **0** if no widget was created yet (verified in a GTK3
module's `gtk_module_init`). Call `g_type_class_ref (TYPE)` first.

Emission hooks (`g_signal_add_emission_hook`) observe a signal on **every**
instance of a type — the right tool for a GTK module that must see every
widget's `realize`; the hook must return `TRUE` to stay installed. Signals with
`G_SIGNAL_NO_HOOKS` cannot be hooked.

## 6. Virtual methods and chaining up

```c
char *
kiwi_source_describe (KiwiSource *self)
{
  g_return_val_if_fail (KIWI_IS_SOURCE (self), NULL);
  return KIWI_SOURCE_GET_CLASS (self)->describe (self);
}

/* subclass override, calling the parent implementation */
static char *
kiwi_file_source_describe (KiwiSource *source)
{
  g_autofree char *base = KIWI_SOURCE_CLASS (kiwi_file_source_parent_class)->describe (source);
  return g_strconcat ("file:", base, NULL);
}
```

`*_parent_class` is defined by the `G_DEFINE_*` macro. Always chain up
`dispose`, `finalize`, `constructed`, and GTK vfuncs like `realize`,
`size_allocate`.

## 7. Interfaces

```c
#define KIWI_TYPE_SEARCHABLE (kiwi_searchable_get_type ())
G_DECLARE_INTERFACE (KiwiSearchable, kiwi_searchable, KIWI, SEARCHABLE, GObject)

struct _KiwiSearchableInterface
{
  GTypeInterface parent_iface;
  GStrv (*search) (KiwiSearchable *self, const char *query);
};

G_DEFINE_INTERFACE (KiwiSearchable, kiwi_searchable, G_TYPE_OBJECT)
static void kiwi_searchable_default_init (KiwiSearchableInterface *iface) { (void) iface; }

/* implementer */
static void kiwi_file_source_searchable_init (KiwiSearchableInterface *iface);
G_DEFINE_FINAL_TYPE_WITH_CODE (KiwiFileSource, kiwi_file_source, KIWI_TYPE_SOURCE,
  G_IMPLEMENT_INTERFACE (KIWI_TYPE_SEARCHABLE, kiwi_file_source_searchable_init))
```

## 8. Destruction

```c
static void
kiwi_file_source_dispose (GObject *object)
{
  KiwiFileSource *self = KIWI_FILE_SOURCE (object);

  g_cancellable_cancel (self->cancellable);
  g_clear_object (&self->cancellable);       /* idempotent: dispose may run twice */
  g_clear_object (&self->root);
  g_clear_handle_id (&self->timeout_id, g_source_remove);  /* guint field */

  G_OBJECT_CLASS (kiwi_file_source_parent_class)->dispose (object);
}

static void
kiwi_counter_finalize (GObject *object)
{
  KiwiCounter *self = KIWI_COUNTER (object);

  g_clear_pointer (&self->name, g_free);
  g_clear_pointer (&self->history, g_ptr_array_unref);

  G_OBJECT_CLASS (kiwi_counter_parent_class)->finalize (object);
}
```

- `dispose`: drop references to other objects, disconnect signals, remove
  sources, cancel I/O. May run more than once and methods may be called after
  it — leave the object in a safe state.
- `finalize`: free memory owned only by this instance. Runs exactly once.
- GTK widgets: `gtk_widget_destroy` (GTK3) runs `dispose`; children are
  destroyed with their container. For GTK4 templates call
  `gtk_widget_dispose_template (GTK_WIDGET (self), TYPE)` in `dispose`.

## 9. Tested examples

Both compiled with `-Wall -Wextra` against GLib 2.80 and ran clean under
valgrind:

- `KiwiCounter` (final type, two properties, one signal, a GTask async method)
  — full listing in `introspection-annotations.md` (also exported as a GIR and
  driven from GJS).
- `KiwiSource` (derivable with private data + vfunc) → `KiwiFileSource` (final
  subclass, implements `KiwiSearchable`, overrides and chains up `describe`).
  Output: `file:source q final=1`.

## 10. Sources

- GObject tutorial (boilerplate, construction, destruction, chaining, interfaces,
  signals): https://docs.gtk.org/gobject/tutorial.html
- Type system concepts (instantiation order, memory, closures, signal emission):
  https://docs.gtk.org/gobject/concepts.html
  (both read from the `GNOME/glib` mirror, `docs/reference/gobject/{tutorial,concepts}.md`)
- `g_signal_add_emission_hook`: https://docs.gtk.org/gobject/func.signal_add_emission_hook.html
- `g_clear_signal_handler` (2.62), `G_DEFINE_FINAL_TYPE` (2.70): GObject API
  docs (**unverified** version numbers; compiled fine on 2.80)
