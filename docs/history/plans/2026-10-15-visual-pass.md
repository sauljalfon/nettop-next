# Plan: Visual pass, paper and hardware (2026-10-15)

The item is [roadmap §1](../roadmap.md#1-visual-pass-paper-and-hardware-now). The approved demo is [history/demos/visual-pass-demo.html](../history/demos/visual-pass-demo.html); the rules are D33 and D34 in [decisions.md](../decisions.md) (D22 amended). Frontend only: no API change, no migration, no new behaviour. Everything that works today keeps working the same way; only how it looks and reads changes.

## What the user gets

1. **Hebrew names read correctly everywhere:** every equipment, rack, node, site, network and cable name is isolated, and a location is drawn as separate pieces joined by `›`, so "מחסני קשר + מעבדה" never reorders next to "U25", "Port 1" or English names.
2. **Readable text:** one type scale (12/13/14/16/20/26), nothing below 11px, darker secondary text, sentence-case headings instead of small all-caps labels.
3. **Colour means something:** buttons, tabs and selection are ink; blue, purple and orange only ever mean a network; teal the route, amber a highlight, dashed a proposed object.
4. **Hardware looks like hardware:** racks, faceplates and HDFs are the only dark things, names on white label strips. A 1U row is never below 26px, so a 42U rack scrolls instead of clipping names. The HDF grid fills its width with bigger jacks.
5. **Pages keep clear of drawers:** on Physical (and later Inventory) an open inspector, Trace or Changes drawer narrows the page instead of covering it. The map keeps floating drawers.
6. **One way to do each thing:** one chip, three buttons (primary ink, outlined, quiet), one form layout (labels above, two columns, Site › Node › Rack on one row, stacked when the form is narrow), one drawer style.
7. **Works offline:** the IBM Plex fonts ship inside the app, so the internal server needs no internet.

## Decisions taken in the plan

- **One token file**, `src/shared/theme.css`, imported first in `main.tsx`. It holds every colour, the fonts, the type scale, radii and control heights as custom properties, plus the base element styles (body, headings, `button`, `input`, `select`, focus) and the shared classes below. Feature CSS files use only `var(--…)`; they keep layout, not colours.
- **Tokens** (from the demo):

  | Token | Value | Use |
  | --- | --- | --- |
  | `--floor` | `#eef1f3` | canvas behind everything |
  | `--paper` / `--paper-sunk` | `#ffffff` / `#f6f8f9` | drawers, forms, cards / table heads, wells |
  | `--ink` / `--ink-soft` | `#1c2b3a` / `#56636f` | text, primary buttons, selection / secondary text |
  | `--rule` / `--rule-soft` | `#d3dae1` / `#e6ebef` | borders / inner dividers |
  | `--steel` / `--steel-2` / `--steel-3` | `#1f2731` / `#2a3440` / `#3a4552` | racks, faceplates, HDF chassis only |
  | `--tape` / `--tape-ink` | `#fbfbf8` / `#15202b` | label strips |
  | `--jack-free` | `#ffffff` | a free jack (ui-spec §1: free endpoints are white) |
  | `--route` / `--route-soft` | `#0f8b7a` / `#e2f3f0` | the selected route |
  | `--amber` / `--amber-soft` | `#d99a0b` / `#fdf3dc` | a highlight |
  | `--proposed` / `--proposed-soft` | `#8a6100` / `#fff6dd` | proposed (always with a dashed border) |
  | `--danger` | `#b4361f` | errors, Delete |
  | `--unresolved` | `#9bacc0` | a network that cannot be resolved |

  Network colours stay in `PALETTE` (`features/map/networkColors.ts`, D27), unchanged, and are applied inline as today.
- **Fonts:** new dependencies `@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-sans-hebrew` (weights 400, 500, 600) and `@fontsource/ibm-plex-mono` (400, 500), imported in `theme.css`. `--sans: "IBM Plex Sans", "IBM Plex Sans Hebrew", "Segoe UI", Arial, sans-serif`; `--mono: "IBM Plex Mono", Consolas, ui-monospace, monospace`. Mono only for U numbers, port and jack numbers and cable IDs.
- **Shared pieces** in `src/shared/ui/`:
  - `Name({ text, className? })`: renders `<bdi title={text}>`. Every rendered name goes through it.
  - `PlacePath({ parts, className? })`: each part in a `Name`, separated by `<span aria-hidden="true">›</span>`.
  - `Chip({ kind: 'network' | 'role' | 'route' | 'proposed' | 'state', color?, children })`: the one chip. A network chip is a dot plus the name. It replaces `NetworkBadge`'s look while keeping its props, so call sites change little.
  - CSS classes in `theme.css`: `.btn`, `.btn.primary`, `.btn.quiet` (plus `.btn.lg`), `.field` (label above, hint, error), `.field-grid` (two columns), `.place-row` (Site › Node › Rack in one row; stacked one per line when the picker is narrower than 480px, so no chosen name is clipped: owner, 2026-10-15), `.drawer` (radius 10, shadow; the only shadowed element besides popovers), `.tape` (the label strip), `.legend`.
- **Location as parts:** `features/map/location.ts` gets `locationParts(s, equipmentId): string[]` (site, node, rack). `locationLabel` stays for plain-text uses (search, `title`, CSV, print), never for rendering.
- **A rule test** (`src/shared/theme.test.ts`, vitest, reads the CSS files): no hex or `rgb()` colour outside `theme.css` and the allowlisted export/print code; no `font-size` below 11px; no `text-transform: uppercase`. It starts with an allowlist of the files not yet converted, and each task removes its files from it. When the item is done the allowlist is empty, so later items cannot drift.
- **Copy changes are only these** (everything else keeps its words, so the specs that find text keep working):

  | Where | Today | After |
  | --- | --- | --- |
  | Header | "Network Studio" / "Infrastructure workspace" | removed; the brand stays |
  | Map | "CONCEPTUAL MAP" / "Connected infrastructure." | removed (the map starts at the top) |
  | Section labels (inspector "DETAILS", "CABLED BY NETWORK", Changes "CHANGES IN THIS DRAFT", Physical "SITE"/"NODE", …) | all caps | the same words in sentence case ("Details", "Cabled by network", …) |
  | Card role tag | `access` (pale tag) | `Access` as plain text (role words keep their meaning; BB stays "BB") |

- **Print sheets and PNG/PDF exports** keep their own fixed colours (they are paper output, not screens). Only their fonts change to the bundled ones.
- **D34 clearance:** the studio sets `--right-drawer-clearance` (the drawer width plus its gap) when a right drawer is open. `.physical-explorer` uses it as `padding-inline-end`, and the inventory will too. The map ignores it.
- **Walk sheet and Route view marks** (owner, 2026-10-15): "leaves <place>", the stop and the free end lose their amber, so amber means only a highlight (D33). "Leaves" is a neutral note (`--paper-sunk`, `--ink-soft`); the stop and a free end are ink text on paper with a solid `--rule-strong` border (dashed stays for proposed). Done in Task 6.
- **The rack:** a 1U row is `max(26px, cabinet fit)`. The cabinet fits the screen when that gives 26px or more per U, and otherwise scrolls inside the page. Names are one line on a `.tape` strip with the full name in `title`.

## Tasks

Each task is one Sonnet prompt, done test-first. Opus reviews each one (diff, tests, screenshots with Hebrew names). No task commits.

### Task 1: foundation

Files: `package.json` (the three font packages), `src/main.tsx`, `src/shared/theme.css` (new), `src/shared/theme.test.ts` (new), `src/app/styles.css`, `src/app/App.tsx` (header copy only).

- Write `theme.test.ts` first with the full allowlist (every CSS file but `theme.css`). It fails until `theme.css` exists and is clean.
- `theme.css`: tokens, `@fontsource` imports, base elements, `.btn`/`.field`/`.field-grid`/`.place-row`/`.drawer`/`.tape`/`.legend`.
- `styles.css` (the shell): the header becomes one 52px line (brand, Conceptual/Physical, Network, Installed/Plan, Changes, DEV/TEST), the segmented controls and the tool rail in ink, using tokens only; remove `styles.css` from the allowlist.
- Checks: `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`; `environment.spec.ts`, `views.spec.ts`.

### Task 2: names and locations

Files: `src/shared/ui/Name.tsx`, `PlacePath.tsx` (+ tests); `features/map/location.ts` (+ test); every component that renders a name (about 120 places in 40 files: `grep -rn "\.name}" src`).

- Unit tests first: `Name` renders a `bdi` with the title; `PlacePath` renders parts in order with `›` separators; `locationParts` returns site, node, rack and skips missing ones.
- Replace each rendered name with `Name`, and each rendered location string with `PlacePath`. Components in `features/paths/` already use `bdi`; switch them to `Name`.
- New spec `e2e/visual-pass.spec.ts`, **VP-01**: rename PANEL-A, North Sub-main and Rack A03 to Hebrew through the fix API, then on the map card, the inspector, the breadcrumbs, the rack list and the Changes drawer every name sits in its own `bdi` and each location reads site › node › rack in order.
- Checks as in Task 1, plus the specs that read names (`inspector`, `physical`, `walk-sheet`, `changes`).

### Task 3: chips, badges and headings

Files: `src/shared/ui/Chip.tsx` (+ test), `features/map/NetworkBadge.tsx`, `features/inspector/*`, `features/planning/changes.css`, `features/physical/physical.css` (badge parts only), `features/details/*`.

- `Chip` unit test first (a network chip has the dot and the name; proposed is dashed).
- Network, role, Installed/Proposed, route and port-state badges become `Chip`s; all-caps section labels become sentence-case headings (copy table above).
- Remove converted files from the allowlist. Specs: `networks`, `inspector`, `details.recording`.

### Task 4: the conceptual map

Files: `features/map/map.css`, `ConceptualMap.tsx` (card markup only), `MapResults.tsx`, `src/app/App.tsx` (remove the headline), `features/paths/paths.css` and `routeDiagram.css` (the walk sheet and the Route view, colours and type only; added 2026-10-15, they were in no task).

- Cards as in the demo: kind icon, name (up to two lines), role text, `PlacePath`, network chips, `N of M cabled`, facets as route chips. Selected = ink ring; on the route = teal ring; highlight = amber, unchanged.
- The results overlay, map controls and Reset layout use `.btn`; edge labels use tokens.
- Nothing about positions, fitting, edges or traversal changes. Specs: `map`, `trace-map`, `highlight`, `route-view`, `polish` (update the colour assertions to the tokens).

### Task 5: drawers, inspector and D34

Files: `src/app/styles.css` (drawer geometry), `features/inspector/inspector.css`, `features/pathfinding/picker.css`, `features/networks/networks.css`, `features/explore/*`, `features/physical/physical.css` (the clearance only).

- **VP-02** first: open the inspector on a switch page in Physical; the page's right edge stays left of the drawer's left edge (bounding boxes). On the map the drawer still overlaps the canvas, and the viewport does not move.
- Drawers use `.drawer`; inspector header, tabs and key/value lists as in the demo; Trace and Explore drawers, Manage networks.
- Specs: `inspector`, `trace-switch`, `hops-find`, `networks`, `physical`.

### Task 6: Physical, the hardware

Split in two prompts if the diff is large: 6a rack, node, site and sites; 6b faces and endpoint detail.

Files: `features/physical/physical.css`, `RackElevation.tsx`, `RackStrip.tsx`, `FaceView.tsx`, `EquipmentFaceStatic.tsx`, `EndpointDetail.tsx`, `NodeLevel.tsx`, `SiteCanvas.tsx`, `SitesGrid.tsx`, `elevation.ts` (+ test for the row height rule).

- **VP-03** first: in a 42U rack every 1U block is at least 26px high and its name is not clipped (`scrollWidth`/`clientHeight` checks), and the rack scrolls.
- Rack: steel cabinet, mono U numbers, names on `.tape`, network stripe, proposed dashed. Faces: the switch banks and the HDF grid as in the demo, with white free jacks, the grid filling the width, jack numbers at least 11px, readable legends. The endpoint detail sits beside the grid, never over it. Sites, site canvas and node cards use paper cards and `Chip`s.
- Update `hdfplate`, `faceplates`, `physical` and `trail` colour and size assertions to the new values (the free jack stays white). The RK-01 tests that assert "a 42U rack fits without scrolling" encode the rule D33 replaced; they are rewritten as VP-03, and the cabinet still ends above the results panel once scrolled to the bottom.
- With a right drawer open (D34) the switch face and the HDF grid still fit the page: the endpoint detail moves below the face when there is no room beside it, never over it.
- The walk sheet and Route view marks lose their amber (see "Decisions taken in the plan").

### Task 7: forms, editing and patching

Files: `features/planning/editing.css`, `planning.css`, `changes.css`, `HdfForm.tsx`, `AddEquipmentForm.tsx`, `DuplicateEquipment.tsx`, `CopyRackLayout.tsx`, `AddContainer.tsx`, `ConfirmShell.tsx`, `ReviewStep.tsx`, `StaleCard.tsx`, `features/patching/*.css`, `LocationPicker.tsx`, `features/details/details.css`.

- **VP-04** first: in the HDF form the Name input's focus outline stays inside the form's box; Site, Node and Rack are on one row where the form is wide (the patching screen) and stacked where it is narrow (the library drawer).
- Every form uses `.field`, `.field-grid` and `.place-row`, with labels above, a primary ink submit and an outlined Cancel. Proposed objects are dashed amber, the Changes drawer as in the demo, and the patching screen in the same tokens.
- Specs: `editing`, `hdf`, `planning`, `placement`, `picker`, `patching`, `range`, `duplicate`, `changes`, and the recording project.

### Task 8: close the item

- The allowlist in `theme.test.ts` is empty, and the legacy aliases at the top of `styles.css` (`--purple`, `--line`, `--muted`, `--green`, kept in Task 1 for files not yet converted) are gone, and so are the legacy button classes (`.button`, `.outline-button`; Task 7 moves forms, editing and patching to `.btn`, Task 8 the remaining call sites); the whole suite runs green (Go tests unchanged, but run as the handoff rule says).
- **VP-05**: no visible text on the map, Physical, inspector or the HDF form computes below 11px.
- Screenshots of every screen with the Hebrew renames, compared with the demo; Opus reviews.
- Docs: status.md ("what runs" for the look, the Now box names the conceptual map), CLAUDE.md code map (`src/shared/theme.css`, `src/shared/ui/`), roadmap entry and this plan move to `docs/history/`.

## Verifying (every task)

From `frontend/`: `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`, the specs named in the task, then `npm run test:e2e` before the task is approved. Screenshots at 1440×1050 of the screens the task touches, on the acceptance fixture with PANEL-A, North Sub-main and Rack A03 renamed to Hebrew.
