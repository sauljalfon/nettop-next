# Implementation documentation — start here

This directory is the durable handoff for Opus 5.5 or another implementation agent. It preserves the planning/design review without requiring the original chat or the retired mockups.

## Reading order

1. Read the repository's [agent guide](../AGENTS.md).
2. Read [agent-handoff.md](agent-handoff.md) for the task, locked decisions, starting checkpoint, and copyable implementation brief.
3. Read [architecture.md](architecture.md) and [ui-spec.md](ui-spec.md): these are the approved behavioral contracts.
4. Read [design-decisions.md](design-decisions.md): this explains which directions were superseded and why.
   Read [visual-brief.md](visual-brief.md) to reconstruct the approved screens without the removed screenshots.
5. Read [acceptance-example.md](acceptance-example.md) and [acceptance-tests.md](acceptance-tests.md): these turn the approved workflow into exact inventory, cables, routes, and verification cases.
6. Read [current-status.md](current-status.md) and [backend-contract-notes.md](backend-contract-notes.md): distinguish the existing prototype from the target product.
7. Follow [implementation-plan.md](implementation-plan.md) (M1, M2, M3, M3.1, and M4 are complete; continue with M5), and use [verification-guide.md](verification-guide.md).
8. Consult [legacy-reference.md](legacy-reference.md) when interpreting legacy HDF/port behavior or the physical explorer.

## Document responsibilities

| Document | Purpose | Status |
| --- | --- | --- |
| [agent-handoff.md](agent-handoff.md) | Self-contained briefing and next-agent instructions | Handoff |
| [architecture.md](architecture.md) | Domain, pathfinding, persistence, and scale boundaries | Approved target |
| [ui-spec.md](ui-spec.md) | Conceptual/physical interaction and visual acceptance | Approved target |
| [design-decisions.md](design-decisions.md) | Decision history, rejected directions, rationale | Design record |
| [visual-brief.md](visual-brief.md) | Visual composition, HDF states, physical screens, and semantic cues | Reconstruction brief; not pixel/token requirements |
| [acceptance-example.md](acceptance-example.md) | Exact fictional inventory and cable/bridge identities | Test/design reference, not production data |
| [acceptance-tests.md](acceptance-tests.md) | Behavior matrix for implementation verification | Target acceptance |
| [backend-contract-notes.md](backend-contract-notes.md) | Current API/schema and decisions required by M1/M2 | Baseline facts plus explicitly marked design notes |
| [implementation-plan.md](implementation-plan.md) | M1–M7 scope, order, and handoff criteria | Roadmap; not a completion report |
| [current-status.md](current-status.md) | What the runnable code actually does | Baseline status; update as checkpoints ship |
| [verification-guide.md](verification-guide.md) | Local setup, tests, data isolation, handoff checks | Operational reference |
| [legacy-reference.md](legacy-reference.md) | Useful legacy files and behaviors to carry forward | Reference; not a competing architecture |

`api/openapi.yaml` documents the **current executable API**. Update it when implementation changes, not merely to claim future features are available.

## Authority and unresolved decisions

The architecture/UI documents govern behavior. The acceptance example supplies fictional data for tests; it does not prescribe production site names, equipment IDs, network names, rack heights, or universal port counts. Historical proposals are not current requirements.

If documents or code conflict, consult the locked decisions in the handoff and flag a genuine conflict before changing semantics. Do not silently mix competing models. Keep the data/import/HDF-limit questions in [implementation-plan.md](implementation-plan.md) explicit until the user answers them.

Mockup exploration is complete. Do not regenerate the removed demos or interpret missing screenshots as permission to redesign the product. Implement and test the approved workflow.
