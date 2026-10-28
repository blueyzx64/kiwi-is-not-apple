## Status
working: v3/r3-controls (proof run in progress)

## Plan
Remove top-bar window controls; keep app-titlebar buttons (features/appButtons, renamed from windowControls); Split View via shortcuts; deprecate keys; docs/tests/probe.

## Progress log
- 2026-10-28: code, schema, prefs, docs, tests done; make check + pack-check green. Probe window-controls-left rewritten (backup /tmp/x2/inner-real.sh.bak-r3).

## Findings for orchestrator
- Folder renamed features/windowControls -> features/appButtons (feature folders need index.js). Registry: only `app-buttons` (always on) + `gtk-theme`.
- Split View: a full-screen window cannot be dragged, so the drag picker does not get Split View entries; added split-view-left/right-shortcut (Ctrl+Super+Alt+Left/Right). Swap/Exit menu entries are gone (pair ends by F11/maximize/close).
- Picker (features/windows/picker.js) was only touched in one header comment. For the Snap Layouts redesign it depends on: core/tileActions.js PICKER_SECTIONS (rows of [action, name]), lib/tileGlyphs.js buildGlyph + CSS in styles/base.css (.kiwi-tile-glyph*), drag.js (open(monitor, barBottom), cells(), rect, hover(action), close()), model.js pickerHit/hitZone/PICKER_ZONE, Glass.attach(surface 'menus'). Nothing else depended on the green menu.
- Removed: core/events 'green-button-hover', 'split-view-requested'; core/tileActions zoneTouchesTop; core/desktopModel isHelperWindowInfo (dead).
- Migrations: dropped show-window-controls-fullscreen-only -> scope; added enable-app-window-buttons -> app-buttons-style.
- Control Center "Window Buttons" tile removed (its key is deprecated).

## Handoff
Commit once proof run is clean.
