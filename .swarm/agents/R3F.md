# R3F: Snap Layouts bar (branch v3/r3-snap)
Done: core/tileActions SNAP_LAYOUTS + 5 new zones; features/windows/snapModel.js (pure, tests/snapModel.test.js), snapBar.js (view, replaces picker.js), drag.js uses it; core/motion springs() + SPRINGS.quick; lib/tileGlyphs.js and old picker CSS removed.
Proof: runs 20261028-071017-kiwi-r3-snap-f44e (scenario), 20261028-072226-kiwi-r3-snap-f44c (light + reduced motion), final 20261028-072539-kiwi-r3-snap-f44 (0 Kiwi errors). Scenario scripts: /tmp/claude-0/r3f/snap.sh, snap2.sh.
