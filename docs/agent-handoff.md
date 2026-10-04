# Implementation handoff for Opus 5.5

## Mission

Continue **Net-Top Next**, the new Go + React/TypeScript + PostgreSQL project. The user is transferring implementation to Opus 5.5 after completing the product/design discussion.

Pathfinding is the most important feature. Build a trustworthy physical topology model and one complete network-selection → distribution-discovery → physical-endpoint workflow before broadening the product.

The codebase already exists. It is a working, tested foundation, not the finished design. Do not start another repository, rewrite the stack, or begin another round of mockups.

Read [visual-brief.md](visual-brief.md) for the approved screen composition and visual cues now that the static images are retired. It supplements the UI contract without hardcoding mockup pixel sizes.

## Repository and baseline

- Project: `net-top-next`.
- In the original development environment: `/Users/sauljalfon/projects/net-top-next`.
- Legacy reference: sibling project `Net-Top-1`; access may differ in another environment.
- Existing baseline commits: `263de8b` (foundation and approved architecture), `8e882d9` (pre-implementation inputs).
- Static mockups and generators were deliberately removed. The documentation now preserves the decisions.
- Read [current-status.md](current-status.md) before assuming any target feature is implemented.

Commit hashes identify the existing baseline only. Check live Git status, branch, and recent history before implementation. Preserve unfamiliar user changes. Do not commit or publish unless the user requests it.

## User's actual network

The main site is a large campus with a major distribution node containing BB and AGG switches and many densely connected racks. Some nodes connect directly, some through sub-main nodes, and some paths cross many physical nodes. Those intermediate passages are normally **passive panels/HDFs**, not arbitrary active-switch transit.

Other locations include a DR site with a smaller LAN and small sites with limited nodes. There are multiple networks and multiple AGGs per network, not a fixed redundant pair. Physical ownership and network membership are separate from cable adjacency.

## Locked decisions — do not reopen

1. **Two views of the same network:** Conceptual and Physical. Network selection and Installed/Plan context are independent controls.
2. **Conceptual is a connected equipment map:** actual cable links, free arrangement, small location labels, optional light grouping. It is not a nested inventory tree, concept-only ownership graph, or separate linear trace strip.
3. **Tracing highlights that same map:** keep equipment positions, viewport, and surrounding context. Reveal missing/relevant detail, not a replacement layout.
4. **Physical uses the useful legacy navigation:** sites → site/node explorer → owned rack previews → rack elevation → equipment → exact ports. Breadcrumbs and direct contextual links preserve the selected trace.
5. **One network per active device:** devices have explicit membership. Passive panels, HDF chassis, and subpanels can carry multiple networks through different positions.
6. **Exact passive continuity:** unordered external cables plus front/rear continuity only at the same subpanel/local position. No implicit cross-position/subpanel connection and no sibling switch-port transit.
7. **AGG and BB are both terminal destinations:** retain actual roles, show both kinds of reachable route, AGG listed first. Finding an AGG must not suppress a BB route from another starting port. Do not continue from AGG to BB through active equipment.
8. **HDF design:** four columns A–D, variable rows, six local positions per row/column subpanel, two side endpoints per position. Preserve the HDF parent on the map.
9. **HDF presentation:** compact overview; selected trace automatically reveals only its positions; manual expansion reveals other connected positions; Physical shows the full grid. Automatic and manual expansion are distinct state.
10. **Plans are proposals:** installed topology, plan overlays, and board coordinates are separate. Approval is not evidence of physical installation.
11. **Scale through focus and summaries:** scoped data, bounded neighborhoods, actual-cable bundles, search, selective endpoint detail. Backend tracing is not limited to what the canvas currently displays.

Backend role values should preserve the prototype's `access`, `aggregation`, `passive` and add `backbone` for UI BB. Names such as AGG-03 or BB-01 are display names, never the way roles are inferred.

## What exists versus what must change

**Keep and extend:** Go pure traversal package; PostgreSQL/pgx transaction discipline; explicit migration/seed CLI; saved revisioned plans; occupancy and placement validation; installed/plan isolation; HTTP error conventions; baseline tests; TypeScript and browser verification.

**Missing:** Network entities/device membership; BB discovery; explicit HDF subpanel identities and large-capacity creation; final connected-map rendering; all AGG/BB result interaction; full physical site/node/HDF flow; persistent board layout and undo; measured large-network APIs/rendering; governance.

**Superseded frontend behavior:** the current nested site/node/rack canvas is a prototype. Its existence is not a requirement to retain nesting in Conceptual. Keep useful behavior tests while replacing the presentation in M3.

**Incomplete backend representation:** `Endpoint.Subpanel` is currently a string; it is not a full stable-ID HDF model. Generic panel creation is limited to 48 logical positions and is not sufficient for HDFs.

## Immediate next task

**M1 is complete** (see [current-status.md](current-status.md)): network identities/membership, explicit BB role, stable HDF structure, migrations, compatible plan payloads, seed/validation, and API contract updates. Continue with **M2** in [implementation-plan.md](implementation-plan.md). The M1 input questions below were answered and recorded in the implementation plan; they are kept here as history.

Before schema changes, resolve only the necessary open inputs:

- Is the first release the recommended read/trace/physical-inspection slice, with broader editing later?
- Are we using explicitly labeled development fixtures or importing real inventory now? What active-device → network mapping is available?
- What HDF row range is supported and how is actual rack height supplied?

These are not answered by the mockups. Do not infer real network membership from equipment names or use a destructive reseed as migration. Independent code inspection and test planning can proceed while questions are being answered.

After M1, implement M2 destination discovery, then M3 conceptual and M4 physical. This order avoids building UI against an incompatible temporary HDF/network model.

## End-to-end acceptance to work toward

The complete fictional dataset is in [acceptance-example.md](acceptance-example.md). The critical result is:

```text
EDGE-17 / Network A:
  SFP+ 1 → AGG-03
  SFP+ 2 → AGG-08
  SFP+ 3 → BB-01

AGG-15 belongs to Network A but is unconnected; it is not a result.
EDGE-22 / Network B reaches AGG-12 through different positions
on the same passive HDF/subpanel infrastructure.
```

Select each Network A result without losing the others. Inspect HDF-01 physically, preserve the exact selected position across front/rear switching, inspect its cable peer, and return to the same route. Switching to Network B changes the active equipment and selected positions while preserving shared passive parents. See [acceptance-tests.md](acceptance-tests.md).

## Execution discipline

- Follow `AGENTS.md`; work API-first and test-first at domain/contract boundaries.
- Observe meaningful red tests before behavior changes; verify green at each checkpoint.
- Never replace real engine tests with precomputed UI highlights or prerecorded path results.
- Keep installed reads, plan validation, and tracing on one endpoint/bridge model.
- Preserve recorded IDs and parent ownership; append migrations, never rewrite applied checksums.
- Update OpenAPI, client types, current-status, and relevant docs with completed changes.
- Keep components feature-scoped; avoid piling the new UI into the prototype's large App component.
- Keep live drag state local; no whole-app pointer updates, per-pointer HTTP calls, or revision-keyed remounts.
- Run relevant Go/domain/DB/API checks and frontend type/build/browser checks. Use isolated test schemas.
- Report files changed, tests/results, current limitations, and the next checkpoint. Claims must match runnable behavior.

## Copyable brief to start the next session

> Implement Net-Top Next in this repository. Read AGENTS.md and docs/README.md, then the approved architecture/UI, current-status, acceptance example/tests, backend contract notes, and implementation plan. Mockup review is finished; do not regenerate mockups. Start with M1 using meaningful failing domain/API/database tests. Active devices belong to exactly one network; passive panels/HDFs are shared. HDFs have four columns, variable rows, six local positions per subpanel, and exact front/rear endpoints. In M2, return both reachable AGG and BB routes, stop at active endpoints, and never transit through sibling ports. The conceptual view is a connected map, and the physical view is legacy-inspired site/node/rack/port drill-down over the same IDs. Preserve installed/plan isolation and revision checks. Resolve the documented data/backfill and HDF-limit inputs before irreversible schema decisions. Complete one tested checkpoint at a time and keep status/contracts truthful.
