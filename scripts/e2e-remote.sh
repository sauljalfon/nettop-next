#!/usr/bin/env bash
# Runs the browser tests on a remote Linux machine instead of this one.
#
#   scripts/e2e-remote.sh                      # the whole suite
#   scripts/e2e-remote.sh e2e/rack.spec.ts     # any playwright arguments
#
# It copies this working folder (uncommitted changes included, never .env) to
# the machine, installs packages when package-lock.json or go.sum changed, runs
# Playwright there and copies test-results/ back when something failed.
# Settings, in .env at the repository root (see .env.example):
#   E2E_REMOTE              user@host (required)
#   E2E_REMOTE_KEY          ssh key file (optional)
#   E2E_REMOTE_WORKERS      lanes on the remote machine (default 8)
#   E2E_REMOTE_DATABASE_URL its TEST_DATABASE_URL (default: local Postgres on 5432)
# The machine needs Go, Node, Postgres and Playwright's Chromium with its system
# libraries; tools under ~/.local/opt/*/bin are put on the PATH. It must never be
# a machine that holds real data: every lane creates and drops its own schema.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$root/.env" ]]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^E2E_REMOTE ]] && [[ -z "${!key:-}" ]] && export "$key=$value"
  done < <(grep -E '^E2E_REMOTE[A-Z_]*=' "$root/.env")
fi
: "${E2E_REMOTE:?set E2E_REMOTE=user@host in .env}"
workers="${E2E_REMOTE_WORKERS:-8}"
database="${E2E_REMOTE_DATABASE_URL:-postgres://nettop:nettop-local@127.0.0.1:5432/nettop?sslmode=disable}"
ssh_cmd=(ssh -o BatchMode=yes)
[[ -n "${E2E_REMOTE_KEY:-}" ]] && ssh_cmd+=(-i "${E2E_REMOTE_KEY/#\~/$HOME}" -o IdentitiesOnly=yes)
# One folder per local checkout, so two checkouts never share one.
dir="net-top-e2e/$(basename "$root")"

echo "› copying $root to $E2E_REMOTE:$dir"
"${ssh_cmd[@]}" "$E2E_REMOTE" "mkdir -p $dir"
rsync -az --delete -e "${ssh_cmd[*]}" \
  --exclude .git --exclude node_modules --exclude 'test-results*' \
  --exclude playwright-report --exclude dist --exclude .env \
  "$root/" "$E2E_REMOTE:$dir/"

args=$(printf '%q ' "$@")
status=0
"${ssh_cmd[@]}" "$E2E_REMOTE" bash -s <<EOF || status=$?
set -euo pipefail
for bin in \$HOME/.local/opt/*/bin; do PATH="\$bin:\$PATH"; done
export PATH TEST_DATABASE_URL='$database' E2E_WORKERS='$workers'
cd ~/$dir
stamp=\$(cat frontend/package-lock.json backend/go.sum | sha1sum | cut -c1-12)
if [[ ! -d frontend/node_modules || "\$(cat .deps-stamp 2>/dev/null)" != "\$stamp" ]]; then
  echo "› installing packages"
  (cd frontend && npm ci --silent) && (cd backend && go mod download) && echo "\$stamp" > .deps-stamp
fi
cd frontend
echo "› playwright on \$E2E_WORKERS lanes"
npx playwright test $args
EOF

if [[ $status -ne 0 ]]; then
  echo "› failed: copying test-results back to frontend/test-results-remote/"
  rsync -az --delete -e "${ssh_cmd[*]}" "$E2E_REMOTE:$dir/frontend/test-results/" "$root/frontend/test-results-remote/" || true
fi
exit $status
