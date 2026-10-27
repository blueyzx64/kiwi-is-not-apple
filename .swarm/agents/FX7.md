## Status
done: v3/fx7-windows (see git log)

## Plan
S2 tile-drag Esc; S2 hide activate (diagnose); S2 colour filter wallpaper black; S3 SM flight first frame, strip x=0, split exit size, tile outline light, minimizeEffect handler ids, strip floor.

## Progress log
- Runs: /tmp/x2/runs/20261027-164936-kiwi-fx7-windows-f44b (T1-T5), -165709-...-f44c (filter matrix, hide diag, split), final in scratchpad/fx7/run3.out.
- Esc: grab-op-end with BUTTON1 still down = cancelled; model dropZone(). Verified: Esc leaves frame, release tiles.
- Hide: NOT a Kiwi bug. window.activate(time), Main.activateWindow, Alt+Tab unhide; app.activate() from a script (no event time) makes Mutter flag demands-attention only.
- Colour filter: black wallpaper = effect's cached picture only repainted in the damaged part. Fix: ProgramEffect.vfunc_modify_paint_volume returns false (whole-actor redraw) + one effect per uiGroup child. Verified: after window moves/overview, wallpaper, bar, dock all filtered (run ...-170926-...-f44e, c2-after-stress). Perf overview mean 17.3 off / 17.9 on (llvmpipe).
- SM: first flight now starts the tween after the clone's first paint; floor = full band at screen edge, no glass/shadow (macOS look).
- Split: pre-split size of both windows restored on exit (leaving window waits for first size-changed after unmake_fullscreen).
- minimizeEffect: blocks/unblocks only the oldest (stock) handler id.
