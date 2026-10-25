# GTK4 + libadwaita apps in Vala

Summary: subclass `Adw.Application`, build windows from `[GtkTemplate]` classes
whose UI lives in a GResource (`.ui` XML or Blueprint), and wire actions rather
than ad-hoc callbacks. Remember GTK4 cannot be injected into other apps (no
`GTK_MODULES`) and Wayland forbids global window positioning.

## Contents
1. Minimal app without templates
2. Template-based window (tested)
3. GResource + meson
4. Blueprint instead of XML
5. Actions, accelerators, menus
6. Styling: CSS provider, dark mode, accent
7. GSettings in a helper app
8. GTK4/Wayland/Flatpak constraints relevant to Kiwi
9. Sources

## 1. Minimal app

```vala
int main (string[] args) {
    var app = new Adw.Application ("org.example.KiwiHelper",
                                   ApplicationFlags.DEFAULT_FLAGS);
    app.activate.connect (() => {
        var win = new Adw.ApplicationWindow (app) {
            title = "Kiwi Helper", default_width = 360, default_height = 240
        };
        var view = new Adw.ToolbarView ();
        view.add_top_bar (new Adw.HeaderBar ());
        var page = new Adw.StatusPage () {
            title = "Hello", description = "From Vala", icon_name = "face-smile-symbolic"
        };
        view.content = page;
        win.content = view;
        win.present ();
    });
    return app.run (args);
}
```

```sh
valac --pkg gtk4 --pkg libadwaita-1 app.vala -o app
```

`Adw.ToolbarView` needs libadwaita ≥ 1.4; `ApplicationFlags.DEFAULT_FLAGS` needs
GLib ≥ 2.74 (use `FLAGS_NONE` for older).

## 2. Template-based window

Verified: builds with meson and runs under Xvfb (GTK 4.14, Adw 1.5).

`main.vala`:

```vala
[GtkTemplate (ui = "/org/example/KiwiHelper/window.ui")]
public class Kiwi.Window : Adw.ApplicationWindow {
    [GtkChild] private unowned Gtk.Label status_label;   // must be unowned
    [GtkChild] private unowned Gtk.Button action_button;

    public Window (Adw.Application app) {
        Object (application: app);
    }

    construct {
        action_button.clicked.connect (on_action_clicked);
    }

    private void on_action_clicked () {
        status_label.label = "Clicked";
    }

    [GtkCallback]                                         // referenced from .ui
    private void on_reset_clicked () {
        status_label.label = "Ready";
    }
}

public class Kiwi.App : Adw.Application {
    public App () {
        Object (application_id: "org.example.KiwiHelper",
                flags: ApplicationFlags.DEFAULT_FLAGS);
    }

    protected override void activate () {
        var win = active_window ?? new Kiwi.Window (this);
        win.present ();
    }
}

int main (string[] args) {
    return new Kiwi.App ().run (args);
}
```

`window.ui` (the `class` is the C type name: namespace + class, no dots):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<interface>
  <requires lib="gtk" version="4.0"/>
  <requires lib="libadwaita" version="1.0"/>
  <template class="KiwiWindow" parent="AdwApplicationWindow">
    <property name="default-width">360</property>
    <property name="default-height">240</property>
    <property name="content">
      <object class="AdwToolbarView">
        <child type="top"><object class="AdwHeaderBar"/></child>
        <property name="content">
          <object class="GtkBox">
            <property name="orientation">vertical</property>
            <property name="spacing">12</property>
            <property name="margin-top">24</property>
            <property name="margin-bottom">24</property>
            <property name="margin-start">24</property>
            <property name="margin-end">24</property>
            <child>
              <object class="GtkLabel" id="status_label">
                <property name="label">Ready</property>
              </object>
            </child>
            <child>
              <object class="GtkButton" id="action_button">
                <property name="label">Do it</property>
                <style><class name="suggested-action"/></style>
              </object>
            </child>
            <child>
              <object class="GtkButton">
                <property name="label">Reset</property>
                <signal name="clicked" handler="on_reset_clicked"/>
              </object>
            </child>
          </object>
        </property>
      </object>
    </property>
  </template>
</interface>
```

Rules:
- `[GtkChild]` field names must equal the `id`s; fields must be `unowned`
  (the template owns them).
- The method connected through `<signal handler=…>` needs `[GtkCallback]`.
- Do initialisation in `construct {}`; the template is already instantiated
  there.

## 3. GResource + meson

`kiwi.gresource.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gresources>
  <gresource prefix="/org/example/KiwiHelper">
    <file preprocess="xml-stripblanks">window.ui</file>
    <file>style.css</file>
  </gresource>
</gresources>
```

`meson.build`:

```meson
project('kiwi-helper-app', 'vala', 'c', version: '0.1.0', meson_version: '>= 0.62')
gnome = import('gnome')
resources = gnome.compile_resources('kiwi-resources', 'kiwi.gresource.xml',
  source_dir: meson.current_source_dir(), c_name: 'kiwi')
executable('kiwi-helper-app', 'main.vala', resources,
  dependencies: [dependency('gtk4'), dependency('libadwaita-1', version: '>= 1.4')],
  # lets valac check [GtkChild]/[GtkCallback] against the .ui at compile time
  vala_args: ['--gresourcesdir=' + meson.current_source_dir()],
  install: true)
```

`--gresources=kiwi.gresource.xml` (or `--gresourcesdir`) makes valac validate
template ids at compile time; without it, mistakes only show up as runtime
criticals. `Adw.Application` automatically loads `style.css` /
`style-dark.css` from its resource base path (`/org/example/KiwiHelper/`).

## 4. Blueprint instead of XML

Blueprint (`.blp`) compiles to the same `.ui` XML. Equivalent of the template
above (syntax per blueprint-compiler docs; compiler not installed in this
sandbox, so **unverified** here):

```blueprint
using Gtk 4.0;
using Adw 1;

template $KiwiWindow : Adw.ApplicationWindow {
  default-width: 360;
  default-height: 240;
  content: Adw.ToolbarView {
    [top]
    Adw.HeaderBar {}
    content: Box {
      orientation: vertical;
      spacing: 12;
      margin-top: 24;
      Label status_label { label: "Ready"; }
      Button action_button {
        label: "Do it";
        styles ["suggested-action"]
      }
      Button {
        label: "Reset";
        clicked => $on_reset_clicked();
      }
    };
  };
}
```

meson:

```meson
blueprints = custom_target('blueprints',
  input: files('window.blp'),
  output: '.',
  command: [find_program('blueprint-compiler'), 'batch-compile', '@OUTPUT@', '@CURRENT_SOURCE_DIR@', '@INPUT@'])
resources = gnome.compile_resources('kiwi-resources', 'kiwi.gresource.xml',
  dependencies: blueprints, c_name: 'kiwi')
```

## 5. Actions

```vala
protected override void startup () {
    base.startup ();
    // A local named `quit` would shadow Application.quit () ("invocation not
    // supported in this context") — verified.
    var quit_action = new SimpleAction ("quit", null);
    quit_action.activate.connect (() => quit ());
    add_action (quit_action);
    set_accels_for_action ("app.quit", { "<Control>q" });

    var about = new SimpleAction ("about", null);
    about.activate.connect (() => {
        var dlg = new Adw.AboutDialog () {           // Adw >= 1.5
            application_name = "Kiwi Helper", version = "0.1.0",
            license_type = Gtk.License.GPL_3_0
        };
        dlg.present (active_window);
    });
    add_action (about);
}
```

Stateful action bound to GSettings: `add_action (settings.create_action ("show-preview"));`.
In `.ui`, buttons use `<property name="action-name">app.about</property>`.

## 6. Styling

```vala
var provider = new Gtk.CssProvider ();
provider.load_from_string (".kiwi-dot { border-radius: 9999px; }");  // GTK >= 4.12
Gtk.StyleContext.add_provider_for_display (Gdk.Display.get_default (), provider,
                                           Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
widget.add_css_class ("kiwi-dot");

var sm = Adw.StyleManager.get_default ();
sm.notify["dark"].connect (() => debug ("dark=%s", sm.dark.to_string ()));
```

`gtk_style_context_add_provider_for_display` is **not** deprecated in C (it lives
in `gtkstyleprovider.h`, `GDK_AVAILABLE_IN_ALL`), but valac 0.56 warns
"`Gtk.StyleContext` has been deprecated since 4.10" because the vapi marks the
whole class. Accept that one warning (or wrap the call in a tiny C helper);
per-widget style contexts are gone — use `add_css_class`/`remove_css_class`. Don't
force a color scheme in a helper; follow `AdwStyleManager`.

## 7. GSettings

```vala
var settings = new GLib.Settings ("org.gnome.shell.extensions.kiwi");
settings.bind ("panel-transparency", scale.adjustment, "value", SettingsBindFlags.DEFAULT);
```

The extension's schema is compiled inside the extension directory, not in
`/usr/share/glib-2.0/schemas`. A separate helper must load it explicitly:

```vala
var src = new SettingsSchemaSource.from_directory (schema_dir, SettingsSchemaSource.get_default (), false);
var schema = src.lookup ("org.gnome.shell.extensions.kiwi", false);
var settings = new GLib.Settings.full (schema, null, null);
```

(`schema_dir` = `~/.local/share/gnome-shell/extensions/kiwi@kemma/schemas`
for a user install.)

## 8. Constraints relevant to Kiwi

- **No GTK4 modules.** GTK 4 dropped `GTK_MODULES`/`gtk_module_init`
  (verified: libgtk-4.so.1 contains neither string; libgtk-3 contains
  `GTK3_MODULES`, `GTK_MODULES`, `gtk_module_init`). Restyling other GTK4 apps is
  only possible through CSS (`~/.config/gtk-4.0/gtk.css`) which libadwaita apps
  largely ignore for their own styles. The `advanced/` approach cannot be ported.
- **Wayland:** a client cannot place its window at absolute coordinates, raise
  itself, or read other windows. Overlays (notch, dock previews) must be
  drawn by the Shell (GJS), not by a helper app.
- **Flatpak:** the app sees only its sandbox; talking to a Kiwi helper requires
  `--talk-name=org.example.Kiwi.*`; the extension's GSettings schema is not
  visible unless shipped in the app.
- `GDK_BACKEND=x11` forces XWayland for debugging only.

## 9. Sources

- GTK4 widget templates: https://docs.gtk.org/gtk4/class.Widget.html#building-composite-widgets-from-template-xml
- GTK 3→4 migration (event controllers, style context, modules):
  https://docs.gtk.org/gtk4/migrating-3to4.html (read from `GNOME/gtk` mirror,
  `docs/reference/gtk/migrating-3to4.md`)
- libadwaita API: https://gnome.pages.gitlab.gnome.org/libadwaita/doc/1-latest/
  (not reachable; checked against local `libadwaita-1.vapi` 1.5)
- Meson `gnome.compile_resources`: https://mesonbuild.com/Gnome-module.html
- Blueprint: https://jwestman.pages.gitlab.gnome.org/blueprint-compiler/ (**unverified** here)
