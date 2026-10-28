# Volume / brightness pill (features/osd): Golden Gate (27.2) and Tahoe looks.
# KIWI_SMOKE_EXTRA=tools/smoke/scenarios/osd.sh tools/smoke/run-headless.sh 3
gs osd-location "'menu-bar'"
gs osd-style "'golden-gate'"
gs menubar-pinned "@as []"
pause 2

# show(icon, level): what the volume and brightness keys send (gsd-media-keys)
SHOW='const show = (icon, level) => Main.osdWindowManager.showOne(Main.layoutManager.primaryIndex, new Gio.ThemedIcon({ name: icon }), null, level, 1);'
STATE='const s = inst("osd")?.state;'

T osd-running 'return inst("osd") ? "PASS" : "FAIL osd not running";'

for lv in 0.5:8 1:16 0:0; do
  level=${lv%%:*}; want=${lv##*:}
  T "gg-volume-$level" "$SHOW show('audio-volume-medium-symbolic', $level); await sleep(400); $STATE
    if (!s?.visible) return 'FAIL not shown ' + JSON.stringify(s);
    if (s.style !== 'golden-gate') return 'FAIL style ' + s.style;
    if (s.segments !== 16 || s.lit !== $want) return 'FAIL lit ' + s.lit + '/' + s.segments;
    if (s.icons !== 1) return 'FAIL icons ' + s.icons;
    return 'PASS lit ' + s.lit + ' anchor ' + s.anchor;"
done

T gg-muted "$SHOW show('audio-volume-muted-symbolic', 0.6); await sleep(400); $STATE
  return s?.lit === 0 && /Muted/.test(s.accessibleName) ? 'PASS ' + s.accessibleName : 'FAIL ' + JSON.stringify(s);"

T gg-anchor-cc "$SHOW show('display-brightness-symbolic', 0.5); await sleep(400); $STATE
  const qs = Main.panel.statusArea.quickSettings; const [qx] = qs.get_transformed_position();
  const mid = s.x + s.width / 2, ccMid = qx + qs.width / 2;
  if (s.anchor !== 'controlCenter' && s.anchor !== 'stockBrightness') return 'FAIL anchor ' + s.anchor;
  const mon = Main.layoutManager.primaryMonitor;
  const clamped = s.x + s.width >= mon.x + mon.width - 8 - 1;
  return (Math.abs(mid - ccMid) <= 1 || clamped) && s.lit === 8 ? 'PASS ' + s.anchor + ' x ' + s.x : 'FAIL mid ' + mid + ' cc ' + ccMid + ' ' + JSON.stringify(s);"

# A pinned Sound item in the menu bar: the volume pill hangs from it. Without an audio output
# (headless) the real pin stays out of the bar, so a stand-in with its style class is used.
gs menubar-pinned "['sound=always']"
pause 2
T gg-anchor-pinned "$SHOW
  const find = a => a.has_style_class_name?.('kiwi-menubar-pin-sound') ? a : a.get_children().map(find).find(Boolean) ?? null;
  let pin = find(Main.panel), standIn = null;
  if (!pin?.mapped) {
    standIn = new St.Widget({ style_class: 'kiwi-menubar-pin-sound', width: 30, height: 20 });
    Main.panel._centerBox.add_child(standIn); pin = standIn; await sleep(100);
  }
  show('audio-volume-high-symbolic', 0.75); await sleep(400); $STATE
  const [px] = pin.get_transformed_position(); const mid = s.x + s.width / 2, pmid = px + pin.width / 2;
  standIn?.destroy();
  const mon = Main.layoutManager.primaryMonitor;
  const clamped = s.x <= mon.x + 8 + 1 || s.x + s.width >= mon.x + mon.width - 8 - 1;
  const what = standIn ? 'stand-in' : 'real pin';
  return s.anchor === 'pinnedSound' && (Math.abs(mid - pmid) <= 1 || clamped) ? 'PASS ' + what + ' at ' + px + ', pill centred at ' + mid : 'FAIL ' + what + ' ' + s.anchor + ' mid ' + mid + ' pin ' + pmid;"
gs menubar-pinned "@as []"

# Tahoe look still works
gs osd-style "'tahoe'"
pause 1
T tahoe-volume "$SHOW show('audio-volume-medium-symbolic', 0.5); await sleep(400); $STATE
  if (s?.style !== 'tahoe' || !s.visible) return 'FAIL ' + JSON.stringify(s);
  return s.segments === 0 && s.icons === 1 && s.fill > 0 ? 'PASS fill ' + s.fill : 'FAIL ' + JSON.stringify(s);"
T tahoe-hides "await sleep(2600); $STATE return s && !s.visible ? 'PASS hidden' : 'FAIL ' + JSON.stringify(s);"
gs osd-style "'golden-gate'"
