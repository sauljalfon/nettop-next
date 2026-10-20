# Acceptance and regression matrix

The behaviour cases and their IDs. Most are implemented as tests (Go, Vitest or Playwright, named by these IDs); which tests cover a finished item is in its step table in [history/implementation-plan-m1-to-p2.md](history/implementation-plan-m1-to-p2.md), and newer cases are listed with their item. Write each case as a failing test first.

The full multi-network input is [acceptance-example.md](acceptance-example.md). Build these cases against real domain/engine/repository/API behavior; do not substitute prerecorded UI result fixtures for end-to-end tests.

## M1 — Domain, identity, and atomic persistence

| ID | Scenario | Expected behavior |
| --- | --- | --- |
| D01 | Create active equipment with valid Network identity | Exactly one stable membership persists |
| D02 | Missing/unknown/multiple device membership | Reject through the chosen strict write contract; no partial save |
| D03 | Create passive panel/HDF | No exclusive device-style network membership is assigned |
| D04 | HDF has N rows | Exactly 4N subpanels, 24N positions, 48N side endpoints; structured row/column fields |
| D05 | Four-row HDF | 16 blocks, 96 positions, 192 side endpoints; generic 48-position limit does not truncate it |
| D06 | Two blocks both have position 1 | Distinct stable identities; uniqueness scoped to owner subpanel |
| D07 | Rename a chassis/subpanel | IDs, cables, bridges, and routes do not change |
| D08 | Network A/B share subpanel 3C at positions 5/2 | Both valid; no exclusive subpanel network and no shared bridge between positions |
| D09 | Duplicate same-side endpoint or second external cable | Reject occupancy conflict; opposite-side cable remains valid |
| D10 | Same endpoint twice / duplicate unordered cable | Reject independently of supplied endpoint order |
| D11 | Internal edge between different positions/subpanels or switch ports | Reject invalid continuity |
| D12 | HDF creation conflicts with rack placement | Roll back chassis, subpanels, positions, endpoints, bridges, and draft revision together |
| D13 | Row count differs from configured rack height | Preserve independent fields; validate actual height/unit bounds |
| D14 | Persist and reconnect | All stable IDs, structured layout, networks, endpoints, cables, and plan metadata survive |
| D15 | Migration from old prototype | Preserve recorded ownership and cable/endpoint identity; explicit network/plan backfill |
| D16 | Reapply migration | Idempotent version check; modification of an applied checksum is detected |

Choose and document HDF row limits and backfill inputs before encoding their exact boundary assertions. Do not treat old mockup fixture sizes as production maximums.

## M2 — Physical traversal and destination discovery

| ID | Scenario | Expected behavior |
| --- | --- | --- |
| P01 | EDGE-17 device-level Find AGG/BB | Three results: AGG-03, AGG-08, BB-01; correct source ports and actual roles |
| P02 | BB route alongside reachable AGGs | BB is not suppressed or relabeled AGG |
| P03 | AGG-15 belongs to Network A but is unconnected | Not a reachable result |
| P04 | Exact starting port 1 | Only its component/route is searched; no jump to ports 2/3 |
| P05 | More than two reachable AGGs in an extended fixture | Return them under the documented result policy; no fixed pair cap |
| P06 | BB-only reachable destination | Return BB as a valid terminal result |
| P07 | Route reaches an active endpoint | Stop that physical branch; no sibling-port transit, including AGG→BB continuation |
| P08 | Several source ports reach one destination device through different endpoints | Preserve distinguishable endpoint routes; do not silently merge source ports |
| P09 | PANEL-A front 1 ↔ rear 1 | Valid passive continuity; counted as an internal bridge |
| P10 | HDF-01 3C/5 versus 3C/2 or 3D/5 | No implied adjacency; network labels are not bridges |
| P11 | Front→rear and rear→front alternating through four passive positions | Correct order; five cables/four bridges; no two-panel limit |
| P12 | Reverse point-to-point input | Same physical continuity in reverse; cable ordering does not create direction |
| P13 | Disconnect a route cable | Route becomes unreachable with a useful stopping outcome; unrelated routes still work |
| P14 | Invalid source/destination endpoint | Stable validation/API error, not a fabricated disconnected result |
| P15 | Passive cycle / repeated visits | Bounded traversal, no infinite loops; distinguish limit/truncation from full unreachable search |
| P16 | Reached active destination belongs to another network | Exclude from matching AGG/BB results and report encountered mismatch separately |
| P17 | Unknown/unclassified circuit or source passive endpoint | Apply the explicitly chosen scope/inference contract; never invent a network from a panel name |
| P18 | Hidden, collapsed, or unloaded UI equipment lies on the route | Backend result remains correct; display scope is not graph scope |
| P19 | Same installed topology with a validated plan overlay | Same engine rules; proposed route does not appear in Installed |
| P20 | Stable results across repeated calls | AGG before BB; deterministic secondary ordering and explicit truncation when applicable |

Exact same-endpoint point-to-point behavior and passive-source network scope require an explicit API edge-case policy. The prototype permits a zero-hop point-to-point result and excludes the start equipment from aggregation targets; preserve compatibility or document a deliberate contract change.

## API, revision, and transaction checks

| ID | Scenario | Expected behavior |
| --- | --- | --- |
| A01 | Trace uses loaded topology revision | Result describes that revision; stale pinned request conflicts rather than showing unseen edits |
| A02 | Two writers use the same draft revision | One succeeds; the other gets a conflict; no lost update |
| A03 | Installed base changes under a draft | Stale base is reported; no silent replay/rebase |
| A04 | Invalid command | Domain error and unchanged persisted draft/revision |
| A05 | Malformed JSON, extra fields, extra JSON object | HTTP validation error under the documented contract |
| A06 | Missing plan/record | 404 instead of an empty fabricated topology |
| A07 | Planned snapshot versus Installed | Separate contexts; no installed mutation from proposal saves |
| A08 | Database/read failure | Truthful error state; no fallback to invented in-memory inventory |
| A09 | Old plan payload requires new metadata | Explicit version/backfill/compatibility behavior, not a half-valid overlay |

Update OpenAPI and client types with each implemented contract. Exact new command/response names are design work for M1/M2, not requirements copied from static links.

## M3 — Connected conceptual map

| ID | Scenario | Expected behavior |
| --- | --- | --- |
| C01 | Default map | Equipment and actual-cable references, not a forced inventory tree. Deleted in step 7 with the device map (D35); successor CM-09 (node cards and cable counts). Until then the spec `map` runs it on the Devices view |
| C02 | Select AGG-03 → AGG-08 → BB-01 | Highlight changes in place; all results stay available; no viewport reset. Deleted in step 7 with the device map (D35); successor CM-11 (the route lights its node cards and lines in place), `overview-trace`. |
| C03 | HDF overview | Parent name, location, capacity, shared network context; no hundreds of detached blocks. Deleted in step 7 with the device map (D35); no successor on the map (an HDF is not expanded there; its grid is PHY-08, Focus on an HDF is CM-07). |
| C04 | Selected route uses 3C/5 and 2B/3 | Only those automatic details are revealed. Deleted in step 7 with the device map (D35); no successor (facets are gone; the walk sheet, WS-01, names the positions). |
| C05 | Manual expansion plus route clearing/change | Manual detail remains; automatic detail is independently updated. Deleted in step 7 with the device map (D35); no successor (Pin on map is gone). |
| C06 | Route uses multiple positions of one HDF | Show each exact position independently, under the same parent. Deleted in step 7 with the device map (D35); no successor (same reason as C04). |
| C07 | Network A filter | Active A devices plus relevant passive infrastructure; B labels/circuits remain distinguishable where shown. Deleted in step 7 with the device map (D35); successor CM-04 and CM-09 (the selector dims nodes and never hides). |
| C08 | Network B filter | Same shared chassis, different exact positions; no active equipment with two memberships. Deleted in step 7 with the device map (D35); successor CM-04 and CM-09. |
| C09 | Cable bundle | Parallel cables between two cards are one line that keeps every real cable ID (shown in its tooltip), splits into one real line per cable, and joins again; summary anchors are never traversal vertices. The specs POL-17 and POL-18 and the `edges` unit tests went with the map. Deleted in step 7 with the device map (D35); successors CM-03 and CM-09 (one line per node pair with its real-cable count) and PHY-19 (the pair's cables listed). |
| C10 | Open/close tools | Full-page canvas dimensions/viewport remain stable; avoid permanent oversized forms. Rewritten on the overview in step 6 (`map`, "C10 opening and closing tools…") |
| C11 | Drag/pan/zoom | Local interaction state; stable node references; no per-pointer backend request. The device-card drag was deleted in step 7 with the device map (D35); successor CM-09 (a drag is sent once, at the drop, and survives a reload). |
| C12 | Save/refetch | Incremental reconciliation by IDs, not revision-keyed workspace remount. Rewritten on the overview in step 6 (`map`, "C12 saving and refetching reconcile by ID…": the node card gains the equipment, the canvas stays mounted, the viewport and positions stay) |
| C13 | Highlight and distant route | The location highlight (a site or node chosen in Explore) and a selected route reveal the objects the network filter would hide, with only the needed exact positions, and hide them again when cleared. Deleted in step 7 with the device map (D35); successor CM-11 (with Network B the route's nodes stay undimmed; an Explore highlight marks its nodes). The device-map specs POL-14, POL-16 and the Esc spec were deleted too; POL-15 (rewritten: Explore opens Focus) stays in `highlight`; P18 was rewritten on the overview (`trace-map`). |

## M4 — Physical explorer and view synchronization

| ID | Scenario | Expected behavior |
| --- | --- | --- |
| F01 | Physical Sites | Names/locations/counts and relevant trace badges; no invented floor-plan coordinates. Covered by the browser spec "F01 Sites shows names, counts and the route, with no coordinates" (`physical`), `explorerModel` and `inventory` unit tests (counts, network mix, name sort) |
| F02 | Open Main Campus | Only its three nodes, freely arranged (saved positions or the default), with cable summary lines between them that count real cables (Building A ↔ North Sub-main 3, North Sub-main ↔ Main Distribution 4); no central site card. Covered by "F02 a site shows only its nodes…" (`physical`), PHY-18 (dragging, saving once, reload, Reset layout, a failed save rolled back), PHY-19 (the line, its list, a row opens its endpoint), PHY-20 (the fit into the visible area), and the `connections` and `layout` unit tests (PHY-12, PHY-13) |
| F03 | Open Main Distribution | Only its three fixture racks; owned equipment counts; selected route marks actual involved racks. Covered by "F03 a node shows only its own racks…" (`physical`) and the `inventory` and `explorerModel` unit tests |
| F04 | Rack has a 3U HDF | One object spanning U4–U6, not three duplicate pieces of equipment. Covered by "F04 a 3U HDF is one object over U4–U6…" (`rack`) and the `elevation` unit tests |
| F05 | Conceptual endpoint → Physical | Correct site/node/rack/chassis/subpanel/position/side is opened. Covered by "F05 a conceptual endpoint opens the exact place in Physical…" (`views`: the inspector header, a Positions row, a walk sheet row) and the inspector model unit tests |
| F06 | HDF-01 3C/5 rear → front | Same position; A02/PANEL-A rear versus A03/HDF-02 2B/3 front. Covered by "F06 HDF-01 3C/5 rear…" (`equipment`), PHY-10 (`views`) and the `detail` and `equipmentModel` unit tests |
| F07 | HDF-02 2B/3 front → rear | A03/HDF-01 front versus A04/AGG-03 port 1. Covered by "F07 HDF-02 2B/3 front…" (`equipment`) |
| F08 | Inspect peer equipment and return | Same route, equipment identities, context, and useful previous view. Covered by "F08 Go to peer opens the far equipment…" (`equipment`: Back restores the exact endpoint and side) and PHY-10 and PHY-11 (`views`, rewritten on the overview in step 6: back on the overview with the same route marks, node positions and viewport) |
| F09 | Network B physical HDF grid | 3C/2 selected; 3C/5 remains visibly a separate A circuit. Covered by "PHY-08 / F09 the HDF-01 face has 16 blocks…" (`equipment`), PHY-11 (`views`), and the `equipmentModel` unit tests (state decides the color, never the network ID) |
| F10 | Standard panels/device banks | Correct local positions, terminal ports, occupancy, cable peers, and sides. Covered by the two "F10" specs, a switch bank and a standard panel (`equipment`), and the `faces` unit tests |
| F11 | Breadcrumb/back navigation | Restore context consistently; no nested modal stack. Covered by "F11 breadcrumbs and Back…" (`physical`), "F11 Installed/Plan keeps the physical location…" (`views`), and the `history`, `location` and `physicalSession` unit tests |

## M4.1 — Physical polish and the campus check

| ID | Scenario | Where it runs |
| --- | --- | --- |
| TR-01 | Walk sheet rows keep their name on one line with the icon beside it, in both views | `trail` |
| TR-02 | Endpoint labels are readable (structure, never the stored label) | `hops.test.ts` |
| TR-03 | In Physical the results panel opens as one line and its expanded walk sheet scrolls | `trail` |
| TR-04 | The trail shows the route's steps; chips, Prev and Next open the exact endpoint; Back returns | `trail`, `trail.test.ts` |
| TR-05, TR-06 | The trace is rerun across Installed ↔ Plan; a missing route falls back to the first with a note | `trace-switch`, `traceSession.test.ts` |
| RK-01, RK-02 | A 12U rack labels every unit; a 42U rack's U1 ends above the results panel once scrolled, at 1440×900 and 1280×720, and only the rack scrolls; faceplates per kind and their states | `faceplates`, `cabinet.test.ts` |
| PB-01 to PB-03 | Odd-over-even switch ports; one legend swatch per network; arrow keys, Home/End and Enter with one tab stop | `faceplates`, `equipmentModel.test.ts`, `faceNav.test.ts` |
| PB-04, PB-05 | The HDF is one dark chassis with 16 modules; jack sizes (44 px switch and panel, 34 px HDF) | `hdfplate` |
| PD-01, PD-02 | The port detail card draws the connection chain for a position, each box opening its place; a switch port shows its walk sheet instead | `hdfplate`, `equipmentModel.test.ts` |
| SR-01, SR-02 | Explore finds a cable by ID and a port by label, in Physical and in Conceptual | `search-sheets`, `portSearch.test.ts` |
| PR-01, PR-02 | The rack and equipment sheets download as one-page PDFs with the header, table and text layer | `search-sheets`, `sheets.test.ts` |
| SC-01 | The campus fixture validates, is deterministic, has the realistic shape, and every sampled access switch reaches one distribution device on its network | `internal/scalefixture` (Go) |
| SC-02 | The opt-in campus run records the timings and screenshots (CM-12: topology load; first overview render fitted; open the busiest node card; Focus on an access switch; +1 hop; ‹ Overview back; then the site screen, node drag and save, 40-rack node, rack search, 42U rack, 32-row HDF, Trace drawer, picker search, trace on the overview, trail step, Explore, Explore cable search) | `scale` (`SCALE=1`, skipped otherwise) |
| SC-03 | Picker and Explore lists are built once per snapshot when idle; an empty picker query is cheap | `lazy.test.ts`, `picker.test.ts` |
| SC-04 | Retired with the device map in step 7 (D35): `reuse.test.ts` (a route change keeps untouched cards and lines as the same objects) was deleted with it. The overview and Focus project from scratch per snapshot; the CM-12 timings (SC-02) are the check now | `scale` (`SCALE=1`) |
| PHY-13 | Above 12 unsaved nodes the layout is layered by cable distance; far fewer lines cross a third card than in the grid | `connections.test.ts`, `center.test.ts` |
| — | The zoom controls are a compact box (under 60 px wide) in the map and on a site screen | `physical` |

## Explanatory paths (2026-10-14)

| ID | Scenario | Where it runs |
| --- | --- | --- |
| WS-01 | The selected route reads as a walk sheet in the results (map and Physical): place headers in order, one row per equipment with its in/out text, cables by label or short ID, "leaves …" notes, the end line, every name isolated; a row selects that equipment, its icon opens Physical | `walk-sheet`, `hops-find`, `sheet.test.ts`, `follow.test.ts` |
| WS-02 | A selected switch port in Physical shows its walk sheet instead of the chain, ending at an AGG/BB or "No cable is connected to this port."; a row opens that endpoint; a position keeps the chain. Another switch, a free end and a loop are unit-tested only (the fixture has none from a switch port) | `walk-sheet`, `equipment`, `hdfplate`, `follow.test.ts`, `sheet.test.ts` |
| WS-03 | An access switch's page lists its uplinks (AGG first, cables, via); a line selects that port; those jacks carry the uplink mark | `walk-sheet`, `uplinks.test.ts` |
| WS-04 | The inspector shows the same uplinks; a line runs Find AGG / BB from that port | `walk-sheet` |
| WS-05 | An AGG or BB page says paths end there and makes no trace request; the mismatch line is unit-tested only | `walk-sheet`, `uplinks.test.ts` |
| POL-22 and the route-view specs | (rewritten in step 6: reached through Explore and the overview, POL-22 checks the overview underneath) Route view is a picture over the map: steps in route order, sites and nodes with each cable's gap, a cross-site path; a step opens Physical; another route redraws; turning it off restores the map exactly; PNG/PDF hold the whole picture | `route-view`, `export`, `diagram.test.ts`, `exportRoute.test.ts` |

## The visual pass (2026-10-15)

| ID | Scenario | Where it runs |
| --- | --- | --- |
| VP-01 | Hebrew names sit in their own `<bdi>` on cards, in the inspector, the walk sheet and the Changes drawer, and a location reads Site › Node › Rack as separate names; every summary line has pieces that read as its text | `visual-pass.recording`, `textPieces.test.ts`, `summary.test.ts` |
| VP-02 | On Physical and the equipment pages an open right drawer keeps every block clear of it, with no sideways scroll; on the map (rewritten on Focus in step 6) and the site canvas a drawer floats and nothing moves | `visual-pass` |
| VP-03 | A 42U rack keeps 26px rows, scrolls inside its panel and labels every unit; scrolled to the bottom U1 is fully visible; on Rack A03 no name is clipped on its label strip. Rows are 26–30px by the available height | `visual-pass`, `cabinet.test.ts` |
| VP-03b | With the inspector open all 24 ports of EDGE-17 and the whole HDF grid sit inside the face card with no sideways scroll and the endpoint detail below it; without a drawer the HDF grid fills its card and every jack number is at least 11px | `visual-pass` |
| VP-04 | Forms: label above the control; a focus ring that stays inside the form; Site › Node › Rack stacked in the narrow drawer and in one row, with Equipment below, in the patching screen; submit is ink, Cancel is paper with a rule border; a form that adds an object is dashed; a library item is one card | `visual-pass` |
| VP-05 | No visible text is under 11px on the map (Focus on EDGE-17, step 6) with the inspector open, the site canvas, Rack A03, HDF-01's page, the HDF form in the library and the Changes drawer | `visual-pass` |
| VP-06 | A map card reads role, network and state in the paper look. Deleted in step 7 with the device map (D35); successors CM-02, CM-09 (node cards) and CM-10 (Focus cards) | `cardRole.test.ts` |
| — | No stylesheet outside `theme.css` has a colour, a font size under 11px or an uppercase transform; none uses `--purple`, `--line`, `--muted`, `--green`, `.button` or `.outline-button` (the allowlist is empty) | `theme.test.ts` |

## The conceptual map for real data (2026-10-19)

| ID | Scenario | Where it runs |
| --- | --- | --- |
| CM-01 | `GET`/`PUT`/`DELETE /api/map-layout`: round trip, last write wins, reset, a deleted node's position goes (cascade), 404 unknown node, 422 out of range or missing, 400 unknown field; no write changes the topology revision | `persistence/map_layout_test.go`, `httpapi/map_layout_api_test.go`, `src/shared/api.test.ts` |
| CM-02 | Overview cards: one per node, equipment count, tags from explicit roles, proposed dashed | `overview.test.ts` |
| CM-03 | Pair counts equal the real cables, within and between sites; a cable inside one node is not a line | `overview.test.ts` |
| CM-04 | The network selector dims nodes without that network and never hides shared passive equipment | `overview.test.ts` |
| CM-05 | Default arrangement is deterministic, cards never overlap, saved positions win; above 12 nodes the automatic fit keeps zoom 0.6 from the top (`overviewFit.test.ts`) | `overviewLayout.test.ts` |
| CM-06 | Focus on EDGE-17 (the acceptance fixture) shows AGG-03, AGG-08 and BB-01 on the right, AGG-03's card "via PANEL-A 1, HDF-01 3C/5, HDF-02 2B/3" (D36: the via rows are in the card a line leads to; a card reached by several lines has one row per line); AGG-15 (unconnected) is absent; several circuits to one neighbour merge with their count; a dead end is listed; a loop terminates | `focus.test.ts` |
| CM-07 | Focus on a panel and on an HDF walks both sides; a reserved/faulty port changes nothing (locked 6) | `focus.test.ts` |
| CM-08 | More than 24 neighbours group per node; +1 hop adds the next ring, never repeats, stops at 3 | `focus.test.ts` (campus-shaped fixture) |
| CM-09 | The map opens on node cards inside site frames, with the cable counts; a node opens its equipment; a drag is sent once at the drop and survives a reload; Reset arrangement; the network selector dims and never hides; a count pill is never under a card | `overview` |
| CM-10 | Focus from the inspector, from Explore and from Show on map; a neighbour moves the focus; a via row opens its line's circuits; +1 hop; ‹ Overview restores the overview; a proposed card; no text under 11 px; a via row never covers another card | `focus` |
| CM-11 | A trace lights the route's node cards and lines (overview) and cards and lines (Focus) in place; with Network B the route stays undimmed; the Route view covers and restores; Explore's highlight marks and fits once and can be cleared | `overview-trace` |
| CM-12 | Campus: overview render and Focus open timings recorded (measurements, not budgets) | `scale` (`SCALE=1`; with SC-02) |

Since step 6 the overview is the default view and every spec reaches equipment through Explore (`selectEquipment`), an overview card or Focus. The specs of the retired device map were deleted with it in step 7 (D35); the map has only the overview and Focus.

## The inventory view (2026-10-19)

| ID | Scenario | Where it runs |
| --- | --- | --- |
| INV-01 | Rows equal the snapshot: one equipment row per equipment, one port row per endpoint (both sides of each position), one cable row per cable (never a bridge); Far end and A/B ends as separate names; a port's network from its circuit; proposed rows only in a plan. Pills, the search over hidden columns, sort (numeric, ties in natural order, flip), Group by (counts add up, empty last, folding), paging; a Hebrew name stays one isolated name; a port row opens the inspector on its port | `rows.test.ts`, `query.test.ts`, `columns.test.ts`, `model.test.ts`; `inventory` |
| INV-02 | The CSV: UTF-8 mark, header, quoting (`"`, `,`, newline, Hebrew), CRLF, exactly the visible columns and every filtered record (not the page); the downloaded file equals it | `csv.test.ts`; `inventory` |
| INV-03 | One-row commands and the ⋯ menu: Open details (a port row finds its port), Show on map opens Focus, Show in Physical opens the page at the port (a cable at its A end), View its ports; in a plan Delete… and Disconnect… open the inspector's confirms and Cancel changes nothing (off for a proposed row or a free port, with the reason); nothing that edits in Installed; the menu by keyboard, one at a time, Escape returns focus | `model.test.ts`; `inventory` |
| INV-04 | Open in inventory from the inspector and from the equipment page lists only that equipment's ports, with the header on All networks | `inventory` |
| INV-05 | Edit columns hides a column in the table and the CSV; the first column cannot be hidden; the choice survives a list change | `inventorySession.test.ts`; `inventory` |
| INV-06 | The header's network and the Network pill follow each other (D37), also after a list change; several networks read "N networks"; Reset filters clears both; Conceptual is unchanged | `inventorySession.test.ts`, `model.test.ts`; `inventory` |
| INV-07 | Campus: opening the view and Ports and positions, a search, a sort, Group by, scrolling a grouped list, a pill and the CSV timed (measurements, not budgets); fewer than 100 rows drawn at any time | `scale` (`SCALE=1`; with SC-02) |

Explore while the Inventory is shown (equipment and port hits open the inspector and the page stays; a site or node still highlights on the map) and the Plan's Proposed chip run in `inventory` too.

## A more useful inventory (2026-10-20)

| ID | Scenario | Where it runs |
| --- | --- | --- |
| INV-08 | Racks: units used and free, the largest free block and Fits from the snapshot (a 4U HDF covers 4 units; a move in a plan changes them); Show in Physical opens the rack | `racks.test.ts`; `inventory-more` |
| INV-09 | Problems: each rule on a fixture made to break it (two networks on one circuit, a faulty or disabled port with a cable, an IP address twice, a switch with no serial number); stable keys; the count in the menu; a row opens its equipment | `problems.test.ts`; `inventory-more` (the fixture's switches with no serial number) |
| INV-10 | Free capacity: used and free per equipment (switch ports; panel and HDF positions by either side), the Connected pill, group counts; Connect… on a free port in a plan opens the patching screen on it | `rows.test.ts`, `model.test.ts`; `inventory-more` |
| INV-11 | Work list: one row per Changes line in order with its place (the Expansion draft: EDGE-18 added in Rack A03, then its cable to AGG-15); its CSV; a container row opens its place, a removed one has nothing to open | `workList.test.ts`; `inventory-more` |
| INV-12 | Edit details of many rows: the Missing pill; "What changes" counts; on Installed one request writes each fix and its History line with the note, all or nothing, 500 at most, a refusal naming the fix; in a plan one batch of `update_details`, off with an installed row | `bulkEdit.test.ts`; Go `fixes`, `persistence`, `httpapi`; `api.test.ts`; `inventory-more.recording` |
| INV-13 | Delete N… and Disconnect N… send one batch; the Work list and Changes list them; Undo per change; a 422 shows in the pane | `model.test.ts`, `manyPreview.test.ts`; `inventory-more.recording` |
| INV-14 | Saved views: save, replace, open (list, query, columns, header network), delete; a view whose column or value is gone; storage that throws keeps them for the session | `savedViews.test.ts`, `inventorySession.test.ts`; `inventory-more` |
| INV-15 | Cable labels: sources, label pieces (a Hebrew name in its own bdi), 16 a page, the file name; the download is a PDF with the right page count | `labels.test.ts`; `inventory-more` |
| INV-16 | Campus: Racks and Problems built and opened, Group by with counts, the Missing pill, Edit details of 500 rows, the label preview and PDF timed; 500 direct fixes in one request (measurements, not budgets) | `scale` (`SCALE=1`); Go `TestFixManyOnCampusIsMeasured` |

## M5–M7 — Editing, persistence, scale, and governance

- Valid rack assignment is required to save equipment (the empty-canvas preview was retired with the device map, D35).
- Diagram movement differs from an explicit physical-placement proposal; both have non-drag alternatives.
- Delete/disconnect commands and capacity/occupancy conflicts are atomic and revision checked.
- Removing a board reference does not delete infrastructure.
- Layout persistence restores coordinates without changing rack ownership; layout undo and plan undo are separate.
- Search/summary/trace behavior is measured on real generated graphs with hundreds of equipment objects and thousands/tens of thousands of cables, including dense HDFs and many starting ports.
- Approval and marking implementation complete are distinct audited actions; neither frontend optimism nor draft publication is proof of installation.
- Permissions and audit changes must preserve the physical traversal and transaction contracts.

Do not skip failing approved-behavior tests because a historical prototype asserted different UI structure. Update the characterization tests deliberately with the new contract, while retaining regression coverage for valid domain behavior.
