# Piece 0: Container Images — Implementation Guide

> **How this guide is used:** the owner implements every step by hand: writes the files, runs the commands. Claude explains, reviews what the owner wrote, and helps debug from pasted output. Steps therefore give the goal, the concepts, an outline of what each file must contain, and the checks, not finished code. Stop after each task for review. No automatic commits: the owner commits when a task passes review.

**Goal:** package Net-Top as two container images (`nettop-api`, `nettop-web`) that run anywhere with a container runtime and no internet, and prove them locally in a production-like setup.

**Architecture:** two multi-stage Dockerfiles. The build stage compiles; the final stage keeps only the result. Locally, a compose file runs Postgres, a one-shot migration, the API, the web server, and Traefik routing `/api` to the API and everything else to the web, the same routing the cluster ingress will do.

**Tech stack:** Docker (on the owner's Intel Mac), Go 1.26, Node (the major version the owner uses locally: `node -v` shows 26), nginx (unprivileged image), Traefik v3, PostgreSQL 17.

**Spec:** `docs/superpowers/specs/2026-10-06-infrastructure-design.md`, section 6.

## Global constraints

- Images are built for `linux/amd64`, always passed explicitly with `--platform linux/amd64`.
- Containers run as a non-root user.
- Base images pinned to an exact version tag (and later a digest), never `latest`.
- The migration step runs `db migrate`, then `db init`, as two steps. `db seed` loads the fictional acceptance fixture: allowed on the owner's Mac for local checks, never in any cluster environment.
- No secrets or `.env` inside any image.
- The built frontend loads nothing from the internet (no CDN fonts, scripts or icons).
- PostgreSQL major version 17, matching `compose.yaml`.
- Readiness uses the existing `GET /api/health` (pings the database). Liveness must not depend on the database.

## Changed since this guide was written (P1, 2026-10-11)

Read these first; the steps below already include them.

1. **`APP_ENV` is required.** `cmd/api` refuses to start unless `APP_ENV` is `dev`, `test` or `prod` ("APP_ENV must be dev, test or prod"). Do **not** bake it into the image: one image runs in test and prod. Pass it at run time (`-e APP_ENV=dev` locally; the Deployment sets `test` or `prod` in the cluster).
2. **A new database needs `db init` after `db migrate`.** `migrate` creates the tables but no installed root, and `cmd/api` refuses to start on such a database ("database is not initialized; run `go run ./cmd/db migrate` and then `go run ./cmd/db init`"). `init` is safe to repeat: on an initialized database it prints "already initialized" and exits 0. So the deployment runs `migrate`, then `init`, on every rollout, and never `seed`.
3. **No shell in the API image.** distroless has no `sh`, so `migrate && init` cannot be one container command. Run them as two one-shot steps (two compose services; later two Job containers or an init container plus the Job).
4. **`GET /api/health` now also returns `environment`:** `{"environment":"dev","status":"ok","storage":"postgresql"}`.
5. **`seed` is refused after `init`.** To see fictional data in the throwaway local setup, seed **before** `init` runs (Task 3, step 4).

## Facts from the repo (checked 2026-10-06, updated 2026-10-11)

- `backend/go.mod`: `go 1.26.0`. Entry points: `backend/cmd/api`, `backend/cmd/db` (`migrate`, `init` or `seed`, one argument), `backend/cmd/testserver` (not shipped).
- Migrations are embedded in the binary (`backend/migrations/migrate.go`, `//go:embed *.sql`), so the image needs no SQL files beside it.
- `cmd/api` listens on `HTTP_ADDR`, **default `127.0.0.1:8080`**: inside a container that address is unreachable from outside. The image must set `HTTP_ADDR=:8080`.
- `cmd/api` pings the database at startup and **exits with status 1** if it cannot reach it within 10 seconds (`backend/internal/persistence/store.go`). In Kubernetes this means restarts with backoff until the database is up, which is acceptable.
- `cmd/api` drains on SIGTERM with a 5-second timeout.
- `.env` is loaded by searching from the working directory upward. A missing `.env` is not an error.
- `frontend`: `npm run build` = `tsc --noEmit && vite build`, output in `frontend/dist`. No client-side router: one page at `/`.

## Review focus

The failure modes most likely to bite, each pinned by a check in the owning task:

1. API listens on `127.0.0.1` inside the container, so nothing can reach it. Check in Task 1, step 6.
2. `.env` (with a real `DATABASE_URL`) or other secrets copied into an image. Checks in Task 1, step 8, and Task 2, step 6.
3. The built frontend references an external URL that a closed network cannot reach. Check in Task 2, step 5.
4. Database down: at startup the API must exit; at runtime `/api/health` must return 503 while the process stays up. Checks in Task 1, step 7, and Task 3, step 6.
5. Image built for the wrong architecture or running as root. Checks in Task 1, step 8.

---

### Task 1: API image (`nettop-api`)

**Files (owner creates):**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`

**Produces:** image `nettop-api:dev` containing `/app/api` and `/app/db`, listening on `:8080`, user non-root. Task 3 uses these names.

**Concepts to understand first:**
- *Multi-stage build:* a Dockerfile can have several `FROM` lines. Each starts a new stage, and only the last stage becomes the image. Earlier stages are thrown away, so the Go toolchain never ships. Read: https://docs.docker.com/build/building/multi-stage/
- *Build context:* the folder sent to Docker when building (here `backend/`). `.dockerignore` excludes files from it. Read: https://docs.docker.com/build/concepts/context/
- *Static Go binary:* `CGO_ENABLED=0` makes Go produce a binary with no C library dependencies, so it runs in an image with nothing else in it.
- *distroless static:* a base image with no shell and no package manager, only CA certificates, time zone data and a `nonroot` user. Read: https://github.com/GoogleContainerTools/distroless
- *Layer caching:* copying `go.mod`/`go.sum` and downloading modules *before* copying the source means a code change does not re-download every module.

- [ ] **Step 1: Write `backend/.dockerignore`.** It must exclude: `bin/`, any `.env` files, test output, and editor or OS files (`.DS_Store`). Note: the repo-root `.env` is outside the `backend/` context anyway; the ignore file is the second guard.

- [ ] **Step 2: Write the build stage.** Outline:
  1. `FROM` the official Go image whose version matches `go.mod` (1.26.x), pinned to an exact tag, named as a stage (for example `AS build`).
  2. Set the working directory.
  3. Copy `go.mod` and `go.sum`, run `go mod download`.
  4. Copy the rest of the source.
  5. Build both commands with `CGO_ENABLED=0 GOOS=linux GOARCH=amd64`, adding `-trimpath` and `-ldflags="-s -w"` (smaller binary, no local paths inside). Output `/out/api` and `/out/db`.

- [ ] **Step 3: Write the final stage.** Outline:
  1. `FROM` `gcr.io/distroless/static-debian12:nonroot` (pinned tag).
  2. Copy `/out/api` and `/out/db` from the build stage to `/app/`.
  3. `ENV HTTP_ADDR=:8080`, `EXPOSE 8080`. Do **not** set `APP_ENV` here (it differs per environment).
  4. `USER nonroot:nonroot` (already the default in the `nonroot` tag; write it anyway, so it is explicit).
  5. `ENTRYPOINT ["/app/api"]`. The migration steps override the entrypoint to `/app/db` with the argument `migrate`, then `init`.

- [ ] **Step 4: Build.**
  Run, from `backend/`: `docker build --platform linux/amd64 -t nettop-api:dev .`
  Expected: build succeeds. `docker image ls nettop-api` shows a size around 20–40 MB.

- [ ] **Step 5: Run the migration against your local Postgres.** Your dev database (`docker compose up -d --wait` from the repo root, port 55432) is reachable from a container at `host.docker.internal`.
  Run: `docker run --rm -e DATABASE_URL='postgres://<user>:<password>@host.docker.internal:55432/<db>?sslmode=disable' --entrypoint /app/db nettop-api:dev migrate`
  (Take user, password and database name from your `.env`.)
  Expected: `migrate completed`. Run it again: still succeeds (migrations are repeatable).
  Then run the same command with `init` instead of `migrate`. Your dev database is already seeded, so expected: `already initialized`, exit status 0.

- [ ] **Step 6: Run the API and call the health check.**
  Run: `docker run --rm -p 8080:8080 -e APP_ENV=dev -e DATABASE_URL='…same…' nettop-api:dev`, then in another terminal `curl -i http://localhost:8080/api/health`
  Expected: `200` with `{"environment":"dev","status":"ok","storage":"postgresql"}`.
  Also run it once **without** `-e APP_ENV=dev`: expected `APP_ENV must be dev, test or prod` and exit status 1. If `curl` cannot connect, `HTTP_ADDR` is still the loopback default (review focus 1).

- [ ] **Step 7: Prove startup with no database exits.**
  Run the same `docker run` (with `-e APP_ENV=dev`) with `DATABASE_URL` pointing to a port where nothing listens (for example `:55999`).
  Expected: after about 10 seconds, a `database connection failed` log line and exit status 1 (`echo $?` after it stops).

- [ ] **Step 8: Inspect the image.**
  - Architecture and user: `docker image inspect nettop-api:dev --format '{{.Architecture}} {{.Config.User}}'` → `amd64 nonroot:nonroot`.
  - Contents: `docker create --name inspect-api nettop-api:dev && docker export inspect-api | tar -t | grep -v '^etc/\|^usr/\|^var/' ; docker rm inspect-api` → you should see `app/api` and `app/db`, and **no** `.env`, no `.go` files.

- [ ] **Step 9: Review.** Paste `backend/Dockerfile`, `backend/.dockerignore`, and the outputs of steps 4 to 8. Claude reviews: stage separation, pinning, `HTTP_ADDR`, non-root, ignore list, image size.

---

### Task 2: Web image (`nettop-web`)

**Files (owner creates):**
- Create: `frontend/Dockerfile`
- Create: `frontend/.dockerignore`
- Create: `frontend/nginx.conf` (the server block)

**Produces:** image `nettop-web:dev` serving the built frontend on port `8080` as a non-root user. Task 3 uses it.

**Concepts to understand first:**
- *What `npm run build` produces:* plain HTML, JS and CSS in `dist/`. The browser runs React; the server only sends files.
- *`npm ci`:* installs exactly what `package-lock.json` says, the right command for reproducible builds.
- *nginx-unprivileged:* the official nginx variant that runs as a non-root user and listens on 8080. Read: https://hub.docker.com/r/nginxinc/nginx-unprivileged
- *Caching:* Vite puts a content hash in asset file names (`assets/index-3f2a.js`), so those can be cached for a long time, while `index.html` must not be cached or users keep an old version after an update.

- [ ] **Step 1: Write `frontend/.dockerignore`.** Exclude: `node_modules/`, `dist/`, `e2e/` output folders (`test-results/`, `playwright-report/`), `coverage/`, `.env*`, `.DS_Store`. Excluding `node_modules` matters: your Mac's copy must not be sent into a Linux build.

- [ ] **Step 2: Write `frontend/nginx.conf`.** Outline of one `server` block:
  1. `listen 8080;`
  2. `root /usr/share/nginx/html;`
  3. `location = /index.html` (and `/`): send `Cache-Control: no-cache`.
  4. `location /assets/`: send a long cache header (`Cache-Control: public, max-age=31536000, immutable`).
  5. No `/api` handling: in the cluster, Traefik sends `/api` to the API before nginx sees it (spec section 6).

- [ ] **Step 3: Write `frontend/Dockerfile`.** Outline:
  1. Build stage: `FROM` the official Node image, the same major version you use locally, pinned (a `-bookworm-slim` or `-alpine` tag), `AS build`.
  2. Copy `package.json` and `package-lock.json`, run `npm ci`.
  3. Copy the rest, run `npm run build` (this also type-checks).
  4. Final stage: `FROM nginxinc/nginx-unprivileged:<pinned version>-alpine`.
  5. Copy `nginx.conf` to `/etc/nginx/conf.d/default.conf`.
  6. Copy `/app/dist` (or wherever your build stage put it) from the build stage to `/usr/share/nginx/html`.
  7. `EXPOSE 8080`. Keep the image's own non-root user.

- [ ] **Step 4: Build and run.**
  Run, from `frontend/`: `docker build --platform linux/amd64 -t nettop-web:dev .` then `docker run --rm -p 8081:8080 nettop-web:dev`
  Open `http://localhost:8081`. Expected: the page shell loads. API calls fail (nothing routes `/api` yet). That is Task 3.
  Check headers: `curl -sI http://localhost:8081/ | grep -i cache-control` → `no-cache`; the same for one file under `/assets/` → the long cache header.

- [ ] **Step 5: The no-CDN check (review focus 3).**
  From `frontend/` after a local `npm run build`: `grep -rhoE "https?://[a-zA-Z0-9.-]+" dist | sort -u`
  Expected: nothing, or only addresses that are not fetched (for example XML namespace URLs such as `http://www.w3.org/2000/svg`). Also open the page with DevTools → Network and confirm every request goes to `localhost`. Paste the list for review.

- [ ] **Step 6: Inspect the image.**
  `docker image inspect nettop-web:dev --format '{{.Architecture}} {{.Config.User}}'` → `amd64` and a non-root user (nginx-unprivileged uses uid `101`).
  `docker run --rm --entrypoint sh nettop-web:dev -c 'ls /usr/share/nginx/html; ls -a / | grep env'` → the built files, and no `.env`.

- [ ] **Step 7: Review.** Paste the three files and the outputs of steps 4 to 6.

---

### Task 3: Production-like local run

**Files (owner creates):**
- Create: `infra/local/compose.yaml`
- Create: `infra/local/traefik.yaml` (Traefik's dynamic routing file)

**Consumes:** `nettop-api:dev` (Task 1), `nettop-web:dev` (Task 2).

**Why:** this is the first time the pieces run together the way the cluster will run them: a fresh database, a one-shot migration before the API starts, and Traefik in front, routing by path. The cluster later replaces compose with Kubernetes, but the shape stays the same.

**Concepts to understand first:**
- *Compose dependencies:* `depends_on` with `condition: service_healthy` (wait for Postgres) and `condition: service_completed_successfully` (wait for the migration to finish). Read: https://docs.docker.com/compose/how-tos/startup-order/
- *Traefik routers and services:* a router matches requests (for example `PathPrefix(`/api`)`) and sends them to a service (a backend address). Here the routes come from a file; in the cluster they come from an Ingress. Read: https://doc.traefik.io/traefik/providers/file/

- [ ] **Step 1: Write `infra/local/compose.yaml`.** Six services, using a separate compose project so it does not touch your dev database:
  1. `postgres`: `postgres:17-alpine`, user/password/database set here (local test values only), a healthcheck with `pg_isready`, its own named volume. **No published port** (only the other containers need it).
  2. `migrate`: image `nettop-api:dev`, entrypoint `/app/db`, command `migrate`, `DATABASE_URL` pointing to `postgres:5432`, `depends_on` postgres healthy, `restart: "no"`.
  3. `init`: like `migrate`, but command `init`, and `depends_on` migrate **completed successfully**. (Two services because the image has no shell.)
  4. `api`: image `nettop-api:dev`, same `DATABASE_URL`, `APP_ENV: dev`, `depends_on` init completed successfully. No published port.
  5. `web`: image `nettop-web:dev`. No published port.
  6. `traefik`: the official Traefik v3 image, pinned; publishes `8088:80`; mounts `traefik.yaml` read-only; static configuration (in `command:`) enabling an entrypoint on `:80` and the file provider pointing at the mounted file.

- [ ] **Step 2: Write `infra/local/traefik.yaml`.** Two routers on the entrypoint:
  1. `PathPrefix(`/api`)` → service `api` at `http://api:8080`.
  2. Everything else (`PathPrefix(`/`)`) → service `web` at `http://web:8080`.
  Traefik picks the longer rule first, so `/api` wins over `/`.

- [ ] **Step 3: Start it.**
  Run, from `infra/local/`: `docker compose -p nettop-local up -d`, then `docker compose -p nettop-local ps -a`
  Expected: `migrate` and `init` exited with code 0; `postgres`, `api`, `web`, `traefik` running.
  `curl -i http://localhost:8088/api/health` → 200 with `"environment":"dev"`. The header shows the **DEV** badge.

- [ ] **Step 4: Use the app.** Open `http://localhost:8088`. The database is empty (init created only the root), so the app shows an empty topology: exactly what production looks like on day one. To see fictional data locally only, start over and seed **before** init runs (seed is refused after init): `docker compose -p nettop-local down -v`, then `docker compose -p nettop-local up -d postgres migrate`, wait for migrate to exit, then `docker compose -p nettop-local run --rm --entrypoint /app/db migrate seed`, then `docker compose -p nettop-local up -d` (init then prints "already initialized"). This is allowed here, on your Mac. It never runs in the cluster.
  Expected: the map loads and traces work through `:8088`, so routing works.

- [ ] **Step 5: Kill and restart the API.**
  `docker compose -p nettop-local stop api`: the page's API calls fail. `docker compose -p nettop-local start api`: once it is up, the next API call succeeds (refresh the page if it shows an error state). This is what a pod restart looks like to a user.

- [ ] **Step 6: Database down at runtime (review focus 4).**
  `docker compose -p nettop-local stop postgres`, then `curl -i http://localhost:8088/api/health` → **503**, and `docker compose -p nettop-local ps api` → still running. This is why liveness must not use `/api/health`: the process is fine, only the database is gone. Start postgres again → health returns 200 without restarting the API.

- [ ] **Step 7: Clean up.** `docker compose -p nettop-local down -v` (removes the throwaway database).

- [ ] **Step 8: Review.** Paste the two files and the outputs of steps 3, 5 and 6.

---

### Task 4: Record the results

**Files (owner edits):**
- Modify: `docs/superpowers/specs/2026-10-06-infrastructure-design.md`, section 6: replace "To verify in piece 0" with the confirmed behavior (API exits on startup without a database; `HTTP_ADDR=:8080` set in the image).
- Optional: add a short `infra/README.md` listing the build commands from Tasks 1 to 3.

- [ ] **Step 1: Update the spec line** and add any surprise from Tasks 1 to 3 (image sizes, Node version chosen, anything that failed).
- [ ] **Step 2: Final check before handoff:** from `backend/`: `go test -race ./...` and `go vet ./...`; from `frontend/`: `npm test`, `npm run typecheck`, `npm run build`. Expected: all green (the Dockerfiles change no code, so nothing should break).
- [ ] **Step 3: Commit, if you choose to.** Suggested message: `Piece 0: container images for API and web`. Files: the two Dockerfiles, two `.dockerignore`, `frontend/nginx.conf`, `infra/local/`, the spec edit.

**Done when:** both images build for amd64, run non-root, carry no secrets, the frontend makes no external requests, and the six-service local run works, including the database-down behavior.

**Next:** piece 1, the thin slice (spec section 4): the VM host, single-node k3s from the air-gap files, the Helm chart, the first signed bundle, and `deploy`.
