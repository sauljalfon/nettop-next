# Net-Top Next

Build the approved pathfinding-centered infrastructure manager. Start at `docs/README.md` and `docs/agent-handoff.md`, then read `docs/architecture.md`, `docs/ui-spec.md`, `docs/implementation-plan.md`, and `docs/current-status.md`. Use `docs/acceptance-example.md` and `docs/acceptance-tests.md` for exact routes and verification. The current nested-canvas prototype is not the final conceptual-map contract.

- Backend: Go, standard HTTP library; frontend: React, TypeScript, React Flow.
- Keep traversal independent of HTTP, storage, and canvas state.
- Installed topology, proposed topology, and visual layout are separate concepts.
- Do not infer connectivity from screen positions or aggregation roles from names.
- Active devices own exactly one network. Passive panels/HDFs remain shared; bridge only the same subpanel/local position across front/rear.
- Find all reachable AGG and BB routes; stop at active endpoints, retain BB results when AGGs exist, and preserve actual roles.
- Conceptual and physical views share endpoint identities and trace context. Conceptual is a connected map; physical uses site/node/rack/port drill-down.
- Write failing tests before changing domain rules. Test behavior, not internal implementation details.
- Keep changes in small working checkpoints. Run Go tests, frontend tests, type checking, and production build before handoff.
- Never present sample data, an in-memory preview, or a local layout edit as a persisted installation.
- Do not introduce backend persistence or authentication implicitly; use the architecture roadmap and explicit migrations.
- Keep API contracts, migrations, and status docs synchronized with completed checkpoints. Implement only the next checkpoint in docs/implementation-plan.md (currently M4.1, then M5); later items are not implicit scope.
- Mockup exploration is complete. Do not add generated demos/screenshots as substitutes for implementing and testing the agreed workflow.
- Preserve the distinction between locked user decisions, fictional test data, and unresolved implementation inputs. Consult `docs/design-decisions.md` before reviving a superseded approach and `docs/backend-contract-notes.md` before assuming the current API already supports the target model.
- No automatic commits or remote publishing.
