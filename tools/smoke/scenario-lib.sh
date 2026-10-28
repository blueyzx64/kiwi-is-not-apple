# Scenario helpers for tools/smoke/run-headless.sh KIWI_SMOKE_EXTRA (prepended to the scenario).
# Runs inside the throwaway session; the probe@x2 extension evaluates JS in the Shell.
#   P '<js>'           async JS in the Shell (Main, St, Clutter, Meta, Gio, GLib, Shell, global);
#                      `return x` prints JSON of x. inst('<feature-id>') is a running Kiwi feature.
#   T <name> '<js>'    assertion: the JS returns a string starting with PASS or FAIL
#   key <keysym>...    press and release keys through a virtual keyboard (Clutter keysym names:
#                      KEY_Caps_Lock, KEY_a, KEY_Shift_L ...); key down/up with keydown/keyup
#   gs <key> <value>   set a Kiwi setting;  pause <s>  sleep
PREFIX='const ext = Main.extensionManager.lookup("kiwi@kemma"); const inst = id => ext?.stateObj?._features?.instance?.(id) ?? null; const sleep = ms => new Promise(r => GLib.timeout_add(0, ms, () => { r(); return false; }));'
P() {
  gdbus call --session --dest org.x2.Probe --object-path /org/x2/Probe --method org.x2.Probe.Eval \
    "$PREFIX $1" 2>&1 | sed -e "s/^('//" -e "s/',)$//"
}
T() {
  local r; r=$(P "$2"); r=${r%\"}
  case "$r" in
    *PASS*) echo "PASS $1 ${r#*PASS}" ;;
    *) echo "FAIL $1 $r" ;;
  esac
}
_kbd='globalThis.__kiwiKbd ??= global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE); const kb = globalThis.__kiwiKbd; const t = () => GLib.get_monotonic_time();'
key() { for k in "$@"; do P "$_kbd kb.notify_keyval(t(), Clutter.$k, Clutter.KeyState.PRESSED); kb.notify_keyval(t(), Clutter.$k, Clutter.KeyState.RELEASED); return 1;" >/dev/null; sleep 0.15; done; }
keydown() { P "$_kbd kb.notify_keyval(t(), Clutter.$1, Clutter.KeyState.PRESSED); return 1;" >/dev/null; }
keyup() { P "$_kbd kb.notify_keyval(t(), Clutter.$1, Clutter.KeyState.RELEASED); return 1;" >/dev/null; }
gs() { gsettings --schemadir "$HOME/.local/share/gnome-shell/extensions/kiwi@kemma/schemas" set org.gnome.shell.extensions.kiwi "$1" "$2"; }
pause() { sleep "$1"; }
