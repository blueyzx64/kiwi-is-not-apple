# Verification phase brief (orchestrator-owned)

You are a verifier (V1–V6). You are read-only on Kiwi code: never edit the repo except your own memory file `.swarm/agents/<ID>.md`. Hard rule: never call any `mcp__claude-code-remote__*` tool.

Test the merged branch ccr-f3c1f44c-rv5a8r in /home/user/kiwi-is-not-apple (KIWI_SRC=/home/user/kiwi-is-not-apple). Don't check out or change branches there; read it as is.

## What to check, per feature in your group
1. **Works as specified:** the behaviour in the plan (docs/architecture/overhaul-plan.md §5, §12 defaults) and the macOS research it links (docs/research/macos/porting-matrix.md). Drive the feature with **real virtual-pointer clicks and keys**, not direct calls (the startup cover pane bug hid broken clicks for hours). Turn the feature off and confirm GNOME's own behaviour comes back.
2. **Displays as expected:** take screenshots (`shot NAME`) at key states, then look at them yourself with the Read tool. Compare against macOS: alignment, clipping, spacing, light and dark mode, glass legibility, no stray rectangles or shadows. List the 3–6 most telling screenshot paths in your report; the orchestrator reviews them.
3. **No jitter, lag or hiccups:** for every animation in your group use /home/user/kiwi-swarm-tools/perf-lib.sh. Warm up first, then use `perf_start`/`perf_stop` and `track_actor`/`track_stop` on the moving actor. Compare against the stock overview baseline (software rendering: mean 26.6 ms, p95 42 ms). Flag:
   - any JITTER jumps, reversals or flickers;
   - stalls50 above 0 that Kiwi causes;
   - p95 clearly worse than the baseline;
   - any first-use hitch other than the shader warm-up.
   Also try interaction under load, for example dragging while something animates.
4. **Robustness:** rapid repeated input, Esc mid-animation, toggling the feature off mid-animation, and 2 windows vs 6 windows.

## Harness
- Read /home/user/kiwi-swarm-tools/README.md (H9 and H13 libraries, bundle.sh) and .swarm/shared/ux-round.md.
- Earlier agents' scenario scripts are under /tmp/claude-0/-home-user-kiwi-is-not-apple/1c9cfc23-1f6c-5ceb-aec3-03f023179fb0/scratchpad/ (t-*/, l*/, sm3/, p6/ and others); reuse them.
- Gotchas:
  - gdbus expands `\n` and `\s` in the JS you pass, so use String.fromCharCode(10).
  - The first frame of an animation costs about 290 ms of shader setup.
  - Software rendering makes absolute timings pessimistic, so compare relative to the baseline.
  - The test roots have one 1280x800 monitor.
- Token budget: at most 3 Shell runs. Batch your scenarios.

## Report (≤30 lines) and memory
Write findings to your memory file with severity:
- **S1:** broken or a freeze.
- **S2:** wrong behaviour, a visible glitch, or jank.
- **S3:** polish.

Each finding needs file:line if known, steps, evidence (run dir, screenshot, PERF/JITTER line) and a suggested fix. Your report lists S1/S2 in full and S3 one line each, plus the screenshot paths.
