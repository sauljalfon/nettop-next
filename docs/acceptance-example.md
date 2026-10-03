# Complete acceptance example

This preserves the final design demo's **fictional** inventory and routes after its generated artifacts were retired. Use it to build real domain/API/database/browser fixtures, not to hardcode production trace results.

It is a target example, not the current `backend/internal/sample/network.go` seed. Network names, equipment names, IDs, capacities, and heights here are explicit test inputs. They are not a way to infer properties of imported real equipment.

## 1. Inventory

Networks: **Network A** and **Network B**. Each active device has one membership. Passive equipment has no exclusive membership.

| Site | Physical node | Function | Racks |
| --- | --- | --- | --- |
| Main Campus | Building A | Access location | Rack A03 |
| Main Campus | North Sub-main | Intermediate physical distribution | Rack SM01 |
| Main Campus | Main Distribution | Main BB/AGG center | Rack Core 01, Rack Core 02, Rack Core 03 |
| DR Site | DR Access | Smaller LAN access location | Rack DR01 |
| DR Site | DR Distribution | DR distribution location | Rack DR02 |

All seven example racks have 12U. Main Campus contains three nodes; DR contains two. Physical location relationships are not cable edges.

| Equipment | Kind / explicit backend role | Network | Rack | Placement | Capacity |
| --- | --- | --- | --- | --- | --- |
| EDGE-17 | Active switch / `access` | A | A03 | U8, 1U | 24 device ports |
| PANEL-A | Standard panel / `passive` | Shared-capable; A circuits in this fixture | A03 | U11, 1U | 24 local positions |
| HDF-01 | HDF panel / `passive` | Shared A/B circuits | SM01 | U4–U6, 3U | 4 rows × 4 columns × 6 positions |
| HDF-02 | HDF panel / `passive` | Shared A/B circuits | Core 01 | U4–U6, 3U | 3 rows × 4 columns × 6 positions |
| AGG-03 | Active switch / `aggregation` | A | Core 01 | U8, 1U | 24 device ports |
| AGG-08 | Active switch / `aggregation` | A | Core 02 | U8, 1U | 24 device ports |
| AGG-15 | Active switch / `aggregation` | A | Core 02 | U6, 1U | 24 device ports; no cable in this fixture |
| BB-01 | Active switch / `backbone` | A | Core 03 | U8, 1U | 24 device ports |
| EDGE-22 | Active switch / `access` | B | DR01 | U8, 1U | 24 device ports |
| PANEL-DR | Standard panel / `passive` | Shared-capable; B circuits in this fixture | DR01 | U11, 1U | 24 local positions |
| AGG-12 | Active switch / `aggregation` | B | DR02 | U8, 1U | 24 device ports |

There are eleven equipment objects: seven active devices and four passive panels. Network A has **three AGGs**, of which only two are reachable from EDGE-17. The single reachable AGG in the small Network B example is not a network-size limit.

### HDF physical layout

```text
HDF-01                    HDF-02
     A   B   C   D              A   B   C   D
 1  1A  1B  1C  1D         1  1A  1B  1C  1D
 2  2A  2B  2C  2D         2  2A  2B  2C  2D
 3  3A  3B  3C  3D         3  3A  3B  3C  3D
 4  4A  4B  4C  4D
```

- HDF-01: 16 subpanels, 96 logical positions, 192 front/rear side endpoints.
- HDF-02: 12 subpanels, 72 logical positions, 144 side endpoints.
- Every block has local positions 1–6. The 3U rack height is an independently supplied fixture value.
- Fiber-pair displays are 1,2; 3,4; 5,6; 7,8; 9,10; 11,12 for positions 1–6. Position 5 is still one logical position, not two separately numbered graph positions.

## 2. Cable records

The table is arranged in route-reading order for clarity. Each cable is unordered and references stable endpoint IDs. A readable path label is not its identifier.

| Cable | Endpoint 1 | Endpoint 2 |
| --- | --- | --- |
| A01 | EDGE-17 / device port 1 | PANEL-A / position 1 / front |
| A02 | PANEL-A / position 1 / rear | HDF-01 / subpanel 3C / position 5 / rear |
| A03 | HDF-01 / 3C / 5 / front | HDF-02 / 2B / 3 / front |
| A04 | HDF-02 / 2B / 3 / rear | AGG-03 / device port 1 |
| A05 | EDGE-17 / device port 2 | PANEL-A / position 2 / front |
| A06 | PANEL-A / position 2 / rear | HDF-01 / 1A / 2 / rear |
| A07 | HDF-01 / 1A / 2 / front | HDF-02 / 1D / 2 / front |
| A08 | HDF-02 / 1D / 2 / rear | AGG-08 / device port 1 |
| A09 | EDGE-17 / device port 3 | PANEL-A / position 3 / front |
| A10 | PANEL-A / position 3 / rear | HDF-01 / 2D / 4 / rear |
| A11 | HDF-01 / 2D / 4 / front | HDF-02 / 3A / 1 / front |
| A12 | HDF-02 / 3A / 1 / rear | BB-01 / device port 1 |
| B01 | EDGE-22 / device port 1 | PANEL-DR / position 1 / front |
| B02 | PANEL-DR / position 1 / rear | HDF-01 / 3C / 2 / rear |
| B03 | HDF-01 / 3C / 2 / front | HDF-02 / 2B / 6 / front |
| B04 | HDF-02 / 2B / 6 / rear | AGG-12 / device port 1 |

Sixteen external cables use 32 distinct external-cable endpoints. No endpoint is occupied by a second cable. Rear-to-rear and front-to-front links between different panels are legitimate external cables.

For each occupied passive position, add/derive the front/rear internal bridge at that exact position. Also represent unused configured positions correctly; their mere existence does not connect them to occupied positions.

## 3. Expected discovery results

| Source | Starting port | Destination | Actual role | External cables | Internal bridges |
| --- | --- | --- | --- | --- | --- |
| EDGE-17 / A | 1 | AGG-03 / A | AGG | A01–A04 | PANEL-A 1; HDF-01 3C/5; HDF-02 2B/3 |
| EDGE-17 / A | 2 | AGG-08 / A | AGG | A05–A08 | PANEL-A 2; HDF-01 1A/2; HDF-02 1D/2 |
| EDGE-17 / A | 3 | BB-01 / A | BB | A09–A12 | PANEL-A 3; HDF-01 2D/4; HDF-02 3A/1 |
| EDGE-22 / B | 1 | AGG-12 / B | AGG | B01–B04 | PANEL-DR 1; HDF-01 3C/2; HDF-02 2B/6 |

Each route has four external cables and three passive bridges: **seven traversal edges**, not merely four equipment hops. Preserve the exact ordered side endpoints in the response.

Network A discovery returns two AGG results **and** the BB result. AGG-15 exists but is not returned because it is unconnected. Searching from EDGE-17 port 1 alone returns its route, not the routes from ports 2/3.

Network B traverses a different position in **the same subpanels**:

```text
HDF-01 / 3C / position 5: Network A → AGG-03
HDF-01 / 3C / position 2: Network B → AGG-12

HDF-02 / 2B / position 3: Network A → AGG-03
HDF-02 / 2B / position 6: Network B → AGG-12
```

Those circuits must never become internally adjacent. Device membership and passive position occupancy are distinct.

## 4. Ordered AGG-03 route

```text
EDGE-17 / port 1
  A01
PANEL-A / position 1 / front
  internal bridge
PANEL-A / position 1 / rear
  A02
HDF-01 / 3C / position 5 / rear
  internal bridge
HDF-01 / 3C / position 5 / front
  A03
HDF-02 / 2B / position 3 / front
  internal bridge
HDF-02 / 2B / position 3 / rear
  A04
AGG-03 / port 1 — terminal destination
```

Starting a point-to-point trace at AGG-03 port 1 and ending at EDGE-17 port 1 reverses this sequence. There is no cable direction and no AGG sibling-port jump.

The BB route likewise ends at BB-01 port 1. Do not append a hidden AGG-to-BB continuation to another route.

## 5. Cross-view expectations

### Conceptual

- Network A shows its active devices and relevant passive parents. HDF-01/HDF-02 can carry both A/B badges without exclusive chassis membership.
- Choosing AGG-03 reveals HDF-01 3C/5 and HDF-02 2B/3; choosing AGG-08 or BB-01 reveals their different positions.
- All three results remain available. Coordinates, viewport, and other visible connections do not reset.
- Manual expansion may reveal additional connected positions. Clearing the route removes its automatic detail only.
- All-networks mode shows all eleven equipment objects and sixteen actual cable records in this small fixture. Summary views may bundle them while retaining identities.

### Physical

1. Main Campus → North Sub-main → Rack SM01 → HDF-01.
2. Selected AGG-03 route: subpanel 3C, position 5 is highlighted.
3. **Rear:** external cable A02, peer PANEL-A position 1 rear; internal peer HDF-01 3C/5 front.
4. **Front:** external cable A03, peer HDF-02 2B/3 front; internal peer HDF-01 3C/5 rear.
5. HDF-02 front shows A03; its rear shows A04 to AGG-03 port 1.
6. Return to Conceptual with the same selected result and useful viewport/selection.

For Network B, HDF-01 3C/2 is selected and 3C/5 remains another Network A circuit in the full physical grid. The grid does not hide the other network merely because trace scope is B.

## 6. Larger-route and scale examples

Add a separate test route with four passive panels/HDF positions alternating front→rear and rear→front. It has five external cables and four bridges. It verifies that the implementation is not capped at the two HDFs or three passive positions of the small fixture.

The retired scale study illustrated 640 active devices, 310 passive panels/HDFs, 12,480 cable records, and 42 locations. Those were separately labeled fictional presentation counts, not validated topology or benchmark results. Replace them with real generated test graphs and measured performance budgets in M6; do not hardcode them as production summary values.
