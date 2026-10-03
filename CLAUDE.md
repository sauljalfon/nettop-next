# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

`AGENTS.md` holds the binding project rules (domain invariants, test-first, no auto-commits). The docs in `docs/` are the implementation contract; start at `docs/README.md` → `docs/agent-handoff.md`, which lists the reading order and the **locked decisions that must not be reopened**. `docs/current-status.md` says what the code actually does today. The target product (networks, BB discovery, HDF subpanels, connected map, physical explorer) is mostly **not implemented yet**; the next checkpoint is **M1** in `docs/implementation-plan.md`. Its open questions are answered, and its representation choices and step order are fixed under "M1 implementation design" and "M1 steps" in that file. Work one step at a time and stop for review after each.

## Commands

Local Postgres (from repo root): `docker compose up -d --wait` (port 55432). Go does not load `.env`; export variables yourself:

```sh
export DATABASE_URL='postgres://nettop:nettop-local@127.0.0.1:55432/nettop?sslmode=disable'
export TEST_DATABASE_URL="$DATABASE_URL"
```

Backend (`backend/`):

```sh
go run ./cmd/db migrate      # repeatable
go run ./cmd/db seed         # only on an empty DB; refuses to overwrite
go run ./cmd/api             # :8080 (HTTP_ADDR to change)
go test -race ./...
go vet ./...
go test ./internal/pathfinding -run TestName   # single test
```

Without `TEST_DATABASE_URL`, PostgreSQL tests skip. A green run with skipped DB tests does not verify migrations or round trips. DB tests use unique schemas and drop them afterward.

Frontend (`frontend/`):

```sh
npm ci
npm run dev                  # http://127.0.0.1:5174, proxies /api to :8080 (API_PROXY_TARGET)
npm test                     # vitest
npx vitest run src/features/pathfinding/projection.test.ts -t "name"   # single test
npm run typecheck
npm run build                # tsc --noEmit + vite build
npm run format:check         # prettier; `npm run format` to fix
npm run test:e2e             # Playwright; `npx playwright test e2e/planning.spec.ts` for one file
```

Playwright starts `backend/cmd/testserver` (isolated schema, migrate+seed, cleaned on shutdown) on 18080 and Vite on 5175, so it can run alongside dev. Before handoff, run Go tests, frontend tests, typecheck, and build.

When `api/openapi.yaml` changes, lint it from `frontend/` with `npx --yes @redocly/cli lint ../api/openapi.yaml --extends minimal`.

## Architecture

Data flow: PostgreSQL → `persistence` loads a `topology.Snapshot` (installed, or installed + plan overlay) → pure domain packages operate on the snapshot → `httpapi` serializes. The frontend fetches via `src/shared/api.ts` (TanStack Query) and projects results onto React Flow.

- `internal/topology`: domain types (`Snapshot` of equipment, endpoints, links with context/revision) and `Validate`. Roles are explicit fields (`access`, `aggregation`, `passive`, with `backbone` planned). Never infer roles from names.
- `internal/pathfinding`: pure BFS over physical continuity only. Edges are external cables plus internal front/rear bridges at the same position. Sibling ports on a device never create edges. It has no dependencies on HTTP, storage, or canvas.
- `internal/planning`: plans are revisioned overlays. `Apply(base, plan)` produces a proposed snapshot without mutating installed; `Execute` applies commands (`add_equipment`, `add_cable`, `move_equipment`) with occupancy/placement validation. Installed topology, proposed topology, and visual layout are separate models.
- `internal/persistence`: pgx repositories with transaction discipline and draft/base revision conflict checks. `httpapi.Repository` is the interface boundary, so HTTP tests can use fakes.
- `migrations/`: embedded and checksummed SQL. Append new files and never edit applied ones; the runner rejects changed checksums. Startup never migrates or seeds automatically.
- `internal/sample`: explicit development seed fixtures. It is not real inventory and not the M-series acceptance fixture (that one is in `docs/acceptance-example.md`).
- Frontend: `src/app/App.tsx` is a large prototype shell. The current nested site/node/rack whiteboard is **superseded** (M3 replaces it with a connected conceptual map). Put new UI in feature-scoped folders under `src/features/`, not in `App.tsx`. Keep drag state local to the canvas: no per-pointer HTTP calls or app-wide re-renders.

## Keeping things in sync

With each completed checkpoint, update `api/openapi.yaml` (current executable API only, not future features), `frontend/src/shared/types.ts`, and `docs/current-status.md`. Don't claim behavior that isn't runnable.
