# Liquid Glass

## 1. Summary
A shell-wide frosted, translucent style for the top bar, menus, Control Center,
notifications and the notch's surroundings, dock, Spotlight, Clipboard and the Stage
Manager strip. One switch turns it all off.

## 2. Locked decisions
- It must be possible to turn it off. Off means solid surfaces that look the same as today.
- It covers shell surfaces only. App windows stay opaque, because Mutter has no
  blur-behind for clients.
- It takes over the existing Panel Blur and Dock Blur while it is on, so there is never a
  double blur.

## 3. UI
- Layers, from the back: blur of what is behind → tint (light or dark, following
  `color-scheme`) → a 1px inner highlight on the top edge → a soft drop shadow.
- Style: **Tinted** (default, easier to read) or **Clear**.
- Corner radii are concentric (inner radius = outer − padding). Exact tokens are in the `apple-design` skill and override the canvas mock-ups.
- Refraction at the edges (GLSL) is **experimental and off by default**.
- Performance mode blurs a still copy of the wallpaper instead of the live screen.
  It turns on automatically in Power Saver when the user chose that.

## 4. Settings (proposed)
`liquid-glass` b=true · `liquid-glass-style` s=`tinted` · `liquid-glass-blur` i=30 ·
`liquid-glass-tint` i=55 · `liquid-glass-highlight` b=true · `liquid-glass-refraction` b=false ·
`liquid-glass-surfaces` as=`['panel','menus','dock','overlays']` · `liquid-glass-performance` b=false ·
`liquid-glass-off-in-powersave` b=true

## 5. Interactions
- When Blur my Shell is detected, show a notice in the preferences. Never fight it at runtime.
- Every new surface (features 3–8) must take its style from the shared glass helper
  (`lib/glass.js`, see the architecture doc), never its own copy.
- Accessibility: honour high-contrast. When it is on, use solid surfaces.

## 6. Acceptance
- [ ] Toggling it on and off at runtime leaves no effects, actors or CSS classes behind.
- [ ] Text contrast is ≥ 4.5:1 over the worst-case wallpaper in Tinted style.
- [ ] No frame drops on Intel integrated graphics with all surfaces on, in Performance mode.
