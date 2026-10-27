# FX2: menu bar fixes (R3 S2 #4-6, S3s) in /home/user/kiwi-fix-menubar (v3/fix-menubar)

## Status
working: code and unit tests done (make check passes); real-Shell proofs running; not committed yet

## Plan
Fix R3 #4,#5,#6,#7-#12,#16,#17 in features/menuBar + lib/wallpaper*; skip core/appMenus (L12). Then run /tmp/r3/extra*.sh copies (scratchpad, F10 -> Ctrl+F2), run-small.sh, and run-f44.sh 20.

## Progress log
- model.js: chooseText worst-case contrast (+solid), fitMenus, confirmationHolds, fillPlaceholders, formatBytes memory round-up
- adaptiveBar: decode in a gjs helper process (wallpaperProbe.js), XML current slide (lib/wallpaperModel xmlSlideAt) with a timer to the next slide
- appMenuBar: OverflowLayout uses fitMenus (RTL aware), overflowed buttons made non-focusable, "»" menu
- forceQuit: confirmation bound to the named app; fullscreenReveal: tracked menu watch, reveal() guard, concealWhenIdle; index.focus reveals first
- schema default of menubar-focus-shortcut: Ctrl+F2

## Findings for orchestrator
- #14 (relaunch stays armed) not fixed: no clean signal that kill failed without a magic timeout.
- core/appMenus/model.js:183 still uses replace('%s', v) (L12's area).
- lib/wallpaperTint.js still decodes in-process (32x32 target, same stall on huge files); it now uses the current XML slide but its per-URI cache is not refreshed at slide changes.
