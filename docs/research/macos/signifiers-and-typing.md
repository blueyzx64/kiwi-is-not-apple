# Signifiers, feedback and typing aids, Catalina → Golden Gate, for Kiwi

Scope: the macOS features that tell the user something without being asked: badges at the caret, modifier and
input-source state, pointer visibility, menu and window cues, HUDs. The focus is on what helps typists and
developers. Only features macOS ships are listed (no third-party apps, no iPadOS, no Kiwi inventions).
Researched October 2026; the latest release is **macOS 27 Golden Gate** (27.0 on 14 September 2026, 27.2 on
26 October 2026).

Each feature uses the template in `README.md`. Status words: **have**, **partial**, **none**. Kiwi status was
checked against the code and the live settings on 2026-10-28.

---

## Lineages: what replaced what

Apple often adds a cue and walks it back two releases later. Follow the newest row unless noted.

| Cue | Catalina → … → Golden Gate | Kiwi today | Follow |
|---|---|---|---|
| Volume / brightness HUD | big centred square (through Sequoia) → Tahoe: small pill under the menu bar near Control Center → **27.2**: segmented bar, one large icon at the left, under the **matching** menu-bar icon (keyboard changes only; Control Center sliders unchanged) | Tahoe pill (`features/osd/`) | **27.2** |
| Menu item icons | none → Tahoe: a symbol on almost every command (widely criticised) → **27**: most removed | none in app menus | 27 (keep none) |
| Launchpad | grid with folders (to Sequoia) → Tahoe: removed, Apps view in Spotlight, no folders | both (Launchpad 11–15 and Spotlight views) | keep both; Spotlight views are current |
| Keyboard Viewer | own window → **Catalina**: merged into the Accessibility Keyboard (input menu still says "Show Keyboard Viewer") | none | Accessibility Keyboard |
| Window title icon / unsaved | always shown, dimmed + dot in the red button when unsaved → **Big Sur**: icon hidden until title hover → **Monterey**: "Show window title icons" option → newer apps reportedly show "Edited" by the title (anecdotal) | `show-window-title-icon` | dot in the red button (longest-lived cue) |
| Menu bar | opaque → **Big Sur**: translucent, can auto-hide → **Tahoe**: fully transparent, "Show Menu Bar Background" toggle → **27**: fewer menu-bar icons | transparent, adaptive, auto-hide | Tahoe/27 |
| Control Center | **Big Sur**: fixed → **Tahoe**: add/remove/reorder, third-party controls, ⌘-drag menu-bar icons | editor | Tahoe |
| Traffic lights | **Big Sur** redesign → **Tahoe** glass → **27**: glass with a bounce on click/drag | glass style | 27 |
| Glass | **Tahoe** Liquid Glass → Clear / Tinted → **27**: continuous slider + Show Borders | tint, Clear↔Tinted, Show Borders | 27 |
| Caret badges | caps only on the key LED and in password fields → **Sonoma**: ⇪, input source, dictation at the caret; no off switch → unchanged to 27 | have, with two differences (see 1.1) | Sonoma |
| Globe / fn key | **Big Sur/Monterey**: press for emoji / input source / dictation → **Sonoma**: emoji predictions first, a second press for the full picker (user reports) | emoji picker on Ctrl+Super+Space | Sonoma |

---

## 1. At the caret (text insertion point)

### 1.1 Caps Lock indicator at the caret
- **Introduced / changed:** Sonoma (14); unchanged to Golden Gate.
- **What it is:** a small ⇪ badge under the caret, in the app's accent colour, **visible for as long as Caps Lock is on**. Nothing is shown when Caps Lock turns off. No System Settings switch (only a hidden feature flag).
- **Caveats (on macOS):** colour varies by app accent; some users dislike it and cannot turn it off.
- **Port to GNOME 50:** exists (`features/inputIndicator/`, caret from IBus via `lib/caret.js`).
- **Blockers / risks:** apps that report no caret get the badge by the pointer.
- **Kiwi status:** **have** (feat/signifiers): ⇪ stays and follows the caret while Caps Lock is on; the Caps-off badge is opt-in (`input-indicator-caps-off`).
- **Recommendation:** Port (P1), **S**. Keep `caps-on` up and following the caret until Caps Lock is off; make the off badge opt-in or drop it.

### 1.2 Input source indicator at the caret
- **Introduced / changed:** Sonoma.
- **What it is:** the new source's name under the caret for a moment after switching. With fn set to Change Input Source, a list of all sources with the current one marked.
- **Kiwi status:** **have** (`input-indicator-source`). The fn list: none.
- **Recommendation:** have; the source list on a key press is Later (P3), **S**.

### 1.3 Dictation indicator at the caret
- **Introduced / changed:** Sonoma (badge); earlier releases used a floating feedback window with a level meter.
- **What it is:** the caret is highlighted and pulses, a 🎤 sits above or below it; both pause while you type and return after.
- **Port to GNOME 50:** needs a dictation engine first (none in GNOME).
- **Kiwi status:** none (no dictation on GNOME).
- **Recommendation:** Skip until a dictation helper exists.

### 1.4 ⇪ in password fields
- **Introduced / changed:** long-standing (login window, password sheets).
- **What it is:** a ⇪ glyph at the trailing edge of a password field while Caps Lock is on.
- **Port to GNOME 50:** Kiwi already restyles the Shell's modal dialogs (`features/dialogs/`); swap the Shell's "Caps lock is on" text for the glyph in the entry. Lock screen / GDM is out of reach for an extension.
- **Kiwi status:** **have** (`dialogs-caps-lock-icon`, `features/dialogs/capsLock.js`).
- **Recommendation:** Port (P1), **S**.

### 1.5 Press and hold for accents
- **Introduced / changed:** Lion; key repeat set to Off disables it.
- **What it is:** holding a letter shows its accented variants numbered 1–9; click or press the number.
- **Port to GNOME 50:** needs an IBus engine (out of process), not Shell code.
- **Kiwi status:** **have** through the Kiwi input engine (`helpers/kiwi-input`, `input-press-and-hold`; needs `sudo make input-install` and a "(Kiwi)" input source).
- **Recommendation:** Later (P3), **L**. High value for typists in Latin languages.

### 1.6 Inline predictions and autocorrect underline
- **Introduced / changed:** Sonoma (inline grey predictions; Space accepts, Esc dismisses); autocorrected words get a brief solid underline, revert from the caret.
- **Port to GNOME 50:** no system-wide autocorrect on GNOME.
- **Recommendation:** Skip.

### 1.7 Text Replacements
- **What it is:** a short abbreviation expands to a phrase as you type, synced across devices.
- **Port to GNOME 50:** IBus engine or the Quick Paste technique; fragile across toolkits.
- **Kiwi status:** **have** through the Kiwi input engine (`input-replacements`, `input-replacements-list`).
- **Recommendation:** Later (P3), **M**.

---

## 2. Keyboard state and keyboard accessibility

### 2.1 Sticky Keys: display pressed keys on screen
- **Introduced / changed:** long-standing; present in the Golden Gate guide.
- **What it is:** with Sticky Keys on, latched or locked modifiers show as ⌃ ⌥ ⇧ ⌘ symbols in a screen corner the user picks ("Screen area for display"); optional beep when a modifier is set. Toggle with Shift ×5.
- **Port to GNOME 50:** read `org.gnome.desktop.a11y.keyboard` and the latched/locked modifier state from Clutter's keymap; draw a glass HUD in the chosen corner.
- **Kiwi status:** **have** (`kbd-a11y-sticky-display`, `kbd-a11y-sticky-corner`; `features/keyboardAccess/`).
- **Recommendation:** Port (P1), **S–M**.

### 2.2 Slow Keys
- **What it is:** a key must be held for an acceptance delay; optional click sounds.
- **Kiwi status:** **partial**: a Slow Keys chip (`kbd-a11y-slowkeys-indicator`); Mutter gives no accept/reject signal, so no progress.
- **Recommendation:** Later (P3), **S**: a progress ring on the Sticky Keys HUD while a key is being accepted.

### 2.3 Accessibility Shortcuts panel
- **What it is:** ⌥⌘F5 (or Touch ID ×3) opens a small panel of toggles: Sticky Keys, Slow Keys, Zoom, VoiceOver, etc.
- **Kiwi status:** **have** (Super+Alt+F5, `kbd-a11y-panel-shortcut`).
- **Recommendation:** Port (P2), **S**: a glass panel listing the a11y toggles Control Center already knows.

### 2.4 Keyboard navigation (⌃F7)
- **What it is:** Tab reaches every control instead of only text fields and lists.
- **Port to GNOME 50:** app-side behaviour; GTK already tabs to everything.
- **Recommendation:** Skip.

### 2.5 Full Keyboard Access
- **Introduced / changed:** Big Sur-era redesign; Golden Gate guide lists the cursor options.
- **What it is:** a strong highlight on the focused item; Space activates, arrows move inside groups. Its highlight has **Auto-hide, Increase size, High contrast, Color** (Accessibility → Keyboard → Full Keyboard Access → ⓘ). These options belong to this highlight, not to the text caret or the mouse pointer.
- **Port to GNOME 50:** draw a ring over the AT-SPI focused object's extents (async a11y bus, as `core/appMenus/atspi.js` does); apps' own focus rings remain.
- **Kiwi status:** **have** (the highlight: `hover-focus-highlight`, colour, width, high contrast, auto-hide; `features/hoverText/`). Focus movement stays with the apps.
- **Recommendation:** Later (P3), **L**.

### 2.6 Read & Speak typing feedback
- **What it is:** speaks characters and/or words as you type, and the character under the caret when you move with the arrow keys (formerly Spoken Content → Speak typing feedback).
- **Port to GNOME 50:** Orca does this.
- **Recommendation:** Skip (point to Orca).

### 2.7 Hover Text
- **Introduced / changed:** Catalina; default activation ⌘, triple-press locks it on.
- **What it is:** hold the modifier over text to see it large in a panel; element-highlight colour outlines the item.
- **Port to GNOME 50:** AT-SPI text at the pointer; glass panel.
- **Kiwi status:** **have** (`hover-text`, triple-press lock, element highlight; `features/hoverText/`).
- **Recommendation:** Later (P3), **M–L**.

### 2.8 Hover Typing
- **Introduced / changed:** after Hover Text (version not confirmed); refreshed in Tahoe.
- **What it is:** a large, editable copy of what you type, near the caret or in a corner, with the field outlined; own font, size and colours, including the insertion-point colour.
- **Port to GNOME 50:** AT-SPI `text-changed` + caret events; only apps that expose text.
- **Kiwi status:** **have** (`hover-typing`; never for password fields; `features/hoverText/`).
- **Recommendation:** Later (P3), **L**.

### 2.9 Hover Color
- **Introduced / changed:** newest of the Hover family.
- **What it is:** shows a large swatch of the colour under the pointer.
- **Kiwi status:** **have** (`hover-color`: swatch and hex through `Shell.Screenshot.pick_color`; `features/hoverText/`).
- **Recommendation:** Later (P3), **M** (needs a screen read of the pixel under the pointer).

### 2.10 Zoom follows keyboard focus
- **What it is:** the magnifier follows the caret always, only while typing, or never; move the image to centre or just enough.
- **Port to GNOME 50:** GNOME's magnifier already has caret tracking.
- **Kiwi status:** **have** (`kbd-a11y-zoom-follow`: always / only when typing / never, owned through core/originals).
- **Recommendation:** Skip.

### 2.11 Keyboard Viewer (Accessibility Keyboard)
- **Introduced / changed:** merged into the Accessibility Keyboard in Catalina.
- **What it is:** the current layout on screen; holding ⌥ or ⇧ shows what each key types; opened from the input menu; light/dark, fades after inactivity.
- **Port to GNOME 50:** a glass panel drawing the XKB layout for the current source and levels.
- **Kiwi status:** **have** (`kbd-a11y-viewer-shortcut`, "Show Keyboard Viewer" in the input-source menu).
- **Recommendation:** Port (P2), **M**. Useful for finding `~ | { }` on non-US layouts.

### 2.12 Caps Lock switches input source
- **What it is:** with a non-Latin source, Caps Lock toggles to ABC; holding it until the LED lights types capitals.
- **Port to GNOME 50:** XKB `grp:caps_toggle` exists but not the tap/hold split.
- **Kiwi status:** **have** (`input-caps-lock-switch`, off by default).
- **Recommendation:** Later (P3), **M**.

### 2.13 Per-document input source
- **What it is:** "Automatically switch to a document's input source".
- **Port to GNOME 50:** GNOME has per-window sources.
- **Kiwi status:** **have** (`input-per-window`, owns GNOME's per-window key).
- **Recommendation:** Skip.

### 2.14 Globe / fn key
- **What it is:** press to change input source, show Emoji & Symbols, start dictation, or nothing; double press for dictation; fn-E for emoji.
- **Kiwi status:** **have** (`input-key-action`, `input-key-shortcut`).
- **Recommendation:** Later (P3), **S**: an "on key press" setting for one chosen key.

---

## 3. Pointer

### 3.1 Shake to locate
- **Introduced / changed:** El Capitan; Accessibility → Display → Pointer.
- **What it is:** shaking the mouse or swiping fast makes the pointer briefly large.
- **Port to GNOME 50:** detect the shake from pointer motion in the Shell; scale the cursor sprite (or an overlay of it).
- **Kiwi status:** **have** (`pointer-shake-to-locate`, `features/pointer/`).
- **Recommendation:** Port (P2), **M**.

### 3.2 Pointer size, outline and fill colours
- **What it is:** size slider; separate outline and fill colours; Reset Colors.
- **Port to GNOME 50:** size via `cursor-size`; colours need a generated cursor theme.
- **Recommendation:** Later (P3), **M**.

### 3.3 Hide the pointer while typing
- **What it is:** AppKit hides the pointer on the first keystroke in a text view and shows it again on movement (not a System Settings option).
- **Port to GNOME 50:** hide the cursor from the Shell on key press when a text input has focus; show on motion.
- **Kiwi status:** **have** (`pointer-size`, `pointer-custom-colors`: a recoloured copy of the theme in `~/.local/share/icons/Kiwi-Pointer-*`).
- **Recommendation:** Port (P1), **S**.

---

## 4. Menus and windows

### 4.1 Holding Option changes menus
- **What it is:** items swap while ⌥ is held (Open → Open and Close Window, Hide → Hide Others, About This Mac → System Information). Option-click on menu-bar items shows more (Wi-Fi details, sound input devices).
- **Port to GNOME 50:** the menu bar owns its menus (`features/menuBar/`, `core/appMenus/`); add alternates to Kiwi's own menus and the pinned items. App menus only where the provider exposes alternates.
- **Kiwi status:** **have** (`pointer-hide-while-typing`; needs an app that reports its caret through IBus).
- **Recommendation:** Port (P2), **M**.

### 4.2 Unsaved-changes dot in the close button
- **What it is:** a dark dot in the red button while the document has unsaved changes; the title icon is dimmed and cannot be dragged.
- **Port to GNOME 50:** needs a signal from the app: a leading/trailing `*` or `•` in the title, or GTK's `modified` state where exposed. The dot is drawn by the GTK stylesheet (`features/appButtons/gtk/`) or a Shell overlay.
- **Blockers / risks:** heuristic; no portable "document edited" API.
- **Kiwi status:** **have** (`menubar-option-alternates`: About → System Information, Minimize → Minimize All, Close → Close All, Quit → Force Quit; Option-click Battery). Hide → Hide Others skipped (already its own item).
- **Recommendation:** Port (P2), **M**, after a feasibility check.

### 4.3 Show window title icons
- **Introduced / changed:** Monterey option, after Big Sur hid the icon.
- **Kiwi status:** **have** (`show-window-title-icon`).

### 4.4 Show toolbar button shapes
- **What it is:** a subtle border around toolbar buttons so the clickable area is visible.
- **Port to GNOME 50:** GTK stylesheet (`gtk-theme`) for headerbar buttons.
- **Kiwi status:** **have** (`app-buttons-toolbar-shapes`, GTK3 and GTK4 CSS).
- **Recommendation:** Port (P2), **S**.

### 4.5 Differentiate without colour
- **What it is:** shapes as well as colour for status.
- **Port to GNOME 50:** Kiwi's own surfaces (privacy dots, dock dots, Focus icon).
- **Kiwi status:** **have** (`a11y-differentiate-without-color`: privacy-dot shapes, hollow Dock background-app dot).
- **Recommendation:** Port (P2), **S**: audit Kiwi's colour-only cues.

### 4.6 Traffic-light bounce (Golden Gate)
- **What it is:** the glass traffic lights bounce when clicked or dragged.
- **Kiwi status:** **have** as a GTK CSS transition (`app-buttons-bounce`).
- **Recommendation:** Later (P3), **S** for Kiwi-drawn buttons.

### 4.7 More distinct active window (Golden Gate)
- **What it is:** the active window stands out more from inactive ones.
- **Port to GNOME 50:** shadow strength and glass tint by focus.
- **Kiwi status:** **have** for GTK apps with client-side titlebars (`app-buttons-distinct-active`).
- **Recommendation:** Port (P2), **S**.

### 4.8 Show Borders (Golden Gate)
- **Kiwi status:** **have** (`glass-show-borders`).

### 4.9 Menu bar background toggle (Tahoe)
- **What it is:** "Show Menu Bar Background" puts a backing behind the transparent bar.
- **Kiwi status:** **have** ("Show Menu Bar Background", bound to `menubar-transparent`).
- **Recommendation:** Port (P2), **S**: one switch matching Tahoe's wording.

---

## 5. HUDs

### 5.1 Volume and brightness HUD (27.2)
- **Introduced / changed:** see the lineage table.
- **What it is:** a segmented bar with a single larger icon at the left, under the menu-bar icon that matches (Sound, Display), only for keyboard changes. Description from the 27.2 beta; the final design is not verified.
- **Port to GNOME 50:** `ctx.osd` sink already exists; change the pill's layout and anchor it to the matching menu-bar item (fallback: Control Center button).
- **Kiwi status:** **have** (`osd-style` golden-gate default, tahoe kept).
- **Recommendation:** Port (P1), **S–M**.

---

## Priority for typists and developers
1. Caps Lock badge (1.1) and ⇪ in password fields (1.4).
2. Volume / brightness HUD to 27.2 (5.1).
3. Sticky Keys on-screen display (2.1), hide the pointer while typing (3.3).
4. Option changes menus (4.1), Keyboard Viewer (2.11), shake to locate (3.1), Accessibility Shortcuts panel (2.3).
5. Unsaved dot (4.2), toolbar button shapes (4.4), active window (4.7), menu bar background (4.9).
6. Later: hold for accents, Hover Text / Typing / Color, Full Keyboard Access, Text Replacements.

## Gaps
- The releases that introduced Hover Typing and Hover Color were not confirmed.
- Whether Big Sur changed the volume HUD was not confirmed.
- AppleVis's Golden Gate accessibility round-up could not be read (HTTP 403).
- Apple does not publish lists of removed features; the lineages come from reviews and support pages.

## Sources
- [Apple: Keyboard settings for accessibility (Sticky Keys, Slow Keys, Full Keyboard Access cursor; macOS 27 guide)](https://support.apple.com/guide/mac-help/change-keyboard-settings-for-accessibility-mchlae61a6de/mac)
- [Apple: Full Keyboard Access](https://support.apple.com/guide/mac-help/use-full-keyboard-access-mchlc06d1059/mac)
- [Apple: Make the pointer easier to see](https://support.apple.com/guide/mac-help/make-the-pointer-easier-to-see-mchlp2920/mac)
- [Apple: Display settings for accessibility](https://support.apple.com/guide/mac-help/change-display-settings-for-accessibility-unac089/mac)
- [Apple: Hover Text settings](https://support.apple.com/guide/mac-help/mchl46661917/mac)
- [Apple: Spoken Content settings](https://support.apple.com/en-tm/guide/mac-help/spch638/mac)
- [Apple: Have what you type spoken out loud](https://support.apple.com/en-au/guide/mac-help/mchl86b6234f/mac)
- [Apple: Zoom advanced options](https://support.apple.com/guide/mac-help/change-zoom-advanced-options-accessibility-mh35715/mac)
- [Apple: Input Sources settings](https://support.apple.com/guide/mac-help/change-input-sources-settings-mchl84525d76/mac)
- [Apple: Input menu](https://support.apple.com/guide/mac-help/aside/glos52ed78a0/mac)
- [Apple: Key repeat](https://support.apple.com/guide/mac-help/set-how-quickly-a-key-repeats-mchl0311bdb4/mac)
- [Apple: Accent menu](https://support.apple.com/en-ph/guide/mac-help/mh27474)
- [Apple: Typing suggestions and corrections](https://support.apple.com/guide/mac-help/mchlp2299)
- [Apple: Dictation](https://support.apple.com/guide/mac-help/use-dictation-mh40584/mac)
- [Apple: Mac keyboard shortcuts](https://support.apple.com/en-us/102650)
- [Apple HIG: Focus and selection](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection)
- [Apple: macOS 27 Golden Gate](https://www.apple.com/os/macos/)
- [Apple: What's new for enterprise in Golden Gate 27](https://support.apple.com/en-us/148830)
- [MacRumors: 50 new Golden Gate features](https://www.macrumors.com/2026/09/17/new-features-changes-macos-27/)
- [MacRumors: Golden Gate 27.2 released](https://www.macrumors.com/2026/10/26/apple-releases-macos-golden-gate-27-2/)
- [MacRumors: 27.2 slider design](https://www.macrumors.com/2026/09/21/macos-27-2-slider-design/)
- [9to5Mac: Golden Gate, everything new](https://9to5mac.com/2026/09/14/macos-27-golden-gate-now-available-here-is-everything-new/)
- [lavx: Apple walks back menu icons in macOS 27](https://news.lavx.hu/article/apple-reiterates-its-menu-icon-warning-in-macos-27-walking-back-a-macos-tahoe-mistake)
- [Tonsky: It's hard to justify Tahoe icons](https://tonsky.me/blog/tahoe-icons/)
- [MacRumors: Tahoe, all the little changes](https://www.macrumors.com/2025/06/11/macos-tahoe-all-the-little-changes/)
- [MacStories: Tahoe review, system features](https://www.macstories.net/stories/macos-26-tahoe-the-macstories-review/3)
- [Macworld: Control Center in Tahoe](https://www.macworld.com/article/2859555/how-to-take-full-control-of-your-control-center-in-macos-tahoe.html)
- [TWiT: Tahoe menu bar](https://twit.tv/posts/tech/take-full-control-your-macos-tahoe-menu-bar)
- [iGeeksBlog: Launchpad in Tahoe](https://www.igeeksblog.com/restore-launchpad-macos-26/)
- [AbilityNet: Hover Typing in Tahoe](https://mcmw.abilitynet.org.uk/how-to-display-a-larger-version-of-the-text-you-are-typing-in-macos-26-tahoe)
- [MacRumors: Sequoia window tiling](https://macrumors.com/2024/06/12/macos-sequoia-window-tiling/)
- [MacRumors: 50 Sonoma features](https://www.macrumors.com/guide/50-new-macos-sonoma-features)
- [MacMost: text cursor indicators](https://macmost.com/turning-off-the-caps-lock-and-other-text-cursor-indicators-on-your-mac.html)
- [Sir Apfelot: caps lock and dictation indicator](https://www.sir-apfelot.de/anleitung-feststelltaste-und-diktat-indikator-deaktivieren-61073/)
- [MacMost: Fn/Globe key](https://macmost.com/the-mac-fn-globe-key-everything-it-can-do.html)
- [MacRumors forum: smart emoji in Sonoma](https://forums.macrumors.com/threads/smart-emojis-in-sonoma.2423776)
- [9to5Mac: System Settings in Ventura](https://9to5mac.com/2022/11/01/mac-system-settings-macos-ventura/)
- [TidBITS: always show window title icons](https://tidbits.com/2022/03/26/tipbits-always-show-window-proxy-icons/)
- [Macworld: proxy icons](https://www.macworld.com/article/1150425/proxyicons.html)
- [MacStories: Big Sur review](https://www.macstories.net/stories/macos-big-sur-the-macstories-review/7)
- [Bitsplitting: Catalina's custom keyboard viewers](https://bitsplitting.org/?p=1320)
- [MacMost: Keyboard Viewer in Catalina](https://macmost.com/?p=32230)
- [AppleVis: Catalina for blind and low vision users](https://www.applevis.com/comment/104332)
- [MacRumors: hidden Option-key features](https://www.macrumors.com/guide/hidden-macos-features-Option-key/)
