# gtk4-rs basics

Summary: how to build a GTK4/libadwaita helper app in Rust with gtk4-rs 0.11.
Covers the Application lifecycle, widgets, composite templates, GObject subclassing,
properties/signals macros, and the relm4 alternative. Examples follow the gtk-rs book.

## Contents
1. Cargo setup
2. Application and window
3. GObject subclassing (`mod.rs` + `imp.rs`)
4. Properties with `#[derive(Properties)]`
5. Custom signals
6. Composite templates (`.ui` + `#[template_child]`)
7. Closures and memory: `clone!`
8. libadwaita
9. relm4 (Elm-style alternative)
10. Kiwi guidance

---

## 1. Cargo setup

From the gtk-rs book listings `Cargo.toml` (edition 2024):

```toml
[dependencies]
gtk = { version = "0.11", package = "gtk4", features = ["v4_14"] }
adw = { version = "0.9", package = "libadwaita", features = ["v1_8"] }
async-channel = "2.5"

[build-dependencies]
glib-build-tools = "0.22"   # only if resources are compiled in build.rs (not with meson)
```

Feature flags (`v4_14`, `v1_8`) gate newer API; pick the oldest GTK/libadwaita your
target distros ship (GNOME 48 ships GTK 4.18 / libadwaita 1.7 — release.gnome.org/48;
distros may lag).
Re-export glib/gio through gtk: `use gtk::{gio, glib};` so versions never diverge.

## 2. Application and window

```rust
use gtk::prelude::*;
use gtk::{glib, Application, ApplicationWindow, Button};

const APP_ID: &str = "io.github.kem_a.Kiwi.Settings";

fn main() -> glib::ExitCode {
    let app = Application::builder().application_id(APP_ID).build();
    app.connect_activate(build_ui);
    app.run()
}

fn build_ui(app: &Application) {
    let button = Button::builder().label("Press me!").margin_top(12).build();
    button.connect_clicked(|b| b.set_label("Hello World!"));
    ApplicationWindow::builder()
        .application(app)
        .title("Kiwi")
        .child(&button)
        .build()
        .present();
}
```

`GApplication` gives single-instance + D-Bus activation for free (it owns `APP_ID`
on the session bus). Builders (`::builder()`) are the idiomatic constructor.

## 3. GObject subclassing

Two modules per type: the public wrapper (`mod.rs`) and the private implementation
(`imp.rs`). Pattern from the book (`g_object_subclassing`):

```rust
// custom_button/mod.rs
mod imp;
use gtk::glib;

glib::wrapper! {
    pub struct CustomButton(ObjectSubclass<imp::CustomButton>)
        @extends gtk::Button, gtk::Widget,
        @implements gtk::Accessible, gtk::Actionable, gtk::Buildable, gtk::ConstraintTarget;
}

impl CustomButton {
    pub fn new() -> Self { glib::Object::builder().build() }
}
```

```rust
// custom_button/imp.rs
use gtk::glib;
use gtk::subclass::prelude::*;

#[derive(Default)]
pub struct CustomButton;

#[glib::object_subclass]
impl ObjectSubclass for CustomButton {
    const NAME: &'static str = "KiwiCustomButton"; // must be globally unique
    type Type = super::CustomButton;
    type ParentType = gtk::Button;
}

impl ObjectImpl for CustomButton {}
impl WidgetImpl for CustomButton {}
impl ButtonImpl for CustomButton {}
```

Interior mutability: fields of `imp` structs are `Cell<T>` (Copy) or `RefCell<T>`;
`self.obj()` returns the wrapper from inside `imp`.

## 4. Properties

```rust
use std::cell::Cell;
use glib::Properties;
use gtk::{glib, prelude::*, subclass::prelude::*};

#[derive(Properties, Default)]
#[properties(wrapper_type = super::CustomButton)]
pub struct CustomButton {
    #[property(get, set)]
    number: Cell<i32>,
}

#[glib::derived_properties]          // generates properties()/set_property()/property()
impl ObjectImpl for CustomButton {
    fn constructed(&self) {
        self.parent_constructed();
        let obj = self.obj();
        obj.bind_property("number", obj.as_ref(), "label").sync_create().build();
    }
}
```

The macro generates typed accessors on the wrapper (`obj.number()`, `obj.set_number()`)
and `notify::number` emission. Prefer `bind_property` / `gio::Settings::bind` over
manual signal plumbing.

## 5. Custom signals

```rust
use std::sync::OnceLock;
use glib::subclass::Signal;

impl ObjectImpl for CustomButton {
    fn signals() -> &'static [Signal] {
        static SIGNALS: OnceLock<Vec<Signal>> = OnceLock::new();
        SIGNALS.get_or_init(|| {
            vec![Signal::builder("max-number-reached")
                .param_types([i32::static_type()])
                .build()]
        })
    }
}
// emit:    obj.emit_by_name::<()>("max-number-reached", &[&8]);
// connect: button.connect_closure("max-number-reached", false,
//              glib::closure_local!(|_b: CustomButton, n: i32| println!("{n}")));
```

## 6. Composite templates

```rust
use glib::subclass::InitializingObject;
use gtk::{glib, prelude::*, subclass::prelude::*, Button, CompositeTemplate};

#[derive(CompositeTemplate, Default)]
#[template(resource = "/io/github/kem_a/Kiwi/Settings/window.ui")]
pub struct Window {
    #[template_child]
    pub button: TemplateChild<Button>,
}

#[glib::object_subclass]
impl ObjectSubclass for Window {
    const NAME: &'static str = "KiwiSettingsWindow";
    type Type = super::Window;
    type ParentType = gtk::ApplicationWindow;

    fn class_init(klass: &mut Self::Class) {
        klass.bind_template();
        klass.bind_template_callbacks(); // if using #[gtk::template_callbacks]
    }
    fn instance_init(obj: &InitializingObject<Self>) { obj.init_template(); }
}
impl ObjectImpl for Window {}
impl WidgetImpl for Window {}
impl WindowImpl for Window {}
impl ApplicationWindowImpl for Window {}
```

```xml
<interface>
  <template class="KiwiSettingsWindow" parent="GtkApplicationWindow">
    <property name="title">Kiwi</property>
    <child><object class="GtkButton" id="button"><property name="label">Press me!</property></object></child>
  </template>
</interface>
```

Register resources either in `build.rs` (`glib_build_tools::compile_resources`) plus
`gio::resources_register_include!`, or — with meson — load the installed bundle via
`gio::Resource::load(path)` + `gio::resources_register` (see packaging reference).

## 7. Closures and memory: `clone!`

GObjects are refcounted; capturing a widget strongly in its own signal handler leaks it.

```rust
use glib::clone;
button.connect_clicked(clone!(
    #[weak] label,                 // upgrade fails -> closure returns early
    move |_| label.set_text("clicked")
));
```

Use `#[weak]` for widgets, `#[strong]` for channels/senders, `#[upgrade_or]` to choose
the early-return value.

## 8. libadwaita

```rust
fn main() -> glib::ExitCode {
    let app = adw::Application::builder().application_id(APP_ID).build();
    app.connect_activate(|app| {
        let page = adw::PreferencesPage::new();
        let group = adw::PreferencesGroup::builder().title("Clipboard").build();
        let row = adw::SwitchRow::builder().title("Keep history").build();
        group.add(&row);
        page.add(&group);
        let view = adw::ToolbarView::new();
        view.add_top_bar(&adw::HeaderBar::new());
        view.set_content(Some(&page));
        adw::ApplicationWindow::builder().application(app).content(&view).build().present();
    });
    app.run()
}
```

`adw::PreferencesWindow` is deprecated since libadwaita 1.6 (a warning, so it fails
`clippy -D warnings`); for a dialog use `adw::PreferencesDialog` + `.present(Some(&parent))`.
`adw::Application` initialises libadwaita styling automatically. The widget set
(`PreferencesPage/Group`, `SwitchRow`, `ComboRow`, `ExpanderRow`) matches what
`prefs.js` already uses in GJS, so UX stays consistent.

## 9. relm4

relm4 0.11 wraps gtk4-rs in an Elm architecture: `Model` + `Input` messages + `update`
+ declarative `view!`. Good fit when the helper UI is state-heavy (clipboard browser).

```rust
use gtk::prelude::*;
use relm4::prelude::*;

struct App { counter: u8 }
#[derive(Debug)] enum Msg { Increment }

#[relm4::component]
impl SimpleComponent for App {
    type Init = u8; type Input = Msg; type Output = ();
    view! {
        gtk::Window {
            gtk::Button { set_label: "+1", connect_clicked => Msg::Increment },
        }
    }
    fn init(counter: u8, root: Self::Root, sender: ComponentSender<Self>) -> ComponentParts<Self> {
        let model = App { counter };
        let widgets = view_output!();
        ComponentParts { model, widgets }
    }
    fn update(&mut self, msg: Msg, _s: ComponentSender<Self>) {
        match msg { Msg::Increment => self.counter = self.counter.wrapping_add(1) }
    }
}

fn main() { RelmApp::new("io.github.kem_a.Kiwi.Clips").run::<App>(0); }
```

`update` is a pure-ish state transition → trivially unit-testable (functional core).
Async/background work: relm4 *Workers* and *Commands* (book: "Threads and async").

## 10. Kiwi guidance

- A GUI helper is only justified if `prefs.js` (libadwaita in GJS) cannot do the job.
- Keep the UI crate thin; put logic in a `kiwi-core` library crate with no gtk deps.
- Unique `NAME`s: prefix every GType with `Kiwi`.

Sources: gtk-rs book chapters *GObject Subclassing / Properties / Signals*,
*Composite Templates*, *Libadwaita* — https://gtk-rs.org/gtk4-rs/stable/latest/book/
(`closure_local!` connect example: https://gtk-rs.org/gtk4-rs/stable/latest/book/g_object_signals.html);
relm4 book https://relm4.org/book/stable/ (*Your first app*); GNOME 48 = GTK 4.18 /
libadwaita 1.7 — https://release.gnome.org/48/developers/ ; `PreferencesWindow`
deprecation — https://docs.rs/libadwaita/0.9.2/libadwaita/struct.PreferencesWindow.html .
