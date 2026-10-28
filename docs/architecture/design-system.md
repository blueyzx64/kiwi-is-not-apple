# Kiwi design system

> **Summary:** every Kiwi surface builds its lists, headers, search fields, toolbar buttons and
> cards from one set of shared classes in `styles/base.css`, with the sizes code needs in
> `lib/designTokens.js`. A feature's `style.css` keeps its own layout (widths, its spacing) and
> never repeats a colour, radius or type size the design system sets. Overlays above windows
> use the glass "overlay" legibility level.

St CSS has no variables, so the system is component classes (added next to a feature's own
`kiwi-<feature>-*` class) plus one pure JS module of numbers. Look and motion reference:
`.claude/skills/apple-design` (macOS Tahoe, Liquid Glass).

## Scales

| Scale | Values | Where |
|---|---|---|
| Spacing | 4 · 8 · 12 · 16 · 20 px | `SPACE.xs..xl` |
| Radius | control 8 · row 10 · menu 12 · card 18 (16–20) · panel 26 (24–28) · capsule 999 | `RADIUS` |
| Type | display 16.5pt · title 12.75pt 600 · headline 10.5pt bold · body 10.5pt · callout 9.75pt · caption 8.25pt | `.kiwi-text-*` |
| Icon wells | S 20/16 · M 32/28 · L 44/40 · XL 64/56 (box/icon); symbolic glyphs 12 · 18 · 24 · 32 | `ICON_WELL`, `.kiwi-icon-well-*` |
| Search bar | 48 px high, glyph 20; frame padding 4 (Spotlight radius 28 = one capsule) | `SEARCH_BAR` |
| Toolbar | 32 px circular buttons, 16 px icons, 8 px apart | `TOOLBAR`, `.kiwi-toolbar-button` |

Type is in pt so GNOME's text scaling factor applies (an St px does not scale with it). Concentric
corners: an inner radius is the outer radius minus the padding (`innerRadius()`): a 26 px panel
with 8 px padding holds 18 px cards; a 18 px card with 8 px padding holds 10 px rows.

## Components (`styles/base.css`)

| Class | What it is |
|---|---|
| `.kiwi-card` | A grouped block inside a panel: radius 18, padding 12, a 6 % fill (no glass on glass) |
| `.kiwi-row` | One selectable line: radius 10, padding 6/8, spacing 10. `:hover` a quiet fill; `:selected` or `.kiwi-row-selected` the accent at a calmer level (75 % on dark glass, 88 % on light) with the accent's text colour. Secondary text, wells and the ↵ hint follow it |
| `.kiwi-icon-well` + `-s/-m/-l/-xl` | A fixed box, so every icon in a list is drawn at one size whatever its file's padding. Add `-rounded` or `-circle` for a symbolic glyph on a quiet fill. `wellClasses(size, shape)` builds the string |
| `.kiwi-section-header` | Caption, bold, secondary colour; padding 8 so its text lines up with the rows' icons and the selection is inset by the same margin |
| `.kiwi-search-capsule` | The bar holding a glyph and the field: radius 999, padding 0/14, spacing 10. `-filled` gives it a fill inside a panel (Launchpad) |
| `.kiwi-search-field` | `StEntry`: no box, no hover fill, no focus ring (the theme's ring is `!important`, so this one is too), the placeholder (`StLabel.hint-text`) in the secondary colour on the same baseline. Use with `.kiwi-text-display` for a big field |
| `.kiwi-search-glyph` | The magnifier: secondary colour |
| `.kiwi-toolbar-button` | Circular 32 px button: a faint fill, the row hover fill, the accent when `:checked`, the shared focus ring |
| `.kiwi-secondary-text` / `.kiwi-tertiary-text` | 60 % / 40 % of the label colour (55 % / 40 % on light) |
| `.kiwi-separator` | A 1 px hairline |
| `.kiwi-text-display/-title/-headline/-body/-callout/-caption` | The type scale |

## Light, dark and accessibility

- The plain rules are the dark look. A light surface is any descendant of `.kiwi-glass-light`
  (light glass), `.kiwi-modal-light` (a Kiwi modal with glass off) or `.kiwi-light` (a surface
  that sets it itself).
- Increase Contrast / GNOME high contrast (`.kiwi-glass-contrast`, `.kiwi-modal-opaque`):
  secondary text at 80–85 %, cards, filled capsules and toolbar buttons get a 45–55 % border,
  the selection is the full accent.
- Reduce Transparency (`.kiwi-glass-solid`): opaque glass, full accent selection.
- Accent: always `-st-accent-color` / `-st-accent-fg-color` (calmed with `st-transparentize`),
  never a hard-coded blue. Accent is for the selection and an active state only.
- Focus: `.kiwi-toolbar-button:focus` and `.kiwi-row:focus` use the shared 2 px accent ring.

## Glass legibility (lib/glassParams.js)

Kiwi's glass has no blur, so what is behind a surface shows through by `1 − alpha`. Three levels:

| Role | Alpha (Clear → Tinted) | Use |
|---|---|---|
| `bar` | 0.67 → 0.90 | Menu bar, dock, Stage Manager floor: icons on it |
| `content` | 0.90 → 0.97 | Menus, Control Center, the calendar card: over the desktop |
| `overlay` | 0.975 → 0.99 | Above windows: every `ModalSurface` (Spotlight, Notification Center, Quick Paste, emoji, Force Quit, About), Launchpad, the switcher, HUDs, Hover Text, dialogs. A busy window (a diff, a terminal) stays under ~2/255 per channel instead of showing through as coloured bands |

Pass it as `Glass.attach(actor, { surface: 'overlays', role: 'overlay' })`. Every role keeps
the 4.5:1 text floor; Reduce Transparency and Increase Contrast make all of them opaque.

## Adopting it in a feature

1. Add the shared class next to your own: `style_class: 'kiwi-foo-row kiwi-row'`.
2. Delete the colours, radii and type sizes your `style.css` set for that actor; keep layout.
3. Icons in lists: wrap them in a well (`new St.Bin({ style_class: wellClasses('M'), child })`,
   icon size `iconSizeFor('M', symbolic)`).
4. Overlays above windows: glass role `overlay`.
5. `make css`, then check light, dark and Increase Contrast in the harness.
