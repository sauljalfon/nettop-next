# Acceptance and regression matrix

Use meaningful red → green tests to verify the approved product. This is a target matrix, not a statement that these cases already pass. Existing executable tests characterize the baseline described in [current-status.md](current-status.md).

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
| C01 | Default map | Equipment and actual-cable references, not a forced inventory tree |
| C02 | Select AGG-03 → AGG-08 → BB-01 | Highlight changes in place; all results stay available; no viewport reset |
| C03 | HDF overview | Parent name, location, capacity, shared network context; no hundreds of detached blocks |
| C04 | Selected route uses 3C/5 and 2B/3 | Only those automatic details are revealed |
| C05 | Manual expansion plus route clearing/change | Manual detail remains; automatic detail is independently updated |
| C06 | Route uses multiple positions of one HDF | Show each exact position independently, under the same parent |
| C07 | Network A filter | Active A devices plus relevant passive infrastructure; B labels/circuits remain distinguishable where shown |
| C08 | Network B filter | Same shared chassis, different exact positions; no active equipment with two memberships |
| C09 | Collapsed group/cable bundle | Keep actual cable IDs; expand to real detail; never use summary anchors as traversal vertices |
| C10 | Open/close tools | Full-page canvas dimensions/viewport remain stable; avoid permanent oversized forms |
| C11 | Drag/pan/zoom | Local interaction state; stable node references; no per-pointer backend request |
| C12 | Save/refetch | Incremental reconciliation by IDs, not revision-keyed workspace remount |
| C13 | Search/focus and distant route | Reveal the required neighborhood/trace objects without loading all ports everywhere |

## M4 — Physical explorer and view synchronization

| ID | Scenario | Expected behavior |
| --- | --- | --- |
| F01 | Physical Sites | Names/locations/counts and relevant trace badges; no invented floor-plan coordinates |
| F02 | Open Main Campus | Legacy-inspired site with owned physical nodes and explicit membership relationships |
| F03 | Open Main Distribution | Only its three fixture racks; owned equipment counts; selected route marks actual involved racks |
| F04 | Rack has a 3U HDF | One object spanning U4–U6, not three duplicate pieces of equipment |
| F05 | Conceptual endpoint → Physical | Correct site/node/rack/chassis/subpanel/position/side is opened |
| F06 | HDF-01 3C/5 rear → front | Same position; A02/PANEL-A rear versus A03/HDF-02 2B/3 front |
| F07 | HDF-02 2B/3 front → rear | A03/HDF-01 front versus A04/AGG-03 port 1 |
| F08 | Inspect peer equipment and return | Same route, equipment identities, context, and useful previous view |
| F09 | Network B physical HDF grid | 3C/2 selected; 3C/5 remains visibly a separate A circuit |
| F10 | Standard panels/device banks | Correct local positions, terminal ports, occupancy, cable peers, and sides |
| F11 | Breadcrumb/back navigation | Restore context consistently; no nested modal stack |

## M5–M7 — Editing, persistence, scale, and governance

- Empty-canvas preview is unsaved and not traceable; valid rack assignment is required to save equipment.
- Diagram movement differs from an explicit physical-placement proposal; both have non-drag alternatives.
- Delete/disconnect commands and capacity/occupancy conflicts are atomic and revision checked.
- Removing a board reference does not delete infrastructure.
- Layout persistence restores coordinates without changing rack ownership; layout undo and plan undo are separate.
- Search/summary/trace behavior is measured on real generated graphs with hundreds of equipment objects and thousands/tens of thousands of cables, including dense HDFs and many starting ports.
- Approval and marking implementation complete are distinct audited actions; neither frontend optimism nor draft publication is proof of installation.
- Permissions and audit changes must preserve the physical traversal and transaction contracts.

Do not skip failing approved-behavior tests because a historical prototype asserted different UI structure. Update the characterization tests deliberately with the new contract, while retaining regression coverage for valid domain behavior.
