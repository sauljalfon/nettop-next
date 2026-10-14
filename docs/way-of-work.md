# Way of work

How a piece of work goes from an idea to the server. It is the routine used for P2 (2026-10-13/14), written down so every session follows the same steps. The binding rules are in [AGENTS.md](../AGENTS.md); this file is the process around them.

## Who does what

| Who | Does |
| --- | --- |
| **Owner** | Decides what is built and how it should look and behave; approves every design; says when to commit, merge, push and deploy; runs the server. |
| **Opus** (the main Claude session) | Reads the docs and code, asks the questions that matter, proposes the design, writes the plan and the prompts, reviews every result (reads the diff, reruns the checks, looks at the screenshots, probes edge cases), makes small review fixes itself, keeps the docs true, commits and pushes when the owner asks. |
| **Sonnet** (a separate Claude session) | Implements one prompt at a time, test-first, and reports. Never commits. |

Infrastructure (the cluster in [infrastructure.md](infrastructure.md)) works differently: the owner writes and runs everything by hand, and Claude explains, outlines, reviews and helps debug from pasted output.

## The cycle for one item

1. **Pick** the current item from the "Now / Next" box in [status.md](status.md). Its entry in [roadmap.md](roadmap.md) holds what is already decided.
2. **Read** before proposing: AGENTS.md, CLAUDE.md, the roadmap entry, the decisions it touches in [decisions.md](decisions.md), and the code it changes.
3. **Design, then approval.**
   - A new screen or a new way of working starts with a **clickable demo** on data like the owner's; the owner approves the demo before anything else.
   - Otherwise Opus writes a **short design in chat**: what the user will see, the rules, how it is built, how it is tested, and any decision the owner must make (with a recommendation). Questions are asked one at a time and in plain words, not code names.
   - Nothing is implemented before the owner says yes.
4. **Record the design.** The approved design (with the date and the owner's answers) goes into the item's roadmap entry; a new lasting rule goes into decisions.md.
5. **Plan** (only for work of more than one prompt): `docs/plans/YYYY-MM-DD-<name>.md` with the tasks in order, each with its files, interfaces, the failing test first, the code, and the checks. Small items go straight to a prompt.
6. **Prompt Sonnet**, one task or one part at a time (backend and frontend are separate prompts when both change). Every prompt has:
   - what to read first (AGENTS.md, CLAUDE.md, the roadmap entry or plan, the files to change);
   - the approved design, with exact names, messages and IDs;
   - the order: tests first, see them fail, then the code;
   - the files it may touch, and "do not commit";
   - "if the design cannot work as written, stop and report the exact problem; do not invent another behaviour";
   - the commands to verify (below) and screenshots to look at;
   - the report: the red runs, the results, `git diff --stat` and the diff, what the screenshots show, and anything done differently and why.
7. **Review.** Opus reads the whole diff, reruns the tests, looks at the screenshots, and tries the inputs a user is likely to hit (empty data, long or Hebrew names, swaps, refetches, stale drafts). The result is either **approved**, or a **fix prompt** that names each problem, its cause and the fix. Small polish (a CSS value, a comment) Opus fixes itself and says so.
8. **Docs, in the same change:** see "Keeping the docs true" below.
9. **Commit** when the owner says so: one commit per item (or per part when parts are reviewed separately), a message that says what the user gets, and the co-author lines. Only the item's files are staged; unrelated files are left alone.
10. **Merge, push, deploy** when the owner says so: work happens on a branch, `main` is fast-forwarded to it, both are pushed, and the server is updated as in [infra/compose/README.md](../infra/compose/README.md) ("Update to a new version": backup first). Opus tells the owner whether the update has a migration.
11. **Close the item:** its roadmap entry moves to `docs/history/`, its plan to `docs/history/plans/`, and status.md describes what now runs and names the next item.

## Verifying

From `backend/`: `go test -race ./...` and `go vet ./...` (the PostgreSQL tests run only with `TEST_DATABASE_URL`; say whether they ran). From `frontend/`: `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`, and `npm run test:e2e` (or the specs the change touches, then the whole suite before approval). When `api/openapi.yaml` changes: `npx --yes @redocly/cli lint ../api/openapi.yaml --extends minimal`. Details in [testing.md](testing.md).

## Keeping the docs true

One question, one document. Never write the same fact in two places; link instead.

| Question | Document |
| --- | --- |
| What is this and how do I run it locally? | [README.md](../README.md) |
| Rules that always apply | [AGENTS.md](../AGENTS.md) |
| Commands and code map for Claude | [CLAUDE.md](../CLAUDE.md) |
| Where are we, what runs, what is next? | [status.md](status.md), the only place that says it |
| What is still to be built? | [roadmap.md](roadmap.md) |
| What did we decide, and why? | [decisions.md](decisions.md) |
| How the product works (domain, pathfinding, screens) | [architecture.md](architecture.md), [ui-spec.md](ui-spec.md) |
| The fictional test data and the test matrix | [acceptance-example.md](acceptance-example.md), [acceptance-tests.md](acceptance-tests.md) |
| How to test and verify | [testing.md](testing.md) |
| The current API | `api/openapi.yaml` (and `frontend/src/shared/types.ts`) |
| Deploying to the test server | [infra/compose/README.md](../infra/compose/README.md) |
| The production cluster | [infrastructure.md](infrastructure.md) |
| Active plans | `docs/plans/` |
| Everything finished | `docs/history/`: kept for reference, never the source of truth |

Each finished item updates, in the same commit:
- **status.md**: what now runs (by area), the "Now / Next" box, known limits.
- **roadmap.md**: remove the item (move it to history).
- **decisions.md**: any new or changed decision, with its date.
- **`api/openapi.yaml` and `frontend/src/shared/types.ts`** when the API changes (only what runs).
- **CLAUDE.md** when commands or the code map change.
- architecture.md / ui-spec.md when a rule or a screen's behaviour changes.

AGENTS.md, CLAUDE.md, README.md and docs/README.md never say what is done or what is next; they point to status.md.
