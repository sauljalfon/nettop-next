# UI specification

What every screen must keep true: the intent, the rules and the look. How each screen is built today (exact sizes, labels, test marks) is in [status.md](status.md); the decisions behind it are in [decisions.md](decisions.md). New screens start from a clickable demo the owner approves (D30); approved demos are in [history/demos/](history/demos/).

## 1. Character

A calm, spacious technical workspace: a light neutral canvas, restrained borders and shadows, compact equipment cards, clear labels and few accents. The network and the task in hand dominate, not permanent forms or dashboards.

- **Readable:** real text and control sizes with clear contrast (the early prototype's tiny, pale text was rejected), visible keyboard focus, and a non-drag way to do everything that can be dragged.
- **Calm:** tools open on demand and overlay the canvas; nothing permanently shrinks or pushes the map. Inline confirms and forms, no stacks of modals. Escape closes a confirm, form, popover or pane, and focus returns to the button that opened it.
- **Truthful:** a summary says what it counts (real cables); a colour never replaces a label (roles, sides and states are written, BB is labelled BB); proposed objects are marked PROPOSED (dashed); a preview is never shown as installed.
- **Stable:** saving, refetching, tracing, filtering or switching context never resets the viewport or the selection, never refits and never remounts. Objects are reconciled by stable ID.
- **Colours follow meaning, never an ID:** each network has one stable colour by creation order (grey when unresolved); the selected route is teal; a highlight is amber; free endpoints are white.
- Theme tokens, the font and equipment silhouettes are design-system choices, not requirements; the portal-style tokens of the inventory live in one shared stylesheet (roadmap §3).

## 2. Shell

- A compact header: workspace title, **Conceptual / Physical** (and Inventory later), the **network selector** (All networks, one network, **Manage networks…**), and **Installed / Plan** (the draft picker). They are independent; switching one never changes another. A DEV or TEST badge outside production.
- A tool rail: **Add** (the equipment library), **Explore** (the location tree and search), **Trace**, **Inspect**, **Changes**. Each opens a drawer over the canvas and closes independently.
- Selecting equipment opens the **inspector**: a sticky header (identity, network and Installed/Proposed badges, the cabling meter, the location breadcrumb, Show on map, Show in Physical, Find AGG / BB for switches), then Overview (details, placement, Edit details), Ports/Positions (a compact table with row actions) and History (direct fixes and recorded plans).
- The **results overlay** of a trace is expandable, lists every AGG/BB route (AGG first) and the mismatches, and never takes the canvas permanently.

## 3. Conceptual map (locked 2, 3, 9, 11)

- A full-page map of **equipment connected by real cables**, freely arranged; positions are the user's (session today; saved on the server in roadmap §2). Not an ownership tree, not a nested inventory, not a route strip.
- Cards are compact: name, kind/role, location label, "N of M cabled", network badges (one for an active device; one per circuit network for a passive one), and facets. Panels and HDFs are single objects; front and rear are sides of one object.
- Cables attach to exact endpoints. Parallel cables between two cards on one network are one line whose width and count show how many; it lists the cable IDs and splits into one line per cable on demand. Lines are drawing aids, never traversal.
- **The network filter** shows one network's active devices plus the passive equipment that carries its circuits; it never changes what a trace finds.
- **A trace highlights the map in place:** the route is teal, cards and the viewport do not move, other cables stay visible and quieter. The route's cards are shown even where the filter or a highlight would hide them.
- **HDF states:** compact by default; the selected route reveals only its positions automatically (tagged "route", the parent name always visible, each used position separately); positions pinned by the user (only from the inspector) stay until unpinned and survive route changes. Automatic and manual detail are separate state. Counts keep subpanels, positions, cabled positions and networks apart.
- **Highlight a location:** a site or node from Explore or the inspector highlights its equipment, the cables leaving it and their far ends, fading the rest; it is independent of the trace.
- **Route view** (opt-in, locked 3 amendment): only the active route, left to right in hop order, inside node and rack outlines, exportable as PNG and PDF; turning it off restores the map exactly.
- **Readable at real size** is roadmap §2: an overview by node, a focus on one device's neighbourhood, and a saved arrangement.

## 4. Physical explorer (locked 4, 8, 9)

```text
Sites → site → node → rack → equipment → exact port or position (front/rear)
```

- Always the **complete physical inventory**; a one-line scope note says so. A chosen network or route only marks things (other networks muted, never hidden; the route teal).
- **Sites:** cards with truthful counts and network badges. **A site:** only its node cards, arranged freely and saved on the server, joined by cable summary lines that count real cables and list them; a large site starts arranged by cable distance (access → passive → AGG/BB). **A node:** its own rack previews (a mini elevation each), searchable when there are many. **A rack:** a cabinet that fits the screen, real U numbers, one block per equipment spanning its height. **Equipment:** a faceplate (a switch's banks per port group, odd jacks above even; a panel's positions; the full HDF grid in row-major blocks A–D), with Front | Rear for passive equipment.
- **Endpoint detail:** the external cable and its far end (Go to peer), the internal peer on the other side (Switch to front/rear, keeping the position), Find AGG / BB from here, Show on map; port details and their state (reserved, disabled, faulty jacks are hatched, with a readable number).
- **Navigation:** clickable breadcrumbs and an in-app Back that restores the exact location, endpoint and side; Show in Physical from the inspector, its rows and every hop; switching back to Conceptual finds the map exactly as it was. A selected route shows as a trail of steps across levels.
- Not a geographic map or floor plan; real photos or plans need real data.

## 5. Find AGG / BB (locked 7)

- Started from a switch (all ports), a port or position row, a facet, or the Trace drawer; exact port-to-port tracing stays in the Trace drawer.
- Every reachable route is listed with destination, actual role, network, start port and its length (cables, bridges); AGG first, BB never dropped; mismatches separately as "on another network"; truncation said plainly. An unreachable device is never a result.
- Choosing another route changes the highlight and the revealed positions, never the layout. Each route expands to its explanation (today a hop list; the **walk sheet** of roadmap §1 replaces it: steps by place, cables by label, bridges folded into rows, right-to-left names kept readable).

```text
EDGE-17 / Network A
  port 1 → AGG-03
  port 2 → AGG-08
  port 3 → BB-01
```

## 6. Editing and plans (locked 10, D17–D22, D28, D29)

- **Everything that changes topology happens in a plan** (the header's Plan): add containers (in Physical, at their level), add equipment (library items by drag or Add… forms, HDF form), move (rack drops or the placement form), connect (the patching screen), disconnect, delete (with a preview of the cables and circuits it cuts), and the bulk tools (Connect a range, Duplicate with overrides, Copy rack layout). Installed shows a hint instead of editing.
- **Choosing a place** is always Site › Node › Rack (› Equipment), starting where the user is (D28); never one long list.
- **Corrections** (names, details, port state, cable label) of installed objects are direct fixes from Edit details, with an optional note kept in History; in a plan, the same form edits and renames what the plan adds.
- **The Changes drawer** lists a draft's changes grouped and in names, each linking to its object and each with Undo; **Record as installed…** opens a review (check first, then the list, "Only record what is physically done.", a required note and Recorded by). A stale draft says "Installed changed since this draft" with Update draft, lists conflicts with Drop, and is never drawn as a map. Recorded plans are read-only.
- **Server refusals appear inline, in the server's words and in names.**
- Live dragging never updates app-wide state or calls the API per pointer move; a drag saves once at the drop. An empty-canvas drop is an unsaved preview until it gets a rack.

## 7. Acceptance

The whole flow must let a user: choose a network and find equipment; inspect every reachable AGG and BB route; understand the exact passive panels and HDF positions on the map; find the same endpoint physically; switch sides, follow the cable peer and return to the route; and plan a change, check its trace, and record it as installed only when it is physically done. The fictional data for this is [acceptance-example.md](acceptance-example.md); the cases are [acceptance-tests.md](acceptance-tests.md); the walkthrough is the smoke flow in [testing.md](testing.md).
