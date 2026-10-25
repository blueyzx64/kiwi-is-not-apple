# GNOME C coding style, safety and defensive coding

Summary: write C the way GLib/GTK do (GNU-derived layout, `namespace_type_verb`
names, one ownership convention), compile with warnings and hardening flags,
and treat every external input — D-Bus args, files, environment, widget trees
of foreign apps — as hostile or surprising. Code injected into other processes
(GTK modules) has the strictest rules of all.

## Contents
1. Layout and naming (GTK/GLib style)
2. Headers and API hygiene
3. Error-handling discipline
4. Compiler warnings, hardening and analysis
5. Security pitfalls (with tested fixes)
6. Extra rules for code loaded into other apps (GTK modules)
7. Review checklist
8. Sources

## 1. Layout and naming

GTK/GLib style (GNU-derived; GTK's `docs/CODING-STYLE.md`):

```c
static gboolean
kiwi_index_add_file (KiwiIndex   *self,
                     GFile       *file,
                     GError     **error)
{
  g_autofree char *path = NULL;

  g_return_val_if_fail (KIWI_IS_INDEX (self), FALSE);
  g_return_val_if_fail (G_IS_FILE (file), FALSE);

  path = g_file_get_path (file);
  if (path == NULL)
    {
      g_set_error (error, G_IO_ERROR, G_IO_ERROR_NOT_SUPPORTED,
                   "Only local files can be indexed");
      return FALSE;
    }

  for (guint i = 0; i < self->roots->len; i++)
    {
      if (g_str_has_prefix (path, g_ptr_array_index (self->roots, i)))
        return kiwi_index_insert (self, path, error);
    }

  return TRUE;
}
```

- 2-space indent; braces on their own line, indented 2 for blocks
  (GNU); space before `(` in calls and declarations.
- Return type on its own line; parameters aligned, one per line.
- Names: `kiwi_index_add_file` (`namespace_type_verb`), types `KiwiIndex`,
  macros `KIWI_TYPE_INDEX`, enums `KIWI_INDEX_STATE_READY`.
- `self` for the instance; `klass` for class pointers.
- Declare variables at the top of a block (GNOME style), initialise them;
  `g_autoptr` variables *must* be initialised.
- Compare pointers explicitly (`if (path == NULL)`); booleans implicitly.
- Static everything not in the public header.
- Don't mix tabs/spaces; ship an `.editorconfig`. GNU indent or
  `clang-format` with a GNOME config enforces it (**unverified**: no official
  GNOME clang-format file is mandated; projects vary — follow the file you edit).
- Kiwi's current `advanced/titlebuttons_hover.c` uses K&R/1TBS with
  inconsistent indentation (lines 87–88, 95–96); if you rewrite it, pick one
  style for the whole file.

## 2. Headers and API hygiene

- `#pragma once`, `G_BEGIN_DECLS`/`G_END_DECLS`, include only what you need
  (`<gio/gio.h>`, `<gtk/gtk.h>`).
- Public functions get doc comments with GI annotations
  (`introspection-annotations.md`).
- Use `const char *` for borrowed strings, `char *` for owned; never return a
  pointer into a temporary.
- Prefer `gsize` for sizes, `gssize` for "length or -1".
- Version guards: `#if GLIB_CHECK_VERSION (2, 74, 0)` / `GTK_CHECK_VERSION`;
  define `GLIB_VERSION_MIN_REQUIRED` / `GLIB_VERSION_MAX_ALLOWED` to get
  deprecation warnings for APIs outside your supported range.

## 3. Error-handling discipline

| Situation | Mechanism |
|---|---|
| Caller passed garbage (programmer error) | `g_return_if_fail` / `g_return_val_if_fail` (logs critical, returns) |
| Internal invariant | `g_assert` (tests) / `g_assert_not_reached ()` |
| Runtime failure (I/O, parse, D-Bus) | `GError **error` + return `FALSE`/`NULL` |
| Unrecoverable in an app's `main` | `g_printerr` + exit code |
| In a library/module | never `g_error`, `abort`, `exit` |

Check every return value that can fail; `g_autoptr(GError)`; prefix errors
with context (`g_prefix_error`). Log once at the layer that decides to give up.

## 4. Warnings, hardening, analysis

meson defaults for a GNOME project:

```meson
project('kiwi-native', 'c', meson_version: '>= 0.62',
  default_options: ['warning_level=2', 'c_std=gnu11', 'buildtype=debugoptimized'])

cc = meson.get_compiler('c')
add_project_arguments(cc.get_supported_arguments([
  '-Wformat=2', '-Wformat-security', '-Wmissing-prototypes', '-Wstrict-prototypes',
  '-Wshadow', '-Wnull-dereference', '-Wimplicit-fallthrough', '-Wcast-function-type',
  '-Werror=implicit-function-declaration', '-Werror=return-type',
  '-fno-strict-aliasing', '-fstack-protector-strong',
  '-DG_LOG_DOMAIN="kiwi-native"',
  '-DGLIB_VERSION_MIN_REQUIRED=GLIB_VERSION_2_74',
]), language: 'c')
add_project_link_arguments(cc.get_supported_link_arguments([
  '-Wl,-z,relro', '-Wl,-z,now', '-Wl,--as-needed', '-Wl,-z,defs',
]), language: 'c')
```

- `-D_FORTIFY_SOURCE=3` needs optimisation (`-O2`); distros usually inject it.
- `-Wl,--as-needed` drops the 15+ unnecessary `NEEDED` entries the current
  `advanced/` binary carries (`readelf -d`: libz, harfbuzz, wayland-client, …;
  a rebuilt module with `--as-needed` had 3).
- Debug builds: `-Db_sanitize=address,undefined`, `G_DEBUG=fatal-criticals`.
- Static analysis: `ninja -C _build scan-build` (clang analyzer via meson),
  `gcc -fanalyzer`, `clang-tidy`; `meson test --wrap='valgrind --error-exitcode=1'`.
- Tested: the snippet in §5 compiles cleanly with
  `-Wall -Wextra -Wformat=2 -Wformat-security -D_FORTIFY_SOURCE=3 -O2
  -fstack-protector-strong -Wl,-z,relro,-z,now`.

## 5. Security pitfalls

| Pitfall | Fix |
|---|---|
| User string as format: `g_message (text)` | `g_message ("%s", text)`; `-Wformat-security` catches it |
| Size overflow in `n * size` | `g_size_checked_mul (&total, n, size)` + an upper bound; `g_new0 (T, n)` checks internally |
| Shell injection via `system ()` / `g_spawn_command_line_*` with user data | `g_spawn_sync`/`GSubprocess` with an argv array and `--` before user args |
| Path traversal (`../`) in D-Bus/file args | `g_file_resolve_relative_path` + `g_file_has_prefix (child, root)`; consider `O_NOFOLLOW`/`G_FILE_QUERY_INFO_NOFOLLOW_SYMLINKS` |
| World-readable data (clipboard history!) | `g_file_set_contents_full (…, 0600, …)`, `G_FILE_CREATE_PRIVATE`, dirs `0700` |
| TOCTOU (`g_file_test` then open) | open directly, handle `G_IO_ERROR_NOT_FOUND`/`EXISTS` |
| Unvalidated UTF-8 into Pango/GTK | `g_utf8_validate`; `g_markup_escape_text` before markup |
| Trusting `GVariant` shapes | use typed signatures (`G_VARIANT_TYPE ("(su)")`) and `g_variant_is_of_type` |
| Environment-controlled behaviour in injected code | don't read env vars beyond what GTK already does |
| Shipping unreproducible binaries | build from source in CI; publish checksums |

Tested helpers:

```c
static gboolean
alloc_items (gsize n, gsize size, gpointer *out)
{
  gsize total;
  if (!g_size_checked_mul (&total, n, size) || total > 16 * 1024 * 1024)
    return FALSE;                                   /* overflow rejected (tested) */
  *out = g_malloc0 (total);
  return TRUE;
}

static gboolean
run_tool (const char *user_file, GError **error)
{
  const char *argv[] = { "file", "--brief", "--", user_file, NULL };   /* no shell */
  g_autofree char *out = NULL;
  int status = 0;

  if (!g_spawn_sync (NULL, (char **) argv, NULL,
                     G_SPAWN_SEARCH_PATH | G_SPAWN_STDERR_TO_DEV_NULL,
                     NULL, NULL, &out, NULL, &status, error))
    return FALSE;
  return g_spawn_check_wait_status (status, error);       /* GLib >= 2.70 */
}

static gboolean
is_inside (GFile *root, const char *relative)
{
  g_autoptr(GFile) child = g_file_resolve_relative_path (root, relative);
  return g_file_has_prefix (child, root);   /* "../../etc/passwd" -> FALSE (tested) */
}
```

`g_file_has_prefix` is lexical; it does not resolve symlinks. For a helper that
serves files, also refuse symlinks or canonicalise with `realpath` and re-check.

## 6. Rules for code injected into other apps

A GTK3 module runs inside *every* GTK3 process of the session (editors, file
managers, password managers, installers):

1. **Do nothing expensive by default.** No periodic timers; react to signals.
   No file I/O, no network, no threads, no D-Bus.
2. **Never crash or abort.** No `g_error`, no `g_assert` on foreign state;
   type-check every widget (`GTK_IS_*`) because you don't control the tree.
3. **Don't hold borrowed pointers across callbacks**; use
   `g_signal_connect_object`, weak pointers, or refs with destroy notifies.
4. **Namespace everything**: CSS classes (`titlebuttons-hover-alt` is ok;
   prefer a `kiwi-` prefix), object data keys/quarks, log domain.
5. **Stay resident** (`g_module_make_resident` in `g_module_check_init`) if
   any callback could outlive an unload.
6. **Export only the entry points** (`-fvisibility=hidden`, `static`).
7. **Fail closed**: if GTK isn't version 3 or a type is missing, return from
   `gtk_module_init` without hooking anything.
8. **Install atomically and reversibly**; never overwrite other users of
   `GTK3_MODULES`.

## 7. Review checklist

- [ ] Every allocation has one clear owner; `g_auto*` on locals; fields cleared
      in `dispose`/`finalize`.
- [ ] Every `g_signal_connect`/`g_*_add` has a disconnect/remove or an
      auto-disconnect (`_connect_object`, source returning `G_SOURCE_REMOVE`).
- [ ] `user_data` is either owned (ref + destroy notify) or guaranteed to
      outlive the callback.
- [ ] `GError` contract followed; no error set twice; no ignored failures.
- [ ] No format-string, overflow, shell, path-traversal or permission issues.
- [ ] No main-thread-only API from worker threads.
- [ ] Builds warning-free at `warning_level=2` with the flags in §4; runs clean
      under `G_DEBUG=fatal-criticals` and valgrind/ASan.
- [ ] GTK module specific: no polling, resident, minimal exports, GTK3_MODULES.

## 8. Sources

- GTK coding style: https://gitlab.gnome.org/GNOME/gtk/-/blob/main/docs/CODING-STYLE.md
  (not reachable from this sandbox; summarised from memory — **unverified** details)
- GNOME programming guidelines (memory, threading, logging, namespacing):
  https://developer.gnome.org/documentation/guidelines/programming.html (**unverified** here)
- `g_size_checked_mul`: https://docs.gtk.org/glib/func.size_checked_mul.html (macro present in GLib 2.80 `gtypes.h`)
- `g_spawn_check_wait_status`: https://docs.gtk.org/glib/func.spawn_check_wait_status.html
- Meson built-in options (`b_sanitize`, `warning_level`): https://mesonbuild.com/Builtin-options.html
