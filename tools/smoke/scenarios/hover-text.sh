# Hover Text, Hover Typing, Hover Color and the keyboard focus ring (features/hoverText).
# Run: KIWI_SMOKE_EXTRA=tools/smoke/scenarios/hover-text.sh tools/smoke/run-headless.sh 3
#
# The smoke session has no accessibility bus (no D-Bus activation), so app text comes from the
# instance's test seam (testTextAt) and the typing/focus paths are driven through showTyping()
# and showFocusRing(), the functions the AT-SPI events call. The AT-SPI reads themselves are
# covered only by tests/hoverTextModel.test.js (mapping, text windows) and manual use.

H='const h = inst("hover-text");'
FAKE='h.testTextAt = () => ({ text: "Hello from Kiwi Hover Text", offset: -1, rect: { x: 100, y: 120, width: 220, height: 30 } });'

T off-by-default 'return inst("hover-text") === null ? "PASS not running" : "FAIL running with every part off";'

gs hover-text true; gs hover-color true; gs hover-typing true; gs hover-focus-highlight true
pause 1
T enabled 'return inst("hover-text") ? "PASS running" : "FAIL not running";'
T a11y-bus "$H"' const ok = await h._source.available(); return "PASS a11y bus " + (ok ? "present" : "absent (expected headless)");'

# Hover Text with Super held, through the test seam; a known pixel for Hover Color
P "$H $FAKE"' const w = new St.Widget({ style: "background-color: #ff0000;", reactive: false }); w.set_position(600, 400); w.set_size(60, 60); Main.layoutManager.uiGroup.add_child(w); globalThis.__kiwiRed = w; global.stage.context.get_backend().get_default_seat().warp_pointer(630, 430); globalThis.__kiwiTaps = 0; globalThis.__kiwiTapId = global.display.connect("overlay-key", () => globalThis.__kiwiTaps++); return 1;' >/dev/null
pause 0.3
keydown KEY_Super_L
pause 0.6
T hover-text-shown "$H"' const s = h.state; return s.held && s.text === "Hello from Kiwi Hover Text" && s.element ? "PASS " + s.text : "FAIL " + JSON.stringify(s);'
T hover-color-shown "$H"' const s = h.state; return s.color === "#FF0000" ? "PASS " + s.color : "FAIL color " + s.color;'
T super-tap-blocked "$H"' return h.state.tapBlocked ? "PASS overlay-key held back after a hover" : "FAIL not blocked";'
keyup KEY_Super_L
pause 0.6
T hover-hidden-on-release "$H"' const s = h.state; return !s.held && s.text === null && !s.element ? "PASS hidden" : "FAIL " + JSON.stringify(s);'
T release-not-a-tap 'return globalThis.__kiwiTaps === 0 ? "PASS no overlay-key" : "FAIL overlay-key fired " + globalThis.__kiwiTaps;'
T taps-unblocked "$H"' return h.state.tapBlocked ? "FAIL still blocked" : "PASS unblocked after the release";'
key KEY_Super_L
pause 0.4
T plain-tap-still-works 'return globalThis.__kiwiTaps === 1 ? "PASS overlay-key once" : "FAIL taps " + globalThis.__kiwiTaps;'
key KEY_Escape
pause 0.4

# Activation lock: three quick presses lock (Control as the modifier), three more unlock
gs hover-modifier ctrl
pause 0.4
P "$H $FAKE return 1;" >/dev/null
keydown KEY_Control_L; keyup KEY_Control_L; keydown KEY_Control_L; keyup KEY_Control_L; keydown KEY_Control_L; keyup KEY_Control_L
pause 0.6
T lock-on "$H"' const s = h.state; return s.locked && s.active && !s.held && s.text === "Hello from Kiwi Hover Text" ? "PASS locked, panel shown" : "FAIL " + JSON.stringify(s);'
keydown KEY_Control_L; keyup KEY_Control_L; keydown KEY_Control_L; keyup KEY_Control_L; keydown KEY_Control_L; keyup KEY_Control_L
pause 0.6
T lock-off "$H"' const s = h.state; return !s.locked && !s.active && s.text === null ? "PASS unlocked, hidden" : "FAIL " + JSON.stringify(s);'
keydown KEY_Control_L; pause 0.3; keyup KEY_Control_L; pause 1; keydown KEY_Control_L; pause 0.3; keyup KEY_Control_L
pause 0.3
T slow-presses-no-lock "$H"' return h.state.locked ? "FAIL locked by slow presses" : "PASS";'

# Hover Color alone (Hover Text off): the swatch only
gs hover-text false
pause 0.3
keydown KEY_Control_L
pause 0.6
T color-only "$H"' const s = h.state; return s.color === "#FF0000" && s.text === null ? "PASS swatch only" : "FAIL " + JSON.stringify(s);'
keyup KEY_Control_L
pause 0.4
gs hover-text true

# Hover Typing: the caret line, the field outlined
T typing-shown "$H"' h.showTyping("first line" + String.fromCharCode(10) + "hello world", 22, { x: 200, y: 300, width: 400, height: 30 }); await sleep(400); const s = h.state; return s.typing === "hello world" && s.field ? "PASS " + s.typing : "FAIL " + JSON.stringify(s);'
gs hover-typing-position top-right
pause 0.3
T typing-top-right "$H"' h.showTyping("abc", 3, null); await sleep(300); const a = h._typingPanel.actor; const area = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex); return a.x + a.width >= area.x + area.width - 20 && a.y <= area.y + 20 ? "PASS at " + a.x + "," + a.y : "FAIL at " + a.x + "," + a.y;'
gs hover-typing false
pause 0.4
T typing-off-hides "$H"' return h.state.typing === null && !h.state.field ? "PASS" : "FAIL " + JSON.stringify(h.state);'
gs hover-typing true

# Focus ring, then auto-hide
T focus-ring "$H"' h.showFocusRing({ x: 50, y: 60, width: 100, height: 20 }); const r = h.state.ring; return r && r.x === 46 && r.width === 108 ? "PASS " + JSON.stringify(r) : "FAIL " + JSON.stringify(r);'
gs hover-focus-width 6
gs hover-focus-autohide 1
pause 0.3
T focus-ring-wider "$H"' h.showFocusRing({ x: 50, y: 60, width: 100, height: 20 }); const r = h.state.ring; return r && r.x === 43 ? "PASS " + JSON.stringify(r) : "FAIL " + JSON.stringify(r);'
pause 1.5
T focus-autohide "$H"' return h.state.ring === null ? "PASS hidden after 1 s" : "FAIL " + JSON.stringify(h.state.ring);'
gs hover-focus-autohide 0

# Off: every part off stops the feature and removes its actors
P 'globalThis.__kiwiRed?.destroy(); global.display.disconnect(globalThis.__kiwiTapId); return 1;' >/dev/null
gs hover-text false; gs hover-color false; gs hover-typing false; gs hover-focus-highlight false
pause 1
T disabled 'return inst("hover-text") === null ? "PASS stopped" : "FAIL still running";'
T actors-gone 'const left = Main.layoutManager.uiGroup.get_children().filter(a => (a.style_class ?? "").includes("kiwi-hover")); return left.length === 0 ? "PASS none left" : "FAIL " + left.length + " left";'
P 'globalThis.__kiwiTaps = 0; globalThis.__kiwiTapId = global.display.connect("overlay-key", () => globalThis.__kiwiTaps++); return 1;' >/dev/null
key KEY_Super_L
pause 0.4
T overlay-key-unblocked 'global.display.disconnect(globalThis.__kiwiTapId); return globalThis.__kiwiTaps === 1 ? "PASS Super tap reaches overlay-key" : "FAIL taps " + globalThis.__kiwiTaps;'
key KEY_Escape
pause 0.4

# Back on for the enable/disable cycles that follow
gs hover-modifier super
gs hover-text true; gs hover-typing true; gs hover-focus-highlight true; gs hover-color true
pause 1
T on-for-cycles 'return inst("hover-text") ? "PASS" : "FAIL";'
