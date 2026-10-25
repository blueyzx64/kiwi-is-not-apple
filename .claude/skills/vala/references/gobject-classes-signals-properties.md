# Vala GObject classes, properties and signals

Summary: a Vala `class Foo : Object` is a full GType with GObject properties,
signals and virtual methods, visible to C, GJS (via GIR) and D-Bus. Use
`Object (prop: value)` + `construct {}` (GObject-style construction) for anything
that GJS or GtkBuilder will instantiate.

## Contents
1. Class anatomy
2. Construction: constructors vs `construct` blocks
3. Properties (auto, custom, notify, construct-only)
4. Signals (declare, emit, connect, disconnect, details)
5. Inheritance: abstract, virtual, override, base
6. Interfaces and mixins
7. Destruction (`dispose`/`finalize` equivalents)
8. Runtime type info and casting
9. Sources

## 1. Class anatomy

```vala
namespace Kiwi {
    public class Indexer : Object {
        // private field (not a property)
        private uint scan_source = 0;

        // public auto-property: generates GParamSpec, getter/setter, notify
        public string root { get; construct; }
        public uint file_count { get; private set; default = 0; }
        public bool busy { get; set; default = false; }

        public signal void file_found (string path);
        public signal bool filter (string path);   // signals may return values

        public Indexer (string root) {
            Object (root: root);                    // chain to g_object_new
        }

        construct {
            // runs for every instantiation, including from GJS/GtkBuilder
            assert (root != null);
        }

        public void add (string path) {
            if (filter (path)) return;              // emit and read return value
            file_count++;                           // emits notify::file-count
            file_found (path);
        }
    }
}
```

Generated names: type `KiwiIndexer`, C functions `kiwi_indexer_new`,
`kiwi_indexer_add`, property `file-count` (underscores become dashes), signal
`file-found`.

## 2. Construction

GObject construction (`g_object_new`) does **not** call your Vala constructor
body when instantiated from GJS (`new Kiwi.Indexer({root: '/'})`), GtkBuilder or
`Object.new ()`. Rules:

- Put real initialisation in `construct { }` blocks; they always run.
- Keep the Vala constructor a thin `Object (prop: value, ...)` call. A Vala
  constructor body that does more than `Object (...)` is a "non-GObject-style"
  constructor and those statements are skipped for GJS callers.
- Named constructors: `public Indexer.with_defaults () { Object (root: "/"); }`
  → `kiwi_indexer_new_with_defaults` (GJS: `Kiwi.Indexer.new_with_defaults()`).
- `class construct { }` runs once per class (class_init) — e.g. to install
  CSS names or actions for widgets.
- `static construct { }` similar, runs at type registration.

## 3. Properties

```vala
public class Settings : Object {
    // auto property with default
    public int volume { get; set; default = 50; }

    // custom accessors with validation
    private string _theme = "light";
    public string theme {
        get { return _theme; }
        set {
            if (value != "light" && value != "dark") return;
            if (_theme == value) return;     // avoid spurious notify
            _theme = value;
            // notify emitted automatically after a custom setter
        }
    }

    // explicit-notify property: no automatic notify
    [CCode (notify = false)]
    public int level {
        get { return _level; }
        set {
            if (_level == value) return;
            _level = value;
            notify_property ("level");
        }
    }
    private int _level;

    // read-only to outsiders
    public bool dirty { get; private set; }

    // construct-only
    public string id { get; construct; }

    // owned getter returning a fresh object
    public string summary { owned get { return @"$theme/$volume"; } }

    // documentation shown in GIR/valadoc
    /** Seconds before auto-save. */
    [Description (nick = "Autosave delay", blurb = "Seconds before auto-save")]
    public uint autosave { get; set; default = 5; }
}
```

Observing changes:

```vala
var s = new Settings ();
s.notify["theme"].connect ((obj, pspec) => {
    print ("theme -> %s\n", ((Settings) obj).theme);
});
s.bind_property ("volume", other, "value",
                 BindingFlags.SYNC_CREATE | BindingFlags.BIDIRECTIONAL);
```

- Getters return **unowned** by default (see `memory-ownership.md`); use
  `owned get` when computing a new value.
- Auto-properties only emit `notify` when the value actually changes (valac
  0.56 generates an `old_value != value` check — verified with `valac -C`).
  Custom setters always notify at the end of the setter unless you `return`
  early, so add your own equality check (as `theme` does above).
- GSettings binding: `settings.bind ("key", obj, "prop", SettingsBindFlags.DEFAULT)`.

## 4. Signals

```vala
public class Watcher : Object {
    public signal void changed (string path, uint flags);
    [Signal (detailed = true)]
    public signal void item (string key);
    [Signal (run = "first")]                 // first|last|cleanup
    public virtual signal void reset () {    // default handler
        debug ("default reset handler");
    }
    [Signal (action = true)]                 // can be emitted by keybindings
    public signal void activate_item ();
}

var w = new Watcher ();
ulong id = w.changed.connect ((path, flags) => print ("%s\n", path));
w.changed.connect_after (on_changed);        // after default handler
w.item["clipboard"].connect ((key) => {});   // detailed connect
w.changed ("/tmp", 0);                        // emit
w.item["clipboard"] ("x");                    // detailed emit
w.disconnect (id);
SignalHandler.block (w, id);                  // temporary mute
Signal.stop_emission_by_name (w, "changed");  // from inside a handler
```

- Lambdas capture `this` and locals **strongly** (see `memory-ownership.md`).
  Always disconnect handlers on long-lived emitters (e.g. a `Gio.Settings` or
  D-Bus proxy) when the receiver goes away.
- Method handlers: `w.changed.connect (this.on_changed);` compiles to
  `g_signal_connect_object` — no ref on `this`, auto-disconnect when `this` is
  finalized (verified with `valac -C`). Prefer them to lambdas.
- Signals with return values: the last handler's value wins unless an
  accumulator is used; GJS handlers must return the declared type.

## 5. Inheritance

```vala
public abstract class ScanSource : Object {   // not "Source": shadows GLib.Source
    public abstract async string[] scan (Cancellable? c) throws Error;
    public virtual string describe () { return "source"; }
}

public class FileSource : ScanSource {
    public override async string[] scan (Cancellable? c) throws Error {
        return {};
    }
    public override string describe () {
        return "file:" + base.describe ();   // chain up
    }
}

public sealed class Leaf : Object { }        // Vala >= 0.56: G_TYPE_FLAG_FINAL
```

- Single inheritance of classes; multiple interfaces.
- `protected` members are visible to subclasses (C: still public symbols).
- Prefer `sealed` (final) classes for library API unless subclassing is a
  supported use case — it keeps the ABI simpler.

## 6. Interfaces

```vala
public interface Searchable : Object {      // prerequisite: Object
    public abstract string[] search (string query);
    public virtual bool supports (string q) { return q.length > 0; } // default impl
    public signal void results_changed ();
}

public class AppSearch : Object, Searchable {
    public string[] search (string query) { return { query }; }
}
```

Interface properties: `public abstract int limit { get; set; }` and implement
with a normal property in the class.

## 7. Destruction

```vala
public class Helper : Object {
    private uint timer = 0;
    private ulong handler = 0;
    private GLib.Settings settings = new GLib.Settings ("org.gnome.shell.extensions.kiwi");

    construct {
        timer = Timeout.add_seconds (30, () => { tick (); return Source.CONTINUE; });
        handler = settings.changed.connect (on_changed);
    }

    // `dispose` is overridable on GObject: release external references here.
    public override void dispose () {
        if (timer != 0) { Source.remove (timer); timer = 0; }
        if (handler != 0) { settings.disconnect (handler); handler = 0; }
        base.dispose ();
    }

    // Vala destructor -> finalize; runs only when the refcount hits 0.
    ~Helper () { debug ("finalized"); }

    void tick () {}
    void on_changed (string key) {}
}
```

Caveat: the timeout lambda above captures `this`, so the object can never reach
refcount 0 while the timer exists — `dispose` will not run by itself. Either
remove the source from an explicit `shutdown ()` method, or capture a
`WeakRef` (see `memory-ownership.md`). Vala `~Foo ()` is finalize, not dispose.

## 8. Runtime type information

```vala
Type t = typeof (Kiwi.Indexer);
print ("%s\n", t.name ());                   // "KiwiIndexer"
if (obj is Searchable) { }
var searchable = obj as Searchable;          // null if not
var o = Object.new (t, "root", "/");         // like g_object_new
foreach (var p in ((ObjectClass) t.class_ref ()).list_properties ())
    print ("%s\n", p.name);
```

`(Foo) obj` is an unchecked C cast in release builds (it becomes a checked
`G_TYPE_CHECK_INSTANCE_CAST` only when GLib cast checks are enabled); prefer `as`
plus a null check for values from outside.

## 9. Sources

- docs.vala.dev tutorial 3.1–3.13 (OOP: construction, destruction, signals,
  properties, interfaces, RTTI) — `vala-lang/vala-docs/docs/tutorials/main/03-00-object-oriented-programming/`
- GObject construction model: https://docs.gtk.org/gobject/concepts.html#object-instantiation
- `sealed` keyword: Vala 0.56 release notes (**unverified** here beyond successful
  compilation with valac 0.56.16).
