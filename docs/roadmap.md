# Roadmap

Only work that is **not done yet**, in order. What runs today is in [status.md](status.md) (its "Now / Next" box says which item below is current); decisions are in [decisions.md](decisions.md); how an item is designed, built and reviewed is in [way-of-work.md](way-of-work.md). When an item is finished, its entry moves to [history/](history/) and status.md describes what shipped.

Finished milestones (M1–M5c, M5b steps 11–13, P1, P2) and their designs, recorded answers and step tables are in [history/implementation-plan-m1-to-p2.md](history/implementation-plan-m1-to-p2.md). Explanatory paths (2026-10-14) and its design are in [history/plans/2026-10-14-explanatory-paths.md](history/plans/2026-10-14-explanatory-paths.md). The visual pass (2026-10-15) and its design are in [history/plans/2026-10-15-visual-pass.md](history/plans/2026-10-15-visual-pass.md). The conceptual map for real data (2026-10-19) and its design are in [history/plans/2026-10-18-conceptual-map.md](history/plans/2026-10-18-conceptual-map.md). The inventory view (2026-10-19) and its design are in [history/plans/2026-10-19-inventory.md](history/plans/2026-10-19-inventory.md). A more useful inventory (2026-10-20) and its design are in [history/plans/2026-10-20-inventory-more.md](history/plans/2026-10-20-inventory-more.md). Rack items (2026-11-03) and their design are in [history/plans/2026-11-01-rack-items.md](history/plans/2026-11-01-rack-items.md). Fewer trace tools (D47), Pairs | Pigtails on panels (D48), the inspector as a short card (D49, all 2026-11-24) and Physical uses the screen (D50, 2026-11-25) and their designs are in [history/plans/2026-11-24-fewer-trace-tools.md](history/plans/2026-11-24-fewer-trace-tools.md), [2026-11-24-pairs-pigtails-panels.md](history/plans/2026-11-24-pairs-pigtails-panels.md), [2026-11-24-inspector-card.md](history/plans/2026-11-24-inspector-card.md) and [2026-11-25-physical-space.md](history/plans/2026-11-25-physical-space.md).

## The workbench (current; before 2b)

**Why.** The owner (2026-11-15): "the UI is very broken and sometimes bad". A sweep of every screen and a photo of the owner's screen showed the cause is layout, not colour: on their 1920×1080 monitor at 125% (1536×864 for the browser) a tall HDF covered Patching's Connect and Done (fixed the same day, `a4a84cd`), drawers and popovers cover what is being edited, jacks are about twice the size they need, and help text and empty cards take the space. A design review by a separate session and the [workbench demo](history/demos/workbench-demo.html) followed; the owner approved the demo on 2026-11-15 ("it is perfect" for the switch, then "we can start"). The lasting rule is D43.

**Owner's answers (2026-11-15).**
- Improve the design, not only the bugs; go before 2b active devices.
- Switches: port groups as banks on one line (48 × RJ45 1G, then 4 × SFP+ 10G), uplinks marked ↑, the uplinks strip under the face. "It is perfect."
- Not fully sure how the compact HDF will look in the real app, so the compact faceplate is built first and checked on the owner's real HDFs before the rest.

**What it is** (as in the demo; sizes are the demo's):
- **Frame:** 44px header; the plan's name always visible and the header amber while a plan is open; a 48px icon rail; one **right dock** (about 380px) with tabs for the selected node or port, Inspector, Trace, Explore and Changes. It narrows the page beside it on every view, the tree included; only one is open at a time.
- **Faceplates:** HDF jacks 22×22 with 2px gaps and 11px mono numbers, no per-block caption, the row number and A–D letters stay put while the face scrolls, one scroll area per face. Switch and panel jacks 28×30; a switch's port groups are banks on one line, each with its caption; a port that reaches an AGG or BB is marked ↑. Occupied jacks are the full network colour with a white number.
- **Equipment page:** one bar with the breadcrumb (‹ › to the neighbours in the rack), Front/Rear, Open in inventory and a "⋯" menu (Print sheet, Duplicate…, Show on map, Delete…); one meta line; the face; the uplinks strip under a switch face. Selecting a jack opens it in the dock with Connect… / Connect a range… (or Disconnect…) at the top.
- **Patching:** a full page. From and To panes with a 40px head each (the far end as one button that opens Site › Node › Rack › Equipment), the faces taking the height, a side column with the numbered pairs and Made here (collapsible), and one bottom bar: mode, count, status, Undo last, Done, Connect N. Done with pairs not connected asks "Connect N and close" or "Close without connecting".
- **Conceptual:** the legend behind a Key button; a node's details in the dock, which narrows the tree.

**Parts, in order** (each designed in detail, built, reviewed and deployed on its own):
1. **Compact faceplates and the patching page:** built 2026-11-15 ([plan](plans/2026-11-15-workbench-part-1.md); what runs is in [status.md](status.md)).
1b. **HDF faces** (D44), from the owner's check of part 1 on their real HDFs (2026-11-15): "I really liked the patching part and how the switches look, but the HDFs look small." Their answers: keep the new look; HDF jacks **32px** (chosen in the demo from 24–40px); every HDF starts with its **highest row on top** ("this is not a setting, all the HDFs need to start with the highest number on top"), the cables staying on their rows; **Pairs | Pigtails** as each person's choice ("some people prefer pairs and others pigtails"), pigtails counted 1–12 within each block and shown in the same jack. Shown in [the demo](history/demos/workbench-demo.html) (HDF page and Patching); the printed sheet follows the row order too (owner, 2026-11-15). Built 2026-11-15 ([plan](plans/2026-11-15-workbench-part-1b.md); what runs is in [status.md](status.md)).
2. **The equipment page** (switch, panel, HDF, rack item) with its bar and "⋯" menu, and the port beside the face: built 2026-11-16 (what runs is in [status.md](status.md)). Owner's answer (2026-11-16): the rack drawing on the left goes; ‹ › and the breadcrumb replace it. The port panel opens only for a selected jack, with Connect… / Disconnect… first; the shared dock with tabs is part 3. [Plan](plans/2026-11-16-workbench-part-2.md).
2b. **Where things go on the equipment page** (D45): the face fits its grid, the port panel sits beside it and a tall HDF uses the window's height (built 2026-11-16, `bbc3744`); then **the path of the selected jack** drawn along the bottom as hardware, and a compact **Connects to** summary: built 2026-11-17 (what runs is in [status.md](status.md)). Owner (2026-11-16): "we are not using the space good"; a cables table was dropped ("why do I want the cables table?": the Inventory has it); front and rear side by side and free/used counts were refused; "a graph of the connections of the port you select", then of the redrawn demo "I really like it"; Connects to "smaller, depending on how many places it connects". [Plan](plans/2026-11-16-equipment-page-path.md).
3. **The frame and the one dock** (header, rail, dock tabs), applied to Conceptual and Physical. Approved 2026-11-19 from [the demo](history/demos/workbench-demo.html) ("Conceptual + dock"; the owner: "I approved it"). As in the demo:
   - **Header (44px):** Conceptual | Physical | Inventory, the network, then Installed | Plan with the plan's name always shown in a plan (the header amber), **Changes** with the plan's count, the environment tag.
   - **Rail (48px), top to bottom:** Add (disabled in Installed, "Add: open a plan first"), Explore, Trace, Inspector. An icon opens its dock tab; a second click on the open one closes the dock. On the Trace page the Trace icon shows as on.
   - **The dock (about 380px, right):** one at a time, tabs **Node** (on the tree) or **Port** (on an equipment page), Inspector, Trace, Explore, **Add** (only in a plan), Changes, and × to close (Esc too). It narrows the page beside it and never covers it. Node: the node's switches and their uplinks, Show in Physical and Find AGG / BB. Port: the jack, Connect… / Connect a range… or Disconnect… / Trace from here (in a plan), its details. Inspector: the equipment, its tags, Open in Physical / Find AGG / BB / Show on map, its ports and details. Trace: the mode, Start, Find AGG / BB, the routes (AGG first) that light in place, Clear trace and Open full page ⤢. Explore: the search and Site › Node › Rack. Add: the library (switch, panel, HDF, rack item, rack, node) for the current place, the form under it. Changes: the plan's changes grouped, each with Undo, and Record as installed…; in Installed the drafts (Open in Plan, New draft) and recorded plans.
   - **Conceptual:** the legend behind a **Key** button on the tree's toolbar; a node card's details open in the dock and the tree narrows beside it.
   **The Trace page** (D46, approved 2026-11-19 from the demo's "Trace page"; it replaces the route view over the map). Owner (2026-11-19), of the frame demo: "the only thing I don't see is the full trace page … a page that only looks the trace"; agreed it replaces the route view; then "I want the option that I can make zoom and only see the picture". As in the demo:
   - **Open:** Open full page ⤢ in the dock's Trace, and Full page ⤢ on a jack's path (cabled jacks only). The page has no dock; **← Back** returns to the page it came from. Choosing a route in the dock still lights it in place.
   - **Bar:** ← Back › Trace, the trace mode and Start, One route | All routes, Show on map, Export PNG and PDF.
   - **Left (300px):** "N routes · M mismatches · from X of Y ports", then AGG, BB and "Mismatch · another network" groups (destination · port, role or network, cable count, from … via …), then a collapsed "What each port found · N searched" (reached, mismatch, no destination, disconnected).
   - **One route:** a title (start · port → destination · port) and a line of counts (cables, equipment, racks in nodes, network); for a mismatch a note says which networks differ. The drawing: the jack path's plates (D45), each node's steps in a dashed frame named Site › Node with the rack above each plate, a cable between two nodes drawn between the frames. Then **Walk, step by step**: #, equipment and kind, Site › Node › Rack, arrives at, leaves from, start / bridge / end, Open; each cable as a thin row between.
   - **All routes:** every route (mismatches left out) with its label and Open this route; the equipment every route passes is outlined in amber, with a note above ("Every route passes …: a problem there cuts all N").
   - **Zoom:** − 100% + Fit on the drawing's corner, ⌘/Ctrl + wheel or a pinch, drag to move. Fit shows the whole drawing, never above 100% on the page (250% in Picture only); a chosen zoom stays until Fit, another route or One/All. **⛶ Picture only** hides the list, the walk and the notes and gives the drawing the whole page with one title line; Exit picture or Esc returns.
   - **Export:** PNG of the drawing (all routes in one picture with All routes) and a one-page PDF (the drawing, then the walk), with the route view's header (start → end, Installed or the plan, the date).
4. **Inventory and the rack elevation**, as density passes (rows, toolbar, the rack's overflow in a plan).

## Switch models and adding devices (current; approved 2026-11-25 from [the demo](history/demos/switch-models-demo.html), D51)

**Why.** The owner (2026-11-16), from a photo of the Add switch form: adding a switch takes too many steps, and most switches are the same few models; every port group's count, names, type, connector and speed are typed for every switch. Then (2026-11-25): the add forms feel "messy and boring", make them cleaner. A look at NetBox and Device42 (a model, a "device type", is defined once and each device copies its ports; devices are placed by dragging onto a rack unit) and at form guidance (ask only what is needed now, fill in what can be known, show a field only when it matters) shaped the demo.

**Owner's answers (2026-11-16, 2026-11-25).** The models live in the database and are made **entirely in the app** (none are loaded). Every switch, AGG and BB is added **from a model**: the Add form's port count and "+ Add port group" go. Existing switches get **Set model…**, which fills their information from a model **without touching ports or cables**, and **only fills what is empty**. Panels: 3, 6, 12 or 24 positions mostly, sometimes another count. An HDF's height is **not** derived from its rows. After Set model a plain switch's face is **split into the model's groups**. Of the demo: "its perfect". Then (2026-11-25, questions on the plan): a one-off switch also gets a model; Set model always sets the **Manufacturer and Model** details (only the ports keep "fills only what is empty"); most existing switches were typed as a first group of 48 or 24 and then the uplinks, so a switch with groups takes only a model whose groups match; renaming a model offers to update the switches that carry its old name; models can be made while a plan is open; How many stacks downward; the serial number stays a per-switch detail filled in later (not on the model). Plan: [plans/2026-11-25-switch-models.md](plans/2026-11-25-switch-models.md).

**What it is** (as in the demo):
- **A switch model** (library data, never topology, never in a plan or a trace; no revision): a name (unique ignoring case), a manufacturer, a height in U, and its port groups in order (count, name pattern with one `{n}`, first number, copper or fiber, connector, speed), 1–8 groups and 1–96 ports, the same rules as `add_equipment`'s port groups. A switch **copies** the model when it is added; editing or deleting a model never changes a switch.
- **The Switch models page** (from the Add tab's **Manage models…** or **+ New model…**; usable in Installed and in a plan, where it says "Models are shared; they are not part of the plan"; ← Back): the list (name, manufacturer · height · ports) beside the editor: Model name, Manufacturer, Height (U); **Ports, in order** as a small table with + Add a group of ports and × per group; "N ports in G groups"; **How it will look**, the faceplate drawn as you type; Save model, Delete… (a confirm saying switches keep their ports). It starts empty. **Renaming a model** offers, after Save, "N switches say C9300-48P. Update their Model detail too?": one batch of direct fixes, each change in the switch's History; a switch counts when its Model detail equals the old name ignoring case and spaces at the ends (the Manufacturer is not checked; hand-typed variants are left to Set model). In a plan it only says "Update them from Installed"; switches a draft adds keep the name they were copied with.
- **The Add tab's library:** Switches by model (each model a card: name, height, its groups), + New model…, Manage models…; Passive: Patch panel, HDF; Rack items. **Drag an item onto a free unit**, or click it and then click a free unit (a note says what is picked; Esc cancels). On a view without a rack shown, picking an item asks for Site › Node › Rack and opens that rack.
- **The small box at the unit** (in place of the add forms; Enter adds, Esc cancels; the units it will take are marked):
  - **Switch (from a model):** Name (suggested), Role **Access | AGG | BB**, Network (chosen when every switch in that rack is on one network, "like the other switches in this rack"; else the header's network when one is chosen; else Choose…), **How many** (stacked down from the unit, their names listed). The height, ports and the Manufacturer and Model details come from the model.
  - **Patch panel:** Name, Positions **3 · 6 · 12 · 24 · Other…** (1–48), How many; it starts with the last count used in the session.
  - **HDF:** Name, **Rows** and **Height (U)**, separate; they start with the last HDF added in the session, else 12 rows and 4U.
  - **Rack item:** its name (suggested as today) and height, Other's text when Other.
  - Refusals in words in the box ("Not enough free units below U20 for 3 × 1U", "EDGE-33 is already taken", "Choose its network").
- **Set model…** (a switch's ⋯ menu, Installed only, like a direct fix; in a plan disabled, "Set model in Installed"): only models with the switch's port count can be chosen, and when the switch has more than one group, only models whose group sizes match in order (48 + 4 = 48 + 4); a model that cannot be chosen says why ("its groups are 48 + 4; this switch's are 24 + 24 + 4"). **What changes** lists, before Apply: the Manufacturer and Model details, each port's name, type, connector and speed by position, and the face's groups; then "Left as typed" for every value that differs and is kept. It always sets the **Manufacturer and Model** details (a different value shows as "9300 → C9300-48P"). For the ports it **fills only what is empty**: a port field that is blank, and a port name that is still the name the app gave it ("Port {position}"). The groups are set to the model's only when the switch is still one group. Ports, their positions and IDs, cables, network, role, height and place never change. One request, all or nothing, each change in the switch's History.
- **Inventory:** with switches selected, **Set model…** does the same for each; switches whose port count or groups differ are listed and skipped.

**Builder's calls (confirmed by the owner 2026-11-25):** the suggested name takes the highest trailing number among the node's switches of that role and adds one, keeping the prefix and the padding (none: empty, the field focused); the switch's **Model** detail holds the model's name (no link to the model is stored); a model's height is 1–10U.

## Queue after switch models (owner's requests 2026-11-26; not designed yet)

The owner's answers from questions on 2026-11-26. Each item is designed with a demo and approved before it is built (D30), in this order. The design review and the UI research of 2026-11-25 ([history/design-review-2026-11-25.md](history/design-review-2026-11-25.md), [history/ui-research-2026-11-25.md](history/ui-research-2026-11-25.md), [its demo](history/demos/ui-refresh-demo.html)) are reference for all three.

**A. The frame on the left and small fixes** (a short demo of the left side first).
- **The rail, the dock and Changes on the left:** rail | dock | page; the dock opens beside the rail and narrows the page, never covering it (amends D43). **Changes** leaves the header for the rail, with its count, hidden in Installed; the header keeps the views, the network and Installed | Plan.
- **The path card without cable names:** a click on a cable line opens a small card (its name, status, notes, a link to the cable).
- **The node level:** a click on a mini rack opens that rack; a click on a device in it opens the rack with that device chosen (not its page).
- **The site screen:** a click on a node card opens its racks, a drag still moves it (a short move counts as a click); the "Open racks →" button goes.

**B. Trace by uplink and by rack** (a demo first).
- **Trace uplinks** from any switch (the tree, a rack, Inventory) and from Find AGG / BB: one drawing per uplink, stacked, each headed ("Uplink 1 of 2 · Gi1/0/49 → AGG-01"); plates both pass are marked "on both". The drawing stays our own (not React Flow).
- **Trace rack**, a button on the rack level: every switch's routes, all open. Stacked drawings or one combined React Flow graph (each shared panel and AGG drawn once) is chosen from the demo, both shown on a rack of real size.

**C. Networks and racks** (a demo first, building on the UI research).
- **Manage networks:** a cleaner add; a new network starts with the next colour; **any colour** from a picker, with a warning (never a refusal) when it is very close to another network's or to a state colour; **removal** only when nothing uses it, counting switches added in any open draft, the refusal naming them ("Used by 12 switches and by 2 switches in the draft Expansion"). Amends D27.
- **Better rack drawings,** starting from the UI research (quieter faceplates, mini racks with names and a network stripe).

## 1. The network hierarchy (the conceptual view's new purpose)

The conceptual map's overview was "only a worse version than Physical"; the owner gave the view a purpose instead: **the network hierarchy**, from the cables. Phase 1 (top to bottom, with Focus beside it) was approved on 2026-10-25 (D39) and is merged. On the realistic campus the owner then chose **one conceptual view**: a left-to-right tree where Show on map lands, with no separate Focus view. Approved 2026-10-28 from [the demo](history/demos/conceptual-demo.html); the lasting rules are D39 and D40 in [decisions.md](decisions.md).

**Owner's answers.**
- **2026-10-25:** some BB, 10–20 AGG and a few hundred access switches per network, up to about 50 nodes under one AGG. Wiring is mostly direct, a minority chained, many uplinks through long passive chains. With no BB, the top is found from the cables. Networks are chosen with chips, with no "All networks" chip.
- **2026-10-28:**
  - **Node size:** a node holds at most 12 switches, except Main Distribution, which holds the AGGs and BBs and a few access switches.
  - **AGGs:** some nodes hang under one AGG, others under a pair.
  - **Uplinks:** an access switch normally has **one** uplink. A few have a second one, to the other AGG of the pair, to a BB or to another switch.
  - **AGG to BB:** varies; one BB or both.
  - **Faults:** the marks are no uplink, chained only, another network, an AGG with no BB, and a split node.
  - **What the view answers,** in order: where a device sits, then what depends on it, then what is around it, then one port.
  - **Focus:** the separate view adds nothing the tree and its drawer cannot show, so it goes.

### Phase 2, done

The one conceptual view (the left-to-right tree, selection and drawer, no Focus) is built; what runs is in [status.md](status.md), its design and steps are in [history/plans/2026-10-28-one-conceptual-view.md](history/plans/2026-10-28-one-conceptual-view.md), and the lasting rules are D39 and D40 in [decisions.md](decisions.md).

### Phases

1. **The hierarchy replaces the overview:** done 2026-10-27 ([plan](history/plans/2026-10-26-network-hierarchy-phase-1.md); what runs is in [status.md](status.md)). It is deployed together with phase 2.
2. **One conceptual view:** done 2026-10-30 ([plan](history/plans/2026-10-28-one-conceptual-view.md); what runs is in [status.md](status.md)). Phases 1 and 2 are deployed together.
3. **Networks and size:** dropped 2026-11-01 (D41); the tree keeps showing one network. The other-network dots on closed cards are in the backlog.

## 2. More equipment

Today equipment is a switch, a panel or an HDF. **Owner's answers (2026-10-25):** the real network also has
- **rack items with no ports** (UPS, PDU, shelves, cable managers, blanks): they take units and have details, never cables, never in a trace;
- **active devices with ports** (servers, firewalls, routers, controllers): cabled like a switch, a trace can end there, shown on the tree.

Equipment outside a rack (wall outlets, access points, cameras) is not wanted now. **Order:** two items, each designed, built and deployed on its own: rack items first, then active devices.

### 2a. Rack items, done

Built 2026-11-03 (D42 in [decisions.md](decisions.md)); what runs is in [status.md](status.md), and the design, the owner's answers and the steps are in [history/plans/2026-11-01-rack-items.md](history/plans/2026-11-01-rack-items.md).

### 2b. Active devices (not designed yet)

Servers, firewalls, routers, controllers and the owner's other cabled equipment that is not a rack item. It starts with a demo (D30) and the owner's answers on their roles, whether they show on the tree, and where a trace stops.

## 3. M6 — Layout, undo and measured scale

- **Measure on real data** before go-live and agree budgets. Starting point (campus fixture, development machine; measurements, not budgets): see the campus timings in [status.md](status.md) (the tree's first draw and a selection to lit). Reduce what the first render draws.
- Scoped APIs: neighbourhood and route-object fetch, summaries and bundles, pagination of `GET /api/plans` (large drafts); bounded neighbourhoods; detailed-port virtualization. Revision-keyed graph caching only when measurements justify it.
- Persist workspace preferences (open node cards, the viewport, the selection) if wanted; separate layout undo and plan undo.
- Drag-to-rack on the map (dropped from M5) may return here.
- The Copy rack layout popover is positioned once when it opens and does not follow page scroll or resize.

**Acceptance:** reload restores layout and context without changing physical placement; summary counts map to real cables; search, selection and trace work on hundreds of equipment and tens of thousands of cables, including large HDFs; measured costs are recorded with agreed budgets.

## 4. M7 — Identity and governance

Authentication and permissions (who may create or rename networks, record plans as installed, make direct fixes), review/approval, an audit trail (direct fixes and recorded plans get a user), HTTPS with the login (see [infrastructure.md](infrastructure.md) §2.3). Approval never implies installation; conflicts stay explicit; commands are never rebased or retried automatically.

## 5. Production servers

The three-server cluster (k3s, CloudNativePG, Garage) is designed in [infrastructure.md](infrastructure.md). The owner builds it by hand with Claude as helper (see [way-of-work.md](way-of-work.md)). Until then the single test server runs [infra/compose](../infra/compose/README.md) and holds real data.

## Backlog (small, not scheduled)

- The Changes drawer lists no line for `update_details` entries (details edited in a plan); only renames get one.
- Editing cable, site, node and rack details in the UI (the direct-fix API already supports them).
- Bulk port rename; renaming a port in a plan.
- **Other-network dots on closed node cards** in the tree: a node that also holds switches of another network shows it without being opened (today only an open card's "+ N on Network B" line does).
- A **stack** mark on a cable between two AGGs, set by the user, so the hierarchy can draw stacks (D39: the data alone cannot tell a stack from a peer link).
- A spreadsheet import, through the same draft and record path, only if the real network turns out much larger than a few thousand cables (decided 2026-10-10: entry by hand with the bulk tools).
