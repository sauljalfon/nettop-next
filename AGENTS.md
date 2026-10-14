# Net-Top Next

Build the pathfinding-centered infrastructure manager. Start at [docs/README.md](docs/README.md); where the project is and what to work on is only in [docs/status.md](docs/status.md); the process is [docs/way-of-work.md](docs/way-of-work.md); decisions are in [docs/decisions.md](docs/decisions.md).

- Backend: Go, standard HTTP library; frontend: React, TypeScript, React Flow.
- Keep traversal independent of HTTP, storage, and canvas state.
- Installed topology, proposed topology, and visual layout are separate concepts.
- Do not infer connectivity from screen positions or roles from names.
- Active devices own exactly one network. Passive panels/HDFs remain shared; bridge only the same subpanel/local position across front/rear.
- Find all reachable AGG and BB routes; stop at active endpoints, retain BB results when AGGs exist, and preserve actual roles.
- Conceptual and physical views share endpoint identities and trace context. Conceptual is a connected map; physical uses site/node/rack/port drill-down.
- Write failing tests before changing behaviour. Test behaviour, not internal implementation details.
- Work one item at a time, in small working checkpoints, with an approved design first and a review after each (way-of-work.md). Implement only the current item named in docs/status.md; later roadmap items are not implicit scope.
- Run Go tests, frontend tests, type checking, and the production build before handoff.
- Never present sample data, an in-memory preview, or a local layout edit as a persisted installation.
- Do not introduce backend persistence or authentication implicitly; schema changes are explicit, reviewed migrations.
- Keep the API contract (`api/openapi.yaml`, `frontend/src/shared/types.ts`), migrations and docs in step with what runs, in the same change. One fact lives in one document (way-of-work.md, "Keeping the docs true").
- A clickable demo is design material for the owner to approve (D30); it never replaces implementing and testing the agreed behaviour.
- Preserve the difference between locked decisions, fictional test data and open questions. Check docs/decisions.md before reviving a superseded approach.
- No automatic commits or remote publishing: commit, merge and push only when the owner asks.
