# Contracts (frozen APIs; only the orchestrator edits)

_Empty until S1 freezes lib/ and features.js, and S3 freezes lib/glass.js._

## Prefs builder (frozen by orchestrator, owner S10)
- Each `apps/<feature>/prefs.js`: ESM, Adw/Gtk/Gio only, no Shell libs.
- `export const PAGE = {id, title: N_('…'), icon}` for a new page, or
  `{into: 'panel'|'dock'|'windowControls'|'advanced'}` to join an existing page.
- `export function buildPrefs({settings, window, extension}) -> Adw.PreferencesGroup[]`.
  Groups only; S10 places them in a fixed page order in `fillPreferencesWindow`.
- Cleanup via `window.connect('close-request', …)`.
- Shared rows (switch, enum combo, shortcut row) live in `prefs/rows.js` (S10 owns).
