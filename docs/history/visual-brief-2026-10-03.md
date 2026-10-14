# Visual and interaction reconstruction brief

The approved static studies were removed at the user's request. This brief preserves their useful visual/interaction intent for implementation. It is not a pixel-perfect stylesheet, a replacement domain contract, or permission to begin another mockup cycle.

## 1. Overall character

A calm, spacious technical workspace: light neutral canvas, restrained borders/shadows, compact equipment cards, clear labels, and a small number of accents. The network and active task should dominate, not dashboards of permanent forms.

The user disliked the early app's tiny/pale text, laggy dragging, oversized creation forms above the canvas, and confusing permanent panels. Do not copy miniature mockup font sizes into the production interface. Establish readable text/control sizes, clear contrast, keyboard focus, and non-drag equivalents.

Specific theme tokens, font family, exact dimensions, dark-mode coverage, and equipment silhouettes are implementation/design-system choices rather than locked user requirements. Preserve the workflow while keeping visual choices consistent.

## 2. Conceptual workspace composition

```text
Header: workspace / network selector / Conceptual–Physical / Installed–Plan

Compact tool rail       Full-page equipment-and-cable map
  Add                   freely arranged devices and panels
  Explore               small site/node/rack location labels
  Inspect               shared HDF parents with selective detail
  Trace                 actual cables across the map
  Changes

On-demand result/inspector overlays        Expandable route detail/status
```

Network and view selectors are independent. The final linked study showed a right-side result panel containing all AGG/BB choices and a compact selected-route status area. A production result panel should be closable/expandable rather than permanently taking every user's canvas space.

- Equipment cards identify name, kind/role, physical location, and active-device network or shared passive circuit context.
- A cable attaches to exact endpoint references. Avoid unlabeled chassis connections that imply every port is mutually connected.
- Panels are single objects: front and rear appear as side endpoints on that object, not two separate panels.
- At appropriate detail, front/rear labels can sit at the left/right edges of a card; a dashed internal connection identifies the exact same logical position.
- A selected trace is a stronger visual emphasis on existing cables and relevant internal bridges. Non-route connections stay present or summarized, not removed to fabricate a clean strip.
- Physical cables are unordered. Direction cues may explain trace-reading order, never permanent cable direction.
- Optional grouping is light context; it is not a mandatory nested inventory renderer or a source of connectivity.

## 3. HDF card states

**Compact:** chassis name/location, four-column/row capacity, and a connected-subpanel/circuit summary. The parent remains recognizable even when several circuits are exposed.

**Trace-selected:** rows/facets identify only the exact used block and local position, for example:

```text
HDF-01 · North Sub-main / Rack SM01
Front [5] ↔ 3C / position 5 ↔ [5] Rear
```

The AGG-03 route enters rear 5 and exits front 5 in this example; displaying the side labels left/right does not change that traversal order. Show actual connection attachment and an understandable hop explanation.

**Manual detail:** add other connected facets while retaining the trace facet. Search/filter/virtualize when there are many. Do not expand all configured blocks/ports across the whole map by default. Clearing the trace does not discard manually chosen facets.

Keep counts explicit: number of configured subpanels, logical positions, connected positions/circuits, and carried networks are different metrics. In the acceptance fixture, four HDF circuits occupy four positions but only three distinct subpanels because A/B share block 3C or 2B on different positions.

## 4. Semantic colors and labels

The studies used solid green emphasis for the selected route, quiet slate for other cables, and a muted purple dashed line for internal continuity. Network A/B badges used distinct violet/teal accents; this is illustrative and must not become a hardcoded two-network limitation.

Use text/role/side labels in addition to color. BB must be labeled BB, not disguised as AGG. Physical grids can use network/circuit color for non-selected occupied positions and a distinct selected-trace highlight. Distinguish available, occupied, unknown/unclassified, and mismatched states in the actual contract; do not let a colored square replace meaningful endpoint detail.

## 5. Physical explorer composition

- **Sites:** approachable cards with actual name/location data and truthful node/rack/equipment counts. Optional actual photos may be added when supplied.
- **Site:** the site's own nodes, arranged freely by the user, joined by cable summary lines that say what they count (real cables between the nodes). *(Amended 2026-10-06: no central site card; membership is the breadcrumb and heading.)*
- **Node:** owned rack previews, inventory counts, and exact involved-rack highlights. Main Distribution can contain many racks; focus/search/paginate rather than dump every detail.
- **Rack:** dark cabinet/rails, clear U numbers, actual height/position, one multi-U asset spanning its full height, and mounted-equipment inspection.
- **Equipment:** complete device bank, standard panel sides, or HDF matrix. The selected endpoint's inspector explains its external cable peer and same-position internal peer separately.

Breadcrumbs remain useful at every level. A selected conceptual endpoint can bypass the drill-down to open its physical detail directly. Site/node navigation and the trace highlight must remain available when moving back through context.

## 6. Complete HDF grid

Show four fixed A–D columns and the configured number of rows, in row-major block order (1A–1D, 2A–2D, …). Each block shows six local positions with optional secondary fiber-pair labels. Highlight the selected block and its exact position/side without concealing other networks' positions.

Provide front/rear switching, exact position details, cable identity/peer navigation, and return-to-map action. Switching sides preserves the position and changes the inspected cable endpoint. Do not infer a hardware-specific rear-face mirror from the letter labels; layout/orientation data must be explicit if actual physical mirroring is implemented.

## 7. Large-network visual behavior

The main center is a recognizable anchor, not a mandatory root of every cable route. Summarize sites/nodes/corridors and dense core racks until the user focuses them. Bundle labels must describe what they count and expand into real objects.

Search/focus, bounded neighborhoods, selective HDF detail, and route-relevant missing-object loading are essential to readability. Expanding one HDF or choosing another AGG/BB result must not rerun a whole-network layout or reset pan/zoom. Use measured rendering budgets, not claims based on static studies.
