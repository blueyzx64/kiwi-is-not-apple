# Pointer (features/pointer): shake to locate, hide while typing, size, colours, and that
# disable always gives the pointer back. Run:
#   KIWI_SMOKE_EXTRA=tools/smoke/scenarios/pointer.sh tools/smoke/run-headless.sh 3
# Headless there is no IBus app, so the caret is fed through the IBus manager's own
# 'set-cursor-location' signal (the path lib/caret.js listens to).

PTR='globalThis.__kiwiPtr ??= global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE); const ptr = globalThis.__kiwiPtr; const move = (x, y) => ptr.notify_absolute_motion(GLib.get_monotonic_time(), x, y); const tracker = global.backend.get_cursor_tracker();'
CARET='const { getIBusManager } = await import("resource:///org/gnome/shell/misc/ibusManager.js"); const caret = (x, y) => getIBusManager().emit("set-cursor-location", { x, y, width: 1, height: 18 });'
EXT='gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Extensions'
iface() { gsettings get org.gnome.desktop.interface "$1"; }

T running 'return inst("pointer") ? "PASS" : "FAIL pointer not running";'
T visible-at-start "$PTR"' move(640, 400); await sleep(100); return tracker.get_pointer_visible() ? "PASS" : "FAIL hidden at start";'
T sprite-adwaita "$PTR"' move(300, 300); await sleep(200); const s = tracker.get_sprite(); return s ? "PASS " + s.get_width() + "x" + s.get_height() : "FAIL no sprite";'

T motion-source "$PTR"' let n = 0; const id = tracker.connect("position-invalidated", () => n++); for (let i = 0; i < 10; i++) { move(100 + i * 10, 300); await sleep(10); } tracker.disconnect(id); return n >= 5 ? "PASS position-invalidated x" + n : "FAIL only " + n;'

T shake-grows "$PTR"' let x = 400; move(x, 300); await sleep(50); for (let s = 0; s < 6; s++) { for (let i = 1; i <= 10; i++) { move(s % 2 ? x - 20 * i : x + 20 * i, 300); await sleep(8); } x = s % 2 ? x - 200 : x + 200; } await sleep(250); const st = inst("pointer").state; return st.big && st.scale > 2 && !tracker.get_pointer_visible() ? "PASS big x" + st.scale.toFixed(1) : "FAIL " + JSON.stringify(st);'
T shake-shrinks "$PTR"' await sleep(1200); const st = inst("pointer").state; return !st.big && tracker.get_pointer_visible() ? "PASS back to normal" : "FAIL " + JSON.stringify(st) + " visible=" + tracker.get_pointer_visible();'
T slow-move-no-shake "$PTR"' let x = 400; for (let s = 0; s < 6; s++) { for (let i = 1; i <= 20; i++) { move(s % 2 ? x - 10 * i : x + 10 * i, 400); await sleep(40); } x = s % 2 ? x - 200 : x + 200; } const st = inst("pointer").state; return !st.big ? "PASS" : "FAIL " + JSON.stringify(st);'

T one-caret-move-keeps "$PTR $CARET"' caret(100, 100); await sleep(50); caret(110, 100); await sleep(50); return !inst("pointer").state.hiddenForTyping && tracker.get_pointer_visible() ? "PASS (a click placing the caret)" : "FAIL hidden after one move";'
T typing-hides "$PTR $CARET"' caret(120, 100); await sleep(50); const st = inst("pointer").state; return st.hiddenForTyping && !tracker.get_pointer_visible() ? "PASS hidden" : "FAIL " + JSON.stringify(st);'
T motion-shows "$PTR"' move(600, 500); await sleep(100); return !inst("pointer").state.hiddenForTyping && tracker.get_pointer_visible() ? "PASS shown" : "FAIL still hidden";'
T overview-blocks "$PTR $CARET"' Main.overview.show(); await sleep(400); caret(130, 100); await sleep(30); caret(140, 100); await sleep(30); const hid = inst("pointer").state.hiddenForTyping; Main.overview.hide(); await sleep(400); return !hid ? "PASS" : "FAIL hid over the overview";'
T setting-off "$PTR $CARET"' const s = inst("pointer")._ctx.settings; s.set_boolean("pointer-hide-while-typing", false); await sleep(100); caret(150, 100); await sleep(30); caret(160, 100); await sleep(30); const hid = inst("pointer").state.hiddenForTyping; s.set_boolean("pointer-hide-while-typing", true); return !hid ? "PASS" : "FAIL hid while off";'

# Disable while hidden: the pointer must come back
P "$PTR $CARET"' move(700, 500); await sleep(50); caret(170, 100); await sleep(30); caret(180, 100); await sleep(30); caret(190, 100); return 1;' >/dev/null
T hidden-before-disable "$PTR"' return !tracker.get_pointer_visible() ? "PASS" : "FAIL not hidden";'
$EXT.DisableExtension kiwi@kemma >/dev/null; pause 1
T disable-shows "$PTR"' return tracker.get_pointer_visible() ? "PASS visible after disable" : "FAIL left hidden";'
$EXT.EnableExtension kiwi@kemma >/dev/null; pause 2

# Size: owned while set, given back on 'system' and on disable
before=$(iface cursor-size)
gs pointer-size "'48'"; pause 0.5
[ "$(iface cursor-size)" = 48 ] && echo "PASS size-set 48" || echo "FAIL size-set $(iface cursor-size)"
$EXT.DisableExtension kiwi@kemma >/dev/null; pause 1
[ "$(iface cursor-size)" = "$before" ] && echo "PASS size-restored-on-disable $before" || echo "FAIL size-restored-on-disable $(iface cursor-size)"
$EXT.EnableExtension kiwi@kemma >/dev/null; pause 2
[ "$(iface cursor-size)" = 48 ] && echo "PASS size-again 48" || echo "FAIL size-again $(iface cursor-size)"
gs pointer-size "'system'"; pause 0.5
[ "$(iface cursor-size)" = "$before" ] && echo "PASS size-system $before" || echo "FAIL size-system $(iface cursor-size)"

# Colours: a Kiwi theme made, selected, replaced on a change, all removed when turned off
theme_before=$(iface cursor-theme)
gs pointer-custom-colors true; pause 4
t1=$(iface cursor-theme)
[ "$t1" = "'Kiwi-Pointer-000000ffffff'" ] && [ -f "$HOME/.local/share/icons/Kiwi-Pointer-000000ffffff/index.theme" ] &&
  [ -f "$HOME/.local/share/icons/Kiwi-Pointer-000000ffffff/cursors/default" ] &&
  echo "PASS colors-theme $t1 $(ls "$HOME/.local/share/icons/Kiwi-Pointer-000000ffffff/cursors" | wc -l) cursors" ||
  echo "FAIL colors-theme $t1 $(ls -R "$HOME/.local/share/icons" 2>&1 | head -5)"
gs pointer-fill-color "'#ff0000'"; pause 4
t2=$(iface cursor-theme)
[ "$t2" = "'Kiwi-Pointer-ff0000ffffff'" ] && [ ! -e "$HOME/.local/share/icons/Kiwi-Pointer-000000ffffff" ] &&
  echo "PASS colors-change $t2, old removed" || echo "FAIL colors-change $t2 $(ls "$HOME/.local/share/icons")"
T colors-sprite "$PTR"' move(310, 300); await sleep(300); move(320, 310); await sleep(300); const s = tracker.get_sprite(); if (!s) return "FAIL no sprite"; return "PASS " + s.get_width() + "x" + s.get_height();'
mkdir -p "$HOME/.local/share/icons/Kiwi-Pointer-user"
gs pointer-custom-colors false; pause 3
[ "$(iface cursor-theme)" = "$theme_before" ] && [ ! -e "$HOME/.local/share/icons/Kiwi-Pointer-ff0000ffffff" ] &&
  [ -d "$HOME/.local/share/icons/Kiwi-Pointer-user" ] &&
  echo "PASS colors-off $theme_before restored, Kiwi theme removed, unmarked folder kept" ||
  echo "FAIL colors-off $(iface cursor-theme) $(ls "$HOME/.local/share/icons")"
gs pointer-fill-color "'#000000'"

T still-running 'return inst("pointer") ? "PASS" : "FAIL";'
