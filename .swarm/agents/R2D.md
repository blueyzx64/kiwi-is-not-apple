# R2D: round 2 Stage Manager fixer (worktree /home/user/kiwi-r2-stage, branch v3/r2-stage)

## Status
working (nothing edited yet; analysis done)

## Plan
1. Strip: drop recentCount cap (model, schema, prefs, index); geometry stripLayout scales to minScale then scrolls;
   view: content actor translated by scroll offset, wheel/touchpad handler, per-card centre-distance fade (no shader/offscreen),
   thumbRect/slotRect/entryAt add offset, reveal on key focus, reset to top when first entry changes.
2. Quality cause: features/roundedCorners/effect.js is a Shell.GLSLEffect (OffscreenEffect) on every window actor; Clutter.Clone paints
   it, sampling the 1:1 offscreen texture with plain LINEAR (no mipmaps) -> aliased thumbnails. Mutter ignores
   set_content_scaling_filters for MetaShapedTexture (hard-codes LINEAR_MIPMAP_NEAREST below 0.5 scale).
   Fix: effect vfunc_pre_paint returns false when actor.is_in_clone_paint() so clones use mutter's mipmapped texture.
   Also whole-pixel layer rects.
3. Drop-to-strip only when pointer over a card and outside tile zone (St.Settings drag_threshold*6, mutter shake_threshold); hint near only inside band outside tile zone; resize ops never.
4. Tests: geometry tests, model tests; real Shell: 12 GTK apps, wheel scroll, drag, resize, super+Left; perf-lib; before/after crops.

## Progress log
- 2026-10-27: read docs and code, designed above.

## Findings for orchestrator
- Rounded-corners offscreen effect also degrades Overview clones (same cause).

## Handoff
Implement per Plan; then run harness (baseline vs after).
