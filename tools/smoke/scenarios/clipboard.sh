# Clipboard history (features/clipboard): Super+V, keyboard navigation, scrollbar gutter.
# KIWI_SMOKE_EXTRA=tools/smoke/scenarios/clipboard.sh tools/smoke/run-headless.sh 2
TRAY='const tray = new Gio.Settings({ schema_id: "org.gnome.shell.keybindings" }).get_strv("toggle-message-tray");'
CLIP='const c = inst("clipboard-history");'
QP='const ui = c?._quick?._ui;'
gs clipboard-history-size 60
pause 2

T running "$CLIP return c ? 'PASS' : 'FAIL clipboard-history not running';"
T tray-loses-super-v "$TRAY return JSON.stringify(tray) === '[\"<Super>m\"]' ? 'PASS ' + tray : 'FAIL ' + JSON.stringify(tray);"

# 40 copies: 30 plain text, 10 links (St.Clipboard writes are recorded like an app's)
P "const cb = St.Clipboard.get_default();
   for (let i = 0; i < 40; i++) {
     cb.set_text(St.ClipboardType.CLIPBOARD, i % 4 === 3 ? 'https://example.org/' + i : 'copied text number ' + i);
     await sleep(120);
   }
   return 1;" >/dev/null
pause 1
T recorded "$CLIP return c.count >= 30 ? 'PASS ' + c.count : 'FAIL count ' + c.count;"

# Super+V through the real keybinding
keydown KEY_Super_L; key KEY_v; keyup KEY_Super_L
pause 1
T super-v-opens-quick-paste "$CLIP return c._quick.isOpen ? 'PASS' : 'FAIL not open';"

key KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down
pause 1
T selection-in-view "$CLIP $QP
  const row = ui.list.get_children().find(r => r.has_style_pseudo_class?.('selected'));
  const adj = ui.scroll.vadjustment;
  if (!row) return 'FAIL no selected row';
  const top = row.y, bottom = row.y + row.height;
  return top >= adj.value - 0.5 && bottom <= adj.value + adj.page_size + 0.5 && adj.value > 0
    ? 'PASS row ' + top + '-' + bottom + ' view ' + adj.value + '+' + adj.page_size
    : 'FAIL row ' + top + '-' + bottom + ' view ' + adj.value + '+' + adj.page_size;"

T scrollbar-gutter "$CLIP $QP
  const bar = ui.scroll.get_children().find(x => x instanceof St.ScrollBar && x.orientation === Clutter.Orientation.VERTICAL); const row = ui.list.get_children().find(r => r.entryId !== undefined);
  const [bx] = bar.get_transformed_position(); const [rx] = row.get_transformed_position();
  return bar.visible && rx + row.width <= bx + 0.5 ? 'PASS row ends ' + (rx + row.width) + ', bar at ' + bx + ' w ' + bar.width + ' opacity ' + bar.opacity
    : 'FAIL row ends ' + (rx + row.width) + ', bar at ' + bx + ' visible ' + bar.visible;"

T scrollbar-fades "await sleep(1500); $CLIP $QP const b = ui.scroll.get_children().find(x => x instanceof St.ScrollBar && x.orientation === Clutter.Orientation.VERTICAL); return b.opacity === 0 ? 'PASS' : 'FAIL opacity ' + b.opacity;"

key KEY_Right KEY_Right
pause 1
T right-right-is-links "$CLIP $QP
  const ids = c._quick._order.map(id => c.get(id));
  return c._quick._filter === 'links' && ids.length && ids.every(e => e.type === 'link') ? 'PASS ' + ids.length + ' links' : 'FAIL ' + c._quick._filter + ' ' + ids.length;"
key KEY_Left
pause 1
T left-is-text "$CLIP return c._quick._filter === 'text' ? 'PASS' : 'FAIL ' + c._quick._filter;"

key KEY_n KEY_u KEY_m KEY_b KEY_e KEY_r KEY_space KEY_1 KEY_7
pause 1
T typing-filters "$CLIP $QP return ui.entry.get_text() === 'number 17' && c._quick._order.length === 1 ? 'PASS' : 'FAIL ' + ui.entry.get_text() + ' ' + c._quick._order.length;"

key KEY_Escape
pause 1
T esc-closes "$CLIP return !c._quick.isOpen ? 'PASS' : 'FAIL still open';"

# Popover: same keys from its search field
P "$CLIP c._indicator.menu.open(); return 1;" >/dev/null
pause 1
key KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down KEY_Down
pause 1
T popover-selection-in-view "$CLIP
  const find = a => a.has_style_class_name?.('kiwi-clip-scroll') ? a : a.get_children().map(find).find(Boolean) ?? null;
  const scroll = find(c._indicator.menu.box); const adj = scroll.vadjustment;
  const row = scroll.get_child().get_children().find(r => r.has_style_pseudo_class?.('selected'));
  if (!row) return 'FAIL no selected row';
  return row.y >= adj.value - 0.5 && row.y + row.height <= adj.value + adj.page_size + 0.5 && adj.value > 0
    ? 'PASS view ' + adj.value : 'FAIL row ' + row.y + ' view ' + adj.value + '+' + adj.page_size;"
key KEY_Right
pause 1
T popover-right-is-text "$CLIP
  const pop = c._indicator.menu.box; const find = a => a.has_style_class_name?.('kiwi-clip-filter') && a.checked ? a : a.get_children().map(find).find(Boolean) ?? null;
  const b = find(pop); return b?.label === 'Text' ? 'PASS' : 'FAIL ' + b?.label;"
key KEY_Escape
pause 1
T popover-esc-closes "$CLIP return !c._indicator.menu.isOpen ? 'PASS' : 'FAIL still open';"

# Off: GNOME's own value comes back
gs clipboard-history false
pause 2
T tray-restored "$TRAY return JSON.stringify(tray) === '[\"<Super>v\",\"<Super>m\"]' ? 'PASS ' + tray : 'FAIL ' + JSON.stringify(tray);"
gs clipboard-history true
pause 2
T tray-taken-again "$TRAY return JSON.stringify(tray) === '[\"<Super>m\"]' ? 'PASS' : 'FAIL ' + JSON.stringify(tray);"
