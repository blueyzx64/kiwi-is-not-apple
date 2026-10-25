# Building Vala with meson; VAPI, GIR and typelibs for GJS

Summary: meson knows Vala natively (`project(..., 'vala', 'c')`). A Vala
library can emit a C header, a `.vapi` (for Vala consumers) and a `.gir`; compile
the `.gir` into a `.typelib` with `g-ir-compiler --shared-library=...` and GJS can
`import X from 'gi://X?version=N'`. Everything below was built and run here.

## Contents
1. valac essentials
2. meson: executable
3. meson: library + header + vapi + gir + typelib (tested)
4. Importing the library from GJS (tested)
5. GIR-friendly Vala API rules
6. Consuming C libraries: `.vapi`, `--pkg`, `vapigen`
7. Install layout, `meson devenv`, runtime search paths
8. Packaging notes for Kiwi (EGO, Flatpak)
9. Sources

## 1. valac essentials

| Flag | Meaning |
|---|---|
| `--pkg gio-2.0` | use `gio-2.0.vapi` + pkg-config flags |
| `-C` | emit C only (inspect it!) |
| `-H foo.h` | emit public C header |
| `--library=foo` / `--vapi=foo.vapi` | build a library and its vapi |
| `--gir=Foo-0.1.gir` | emit GIR; **namespace/version come from this file name** |
| `--gresources=x.gresource.xml` | validate `[GtkTemplate]` ids |
| `--target-glib=2.74` | allow newer GLib API in generated code |
| `--enable-checking`, `--fatal-warnings` | stricter compile |
| `-X -O2` / `-X -fPIC` | pass flags to the C compiler |
| `--vapidir=vapi/` | extra vapi search dir |
| `-D FEATURE` + `#if FEATURE` | conditional compilation |

Verified: `--gir=Other-0.1.gir` on code in `namespace KiwiHelper` produces
`<namespace name="Other">` — keep the file name equal to the Vala namespace.
A second top-level namespace is a hard error ("Secondary top-level namespace
… is not supported by GIR format").

## 2. meson: executable

```meson
project('kiwi-clipboard-helper', 'vala', 'c',
  version: '0.1.0', meson_version: '>= 0.62',
  default_options: ['warning_level=1', 'buildtype=debugoptimized'])

add_project_arguments('-DG_LOG_DOMAIN="kiwi-clipboard"', language: 'c')
# valac output trips many C warnings; don't let them drown real ones
add_project_arguments('-w', language: 'c')

deps = [dependency('glib-2.0', version: '>= 2.74'), dependency('gio-2.0')]

executable('kiwi-clipboard-helper', 'src/main.vala', 'src/service.vala',
  dependencies: deps,
  vala_args: ['--target-glib=2.74', '--fatal-warnings'],
  install: true,
  install_dir: get_option('libexecdir'))

configure_file(input: 'data/org.example.Kiwi.Clipboard.service.in',
  output: 'org.example.Kiwi.Clipboard.service',
  configuration: {'libexecdir': get_option('prefix') / get_option('libexecdir')},
  install_dir: get_option('datadir') / 'dbus-1' / 'services')
```

Notes: generated C routinely triggers `-Wincompatible-pointer-types`/
`-Wdiscarded-qualifiers` noise (seen in every example here), so `-w` for C plus
`--fatal-warnings` for Vala keeps the signal. GCC 14+ turns
`incompatible-pointer-types` into an **error** by default — another reason for
`-w` or `-Wno-error=incompatible-pointer-types` (**unverified** for every valac
version; check if a build suddenly fails after a compiler upgrade).

## 3. meson: library with GIR + typelib (tested)

`kiwihelper.vala`:

```vala
namespace KiwiHelper {
    public class Counter : GLib.Object {
        public int value { get; private set; default = 0; }
        public signal void changed (int new_value);

        public void bump (int by = 1) {         // default NOT visible to GJS
            value += by;
            changed (value);
        }

        public async string slow_echo (string text, GLib.Cancellable? cancellable = null) throws GLib.Error {
            GLib.Timeout.add (50, slow_echo.callback);
            yield;
            if (cancellable != null) cancellable.set_error_if_cancelled ();
            return text.up ();
        }
    }

    public string[] split_words (string input) {
        return input.split (" ");
    }
}
```

`meson.build` (works with meson ≥ 0.62; tested on 1.3.2):

```meson
project('kiwihelper', 'vala', 'c', version: '0.1.0', meson_version: '>= 0.62')

deps = [dependency('glib-2.0'), dependency('gobject-2.0'), dependency('gio-2.0')]

lib = shared_library('kiwihelper', 'kiwihelper.vala',
  vala_gir: 'KiwiHelper-0.1.gir',
  vala_header: 'kiwihelper.h',
  vala_vapi: 'kiwihelper-0.1.vapi',
  dependencies: deps,
  version: '0.1.0',
  install: true,
  install_dir: [true, true, true, true])   # lib, header, vapi, gir

g_ir_compiler = find_program('g-ir-compiler')
custom_target('kiwihelper-typelib',
  command: [g_ir_compiler,
            '--shared-library', 'libkiwihelper.so.0',   # soname the loader will dlopen
            '--output', '@OUTPUT@',
            meson.current_build_dir() / 'KiwiHelper-0.1.gir'],
  output: 'KiwiHelper-0.1.typelib',
  depends: lib,
  install: true,
  install_dir: get_option('libdir') / 'girepository-1.0')
```

With meson ≥ 1.10 use `input: lib.vala_gir()` instead of the build-dir path
(per mesonbuild.com/Vala.html). **`--shared-library` is mandatory**: the
valac-generated GIR has no `shared-library` attribute (verified), so without it
GJS finds the typelib but cannot resolve any symbol. Use the versioned soname
(`libfoo.so.0`) for installed libraries; plain `libfoo.so` exists only with
`-dev` packages. `gnome.generate_gir()` is for C sources — for Vala use
`vala_gir`.

## 4. Importing from GJS (tested, gjs 1.80)

```js
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import KiwiHelper from 'gi://KiwiHelper?version=0.1';

const c = new KiwiHelper.Counter();
c.connect('changed', (_o, v) => print(`changed ${v}`));
c.bump(2);
c.bump(1);                          // c.bump() throws: "At least 1 argument required"
print(KiwiHelper.split_words('a b c').join('|'));

Gio._promisify(KiwiHelper.Counter.prototype, 'slow_echo', 'slow_echo_finish');
const loop = new GLib.MainLoop(null, false);
c.slow_echo('hi', null).then(s => { print(s); loop.quit(); });
loop.run();
```

```sh
GI_TYPELIB_PATH=_build LD_LIBRARY_PATH=_build gjs -m test.js
```

Loading a typelib from a private directory at runtime (e.g. from a helper's
own JS or `prefs.js`; tested with gjs 1.80 / libgirepository-1.0):

```js
import GIRepository from 'gi://GIRepository?version=2.0';
GIRepository.Repository.prepend_search_path(dir);   // before the first import
GIRepository.Repository.prepend_library_path(dir);
const {default: KiwiHelper} = await import('gi://KiwiHelper?version=0.1');
```

Newer GJS built on GLib's girepository-2.0 (`GIRepository-3.0`) replaces the
static calls with `GIRepository.Repository.dup_default().prepend_search_path(dir)`
(**unverified** here; check the GJS version in the target Shell).

## 5. GIR-friendly Vala API rules

- One top-level namespace; file name `Namespace-Version.gir`.
- **No default parameter values** in API that GJS calls (GJS ignores them).
- Mark nullable parameters/returns with `?`; GJS rejects `null` otherwise.
- `async` methods become `name` + `name_finish` — good for `Gio._promisify`.
- Avoid `[Compact]` classes, generic classes (`Foo<T>`), Gee collections,
  delegates without targets, `params` arrays, and `struct`s with
  owned pointers in public API; use `GLib.Object` subclasses, `string[]`,
  `GLib.ListModel`, `GLib.Variant`, `GLib.HashTable<string, Variant>`.
- Errors: public `errordomain` → GError domain; GJS sees a `GLib.Error` with
  `.matches(KiwiHelper.KiwiError, KiwiHelper.KiwiError.NOT_FOUND)`.
- Document with `/** … */` valadoc comments — valac copies them into the GIR.
- Version symbols: `[Version (since = "0.2")]`.

## 6. Consuming C libraries

Most GNOME libraries ship `.vapi` files with valac (`/usr/share/vala-0.56/vapi`)
or with the library (`/usr/share/vala/vapi`). If missing:

```sh
vapigen --library=libfoo-1 --pkg gio-2.0 /usr/share/gir-1.0/Foo-1.gir   # from a GIR
```

A tiny hand-written binding for a private C helper:

```vala
// vapi/kiwi-native.vapi
[CCode (cheader_filename = "kiwi-native.h")]
namespace KiwiNative {
    [CCode (cname = "kiwi_native_frob")]
    public int frob (string input);
}
```

meson: add `vala_args: ['--vapidir=' + meson.current_source_dir() / 'vapi', '--pkg=kiwi-native']`
and compile the `.c` file in the same target.

## 7. Install layout and dev environment

| Artifact | Default install dir |
|---|---|
| shared library | `libdir` |
| C header | `includedir` |
| `.vapi` | `datadir/vala/vapi` |
| `.gir` | `datadir/gir-1.0` |
| `.typelib` | `libdir/girepository-1.0` |
| D-Bus service file | `datadir/dbus-1/services` |
| systemd user unit | `prefix/lib/systemd/user` |

`meson devenv -C _build` opens a shell with `GI_TYPELIB_PATH`, `LD_LIBRARY_PATH`
and `PATH` pointing at the build tree. Typelibs are found via
`GI_TYPELIB_PATH`, then the system `girepository-1.0` dirs; libraries via the
normal dynamic loader rules (`LD_LIBRARY_PATH`, rpath, `ld.so.cache`).

## 8. Packaging notes for Kiwi

- gnome-shell must never load these typelibs: extensions.gnome.org rejects
  extensions that ship or load binaries, and a crash takes down the session.
  Ship helpers as a separate package (RPM/DEB/AUR/Flatpak) and talk D-Bus.
- A Flatpak app can provide a D-Bus service on the session bus only for its own
  app-id prefix by default; a Kiwi helper living outside Flatpak is simpler.
- Reproducibility: commit the meson project, not binaries; if prebuilt
  artifacts are distributed, publish checksums and the exact toolchain.

## 9. Sources

- Meson Vala docs: https://mesonbuild.com/Vala.html (GIR section, `vala_gir`,
  `install_dir` array, `.vala_gir()` since 1.10)
- Meson GNOME module: https://mesonbuild.com/Gnome-module.html
- Vala shared library + introspection sample: docs.vala.dev
  `sample-code/other/shared-library-introspection.md`
- docs.vala.dev tutorial 6.2–6.5 (libraries, ABI/API, bindings), 7.1 (valac), 7.3 (vapigen)
- GObject Introspection: https://gi.readthedocs.io/en/latest/
