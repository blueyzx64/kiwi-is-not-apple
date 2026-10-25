# Error handling and testing for Kiwi Rust helpers

Summary: library code returns typed `thiserror` enums, binaries use `anyhow` at the
top, D-Bus boundaries map to `zbus::DBusError`. Tests are layered: pure unit tests in
`kiwi-core`, bus integration tests under `dbus-run-session`, plus clippy/rustfmt gates.

## Contents
1. Error strategy by layer
2. `thiserror` in libraries
3. `anyhow` in binaries
4. Mapping to D-Bus errors
5. Panics, `unwrap` and logging
6. Unit tests (functional core)
7. Integration tests against a private bus
8. Lints and formatting
9. CI snippet

---

## 1. Strategy

| Layer | Error type | Rule |
|---|---|---|
| `kiwi-core` (pure logic, storage) | `thiserror` enum per module | Callers can `match`; no I/O detail leaks as strings. |
| service adapter (`#[interface]`) | `#[derive(zbus::DBusError)]` enum | Stable error names are part of the contract. |
| `main.rs` | `anyhow::Result` + `.context()` | Human-readable startup failures. |

The Rust API Guidelines ask that error types implement `std::error::Error`, `Send`,
`Sync` and meaningful `Display` (C-GOOD-ERR) — `thiserror` gives that for free.

## 2. thiserror

```rust
// kiwi-core/src/store.rs
use std::path::PathBuf;

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("history file {path} is corrupt")]
    Corrupt { path: PathBuf, #[source] source: serde_json::Error },
    #[error("entry exceeds {limit} bytes")]
    TooLarge { limit: usize },
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, StoreError>;
```

## 3. anyhow

```rust
use anyhow::Context;

fn main() -> anyhow::Result<()> {
    let dir = data_dir().context("no XDG data dir")?;
    let store = Store::open(&dir).with_context(|| format!("opening {}", dir.display()))?;
    zbus::block_on(serve(store)).context("serving on the session bus")
}
```

Never return `anyhow::Error` from a library function or from an `#[interface]` method.

## 4. D-Bus mapping

```rust
#[derive(Debug, thiserror::Error, zbus::DBusError)]
#[zbus(prefix = "io.github.kem_a.Kiwi.Clipboard1.Error")]   // unverified attr name in 6.x
pub enum ClipError {
    #[zbus(error)] ZBus(zbus::Error),
    NotFound(String),
    TooLarge(String),
    Internal(String),
}

impl From<StoreError> for ClipError {
    fn from(e: StoreError) -> Self {
        match e {
            StoreError::TooLarge { .. } => ClipError::TooLarge(e.to_string()),
            other => {
                tracing::error!(error = %other, "store failure");
                ClipError::Internal("storage error".into())   // no paths to callers
            }
        }
    }
}
```

The GJS side receives these as `Gio.DBusError`; keep names stable and documented in the
contract XML (`<annotation>` or a README next to it).

## 5. Panics and logging

- `unwrap`/`expect` only on invariants you own (static regex, `OnceLock` init). Never on
  peer input, file contents or bus replies.
- A panic in an interface method kills the task, not the process — still a bug.
- Log with `tracing` (zbus already uses it; `tracing` is a default zbus 6 feature).
  Under systemd, stderr goes to the journal: `journalctl --user -u kiwi-clipboardd`.
- Never log clipboard contents. Log ids, sizes, mime types.

## 6. Unit tests (functional core)

```rust
// kiwi-core/src/history.rs
pub fn push(mut h: Vec<Entry>, e: Entry, max: usize) -> Vec<Entry> {
    h.retain(|x| x.hash != e.hash);   // dedupe: newest wins
    h.insert(0, e);
    h.truncate(max);
    h
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duplicate_moves_to_front() {
        let h = push(vec![entry("a"), entry("b")], entry("b"), 10);
        assert_eq!(texts(&h), ["b", "a"]);
    }

    #[test]
    fn truncates_to_max() {
        let h = (0..5).fold(vec![], |h, i| push(h, entry(&i.to_string()), 3));
        assert_eq!(h.len(), 3);
    }
}
```

Keep `kiwi-core` free of zbus/gio so these run in milliseconds with no bus. Use
`tempfile` for storage tests; property tests (`proptest`) suit dedupe/ranking code.

## 7. Integration tests on a private bus

```rust
// kiwi-clipboardd/tests/bus.rs — run with: dbus-run-session -- cargo test --test bus
#[test]
fn list_after_add() -> anyhow::Result<()> {
    zbus::block_on(async {
        let name = format!("io.github.kem_a.Kiwi.Test{}", std::process::id());
        let _srv = kiwi_clipboardd::build_connection(&name, test_store()).await?;
        let conn = zbus::Connection::session().await?;
        let p = ClipboardProxy::builder(&conn).destination(name.as_str())?.build().await?;
        let id = p.add_text("hello".into(), "text/plain".into()).await?;
        assert_eq!(p.list(1).await?[0].0, id);
        Ok(())
    })
}
```

`dbus-run-session` gives each run a throwaway session bus, so tests never touch the
developer's real one. zbus also has a `p2p` connection mode for bus-less tests
(unverified API in 6.x). The **contract test** (XML diff) lives in
`interop-with-gjs.md`.

## 8. Lints and formatting

```toml
# Cargo.toml (workspace)
[workspace.lints.rust]
unsafe_code = "forbid"
[workspace.lints.clippy]
unwrap_used = "warn"
expect_used = "warn"
pedantic = { level = "warn", priority = -1 }
```

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
```

`rustfmt.toml` stays default; consistency beats preference.

## 9. CI snippet (GitHub Actions)

```yaml
helpers:
  runs-on: ubuntu-latest
  defaults: { run: { working-directory: helpers } }
  steps:
    - uses: actions/checkout@v4
    - uses: dtolnay/rust-toolchain@stable
      with: { components: "clippy, rustfmt" }
    - run: sudo apt-get install -y dbus libxml2-utils
    - run: cargo fmt --all --check
    - run: cargo clippy --workspace --all-targets -- -D warnings
    - run: dbus-run-session -- cargo test --workspace --locked
```

Sources: Rust API Guidelines (C-GOOD-ERR) — https://rust-lang.github.io/api-guidelines/interoperability.html
(unverified this session); The Rust Book ch. 9 & 11 — https://doc.rust-lang.org/book/ ;
thiserror — https://docs.rs/thiserror ; anyhow — https://docs.rs/anyhow ; zbus
`DBusError` — https://docs.rs/zbus/latest/zbus/trait.DBusError.html ; clippy lints —
https://rust-lang.github.io/rust-clippy/ . Proxy `builder().destination()` shape in 6.x: unverified.
