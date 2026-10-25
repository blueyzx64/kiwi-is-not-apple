# D-Bus services with zbus 6

Summary: how to expose a Kiwi helper on the session bus with zbus 6's `#[interface]`
macro, including properties, signals, typed errors and safe name acquisition, and how
the GJS extension consumes it via `Gio.DBusProxy.makeProxyWrapper`.

## Contents
1. Cargo features (zbus 6)
2. A minimal service
3. Properties, signals, errors
4. Emitting signals from outside a method
5. Generated client proxy (Rust)
6. Calling from GJS
7. Introspection XML as the contract
8. Debugging with busctl / gdbus
9. Pitfalls

---

## 1. Cargo features

```toml
[dependencies]
zbus = "6"            # default: proxy, service, object-manager, tracing, default-rt
serde = { version = "1", features = ["derive"] }
thiserror = "2"
```

zbus 6 merged `zvariant` and `zbus_names` into `zbus` (types at the root, codecs in
`zbus::wire`, `Value` renamed `Variant`) and **removed the blocking API**. MSRV 1.89.

## 2. A minimal service

```rust
use zbus::{connection, interface};

struct Clipboard { entries: Vec<Entry> }

#[interface(name = "io.github.kem_a.Kiwi.Clipboard1")]
impl Clipboard {
    /// Store one entry captured by the Shell. Returns its id.
    async fn add_text(&mut self, text: String, mime: String) -> u64 { /* … */ 0 }

    /// Most recent `limit` entries as (id, preview, mime, timestamp_usec).
    async fn list(&self, limit: u32) -> Vec<(u64, String, String, i64)> { vec![] }
}

fn main() -> anyhow::Result<()> {
    zbus::block_on(async {
        // zbus 6 book style: builder steps are infallible, errors surface at build()
        // (zbus 5 needed `?` after session()/name()/serve_at()).
        let _conn = connection::Builder::session()
            .name("io.github.kem_a.Kiwi.Clipboard")
            .serve_at("/io/github/kem_a/Kiwi/Clipboard", Clipboard { entries: vec![] })
            .build()
            .await?;
        std::future::pending::<()>().await;
        Ok(())
    })
}
```

Method names are converted to D-Bus CamelCase (`add_text` → `AddText`). Use
`connection::Builder` so handlers are registered **before** the name is requested —
the zbus book warns that activated services may receive calls immediately after
taking the name.

## 3. Properties, signals, errors

```rust
use zbus::{fdo, interface, object_server::SignalEmitter};

#[derive(Debug, thiserror::Error, zbus::DBusError)]
#[zbus(prefix = "io.github.kem_a.Kiwi.Clipboard1.Error")]
enum ClipError {
    #[zbus(error)]
    ZBus(zbus::Error),
    /// Entry id does not exist.
    NotFound(String),
    /// Payload larger than MaxEntryBytes.
    TooLarge(String),
}

#[interface(name = "io.github.kem_a.Kiwi.Clipboard1")]
impl Clipboard {
    async fn remove(
        &mut self,
        id: u64,
        #[zbus(signal_emitter)] emitter: SignalEmitter<'_>,
    ) -> Result<(), ClipError> {
        let pos = self.entries.iter().position(|e| e.id == id)
            .ok_or_else(|| ClipError::NotFound(format!("no entry {id}")))?;
        self.entries.remove(pos);
        Self::entry_removed(&emitter, id).await?;
        Ok(())
    }

    #[zbus(property)]
    async fn max_entries(&self) -> u32 { self.max }

    #[zbus(property)]                 // setter auto-emits PropertiesChanged
    async fn set_max_entries(&mut self, v: u32) -> fdo::Result<()> {
        if v == 0 { return Err(fdo::Error::InvalidArgs("must be > 0".into())); }
        self.max = v; Ok(())
    }

    #[zbus(property)]
    async fn version(&self) -> u32 { 1 }  // interface revision, see interop file

    #[zbus(signal)]
    async fn entry_removed(emitter: &SignalEmitter<'_>, id: u64) -> zbus::Result<()>;
}
```

Error replies surface in GJS as `Gio.DBusError` with the remote name
(`io.github.kem_a.Kiwi.Clipboard1.Error.NotFound`), which callers can match with
`Gio.DBusError.get_remote_error(e)`.

## 4. Emitting from outside a method

```rust
let iface = conn.object_server()
    .interface::<_, Clipboard>("/io/github/kem_a/Kiwi/Clipboard").await?;
iface.get_mut().await.max = 50;
iface.get().await.max_entries_changed(iface.signal_emitter()).await?;
iface.entry_removed(42).await?;   // generated `ClipboardSignals` trait on InterfaceRef
```

## 5. Generated client proxy (Rust)

```rust
#[interface(
    name = "io.github.kem_a.Kiwi.Clipboard1",
    proxy(default_path = "/io/github/kem_a/Kiwi/Clipboard",
          default_service = "io.github.kem_a.Kiwi.Clipboard"),
)]
impl Clipboard { /* … */ }
// -> ClipboardProxy::new(&conn).await?.list(10).await?
```

Limitation: service methods must return owned, `DeserializeOwned` types for the proxy.
For a third-party XML, generate a proxy with `zbus-xmlgen` (crate `zbus_xmlgen` 6.0.0):
`zbus-xmlgen file interface.xml` (or `-` for stdin), or `zbus-xmlgen session <name> <path>`
to introspect a live service (https://docs.rs/crate/zbus_xmlgen/6.0.0).

## 6. Calling from GJS (the Kiwi side)

```js
// apps/clipboard/helperClient.js  (adapter — the only file that knows D-Bus)
import Gio from 'gi://Gio';

const NAME = 'io.github.kem_a.Kiwi.Clipboard';
const PATH = '/io/github/kem_a/Kiwi/Clipboard';
const IFACE_XML = `<node>
  <interface name="io.github.kem_a.Kiwi.Clipboard1">
    <method name="AddText"><arg type="s" direction="in"/><arg type="s" direction="in"/>
      <arg type="t" direction="out"/></method>
    <method name="List"><arg type="u" direction="in"/><arg type="a(tssx)" direction="out"/></method>
    <method name="Remove"><arg type="t" direction="in"/></method>
    <property name="MaxEntries" type="u" access="readwrite"/>
    <property name="Version" type="u" access="read"/>
    <signal name="EntryRemoved"><arg type="t"/></signal>
  </interface></node>`;
const ClipboardProxy = Gio.DBusProxy.makeProxyWrapper(IFACE_XML);

export class ClipboardHelperClient {
    constructor() { this._cancellable = new Gio.Cancellable(); this._proxy = null; }

    async connect() {
        // Static newAsync() exists since GJS 1.75.2 (GJS NEWS), i.e. all GNOME 48+.
        this._proxy = await ClipboardProxy.newAsync(
            Gio.DBus.session, NAME, PATH, this._cancellable,
            Gio.DBusProxyFlags.DO_NOT_AUTO_START_AT_CONSTRUCTION);
        this._sigId = this._proxy.connectSignal('EntryRemoved',
            (_proxy, _sender, [id]) => this.onRemoved?.(id));
    }

    async list(limit) {
        const [items] = await this._proxy.ListAsync(limit);   // promise of out-args array
        return items.map(([id, preview, mime, ts]) => ({ id, preview, mime, ts }));
    }

    destroy() {
        this._cancellable.cancel();
        if (this._sigId) this._proxy?.disconnectSignal(this._sigId);
        this._proxy = null;
    }
}
```

Calling the wrapper without `new` is deprecated in GJS. GJS generates `<Method>Async` (Promise), `<Method>Remote` (callback) and `<Method>Sync`
for each method — **never use `Sync` in the Shell**. Properties are plain JS
properties on the proxy (cached; listen to `g-properties-changed`).

## 7. Introspection XML as the contract

Check the XML into the repo (`dbus/io.github.kem_a.Kiwi.Clipboard1.xml`). The GJS
adapter imports it (or embeds the same string) and a contract test diffs it against
the live service:

```sh
dbus-run-session -- sh -c '
  target/debug/kiwi-clipboardd & sleep 0.5
  gdbus introspect --session --dest io.github.kem_a.Kiwi.Clipboard \
    --object-path /io/github/kem_a/Kiwi/Clipboard --xml \
  | xmllint --xpath "//interface[@name=\"io.github.kem_a.Kiwi.Clipboard1\"]" - \
  | diff -u <(xmllint --xpath "//interface" dbus/io.github.kem_a.Kiwi.Clipboard1.xml) -'
```

## 8. Debugging

```sh
busctl --user list | grep Kiwi
busctl --user introspect io.github.kem_a.Kiwi.Clipboard /io/github/kem_a/Kiwi/Clipboard
busctl --user call io.github.kem_a.Kiwi.Clipboard /io/github/kem_a/Kiwi/Clipboard \
       io.github.kem_a.Kiwi.Clipboard1 List u 5
dbus-monitor --session "interface='io.github.kem_a.Kiwi.Clipboard1'"
```

## 9. Pitfalls

- Request the name after serving objects (use the builder).
- Do not call `zbus::block_on` inside an interface method — it panics.
- Large payloads (images): pass a file descriptor (`zbus::OwnedFd`, `h` type) or a path,
  not megabytes of `ay`.
- Treat every argument as untrusted: any session-bus client can call you. Validate
  sizes; no shell-outs with arguments.
- Signals are broadcast; never put clipboard *contents* in a signal — send ids.

Sources: zbus book *Writing a service interface*, *Upgrading to zbus 6.0*, *FAQ* —
https://z-galaxy.github.io/zbus/ (the old dbus2.github.io/zbus URL 404s);
GJS `Gio.DBusProxy.makeProxyWrapper` — https://gjs.guide/guides/gio/dbus.html and
https://gitlab.gnome.org/GNOME/gjs/-/blob/master/modules/core/overrides/Gio.js.
`#[zbus(prefix = …)]` on `DBusError` — https://docs.rs/zbus/6.1.0/zbus/derive.DBusError.html ;
`InterfaceRef::get/get_mut/signal_emitter` — https://docs.rs/zbus/6.1.0/zbus/object_server/struct.InterfaceRef.html ;
generated `<Iface>Signals` trait on `InterfaceRef` and `SignalEmitter` — https://docs.rs/zbus/6.1.0/zbus/attr.interface.html .
