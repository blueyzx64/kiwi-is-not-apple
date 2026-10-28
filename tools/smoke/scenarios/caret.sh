# Caret badges, ⇪ in dialog password fields, Caps Lock switches the input source, input source
# per window, the input key. Run:
#   KIWI_SMOKE_EXTRA=tools/smoke/scenarios/caret.sh tools/smoke/run-headless.sh 3
# The headless Shell has no IBus, so a caret is reported by hand through the caret service.

CARET='const ii = inst("input-indicator"); const caret = r => ii._caret._onReport(r);'
CAPS='const km = global.stage.context.get_backend().get_default_seat().get_keymap();'
SRC='const ism = (await import("resource:///org/gnome/shell/ui/status/keyboard.js")).getInputSourceManager();'

# --- 1.1 the Caps Lock badge stays while Caps Lock is on and follows the caret ---
T caret-up "$CARET caret({x: 200, y: 200, width: 2, height: 18}); return ii._caret.rect ? 'PASS caret' : 'FAIL no caret';"
keydown KEY_Caps_Lock; pause 0.1; keyup KEY_Caps_Lock
pause 2.6
T caps-badge-stays "const b = inst('input-indicator').badge; return b?.style === 'caps-on' && b.anchor === 'caret' ? 'PASS after 2.6 s ' + b.x + ',' + b.y : 'FAIL ' + JSON.stringify(b);"
T caps-badge-follows "$CARET caret({x: 420, y: 300, width: 2, height: 18}); await sleep(50); const b = ii.badge; return b?.x === 420 && b.y === 300 + 18 + 3 ? 'PASS ' + b.x + ',' + b.y : 'FAIL ' + JSON.stringify(b);"
keydown KEY_Caps_Lock; pause 0.1; keyup KEY_Caps_Lock
pause 0.6
T caps-off-no-badge "return inst('input-indicator').badge === null ? 'PASS hidden, no caps-off badge' : 'FAIL ' + JSON.stringify(inst('input-indicator').badge);"
gs input-indicator-caps-off true
pause 0.3
keydown KEY_Caps_Lock; pause 0.1; keyup KEY_Caps_Lock
pause 0.3
keydown KEY_Caps_Lock; pause 0.1; keyup KEY_Caps_Lock
pause 0.2
T caps-off-opt-in "const b = inst('input-indicator').badge; return b?.style === 'caps-off' ? 'PASS muted badge' : 'FAIL ' + JSON.stringify(b);"
gs input-indicator-caps-off false
pause 2

# --- 1.4 ⇪ inside the password field of a Shell dialog ---
# The Shell's own mount password dialog, asked for the way GIO asks (ShellMountOperation)
P "const m = await import('resource:///org/gnome/shell/ui/shellMountOperation.js'); const op = new m.ShellMountOperation({get_drive: () => null}); op.mountOp.emit('ask-password', 'Unlock Test' + String.fromCharCode(10) + 'A test volume', '', '', Gio.AskPasswordFlags.NEED_PASSWORD); globalThis.__kd = op._dialog; return op._dialog ? 1 : 0;"
pause 1
T dialog-caps-off "const i = inst('dialogs').capsIconOf(globalThis.__kd); return i && !i.visible ? 'PASS icon hidden while Caps Lock is off' : 'FAIL ' + (i ? 'visible' : 'no icon');"
keydown KEY_Caps_Lock; pause 0.1; keyup KEY_Caps_Lock
pause 0.5
T dialog-caps-on "$CAPS const d = globalThis.__kd; const i = inst('dialogs').capsIconOf(d); const e = d._passwordEntry; const [ex, ey] = e.get_transformed_position(); const [ew, eh] = e.get_transformed_size(); const [ix, iy] = i.get_transformed_position(); const inside = ix > ex && ix < ex + ew && iy > ey && iy < ey + eh; const warn = []; const walk = a => { for (const c of a.get_children()) { if (c.has_style_class_name?.('caps-lock-warning-label')) warn.push(c); walk(c); } }; walk(d); return km.get_caps_lock_state() && i.visible && inside && warn.length && warn.every(w => !w.visible) ? 'PASS ⇪ at ' + Math.round(ix) + ',' + Math.round(iy) + ' in field ' + Math.round(ex) + '..' + Math.round(ex + ew) + ', warning line hidden' : 'FAIL vis=' + i.visible + ' inside=' + inside + ' warn=' + warn.map(w => w.visible);"
T dialog-no-caret-badge "const b = inst('input-indicator').badge; return b?.style !== 'caps-on' ? 'PASS the field has its own ⇪, no caret badge' : 'FAIL caret badge at ' + b.x + ',' + b.y;"
# KIWI_SHOT=/path.png saves the dialog with its ⇪ (a PNG of the whole stage)
[ -n "${KIWI_SHOT:-}" ] && P "const s = new Shell.Screenshot(); const out = Gio.File.new_for_path('$KIWI_SHOT').replace(null, false, 0, null); await new Promise(r => s.screenshot(false, out, () => r())); out.close(null); return 'shot';"
keydown KEY_Caps_Lock; pause 0.1; keyup KEY_Caps_Lock
pause 0.3
T dialog-caps-hides "const i = inst('dialogs').capsIconOf(globalThis.__kd); return !i.visible ? 'PASS' : 'FAIL still visible';"
P "globalThis.__kd.close(); return 1;" >/dev/null
pause 1
T dialog-undressed "return inst('dialogs').capsIconOf(globalThis.__kd) === null ? 'PASS undressed' : 'FAIL';"
P "globalThis.__kd.destroy(); delete globalThis.__kd; return 1;" >/dev/null

# --- 2.12 Caps Lock switches the input source (US and Russian) ---
gsettings set org.gnome.desktop.input-sources sources "[('xkb', 'us'), ('xkb', 'ru')]"
pause 1
gs input-caps-lock-switch true
pause 1
T switch-running "const s = inst('caps-lock-switch'); return s?.applies() ? 'PASS applies' : 'FAIL ' + (s ? 'does not apply' : 'not running');"
T switch-start "$SRC return ism.currentSource?.id === 'us' ? 'PASS us' : 'FAIL ' + ism.currentSource?.id;"
keydown KEY_Caps_Lock; pause 0.1; keyup KEY_Caps_Lock
pause 0.8
T caps-tap-switches "$SRC $CAPS const s = inst('caps-lock-switch'); return s.lastDecision === 'tap' && ism.currentSource?.id === 'ru' && !km.get_caps_lock_state() ? 'PASS tap: ru, Caps Lock off' : 'FAIL ' + s.lastDecision + ' ' + ism.currentSource?.id + ' caps=' + km.get_caps_lock_state();"
T caps-tap-no-badge "const b = inst('input-indicator').badge; return b?.style !== 'caps-on' ? 'PASS no ⇪ for a tap (' + (b?.style ?? 'none') + ')' : 'FAIL caps badge';"
keydown KEY_Caps_Lock; pause 0.1; keyup KEY_Caps_Lock
pause 0.8
T caps-tap-back "$SRC return ism.currentSource?.id === 'us' ? 'PASS back to us' : 'FAIL ' + ism.currentSource?.id;"
keydown KEY_Caps_Lock; pause 0.7; keyup KEY_Caps_Lock
pause 0.5
T caps-hold "$SRC $CAPS const s = inst('caps-lock-switch'); const b = inst('input-indicator').badge; return s.lastDecision === 'hold' && ism.currentSource?.id === 'us' && km.get_caps_lock_state() && b?.style === 'caps-on' ? 'PASS hold: Caps Lock on, ⇪ shown, source kept' : 'FAIL ' + s.lastDecision + ' ' + ism.currentSource?.id + ' caps=' + km.get_caps_lock_state() + ' badge=' + b?.style;"
keydown KEY_Caps_Lock; pause 0.1; keyup KEY_Caps_Lock
pause 0.8
T caps-off-after-hold "$SRC $CAPS return !km.get_caps_lock_state() && ism.currentSource?.id === 'us' ? 'PASS Caps Lock off, source kept' : 'FAIL ' + ism.currentSource?.id + ' caps=' + km.get_caps_lock_state();"
gs input-caps-lock-switch false
pause 0.5
T switch-off "return inst('caps-lock-switch') === null ? 'PASS stopped' : 'FAIL still running';"

# --- 2.13 input source per window ---
PW='const pw = new Gio.Settings({schema_id: "org.gnome.desktop.input-sources"});'
T per-window-system "$PW return inst('input-per-window') === null && pw.get_boolean('per-window') === false ? 'PASS untouched' : 'FAIL';"
gs input-per-window document
pause 0.5
T per-window-document "$PW return pw.get_boolean('per-window') ? 'PASS per-window on' : 'FAIL off';"
gs input-per-window global
pause 0.5
T per-window-global "$PW return !pw.get_boolean('per-window') && inst('input-per-window') ? 'PASS off, still owned' : 'FAIL';"
gsettings set org.gnome.desktop.input-sources per-window true
gs input-per-window document
pause 0.3
gs input-per-window system
pause 0.5
T per-window-restored "$PW return inst('input-per-window') === null && pw.get_boolean('per-window') ? 'PASS the user value (true) is back' : 'FAIL ' + pw.get_boolean('per-window');"
gsettings reset org.gnome.desktop.input-sources per-window

# --- 2.14 the input key ---
gs input-key-shortcut "['Menu']"
gs input-key-action input-source
pause 0.5
T key-running "return inst('input-key-action') ? 'PASS running' : 'FAIL not running';"
key KEY_Menu
pause 0.5
T key-switches "$SRC return ism.currentSource?.id === 'ru' ? 'PASS Menu: us -> ru' : 'FAIL ' + ism.currentSource?.id;"
gs input-key-action emoji
pause 0.3
key KEY_Menu
pause 0.8
T key-emoji "const e = inst('emoji-picker'); return e?.isOpen ? 'PASS emoji open' : 'FAIL ' + (e ? 'closed' : 'no picker');"
P "inst('emoji-picker')?.toggle(); return 1;" >/dev/null
pause 0.5
gs input-key-action none
pause 1
T key-off "return inst('input-key-action') === null ? 'PASS stopped' : 'FAIL still running, action=' + ext.stateObj?._settings?.get_string?.('input-key-action');"
gsettings reset org.gnome.desktop.input-sources sources
