---
name: rust-gnome
description: Use when designing, writing, building or packaging Rust code for Kiwi (is not Apple) — out-of-process helpers only (a zbus D-Bus service for clipboard persistence or fast file indexing, or a GTK4/libadwaita/relm4 helper app) — and when wiring such a helper to the GJS extension over D-Bus. Covers gtk4-rs, glib/gio async, zbus 6, cargo+meson, Flatpak, errors/testing and the GJS interop contract. Do NOT use for code that runs inside gnome-shell (that is GJS only).
---

# Rust in the GNOME ecosystem (for Kiwi)

Kiwi is a GNOME Shell extension written in GJS (ESM). Shell extensions run *inside*
the compositor process; nothing compiled may be loaded there. Rust is only ever a
**separate process** that the extension talks to over **D-Bus**, and the extension
must keep working (degraded) when that process is absent.

Versions checked 2026-10-25 against crates.io and docs.rs:
`gtk4 0.11.5`, `glib`/`gio 0.22.10`, `libadwaita 0.9.2`, `relm4 0.11.0`,
`zbus 6.1.0` (MSRV 1.89), gtk-rs MSRV 1.92, `thiserror 2`, `anyhow 1`,
`async-channel 2.5`. Re-check before pinning.

## When Rust is appropriate here

| Need | Rust? | Why |
|---|---|---|
| Clipboard history *capture* | **No** | Mutter exposes no clipboard-manager protocol to other Wayland clients; capture must stay in the Shell (`St.Clipboard` / `Meta.Selection`). |
| Clipboard history *persistence*, dedupe, search, image thumbnails | Yes (optional) | Disk I/O and hashing off the compositor thread; survives Shell restarts. |
| Spotlight file search over large trees | Yes (optional) | Fast fuzzy index + `inotify`; first check whether LocalSearch (formerly Tracker) already answers the query. |
| Notification notch, Stage Manager, Control Center, auto-hide bar, window controls, Liquid Glass blur | **No** | Pure Shell/Clutter/St work; must be GJS. |
| Standalone settings / onboarding window beyond `prefs.js` | Maybe | gtk4-rs + libadwaita (or relm4) is fine if it is its own app. |
| Anything already in `advanced/` (GTK3 `LD_PRELOAD` C module) | No | Leave as is; separate concern. |

Rule of thumb: if it touches actors, windows, the panel or Shell internals, it is
GJS. If it is CPU/disk heavy, long-running or must outlive a Shell restart, a
Rust helper *may* own it.

## Golden rules

1. **Never in-process.** No `.so`, no GI typelib, no FFI into gnome-shell.
   extensions.gnome.org does not accept compiled binaries (see `advanced/README.md`);
   ship helpers separately (distro package / Flatpak / `cargo install`).
2. **Contract first.** The D-Bus introspection XML is the API. Version the
   interface name (`...Clipboard1`), never break a published version.
3. **Optional dependency.** The extension watches the bus name and hides the
   feature (or falls back to in-memory) when the helper is missing.
4. **Do not block a main loop.** In GTK apps use `glib::spawn_future_local` +
   `gio::spawn_blocking`; in daemons keep handlers async. In GJS always use
   `...Async` proxy methods — never `call_sync` (cf. `apps/batteryPercentage.js:52`).
5. **Activation, not babysitting.** Prefer D-Bus activation (`.service` file)
   over the extension spawning and supervising a child process.
6. **Least privilege.** Session bus only; data under `$XDG_DATA_HOME`/`$XDG_STATE_HOME`;
   no network; tight Flatpak `finish-args`.
7. **Errors are typed at boundaries** (`thiserror` + `zbus::DBusError`), `anyhow`
   only in `main`. No `unwrap()` on anything a peer can influence.
8. **CI gate:** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
   `cargo test` (under `dbus-run-session` for bus tests).

## Decision table → references

| Question | Read |
|---|---|
| App/window/widgets, composite templates, `glib::subclass`, `#[derive(Properties)]`, signals, relm4 | `references/gtk4-rs-basics.md` |
| Main context, `spawn_future_local`, `spawn_blocking`, channels, Tokio alongside GLib, Gio files/settings | `references/glib-gio-async.md` |
| Writing the service: `#[interface]`, properties, signals, errors, `connection::Builder`, calling from GJS | `references/dbus-with-zbus.md` |
| meson + cargo, installing `.service` files, Flatpak manifests, `flatpak-cargo-generator` | `references/packaging-meson-flatpak.md` |
| `thiserror`/`anyhow`, unit/integration/bus tests, clippy, rustfmt | `references/error-handling-and-testing.md` |
| Contract-first design, interface versioning, activation lifecycle, sandbox, degraded mode | `references/interop-with-gjs.md` |

## Cargo / meson cheat-sheet

```sh
cargo new --bin kiwi-clipboardd && cd kiwi-clipboardd
cargo add zbus@6 thiserror@2 anyhow@1 serde --features serde/derive
cargo add gtk4@0.11 --rename gtk --features v4_14        # GUI helper only
cargo add libadwaita@0.9 --rename adw --features v1_8     # GUI helper only
cargo fmt && cargo clippy --all-targets -- -D warnings && cargo test
dbus-run-session -- cargo test --test bus                 # isolated session bus
busctl --user introspect io.github.kem_a.Kiwi.Clipboard /io/github/kem_a/Kiwi/Clipboard
gdbus introspect --session --dest io.github.kem_a.Kiwi.Clipboard \
      --object-path /io/github/kem_a/Kiwi/Clipboard --xml > dbus/contract.xml
meson setup build -Dprofile=development && meson compile -C build && meson install -C build
python3 flatpak-cargo-generator.py Cargo.lock -o cargo-sources.json
```

Proposed names (not yet registered anywhere — adjust before release):
bus name `io.github.kem_a.Kiwi.<Helper>`, object path `/io/github/kem_a/Kiwi/<Helper>`,
interface `io.github.kem_a.Kiwi.<Helper>1`. D-Bus interface names cannot contain `-`,
hence `kem_a`.

## Sources

- gtk-rs book: https://gtk-rs.org/gtk4-rs/stable/latest/book/ (fetched 2026-10-25)
- zbus book: https://z-galaxy.github.io/zbus/ (moved from dbus2.github.io, which now 404s; linked from docs.rs/zbus 6.1.0)
- API docs: https://docs.rs/zbus/6.1.0 · https://docs.rs/glib/0.22.10 · https://docs.rs/gio/0.22.10 · https://docs.rs/libadwaita/0.9.2
- relm4 book: https://relm4.org/book/stable/ (its install snippet still says 0.9.1; crate is 0.11.0) · libadwaita-rs: https://world.pages.gitlab.gnome.org/Rust/libadwaita-rs/
- flatpak-cargo-generator: https://github.com/flatpak/flatpak-builder-tools/tree/master/cargo
- Rust API Guidelines: https://rust-lang.github.io/api-guidelines/
