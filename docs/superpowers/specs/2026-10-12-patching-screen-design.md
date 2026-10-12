# Patching screen (connect redesign)

Date: 2026-10-12. Status: approved by the owner from the clickable demo (`docs/demos/patching-demo.html`); first of six data-entry fixes raised while entering the real network (connect, rack picker, editing data, port dropdowns, Duplicate overrides, port numbers past 24).

## Problem

Connect… and Connect a range… use one search box over every free endpoint in the network (at most 50 matches). On real data the far port cannot be found, one search per cable is too slow, and the user cannot see where the cable lands.

## Decision

Replace both boxes with a **patching screen**: two faceplates side by side, the near equipment left and the far equipment right, chosen by **Site › Node › Rack › Equipment**. Frontend only: `add_cable`, `batch` and `remove_change` already exist. Plan only (a current draft), like every edit.

## Behavior

- **Opening.** In a current plan, a click on a free jack of a faceplate in Physical selects it (as today) and opens a small popover at the jack: the recent far targets of this session (one click), **Choose far end…**, and One cable / Range of N. **Connect…** and **Connect a range…** in the endpoint detail and the inspector's Ports/Positions rows open the screen directly.
- **Far end.** Four dropdowns (site, node, rack, equipment with its free count; the near equipment is never offered). The default is the last far target of this session, else other equipment in the near end's node (passive first), else the first other equipment. The far **side** starts on the near endpoint's side when both ends are passive (rear starts with rear), else the side last used for that equipment in this session, else front.
- **One at a time.** Click a free near jack, then a free far jack: one `add_cable`, saved at once. Both sides then move to their next free jack in range order (the existing order of `range.ts`); the far one is ringed, and **Enter** (or **Connect**) makes it. Taken far jacks are disabled.
- **Range.** A count (1–500), or Shift-click the last near jack; a click on the far start lists the numbered pairs on both faceplates and in a list, with the reason for each blocked pair (`rangePairs`, the server's words). **Connect N** sends one `batch`; while a pair is blocked it needs **Skip**.
- **Made here.** The cables made since the screen opened, by name, with **Undo last** (`remove_change` on `add_cable:<id>`). The Changes drawer keeps its per-cable Undo.
- Errors from the server show in the screen in its words. **Esc** or **Done** closes it; focus returns to the opener.
- **Port numbers past 24.** A bank longer than 24 ports is still drawn in blocks of 24, but each jack shows its number in the bank (25…48), not in the block.

## Structure

`frontend/src/features/patching/`: `patching.ts` (pure: location tree, far default and side, next free, pair marks), `patchingSession.ts` (session store: the open request, recent targets, side per equipment), `LocationPicker` (the four dropdowns; reused later for the rack picker), `PatchingScreen`, `ConnectPopover`. `FaceView` gains an optional per-endpoint decoration (badge, tone, disabled) and stays the one faceplate drawing. `ConnectBox` and `ConnectRange` are removed.

## Tests

Vitest for `patching.ts`, the session store and the bank numbering. Playwright: EDGE-17 to PANEL-A one at a time with Enter, a range with one blocked pair and Skip, Undo last, rear-to-rear between two panels, the popover's recent target, and Esc returning focus.
