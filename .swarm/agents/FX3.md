# FX3 (fixer: R2 glass/dock findings)
## Status
working: v3/fix-glass, all fixes committed, final real-Shell run in progress (/tmp/fx3-run.txt)
## Progress log
- F1 lib/wallpaperProbe.js + lib/wallpaperDecode.js (one off-process path: tint, Launchpad, menu bar), 64 MP cap, XML slide refresh in tint
- F2 ListMembersOwner defer; dashToDock strips after DtD leaves ACTIVATING, from an idle
- F3 StWidget.kiwi-glass rim rules outrank theme shadow (covers green menu, all attachMenu)
- F4 store.keepStored across lock + skip restoreStale on the enable after a lock (extension.js)
- F5 stack pages of 60 rows, 500 ms coalesce, partial writes ignored; F6 tint floor; F7 F8 F10 F11 done
- Coordinator (a): dock already filters any WindowState flag (hidden) via _flagged; (b) covered by F3
## Findings for orchestrator
- harness ALL list in /tmp/x2/inner-real.sh lacks `dock` etc., so KIWI_ONLY=spotlight still runs the dock: the view.js shutdown error is the dock's.
