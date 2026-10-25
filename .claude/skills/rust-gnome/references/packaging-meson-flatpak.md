# Packaging: cargo + meson + Flatpak

Summary: Cargo builds the Rust; Meson wraps it to install binaries, D-Bus service
files, schemas and resources; Flatpak needs vendored crates via flatpak-cargo-generator.
Kiwi helpers ship separately from the extension zip, which must stay binary-free.

## Contents
1. Distribution model for Kiwi
2. Repository layout
3. Root `meson.build`
4. Cargo integration (`src/meson.build`)
5. Config passed from meson to Rust
6. D-Bus service file and optional systemd unit
7. Flatpak manifest + flatpak-cargo-generator
8. Release checklist

---

## 1. Distribution model

| Artifact | Channel | Contains |
|---|---|---|
| `kiwi@kemma.shell-extension.zip` | extensions.gnome.org (`.github/workflows/pack-release.yml`) | GJS, CSS, schemas, icons — **no binaries** |
| `kiwi-helpers` | distro package / Flatpak / `meson install --prefix ~/.local` | Rust daemons + `.service` files |

The extension detects helpers at runtime; never download or exec binaries from the
extension (EGO review would reject it, and it is a security hole).

## 2. Layout (proposal)

```
helpers/
├── Cargo.toml              # [workspace] members = ["kiwi-core", "kiwi-clipboardd", "kiwi-indexd"]
├── meson.build
├── meson.options           # option('profile', type: 'combo', choices: ['default','development'])
├── dbus/                   # contract XML (source of truth, shared with GJS)
│   └── io.github.kem_a.Kiwi.Clipboard1.xml
├── data/
│   ├── meson.build
│   └── io.github.kem_a.Kiwi.Clipboard.service.in
├── kiwi-core/              # pure logic, no zbus/gtk deps
└── kiwi-clipboardd/
    ├── meson.build
    └── src/{main.rs,config.rs,service.rs}
```

## 3. Root `meson.build`

Adapted from the gtk-rs book (*Building with Meson*):

```meson
project('kiwi-helpers', 'rust', version: '0.1.0', meson_version: '>= 1.4')

is_devel = get_option('profile') == 'development'
prefix   = get_option('prefix')
bindir   = prefix / get_option('bindir')
datadir  = prefix / get_option('datadir')
libexecdir = prefix / get_option('libexecdir')

subdir('kiwi-clipboardd')
subdir('data')
```

## 4. Cargo integration

Meson has Rust support but not Cargo support, so the book's pattern is a
`custom_target` that shells out to cargo and copies the binary:

```meson
# kiwi-clipboardd/meson.build
cargo = find_program('cargo')
cargo_opts = ['--manifest-path', meson.project_source_root() / 'Cargo.toml',
              '--target-dir', meson.project_build_root() / 'target',
              '-p', 'kiwi-clipboardd']
rust_target = is_devel ? 'debug' : 'release'
if not is_devel
  cargo_opts += ['--release']
endif

custom_target('kiwi-clipboardd',
  build_by_default: true,
  build_always_stale: true,
  output: 'kiwi-clipboardd',
  console: true,
  install: true,
  install_dir: libexecdir,
  env: {
    'CARGO_HOME': meson.project_build_root() / 'cargo-home',
    'KIWI_BUS_NAME': 'io.github.kem_a.Kiwi.Clipboard',
  },
  command: [cargo, 'build', cargo_opts, '&&', 'cp',
            meson.project_build_root() / 'target' / rust_target / 'kiwi-clipboardd',
            '@OUTPUT@'],
)
```

Daemons belong in `libexecdir` (not on `$PATH`). Add a `test('cargo-test', cargo,
args: ['test', ...])` so `meson test` runs the Rust tests.

## 5. Config from meson to Rust

```rust
// src/config.rs — values baked in at compile time via env set by meson
pub const BUS_NAME: &str = match option_env!("KIWI_BUS_NAME") {
    Some(v) => v,
    None => "io.github.kem_a.Kiwi.Clipboard",   // plain `cargo build` still works
};
```

## 6. D-Bus service file (activation)

```ini
# data/io.github.kem_a.Kiwi.Clipboard.service.in
[D-BUS Service]
Name=io.github.kem_a.Kiwi.Clipboard
Exec=@LIBEXECDIR@/kiwi-clipboardd
# Optional: let systemd own the process (logs in journalctl --user)
SystemdService=kiwi-clipboardd.service
```

```meson
# data/meson.build
conf = configuration_data()
conf.set('LIBEXECDIR', libexecdir)
configure_file(input: 'io.github.kem_a.Kiwi.Clipboard.service.in',
  output: 'io.github.kem_a.Kiwi.Clipboard.service',
  configuration: conf,
  install_dir: datadir / 'dbus-1' / 'services')
```

Optional systemd user unit (`Type=dbus`, `BusName=io.github.kem_a.Kiwi.Clipboard`)
installed to `prefix/lib/systemd/user`. With `--prefix ~/.local` the service file lands
in `~/.local/share/dbus-1/services`, which the session bus scans (both dbus-daemon and
dbus-broker — unverified for every distro; test on Fedora and Ubuntu).

## 7. Flatpak

From flatpak-builder-tools `cargo/README.md`:

```sh
python3 flatpak-cargo-generator.py helpers/Cargo.lock -o cargo-sources.json
```

```yaml
app-id: io.github.kem_a.Kiwi.Clipboard
runtime: org.gnome.Platform
runtime-version: "49"            # pick current; rust-stable branch must match the SDK base
sdk: org.gnome.Sdk
sdk-extensions: [org.freedesktop.Sdk.Extension.rust-stable]
command: kiwi-clipboardd
finish-args:
  - --socket=session-bus         # avoid if possible; owning own app-id name needs no extra perms
modules:
  - name: kiwi-helpers
    buildsystem: meson
    build-options:
      append-path: /usr/lib/sdk/rust-stable/bin
      env: { CARGO_NET_OFFLINE: 'true' }
    sources:
      - { type: dir, path: helpers }
      - cargo-sources.json
```

Notes:
- `CARGO_HOME` must point at the vendored dir (`/run/build/<module>/cargo`) or the
  generated `.cargo/config.toml` must be installed — README explains both.
- A Flatpak may own its app-id and names below it on the session bus; Flatpak exports
  `.service` files for D-Bus-activatable apps (verify for non-GApplication daemons).
- Sandboxed data lives in `~/.var/app/<app-id>/`; an indexer needs
  `--filesystem=home:ro` (or xdg dirs), which Flathub reviewers will question. For
  Spotlight, a native package may be the honest choice.

## 8. Release checklist

- [ ] `cargo build --locked --release`; `Cargo.lock` committed.
- [ ] `cargo-sources.json` regenerated after any `Cargo.lock` change.
- [ ] Contract XML version matches `Version` property and extension's expected range.
- [ ] Extension zip built by `pack-release.yml` contains no `helpers/` output.

Sources: gtk-rs book *Building with Meson* + `listings/todo/9/{meson.build,src/meson.build,src/config.rs,data/*.service.in}` —
https://gtk-rs.org/gtk4-rs/stable/latest/book/meson.html ; flatpak-cargo-generator —
https://github.com/flatpak/flatpak-builder-tools/blob/master/cargo/README.md ;
GNOME Rust app template (unverified this session, gitlab blocked):
https://gitlab.gnome.org/World/Rust/gtk-rust-template ; D-Bus `SystemdService=` key:
https://dbus.freedesktop.org/doc/dbus-daemon.1.html (unverified).
