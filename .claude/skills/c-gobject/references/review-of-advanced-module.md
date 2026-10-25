# Review of `advanced/` (titlebuttons hover GTK3 module + scripts)

Summary: the module basically works (verified under Xvfb), but it polls every
GTK3 process's whole widget tree every 800 ms forever, is installed by
overwriting `GTK_MODULES` (which GTK 2 also reads, and which clobbers other
modules), and is replaced with `cp` over a mapped library. Its "realize isn't
exposed" comment comes from a misdiagnosis: the class wasn't initialised yet.
A tested event-driven rewrite is in `gtk-modules-and-theming.md` §3.

## Contents
1. What was reviewed and how
2. Findings — `titlebuttons_hover.c` (by severity)
3. Findings — scripts, README, shipped binary
4. Suggested fixes (code)
5. Suggested fixes (install/uninstall)
6. Things that are fine
7. Sources

## 1. Scope and method

Files: `advanced/titlebuttons_hover.c` (185 lines), `compile-extra.sh`,
`install-extra.sh`, `uninstall-extra.sh`, `README.md`, `libtitlebuttons_hover.so`;
context: `css/titlebuttons-alt3.css:179-205`, `apps/gtkThemeManager.js`,
`prefs.js:968-1033`, `.github/workflows/pack-release.yml` (the release zip does
**not** include `advanced/` — good).

Verification in a sandbox (GTK 3.24.41, GLib 2.80, gcc 13, Xvfb):
- `gcc -Wall -Wextra` on the source: 10 unused-parameter warnings and
  `'on_widget_realize' defined but not used`.
- Test app: GtkHeaderBar with `:minimize,maximize,close`; module loaded with
  `GTK3_MODULES`, `G_DEBUG=fatal-criticals`; synthetic crossing events sent to
  each button's event window; valgrind with GLib suppressions (no errors in
  module frames).
- CPU: idle window with ~7,500 widgets, 10 s: no module +0.000 s, current module
  **+0.059 s** (≈ 4.7 ms per 800 ms scan), event-driven rewrite +0.001 s.

## 2. Findings — `titlebuttons_hover.c`

### High

**H1. Permanent polling in every GTK3 process** — `titlebuttons_hover.c:184`
`g_timeout_add(800, periodic_scan, NULL)`; `periodic_scan` (169-178) walks
every toplevel with `gtk_container_forall` (`scan`, 111-117), calls
`gtk_container_get_children` (allocating a list) for every unwired `GtkBox`
(77), and also runs `global_wire` (129-143), a second full-tree walk into a
`GPtrArray`. The source never stops (`return TRUE`, 177), including in apps with
no headerbar at all. Cost scales with widget count, every process, all day
(measured above), and the wakeups defeat idle power states.
*Fix:* emission hook on `GtkWidget::realize` (see §4).

**H2. The emission-hook path was abandoned because of a misdiagnosis** —
comment at 181 ("Some distros build GTK without exposing 'realize' as a
signal") and dead `on_widget_realize` (151-160) / `deferred_scan` (145-149).
`realize` is a normal `G_SIGNAL_RUN_FIRST` signal (gtk-3-24 `gtkwidget.c:1753`).
`g_signal_lookup ("realize", GTK_TYPE_WIDGET)` returns 0 in `gtk_module_init`
only because no widget class has been initialised yet (reproduced:
`g_signal_add_emission_hook: assertion 'signal_id > 0' failed`).
*Fix:* `g_type_class_ref (GTK_TYPE_WIDGET)` before the lookup.

**H3. Not resident while holding callbacks** — no `g_module_check_init`.
Modules from env vars are never unloaded, but GTK3 *does* unload modules
loaded via the `gtk-modules` setting when it changes (`gtkmodules.c`,
`gtk_module_info_unref` → `g_module_close`). The 800 ms timeout and signal
handlers would then jump into unmapped code. *Fix:* `g_module_make_resident`
in `g_module_check_init`.

### Medium

**M1. Hover state can stick** — counting enter/leave (`on_btn_enter` 55-61,
`on_btn_leave` 62-68) relies on a leave for every enter. Reproduced: a hovered
button that gets hidden/unmapped without a leave event leaves
`titlebuttons-hover-alt` on the headerbar. Real triggers are plausible (window
minimised via the minimise button, maximise toggling button visibility,
popovers/grabs) but were not reproduced with a real compositor
(**unverified** in a live session: runtime behaviour, no docs cover it). *Fix:* recompute from
`GTK_STATE_FLAG_PRELIGHT` of *mapped* buttons on `state-flags-changed` and
`unmap` (tested).

**M2. Borrowed `target` as `user_data`** — 93-96 connect handlers on each
button with `target` (headerbar or box) as plain `gpointer`. Normally buttons
die before their ancestor, so this did not crash in tests, but nothing
guarantees it (reparenting, apps that keep refs to buttons). *Fix:*
`g_signal_connect_object (button, …, target, 0)`.

**M3. `destroy` reset is coarse** — 96: destroying *any* button resets the
whole count to 0 (`reset_hover_state`, 44-48) even if another button is still
hovered; the swapped handler relies on an extra argument being ignored by the
C ABI (works on all GNOME platforms, but is a signature mismatch).

**M4. Whole-box scan misses partially rebuilt boxes** — `wire_button_box`
(75-103) returns early for a box already tagged `tb-hover-wired` (76), so
titlebuttons later added to the *same* box are never wired. GtkHeaderBar in
3.24 replaces the boxes on rebuild, so it worked in tests, but per-button
tagging is more robust.

### Low

- **L1** dead code / leftovers: empty `if (n_tb > 0) {}` (82-83), empty
  `else {}` (140-141), `tb-hover-any-wired` set (100) but never read,
  `titlebuttons-hover` class (35, 40) not used by any CSS (only `-alt` is, in
  `css/titlebuttons-alt3.css`), unused `on_widget_realize`/`deferred_scan`.
- **L2** function-pointer cast `(GtkCallback) collect_titlebuttons` (125):
  `GPtrArray *` vs `gpointer` parameter — fine in practice, but
  `-Wcast-function-type` territory; use a proper `(GtkWidget *, gpointer)`
  wrapper like `forall_cb`.
- **L3** `gtk_widget_add_events` (92) is redundant: GtkButton already selects
  enter/leave on its input-only event window.
- **L4** string keys (`"tb-hover-data"`, `"tb-hover-wired"`) are re-hashed on
  every scan; un-prefixed names could collide with the host app. Use static
  quarks with a `kiwi-` prefix.
- **L5** `HoverHoverData` naming (22-24); inconsistent indentation (87-88,
  95-96); no `G_LOG_DOMAIN`; no `static` forward-declaration hygiene issues
  otherwise.
- **L6** exports: only `gtk_module_init` is global (good), but build without
  `-fvisibility=hidden` relies on every helper being `static` — keep it that way.
- **L7** recursion depth: `scan`/`collect_titlebuttons` recurse per container
  level — fine for real UIs, unbounded in theory.

## 3. Findings — scripts, README, binary

**S1 (High). `GTK_MODULES` overwrite** — `install-extra.sh:60-63` writes
`GTK_MODULES=$MODULE_PATH`. Reproduced with systemd's environment.d generator:
an existing `GTK_MODULES=appmenu-gtk-module` in an earlier `.conf` was
replaced. Also GTK 2 apps read `GTK_MODULES`, dlopen the GTK3 module (pulling
in libgtk-3) and then refuse it with a warning (gtk-2-24 `gtkmodules.c`
`_gtk_module_has_mixed_deps`). The GTK3 docs say to use `GTK3_MODULES` for
GTK3-only modules. *Fix:* `GTK3_MODULES=${GTK3_MODULES:+$GTK3_MODULES:}/abs/path`.

**S2 (High). In-place overwrite of a mapped library** — `install-extra.sh:48`
`cp libtitlebuttons_hover.so "$MODULE_PATH"`. Verified: `cp` onto an existing
file rewrites the same inode, so re-installing while GTK3 apps are running
changes code they have mapped (typical result: SIGBUS/SIGSEGV in those apps).
*Fix:* `install -m 0644` (new file + rename) or write temp + `mv`.

**S3 (Medium). Binary stored in a config directory** — module lives in
`~/.config/environment.d/` (`install-extra.sh:40-41`, README). environment.d
only parses `*.conf`, so it works, but config dirs get synced/backed up and
cleaned by tools. Use `~/.local/share/kiwi/gtk3-modules/` or `~/.local/lib/kiwi/`.

**S4 (Medium). Prebuilt, unverifiable binary** — `libtitlebuttons_hover.so` is
committed, x86-64 only, built with Fedora GCC 15 (from `.comment`),
unoptimised (all static helpers present), not stripped, no checksum, no
architecture check in `install-extra.sh`. Symbols match the source, but users
cannot verify provenance; README "No compilation dependencies required!"
encourages installing it into every GTK3 process. *Fix:* build in CI from the
tagged source, publish checksum, check `uname -m`, or require local build.
It also links 15 libraries directly (`readelf -d`); `-Wl,--as-needed` gives 3.

**S5 (Low). compile-extra.sh** — no `-O2 -g -Wall -Wextra`, ignores `$CC`/`$CFLAGS`,
no `-fvisibility=hidden`/`--as-needed`; messages say "kiwi-kemma/extras"
(lines 20; also `install-extra.sh:20`) but the directory is `advanced/`;
requires running from the directory (`[[ -f titlebuttons_hover.c ]]`) instead of
`cd "$(dirname "$0")"`.

**S6 (Low). install-extra.sh** — `if [[ $? -eq 0 ]]` after the heredoc (65) is
dead under `set -e`; says "restart computer" (76) while uninstall/README say
log out; says "installed system-wide" (78) — it is per-user; no
`set -u`/`pipefail`.

**S7 (Low). uninstall-extra.sh** — fine for its own files; would need to
remove the new paths after a fix; message "log out" is correct.

**S8 (Docs). README.md** — "Some applications (like Wayland-native apps) may
not be affected" is misleading: GTK3 on Wayland under Mutter always uses
client-side decorations (`gtkwindow.c` `create_titlebar` adds `.titlebar
.default-decoration` GtkHeaderBar), so the module applies; the apps not
affected are GTK3 apps with server-side decorations on X11, GTK4/libadwaita
apps (no module support — verified, they use `windowcontrols:hover` CSS instead),
Flatpak apps (host path not visible in the sandbox; Flatpak does not clear
`GTK_MODULES`, so they log `Failed to load module`), and non-GTK apps.
Also mention that `systemctl --user show-environment` shows the active value.

(`relink.sh` / `convert-svg.sh` are asset helpers; `relink.sh` repeats several
identical `ln -sf` lines — harmless.)

## 4. Suggested code fix

Replace the polling design with the tested module in
`gtk-modules-and-theming.md` §3. Key differences, mapped to findings:

| Change | Fixes |
|---|---|
| `g_type_class_ref (GTK_TYPE_WIDGET)` + `g_signal_add_emission_hook (realize)` returning `TRUE` | H1, H2, M4 |
| `g_module_check_init` → `g_module_make_resident` | H3 |
| Recompute from PRELIGHT of mapped titlebuttons on `state-flags-changed` + `unmap` | M1, M3 |
| `g_signal_connect_object (button, …, target, 0)` | M2 |
| Per-button `kiwi-tb-wired` quark | M4, L4 |
| Only `titlebuttons-hover-alt` class; drop dead code | L1 |
| `-fvisibility=hidden -Wl,--as-needed -O2 -g -Wall -Wextra` | L6, S4 |

Minimal patch if the polling design must stay for now:

```c
/* at file scope */
G_MODULE_EXPORT const gchar *
g_module_check_init (GModule *module)
{
  g_module_make_resident (module);           /* H3 */
  return NULL;
}

/* in wire_button_box(), lines 93-96 */
g_signal_connect_object (child, "enter-notify-event", G_CALLBACK (on_btn_enter), target, 0);
g_signal_connect_object (child, "leave-notify-event", G_CALLBACK (on_btn_leave), target, 0);
g_signal_connect_object (child, "unmap", G_CALLBACK (on_btn_unmap), target, 0);  /* M1 */

/* in gtk_module_init(), replacing lines 181-184 */
g_type_class_ref (GTK_TYPE_WIDGET);
g_signal_add_emission_hook (g_signal_lookup ("realize", GTK_TYPE_WIDGET), 0,
                            on_widget_realize, NULL, NULL);   /* H1/H2: no timer */
```

(`on_btn_unmap` would decrement or reset the count for that button; the
state-flags rewrite avoids counting entirely.)

## 5. Suggested install fix (tested)

Verified with a temporary `$HOME` and
`/usr/lib/systemd/user-environment-generators/30-systemd-environment-d-generator`:
with a pre-existing `GTK3_MODULES=/usr/lib/other.so` the result was
`GTK3_MODULES=/usr/lib/other.so:/…/libtitlebuttons_hover.so`; an unrelated
`GTK_MODULES` was left untouched; the old copy in `environment.d` was removed.

```bash
#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"

MODULE=libtitlebuttons_hover.so
LIB_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/kiwi/gtk3-modules"
ENV_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/environment.d"
CONF_FILE="$ENV_DIR/10-gtk3-titlebuttons.conf"
TARGET="$LIB_DIR/$MODULE"

[[ -f "$MODULE" ]] || { echo "Build first: ./compile-extra.sh" >&2; exit 1; }
if [[ "$(uname -m)" != x86_64 ]] && [[ ! -f .built-locally ]]; then
    echo "Prebuilt module is x86_64 only; run ./compile-extra.sh" >&2; exit 1
fi

mkdir -p "$LIB_DIR" "$ENV_DIR"
install -m 0644 "$MODULE" "$TARGET"          # new inode: running apps unaffected

tmp="$(mktemp "$CONF_FILE.XXXXXX")"
printf '# Kiwi GTK3 titlebuttons hover module\nGTK3_MODULES=${GTK3_MODULES:+$GTK3_MODULES:}%s\n' \
    "$TARGET" > "$tmp"
mv -f "$tmp" "$CONF_FILE"

rm -f "$ENV_DIR/$MODULE"                      # migrate old layout
echo "Installed $TARGET; log out and back in to apply."
```

(`.built-locally` would be touched by `compile-extra.sh`.) Uninstall then
removes `$TARGET` and `$CONF_FILE`. `compile-extra.sh` should use:

```bash
"${CC:-cc}" -shared -fPIC -fvisibility=hidden -O2 -g -Wall -Wextra \
  ${CFLAGS:-} -o libtitlebuttons_hover.so titlebuttons_hover.c \
  $(pkg-config --cflags --libs gtk+-3.0) -Wl,--as-needed ${LDFLAGS:-}
```

## 6. Things that are fine

- Only `gtk_module_init` is exported; all helpers are `static`.
- Container lists are freed (`g_list_free` at 102, 166, 176;
  `g_ptr_array_free` at 142) — no leaks found under valgrind.
- `GDK_NOTIFY_INFERIOR` filtering (56, 63) correctly ignores crossings into
  child windows.
- `gtk_container_forall` (115) correctly includes internal children (the
  decoration boxes).
- `g_object_set_data_full (…, g_free)` (29) ties per-target state to the
  target's lifetime.
- Keeping the module out of the extension zip and explaining why
  (`README.md`, `prefs.js`) matches EGO rules.

## 7. Sources

- GTK3 module loader and env handling: `GNOME/gtk` gtk-3-24 `gtk/gtkmodules.c`,
  `gtk/gtkmain.c`, `gtk/gtkwidget.c:1753`, `gtk/gtkwindow.c` (`create_titlebar`);
  docs `docs/reference/gtk/running.sgml` (= https://docs.gtk.org/gtk3/running.html)
- GTK2 refusal of GTK3 modules: `GNOME/gtk` gtk-2-24 `gtk/gtkmodules.c`
- systemd environment.d expansion: `systemd/systemd` `man/environment.d.xml`
- Flatpak env passthrough: `flatpak/flatpak` `common/flatpak-run.c`
- Everything marked "reproduced/verified" was run in this sandbox on 2026-10-25.
