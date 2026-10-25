# GTK3 modules, widget hooking and theming (and why GTK4 is different)

Summary: GTK3 dlopens every library listed in `GTK3_MODULES`/`GTK_MODULES` (and
the `gtk-modules` setting) into every GTK3 process and calls its exported
`gtk_module_init`. From there you can observe all widgets (emission hooks),
add CSS classes and install style providers. GTK4 has no module loader, so this
technique is GTK3-only.

## Contents
1. How GTK3 finds and loads modules (verified in source)
2. Entry points: `gtk_module_init`, `gtk_module_display_init`, `g_module_check_init`
3. Observing widgets without polling (tested module)
4. Styling: classes, CSS providers, priorities, Kiwi's gtk.css
5. Installing for a session: environment.d, GTK2 side effects
6. Wayland, X11, Flatpak, Snap, root apps
7. GTK4: what replaces modules
8. Testing a module
9. Sources

## 1. How GTK3 loads modules

From `gtk/gtkmain.c` and `gtk/gtkmodules.c` (gtk-3-24 branch):

- Module list = `GTK3_MODULES` + `:` + `GTK_MODULES` + `--gtk-module` args;
  later the `gtk-modules` GtkSettings/XSettings value is loaded separately.
- An absolute path is loaded directly; a bare name is searched in `GTK_PATH`,
  `~/.gtk-3.0`, then `libdir/gtk-3.0/modules` (`gtk-3.0/<version>/<host>/modules`
  variants included).
- Opened with `G_MODULE_BIND_LOCAL | G_MODULE_BIND_LAZY`; the module must export
  `gtk_module_init`, otherwise it is closed again.
- `gail` and `atk-bridge` are blacklisted (functionality built in).
- A missing file prints `Gtk-Message: Failed to load module "…"` — once per
  process start (verified), i.e. noise in every GTK3 app if the path is wrong.
- Modules from the environment/command line are **never unloaded** ("we'll
  just leak the refcounts"). Modules from the `gtk-modules` *setting* are
  ref-counted and **unloaded with `g_module_close` when the setting changes** —
  any pending timeout/signal pointing into the module then crashes the app.
- `GTK_MODULES` is also read by GTK 2. GTK 2.24 dlopens the module, detects
  GTK 3 symbols and refuses it with a g_warning ("GTK+ module … cannot be
  loaded. GTK+ 2.x symbols detected…"). Use `GTK3_MODULES` for GTK3-only modules
  (the GTK3 docs say exactly this).
- GTK3 release builds ignore `GTK_DEBUG` except `interactive` (verified on
  Ubuntu: "GTK_DEBUG set but ignored because gtk isn't built with
  G_ENABLE_DEBUG"), so `GTK_DEBUG=modules` usually prints nothing.

## 2. Entry points

```c
#include <gtk/gtk.h>
#include <gmodule.h>

/* Called by GModule right after dlopen. Making the module resident means
 * g_module_close() never unmaps our code — required if anything (sources,
 * signal handlers, emission hooks) can outlive a gtk-modules setting change. */
G_MODULE_EXPORT const gchar *
g_module_check_init (GModule *module)
{
  g_module_make_resident (module);
  return NULL;                     /* non-NULL = error string, load fails */
}

/* Called once. If the module has no gtk_module_display_init, GTK delays this
 * until the default display is opened. argc/argv may be NULL-ish: don't touch. */
G_MODULE_EXPORT void
gtk_module_init (gint *argc, gchar ***argv)
{
  (void) argc; (void) argv;
}

/* Optional, multihead-aware: called for each GdkDisplay opened. */
G_MODULE_EXPORT void
gtk_module_display_init (GdkDisplay *display)
{
  (void) display;
}
```

Export only these symbols: build with `-fvisibility=hidden` (then
`G_MODULE_EXPORT` marks the public ones) and make everything else `static`.
Check with `nm -D --defined-only lib.so`.

## 3. Observing widgets without polling

Use an **emission hook** on a `GtkWidget` signal: it fires for every instance in
the process. Two traps, both verified:

1. `g_signal_lookup ("realize", GTK_TYPE_WIDGET)` returns **0** inside
   `gtk_module_init` because no widget class has been initialised yet
   (`GLib-GObject-CRITICAL: g_signal_add_emission_hook: assertion 'signal_id > 0'`).
   Call `g_type_class_ref (GTK_TYPE_WIDGET)` first. This, not "distros not
   exposing realize", is why `advanced/` fell back to polling.
2. The hook must return `TRUE` or it is removed after the first emission.

Complete module (built with `-fvisibility=hidden -Wall -Wextra -Werror
-Wl,--as-needed`, loaded with `GTK3_MODULES` into GTK3 test apps under Xvfb with
`G_DEBUG=fatal-criticals`, valgrind-clean): all 3 titlebuttons wired; synthetic
enter/leave on the buttons' event windows toggles the headerbar class; the
class clears after a button rebuild (`decoration-layout` change) and after
hiding a hovered button — the two cases where the current `advanced/` code or a
naive state-flags version leave it stuck:

```c
#include <gtk/gtk.h>
#include <gmodule.h>

static GQuark wired_quark;

static gboolean
any_titlebutton_prelit (GtkWidget *box)
{
  g_autoptr(GList) kids = gtk_container_get_children (GTK_CONTAINER (box));
  for (GList *l = kids; l != NULL; l = l->next)
    {
      GtkWidget *child = l->data;
      if (GTK_IS_BUTTON (child) &&
          gtk_widget_get_mapped (child) &&   /* hidden/destroyed buttons keep PRELIGHT */
          gtk_style_context_has_class (gtk_widget_get_style_context (child), "titlebutton") &&
          (gtk_widget_get_state_flags (child) & GTK_STATE_FLAG_PRELIGHT))
        return TRUE;
    }
  return FALSE;
}

static void
update_target (GtkWidget *button, GtkWidget *target)
{
  GtkWidget *box = gtk_widget_get_parent (button);
  GtkStyleContext *ctx = gtk_widget_get_style_context (target);

  /* Recompute from real widget state instead of counting enter/leave. */
  if (box != NULL && GTK_IS_CONTAINER (box) && any_titlebutton_prelit (box))
    gtk_style_context_add_class (ctx, "titlebuttons-hover-alt");
  else
    gtk_style_context_remove_class (ctx, "titlebuttons-hover-alt");
}

static void
on_state_flags_changed (GtkWidget *button, GtkStateFlags previous, gpointer user_data)
{
  (void) previous;
  update_target (button, GTK_WIDGET (user_data));
}

static void
on_unmap (GtkWidget *button, gpointer user_data)
{
  /* Runs after GtkWidget's RUN_FIRST class handler, so @button is already
   * unmapped. Covers hide, window minimise and button rebuilds. */
  update_target (button, GTK_WIDGET (user_data));
}

static void
wire_button (GtkWidget *button, GtkWidget *target)
{
  if (g_object_get_qdata (G_OBJECT (button), wired_quark) != NULL)
    return;
  /* Auto-disconnects when @target is finalized. */
  g_signal_connect_object (button, "state-flags-changed",
                           G_CALLBACK (on_state_flags_changed), target, 0);
  g_signal_connect_object (button, "unmap", G_CALLBACK (on_unmap), target, 0);
  g_object_set_qdata (G_OBJECT (button), wired_quark, GINT_TO_POINTER (1));
}

static gboolean
on_button_realize (GSignalInvocationHint *ihint,
                   guint                  n_params,
                   const GValue          *params,
                   gpointer               data)
{
  (void) ihint; (void) n_params; (void) data;
  GtkWidget *w = g_value_get_object (&params[0]);
  if (GTK_IS_BUTTON (w) &&
      gtk_style_context_has_class (gtk_widget_get_style_context (w), "titlebutton"))
    {
      GtkWidget *hb = gtk_widget_get_ancestor (w, GTK_TYPE_HEADER_BAR);
      GtkWidget *target = hb != NULL ? hb : gtk_widget_get_parent (w);
      if (target != NULL)
        wire_button (w, target);
    }
  return TRUE; /* keep the hook installed */
}

G_MODULE_EXPORT const gchar *
g_module_check_init (GModule *module)
{
  g_module_make_resident (module);
  return NULL;
}

G_MODULE_EXPORT void
gtk_module_init (gint *argc, gchar ***argv)
{
  (void) argc; (void) argv;
  wired_quark = g_quark_from_static_string ("kiwi-tb-wired");
  /* Signals exist only once the class is initialised; at module-init time
   * nothing has instantiated a widget yet, so g_signal_lookup() would be 0. */
  g_type_class_ref (GTK_TYPE_WIDGET);
  g_signal_add_emission_hook (g_signal_lookup ("realize", GTK_TYPE_WIDGET),
                              0, on_button_realize, NULL, NULL);
}
```

Why it is better than polling: zero idle CPU, catches buttons that GtkHeaderBar
recreates (on maximize, decoration-layout change), never touches
destroyed widgets. If the module could be loaded *after* windows exist (the
`gtk-modules` setting path), add a one-shot `g_idle_add` that walks
`gtk_window_list_toplevels ()` once.

Other useful hooks: `"map"`, `"style-updated"`, `"hierarchy-changed"`,
`GtkWindow::"window-state-event"`. Avoid `"draw"`/`"size-allocate"` hooks (hot paths).

## 4. Styling

```c
GtkStyleContext *ctx = gtk_widget_get_style_context (w);   /* (transfer none) */
gtk_style_context_add_class (ctx, "titlebuttons-hover-alt");
gtk_style_context_has_class (ctx, "titlebutton");

static void
install_fallback_css (void)                       /* tested */
{
  GdkScreen *screen = gdk_screen_get_default ();
  g_autoptr(GtkCssProvider) provider = gtk_css_provider_new ();
  g_autoptr(GError) error = NULL;

  if (screen == NULL)
    return;
  if (!gtk_css_provider_load_from_data (provider,
        "headerbar.titlebuttons-hover-alt button.titlebutton { opacity: 1; }", -1, &error))
    {
      g_warning ("kiwi css: %s", error->message);
      return;
    }
  gtk_style_context_add_provider_for_screen (screen, GTK_STYLE_PROVIDER (provider),
                                             GTK_STYLE_PROVIDER_PRIORITY_THEME + 1);
}
```

GTK3 priorities (header values): FALLBACK 1 < THEME 200 < SETTINGS 400 <
APPLICATION 600 < USER 800 (`~/.config/gtk-3.0/gtk.css`). Kiwi's
`apps/gtkThemeManager.js` writes `@import` lines for `css/*3.css` / `*4.css`
into the **user** `gtk.css` of GTK3 and GTK4 (a managed block), so the CSS that
reacts to the module's class (`css/titlebuttons-alt3.css:179-205`) runs at USER
priority; the module itself only toggles classes. Keep it that way: a module
that also injects CSS would fight the extension's settings.

GTK3 CSS can't express "any sibling hovered", and GTK3 boxes have no hover state,
hence the module. GTK4 can: `windowcontrols:hover button.close` (used in
`css/titlebuttons-alt4.css:57`).

## 5. Installing for a session

`~/.config/environment.d/*.conf` is read by `systemd --user` environment
generators; GNOME sessions (both Wayland and X11) start apps with that
environment after re-login. Syntax supports expansion (systemd
`environment.d(5)`, verified in man source):

```ini
# ~/.config/environment.d/10-kiwi-gtk3-modules.conf
GTK3_MODULES=${GTK3_MODULES:+$GTK3_MODULES:}/home/USER/.local/lib/kiwi/libtitlebuttons_hover.so
```

- Prefer `GTK3_MODULES` over `GTK_MODULES`, append instead of overwrite (other
  modules — e.g. distro `appmenu-gtk-module`, accessibility — are often set).
- environment.d does not expand `~`; write the absolute path (`$HOME` works
  in environment.d expansion; **unverified** whether `HOME` is defined at
  generator time — environment.d(5) does not say; absolute path is safest).
- Put binaries in a data/lib dir (`~/.local/lib/kiwi/`), not in
  `~/.config/environment.d/` (a config directory).
- Replace a loaded `.so` atomically (`install -m644 src dst` or write temp + `mv`).
  `cp` over an existing file rewrites the **same inode** (verified), changing
  code under running GTK3 apps → SIGBUS/SIGSEGV.
- `systemctl --user show-environment | grep GTK` shows what new apps inherit.

## 6. Platform constraints

| Situation | Module effect |
|---|---|
| GTK3 app with client-side decorations (GtkHeaderBar), Wayland or X11 | Works (GTK3 on Mutter/Wayland always draws its own titlebar via an internal GtkHeaderBar with `.titlebar.default-decoration` — `gtkwindow.c` `create_titlebar`). |
| GTK3 app on X11 with server-side decorations | No GTK titlebuttons exist; Mutter draws the frame → no effect (`GTK_CSD=1` forces CSD on X11; GTK3 uses CSD on Wayland unless the compositor announces SSD via `org_kde_kwin_server_decoration`, which Mutter does not — `gtkwindow.c` `gtk_window_should_use_csd`, `gdkdisplay-wayland.c`; gtk-3-24 branch). |
| GTK4 / libadwaita app | Never loaded (no module support). Use CSS. |
| Flatpak GTK3 app | Flatpak does not clear `GTK3_MODULES`/`GTK_MODULES` (checked in `flatpak-run.c` default env list), but the host path usually isn't visible in the sandbox → "Failed to load module" message; if visible, the .so is linked against host libs, not the runtime (ABI risk). |
| Snap apps | Similar isolation (**unverified**: snapcraft.io unreachable; snapcraft-desktop-helpers `desktop-exports` does not clear `GTK_MODULES`). |
| `sudo`/`pkexec` apps | Environment is normally reset → not loaded. |
| Electron/Firefox/Thunderbird | Not GTK3 headerbars in the same way; Kiwi styles them via their own CSS files (`css/firefoxWindowControls*.css`). |

## 7. GTK4

- Verified: `libgtk-4.so.1` contains no `GTK_MODULES`/`gtk_module_init`
  strings; libgtk-3 contains both plus `GTK3_MODULES`.
- GTK4 "modules" are only internal extension points (IM modules, print
  backends, media backends via GIO extension points); GTK ≥ 4.13 can even link
  them statically (gtk NEWS "Let modules be statically linked into libgtk").
- Theming GTK4 apps: user CSS `~/.config/gtk-4.0/gtk.css` (USER priority) —
  what Kiwi already does. libadwaita ignores the `gtk-theme-name` setting
  (forces `Adwaita-empty`) but honours `GTK_THEME` (it then skips its own
  stylesheet — `adw-style-manager.c`); the user `gtk.css` is loaded by GTK
  itself (`gtksettings.c`), so it applies to Adw apps too.
- Code injection via `LD_PRELOAD` is possible but fragile, breaks with Flatpak,
  and is out of scope for Kiwi.

## 8. Testing a module

```sh
# 1. one process only
GTK3_MODULES=$PWD/libtitlebuttons_hover.so G_DEBUG=fatal-criticals gtk3-widget-factory
# 2. headless: small GTK3 app with a GtkHeaderBar + decoration-layout, under Xvfb
xvfb-run -a env GTK3_MODULES=$PWD/lib.so ./test-app
# 3. leaks / errors
valgrind --suppressions=/usr/share/glib-2.0/valgrind/glib.supp \
  env GTK3_MODULES=$PWD/lib.so ./test-app
# 4. Inspector: check classes on headerbar while hovering
GTK_DEBUG=interactive GTK3_MODULES=$PWD/lib.so gnome-calculator
```

Simulate hover in tests with `gtk_widget_set_state_flags (btn,
GTK_STATE_FLAG_PRELIGHT, FALSE)` and assert on
`gtk_style_context_has_class (headerbar_ctx, "titlebuttons-hover-alt")`.

## 9. Sources

- GTK3 running docs (GTK3_MODULES vs GTK_MODULES warning, GTK_PATH, module
  search): https://docs.gtk.org/gtk3/running.html — read from `GNOME/gtk`
  gtk-3-24 `docs/reference/gtk/running.sgml`
- GTK3 loader: `GNOME/gtk` gtk-3-24 `gtk/gtkmodules.c`, `gtk/gtkmain.c`
  (load flags, blacklist, refcount leak comment, unload path, GTK_DEBUG handling)
- GTK2 refusal: `GNOME/gtk` gtk-2-24 `gtk/gtkmodules.c` (`_gtk_module_has_mixed_deps`)
- GModule: https://docs.gtk.org/gmodule/ (`g_module_check_init`, `g_module_make_resident`)
- GTK4 env vars and inspector: https://docs.gtk.org/gtk4/running.html ;
  migration guide: https://docs.gtk.org/gtk4/migrating-3to4.html
- systemd environment.d: https://www.freedesktop.org/software/systemd/man/latest/environment.d.html
- Flatpak env handling: `flatpak/flatpak` `common/flatpak-run.c` (`default_exports`)
