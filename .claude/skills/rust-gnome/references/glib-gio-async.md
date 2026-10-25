# GLib / Gio async in Rust

Summary: the GLib main loop runs every GTK callback on one thread; long work must move
off it. This file covers `glib::spawn_future_local`, `gio::spawn_blocking`,
`async-channel`, running Tokio or zbus next to GLib, and the Gio APIs a helper needs.

## Contents
1. The main context in one paragraph
2. Spawning futures on the main loop
3. Offloading blocking work
4. Channels between threads and the main loop
5. Tokio alongside GLib
6. zbus alongside GLib
7. Timeouts and idle sources
8. Gio: files, monitors, settings, cancellation
9. Headless daemons (no GTK)
10. Checklist

---

## 1. The main context

`glib::MainContext::default()` is the per-process default context; `Application::run()`
iterates it on the main thread. Every signal handler, `spawn_future_local` future,
timeout and idle callback executes there, one at a time. A handler that takes 200 ms
freezes the UI for 200 ms. The same rule applies to the GJS side: the Shell's main
loop is the compositor's — blocking it stalls the whole desktop.

## 2. Spawning futures on the main loop

```rust
use glib::clone;
use gtk::{gio, glib, prelude::*};

button.connect_clicked(move |button| {
    glib::spawn_future_local(clone!(
        #[weak] button,
        async move {
            button.set_sensitive(false);
            let ok = gio::spawn_blocking(|| expensive_scan())   // thread pool
                .await
                .expect("task panicked");
            button.set_sensitive(ok);
        }
    ));
});
```

- `glib::spawn_future_local` — `!Send` futures, runs on the thread-default context;
  may touch widgets.
- `glib::spawn_future` / `MainContext::spawn` — `Send` futures.
- Both return a `JoinHandle`; keep it to `abort()` on teardown.

## 3. Offloading blocking work

`gio::spawn_blocking(closure)` runs on GLib's thread pool and returns an awaitable
handle (`Result<T, Box<dyn Any + Send>>` — `Err` means panic). Use it for hashing,
directory walks, image decoding. Never touch GTK objects inside: they are `!Send`.

Prefer Gio's own async methods when they exist (`file.load_contents_future()`,
`enumerate_children_future()`), which avoid extra threads.

## 4. Channels

`async-channel` (book's recommendation) bridges worker threads/tasks to the UI:

```rust
let (tx, rx) = async_channel::bounded::<Progress>(16);

gio::spawn_blocking(move || {
    for p in index_files() {
        tx.send_blocking(p).expect("channel open");   // blocking send from thread
    }
});

glib::spawn_future_local(async move {
    while let Ok(p) = rx.recv().await {
        progress_bar.set_fraction(p.fraction);
    }
});
```

Bounded channels give back-pressure. `glib::MainContext::channel` (and its
Sender/Receiver) was removed in gtk-rs-core 0.19 (glib 0.19, Feb 2024); do not use old
tutorials that rely on it.

## 5. Tokio alongside GLib

Needed only when a dependency requires a Tokio reactor (e.g. `reqwest`). Do **not**
use `#[tokio::main]` or a top-level `block_on` — that would park a Tokio thread under
the GLib loop. Keep a lazily-built runtime and hand results back over a channel:

```rust
use std::sync::OnceLock;
use tokio::runtime::Runtime;

fn runtime() -> &'static Runtime {
    static RT: OnceLock<Runtime> = OnceLock::new();
    RT.get_or_init(|| Runtime::new().expect("tokio runtime"))
}

let (tx, rx) = async_channel::bounded(1);
runtime().spawn(async move { tx.send(fetch().await).await.ok(); });
glib::spawn_future_local(async move { if let Ok(r) = rx.recv().await { show(r) } });
```

## 6. zbus alongside GLib

zbus 6 is runtime-agnostic: with its default `default-rt` feature, "a connection built
outside a `zbus::block_on` call is run by that backend's own helper thread", so it can
be awaited directly from `glib::spawn_future_local` with no integration:

```rust
glib::spawn_future_local(async move {
    let conn = zbus::Connection::session().await?;
    let proxy = ClipboardProxy::new(&conn).await?;
    let items = proxy.list(20).await?;
    model.replace(items);
    Ok::<_, zbus::Error>(())
});
```

zbus 6 removed the blocking API (`blocking-api` feature gone) — old `zbus::blocking::*`
snippets will not compile. Enable zbus's `tokio` feature only if the program already
runs Tokio.

## 7. Timeouts and idle sources

```rust
let id = glib::timeout_add_local(std::time::Duration::from_millis(500), move || {
    refresh();
    glib::ControlFlow::Continue          // or Break to stop
});
// later: id.remove();   (SourceId is consumed — store it in an Option)
glib::timeout_future(Duration::from_secs(1)).await;   // inside async code
```

Every source you add is a resource you must remove on shutdown — same discipline as
`GLib.Source.remove` in the extension (cf. `apps/calendar.js:167-171`).

## 8. Gio essentials

```rust
use gtk::gio::{self, prelude::*};

// Files
let file = gio::File::for_path(glib::user_data_dir().join("kiwi/clipboard.db"));
let (bytes, _etag) = file.load_contents_future().await?;

// Monitoring (keep the monitor alive or it stops emitting)
let monitor = dir.monitor_directory(gio::FileMonitorFlags::WATCH_MOVES, gio::Cancellable::NONE)?;
monitor.connect_changed(|_, f, _other, ev| on_change(f, ev));

// GSettings — the helper may read Kiwi's schema if it is installed system-wide
let settings = gio::Settings::new("org.gnome.shell.extensions.kiwi");
settings.bind("clipboard-history-size", &spin, "value").build();

// Cancellation
let cancel = gio::Cancellable::new();
// pass Some(&cancel) to *_async calls; cancel.cancel() on shutdown
```

Caveat: Kiwi's schema lives in the extension's `schemas/` dir, not the global schema
path, so `gio::Settings::new` fails unless you build a `SettingsSchemaSource` from that
directory. Better: the extension passes needed settings over D-Bus (see interop file).

## 9. Headless daemons

A D-Bus service with no UI does not need GTK or a GLib loop:

```rust
fn main() -> anyhow::Result<()> {
    zbus::block_on(async {
        let _conn = build_connection().await?;
        std::future::pending::<()>().await;   // serve forever; exit via signal/idle timer
        Ok(())
    })
}
```

Use `gio`/`glib` in a daemon only if you need their APIs (file monitors, GSettings);
then run a `glib::MainLoop` and spawn zbus futures on it instead of `block_on`.

## 10. Checklist

- [ ] No synchronous I/O, D-Bus call or sleep in a signal handler.
- [ ] Every `spawn_*`, `timeout_add*`, monitor and `Cancellable` has an owner that drops/cancels it.
- [ ] Widgets captured `#[weak]`; channels `#[strong]`.
- [ ] Exactly one runtime per role; no nested `block_on`.

Sources: gtk-rs book *The Main Event Loop* — https://gtk-rs.org/gtk4-rs/stable/latest/book/main_event_loop.html ;
zbus book *Establishing connections*, *FAQ*, *Upgrading to 6.0* — https://z-galaxy.github.io/zbus/ ;
channel removal — https://gtk-rs.org/blog/2024/06/01/new-release.html ;
`load_contents_future() -> Result<(Slice<u8>, Option<GString>), glib::Error>` —
https://docs.rs/gio/0.22.10/gio/prelude/trait.FileExtManual.html ; `spawn_future_local` /
`JoinHandle::abort` — https://docs.rs/glib/0.22.10/glib/fn.spawn_future_local.html .
