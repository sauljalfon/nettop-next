# Data-entry rehearsal (prepared 2026-10-11, not run)

Moved from testing.md on 2026-10-14. The owner's real data entry replaced it (2026-10-13).

## Procedure

*Not run: the owner's real data entry on the test server replaced this rehearsal (2026-10-13), and its friction list became P2. The procedure stays here in case a timed rehearsal is wanted again.*

The owner runs this by hand, once, before the real network is entered. It enters one typical node of the campus fixture with the bulk tools, times it, and lists every friction point; the fixes go into M5b or M6. Nothing here is automated, and the results table at the end is left empty until it has been run.

**Use a database of its own, never the development database and never one with real data.** The rehearsal records plans as installed, and a recorded plan cannot be reverted.

### Start an empty database

From the repository root (Compose running, `docker compose up -d --wait`). Put `DATABASE_URL` in front of each command, as below: a variable already set in the environment wins over `.env`, and nothing is exported or written to `.env`.

```sh
docker compose exec db psql -U nettop -d nettop -c 'CREATE DATABASE nettop_rehearsal'
cd backend
REH='postgres://nettop:nettop-local@127.0.0.1:55432/nettop_rehearsal?sslmode=disable'
DATABASE_URL=$REH go run ./cmd/db migrate
DATABASE_URL=$REH go run ./cmd/db seed -fixture empty   # the three campus networks (A, B, C) and nothing else
DATABASE_URL=$REH HTTP_ADDR=127.0.0.1:8081 go run ./cmd/api
```

In another terminal (`frontend/`): `API_PROXY_TARGET=http://127.0.0.1:8081 npm run dev -- --port 5177`, then open `http://127.0.0.1:5177`. Installed is empty. To start over, drop and recreate the database: `docker compose exec db psql -U nettop -d nettop -c 'DROP DATABASE nettop_rehearsal' -c 'CREATE DATABASE nettop_rehearsal'`, then migrate and seed again.

### The node: Building 01 (and the sub-main HDF it ends on)

Building 01 is a typical access node of `backend/internal/scalefixture`: 7 racks, 42 access switches, one patch panel, and one circuit per switch. The campus has 33 of them, so the time per node is the time of the real job in miniature. The circuit ends on the sub-main HDF, so that is entered too; the rest of the campus (Main Distribution) is not.

| What | Contents |
| --- | --- |
| Site | Campus |
| Node | **Building 01** and **Sub-main 1**, both in Campus |
| Racks | **B01-R1 … B01-R7** in Building 01, 42 units each; **SM1-R1** in Sub-main 1, 42 units |
| Switches | 6 per rack in B01-R1 … B01-R7 (42 in all): kind switch, role **access**, height 1 U, **24 ports**. Names **ACC-B01-R1-S1 … ACC-B01-R7-S6**. Networks by position in the rack: S1 A, S2 B, S3 C, S4 A, S5 B, S6 C (the same in every rack). The fixture puts them at U2, U4 … U12; see "Expect these differences" |
| Patch panel | **PANEL-B01** in B01-R1 at U40: kind panel (passive), height 1 U, **48 positions** |
| HDF | **SM1-HDF** in SM1-R1 at U4: height 3 U, **32 rows** |

Cable runs (84 cables):

| Run | From | To | Shape |
| --- | --- | --- | --- |
| 1 | PANEL-B01 position 1 **rear** (…42) | SM1-HDF **1A/1 rear** (…2C/6 rear) | **one range of 42**: the HDF fills 1A–1D (24), then 2A, 2B and 2C (18) |
| 2 | each of the 42 switches, **port 1** | PANEL-B01 **front**, position 1 for the first switch in the rack order B01-R1-S1 … B01-R7-S6, then 2, 3 … 42 | **42 single cables**: the pairs are on different switches, so no range covers them |

The cables from the HDF's front to Main Distribution are not part of the rehearsal; the circuits stop at SM1-HDF's front positions.

Totals to check in the Changes drawer before recording: **1 site, 2 nodes, 8 racks**; **44 equipment** (42 switches, PANEL-B01, SM1-HDF); **84 cables connected**.

### Order, with the bulk tools

Make a draft first (Changes → **New draft**, "Rehearsal Building 01"), then:

1. **Add site, node, rack.** Physical → Sites → **Add site** (Campus); on the site screen **Add node** twice (Building 01, Sub-main 1); in each node **Add rack** (B01-R1 … B01-R7, SM1-R1; 42 units). Record the time per rack: a rack is one small form.
2. **Add… (library).** SM1-HDF with **Add HDF…** (SM1-R1, U4, height 3, 32 rows). In **B01-R2** only, add three switches with **Add Access switch…**: S1 Network A, S2 Network B, S3 Network C (24 ports each, units of your choice).
3. **Duplicate…** each of those three once ("1 more like ACC-B01-R2-S1", and likewise S2 and S3), so the rack holds two switches of each network.
4. **Copy rack layout…** into B01-R1, B01-R3 … B01-R7 (the target must be empty), choosing B01-R2 as the source each time. Panel not yet: it would be copied too.
5. **Add…** PANEL-B01 (Add Patch panel…, 48 positions) into B01-R1 at U40.
6. **Connect a range…** from PANEL-B01 position 1 rear, count 42, far start SM1-HDF 1A/1 rear. Check the preview before sending: 2A/1 must follow 1D/6, and nothing is marked.
7. The 42 switch-to-panel cables with **Connect…** (switch port 1 → the next free PANEL-B01 front position), in the order you would walk the building.
8. **Check** the totals (Changes drawer), open the Physical view of one rack and the conceptual map once, then **Record as installed…** (note "Rehearsal Building 01", Recorded by your name).
9. In Installed, trace from port 1 of the switch you cabled to PANEL-B01 front position 1 to SM1-HDF 1A/1 front: the circuit must run switch → PANEL-B01 front → rear → SM1-HDF rear → front.

### Expect these differences from the fixture (they are results, not failures)

- **Names.** Duplicate and Copy rack layout name new equipment by counting the trailing number up past every name already taken, so the copies of ACC-B01-R2-S1 in the other racks come out as -S7, -S8 … rather than ACC-B01-R3-S1. Proposed equipment cannot be renamed until M5b. Write down how many names would have needed fixing, and decide whether that matters for the real network.
- **Units.** The fixture's switches sit at U2, U4 … U12 (a free unit between each); Duplicate takes the next free unit, so the copies sit at consecutive units.
- **Single cables.** Run 2 is 42 separate Connect… actions. Note the time per cable and what would make it faster.

### What to time

Use a stopwatch and note the lap at the end of each step:

| Lap | From → to |
| --- | --- |
| A | step 1 (site, 2 nodes, 8 racks) |
| B | step 2 (SM1-HDF and the three switches of B01-R2) |
| C | step 3 (Duplicate ×3) |
| D | step 4 (Copy rack layout ×6) |
| E | step 5 (PANEL-B01) |
| F | step 6 (the range of 42) |
| G | step 7 (42 single cables) |
| H | steps 8–9 (check, record, trace) |
| Total | start to the recorded plan |

Also note any wait longer than a second (a batch, a refetch, the Changes drawer), and any time the draft would not take a change. **Time Record as installed on its own:** it writes one statement per added row, and in the step 10 review a plan with SM1-HDF alone (about 1,600 endpoints) took 4.3 s to record, and 36 switches plus 42 cables took 1 s, so the whole node may take several seconds. Write the time down; if it is too slow, batching the writes goes to M6.

### Results (empty until the owner has run it)

| Lap | Time | Notes |
| --- | --- | --- |
| A site, nodes, racks | | |
| B SM1-HDF and R2 switches | | |
| C Duplicate ×3 | | |
| D Copy rack layout ×6 | | |
| E PANEL-B01 | | |
| F range of 42 | | |
| G 42 single cables | | |
| H check, record, trace | | |
| **Total** | | |

| # | Where | What got in the way | Severity (blocks / slows / annoys) | Fix goes to (M5b / M6) |
| --- | --- | --- | --- | --- |
| | | | | |

