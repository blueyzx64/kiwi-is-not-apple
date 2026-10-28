# Liquid Glass

## What it does
One translucent look for Kiwi's surfaces: a tint with a soft sheen, a thin rim and a shadow. Plain transparency, **no blur**, so it costs little. Registry id `liquid-glass` (key `liquid-glass`, on). Code: `lib/glass.js` (the service), `features/liquidGlass/`, CSS in `styles/base.css`.

## Use
- **Surfaces (`liquid-glass-surfaces`, default `panel`, `menus`, `dock`, `overlays`):** menu bar; menus, Control Center and calendar; dock; Spotlight, clipboard and the Stage Manager floor.
- **Clear to Tinted (`glass-tint`, 0):** Clear is more see-through, Tinted more opaque and easier to read.
- **`glass-wallpaper-tint` (on):** a little of the wallpaper's average colour shows through. **`glass-noise` (off):** a faint grain instead of the top-to-bottom sheen.
- **Accessibility:** `glass-reduce-transparency` (opaque, no wallpaper tint), `glass-increase-contrast` (opaque, flat, strong borders), `glass-show-borders` (all off). GNOME's High Contrast also makes Kiwi surfaces solid.
- Off gives every surface its solid theme colour.

## Limits
- The glass is a fill on the surface actor itself (`kiwi-glass-*` classes), so it follows rounded corners. App windows stay opaque.
- Another extension that blurs the same surfaces overlaps with it; use one of them per surface. Kiwi never changes that extension.
- The older blur keys remain in the schema as deprecated and unused.
