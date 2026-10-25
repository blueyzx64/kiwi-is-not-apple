# Vala async, GIO and D-Bus

Summary: Vala `async` methods compile to GIO's `_async`/`_finish` pairs driven by
the GLib main loop; `yield` suspends without blocking. `[DBus]` attributes turn
a class into a GDBus service or an interface into a typed client proxy. This is
the recommended shape for a Kiwi helper that GJS talks to.

## Contents
1. Main loop basics (`MainLoop`, `Application`, sources)
2. `async` / `yield` / `.begin` / `.end` / `.callback`
3. Cancellation and errors
4. Threads: off-loading blocking work
5. GIO async I/O examples (files, subprocess)
6. D-Bus service with `[DBus]`
7. D-Bus client proxy in Vala
8. Calling the service from GJS (the extension side)
9. Activation: `.service` file / systemd user unit
10. Sources

## 1. Main loop basics

```vala
var loop = new MainLoop ();                          // default MainContext
uint id = Timeout.add_seconds (5, () => { loop.quit (); return Source.REMOVE; });
Idle.add (() => { debug ("idle"); return Source.REMOVE; });
loop.run ();
```

For a long-running service prefer `GLib.Application` (single instance, D-Bus
name ownership, `--gapplication-service`, `hold ()`/`release ()` with an
inactivity timeout):

```vala
public class KiwiDaemon : Application {
    public KiwiDaemon () {
        Object (application_id: "org.example.Kiwi.Daemon",
                flags: ApplicationFlags.IS_SERVICE);
        inactivity_timeout = 60000;                  // ms after last release(); no 60_000 digit separators in Vala
    }
    public override bool dbus_register (DBusConnection conn, string path) throws Error {
        base.dbus_register (conn, path);
        conn.register_object (path, new ClipboardService ());
        return true;
    }
}
int main (string[] args) { return new KiwiDaemon ().run (args); }
```

Sources return `Source.CONTINUE` (true) to repeat and `Source.REMOVE` (false) to
stop. Keep the returned id and `Source.remove (id)` on shutdown.

## 2. `async` and `yield`

```vala
async int compute (int x) {
    Idle.add (compute.callback);   // schedule our own resumption
    yield;                         // return to caller / main loop
    return x * 2;
}

async void run () {
    int r = yield compute (21);    // await another async method
    print ("%d\n", r);
}

void start () {
    run.begin ();                                      // fire and forget
    compute.begin (1, (obj, res) => {                  // with callback
        int v = compute.end (res);                     // errors surface here
    });
}
```

- `.callback` is a `SourceFunc` that resumes the coroutine. Store it with
  `SourceFunc cb = foo.callback;` and pass it on with `(owned) cb`.
- `out` parameters move from `.begin ()` to `.end ()`.
- In C/GIR an `async` method `foo` becomes `foo (…, GAsyncReadyCallback, gpointer)`
  + `foo_finish (GAsyncResult*, …)`; GJS can wrap it with
  `Gio._promisify(Klass.prototype, 'foo', 'foo_finish')` (verified).
- Async methods need `--pkg gio-2.0`.

## 3. Cancellation and errors

```vala
async void load_all (File[] files, Cancellable? cancellable) throws Error {
    foreach (var f in files) {
        cancellable?.set_error_if_cancelled ();      // throws IOError.CANCELLED
        uint8[] data;
        yield f.load_contents_async (cancellable, out data, null);
    }
}

var c = new Cancellable ();
load_all.begin (files, c, (obj, res) => {
    try {
        load_all.end (res);
    } catch (IOError.CANCELLED e) {
        // expected on shutdown: stay quiet
    } catch (Error e) {
        warning ("load failed: %s", e.message);
    }
});
c.cancel ();
```

Always pass a `Cancellable` to helper operations and cancel it on shutdown or
when the D-Bus client disappears.

## 4. Threads

Blocking calls (hashing, directory walks, SQLite) belong in a worker thread; hand
the result back to the main context with `Idle.add`:

```vala
async string hash_file (File file, Cancellable? cancellable) throws Error {
    string? result = null;
    Error? err = null;
    SourceFunc callback = hash_file.callback;
    new Thread<void> ("kiwi-hash", () => {
        try {
            uint8[] data;
            file.load_contents (cancellable, out data, null);
            result = Checksum.compute_for_data (ChecksumType.SHA256, data);
        } catch (Error e) {
            err = e;
        }
        Idle.add ((owned) callback);                 // resume on main context
    });
    yield;
    if (err != null) throw err;
    return result;
}
```

Rules: never touch GTK widgets or a `DBusConnection`'s exported objects from the
worker; communicate by values; use `ThreadPool<T>` for many small jobs;
protect shared state with `Mutex`/`lock (field) { }`. Verified: the snippet above
compiles with valac 0.56 and runs.

## 5. GIO async I/O examples

```vala
void ensure_dir (File dir, Cancellable? c) throws Error {
    try {
        dir.make_directory_with_parents (c);         // sync but cheap
    } catch (IOError.EXISTS e) {
        // already there: fine
    }
}

async void save_atomically (File file, string json, Cancellable? c) throws Error {
    // replace_contents writes to a temp file and renames: crash-safe
    yield file.replace_contents_async (json.data, null, false,
                                       FileCreateFlags.PRIVATE, c, null);
}

async string run_cmd (Cancellable? c) throws Error {
    var proc = new Subprocess (SubprocessFlags.STDOUT_PIPE, "uname", "-s");
    string out_buf;
    yield proc.communicate_utf8_async (null, c, out out_buf, null);
    return out_buf;
}
```

File monitoring: `var m = dir.monitor_directory (FileMonitorFlags.WATCH_MOVES, c);
m.changed.connect ((f, other, ev) => …);` — keep a reference to `m`, or it is
finalized and stops reporting.

## 6. D-Bus service with `[DBus]`

Verified with `dbus-run-session`, `gdbus introspect` and the GJS client in §8.

```vala
[DBus (name = "org.example.Kiwi.Clipboard1")]
public class ClipboardService : Object {
    private const int MAX_TEXT = 1024 * 1024;
    private string[] history = {};

    public uint max_items { get; set; default = 20; }       // property MaxItems
    public signal void item_added (string text);              // signal ItemAdded

    // BusName parameter is filled by GDBus and hidden from the interface.
    public void push (string text, BusName sender) throws DBusError, IOError {
        if (text.length > MAX_TEXT)
            throw new DBusError.INVALID_ARGS ("text larger than %d bytes", MAX_TEXT);
        string[] next = { text };
        foreach (unowned string s in history) {
            if (next.length >= max_items) break;
            if (s != text) next += s;
        }
        history = next;
        debug ("push from %s", sender);
        item_added (text);
    }

    public string[] list () throws DBusError, IOError {     // method List -> as
        return history;
    }

    public async string slow_upper (string text) throws DBusError, IOError {
        Timeout.add (10, slow_upper.callback);               // async handler:
        yield;                                               // reply sent later
        return text.up ();
    }

    [DBus (visible = false)]
    public void internal_reset () { history = {}; }
}

int main () {
    var loop = new MainLoop ();
    uint owner_id = Bus.own_name (BusType.SESSION, "org.example.Kiwi.Clipboard",
        BusNameOwnerFlags.NONE,
        (conn) => {
            try {
                conn.register_object ("/org/example/Kiwi/Clipboard", new ClipboardService ());
            } catch (IOError e) {
                critical ("register_object: %s", e.message);
                loop.quit ();
            }
        },
        () => debug ("name acquired"),
        () => { warning ("name lost or bus unavailable"); loop.quit (); });
    loop.run ();
    Bus.unown_name (owner_id);
    return 0;
}
```

Notes:
- Names are mangled `snake_case` → `CamelCase` (`slow_upper` → `SlowUpper`).
  Override with `[DBus (name = "Foo")]` on a member.
- Every exported method must declare `throws DBusError, IOError` (or a
  `[DBus (name = "org.example.Error")] errordomain` you define); thrown errors
  become D-Bus error replies (`DBusError.INVALID_ARGS` →
  `org.freedesktop.DBus.Error.InvalidArgs`).
- Use `GLib.Variant`, `HashTable<string, Variant>` (`a{sv}`), structs and arrays
  for complex payloads. Avoid huge replies; page results (`offset`, `limit`).
- Clipboard *capture* is not possible from a helper on Wayland (Mutter has no
  clipboard-manager protocol for clients); the Shell captures, the helper only
  persists (see the `rust-gnome` skill for the same constraint).
- Security: the session bus is reachable by every process of the user,
  including Flatpak apps only if they are granted `--talk-name`. Validate input,
  cap sizes, never execute strings, and store data with `FileCreateFlags.PRIVATE`.

## 7. D-Bus client proxy in Vala

```vala
[DBus (name = "org.example.Kiwi.Clipboard1")]
interface Clipboard : Object {
    public abstract uint max_items { get; set; }
    public signal void item_added (string text);
    public abstract void push (string text) throws DBusError, IOError;
    public abstract string[] list () throws DBusError, IOError;
    public abstract async string slow_upper (string text) throws DBusError, IOError;
}

async void use_it () {
    try {
        Clipboard proxy = yield Bus.get_proxy<Clipboard> (BusType.SESSION,
            "org.example.Kiwi.Clipboard", "/org/example/Kiwi/Clipboard");
        proxy.item_added.connect ((t) => print ("added %s\n", t));
        proxy.push ("hello");                         // sync call (blocks!)
        print ("%s\n", yield proxy.slow_upper ("x")); // async call
    } catch (Error e) {
        warning ("%s", e.message);
    }
}
```

Watch for the service appearing/disappearing with
`Bus.watch_name (BusType.SESSION, name, BusNameWatcherFlags.NONE, on_appeared, on_vanished)`.
Proxy methods declared without `async` are **synchronous** round-trips; use
`async` declarations in GUI code.

## 8. Calling the service from GJS

Verified against the service above (gjs 1.80):

```js
import Gio from 'gi://Gio';

const IFACE = `<node><interface name="org.example.Kiwi.Clipboard1">
  <method name="Push"><arg type="s" direction="in" name="text"/></method>
  <method name="List"><arg type="as" direction="out" name="result"/></method>
  <method name="SlowUpper"><arg type="s" direction="in"/><arg type="s" direction="out"/></method>
  <signal name="ItemAdded"><arg type="s" name="text"/></signal>
  <property name="MaxItems" type="u" access="readwrite"/>
</interface></node>`;
const ClipboardProxy = Gio.DBusProxy.makeProxyWrapper(IFACE);

const proxy = ClipboardProxy(Gio.DBus.session,
    'org.example.Kiwi.Clipboard', '/org/example/Kiwi/Clipboard');
const sigId = proxy.connectSignal('ItemAdded', (_p, _sender, [text]) => log(text));
await proxy.PushAsync('two');                 // never *Sync inside gnome-shell
const [items] = await proxy.ListAsync();
try {
    await proxy.PushAsync('x'.repeat(2 * 1024 * 1024));
} catch (e) {
    Gio.DBusError.strip_remote_error(e);      // mutates e.message, returns bool
    console.warn(e.message);                  // "text larger than 1048576 bytes"
}
proxy.disconnectSignal(sigId);                // in the extension's disable()
```

Get the XML from the running service with
`gdbus introspect --session -d NAME -o PATH --xml` and commit it next to the
extension code so both sides stay in sync.

## 9. Activation

D-Bus activation (`$datadir/dbus-1/services/org.example.Kiwi.Clipboard.service`):

```ini
[D-BUS Service]
Name=org.example.Kiwi.Clipboard
Exec=/usr/libexec/kiwi-clipboard-helper
SystemdService=kiwi-clipboard-helper.service
```

systemd user unit (`$prefix/lib/systemd/user/kiwi-clipboard-helper.service`):

```ini
[Unit]
Description=Kiwi clipboard history helper
PartOf=graphical-session.target

[Service]
Type=dbus
BusName=org.example.Kiwi.Clipboard
ExecStart=/usr/libexec/kiwi-clipboard-helper
```

An extension published on extensions.gnome.org cannot install either file;
users must install the helper package separately and the extension must work
without it. (Packaging rules: **unverified** against the current EGO review
guidelines — check https://gjs.guide/extensions/review-guidelines/review-guidelines.html.)

## 10. Sources

- docs.vala.dev tutorial 4.7 (main loop), 4.8 (async methods), 4.6 (threads),
  4.14 (D-Bus integration) — `vala-lang/vala-docs/docs/tutorials/main/04-00-advanced-features/`
- GIO async pattern / GTask: https://docs.gtk.org/gio/class.Task.html
- GDBus: https://docs.gtk.org/gio/class.DBusConnection.html
- GJS D-Bus guide: https://gjs.guide/guides/gio/dbus.html (not reachable here;
  `makeProxyWrapper` behaviour verified by running gjs 1.80)
- systemd `Type=dbus`: https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html
