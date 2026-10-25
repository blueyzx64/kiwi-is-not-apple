# Vala language basics

Summary: Vala is a C#-like language that compiles to C + GObject. Types map 1:1 to
GLib types (`string` = `char*` UTF-8, `int` = `gint`, `uint8[]` = buffer + length).
Errors are GError-based exceptions; null-safety is opt-in and mostly advisory.

## Contents
1. Source files and compilation
2. Types and literals
3. Strings
4. Arrays and collections
5. Nullability
6. Control flow, foreach, switch
7. Errors (`throws`, `try`, `errordomain`)
8. Namespaces, `using`, attributes
9. Logging and contracts
10. Sources

## 1. Source files and compilation

```vala
// hello.vala
int main (string[] args) {
    print ("Hello %s\n", args.length > 1 ? args[1] : "world");
    return 0;
}
```

```sh
valac hello.vala            # links glib-2.0 + gobject-2.0 by default
valac --pkg gio-2.0 x.vala  # add a package (looks for gio-2.0.vapi + pkg-config)
valac -C x.vala             # emit x.c only — read it to understand ownership
```

`--pkg NAME` resolves both `NAME.vapi` (Vala bindings) and the pkg-config module.
Vala code is UTF-8; one file may hold many classes; the file name is irrelevant.

## 2. Types and literals

| Vala | C | Note |
|---|---|---|
| `bool` | `gboolean` | `true`/`false` |
| `int`, `uint`, `long`, `int64`, `uint8`… | `gint`, `guint`, … | sized types exist (`int32`, `uint16`) |
| `double`, `float` | `gdouble`, `gfloat` | |
| `char`, `unichar` | `gchar`, `gunichar` | `unichar` = Unicode code point |
| `string` | `gchar*` (UTF-8, owned) | immutable, refcount-free (copied on assign) |
| `Object`, any class | `GObject*` | reference counted |
| `struct` | C struct, value type | copied by value |
| `enum`, `[Flags] enum` | registered `GEnum`/`GFlags` | `.to_string ()` gives nick |
| `Variant` | `GVariant*` | D-Bus/GSettings values |

```vala
var n = 42;                 // type inference
const int MAX = 10;
int64 big = 1LL << 40;      // plain literals are int; 1 << 40 overflows
uint8[] bytes = { 0x00, 0xff };
var t = (n > 0) ? "pos" : "neg";
```

`var` works for locals only. Implicit numeric narrowing is a C-style truncation,
not an error.

## 3. Strings

```vala
string name = "Kiwi";
string s = @"Hi $name, len=$(name.length)";   // string templates
string f = "%s has %d bytes".printf (name, name.length);
bool has = name.contains ("iw");
string[] parts = "a,b,c".split (",");
string joined = string.joinv ("|", parts);
string up = name.up ();                       // returns new string
unowned string view = name;                   // borrow, no copy
string? maybe = Environment.get_variable ("HOME");
var sb = new StringBuilder ();
sb.append_printf ("%d", 3);
string verbatim = """no "escapes" here""";
```

- `length` is **bytes**, not characters; use `char_count ()` and
  `get_char (index)` / `index_of_nth_char ()` for code points.
- `s[i]` returns a `char` (byte). Slicing `s[a:b]` is byte-based and can split a
  UTF-8 sequence — use `substring` with `index_of_nth_char`.
- `==` on strings compares contents (generated `g_strcmp0`).

## 4. Arrays and collections

```vala
int[] a = { 1, 2, 3 };
a += 4;                          // append (reallocates)
int[] b = a[1:3];                // slice -> {2,3} (copy)
foreach (int x in a) print ("%d\n", x);
int[,] grid = new int[3, 3];     // multidimensional

var list = new GLib.List<string> ();      // prefer GenericArray/HashTable
var arr  = new GenericArray<string> ();   // GPtrArray with free func
arr.add ("x");
var map  = new HashTable<string, int> (str_hash, str_equal);
map["a"] = 1;
if ("a" in map) print ("%d\n", map["a"]);
```

Array length is carried in a hidden `int` parameter (`array_length` in the
GIR). Libgee (`Gee.ArrayList`, `Gee.HashMap`) is nicer but adds a dependency;
for small helpers prefer GLib containers.

## 5. Nullability

```vala
string? title = null;            // ? = may be null
string label = title ?? "Untitled";
int len = title?.length ?? 0;    // safe navigation
void set_icon (Icon? icon) { … }
```

Without `--enable-experimental-non-null`, valac does **not** enforce that a
non-`?` reference is non-null; it only emits `g_return_val_if_fail (x != NULL)`
preconditions for non-nullable parameters of public methods. Annotate
nullability correctly anyway: it becomes `(nullable)` in the GIR, and GJS
throws if `null` is passed for a non-nullable argument.

## 6. Control flow

```vala
for (int i = 0; i < 10; i++) { if (i % 2 == 0) continue; }
while (cond) { … }
do { … } while (cond);
switch (cmd) {                   // strings allowed
case "start":
    start ();
    break;                       // no implicit fallthrough
default:
    break;
}
if (obj is Gtk.Button) { var b = (Gtk.Button) obj; }
var w = obj as Gtk.Widget;       // null if wrong type
```

## 7. Errors

```vala
public errordomain KiwiError {
    NOT_FOUND,
    INVALID_INPUT
}

string load (string path) throws KiwiError, FileError {
    if (path == "")
        throw new KiwiError.INVALID_INPUT ("empty path");
    string contents;
    FileUtils.get_contents (path, out contents);   // throws FileError
    return contents;
}

void caller () {
    try {
        print (load ("/etc/hostname"));
    } catch (KiwiError.INVALID_INPUT e) {
        warning ("bad input: %s", e.message);
    } catch (Error e) {                            // any GError
        warning ("%s (%s:%d)", e.message, e.domain.to_string (), e.code);
    } finally {
        debug ("done");
    }
}
```

- Errors are `GError`s: `errordomain` creates a quark + enum, usable from C/GJS.
- An uncaught error in a method without `throws` is only a **warning** at
  compile time and `g_critical` + leak at run time. Build with
  `--fatal-warnings`.
- Use `GLib.IOError.CANCELLED` (`e.matches (IOError.quark (), IOError.CANCELLED)`
  or `catch (IOError.CANCELLED e)`) to silence expected cancellations.

## 8. Namespaces and attributes

```vala
namespace Kiwi.Helper {
    public const string VERSION = "0.1";
    public class Indexer : Object { }
}
using Kiwi.Helper;               // brings names into scope
```

The namespace becomes the C prefix (`kiwi_helper_indexer_new`) and the GIR
namespace (`KiwiHelper`). Common attributes:

| Attribute | Use |
|---|---|
| `[DBus (name = "...")]` | export/consume a D-Bus interface |
| `[GtkTemplate (ui = "/res/path.ui")]`, `[GtkChild]`, `[GtkCallback]` | GTK templates |
| `[CCode (cname = "...", cheader_filename = "...")]` | control C names (vapi/bindings) |
| `[Compact]` | non-GObject class (no refcount by default) |
| `[Flags]` | GFlags enum |
| `[Version (since = "0.2", deprecated = true)]` | API versioning (shows in GIR) |

## 9. Logging and contracts

```vala
debug ("only with G_MESSAGES_DEBUG=all");
message ("info");
warning ("something odd");
critical ("bug: invariant broken");   // G_DEBUG=fatal-criticals aborts
error ("fatal");                      // aborts the process — avoid in services

// Top-level functions get bare C names: calling this `div` clashes with libc div().
int safe_div (int a, int b) requires (b != 0) ensures (result * b <= a) {
    return a / b;
}
assert (a != null);                   // compiled out with -X -DG_DISABLE_ASSERT
```

Set `G_LOG_DOMAIN` with `-X -DG_LOG_DOMAIN=\"kiwi-helper\"` (meson:
`add_project_arguments('-DG_LOG_DOMAIN="kiwi-helper"', language: 'c')`) so
`journalctl --user -g kiwi-helper` finds your logs.

## 10. Sources

- docs.vala.dev tutorial ch. 2 (basics) and 4.2 (error handling), 4.1 (contracts):
  https://docs.vala.dev — source `vala-lang/vala-docs/docs/tutorials/main/02-00-basics/`
- GLib running/debug env vars: https://docs.gtk.org/glib/running.html
- Non-null enforcement: docs.vala.dev 4.1 ("Vala does that implicitly for all
  parameters that are not marked with ?") and 5.3 strict non-null mode
  (`--enable-experimental-non-null`, static check):
  https://docs.vala.dev/tutorials/main/04-00-advanced-features/04-01-assertions-and-contract-programming.html ,
  https://docs.vala.dev/tutorials/main/05-00-experimental-features/05-03-strict-non-null-mode.html
  (`valac -C` 0.56 output showed the `g_return_*` checks on public methods).
