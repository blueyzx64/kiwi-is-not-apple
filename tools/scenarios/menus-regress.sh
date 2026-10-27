# Scenario for the real-Shell harness (KIWI_EXTRA, bundled after kiwi-swarm-tools/lib.sh; see
# .swarm/shared/ux-round.md). Regression probes for the panel menus:
#   S1  the green-button menu leaves no stuck modal grab (hover, Esc, wiggle, repeat)
#   S2  Ctrl+F2 over a full-screen window opens the app menu once the bar has slid in
#   S2  glass menus draw a rounded shadow only (screenshots: Help search resized, Control Center)
force_animations on
sleep 1
H='const kc=async(a)=>{const [x,y]=a.get_transformed_position();const [w,h]=a.get_transformed_size();await kclick(Math.round(x+w/2),Math.round(y+h/2));};
const qsb=()=>Main.panel.statusArea.quickSettings; const mb=()=>inst("menu-bar"); const apps=()=>mb()?.part("apps");
const greenBtn=()=>{let b=null; const f=a=>{ if(a.has_style_class_name?.("window-control-button")&&a.has_style_class_name("maximize")) b=a; a.get_children().forEach(f)}; f(Main.panel); return b;};
const gmenu=()=>inst("window-controls")._greenMenu._menu;
const ctr=a=>{const [x,y]=a.get_transformed_position();const [w,h]=a.get_transformed_size();return [Math.round(x+w/2),Math.round(y+h/2)];};'
J() { _kjs "$H $1"; }
cat > $W/menuapp.js <<'EOF2'
imports.gi.versions.Gtk='4.0';
const {Gtk,Gio}=imports.gi;
const app=new Gtk.Application({application_id:'org.x2.MenuApp'});
app.connect('startup',()=>{
  const bar=new Gio.Menu();
  ['File','Edit','View','Tools','Window','Help'].forEach((n,i)=>{const m=new Gio.Menu(); for(let k=0;k<4;k++){const id='a'+i+'_'+k; app.add_action(new Gio.SimpleAction({name:id})); m.append(n+' action '+k,'app.'+id);} bar.append_submenu(n,m);});
  app.set_menubar(bar);
});
app.connect('activate',()=>{const w=new Gtk.ApplicationWindow({application:app,title:'Menu App',default_width:600,default_height:400}); w.set_child(new Gtk.Label({label:'menus'})); w.present();});
app.run([]);
EOF2
launch_app "gjs $W/menuapp.js" org.x2.MenuApp 40
sleep 2
focus_app org.x2.MenuApp
sleep 2

echo "-- S1 green menu: hover, Esc, wiggle, three times"
for round in 1 2 3; do
  J 'const [cx,cy]=ctr(greenBtn()); await kmove(cx,cy); const t=Date.now(); while(!gmenu().isOpen && Date.now()-t<4000) await sl(100); const was=gmenu().isOpen; await kkey(["Escape"]); await sl(500); for(let i=0;i<8;i++){ await kmove(cx,cy); await sl(60); await kmove(cx-60,cy+80); await sl(60);} await sl(800); return was' >/dev/null
  assert "green menu: no modal grab left after Esc + wiggle (round $round)" "Main.modalCount===0"
done
shot s1-after-wiggle

echo "-- S2 glass menu shadow: Help search resized, Control Center"
J 'apps().openMenu("help"); await sl(800); return 1' >/dev/null
shot g1-help-open
J 'await kkey(["T","o","o"]); await sl(900); return 1' >/dev/null
shot g2-help-typed
J 'await kkey(["Escape"]); await sl(600); return 1' >/dev/null
J 'await kc(qsb()); await sl(1200); return 1' >/dev/null
shot g3-cc-open
J 'await kkey(["Escape"]); await sl(600); return 1' >/dev/null
assert "menus closed, no modal grab" "Main.modalCount===0"

echo "-- S2 Ctrl+F2 over a full-screen window"
J 'kwin("org.x2.MenuApp").make_fullscreen(); await sl(2500); return 1' >/dev/null
J 'await kkey(["Control_L","F2"]); await sl(2500); return 1' >/dev/null
assert "Ctrl+F2 over full screen opens an app menu" "inst('menu-bar').part('apps')._buttons.some(b=>b.menu.isOpen)"
shot g4-ctrlf2-fullscreen
J 'await kkey(["Escape"]); await sl(1500); kwin("org.x2.MenuApp").unmake_fullscreen(); await sl(1500); return 1' >/dev/null
assert "after Esc no modal grab" "Main.modalCount===0"
assert_summary
