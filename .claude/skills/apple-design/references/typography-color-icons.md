# Typography, colour and icons

Summary: the macOS type scale and semantic colours from the HIG, with Tahoe's
system colour values, converted to St CSS. Kiwi uses open fonts (Adwaita Sans /
Inter) and icons (Adwaita symbolic / own SVGs), never SF Pro or SF Symbols.
Text sizes are relative to the user's shell font, so text scaling still works.

## Contents
1. Legal and licensing
2. macOS type scale (HIG)
3. Converting to St CSS
4. Weights, tracking, alignment
5. Semantic colours
6. System colours (Tahoe values)
7. Accent colours
8. Vibrancy and text on glass
9. Icons
10. Sources

---

## 1. Legal and licensing

- **SF Pro, SF Compact, SF Mono and New York** are licensed for use in apps
  for Apple platforms only. Never bundle them, reference them in CSS, or tell
  users to install them for Kiwi.
- **SF Symbols** carry the same restriction, and some symbols represent Apple
  products and can't be used at all. Don't trace or recreate them either.
- Open substitutes:
  - **UI font:** Adwaita Sans, the GNOME 48+ default derived from Inter, or
    Inter itself (SIL OFL). Kiwi should *inherit the shell font* and not set a
    family.
  - **Mono:** Adwaita Mono, or JetBrains Mono / Iosevka (OFL).
  - **Icons:** Adwaita symbolic icon set (CC-BY-SA / LGPL, in the theme), or
    Kiwi's own SVGs under `icons/`.

## 2. macOS type scale (HIG, "macOS built-in text styles")

| Style | Weight | Size pt | Line height pt | Emphasized |
|---|---|---|---|---|
| Large Title | Regular | 26 | 32 | Bold |
| Title 1 | Regular | 22 | 26 | Bold |
| Title 2 | Regular | 17 | 22 | Bold |
| Title 3 | Regular | 15 | 20 | Semibold |
| Headline | Bold | 13 | 16 | Heavy |
| Body | Regular | 13 | 16 | Semibold |
| Callout | Regular | 12 | 15 | Semibold |
| Subheadline | Regular | 11 | 14 | Semibold |
| Footnote | Regular | 10 | 13 | Semibold |
| Caption 1 | Regular | 10 | 13 | Medium |
| Caption 2 | Medium | 10 | 13 | Semibold |

macOS defaults to 13 pt and has a 10 pt minimum (HIG Accessibility). macOS
doesn't support Dynamic Type. GNOME does have text scaling, so Kiwi must
support it.

Tahoe type is slightly **bolder and left-aligned** in alerts and onboarding
(WWDC25 session 356).

## 3. Converting to St CSS

- An Apple pt is about one logical px at 1× scale. A CSS/St **pt** is 1/72 in at
  96 dpi, which is 1.333px. So Apple 13 pt ≈ 13px ≈ 9.75 St-pt.
- The GNOME shell font defaults to 11 pt (about 14.7px), so it is larger than
  macOS body text. **Don't shrink it to match macOS.** Use ratios relative to
  the shell font so `text-scaling-factor` and the user's font choice still
  apply:

| Kiwi class | em (relative to the shell font = Body) | Weight | Use |
|---|---|---|---|
| `.kiwi-text-large-title` | 2.0em | 700 | Rare. Empty states. |
| `.kiwi-text-title1` | 1.69em | 700 | Island expanded primary value (timer, score) |
| `.kiwi-text-title2` | 1.31em | 600 | Spotlight query text |
| `.kiwi-text-title3` | 1.15em | 600 | Control Center section and module titles |
| `.kiwi-text-headline` | 1.0em | 700 | Notification title, top-hit result |
| `.kiwi-text-body` | 1.0em | 400 | Default |
| `.kiwi-text-callout` | 0.92em | 400 | Secondary row text |
| `.kiwi-text-subhead` | 0.85em | 500 | Panel clock, island compact text |
| `.kiwi-text-caption` | 0.77em | 500 | Timestamps, key-hint chips. **Floor at 10px**. |

- **Geometry is in px. Text is in em or pt.** St scales px by the monitor
  scale factor, but text-scaling only reaches em/pt font sizes.
- Line height: St doesn't support `line-height` well. Use padding on labels
  to get the macOS rhythm: about 0.23em top and bottom for body rows.
- Numerals that update live (clock, timer, progress) should be tabular. Use
  `font-feature-settings: "tnum"` where the St version supports it
  **[verify]**. Otherwise use the mono font for the digits only.

## 4. Weights, tracking, alignment

- Weights are 400 regular, 500 medium (panel, already used in
  `.kiwi-panel-styled`), 600 semibold (titles) and 700 bold (headlines).
  Avoid 300 or below at sizes under 15px.
- **Live-activity and island text uses medium or heavier** (HIG Live
  Activities).
- St has no letter-spacing control. Don't fake tracking with spaces.
- Align text to the leading side. Centre it only in the island and in compact
  tiles. Keep RTL in mind: use `St.TextDirection` / `get_text_direction()`.
- Truncate with an ellipsis (`clutter_text.ellipsize = END`). Never wrap the
  panel clock or the island compact view.

## 5. Semantic colours

Never hard-code a grey for text. Define **roles** and derive them from the
theme foreground, the way Apple's dynamic colours work:

| Kiwi token (CSS class or JS) | Apple counterpart | Dark | Light |
|---|---|---|---|
| `fg-primary` | labelColor | fg α 0.92 | fg α 0.88 |
| `fg-secondary` | secondaryLabelColor | fg α 0.60 | fg α 0.55 |
| `fg-tertiary` | tertiaryLabelColor | fg α 0.38 | fg α 0.32 |
| `fg-quaternary` | quaternaryLabelColor | fg α 0.20 | fg α 0.16. Never for text on thin glass. |
| `fill-1` / `fill-2` / `fill-3` | fill / secondaryFill / tertiaryFill | white α 0.14 / 0.09 / 0.05 | black α 0.10 / 0.06 / 0.04 |
| `separator` | separatorColor | white α 0.10 | black α 0.10 |
| `focus` | keyboardFocusIndicatorColor | `-st-accent-color` | same |
| `selected-bg` | selectedContentBackgroundColor | accent | accent |
| `selected-bg-unfocused` | unemphasized… | fg α 0.12 | fg α 0.10 |
| `destructive` | systemRed | see table 6 | |

The alpha values are Kiwi choices modelled on Apple's label hierarchy. Apple's
exact macOS alphas aren't published in the HIG text. **[approximate]**
Check them with the contrast checks in `accessibility.md`.

## 6. System colours: Tahoe values (HIG Color, sRGB)

| Name | Light | Dark | High-contrast light | High-contrast dark |
|---|---|---|---|---|
| Red | #FF383C | #FF4245 | #E9152D | #FF6165 |
| Orange | #FF8D28 | #FF9230 | #C55300 | #FFA056 |
| Yellow | #FFCC00 | #FFD600 | #A16A00 | #FEDF43 |
| Green | #34C759 | #30D158 | #008932 | #4AD968 |
| Mint | #00C8B3 | #00DAC3 | #008575 | #54DFCB |
| Teal | #00C3D0 | #00D2E0 | #008198 | #3BDDEC |
| Cyan | #00C0E8 | #3CD3FE | #007EAE | #6DD9FF |
| Blue | #0088FF | #0091FF | #1E6EF4 | #5CB8FF |
| Indigo | #6155F5 | #6D7CFF | #564ADE | #A7AAFF |
| Purple | #CB30E0 | #DB34F2 | #B02FC2 | #EA8DFF |
| Pink | #FF2D55 | #FF375F | #E7124D | #FF8AC4 |
| Brown | #AC7F5E | #B78A66 | #956D51 | #DBA679 |
| Gray | #8E8E93 | #8E8E93 | #6C6C70 | #AEAEB2 |

These are converted from the HIG's RGB labels. Don't paste these hex values in
as Kiwi's palette. Use them only as **guidance for semantic status colours**
(record, recording dot, battery low, destructive), and prefer the GNOME
palette where an equivalent exists. Note the high-contrast columns: status
colours need darker or lighter variants when `high_contrast` is on.

## 7. Accent colours

- macOS offers Multicolor (app-defined), Blue, Purple, Pink, Red, Orange,
  Yellow, Green and Graphite. Graphite also triggers *desktop tinting* of
  window backgrounds (HIG Dark Mode).
- GNOME 47+ has `org.gnome.desktop.interface accent-color` with the values
  blue, teal, green, yellow, orange, red, pink, purple and slate. St exposes
  it as `-st-accent-color` and `-st-accent-fg-color`, which Kiwi already uses
  in `apps/calendar.js`.
- **Rule:** Kiwi always follows the GNOME accent. Slate is the Graphite
  analogue. If Kiwi offers "desktop tinting", base it on slate and the
  wallpaper's average colour at α ≤ 0.06.

## 8. Vibrancy and text on glass

- On Apple platforms, *vibrancy* pulls background colour into foreground
  labels and fills so they stay legible on materials. Thicker materials give
  more contrast, and thinner ones more context. Avoid quaternary text on thin
  materials. (HIG Materials)
- St has no blend modes. Approximate vibrancy like this:
  1. Use **alpha-based** fg roles (table 5) instead of solid greys, so the
     glass tint shows through text and fills.
  2. On the **transparent top bar**, add
     `text-shadow: 0 1px 2px rgba(0,0,0,0.35)` and
     `icon-shadow: 0 1px 2px rgba(0,0,0,0.35)` for light glyphs over unknown
     wallpaper. Remove them when the panel background is opaque.
  3. Flip small glyph colour by sampled luminance (liquid-glass.md §9.4).

## 9. Icons

| Context | Size | Style |
|---|---|---|
| Panel status | 16px (`-st-icon-style: symbolic`) | Monochrome, theme-recoloured |
| Traffic lights | 12–14px circles, 8px glyph | CSS-drawn circles plus Kiwi SVG glyphs (×, −, ⤢) |
| Control Center small tile | 20px glyph in a 44px circle | Symbolic. Tint the circle with the accent when on. |
| Control Center large tile | 24px | Symbolic |
| Notification / island app icon | 24px compact, 32–40px expanded | Full-colour app icon, from `Shell.App` |
| Spotlight result | 32px apps, 24px files/actions | App icons in colour, actions symbolic |
| Quick Paste row | 16px type glyph (text / image / link / colour) | Symbolic |

Custom SVG rules:
- Name files `kiwi-<name>-symbolic.svg` and use a single fill (`#2e3436` or
  `currentColor`) so St recolours them.
- Draw on a 16px grid with 1.5px strokes converted to fills, aligned to whole
  pixels.
- Never copy SF Symbol outlines. Design from Adwaita's metaphors.
- Put them in `icons/` and load them with `Gio.icon_new_for_string(path)` or a
  theme search path added at enable time. Remove the search path on disable.

## 10. Sources

- HIG Typography (macOS table, font licensing note): https://developer.apple.com/design/human-interface-guidelines/typography
- HIG Color (system colours, Liquid Glass colour, macOS dynamic colours, accents): https://developer.apple.com/design/human-interface-guidelines/color
- HIG Dark Mode (desktop tinting): https://developer.apple.com/design/human-interface-guidelines/dark-mode
- HIG Materials (vibrancy): https://developer.apple.com/design/human-interface-guidelines/materials
- Apple fonts and licence: https://developer.apple.com/fonts/ ; SF Symbols licence: https://developer.apple.com/sf-symbols/
- Inter (OFL): https://rsms.me/inter/ ; Adwaita fonts: https://gitlab.gnome.org/GNOME/adwaita-fonts **[verify URL]**
- GNOME accent colours (GNOME 47 release notes): https://release.gnome.org/47/
