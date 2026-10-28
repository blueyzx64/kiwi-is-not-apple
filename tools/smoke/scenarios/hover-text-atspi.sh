# Hover Text through a real accessibility bus and a real GTK 4 app (features/hoverText).
# Run: KIWI_SMOKE_EXTRA=tools/smoke/scenarios/hover-text-atspi.sh tools/smoke/run-headless.sh 0
#
# Starts at-spi-bus-launcher and at-spi2-registryd in the throwaway session (the smoke bus has
# no D-Bus activation), opens GNOME Text Editor on the headless Shell, types into it, and checks
# what Hover Typing, the focus ring and Hover Text read. Needs at-spi2-core and
# gnome-text-editor; INFO lines report what the app exposed.

H='const h = inst("hover-text");'
/usr/libexec/at-spi-bus-launcher --launch-immediately >/dev/null 2>&1 &
pause 1.5
/usr/libexec/at-spi2-registryd >/dev/null 2>&1 &
pause 1
# The feature started before the bus existed: restart it so it connects and subscribes
gs hover-text false; gs hover-typing false; gs hover-focus-highlight false
pause 0.5
gs hover-text true; gs hover-typing true; gs hover-focus-highlight true
pause 1
T a11y-bus "$H"' const ok = await h._source.available(); return ok ? "PASS a11y bus present" : "FAIL no a11y bus";'

WAYLAND_DISPLAY=wayland-0 GDK_BACKEND=wayland GSK_RENDERER=cairo NO_AT_BRIDGE=0 gnome-text-editor --standalone >/dev/null 2>&1 &
pause 6
T app-window 'const w = global.display.focus_window; const r = w?.get_frame_rect(); return w ? "PASS focus " + w.get_wm_class() + " frame " + [r.x, r.y, r.width, r.height] : "FAIL no focused window";'
# The first key after the window maps can be lost by the app: a throwaway space first
key KEY_space
pause 0.5
key KEY_h KEY_e KEY_l KEY_l KEY_o KEY_space KEY_k KEY_i KEY_w KEY_i
pause 1.5
T typing-real "$H"' const s = h.state; return s.typing && s.typing.includes("hello kiwi") ? "PASS typing panel: " + s.typing : "FAIL " + JSON.stringify(s);'
T field-inside-window "$H"' const o = h.state.field; const f = o && { x: o.x + 4, y: o.y + 4, width: o.width - 8, height: o.height - 8 }; /* the outline is 4 px outside the element */ const r = global.display.focus_window.get_frame_rect(); return f && f.x >= r.x && f.y >= r.y && f.x + f.width <= r.x + r.width && f.y + f.height <= r.y + r.height ? "PASS field " + JSON.stringify(f) + " in frame " + [r.x, r.y, r.width, r.height] : "FAIL field " + JSON.stringify(f) + " frame " + [r.x, r.y, r.width, r.height];'
T focus-ring-real "$H"' const s = h.state; return s.ring ? "PASS ring " + JSON.stringify(s.ring) : "INFO no focus ring (no focus event since start) " + JSON.stringify(s);'
# Hover Text over the typed text: the field rect from Hover Typing, a little inside its left edge
P "$H"' const f = h.state.field; const w = global.display.focus_window.get_frame_rect(); const x = f ? f.x + 30 : w.x + 80; const y = f ? f.y + 20 : w.y + 120; global.stage.context.get_backend().get_default_seat().warp_pointer(x, y); return [x, y];'
pause 0.3
keydown KEY_Super_L
pause 2
T hover-text-real "$H"' const s = h.state; return s.text && s.text.includes("hello kiwi") ? "PASS hover text: " + s.text + " element " + JSON.stringify(s.element) : "FAIL " + JSON.stringify(s);'
# KIWI_SMOKE_SHOTS=dir: a screenshot with both panels (never committed)
SHOTDIR=${KIWI_SMOKE_SHOTS:-}
[ -n "$SHOTDIR" ] && P "const s = new Shell.Screenshot(); const f = Gio.File.new_for_path(\"$SHOTDIR/hover-text.png\"); const o = f.replace(null, false, 0, null); await new Promise(r => s.screenshot(false, o, () => r())); o.close(null); return 1;" >/dev/null
keyup KEY_Super_L
pause 0.5
T hover-hidden "$H"' return h.state.text === null ? "PASS" : "FAIL " + JSON.stringify(h.state);'
# core/appMenus/atspi.js shares lib/atspiBus.js: its provider reads the same app (the primary
# menu popover of Text Editor, opened while hidden)
T appmenus-atspi 'const dir = Main.extensionManager.lookup("kiwi@kemma").dir.get_path(); const { AtspiProvider } = await import("file://" + dir + "/core/appMenus/atspi.js"); const p = new AtspiProvider({ popovers: true }); p.start(); const w = global.display.focus_window; try { const r = await p.fetch({ pid: w.get_pid(), windowId: 1, title: w.get_title(), appId: "org.gnome.TextEditor" }, null); const items = (r.menus?.[0]?.items ?? []).map(i => i.label ?? i.title ?? i.kind); return items.length ? "PASS primary menu items: " + items.slice(0, 5).join(", ") : "FAIL no items " + JSON.stringify(r); } finally { p.stop(); }'
P 'global.display.focus_window?.kill(); return 1;' >/dev/null
pause 1
