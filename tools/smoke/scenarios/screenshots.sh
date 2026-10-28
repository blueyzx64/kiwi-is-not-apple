# GNOME's own screenshot keys with Kiwi on: Print opens the stock UI and Return saves,
# Shift+Print saves at once; also while the pointer is hidden for typing, after Kiwi's own
# Shift+Super+4 area capture, and while a desktop icon's name is being edited (the rename
# field once took a NONE action mode, which turned every Shell shortcut off, and it opened at
# NaN at the top left for a new folder). Then the notch shelf follows the saved file.
#   KIWI_SMOKE_EXTRA=tools/smoke/scenarios/screenshots.sh tools/smoke/run-headless.sh 3
# Headless there is no Pictures folder, so GNOME writes to ~/Screenshots.

PTR='globalThis.__kiwiPtr ??= global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE); const ptr = globalThis.__kiwiPtr; const move = (x, y) => ptr.notify_absolute_motion(GLib.get_monotonic_time(), x, y); const btn = s => ptr.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY, s);'
CARET='const { getIBusManager } = await import("resource:///org/gnome/shell/misc/ibusManager.js"); const caret = (x, y) => getIBusManager().emit("set-cursor-location", { x, y, width: 1, height: 18 });'
SHOTS='const shots = () => { const d = Gio.File.new_for_path(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES) ?? GLib.get_home_dir()).get_child("Screenshots"); const out = []; try { const e = d.enumerate_children("standard::name", 0, null); let i; while ((i = e.next_file(null))) out.push(d.get_child(i.get_name()).get_uri()); } catch {} return out; };'
count() { P "$SHOTS"' return shots().length;'; }
saved() {   # saved <name> <count before>: one more file than before
  local n; n=$(count)
  [ "$n" -gt "$2" ] && echo "PASS $1 ($n files)" || echo "FAIL $1 still $n files"
}

mkdir -p "$HOME/Desktop"      # desktop icons watch it from here on
T running 'return Main.screenshotUI && inst("screenshots") ? "PASS" : "FAIL no screenshot UI or feature";'
gs screenshots-thumbnail false     # commit at once (no 5 s thumbnail)
gs notch-shelf-screenshots true

n=$(count); key KEY_Print; pause 1.5
T print-opens 'return Main.screenshotUI.visible ? "PASS" : "FAIL not open, actionMode " + Main.actionMode;'
key KEY_Return; pause 3
T print-closes 'return !Main.screenshotUI.visible && Main.modalCount === 0 ? "PASS" : "FAIL open " + Main.modalCount;'
saved print-saves "$n"

n=$(count); keydown KEY_Shift_L; key KEY_Print; keyup KEY_Shift_L; pause 3
saved shift-print-saves "$n"

# Pointer hidden for typing (features/pointer inhibits the cursor)
P "$PTR"' move(640, 400); return 1;' >/dev/null
P "$PTR $CARET"' caret(120, 100); await sleep(50); caret(130, 100); await sleep(50); caret(140, 100); await sleep(50); return 1;' >/dev/null
n=$(count); key KEY_Print; pause 1.5
T print-opens-pointer-hidden 'return Main.screenshotUI.visible ? "PASS" : "FAIL not open";'
key KEY_Return; pause 3
saved print-saves-pointer-hidden "$n"

# Kiwi's Shift+Super+4, then GNOME's Print still has its own panel
keydown KEY_Shift_L; keydown KEY_Super_L; key KEY_4; keyup KEY_Super_L; keyup KEY_Shift_L; pause 1.5
P "$PTR"' move(300, 300); await sleep(50); btn(Clutter.ButtonState.PRESSED); for (let i = 1; i <= 10; i++) { move(300 + i * 10, 300 + i * 10); await sleep(20); } btn(Clutter.ButtonState.RELEASED); return 1;' >/dev/null
pause 3
n=$(count); key KEY_Print; pause 1.5
T print-after-kiwi-area 'const u = Main.screenshotUI; return u.visible && u._panel.visible ? "PASS stock panel" : "FAIL visible=" + u.visible + " panel=" + u._panel?.visible;'
key KEY_Return; pause 3
saved print-saves-after-kiwi-area "$n"

# The shelf links the file where Kiwi saved it, not GNOME's first name
T shelf-follows "$SHOTS"' const files = new Set(shots()); const shelf = inst("notch")?._shelf?.uris ?? []; const first = shelf[0]; return first && files.has(first) ? "PASS " + decodeURIComponent(first.split("/").pop()) : "FAIL shelf " + first + " not in " + [...files].join(" ");'

# A desktop icon being renamed: Print still works, the field sits on the icon
P 'await inst("desktop-icons")?.newFolder(); await sleep(1500); return 1;' >/dev/null
T rename-field-placed 'const r = inst("desktop-icons")?._rename; if (!r) return "FAIL no rename field"; const e = r.editor._entry; return e.x > 100 && e.y > 20 ? "PASS at " + Math.round(e.x) + "," + Math.round(e.y) : "FAIL at " + e.x + "," + e.y;'
n=$(count); key KEY_Print; pause 1.5
T print-while-renaming 'return Main.screenshotUI.visible ? "PASS" : "FAIL not open, actionMode " + Main.actionMode;'
key KEY_Return; pause 3
saved print-saves-while-renaming "$n"
T rename-field-back 'return inst("desktop-icons")?._rename && global.stage.key_focus === inst("desktop-icons")._rename.editor._entry.clutter_text ? "PASS" : "FAIL focus " + global.stage.key_focus;'
key KEY_Escape; pause 1
T rename-closed 'return !inst("desktop-icons")?._rename && Main.modalCount === 0 ? "PASS" : "FAIL modal " + Main.modalCount;'
grep -q 'value "nan"' "$W/shell.log" && echo "FAIL nan-position (shell.log)" || echo "PASS no-nan-position"
