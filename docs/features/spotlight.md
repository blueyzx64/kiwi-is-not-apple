# Spotlight

## 1. Summary
A centred glass search bar. Results are grouped by type (Top Hit, Applications,
Settings, Documents, Clipboard, Calculator, Web) and work fully from the keyboard.

## 2. Locked decisions
- It is a must-have.
- Shortcut **Super+Space**. Offer to move GNOME's input-source switching to
  Super+Alt+Space; never take it over silently.
- It shares its window component with Quick Paste (feature 3).

## 3. UI
- 680px wide, 140px from the top, radius 22, 58px input with a 22px font.
- Empty query: **Suggestions** (recent apps) + **Recent clipboard**.
- With a query: the first group is labelled "Top hit · …" and its first row is selected
  and drawn larger.
- Calculator: plain arithmetic plus `N km in miles`-style unit conversions. Currency
  conversion is out of v1.
- Keys: ↑/↓ move, Enter opens, Ctrl+Enter shows the file in Files, Ctrl+C copies the
  result, Tab jumps to the next group, Esc closes.

## 4. Settings (proposed)
`spotlight` b · `spotlight-shortcut` as=`['<Super>space']` · `spotlight-files` b ·
`spotlight-calculator` b · `spotlight-clipboard` b · `spotlight-web` b · `spotlight-engine` s

## 5. Interactions
- Uses GNOME's own search providers (`org.gnome.Shell.SearchProvider2`) for files, so it
  never re-indexes. Uses `Shell.AppSystem` for apps.
- Choosing "Liquid Glass" or "Stage Manager" in Settings results toggles that feature
  directly.
- Opening an app while Stage Manager is on brings it to the stage.

## 6. Acceptance
- [ ] The first results appear within 50 ms for apps; provider results stream in after.
- [ ] Closes cleanly with no modal left behind if the shell's lock screen comes up.
