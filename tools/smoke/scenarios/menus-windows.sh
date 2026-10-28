# Menus and windows signifiers (docs/research/macos/signifiers-and-typing.md §4):
# Option alternates, menu bar background, Differentiate Without Colour, the unsaved dot and
# the GTK sheets. Run:
#   KIWI_SMOKE_EXTRA=tools/smoke/scenarios/menus-windows.sh tools/smoke/run-headless.sh 3
# Screenshots go to $W/shots (the smoke work dir; KIWI_SMOKE_KEEP=1 keeps it).

mkdir -p "$W/shots"
SHOT() {
  P "const f = Gio.File.new_for_path('$W/shots/$1.png'); const s = f.replace(null, false, 0, null);
     const shot = new Shell.Screenshot();
     await new Promise((res, rej) => shot.screenshot(false, s, (o, r) => { try { o.screenshot_finish(r); res(); } catch (e) { rej(e); } }));
     s.close(null); return '$1';" >/dev/null
  echo "SHOT $W/shots/$1.png"
}

# ---- 4.1 Option in the logo menu -------------------------------------------------------------
T logo-menu-open 'const logo = inst("menu-bar")?.part("logo"); if (!logo) return "FAIL no logo menu";
  logo.menu.open(); await sleep(400);
  return logo.menu.isOpen && logo.aboutItem.label.text === "About This PC" ? "PASS " + logo.aboutItem.label.text : "FAIL " + logo.aboutItem.label.text;'
keydown KEY_Alt_L
pause 0.3
T logo-alt-held 'const t = inst("menu-bar").part("logo").aboutItem.label.text; return t === "System Information…" ? "PASS " + t : "FAIL " + t;'
SHOT logo-menu-option
keyup KEY_Alt_L
pause 0.3
T logo-alt-released 'const t = inst("menu-bar").part("logo").aboutItem.label.text; return t === "About This PC" ? "PASS " + t : "FAIL " + t;'
gs menubar-option-alternates false
keydown KEY_Alt_L
pause 0.3
T logo-alt-off 'const t = inst("menu-bar").part("logo").aboutItem.label.text; return t === "About This PC" ? "PASS setting off keeps " + t : "FAIL " + t;'
keyup KEY_Alt_L
gs menubar-option-alternates true
P 'inst("menu-bar").part("logo").menu.close(); return 1;' >/dev/null
pause 0.3

# ---- 4.9 Show Menu Bar Background (menubar-transparent inverted) -----------------------------
gs menubar-transparent false
pause 0.5
T bar-background-on 'const mb = inst("menu-bar"); return !mb.part("look") && !Main.panel.has_style_class_name("kiwi-menubar-clear") ? "PASS solid bar, no clear class" : "FAIL look still running";'
gs menubar-transparent true
pause 0.5
T bar-background-off 'return inst("menu-bar").part("look") ? "PASS transparent look running" : "FAIL no look";'

# ---- 4.5 Differentiate Without Colour ---------------------------------------------------------
T shapes-default 'const b = inst("menu-bar").part("privacy")?.button; if (!b) return "FAIL no privacy button";
  return !b.box.has_style_class_name("kiwi-privacy-shapes") ? "PASS colour only by default" : "FAIL shapes on by default";'
gs a11y-differentiate-without-color true
pause 0.3
T shapes-privacy 'const b = inst("menu-bar").part("privacy").button; b.visible = true; for (const d of Object.values(b.dots)) d.visible = true;
  return b.box.has_style_class_name("kiwi-privacy-shapes") ? "PASS privacy dots get shapes" : "FAIL";'
T shapes-dock 'const d = inst("dock"); if (!d) return "PASS dock off";
  return d._view.band.has_style_class_name("kiwi-dock-shapes") ? "PASS dock band shapes" : "FAIL dock";'
SHOT privacy-shapes
gs a11y-differentiate-without-color false
pause 0.3
T shapes-off 'const b = inst("menu-bar").part("privacy").button; const ok = !b.box.has_style_class_name("kiwi-privacy-shapes"); b.visible = false;
  return ok ? "PASS shapes off again" : "FAIL";'

# ---- GTK sheets in the user's gtk.css -------------------------------------------------------
T gtk-sheets 'const [ok, bytes] = GLib.file_get_contents(GLib.get_user_config_dir() + "/gtk-4.0/gtk.css");
  const t = new TextDecoder().decode(bytes);
  const want = ["titlebuttons4.css", "titlebuttons-bounce-small4.css", "active-window4.css"];
  const miss = want.filter(w => !t.includes(w));
  return !miss.length && !t.includes("toolbar-shapes4.css") ? "PASS " + want.join(" ") : "FAIL missing " + miss.join(" ");'
gs app-buttons-toolbar-shapes true
pause 1
T gtk-toolbar-shapes 'const [, bytes] = GLib.file_get_contents(GLib.get_user_config_dir() + "/gtk-3.0/gtk.css");
  return new TextDecoder().decode(bytes).includes("toolbar-shapes3.css") ? "PASS toolbar-shapes3.css imported" : "FAIL";'

# ---- an app: app-menu alternates and the unsaved dot ----------------------------------------
if command -v gnome-text-editor >/dev/null; then
  # Spawned, not activated: the smoke bus has no D-Bus service activation
  # A saved file, so an edit marks the title (a new draft's title never says it is modified)
  printf 'Kiwi\n' >"$W/note.txt"
  P "GLib.spawn_async(null, ['gnome-text-editor', '--standalone', '$W/note.txt'], null, GLib.SpawnFlags.SEARCH_PATH, null); return 1;" >/dev/null
  for _ in $(seq 1 30); do
    r=$(P 'return global.display.focus_window?.get_wm_class() ?? "";'); case "$r" in *TextEditor*) break ;; esac; sleep 0.5
  done
  pause 2
  T app-focused 'const w = global.display.focus_window; return w ? "PASS " + w.get_wm_class() + " | " + w.title : "FAIL no window";'
  SHOT editor-clean
  T app-menu-alt 'const apps = inst("menu-bar").part("apps"); const b = apps?._buttons?.find(x => x.def?.id === "app");
    if (!b) return "FAIL no app menu"; b.menu.open(); await sleep(500);
    const items = b.menu._getMenuItems().filter(i => i.label); const quit = items.find(i => i.label.text.startsWith("Quit"));
    return quit ? "PASS opened: " + quit.label.text : "FAIL no Quit item";'
  keydown KEY_Alt_L
  pause 0.3
  T app-menu-alt-held 'const b = inst("menu-bar").part("apps")._buttons.find(x => x.def?.id === "app");
    const labels = b.menu._getMenuItems().filter(i => i.label).map(i => i.label.text);
    return labels.some(l => l.startsWith("Force Quit")) && labels.filter(l => l === "Hide Others").length === 1 ? "PASS " + labels.join(", ") : "FAIL " + labels.join(", ");'
  SHOT app-menu-option
  keyup KEY_Alt_L
  pause 0.3
  T app-menu-alt-released 'const b = inst("menu-bar").part("apps")._buttons.find(x => x.def?.id === "app");
    const labels = b.menu._getMenuItems().filter(i => i.label).map(i => i.label.text); b.menu.close();
    return labels.some(l => l.startsWith("Quit")) ? "PASS " + labels.join(", ") : "FAIL " + labels.join(", ");'
  pause 0.5
  T file-menu-alt 'const b = inst("menu-bar").part("apps")._buttons.find(x => x.def?.id === "file");
    if (!b) return "FAIL no File menu"; b.menu.open(); await sleep(500);
    const before = b.menu._getMenuItems().filter(i => i.label).map(i => i.label.text);
    globalThis.__kiwiFileMenu = b; return before.includes("Close Window") ? "PASS " + before.join(", ") : "FAIL " + before.join(", ");'
  keydown KEY_Alt_L
  pause 0.3
  T file-menu-alt-held 'const b = globalThis.__kiwiFileMenu; const labels = b.menu._getMenuItems().filter(i => i.label).map(i => i.label.text);
    return labels.includes("Close All") ? "PASS " + labels.join(", ") : "FAIL " + labels.join(", ");'
  keyup KEY_Alt_L
  pause 0.3
  P 'globalThis.__kiwiFileMenu?.menu.close(); delete globalThis.__kiwiFileMenu; return 1;' >/dev/null
  pause 0.5
  # Text Editor shows "•" in its own headerbar, not in the window title: no dot (a known limit)
  T title-before 'return "PASS " + global.display.focus_window?.title;'
  key KEY_K KEY_i KEY_w KEY_i
  pause 1.5
  T editor-no-title-mark 'const w = global.display.focus_window;
    return !inst("app-buttons").unsavedDots.marked.includes(w) ? "PASS no dot, title: " + w.title : "FAIL";'
  SHOT editor-edited
else
  echo "SKIP gnome-text-editor not installed: app menus covered by unit tests only"
fi

# ---- 4.2 the unsaved dot: a libadwaita window (client-side titlebar, Kiwi's traffic lights) --
cat >"$W/modified.js" <<'JS'
import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
const app = new Adw.Application({ application_id: 'org.kiwi.SmokeModified' });
app.connect('activate', () => {
    const win = new Adw.ApplicationWindow({ application: app, title: 'note.txt - Smoke', default_width: 600, default_height: 400 });
    const view = new Adw.ToolbarView();
    view.add_top_bar(new Adw.HeaderBar());
    win.set_content(view);
    win.present();
    GLib.timeout_add(0, 3000, () => { win.title = '*note.txt - Smoke'; return false; });
});
app.run([]);
JS
P "GLib.spawn_async(null, ['gjs', '-m', '$W/modified.js'], null, GLib.SpawnFlags.SEARCH_PATH, null); return 1;" >/dev/null
for _ in $(seq 1 30); do
  r=$(P 'return global.display.focus_window?.title ?? "";'); case "$r" in *Smoke*) break ;; esac; sleep 0.3
done
T unsaved-clean 'const w = global.display.focus_window;
  return w?.title === "note.txt - Smoke" && !inst("app-buttons").unsavedDots.marked.includes(w) ? "PASS no dot: " + w.title : "FAIL " + w?.title;'
pause 3.5
T unsaved-dot 'const w = global.display.focus_window; const d = inst("app-buttons").unsavedDots;
  return d.marked.includes(w) ? "PASS dot on: " + w.title : "FAIL not marked: " + JSON.stringify(w?.title);'
SHOT unsaved-dot
P 'const w = global.display.focus_window; const f = w.get_frame_rect(); const b = w.get_buffer_rect();
   const dot = w.get_compositor_private().get_children().find(c => c.style_class === "kiwi-unsaved-dot");
   const [x, y] = dot ? dot.get_transformed_position() : [0, 0];
   return JSON.stringify({ frame: [f.x, f.y, f.width, f.height], buffer: [b.x, b.y], dotCentre: [x + 3, y + 3] });' | sed 's/^/INFO geometry /'
gs app-buttons-unsaved-dot false
pause 0.3
T unsaved-off 'const w = global.display.focus_window; const left = w.get_compositor_private().get_children().some(c => c.style_class === "kiwi-unsaved-dot");
  return inst("app-buttons").unsavedDots === null && !left ? "PASS tracker stopped, dot removed" : "FAIL";'
gs app-buttons-unsaved-dot true
pause 0.3
T unsaved-on-again 'const w = global.display.focus_window;
  return inst("app-buttons").unsavedDots.marked.includes(w) ? "PASS dot back" : "FAIL";'
