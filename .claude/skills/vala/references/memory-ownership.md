# Vala memory and ownership

Summary: Vala uses automatic reference counting (GObject refs, string/array
copies) decided at compile time from *ownership* annotations. `owned` (default
for variables, fields, returns) means "I hold a reference/copy"; `unowned`
borrows; `weak` is just an unowned field. Cycles leak; closures capture `this`.

## Contents
1. The model in one table
2. Owned vs unowned: variables, returns, parameters
3. Properties are unowned by default
4. `(owned)` transfer casts and avoiding copies
5. Reference cycles, `weak`, and `GLib.WeakRef`
6. Closures, signals and sources (the #1 leak)
7. Nullable types
8. Compact classes, structs, pointers
9. Reading generated C to check ownership
10. Sources

## 1. The model

| Declaration | Holds a ref/copy? | Freed when | Typical use |
|---|---|---|---|
| `Foo x = …;` / field `Foo x;` | yes (owned) | scope ends / owner finalized | default |
| `unowned Foo x = …;` | no | never by you | borrowing a value someone else keeps alive |
| field `weak Foo x;` | no (same as unowned) | never; **not** set to null | back-pointers in trees you fully control |
| `GLib.WeakRef wr = WeakRef (obj);` | no; `wr.get ()` returns owned or null | — | references that must survive the target's death safely |
| param `Foo x` | no (caller keeps ownership) | — | default params |
| param `owned Foo x` | yes, callee takes the caller's ref | — | storing args without an extra ref |
| return `Foo f ()` | caller receives ownership | — | factories |
| return `unowned Foo f ()` | caller borrows | — | getters of stored values |

Strings and arrays are *copied* where objects would be *ref'd*: assigning an
`unowned string` to a `string` variable calls `g_strdup`.

## 2. Owned vs unowned

```vala
class Registry : Object {
    private Object current = new Object ();
    private string[] names = { "kiwi", "apple" };

    public unowned Object peek () { return current; }        // no ref for caller
    public Object take () { return current; }                // caller gets +1 ref
    public unowned string first () { return names[0]; }      // borrow
}

void use (Registry r) {
    unowned Object o = r.peek ();     // fine while r keeps it
    Object o2 = r.peek ();            // ref taken (Vala inserts g_object_ref)
    unowned string s = r.first ();    // no copy
    string s2 = r.first ();           // g_strdup
}
```

Danger: `unowned Object o = new Object ();` — the temporary is freed at the end
of the statement and `o` dangles (valac warns). Only make something unowned when
you can name who owns it.

## 3. Properties

Property getters return **unowned** values, so they cannot return a freshly
created object or string unless declared `owned get`:

```vala
public string summary { owned get { return "%d items".printf (count); } }
public int count { get; set; }
public unowned Object model { get; private set; }  // unowned storage too
```

## 4. Transfer casts

```vala
void take (owned string s) { stash = (owned) s; }   // store without copying
string stash;

string s = "hello";
take ((owned) s);          // no copy; s is now null (verified)

SourceFunc cb = foo.callback;
Idle.add ((owned) cb);     // delegates with targets must be moved, not copied

uint8[] buf = new uint8[4096];
var bytes = new Bytes.take ((owned) buf);   // hand buffer to GBytes
```

Without `(owned)`, valac copies strings/arrays and refuses to copy delegates
that carry a closure ("delegates with a target are not copyable").

## 5. Cycles, `weak` and `WeakRef`

Ref-counting cannot free cycles (`parent.child = c; c.parent = parent`). Break
one edge:

```vala
class Node : Object {
    public weak Node? parent;    // back-pointer: no ref
    public Node? child;
}
```

Verified with `valac -C`: a `weak` field is a plain pointer assignment — it is
**not** a GObject weak pointer and is **not** cleared when the target dies.
Dereferencing it afterwards is a use-after-free. Use `weak` only when the
pointee is guaranteed to outlive the holder (child → parent where the parent
owns the child). Otherwise use `GLib.WeakRef`:

```vala
var wr = WeakRef (obj);
obj = null;
var again = wr.get () as Foo;    // null once finalized
if (again != null) again.poke ();
```

`WeakRef` wraps `GWeakRef`, which registers its own address — **never copy it
by value** (e.g. passing it as an `owned WeakRef` parameter). Doing so hung the
test program in this sandbox. Create it where it will live (a field or a
closure-captured local).

## 6. Closures capture `this` (the #1 leak)

Verified in generated C: **any lambda written inside an instance method holds a
strong `g_object_ref (self)`**, even if the lambda body never mentions `this`.
A repeating source or a signal on a longer-lived emitter therefore keeps the
object alive forever and `dispose`/`~Foo ()` never run.

```vala
public class Poller : Object {
    private uint source_id = 0;
    public int ticks = 0;

    // LEAKS: the closure owns `this` until the source is removed
    public void start_leaky () {
        source_id = Timeout.add (5, () => { ticks++; return Source.CONTINUE; });
    }

    // OK: build the closure in a static method so only the WeakRef is captured
    public void start_safe () {
        source_id = schedule (this);
    }
    private static uint schedule (Poller target) {
        var weak_self = WeakRef (target);
        return Timeout.add (5, () => {
            var self = weak_self.get () as Poller;
            if (self == null) return Source.REMOVE;
            self.ticks++;
            return Source.CONTINUE;
        });
    }

    public void stop () {
        if (source_id != 0) { Source.remove (source_id); source_id = 0; }
    }
    ~Poller () { print ("finalized\n"); }
}
```

Test result: dropping the last external reference finalizes the `start_safe`
poller immediately; the `start_leaky` one stays alive until `stop ()`.

Practical rules:
- Every `Timeout.add`/`Idle.add`/`signal.connect` with a lambda in an instance
  method needs a matching `Source.remove`/`disconnect` in an explicit
  `stop ()`/`shutdown ()` (not in `dispose`, which the cycle prevents).
- Signals on objects owned by `this` (child widgets) are fine: the cycle is
  broken when the parent drops the child.
- **Prefer method handlers over lambdas for signals.** Verified: in an
  `Object` subclass, `emitter.sig.connect (this.on_sig)` compiles to
  `g_signal_connect_object (emitter, …, self, 0)` — it takes **no** ref on
  `this` and auto-disconnects when `this` is finalized. A lambda handler
  compiles to a closure block that owns `self` (cycle until disconnected).

## 7. Nullable types

`Foo?` documents and (with `--enable-experimental-non-null`) enforces that a
value may be null. For GIR consumers it becomes `(nullable)`; GJS refuses
`null` for non-nullable parameters. Mark every parameter that may be null.

## 8. Compact classes, structs, pointers

```vala
[Compact]                              // plain C struct + free function, no GType
public class Entry {
    public string text;
    public int64 stamp;
    public Entry (string t) { text = t; stamp = get_real_time (); }
}

public struct Point { public double x; public double y; }   // value type

Entry* e = new Entry ("x");            // manual memory: you must `delete e;`
delete e;
```

Compact classes are invisible to GObject Introspection (no GType) — do not use
them in GIR-facing API. Structs are copied by value; a struct containing
`string` fields gets generated copy/destroy functions.

## 9. Checking ownership

```sh
valac -C --pkg gio-2.0 file.vala        # read file.c: look for g_object_ref,
grep -n "g_object_ref\|_data1_->self" file.c   # closure blocks holding self
G_DEBUG=gc-friendly valgrind --leak-check=full ./prog   # leaks
meson setup _b -Db_sanitize=address      # ASan/LSan on generated C
```

GObject refcount debugging: set a breakpoint on `g_object_ref`/`g_object_unref`
with a condition on the instance, or use `GOBJECT_DEBUG=instance-count` with
`GTK_DEBUG=interactive` → Statistics (needs a GLib built with debug; **unverified**
on distro builds).

## 10. Sources

- docs.vala.dev tutorial 4.9 (weak references), 4.10 (ownership), guide
  "Memory management" — `vala-lang/vala-docs/docs/{tutorials/main/04-00-advanced-features,guides}/`
- GObject refcounting and weak refs: https://docs.gtk.org/gobject/concepts.html#object-memory-management
- `GWeakRef` must not be moved: https://docs.gtk.org/gobject/struct.WeakRef.html
- Behaviour of closures/`weak` verified by inspecting `valac 0.56.16 -C` output.
