# UI look research, 2026-11-25

A read-only study of the app's **look**: layout, type, colour, spacing, surfaces, icons and the hardware drawings. The usability and accessibility review of the same day ([design-review-2026-11-25.md](design-review-2026-11-25.md)) is not repeated here. Where the two meet (contrast, 11px text), this file only adds the visual side. Nothing here is decided. Anything that touches a locked decision is marked **⚑ touches Dxx**.

The before/after demo is [demos/ui-refresh-demo.html](demos/ui-refresh-demo.html). It shows the equipment page with the rack level, the tree, and the Inventory table, each in today's style and in the proposed style, using the same fictional data. Only the look changes. Every behaviour, label and layout rule stays.

**How this was seen.** Real screenshots of the running app (acceptance fixture, `cmd/testserver` + Vite, Chromium) at 1536×864 and 1920×1080: the tree, a selection, the inspector, the Trace page, Sites, a site, a node, the rack level, the equipment page with a jack and its path, an HDF, Inventory, and a plan with Changes (Conceptual and Physical). They were kept outside the repo, in the session's scratch folder `ui-research/shots/` (names below such as **S-12** mean `1536-12-equipment-jack.png`). The code was read for every claim with a file:line, under `frontend/src/`.

Effort: S = up to half a day, M = one to three days, L = more.

---

## 1. Summary: the visual changes with the most impact, ranked

| # | Change | What you will notice | Effort |
|---|---|---|---|
| 1 | **Quieter faceplates.** Free jacks become a soft "unlit socket" grey with a thin inset edge, not glaring white tiles. Cabled jacks keep their network colour. Numbers drop from bold-looking to medium weight. A selected jack gets a white ring outside the jack, not a box inside it. | The equipment page is the screen used most. Today a 24-port switch reads like a calculator keypad of 48 bright tiles (S-10, S-12). The proposed face looks like hardware and the few cabled ports stand out. | S **⚑ touches D33** (ui-spec: "free endpoints are white") |
| 2 | **One spacing scale and one radius scale in `theme.css`.** Spacing 4·8·12·16·24·32, radii 4 (hardware chips) · 6 (controls) · 8 (cards) · 12 (drawers). | The CSS uses **26 different spacing values** (1, 2, 3, 5, 7, 9, 11, 13, 15, 19, 25px…) and **9 radii**, mostly typed in by hand. Cards, gaps and paddings drift by a pixel or two from screen to screen. One rhythm makes everything line up and look "designed". | M |
| 3 | **Semantic colour tokens and a calmer neutral ramp.** Name colours by job (`--surface`, `--surface-sunk`, `--border`, `--border-strong`, `--text`, `--text-muted`, `--state-route`, `--state-warn`…), add a `--text-faint` that still passes 4.5:1, and move the network palette into the theme, tuned to equal lightness. | Fewer near-duplicate greys (`--amber-ink`, `--env-ink`, `--warn-ink` are three names for nearly one colour). Networks look equally strong, so no network seems more important. It is also the ground work for a dark theme later. | M |
| 4 | **The tree fills its page and reads as columns.** Column heads become a sticky strip at the top with lanes behind each column. The "Network A" panel becomes a slim toolbar on the same strip. Cards are 36px tall with the role chip on the right. Lines are 1.5px with rounded corners. A selection dims by colour (grey text, pale border), not by opacity. | Today the small fixture's tree sits as a thin island in the middle of an empty dotted floor, with an unrelated panel at the top left (S-01). Real campus trees are larger, but the heads at 11px and the floating panel make the screen look unfinished at every size. | M |
| 5 | **A page heading pattern for every page.** One line: title (20/600), a quiet meta line (13, muted), the actions on the right. The breadcrumb moves above in 12px. | Today the equipment page has no title: its name is only inside the breadcrumb, between ‹ PANEL-A and UPS-A03 › (S-12). Sites, nodes and Inventory each place the title differently. One pattern makes every screen feel like the same app. | S–M |
| 6 | **Calmer Inventory table.** Names in ink without underline (underline on hover), sort arrows only on the sorted column (others on hover), 13px rows of 36px, numbers right-aligned in tabular figures, a bigger network dot (8px) and a stronger header band. Commands that cannot apply are hidden, not grey (see the design review §7.4). | Today every row has an underlined link and every header has ↑↓ marks, so the eye has nowhere to rest (S-14). Carbon and Primer tables put the weight on the data. | S |
| 7 | **Trace drawing: lighter frames, fewer outlines.** The node frames become a soft tint with no dashed border, the cables 2px in their network colour, and the "every route passes this" amber outline 2px on the shared plates only, with a small amber tag "on all 3 routes". | Today All routes draws amber boxes around nearly every plate, so the amber means little (S-04). | S |
| 8 | **One icon language.** Use lucide (already a dependency) for every icon, at 16px with a 1.75 stroke in controls and 14px in dense rows. Replace the text glyphs (`⚠` from CSS, `↑`, `▾`, `›`) with lucide icons of the same meaning. | Text glyphs come from the font and look different from the lucide icons beside them (the ⚠ in "no BB" vs the rail icons). Same size and stroke everywhere reads as one product. | S |
| 9 | **Empty states with a shape.** One small pattern: a 20px muted icon, one line of text, the action. Used for "Select a jack on the face…", "Select a cabled jack…", an empty dock tab, "None yet" in Saved views and an empty node. | Today these are plain lines or dashed boxes in different styles (S-10, S-12, S-14). | S |
| 10 | **Mini racks you can read.** The node level's rack previews show block names on their tape strips and a U scale tick every 5U, on the same steel as the big rack. | Today they are dark boxes with a few grey lines (S-08); you cannot tell a switch from a shelf. | S–M (with the design review's §4.1 fix) |

Also cheap: a single **header** tidy-up (controls all 32px high, the network select drawn like the other controls, a thin brand mark), and **one shadow scale** of three steps (see §5).

---

## 2. Overall frame (header, rail, dock, page)

**What I saw.** The 44px header, the 48px rail and the right dock are well proportioned and calm (S-01, S-03). Three things look unfinished:

- The header mixes three control styles: a segmented control (Conceptual · Physical · Inventory), a native `<select>` with the browser's own arrow (Network), and a framed pair (Installed · Plan). They are 32, 30 and 32px high (S-01).
- The rail icons sit alone with no active state except the inspector's dark square (S-03), which is the heaviest thing on the screen.
- Physical's pages leave a large empty area on the right at 1920 wide: the Sites grid stops at 3 × 300px (S-06, 1920-06), and the node level's three mini racks take the left third (S-08).

**What good tools do.** Linear's 2024 redesign aimed to "reduce visual noise" and to align "labels, icons, and buttons in the sidebar and tabs … vertically and horizontally", and it limited coloured chrome to get "a more neutral and timeless appearance" ([Linear, How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui)). Figma's UI3 put the canvas first and made the panels quiet ([Figma, Behind our redesign](https://www.figma.com/blog/behind-our-redesign-ui3/)). Vercel's Geist uses one control height per size and one neutral scale for all chrome ([Vercel Geist, Colors](https://vercel.com/geist/colors)).

**Proposed change.**

- Every header control is `--h-control` (32px). The network choice is drawn like a `.btn` with a lucide `chevron-down` (the native select stays underneath for keyboard and screen readers, or the select gets `appearance: none` and a background icon).
- The active rail icon is a pale `--surface-selected` square with ink icon and a 2px ink bar on its left edge, like the dock's tab underline, not a filled dark square.
- Sites and node levels use `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))` so cards fill the page width.
- The plan band stays amber (D43). Make it one step quieter: `--plan-band: #fcf4de`, border `#ead6a0`, so the amber plan **name** chip is the strong signal.

---

## 3. Typography

**What I saw.** IBM Plex Sans/Mono with Hebrew, tabular numbers for U and ports: a good, serious choice (D33). The scale 12/13/14/16/20/26 is fine, but it has no **roles**: the CSS uses `--t-xs` 122 times and `--t-sm` 107 times, often for the same job (a label is 12 here, 13 there). Headings vary: "Rack Core 01" 16/600 at the rack level, "Main Distribution" 20/600 on the node level, no heading on the equipment page (S-08, S-10, S-12). The faceplate numbers at 56px jacks are 21px mono 500 on white (`physical/physical.css:1631`, `calc(var(--j) * 0.38)`), the largest text on the page, larger than the device name.

**What good tools do.** Carbon names type by role (`$heading-compact-01` 14/600 for column heads, `$body-compact-01` 14/400 for rows) so each job has one size ([Carbon, Data table style](https://carbondesignsystem.com/components/data-table/style/)). Linear uses a display cut only for headings and the plain face for everything else ([Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)). Primer's type scale is also role-based ([Primer, Typography](https://primer.style/foundations/typography)).

**Proposed change: keep the sizes, add roles** (all in `theme.css`; the values come from today's scale, so nothing reads smaller):

```css
--type-page:    600 20px/28px var(--sans);  /* page title: Rack Core 01, EDGE-17, Inventory */
--type-section: 600 14px/20px var(--sans);  /* card and dock section titles */
--type-body:    400 14px/20px var(--sans);  /* forms, dock text */
--type-dense:   400 13px/18px var(--sans);  /* tables, tree cards, meta lines */
--type-label:   500 12px/16px var(--sans);  /* field labels, column heads, chips */
--type-code:    500 12px/16px var(--mono);  /* cable IDs, U numbers, port names */
--jack-num-ratio: 0.32;                     /* jack numbers: was 0.38 of the jack */
```

Two finishing touches: `font-feature-settings: 'tnum'` on every number column (already `.num` in places), and `letter-spacing: -0.01em` on the 20px and 26px titles. Plex is slightly wide at large sizes.

---

## 4. Colour and state

**What I saw.** The meaning model is right and stays: ink for selection and buttons, teal route, amber highlight, dashed proposed, red danger, networks by creation order (D33, D27). The look issues:

- **Saturated network blue does a lot of the talking.** Cabled jacks, cable lines, path plates and dots are all `#2f6fdb` at full strength (S-12: the path card has 10 bright blue squares and 4 bright blue lines). With teal route and amber outlines also on screen, the Trace page uses four strong hues at once (S-04).
- **Near-duplicate tokens.** `--amber-ink`, `--env-ink` and `--warn-ink` (`shared/theme.css:37-40`) are three names for brown-amber text. `--steel-ink`, `--steel-ink-soft`, `--steel-ink-strong`, `--steel-free` and `--steel-port` are five greys within a narrow band.
- **Network colours live in TypeScript** (`map/networkColors.ts:4-11`) with uneven lightness: the purple `#9a4fc7` and olive `#6b7a1f` look heavier than the blue.
- **Dimming by opacity** (`map/map.css:388-392`, `.chip.muted`) turns text grey-blue and blurry on the dotted floor (S-02, the AGG-15 card).

**What good tools do.** Radix Colors defines 12 steps per hue, each with a job: 1–2 backgrounds, 3–5 component backgrounds (normal, hover, selected), 6–8 borders (subtle, interactive, strong), 9–10 solid fills, 11–12 text ([Radix, Understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)). Primer names colours by role and strength: `fgColor-{role}`, `bgColor-{role}-muted` for "subtle emphasis", `bgColor-{role}-emphasis` with `fgColor-onEmphasis` ([Primer, Color](https://primer.style/foundations/color/overview)). Linear generates every theme from three inputs in LCH because colours at the same lightness then look equally light ([Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)). Grafana's node graph keeps edges a neutral `#999` and puts colour only where there is a status ([Grafana, Node graph](https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/)).

**Proposed change.** Keep every hue's meaning. Add a semantic layer on top of today's values (old names stay as aliases until the CSS is migrated, so this is safe to do in steps):

```css
/* Neutrals: one ramp, each step has a job (Radix-style). */
--surface-page:     #f2f4f6;  /* was --floor #eef1f3: a little lighter, less grey */
--surface:          #ffffff;  /* --paper */
--surface-sunk:     #f7f9fa;  /* --paper-sunk: table heads, wells */
--surface-hover:    #f1f4f7;
--surface-selected: #e8eef5;  /* a selected row, the active rail icon */
--border-subtle:    #e6ebef;  /* --rule-soft: inner dividers */
--border:           #d5dce2;  /* --rule: cards */
--border-strong:    #b6c1cc;  /* --rule-strong: hover */
--border-field:     #7b8794;  /* inputs only, 3.7:1 (design review §11.1) */
--text:             #1c2b3a;  /* --ink */
--text-muted:       #56636f;  /* --ink-soft, 6.2:1 */
--text-faint:       #6b7782;  /* new: dimmed cards and hints, 4.6:1, replaces opacity */

/* State: a strong and a soft step for each meaning. */
--state-route:       #0f8b7a;  --state-route-text: #0b7666;  --state-route-soft: #e2f3f0;
--state-highlight:   #d99a0b;  --state-highlight-soft: #fdf3dc;
--state-warn-text:   #7a5200;  /* replaces --amber-ink, --env-ink, --warn-ink */
--state-proposed:    #8a6100;  --state-proposed-soft: #fff6dd;
--state-danger:      #b4361f;  --state-danger-soft: #fbeae6;

/* Networks: by creation order (D27), equal lightness, in the theme (D33). */
--net-1: #2f6fdb; --net-2: #8b55c9; --net-3: #c0562b;
--net-4: #2f8a46; --net-5: #c03a72; --net-6: #6f7d1c;
--net-unresolved: #9bacc0;
```

Two rules of use, not new colours:

1. **Strong network colour on hardware, soft elsewhere.** A cabled jack stays its full network colour (it is the state). On paper (Connects to, chips, the Inventory dot) the network shows as an 8px dot and the name in ink, as today. In the path card the cable **line** is the network colour at 2px, and the end caps are neutral, so a path shows one coloured line, not ten blue squares.
2. **Dim with colour, never with opacity.** Dimmed tree cards: `--text-faint` text, `--border-subtle` border, `--surface-sunk` fill. This also fixes the contrast problem the design review found (§3.1), and the dimmed card still looks crisp.

A dark theme is **not** proposed now. These tokens are what would make one possible later (Atlassian builds elevation from surface colour plus shadow precisely so dark mode can swap surfaces, [Atlassian, Elevation](https://atlassian.design/foundations/elevation)).

---

## 5. Spacing, density and surfaces

**What I saw.** Spacing in the feature CSS uses 26 different pixel values. 8px (112 uses), 6px (56), 4px (55), 12px (52) and 10px (45) dominate, and odd values (3, 5, 7, 9, 11, 13, 15, 19, 25px) appear 60 times. Radii: `--r-control` 40 times, then 8px hard-coded 31 times, 4px 13, 6px 11, 5px 4, 2px 5, 1px 5 (counted with grep over `features/*/*.css` and `app/styles.css`). `theme.test.ts` guards colours, but not sizes, so drift goes unnoticed.

Surfaces are mostly right: floor, white cards with a 1px border, shadow only on floating things (D33). But the cards on Physical are bordered white boxes on a grey floor, each with its own title style. The equipment page has four of them side by side (face, Connects to, the jack's card, the path) with different header heights (S-12: "Connects to" sits in a sunk header band, the face card has none, the path card has a header row).

**What good tools do.** Carbon's spacing is "multiples of two, four, and eight": 2, 4, 8, 12, 16, 24, 32, 40, 48 ([Carbon, Spacing](https://carbondesignsystem.com/elements/spacing/overview/)). Atlassian names four surface levels: sunken, default, raised and overlay; raised and overlay always pair with their shadow ([Atlassian, Elevation](https://atlassian.design/foundations/elevation)).

**Proposed change.**

```css
--s-1: 2px; --s-2: 4px; --s-3: 8px; --s-4: 12px; --s-5: 16px; --s-6: 24px; --s-7: 32px;
--r-sm: 4px;   /* chips on hardware, jacks, tags */
--r-md: 6px;   /* controls (= --r-control) */
--r-lg: 8px;   /* cards */
--r-xl: 12px;  /* drawers, dialogs (was 10) */
--shadow-1: 0 1px 2px #1c2b3a14;                                   /* raised: a dragged card */
--shadow-2: 0 10px 30px -10px #1c2b3a59;                           /* popovers, toasts, map controls */
--shadow-3: 0 18px 40px -18px #1c2b3a40, 0 2px 6px #1c2b3a12;      /* drawers (= --shadow-drawer) */
```

- **A card header pattern:** every card on the equipment page and in the dock has the same 40px header (title 14/600, a muted count, actions on the right), the same 16px padding and the same 8px radius. Connects to, the jack's card and the path card already have the parts; they only need one class.
- **Extend `theme.test.ts`** to reject raw px for `padding`, `gap`, `margin` and `border-radius` in feature CSS (layout widths like `--rack-w` stay as tokens, as today). Migrate one feature at a time.
- **Density:** keep today's sizes. The owner's screen is 1536×864 (D43). Tables at 36px rows and tree cards at 36px (from 30) are the only changes, both for breathing room.

---

## 6. Icons

**What I saw.** lucide-react is already used for the rail, header and the inspector buttons. Beside it are text glyphs: `⚠` inserted by CSS (`map/map.css`, the "no BB" and fault marks), `↑` for uplinks (`physical/physical.css:1047-1054`, 11px bold), `▾`, `›`, `‹`, `→` and `↔` in text. In S-01 the ⚠ beside "no BB" is a different weight and baseline from the rail icons. The inventory's type icons are lucide, but rack items have none (S-14: CM-A03, KVM-CORE-01, UPS-A03 have a blank where the icon goes).

**What good tools do.** Linear tuned neutral icons for contrast per mode so they read with the text ([Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)). Carbon and Primer use one icon family at fixed sizes (16 and 20) with the text's colour.

**Proposed change.** One rule: lucide only, `size 16, strokeWidth 1.75` in controls, `size 14` in table rows and tree cards, the icon inherits the text colour. Map glyphs: ⚠ → `triangle-alert` (amber text colour), ↑ uplink → `arrow-up` 10px on a jack, `›` breadcrumb → `chevron-right` 12px, `↔` in Changes lines stays text (it is part of the sentence). Rack items get `server` (shelf), `battery-charging` (UPS), `cable` (cable manager), `square` (blank), `box` (other).

---

## 7. The tree (Conceptual)

**What I saw.** S-01 and S-02 at 1536×864:

- The tree is a thin island in the middle of the page; the "Network A" panel (count, Only nodes with problems, Key) floats at the top left with a large gap before the tree.
- Column heads "Backbone · Aggregation · Nodes" are 11px muted (`map/map.css:164`), the smallest text on screen, so the columns are not felt.
- Cards are 30px tall with 9px padding; "AGG-03 ⚠ no BB ▬ AGG-08 ⚠ no BB" repeats the warning on each AGG.
- The selected node card has a 3px teal border with a teal "EDGE-17" row; dimmed AGG-15 fades to near-invisible.
- Lines are 1px grey and turn at right angles with square corners.

**What good tools do.** Grafana's node graph keeps lines neutral and lets a status ring carry colour ([Grafana](https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/)). NetBox's Visual Explorer draws topology as cards on a quiet canvas with neutral links ([NetBox Labs, Visual Explorer](https://netboxlabs.com/blog/netbox-visual-explorer-network-visualization/)). Figma's canvas puts tools in slim bars at the edge, never in a floating box in the content area ([Figma UI3](https://www.figma.com/blog/behind-our-redesign-ui3/)).

**Proposed change** (layout from the data and every D40 rule stay):

- **A column strip at the top:** a 36px band across the page with the network's name and counts on the left ("Network A · 1 BB · 3 AGG · 1 node · 1 switch"), "Only nodes with problems" and Key on the right. The column heads sit in it above their lanes, 12px/500 ink-soft. Behind each column a lane of `--surface-sunk` at 60% shows the column the whole way down. The floating panel goes.
- **Cards:** 36px, radius 6, 12px padding, name 13/600, the role chip at the right edge. "no BB" becomes one amber chip on the frame ("no BB" once for the frame when both AGGs lack it), with a `triangle-alert` 12px icon.
- **Lines:** 1.5px `--border-strong`, corners rounded 6px (React Flow `smoothstep` with `borderRadius: 6`). On the route or selection 2px teal.
- **Selection:** the selected card: 2px ink border plus `--shadow-1`. Lit cards: 1.5px teal border and `--state-route-soft` fill. Dimmed: `--text-faint`, `--border-subtle`. No opacity.
- **Canvas:** keep the dot grid but at `--border-subtle` (it now competes with the cards). The zoom buttons move into the top strip's right end or keep their corner with `--shadow-2`.

---

## 8. Physical: faceplates and racks

**What I saw.**

- **Switch faceplate** (S-10, S-12): at 1536 the fitted jacks reach their 56px maximum (D50). 24 white tiles with 21px numbers on a steel plate dominate the page; the three cabled jacks are bright blue; the selected jack is a white inset box with a black ring. The ↑ uplink mark is a tiny 11px arrow in the jack's corner.
- **HDF** (S-13): four blocks of six white tiles per row, readable and well grouped. Same glare.
- **The rack** (S-10): slim and good. Free runs are dashed rows with 11px mono "11–9 · 3U free" at low contrast. Equipment blocks are dark with a white tape label, the chosen one with a white 2px outline.
- **The legend** under the face uses five different marks in a row, one of them a hollow checkbox-like square for "selected".
- **The path card** (S-12): plates are tall black boxes with a white tape; cable IDs in boxed mono chips above blue lines with square end caps.
- **Mini racks** (S-08): dark boxes; block names hidden (`font-size: 0`, `physical/physical.css:494-495`).

**What good tools do.** NetBox draws rack elevations as SVG with one colour per device role and the device name on each block ([NetBox, Racks](https://netboxlabs.com/docs/netbox/en/stable/models/dcim/rack/)). Sunbird dcTrack and Hyperview draw "realistic" front views of devices from model images, so a free port looks like an empty socket, not a highlighted tile ([Sunbird dcTrack](https://www.sunbirddcim.com/dctrack), [Hyperview, Connectivity](https://hyperviewhq.com/connectivity/)). Device42 shows used ports filled and free ports as open outlines ([Device42, Patch panels](https://docs.device42.com/infrastructure-management/connectivity/patch-panels/)).

**Proposed change.**

- **Jacks** (the biggest single win):

  ```css
  --jack-free:        #e8ecf0;               /* unlit socket; was #ffffff ⚑ D33 */
  --jack-free-edge:   inset 0 0 0 1px #c5cdd5, inset 0 -3px 0 #d3d9df;  /* a socket's lip */
  --jack-ink:         #2a3440;               /* number on a free jack, 12.7:1 */
  --jack-selected:    0 0 0 2px var(--steel), 0 0 0 4px #ffffff;  /* ring outside the jack */
  --jack-num-ratio:   0.32;
  ```

  A cabled jack keeps its full network colour and white number. Route stays teal. The selected jack gets the outside ring, so its fill (its state) still shows. A reserved, disabled or faulty jack keeps its hatch (D45/D50 rules unchanged).
  If the owner wants to keep free jacks pure white, the inset edge and the smaller number alone still take most of the glare away.
- **Cap a switch's fitted jacks at 44px**, HDFs stay at 60. A 24-port switch then takes about 640px instead of 800 and leaves room around it. **⚑ touches D50** (`--jack-max: 56px`). Optional; the demo shows the face at 44px.
- **↑ uplink mark:** a 12px lucide `arrow-up` in a small white circle on the jack's top edge, easy to see on both blue and grey.
- **Rack:** free runs read "11–9 · 3U free" in `--steel-ink` (7.2:1 on steel). Blocks get a 4px coloured stripe on their left edge for their network (passives keep the grey stripe they have), so the rack shows what is where at a glance.
- **Legend:** one row of identical 12px swatches, each the real look (an unlit socket, a blue jack, a teal jack, a ringed jack, an ↑), labels 12px muted.
- **Path card plates:** reduce plate padding, tape at 12px mono, cable IDs as plain 12px mono text above a 2px line in the network colour with round end dots (no boxed chips), place headers 12px muted with no dashed frame.
- **Mini racks:** show the tape names at 11px (the D33 minimum) on blocks of 2U or more, and a 2px network stripe on every block. (Pairs with design review §4.1.)

---

## 9. Trace page

**What I saw** (S-04): the left list is clean. The drawing repeats each route as a row of four black plates inside dashed place frames, with amber outlines around every plate that every route passes, which with these three routes is nearly every plate. The "Every route passes PANEL-A, HDF-01, HDF-02" banner is amber too. The header has seven controls with three styles (segmented, quiet text, outlined).

**Proposed change** (behaviour of D46/D49 unchanged):

- Place frames: `--surface-sunk` fill, radius 8, no dashed border; the place name 12px/500 muted.
- "Every route passes": a 2px amber outline only (no fill), plus a small amber tag under the plate "on all 3". The banner becomes a white card with a 3px amber left edge, text in ink.
- Cable lines: 2px network colour, round end dots; IDs as 12px mono text.
- Header: one segmented control (One route · All routes), then quiet buttons "Show on map", and Download PNG / PDF in a small `download` menu.

---

## 10. Inventory tables

**What I saw** (S-14): a proper, calm list layout. Visually busy in four places: every name is an underlined link; every column head has ↑↓; eight command buttons in the toolbar, six greyed out; the network dot is 5px. Rows are ~34px, 14px text; the "Rack C…" column truncates while "Main Distribution" has room.

**What good tools do.** Carbon's table: column heads 14/600, row text 14/400, row heights 24/32/40/48, toolbar and batch bar paired to row size ([Carbon, Data table style](https://carbondesignsystem.com/components/data-table/style/)). Primer and Linear tables show sort only on the sorted column and use plain ink names with hover underline ([Primer, DataTable](https://primer.style/components/data-table)).

**Proposed change:**

- Rows 36px, 13px text (`--type-dense`), column heads 12px/600 muted on `--surface-sunk` with a 1px `--border` below.
- Names: ink 500, no underline; underline and `--surface-hover` row on hover. The type icon 14px muted.
- Sort: only the sorted column shows its arrow; other heads show it on hover or focus.
- Numbers (U, counts, ports) right-aligned, tabular.
- Network: 8px dot + name. Status: shape + word (D37), unchanged.
- Toolbar: show only what applies (design review §7.4), quiet buttons with 16px icons. Pills: 26px high, `Network: Network A` style with the field muted and the value ink (the `==` stays if the owner prefers it).
- Column widths: Rack gets `min-width: 120px` before Node is allowed to grow.

---

## 11. Forms and dialogs

**What I saw.** Forms follow one layout (label above, hint below, two columns; `shared/theme.css` `.field`). The inputs' pale border (design review §11.1) makes forms look empty. Inline confirms use the dock's paper with no frame of their own, so a confirm and the card around it blend.

**Proposed change.** Inputs: `--border-field`, 34px, radius 6, focus 2px ink ring outside (`box-shadow: 0 0 0 2px #1c2b3a33` plus the ink border) for a softer but clear focus. Inline confirms and forms: a `--surface-sunk` well with radius 8 and 12px padding, so the eye sees one bounded task. Proposed forms keep their dashed edge (D33).

---

## 12. Empty states

**What I saw.** "Select a jack on the face to see where it goes." in a dashed box (S-10); "Path · Select a cabled jack…" as a full-width card (S-10, S-12); "None yet. Kept in this browser only." (S-14); "Equipment inspector · Select equipment on the map to inspect it" as a heading pair (S-03). Each is a different style. The full-width empty path card takes a 46px band.

**What good tools do.** Carbon and Atlassian both use one empty-state pattern: a small illustration or icon, one sentence, the next action ([Carbon, Empty states](https://carbondesignsystem.com/patterns/empty-states-pattern/); [Atlassian, Empty state](https://atlassian.design/components/empty-state/)). In a dense work tool the small version (icon and one line) fits better than an illustration.

**Proposed change.** One `.empty` class: centered, 20px lucide icon in `--text-faint`, one 13px line in `--text-muted`, an optional quiet button. Use `mouse-pointer-click` for "Select a jack…", `route` for the path, `bookmark` for Saved views, `layers` for an empty Changes. The path card when empty is one quiet 36px line, no card.

---

## 13. What not to change

- The paper and steel idea (D33), the colour meanings, IBM Plex, sentence case, names isolated: all good and modern. This research only tightens them.
- No dark theme, no new hues, no gradients, no illustrations.
- Layout rules of D43, D49 and D50 (dock, slim rack, face sized to its card) stay; only the jack cap (⚑ D50) and the free jack colour (⚑ D33) touch a decision.

## 14. Sources

- Linear, How we redesigned the Linear UI: https://linear.app/now/how-we-redesigned-the-linear-ui
- Figma, Behind our redesign (UI3): https://www.figma.com/blog/behind-our-redesign-ui3/
- Vercel Geist, Colors: https://vercel.com/geist/colors
- Radix Colors, Understanding the scale: https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- GitHub Primer, Color overview: https://primer.style/foundations/color/overview
- GitHub Primer, Typography: https://primer.style/foundations/typography
- GitHub Primer, DataTable: https://primer.style/components/data-table
- IBM Carbon, Spacing: https://carbondesignsystem.com/elements/spacing/overview/
- IBM Carbon, Data table style: https://carbondesignsystem.com/components/data-table/style/
- IBM Carbon, Empty states: https://carbondesignsystem.com/patterns/empty-states-pattern/
- Atlassian, Elevation: https://atlassian.design/foundations/elevation
- Atlassian, Empty state: https://atlassian.design/components/empty-state/
- Grafana, Node graph: https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/
- NetBox 4.0 release notes (Tabler-based UI): https://netboxlabs.com/docs/netbox/release-notes/version-4.0/
- NetBox, Racks: https://netboxlabs.com/docs/netbox/en/stable/models/dcim/rack/
- NetBox Labs, Visual Explorer: https://netboxlabs.com/blog/netbox-visual-explorer-network-visualization/
- Sunbird dcTrack: https://www.sunbirddcim.com/dctrack
- Hyperview, Connectivity: https://hyperviewhq.com/connectivity/
- Device42, Patch panels: https://docs.device42.com/infrastructure-management/connectivity/patch-panels/

Contrast ratios use the WCAG relative-luminance formula on the hex values above.
