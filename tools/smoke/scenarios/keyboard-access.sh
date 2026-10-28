# Scenario for tools/smoke/run-headless.sh (KIWI_SMOKE_EXTRA): features/keyboardAccess.
# Sticky Keys display, Accessibility Shortcuts panel, Keyboard Viewer, Zoom follows focus.
KA='const ka = inst("keyboard-access"); if (!ka) return "FAIL keyboard-access not running";'
A11Y=org.gnome.desktop.a11y.keyboard
MAG=org.gnome.desktop.a11y.magnifier

T running "$KA return \"PASS running\";"

# ---- Sticky Keys display ------------------------------------------------------------------
gsettings set $A11Y slowkeys-enable false
gsettings set $A11Y stickykeys-enable true; pause 1
key KEY_Shift_L; pause 0.5
T sticky-shift-latched "$KA const h = ka.state.hud; return h?.glyphs.some(g => g.glyph === \"⇧\" && g.state === \"latched\") ? \"PASS \" + JSON.stringify(h.glyphs) : \"FAIL \" + JSON.stringify(ka.state);"
T sticky-hud-on-screen "$KA const hud = ka._hud; return hud?.visible && hud.get_n_children() === 1 && hud.x > 640 && hud.y < 200 ? \"PASS top-right \" + hud.x + \",\" + hud.y : \"FAIL \" + hud?.x + \",\" + hud?.y;"
key KEY_a; pause 0.6
T sticky-cleared "$KA return ka.state.hud === null && ka.state.mods.latched === 0 ? \"PASS cleared\" : \"FAIL \" + JSON.stringify(ka.state);"
key KEY_Control_L; pause 0.2; key KEY_Control_L; pause 0.5
T sticky-ctrl-locked "$KA const g = ka.state.hud?.glyphs; return g?.some(x => x.glyph === \"⌃\" && x.state === \"locked\") ? \"PASS \" + JSON.stringify(g) : \"FAIL \" + JSON.stringify(ka.state);"
gs kbd-a11y-sticky-corner "'bottom-left'"; pause 0.5
T sticky-corner "$KA const hud = ka._hud; return hud.x < 100 && hud.y > 600 ? \"PASS bottom-left \" + hud.x + \",\" + hud.y : \"FAIL \" + hud.x + \",\" + hud.y;"
key KEY_Control_L; pause 0.5
gsettings set $A11Y stickykeys-enable false; pause 0.8
T sticky-off-hides "$KA return ka.state.hud === null ? \"PASS hidden\" : \"FAIL \" + JSON.stringify(ka.state.hud);"

# ---- Accessibility Shortcuts panel --------------------------------------------------------
keydown KEY_Super_L; keydown KEY_Alt_L; key KEY_F5; keyup KEY_Alt_L; keyup KEY_Super_L; pause 0.8
T panel-opens-by-shortcut "$KA return ka.state.panel ? \"PASS open\" : \"FAIL closed\";"
T panel-lists-switches "$KA const n = ka._panelList?.get_n_children() ?? 0; return n >= 8 ? \"PASS \" + n + \" switches\" : \"FAIL \" + n;"
P "$KA return ka.clickPanelSwitch(\"bounce-keys\");" >/dev/null; pause 0.4
T panel-toggle-writes "return \"$(gsettings get $A11Y bouncekeys-enable)\" === \"true\" ? \"PASS bouncekeys on\" : \"FAIL bouncekeys not set\";"
T panel-check-follows "$KA const b = ka._panelList.get_children().find(x => x._kiwiSwitch === \"bounce-keys\"); return b.checked ? \"PASS checked\" : \"FAIL unchecked\";"
P "$KA ka.clickPanelSwitch(\"bounce-keys\"); return 1;" >/dev/null; pause 0.3
T panel-toggle-back "return \"$(gsettings get $A11Y bouncekeys-enable)\" === \"false\" ? \"PASS bouncekeys off\" : \"FAIL still on\";"
key KEY_Escape; pause 0.8
T panel-closes "$KA return !ka.state.panel ? \"PASS closed\" : \"FAIL open\";"

# Slow Keys chip (opt-in)
gs kbd-a11y-slowkeys-indicator true
gsettings set $A11Y slowkeys-enable true; pause 0.6
T slowkeys-chip "$KA return ka.state.hud?.slowKeys ? \"PASS chip\" : \"FAIL \" + JSON.stringify(ka.state.hud);"
gsettings set $A11Y slowkeys-enable false; pause 0.6
T slowkeys-chip-off "$KA return ka.state.hud === null ? \"PASS hidden\" : \"FAIL \" + JSON.stringify(ka.state.hud);"

# ---- Keyboard Viewer ----------------------------------------------------------------------
P "$KA ka.toggleViewer(); return 1;" >/dev/null; pause 1.5
T viewer-open "$KA const v = ka.state.viewer; return v.open && v.loaded && v.keys >= 55 ? \"PASS \" + v.xkbId + \" \" + v.keys + \" keys\" : \"FAIL \" + JSON.stringify(v);"
T viewer-base-labels "$KA const v = ka.state.viewer; return v.AC01 === \"a\" && v.AE01 === \"1\" ? \"PASS a 1\" : \"FAIL \" + JSON.stringify(v);"
keydown KEY_Shift_L; pause 0.5
T viewer-shift-labels "$KA const v = ka.state.viewer; return v.AC01 === \"A\" && v.AE01 === \"!\" ? \"PASS A !\" : \"FAIL \" + JSON.stringify(v);"
keyup KEY_Shift_L; pause 0.5
T viewer-labels-back "$KA const v = ka.state.viewer; return v.AC01 === \"a\" ? \"PASS a\" : \"FAIL \" + JSON.stringify(v);"
# Clicking keys types them: into a test entry that holds the stage key focus
P 'globalThis.__kaEntry = new St.Entry({ accessible_name: "test" }); Main.layoutManager.uiGroup.add_child(__kaEntry); __kaEntry.set_position(10, 300); __kaEntry.width = 200; global.stage.set_key_focus(__kaEntry.clutter_text); return 1;' >/dev/null; pause 0.3
P "$KA const b = ka._viewer._view.buttons; b.get(\"LFSH\").button.emit(\"clicked\", 0); b.get(\"AC01\").button.emit(\"clicked\", 0); b.get(\"AC02\").button.emit(\"clicked\", 0); return 1;" >/dev/null; pause 0.6
T viewer-types "$KA const t = __kaEntry.get_text(); return t === \"As\" ? \"PASS typed As\" : \"FAIL got \" + JSON.stringify(t);"
P '__kaEntry.destroy(); delete globalThis.__kaEntry; return 1;' >/dev/null
T viewer-input-menu-item "const m = Main.panel.statusArea.keyboard?.menu; const items = m?._getMenuItems?.() ?? []; return items.some(i => i.label?.text === \"Show Keyboard Viewer\") ? \"PASS in the input-source menu\" : \"FAIL \" + items.map(i => i.label?.text).join(\"|\");"
P "$KA ka.toggleViewer(); return 1;" >/dev/null; pause 0.5
T viewer-closed "$KA return !ka.state.viewer.open ? \"PASS closed\" : \"FAIL open\";"

# ---- Zoom follows keyboard focus ----------------------------------------------------------
gsettings set $MAG focus-tracking proportional
gsettings set $MAG caret-tracking centered
gs kbd-a11y-zoom-follow "'typing'"; pause 0.5
T zoom-typing "return \"$(gsettings get $MAG focus-tracking) $(gsettings get $MAG caret-tracking)\" === \"'none' 'push'\" ? \"PASS none push\" : \"FAIL $(gsettings get $MAG focus-tracking) $(gsettings get $MAG caret-tracking)\";"
gs kbd-a11y-zoom-follow "'always'"; pause 0.5
T zoom-always "return \"$(gsettings get $MAG focus-tracking) $(gsettings get $MAG caret-tracking)\" === \"'push' 'push'\" ? \"PASS push push\" : \"FAIL $(gsettings get $MAG focus-tracking)\";"
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Extensions.DisableExtension kiwi@kemma >/dev/null; pause 1.5
T zoom-restored-on-disable "return \"$(gsettings get $MAG focus-tracking) $(gsettings get $MAG caret-tracking)\" === \"'proportional' 'centered'\" ? \"PASS restored\" : \"FAIL $(gsettings get $MAG focus-tracking) $(gsettings get $MAG caret-tracking)\";"
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Extensions.EnableExtension kiwi@kemma >/dev/null; pause 2
T zoom-retaken-on-enable "return \"$(gsettings get $MAG focus-tracking)\" === \"'push'\" ? \"PASS push again\" : \"FAIL $(gsettings get $MAG focus-tracking)\";"
gs kbd-a11y-zoom-follow "'system'"; pause 0.5
T zoom-system-gives-back "return \"$(gsettings get $MAG focus-tracking) $(gsettings get $MAG caret-tracking)\" === \"'proportional' 'centered'\" ? \"PASS given back\" : \"FAIL $(gsettings get $MAG focus-tracking) $(gsettings get $MAG caret-tracking)\";"
