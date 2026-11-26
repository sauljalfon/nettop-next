# Look details research, 2026-11-26

The owner asked for more depth on the small things of the look: the font, the colours and the details around them. This file follows the two studies of 2026-11-25 and does not repeat them: [design-review-2026-11-25.md](design-review-2026-11-25.md) covers usability and accessibility, and [ui-research-2026-11-25.md](ui-research-2026-11-25.md) covers the broad visual pass (spacing scale, semantic tokens, quieter faceplates, icon language, empty states). Where this file goes further on one of their points, it says so. Nothing here is decided. Anything that touches a locked decision is marked **⚑ touches Dxx**. Its tokens are meant to feed the roadmap's "One look on every page" item (queue item A).

**The specimen** is [demos/look-specimen.html](demos/look-specimen.html). Open it in a browser. In it you can switch the UI font, the Hebrew font and the number font live on a realistic equipment page (ports table, faceplate, rack, jack card), and see the type scale, every colour with its contrast computed in the page, the network colours under simulated colour blindness, a "too close" checker for a picked colour, a projector wash-out, a rough dark preview, and the small states (hover, pressed, focus, selected, disabled). IBM Plex and Inter are embedded, so the recommended look works with no internet. The other candidates load from Google Fonts.

**How this was done.** I read `shared/theme.css`, `map/networkColors.ts` and the feature CSS, and the screenshots of the earlier pass. I downloaded each candidate font and read its tables with fontTools (x-height, glyph widths, OpenType features). I rendered the look-alike letters at 40 and 80px in Chromium. All contrast ratios use the WCAG 2 formula. Colour distances (ΔE) are Euclidean distances in OKLab × 100 ([Ottosson, OKLab](https://bottosson.github.io/posts/oklab/)). Colour blindness uses the Machado, Oliveira and Fernandes 2009 model at full severity ([Machado et al.](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html)). The scripts are in the session's scratch folder, outside the repo.

---

## 1. Summary: what I recommend, ranked

| # | Decision | Why, in one line | Effort |
|---|---|---|---|
| 1 | **New default network colours:** 12 in creation order. The first six have the same brightness, with white numbers at 4.7:1 or more and at least 3:1 against the steel plate. None of them is red, amber, brown or teal, because those colours carry a state. | Today's orange is ΔE 6.7 from the danger red, the green 8.9 from the route teal, and the olive 7.9 from proposed. In other words, a network can look like a state. Two of today's six also fail 3:1 on steel. | S. **⚑ touches D27** only if existing networks change colour; see §4.4 to avoid that. |
| 2 | **The "too close" rule for the colour picker:** warn when the new colour is under ΔE 8 from another network, under ΔE 10 from a state colour, or when neither white nor ink numbers reach 4.5:1 on it. | One simple rule, computed in OKLab. The default 12 pass it, so the warning only appears for the owner's own picks. The specimen has it working. | S |
| 3 | **Keep IBM Plex Sans, Plex Sans Hebrew and Plex Mono** (D33). Ship IBM's own font files instead of the `@fontsource` builds. | No candidate beats Plex for this app. It is the only family whose Hebrew is drawn to the same x-height and cap height as its Latin, its capital I has serifs (I, l and 1 never look alike), its digits are tabular without any setting, and the mono zero has a dot. The `@fontsource` files strip every optional OpenType feature, including the slashed zero. | S |
| 4 | **One type scale by job:** six sizes (11 · 12 · 13 · 14 · 16 · 20), three weights (400 · 500 · 600), with Carbon's letter-spacing for Plex (+0.025em at 12px, +0.01em at 14px, 0 from 16px). Jack numbers are `clamp(11px, 0.32 × jack, 16px)`. **⚑ touches D33** (26px leaves the scale). | This turns the earlier pass's roles into exact values, adds the hardware text, and removes the stray weights 650 and 700. Today those render as 600 anyway, because only 400, 500 and 600 ship. | M (with item A) |
| 5 | **A neutral scale of 12 greys, each defined by its contrast** (1.04 … 14.4 against white), which takes over today's floor, rule and ink-soft almost unchanged. Plus a 9-step steel scale. | Every grey has one job and a known ratio. Field borders land at 3.2:1, faint text at 4.6:1 and muted text at 6.2:1, so no grey is too weak by accident. | S |
| 6 | **State colours as solid, text and soft-background triples, all checked:** route `#0b8272` (from `#0f8b7a`, so white jack numbers reach 4.7:1), an amber **edge** `#c98701` for highlight outlines (3:1), one warning text colour, success `#276f3c` for messages only. | Today white numbers on a route jack are 4.2:1 and an amber outline on white is 2.45:1. Both are below the bar. | S |
| 7 | **Never colour alone for route and networks:** a 2px white bar under route jacks, and the network name wherever networks are mixed. | Under deuteranopia the route teal and a magenta network both turn the same grey (specimen, colour-vision menu). Blues and purples merge. No palette can fix that at equal brightness. | S |
| 8 | **No dark mode now.** Keep the tokens semantic so one could be added later. | Light mode reads better for people with normal vision, especially small text and in lit rooms like a projector's ([NN/g](https://www.nngroup.com/articles/dark-mode/)). D33's paper-and-steel idea depends on the paper being light. | none |
| 9 | **The small states as exact values:** focus ring, hover, pressed, selected and disabled for every control kind; four elevation levels; tooltips; badges; icons sized so the stroke matches the text; scrollbars; cursors; motion at 80–240ms with Carbon's curves. | Each one is a token, so `theme.test.ts` can guard it with item A. | M (with item A) |

---

## 2. Fonts

### 2.1 What was compared

All of them are under the SIL Open Font License 1.1, so all can be self-hosted on the campus server. I measured x-height (how big the small letters look), the width of one typical line ("Gi1/0/49 EDGE-17 Rack Core 01 access switch") and the shapes of the look-alike letters. The specimen's section 2 shows the same measurements live.

| Font | x-height | Line width (em) | Width per x-height | I l 1 | 0 O | Digits | Hebrew |
|---|---|---|---|---|---|---|---|
| **IBM Plex Sans** (today) | 0.516 | 21.2 | 41.0 | **distinct** (I has serifs, 1 has a flag) | 0 narrower than O; slashed with `zero` | **tabular by default** (every digit 600 units) | **IBM Plex Sans Hebrew**, same x-height 0.516 and cap height 0.698 |
| Inter 4 | 0.546 | 21.9 | 40.1 | I = l unless `cv08`/`ss02` is on | slashed with `zero` | proportional; needs `tnum` | none; must borrow one |
| Geist | 0.530 | 21.6 | 40.7 | I ≈ l | close | proportional; `tnum` | none (Latin and Cyrillic only, [Vercel](https://vercel.com/font)) |
| Source Sans 3 | 0.486 | 18.8 | 38.7 | distinct (l has a tail) | 0 narrower | tabular | via Assistant (its Hebrew sibling) |
| Noto Sans | 0.536 | 21.2 | 39.5 | distinct | close | tabular | Noto Sans Hebrew |
| Rubik | 0.520 | 21.5 | 41.3 | I = l | close | proportional; `tnum` | built in; rounded and heavy |
| Assistant | 0.500 | 18.5 | 37.0 | distinct | 0 narrower | **proportional, no `tnum`** | built in |
| Heebo | 0.528 | 20.9 | 39.5 | I = l (Roboto) | close | tabular | built in |

Width per x-height is the fair density measure: a font with bigger small letters can be set a size smaller. On that measure the candidates are within 10% of each other. Source Sans 3 and Assistant are the densest, and they look small at 12px because of their low x-height. Plex is in the middle.

Mono fonts (port names, cable IDs, U numbers, jack numbers): all three are 0.6em per character.

| Mono | x-height | 0 | I l 1 | Notes |
|---|---|---|---|---|
| **IBM Plex Mono** (today) | 0.516 | dotted by default, slashed with `zero` | distinct | Same x-height as Plex Sans, so a port name sits level with the sans text around it |
| JetBrains Mono | 0.550 | dotted | distinct | Larger-looking at 12px, but taller than the sans beside it. Its code ligatures must be turned off (`font-variant-ligatures: none`) ([JetBrains Mono](https://www.jetbrains.com/lp/mono/)) |
| Geist Mono | 0.530 | slashed | distinct | Belongs with Geist, not Plex |

### 2.2 Recommendation: keep Plex, ship IBM's own files

**Keep IBM Plex Sans + IBM Plex Sans Hebrew + IBM Plex Mono** (no change to D33). The reasons are specific to this app:

- **Hebrew sits right.** Plex Sans Hebrew was drawn for Plex Sans: x-height 0.516 and cap height 0.698 in both (read from the font files). A Hebrew name next to "EDGE-17" lines up and has the same weight. Inter or Geist would need a borrowed Hebrew font of different proportions.
- **Port names cannot be misread.** The serifed I, the flagged 1 and the dotted mono 0 separate Gi1/0/1, Te1/1/1 and "I" without any setting. Inter, Geist, Rubik and Heebo show I and l the same by default.
- **Numbers line up for free.** Plex Sans digits are all the same width, so U numbers, counts and speeds align in columns even where `.num` was forgotten.
- Carbon, IBM's design system, is tuned for Plex, so its type scale and letter-spacing can be used as they are ([Carbon type sets](https://carbondesignsystem.com/elements/typography/type-sets/)).

**One change: ship IBM's release files instead of `@fontsource`.** The `@fontsource/ibm-plex-*` 5.3.0 files the app uses today keep only `ccmp`, `dnom`, `frac`, `liga` and `numr` (checked with fontTools). IBM's release files ([IBM/plex](https://github.com/IBM/plex)) also have `zero` (slashed zero), `ss01`–`ss06` (single-storey a and g, and other alternates), `lnum`/`onum` and `case`. Today nothing needs them. The slashed zero is the one worth having available: "Slashed 0 in names" in the specimen shows it on equipment names such as "Rack Core 01" and "AGG-03", where Plex Sans's 0 and O differ only by width. I recommend shipping the files, leaving it **off**, and letting the owner decide in the specimen.

How: subset IBM's woff2 files to Latin + Hebrew with `pyftsubset --layout-features='*'`. Each weight comes to about 20 KB Latin and 5 KB Hebrew. Put them in `src/shared/fonts/` and declare them in `theme.css`. They are served by the app, so they work offline (D33: "the fonts ship with the app").

**The runner-up**, if the owner finds 12px text too small on the projector: **Inter** with `font-feature-settings: 'tnum', 'ss02', 'cv08'` and Plex Sans Hebrew for Hebrew. Its x-height is 6% larger. It costs Hebrew alignment and needs IBM's and rsms's full files ([Inter](https://rsms.me/inter/)). Google Fonts' Inter has no `ss02`/`cv08`/`zero`: I checked the served file, and it keeps only `calt`, `pnum` and `tnum`.

### 2.3 Font tokens

```css
--font-sans: 'IBM Plex Sans', 'IBM Plex Sans Hebrew', system-ui, 'Segoe UI', Arial, sans-serif;
--font-mono: 'IBM Plex Mono', ui-monospace, Consolas, monospace;
/* weights shipped: 400, 500, 600 (sans and Hebrew); 400, 500 (mono). Nothing else. */
font-synthesis: none;              /* already set: never fake a bold */
.mono { font-variant-ligatures: none; }   /* harmless for Plex; required if the mono ever changes */
```

Today `font-weight: 700` is used in six places and `650` in one (`app/styles.css:209`, `physical/physical.css:347,1050,1399`, `planning/changes.css:25`, `map/map.css:411`, `patching/patching.css:258`). With `font-synthesis: none` and no 700 file, they render as 600. Write 600.

---

## 3. Type scale

### 3.1 The roles

These build on the earlier pass's role list (`--type-page` … `--type-code`) and fill in what it left open: letter-spacing, the hardware text, the numbers and truncation. The values follow Carbon's **productive** set, which is made for dense work screens set in Plex: label-01 12/16 with +0.32px, body-compact-01 14/18 with +0.16px, heading-compact-01 14/18 at 600, and heading-03 20/28 ([Carbon type sets](https://carbondesignsystem.com/elements/typography/type-sets/)). Carbon has no 13px step. The app's tables need one, so 13/18 gets a value between Carbon's 12 and 14.

| Role | Size / line | Weight | Letter-spacing | Used for |
|---|---|---|---|---|
| `--type-page` | 20 / 28 | 600 | 0 | The page title (EDGE-17, Rack Core 01, Inventory). A Hebrew second name beside it uses 16/22 at 500 in muted text. |
| `--type-card` | 16 / 22 | 600 | 0 | Card titles on the floor (site and node cards) |
| `--type-section` | 14 / 20 | 600 | 0.01em | Dock panel and card section headings (Connects to, Port details) |
| `--type-body` | 14 / 20 | 400 | 0.01em | Forms, dock text, confirms |
| `--type-dense` | 13 / 18 | 400 | 0.015em | Table rows, tree cards, meta lines |
| `--type-label` | 12 / 16 | 500 | 0.025em | Field labels, column heads, chips, small buttons |
| `--type-small` | 12 / 16 | 400 | 0.025em | Breadcrumb, hints, legend, counts |
| `--type-code` | 13 / 18 mono | 400 | 0 | Port names and cable IDs in tables and cards |
| `--type-code-sm` | 12 / 16 mono | 400 | 0 | Cable IDs on drawings (the path card, the Trace page) |
| `--type-tape` | 12 / 16 | 500 | 0.02em | Label strips on hardware (names can be Hebrew, so sans, not mono) |
| `--type-unit` | 12 mono | 400 | 0 | U numbers (every fifth in `--steel-8`) |
| `--type-jack` | `clamp(11px, var(--j) * 0.32, 16px)` mono | 500 | 0 | Jack numbers. Capped at 16px so the numbers on a 56px jack (21px today) are never bigger than the page title. **11px is used only here** (D33). |

**⚑ touches D33.** D33 lists the scale 12/13/14/16/20/26. The only use of `--t-2xl` (26px) outside `theme.css` is one rule. One title size (20) per page is the point of "One look on every page", so I propose to drop 26. `--t-min` (11px) is used 25 times outside the jacks (map, paths, physical, patching, trace, models). Those become 12px.

**Letter-spacing in plain words:** small text gets a hair of extra space between letters, because at 12px Plex's letters crowd. From 16px up it gets none. The earlier pass suggested −0.01em on titles. Carbon uses 0 at 20px with Plex, so I propose 0.

**Line heights** are fixed pixel values (multiples of 2), not ratios, so a 13px row of table text is always exactly 18px and rows line up on a 4px grid.

### 3.2 Numbers

- **Tabular figures:** Plex Sans digits are already the same width (§2.1). Keep the `.num` class anyway (it sets `font-variant-numeric: tabular-nums`) on every column of numbers. It is free with Plex and protects the layout if the font ever changes.
- **Alignment:** counts, speeds, U numbers and sizes are right-aligned in tables. Port numbers in a port list are left-aligned, because they are names ("Gi1/0/49"), not quantities.
- **Grouping:** thousands get a comma (1,024 and 10,000), using `toLocaleString('en-US')`, as the UI is English.
- **Speed:** show "1 G" and "10 G" in the details, and the raw Mb/s in tables with a "Mb/s" column head.

### 3.3 Truncation

- **One line, end ellipsis** for names in tables, cards, tape strips and the rack. The full name goes in a `title` and in the inspector.
- **Hebrew needs one extra rule**, found while building the specimen: the element that truncates must be the `<bdi>` itself, with `dir="auto"` and `display: block; overflow: hidden; text-overflow: ellipsis; text-align: left`. If the ellipsis is on a parent, `dir="auto"` on the parent does not see inside the `bdi`, because isolated content is skipped. The parent stays LTR, and a Hebrew name then loses its **beginning**, not its end. The specimen's jack card shows the right way ("Description").
- **Never truncate** port names, U numbers, counts or cable IDs. Give their column a minimum width instead.
- **Location paths** (Site › Node › Rack) shrink the middle pieces first and keep the site and the rack whole. Each piece is its own `bdi`, as today (`PlacePath`).
- **Wrap, don't truncate,** in the dock's details, in sentences and in confirms (`text-wrap: pretty` for paragraphs, `balance` for headings, as today).

---

## 4. Colour

All values below are in the specimen's section 4 with live contrast numbers.

### 4.1 Neutral greys: 12 steps, each defined by its contrast

The earlier pass named the jobs (Radix-style, [Radix scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)). Here each step is **solved for a target contrast against white**, with a small tint of the ink's hue (OKLCH hue 250, chroma 0.003–0.034). Each grey's ratio is therefore known by construction. Today's values are almost exactly on the ramp: floor `#eef1f3` ≈ g3, rule `#d3dae1` ≈ g6, ink-soft `#56636f` ≈ g11, ink = g12. So the change is invisible where it should be.

| Step | Hex | On white | On floor (g3) | Job |
|---|---|---|---|---|
| g1 | `#f9fbfc` | 1.04 | 1.08 | sunk: table heads, wells |
| g2 | `#f4f7f9` | 1.08 | 1.05 | hover fill |
| g3 | `#eff2f4` | 1.12 | 1.00 | page floor |
| g4 | `#e7eaef` | 1.21 | 1.07 | pressed fill, subtle dividers |
| g5 | `#dee3e8` | 1.29 | 1.15 | quiet fills, disabled primary |
| g6 | `#d1d7dd` | 1.45 | 1.29 | borders of cards and controls |
| g7 | `#bdc5cd` | 1.75 | 1.55 | strong border (hover) |
| g8 | `#a7afb9` | 2.22 | 1.97 | disabled text (exempt from contrast), scrollbar thumb |
| g9 | `#87919c` | **3.20** | 2.85 | field borders, "free" ring. Meets WCAG 1.4.11's 3:1 for a field's edge ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)) |
| g10 | `#6c7782` | **4.57** | 4.06 | faint text: dimmed cards, hints. Passes 4.5 on white and on sunk; on the floor use g11 |
| g11 | `#57626f` | **6.21** | 5.52 | muted text, icons |
| g12 | `#1c2b3a` | **14.4** | 12.8 | text, ink, primary buttons, selection |

**Steel** (racks, faceplates and HDFs only; today's five near-identical greys become one ordered scale):

| Step | Hex | On the plate (steel-1) | Job |
|---|---|---|---|
| steel-0 | `#11171e` | 1.20 | rail notches |
| steel-1 | `#1f2731` | 1.00 | the plate |
| steel-2 | `#2a3440` | 1.19 | a block |
| steel-3 | `#36414d` | 1.45 | free-slot lines, plate edge |
| steel-4 | `#4b5765` | 2.05 | block edge, scrollbar thumb |
| steel-5 | `#7d8a98` | 4.28 | block hover edge, passive stripe |
| steel-6 | `#8d9aa8` | 5.26 | U numbers |
| steel-7 | `#a8b4c0` | 7.15 | secondary text on steel ("3U free") |
| steel-8 | `#c3ccd6` | 9.28 | every fifth U, column letters |

`--steel-ink-soft`, `--steel-port` and `--steel-free` (today's `#8d9aa8`, `#8795a3`, `#6f7c8a`) fold into steel-5 and steel-6. `#6f7c8a` is 3.54:1, too low for the 11–12px "Available" text it carries.

### 4.2 State colours

Each state has a **solid** (lines, fills, dots), a **text** colour (4.5:1 or more on white and on its soft background) and a **soft** background.

| State | Solid | Text | Soft | Checked ratios |
|---|---|---|---|---|
| **Route** (Trace, the selected path) | `#0b8272` (was `#0f8b7a`) | `#0b7666` | `#e2f3f0` | white number on a route jack 4.72 (was 4.20); text on soft 4.82; line on floor 4.20 |
| **Highlight / problem** (amber) | `#d99a0b` fill, `#c98701` **edge** | `#7a5200` | `#fdf3dc` | edge on white 3.02 (the fill alone is 2.45); text on soft 6.27; halo on steel 7.98 |
| **Danger / faulty / delete** | `#b4361f` | `#b4361f` | `#fbeae6` | on white 6.02; on soft 5.16; white on the button 6.02 |
| **Proposed / plan** | `#8a6100`, always dashed | `#8a6100` | `#fff6dd`; band `#fcf4de`, edge `#ead6a0` | on soft 5.14; ink on the band 13.1; dash on steel `#e3b84d` 8.06 |
| **Success** (messages and toasts only, never on hardware or the map) | `#276f3c` | `#276f3c` | `#e6f4ea` | on white 6.13; on soft 5.40 |
| **Selection** (ink, D33) | `#1c2b3a` | — | `#e8eef5` | ink on selected 12.3; focus ring on floor 12.8 |
| **Free** (a jack on steel) | socket `#e8ecf0` | `#2a3440` number | — | socket on steel 12.7; number 10.6 |
| **Used** | the network colour on hardware; a filled ink dot with the word "Used" on paper (D37) | | | |
| **Unresolved network** | `#9bacc0`, dashed on paper | — | — | on steel 6.50; on paper only as a dashed line, never text |

Rules of use:

- **Amber outlines use the edge colour**, not the fill. A 2px `#d99a0b` outline on white is 2.45:1 and disappears on a projector (try "Projector wash-out" in the specimen).
- **One warning text colour** (`#7a5200`) replaces `--amber-ink`, `--env-ink` and `--warn-ink` (the earlier pass found these three; this fixes the value).
- **Success is never green on hardware.** Green is a network colour (§4.3). On a jack it would read as "a network". Under deuteranopia, success green and danger red also look alike, so a success message always carries its ✓ and a word.

### 4.3 Network colours: the default sequence

**The constraint that sets everything.** A cabled jack shows its **number in white on the network colour**, at 11–16px. That needs 4.5:1, so the colour's luminance must be at most 0.183. The jack also sits on the steel plate (`#1f2731`) and must stand out from it by 3:1 (WCAG 1.4.11), so the luminance must be at least 0.159. Between those two limits only a **narrow band of brightness** works. That is the real reason for "equal lightness", not only looks. Today, magenta `#c0306b` is 2.78:1 on steel, and olive and orange are near the edges of the band.

The second constraint is that **four hues are taken by states**: red (danger), amber and brown (highlight, proposed) and teal (route). A network in one of those hues can be read as that state.

At a fixed brightness, only hue and saturation can separate colours. On the colour wheel that leaves room for about **six clearly different colours** (pairwise ΔE ≥ 8). A seventh at the same brightness is always close to one of them; I measured this with a search over the whole wheel. So the sequence has three rows:

| # | Name | Hex | Number | Number contrast | On steel | Nearest network (ΔE) | Nearest state (ΔE) |
|---|---|---|---|---|---|---|---|
| 1 | Blue | `#2f6fdb` (today's, kept) | white | 4.75 | 3.17 | Cerulean 8.0 | route 18.9 |
| 2 | Green | `#288520` | white | 4.70 | 3.21 | Lime 19.7 | success 8.1 (route 12.2) |
| 3 | Magenta | `#c33e94` | white | 4.73 | 3.19 | Orchid 8.6 | danger 15.9 |
| 4 | Violet | `#7f5bdd` | white | 4.73 | 3.19 | Orchid 8.3 | unresolved 23.1 |
| 5 | Cerulean | `#017ab0` | white | 4.76 | 3.17 | Blue 8.0 | route 10.9 |
| 6 | Orchid | `#a252b9` | white | 4.73 | 3.19 | Violet 8.3 | danger 21.2 |
| 7 | Sky | `#67b4f4` | ink | 6.46 | 6.76 | Lilac 12.1 | unresolved 8.7 |
| 8 | Lime | `#86bd52` | ink | 6.47 | 6.76 | Green 19.7 | highlight 13.4 |
| 9 | Pink | `#f38fb7` | ink | 6.47 | 6.77 | Lilac 10.6 | unresolved 14.4 |
| 10 | Lilac | `#c39def` | ink | 6.45 | 6.74 | Pink 10.6 | unresolved 10.6 |
| 11 | Indigo | `#373ba7` | white | 8.95 | 1.68 (needs the jack edge) | Blue 14.7 | ink 19.6 |
| 12 | Wine | `#85204a` | white | 9.12 | 1.65 (needs the jack edge) | Magenta 17.3 | danger 13.2 |

- **Rows:** 1–6 are equal in brightness with white numbers. 7–10 are a light row with ink numbers. Its brightness differs from the first row, and brightness is the one thing colour-blind eyes still see, so 7–10 stay apart from 1–6 under every simulation. 11–12 are a deep row. On steel they rely on the jack's 1px light inner edge (the earlier pass's "socket lip"), which then carries the 3:1.
- **Every pair is at least ΔE 8.0 apart.** Today's six have a minimum of 7.1, and a minimum of 6.7 against a state colour.
- **Order:** the first networks get the colours that are most different from each other (blue, green, magenta, violet). Blue stays first, so Network A keeps its colour.
- **Number colour is computed**, not stored: white or ink (`#1c2b3a`), whichever has the higher contrast. The same rule handles any colour the owner picks.

### 4.4 The "too close" warning (roadmap item C)

When the owner picks a colour for a network:

1. Compute ΔE (OKLab × 100) to every other network's colour. **Under 8:** "Very close to *Network B*."
2. Compute ΔE to each state colour: route `#0b8272`, highlight `#d99a0b`, proposed `#8a6100`, danger `#b4361f`, success `#276f3c`, unresolved `#9bacc0`, free socket `#e8ecf0`, ink `#1c2b3a`. **Under 10:** "Looks like the *route* colour; people may read it as that state."
3. Choose the number colour (white or ink, the higher contrast). **If even the better one is under 4.5:1:** "Jack numbers will be hard to read on it."

All three are warnings, never refusals (as the roadmap says). The thresholds have reasons. One unit of ΔE in OKLab is a difference you can just see between two large patches side by side. Szafir's studies show that small marks (8px dots, 2px lines, a jack among 47 others) need several times that before people tell them apart reliably ([Szafir 2018, Modeling Color Difference for Visualization Design](https://cmci.colorado.edu/visualab/VisColors/)). 8 between networks and 10 against states (where a mistake changes the meaning) are conservative, and the default 12 pass both. The specimen's checker runs exactly this rule. The code is about 30 lines (OKLab conversion and contrast) and can live in `features/networks/model.ts` with unit tests.

**Moving to the new defaults without changing anyone's colours (avoids ⚑ D27).** D27 says colours follow creation order, so a rename never changes a colour. When item C adds a stored colour per network, the migration should store each existing network's **current** colour. The new sequence then applies only to networks created afterwards, and nothing on screen changes on upgrade. If the owner would rather re-colour the existing networks 2–6 to the new defaults (today's orange and olive look like states), that is one decision for the owner, and it **⚑ touches D27**.

### 4.5 Colour blindness

About 1 in 12 men has red-green colour blindness. I simulated deuteranopia, protanopia and tritanopia (Machado 2009) on every colour. Try the specimen's "Colour vision" menu on section 1.

- **States stay apart, because each has a shape:** faulty has its hatch and the word (D37), proposed its dashes, the highlight its outline, selection its ring. These must stay. Colour is the second signal, never the only one.
- **The route is the weak spot.** Under deuteranopia, route teal and a magenta network are both a middle grey (ΔE 5.1 after simulation). **Recommendation:** route jacks also get a 2px white bar near their bottom edge (in the specimen). It is visible on any colour and costs nothing.
- **Networks of the same row merge** (blue/violet ΔE 1.6, cerulean/orchid 3.2 after simulation). No equal-brightness palette avoids that. The fix is the network name: in the faceplate legend (already there), in the jack card and in Inventory (already a dot plus the name). Where only one network is shown (the tree shows one network at a time, D40), there is nothing to confuse.
- **Greyscale and print** ("Greyscale / print" in the specimen): rows 1–6 become one grey, which is why printed sheets (labels, the walk sheet) must always carry the network name in text.

### 4.6 Dark mode: not now

**Recommendation: do not build a dark theme now.** Keep the tokens semantic (as above), so one can be added later by redefining about 40 values.

- **Reading:** "in users with normal vision, light mode leads to better performance most of the time", and the advantage grows as text gets smaller ([NN/g, Dark mode vs. light mode](https://www.nngroup.com/articles/dark-mode/), citing Piepenbrock et al. 2013). This app is mostly 12–13px text.
- **Projectors:** in a lit room a projector cannot make black, so dark backgrounds become grey and coloured text washes out. Dark text on a light background keeps more of its contrast.
- **D33's idea is paper and steel.** The hardware is already dark on purpose. In a dark theme the steel drawings lose their frame (try "Dark preview" in the specimen: the faceplate no longer stands out). Making them stand out again means redrawing every rack and faceplate.
- **All-day use:** the real comfort issue is glare, which is better solved by the light grey floor (g3) and white cards that are not too large. Both are already in place.

If a dark theme is ever needed (night shifts, a staff request), the specimen's dark preview is a rough start. Every alias must be declared again inside the dark block, because CSS custom properties that refer to other variables are resolved where they are declared. I hit this while building the preview.

### 4.7 Colour tokens (proposed `theme.css`)

```css
/* Neutrals: each step solved for its contrast against white. */
--g1:#f9fbfc; --g2:#f4f7f9; --g3:#eff2f4; --g4:#e7eaef; --g5:#dee3e8; --g6:#d1d7dd;
--g7:#bdc5cd; --g8:#a7afb9; --g9:#87919c; --g10:#6c7782; --g11:#57626f; --g12:#1c2b3a;

--surface:#ffffff;            --surface-page:var(--g3);    --surface-sunk:var(--g1);
--surface-hover:var(--g2);    --surface-pressed:var(--g4); --surface-selected:#e8eef5;
--border-subtle:var(--g4);    --border:var(--g6);          --border-strong:var(--g7);
--border-field:var(--g9);
--text:var(--g12);            --text-muted:var(--g11);     --text-faint:var(--g10);
--text-disabled:var(--g8);    --ink-hover:#2b3d50;         --ink-pressed:#13202c;

/* Steel: racks, faceplates, HDFs only. */
--steel-0:#11171e; --steel-1:#1f2731; --steel-2:#2a3440; --steel-3:#36414d; --steel-4:#4b5765;
--steel-5:#7d8a98; --steel-6:#8d9aa8; --steel-7:#a8b4c0; --steel-8:#c3ccd6;
--tape:#fbfbf8; --tape-ink:#15202b; --socket:#e8ecf0; --socket-ink:#2a3440;

/* States. */
--route:#0b8272;      --route-text:#0b7666;      --route-soft:#e2f3f0;
--highlight:#d99a0b;  --highlight-edge:#c98701;  --highlight-soft:#fdf3dc;  --warn-text:#7a5200;
--danger:#b4361f;     --danger-soft:#fbeae6;
--proposed:#8a6100;   --proposed-soft:#fff6dd;   --proposed-on-steel:#e3b84d;
--plan-band:#fcf4de;  --plan-edge:#ead6a0;
--success:#276f3c;    --success-soft:#e6f4ea;
--unresolved:#9bacc0;

/* Networks: defaults for new networks, in creation order (D27). Numbers: white or ink, computed. */
--net-1:#2f6fdb; --net-2:#288520; --net-3:#c33e94; --net-4:#7f5bdd; --net-5:#017ab0; --net-6:#a252b9;
--net-7:#67b4f4; --net-8:#86bd52; --net-9:#f38fb7; --net-10:#c39def; --net-11:#373ba7; --net-12:#85204a;
```

`networkColors.ts` keeps the list (TypeScript needs the values for React Flow edges and canvas export). `theme.test.ts` can check that the TypeScript list and the CSS tokens are the same, and that every default passes the §4.4 rule.

---

## 5. The other small things

### 5.1 Borders, shadows and elevation

The rule: **a border first; a shadow only for what floats**, and a shadow always comes with a 1px border. A shadow alone vanishes on a projector. This is D33's "shadows only on floating things", made exact. The earlier pass proposed three shadows. This adds the level-0 rule and the dialog's scrim.

| Level | What | Value |
|---|---|---|
| 0 flat | cards, panels, tables, the dock | `1px solid var(--border)`, no shadow |
| 1 raised | a card being dragged, a sticky table head once scrolled | `--shadow-1: 0 1px 2px #1c2b3a14` |
| 2 overlay | menus, popovers, tooltips, toasts, map controls | `--shadow-2: 0 4px 12px -2px #1c2b3a29` |
| 3 dialog | the patching screen's confirm, any modal | `--shadow-3: 0 16px 40px -12px #1c2b3a47`, with the scrim `#1c2b3a66` behind |

Atlassian builds elevation the same way: a surface colour plus its matching shadow ([Atlassian, Elevation](https://atlassian.design/foundations/elevation)).

### 5.2 Corner radius

The earlier pass's scale stands: `--r-hw: 2px` (jacks, tape strips), `--r-sm: 4px` (tags, tooltips, segmented buttons), `--r-md: 6px` (controls), `--r-lg: 8px` (cards), `--r-xl: 12px` (drawers, dialogs), `--r-pill: 999px` (chips, badges). Two additions:

- **Nested corners:** an inner element's radius = outer radius − the padding between them, with 2px as the floor. A segmented control (6px) with 2px padding has 4px buttons, as today.
- **Focus rings follow the radius by themselves.** `outline` follows `border-radius` in Chrome, Edge, Firefox and Safari 16.4+, so no box-shadow tricks are needed.

### 5.3 Focus ring

| Where | Value | Contrast |
|---|---|---|
| On paper | `outline: 2px solid var(--g12); outline-offset: 2px` (today's, kept) | 12.8:1 on the floor |
| Fields | `outline: 2px solid var(--g12); outline-offset: 0;` and the border turns ink | |
| Rows in a table | `outline: 2px solid var(--g12); outline-offset: -2px` (inside the row, so it is not clipped by the scroller) | |
| On steel (jacks, rack blocks) | `outline: 2px solid #ffffff; outline-offset: 2px` | 15:1 on the plate |
| A selected jack | the earlier pass's ring outside the jack (`0 0 0 2px steel, 0 0 0 4px #fff`), so the fill still shows the state | |

A 2px solid ring outside the control is the simplest way to meet WCAG 2.4.13 Focus Appearance (AAA): at least a 2px perimeter, with 3:1 between the focused and unfocused states ([W3C, Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)). Never `outline: none` without a replacement; the CSS has seven `outline: none` today. Check that each one is followed by a border or ring change.

### 5.4 Hover, pressed, selected, disabled

The specimen's section 5 draws every cell of this table.

| Kind | Rest | Hover | Pressed | Selected (`aria-pressed`) | Disabled |
|---|---|---|---|---|---|
| Outlined | white, border g6 | fill g2, border g7 | fill g4, border g7 | fill `#e8eef5`, border ink | text g8, border g4, `cursor: not-allowed` |
| Primary (ink) | `#1c2b3a`, white text | `#2b3d50` | `#13202c` | — | fill g5, text g9 |
| Quiet | no fill, text g11 | fill g2, text ink | fill g4, text ink | — | text g8 |
| Danger | `#b4361f`, white | `#9e2f1b` | `#862716` | — | fill g5, text g9 |
| Table row | white | g2 | — | `#e8eef5` plus a 2px ink bar on the left (`inset 2px 0 0 var(--g12)`) | — |
| Tree card | white, border g6 | border g7 | — | 2px ink border | dimmed: text g10, border g4 (never opacity) |

- **Disabled is drawn with colours, never `opacity`.** Opacity makes text blurry on the dotted floor and lets the background show through. Disabled text may be under 4.5:1 (WCAG exempts it), but where a command cannot apply, the design review's advice (hide it, or say why) comes first.
- **Hover changes in 80ms** (`--dur-instant`). Pressed is instant. No movement, scale or shadow on press.

### 5.5 Icons (lucide)

The earlier pass set "lucide only, 16px at stroke 1.75, 14px in rows". Today the code uses **eight sizes** (12, 13, 14, 15, 16, 17, 18, 21) and one stroke override (1.4). Here is the full rule. Lucide draws on a 24px grid with a 2px round stroke ([Lucide, design guide](https://lucide.dev/guide/design/icon-design-guide)), so the drawn line is `size / 24 × strokeWidth`. Pick the stroke so that the line matches the stems of the text beside it, about 1.0–1.25px for Plex at 12–14px:

| Size | Stroke | Drawn line | Where |
|---|---|---|---|
| 12 | 2 | 1.00px | in chips and badges, inline warning marks |
| 14 | 2 | 1.17px | table rows, tree cards, the dock's lists |
| 16 | 1.75 | 1.17px | buttons and controls (header, toolbar, dock) |
| 20 | 1.5 | 1.25px | the rail, empty states |

Icons take `currentColor` (so they follow hover and disabled), sit 6px from their text, and are centred with flex, never with a baseline nudge. The ↑ uplink mark on a jack is a 9px `arrow-up` at stroke 3 in a 13px white circle, so it reads on any network colour (specimen).

### 5.6 Dividers

- Inside a card: `1px solid var(--border-subtle)` (g4).
- Between regions (header, rail, dock, table head): `1px solid var(--border)` (g6).
- Tables: horizontal lines only. No vertical lines, except the right edge of a frozen first column.
- Never two lines touching (a card border against a divider). Never an `<hr>` with a shadow.

### 5.7 Scrollbars

```css
.scroll         { scrollbar-width: thin; scrollbar-color: var(--g8) transparent; scrollbar-gutter: stable; }
.scroll.on-steel{ scrollbar-color: var(--steel-4) var(--steel-1); }
```

`scrollbar-color` and `scrollbar-width` are standard and work in Chrome 121+, Edge and Firefox ([MDN, scrollbar-color](https://developer.mozilla.org/en-US/docs/Web/CSS/scrollbar-color)), so the `::-webkit-scrollbar` rules in `physical.css:1189-1200` can go. `scrollbar-gutter: stable` keeps the content from jumping when a bar appears (already used in two places; use it in the dock and every table). Keep the HDF's always-visible bar: it tells the user that columns C–D are further along.

### 5.8 Tooltips

- Ink background, white 12/16 text at +0.025em, `padding: 4px 8px`, `--r-sm`, `--shadow-2`, `max-width: 280px` (wrapping is allowed), 8px from the target.
- They appear **after 400ms** on hover and **at once** on keyboard focus. They stay while the pointer is over the tooltip, and Escape closes them, as WCAG 1.4.13 requires ([W3C, Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)). They fade in over 120ms.
- **A tooltip only repeats.** Anything that matters is also on the screen or in the inspector (design review §1, item 8).

### 5.9 Chips and badges

- **Chip** (the earlier `.chip`, kept): 22px high, 12/16 at 500, 8px side padding, pill radius. The state chips use the §4.2 triples: route (border solid, soft fill, route text), warning (amber edge, amber soft, warn text, ⚠ icon), danger (◆ and "Faulty"), proposed (dashed), success (✓). A network chip is an 8px dot and the name in ink.
- **Count badge:** 18px high, at least 18px wide, `padding: 0 5px`, 12px at 500 with tabular digits, pill. Neutral is g4 with ink text; warning is amber soft with a 1px amber edge and warn text. Counts over 999 show "999+".

### 5.10 Motion

| Token | Value | Used for |
|---|---|---|
| `--dur-instant` | 80ms | hover and selected colours |
| `--dur-fast` | 120ms | tooltips, small reveals, a menu closing |
| `--dur-base` | 160ms | menus and popovers opening |
| `--dur-slow` | 240ms | the dock opening and closing, the plan band's colour |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0.38, 0.9)` | anything that changes in place |
| `--ease-enter` | `cubic-bezier(0, 0, 0.38, 0.9)` | things appearing (decelerate) |
| `--ease-exit` | `cubic-bezier(0.2, 0, 1, 0.9)` | things leaving (accelerate) |

The durations and curves are Carbon's productive motion (70/110/150/240ms, rounded to a 40ms step) ([Carbon, Motion](https://carbondesignsystem.com/elements/motion/overview/)). Nothing in the app needs more than 240ms. The map's pan when a selection moves off screen keeps React Flow's own duration, at most 300ms.

**Reduced motion:** today's rule (`theme.css:170-175`) sets every transition and animation to none, which is right and stays. Add one thing: the map's pan must also jump. React Flow's `duration` is passed from JavaScript, so read `matchMedia('(prefers-reduced-motion: reduce)')` once and pass `duration: 0` ([MDN, prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)).

### 5.11 Cursors

| Target | Cursor |
|---|---|
| Jacks, rows that open something, links, buttons | `pointer` (today) |
| A node card on the site screen (draggable) | `grab`; while dragging, `grabbing` **on the whole page** (`html`), so it does not flicker when the pointer leaves the card |
| A free rack slot while adding from the library | `copy` |
| A slot or target that does not fit | `no-drop` |
| A disabled control | `not-allowed` |
| A column edge in Inventory | `col-resize` |
| The tree's canvas | `default`; `grabbing` only while panning (the tree is never dragged, D40) |
| Text in tables and the dock | `auto` (text can be selected and copied) |

Values from [MDN, cursor](https://developer.mozilla.org/en-US/docs/Web/CSS/cursor). Today `cursor: help` is used once; replace it with a tooltip.

### 5.12 The rest of the tokens

```css
--shadow-1: 0 1px 2px #1c2b3a14;
--shadow-2: 0 4px 12px -2px #1c2b3a29;
--shadow-3: 0 16px 40px -12px #1c2b3a47;
--scrim: #1c2b3a66;

--r-hw: 2px; --r-sm: 4px; --r-md: 6px; --r-lg: 8px; --r-xl: 12px; --r-pill: 999px;

--focus: var(--g12); --focus-on-steel: #ffffff; --focus-width: 2px; --focus-offset: 2px;

--icon-xs: 12px; --icon-sm: 14px; --icon-md: 16px; --icon-lg: 20px;   /* strokes 2 · 2 · 1.75 · 1.5 */

--dur-instant: 80ms; --dur-fast: 120ms; --dur-base: 160ms; --dur-slow: 240ms;
--ease-standard: cubic-bezier(0.2, 0, 0.38, 0.9);
--ease-enter: cubic-bezier(0, 0, 0.38, 0.9);
--ease-exit: cubic-bezier(0.2, 0, 1, 0.9);
--tooltip-delay: 400ms;
```

---

## 6. What this does not change

- Paper and steel, ink for selection, colour only where it means something, sentence case, isolated names (D33). IBM Plex (D33). Networks by creation order (D27).
- The earlier pass's spacing scale, quieter faceplates, icon language and empty states. This file only gives them exact values.
- Layouts (D43, D49, D50).

**Flags in this file:** ⚑ touches D33 (26px leaves the type scale, §3.1). ⚑ touches D27 only if the owner chooses to re-colour existing networks (§4.4).

## 7. Sources

- IBM Plex (families, licence, release files): https://github.com/IBM/plex
- IBM Carbon, Type sets (productive scale and letter-spacing): https://carbondesignsystem.com/elements/typography/type-sets/
- IBM Carbon, Motion (durations and easing): https://carbondesignsystem.com/elements/motion/overview/
- Inter (features `tnum`, `zero`, `ss02`, `cv05`, `cv08`; licence): https://rsms.me/inter/
- Vercel, Geist font (scripts, licence): https://vercel.com/font
- JetBrains Mono: https://www.jetbrains.com/lp/mono/
- Google Fonts, the other candidates: https://fonts.google.com/specimen/Source+Sans+3 · https://fonts.google.com/noto/specimen/Noto+Sans+Hebrew · https://fonts.google.com/specimen/Rubik · https://fonts.google.com/specimen/Assistant · https://fonts.google.com/specimen/Heebo
- Lucide, Icon design guide (24px grid, 2px stroke): https://lucide.dev/guide/design/icon-design-guide
- Björn Ottosson, A perceptual color space for image processing (OKLab): https://bottosson.github.io/posts/oklab/
- Machado, Oliveira, Fernandes 2009, A physiologically-based model for simulation of color vision deficiency: https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
- Szafir 2018, Modeling Color Difference for Visualization Design (IEEE TVCG): https://cmci.colorado.edu/visualab/VisColors/
- NN/g, Dark Mode vs. Light Mode: Which Is Better?: https://www.nngroup.com/articles/dark-mode/
- W3C, Understanding 1.4.11 Non-text Contrast: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- W3C, Understanding 1.4.13 Content on Hover or Focus: https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html
- W3C, Understanding 2.4.13 Focus Appearance: https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
- Radix Colors, Understanding the scale: https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- Atlassian, Elevation: https://atlassian.design/foundations/elevation
- MDN, scrollbar-color: https://developer.mozilla.org/en-US/docs/Web/CSS/scrollbar-color
- MDN, prefers-reduced-motion: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
- MDN, cursor: https://developer.mozilla.org/en-US/docs/Web/CSS/cursor
