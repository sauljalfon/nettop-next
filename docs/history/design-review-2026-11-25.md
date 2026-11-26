# Design review, 2026-11-25

A read-only review of the frontend against published UI/UX practice for network documentation and data-centre tools. Nothing here is decided. Each idea is a proposal for the owner, and anything that touches a locked decision is marked **⚑ touches Dxx**. The current roadmap item (switch models and adding devices, D51) is already designed, so this review leaves it alone.

How to read it: each part opens with what already works well. After that comes a short list of improvements. Each improvement gives **what the code does today** (file:line, under `frontend/src/` unless stated), **the practice** (with its source), **the change** in plain words, and **effort** (S = up to half a day, M = one to three days, L = more).

---

## 1. Summary: the most valuable improvements, ranked

| # | Improvement | Why it matters day to day | Effort |
|---|---|---|---|
| 1 | **One "Find anything" box, from any screen** (Ctrl+K or `/`). It finds names, IP addresses, serial numbers, cable labels and ports, and jumps to the equipment page or the inspector. | Today search lives only in the Explore tab and matches equipment **names** only. An IP or serial means opening Inventory and filtering. | M |
| 2 | **Put "where I am" in the address bar** (view, site/node/rack, equipment, jack). Then refresh, the browser's Back button and a pasted link all land in the same place. | Today only the plan is in the URL. A refresh drops you back at the start, and you cannot send a colleague "this HDF, rear, position 12". | M |
| 3 | **Three contrast fixes in `theme.css`.** Input borders 1.4:1 → 3:1. Route-coloured text 4.2:1 → 4.5:1 or more. Dimmed map cards 2.1:1 → readable. | Text fields are hard to see on white, and the dimmed part of the tree is hard to read on a projector or a laptop in a bright room. | S |
| 4 | **Visible words on icon-only buttons.** The rail (Add, Explore, Inspector) and the jack card's Find AGG / BB and Show on map buttons. | Find AGG / BB is a core task (locked 7), but on the jack card it is a 14px icon with only a tooltip. | S |
| 5 | **Never lose typing in a form.** Escape and Cancel on Edit details close it without asking. Server errors appear at the bottom, not next to the field they are about. | Prevents silent loss of a half-typed correction, and makes refusals (for example a bad IP address) quicker to fix. | S |
| 6 | **Inventory at campus size.** "Select all N matching" (not only this page), a first column that stays put when scrolling sideways, and the reason a command is disabled shown in words. | Bulk edits (D38) on hundreds of rows today take one 50-row page at a time. | S–M |
| 7 | **Label the cable while patching.** An optional Label box on the patching bar that counts up by itself (C-0101, C-0102 …), like "next free jack" does. | Labels are what you print (Print labels…) and what people read in the field. Today each cable must be labelled again later. | M |
| 8 | **Information that only lives in tooltips moves onto the screen.** The node card's site name, what the bare fault number means, and the names in the node level's mini racks. | Tooltips are slow and do not work for keyboard or touch. They also stay hidden in screenshots and printouts. | S |

Also cheap and worth doing: **Copy as text** on the Trace page (the plain route list from ui-spec §6, for tickets and chat), and a **keyboard shortcuts sheet** on `?`.

---

## 2. Frame and navigation (header, rail, dock, `app/App.tsx`, `features/frame`)

**Works well.** The 44px header and the one right dock that narrows the page (D43) keep the network in view. The plan band colour (`--plan-band`) gives a constant, unmissable sign that you are in Plan. That is NN/g's advice for modes: show clearly which mode is on, because "mode slips" happen when people do not know ([NN/g, Modes](https://www.nngroup.com/articles/modes/)). The dock remembers the open tab, and Escape closes it.

**Improvements**

1. **Keep "where I am" in the URL.**
   - *Code:* `app/App.tsx:176-182` writes only `?plan=` into the address. Physical's location, the chosen equipment and jack live in `physicalSession` and `mapSession` in memory, so a refresh starts over. The in-app Back (`physical/EquipmentBar.tsx:55`) works, but the browser's Back button leaves the app.
   - *Practice:* each screen a person may return to should have its own URL, and the app should rebuild its state from that URL ([web.dev, "Each page has a URL"](https://web.dev/pwa-each-page-has-url)). People expect the browser Back to go to what they *saw* as the previous page ([Baymard, back button expectations](https://baymard.com/blog/back-button-expectations)). Put only shareable state in the URL and leave out things like scroll position ([Dynatrace, URL sharing](https://developer.dynatrace.com/develop/navigation/url-sharing/)).
   - *Change:* write `view`, the Physical location (site / node / rack / equipment), `side` and `jack` into the query string with `pushState` when the user moves, and read them at start. Keep the tree's viewport and zoom out of the URL: they stay session-only, as CLAUDE.md says. The Trace page could carry its start (`trace=<endpoint>`).
   - *Effort:* M. (This is not a locked decision. The session stores stay; they gain a URL mirror.)

2. **A "Find anything" box in the header.**
   - *Code:* the only free search for equipment is the Explore tab (`app/App.tsx:1211-1223`). It matches names only (`map/search.ts:14-31`). Ports and cables have a separate hit list. IP addresses and serial numbers can be found only through Inventory's filter.
   - *Practice:* NN/g heuristic 7, flexibility and efficiency of use: accelerators for frequent users ([NN/g, 10 heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)). Command palettes (Ctrl/⌘+K) are now the common pattern in work tools. Jira's palette, for example, stays out of the way while you type in a field ([Atlassian, command palette](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-command-palette)).
   - *Change:* a header search field, opened by Ctrl+K or `/` (only when focus is not in a field), with results grouped as Equipment · Ports · Cables · Places. It matches name, IP address, serial number and cable label. Enter opens the first result's equipment page, and each row has "Inspector" and "Show on map". It reuses `searchExplore` and Inventory's rows (`inventory/rows.ts`), so no new data is needed.
   - *Effort:* M.

3. **Words on the rail.**
   - *Code:* `app/App.tsx:391-417`. The three rail buttons are icons with an `aria-label` only. The `title` tooltip appears only when Add is disabled.
   - *Practice:* "a text label must be present alongside an icon … Icon labels should be visible at all times" ([NN/g, Icon usability](https://www.nngroup.com/articles/icon-usability/)).
   - *Change:* a 10–11px caption under each icon (Add, Explore, Inspector). The 48px rail has room for it. At the very least, show the tooltip always and on keyboard focus.
   - *Effort:* S.

4. **Dock tabs behave like tabs for the keyboard.**
   - *Code:* `frame/DockView.tsx:165-185` gives the tabs `role="tab"`, but there is no Left/Right arrow handling, no `aria-controls`, and the bodies have no `role="tabpanel"`. Every tab is a Tab stop.
   - *Practice:* WAI-ARIA tabs pattern: arrows move between tabs, Tab moves into the panel, and each tab names its panel ([W3C APG, Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)).
   - *Change:* add the roving tabindex and arrow keys, plus `role="tabpanel"` and `aria-labelledby` on `.dock-body`. When a rail icon opens the dock, move focus to the tab's heading.
   - *Effort:* S.

5. **The success message is announced and readable.**
   - *Code:* `app/App.tsx:505-510` mounts `<div role="status">` only when a message exists. It is 12px (`app/styles.css` `.save-toast`, `--t-xs`) and disappears after 5 s (`App.tsx:190-192`).
   - *Practice:* a live region should exist before its content changes ([MDN, live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions)). Status messages must reach screen readers ([WCAG 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)). Toasts suit only passive notes and are easily missed ([NN/g, indicators and notifications](https://www.nngroup.com/articles/indicators-validations-notifications/)).
   - *Change:* keep an empty `role="status"` element always mounted and fill it. Use `--t-sm`. Keep the toast while the pointer is over it. After a plan edit, add **Undo** to the toast; it calls the existing `remove_change` for that change.
   - *Effort:* S (Undo in the toast: M).

6. **A fixed 380px dock** (`frame/frame.css:3`). On the equipment page and in Inventory, a wider dock helps when the inspector is open beside a long table. *Change:* a drag handle with a keyboard alternative (Shift+← / →), remembered in `localStorage`. *Effort:* M. (D43 sets one dock that narrows the page; resizing it keeps that rule.)

---

## 3. Conceptual map (the tree, `features/map`)

**Works well.** The tree is built only from real cables, read left to right, with the problem marks the owner named (D39–D40). Selection lights the way up and what depends on it, and never refits. The Key is folded away by default, and the node card is a real `<button>` (keyboard reachable). "Only nodes with problems" answers the owner's second question ("what depends on it") quickly.

**Improvements**

1. **Dimmed cards stay readable.**
   - *Code:* `map/map.css:386-393` dims with `opacity: 0.35`. Ink text then measures about **2.1:1** on white (`--ink-soft` text about 1.7:1).
   - *Practice:* text needs 4.5:1 (WCAG 1.4.3). Only *disabled* controls are exempt ([WCAG, non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)), and dimmed cards are still clickable.
   - *Change:* dim the **border, background and lines**, and keep the text at `--ink-soft` (6.2:1), or use opacity 0.6 or more. The "lit" path then stands out by the teal border and weight, not by fading the rest to near-invisible.
   - *Effort:* S.

2. **Route-coloured text is slightly too light.**
   - *Code:* `--route: #0f8b7a` (`shared/theme.css:26`) is used as a **text** colour for lit AGG frames and switch names (`map/map.css:400-404`), and elsewhere (`details/details.css:80`, `patching/patching.css:259`, `paths/pathBar.css:330`). On white it measures 4.20:1.
   - *Practice:* 4.5:1 for normal text (WCAG 1.4.3).
   - *Change:* add a `--route-ink: #0b7666` (5.5:1) for text and keep `--route` for lines and borders.
   - *Effort:* S.

3. **What a bare number means is on the card, not in a tooltip.**
   - *Code:* `map/HierarchyNodeCard.tsx:17-36`. The fault count is a lone number with a `⚠` (from CSS) whose meaning is only in `title`. The switch count is a bare number. The site name is only a `title` (`:95`, `:139`).
   - *Practice:* "Don't use tooltips for information that is vital to task completion"; tooltips must also open on keyboard focus ([NN/g, Tooltip guidelines](https://www.nngroup.com/articles/tooltip-guidelines/)). Locked rule from ui-spec §1: "a colour never replaces a label".
   - *Change:* give the card button an accessible name that says it all ("Node B-12, Site North, 9 switches, 2 with a problem"), using visually hidden text. Show the site as a small second line once the card is selected or open. In the Key, add one row for "⚠ 2 = switches with a problem".
   - *Effort:* S.

4. **Step through the problems.**
   - *Code:* `map/HierarchyPanel.tsx:73-80`. "Only nodes with problems" hides the rest, but on a big network you still hunt for each card.
   - *Practice:* recognition rather than recall, and efficiency for frequent users ([NN/g heuristics 6 and 7](https://www.nngroup.com/articles/ten-usability-heuristics/)).
   - *Change:* next to the checkbox, "Problems: 7 · ‹ Prev / Next ›". Each step selects the next card with a mark (pan only, never refit, as D40 asks). The order is the layout's top-to-bottom order.
   - *Effort:* S–M.

5. **Small text in the tree.** Column heads (`map/map.css:164`), the 2↑ badge (`:313`) and the italic "+ 2 on another AGG" line (`:419`) use `--t-min` (11px), which `theme.css:74` reserves for "jack numbers only". *Change:* use `--t-xs` (12px) and drop the italic. Italic at 11px is the hardest to read. *Effort:* S.

*Not proposed:* dragging cards, saved layouts or several networks at once. D40 and D41 settled these.

---

## 4. Physical (sites, node, rack, equipment page, faces)

**Works well.** Breadcrumbs end in the current page, unlinked and marked `aria-current` (`physical/EquipmentBar.tsx:59-90`), as NN/g recommends ([NN/g, Breadcrumbs](https://www.nngroup.com/articles/breadcrumbs/)). ‹ › steps to the neighbours in the rack. The jack grid has real keyboard support: one Tab stop and arrow keys across banks (`physical/faceNav.ts`, `FaceView.tsx:232`). Each jack has a full spoken name (`FaceView.tsx:249`). The ⋯ menu is a correct menu (arrows, Home/End, Escape, `physical/MoreMenu.tsx`). Front | Rear, real U numbers and free runs folded into one row all match how NetBox and similar DCIM tools draw racks.

**Improvements**

1. **Mini racks on the node level: names you can read, blocks you can reach.**
   - *Code:* `physical/NodeLevel.tsx:126-174`. The rack preview is a `role="button"` div that **contains** clickable blocks (`onClick` at `:159-162`). The blocks are mouse-only, not focusable, and nested inside another control. Their names are hidden (`font-size: 0`, `physical/physical.css:494-495`), with only a `title`.
   - *Practice:* do not put interactive elements inside one another (WCAG 4.1.2). Do not hide essential information in tooltips ([NN/g, Tooltips](https://www.nngroup.com/articles/tooltip-guidelines/)). Device42's panel view shows what is connected on hover **and** highlights the path ([Device42, patch panels](https://docs.device42.com/infrastructure-management/connectivity/patch-panels/)).
   - *Change:* make the header "Open rack" a separate button, so the preview itself is not a button. Make each block a focusable button with an `aria-label` naming it, its height and its unit. Show the name inside a block when it is 2U or more at the preview's scale, otherwise truncated.
   - *Effort:* S–M.

2. **Show the far end on hover and on focus, not only in the native tooltip.**
   - *Code:* `physical/FaceView.tsx:74-75, 248`. The jack's "port 3 · cable-a09 → PANEL-A 3 front" sits in `title`, which appears after about a second and never on keyboard focus.
   - *Practice:* Device42: "Hovering over any port … highlights the path, displays the text for port, and displays what is connected" ([Device42](https://docs.device42.com/infrastructure-management/connectivity/patch-panels/)). Tooltips must also work on focus ([NN/g](https://www.nngroup.com/articles/tooltip-guidelines/)).
   - *Change:* one quiet status line under the face, "Hover: Gi1/0/3 → PANEL-A · 3 front (cable-a09)", filled on hover **and** on arrow-key focus. It sits outside the path card and never changes the selection.
   - *Effort:* S.

3. **Jacks that shrink below 24px.**
   - *Code:* `--jack-readable: 18px` (`shared/theme.css:82`) with a 2px gap (`--jack-gap`).
   - *Practice:* pointer targets at least 24×24px, or spaced so that 24px circles do not overlap ([WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).
   - *Change:* raise the floor to 24px and let the face scroll a little sooner. Alternatively, keep 18px only where the user has chosen a compact view.
   - *Effort:* S. **⚑ touches D50** (the face sizing rules); needs the owner's eye on a tall HDF.

4. **Arranging nodes on a site without dragging.**
   - *Code:* `physical/SiteCanvas.tsx:677` saves positions only from a drag stop. There is no keyboard move. Reset layout exists (`:743`).
   - *Practice:* WCAG 2.2 SC 2.5.7 (Dragging movements, AA) asks for a single-pointer alternative. ui-spec §1 already promises "a non-drag way to do everything that can be dragged".
   - *Change:* when a node card has focus, arrow keys move it by one grid step (Shift for 5) and the position is saved once on key-up. The same save path as the drag is reused.
   - *Effort:* S–M.

5. **Double-click to open a unit is hidden.** The rack level opens a unit's page on double-click. An **Open page** button exists, which is good. Keep it as the visible way, and add "Double-click opens the page" to the rack's hint line only the first time in a session. *Effort:* S.

6. **Steel-side greys.** `--steel-free` on `--steel-2` is 2.96:1, and the dashed free-slot line `--steel-line` on `--steel` is 1.45:1 (`shared/theme.css:46, 52`). "Available" text on a free slot should reach 4.5:1 (use `--steel-ink`, 7.2:1). The dashed outline should reach 3:1 if it is the only sign that a slot is free. *Effort:* S.

---

## 5. Trace and paths (`features/trace`, `features/paths`)

**Works well.** Results are grouped AGG first, then BB, with mismatches separate (locked 7). Counts say what they count ("from 12 of 14 ports"), and truncation is said plainly. ← Back returns to where you were (D46). The walk sheet keeps names apart (D32). NetBox's cable trace works the same way, following pass-through ports until a non-pass-through end ([NetBox, Cables](https://netboxlabs.com/docs/netbox/en/stable/models/dcim/cable/)).

**Improvements**

1. **Copy as text.** *Code:* exports exist as PNG and PDF only (`trace/TracePage.tsx:884-905`). *Practice:* ui-spec §6 already shows the plain text form ("EDGE-17 / Network A, port 1 → AGG-03 …"). That form fits a ticket or a chat message best. *Change:* a **Copy** button that puts that exact text on the clipboard, plus "Copied" in the status line. *Effort:* S.

2. **Export buttons say what they do.** The buttons read "PNG" and "PDF", and the explanation is only in `title` (`TracePage.tsx:891-895`). *Change:* "Download PNG" and "Download PDF", without the "Export" label before them. *Effort:* S.

3. **A leftover label.** `TracePage.tsx:847` can still show "Port to port", which D47 removed from the app. Show only "Find AGG / BB". *Effort:* S.

4. **Jack path card's close button is 26px and the "Open the Trace page" button is 24px tall** (`paths/pathBar.css:45-53`). These are at the minimum. Raise them to `--h-control` (32px) like other buttons for an easier target. *Effort:* S.

---

## 6. Inspector and details (`features/inspector`, `features/details`)

**Works well.** The inspector is a short card (D49): role, network, Installed/Proposed, a clickable place path, the cabling meter and the way up, with Find AGG / BB as the one primary button. That is the side-panel pattern NN/g recommends for viewing one record while keeping the rest in sight ([NN/g, Data tables](https://www.nngroup.com/articles/data-tables/)). Direct fixes carry an optional "Why" kept in History (D17).

**Improvements**

1. **Do not throw away typed changes.**
   - *Code:* `details/DetailsEditor.tsx:84` with `planning/useInlineDialog.ts:44-49`. Escape calls `onClose` straight away, even when fields were changed.
   - *Practice:* user control and freedom ([NN/g heuristic 3](https://www.nngroup.com/articles/ten-usability-heuristics/)). Ask for confirmation only when work would be lost, and name the buttons by outcome ("Discard changes" / "Keep editing") ([NN/g, Confirmation dialogs](https://www.nngroup.com/articles/confirmation-dialog/)).
   - *Change:* if `hasChanges(fix)`, the first Escape shows an inline "Discard 2 changes? [Discard] [Keep editing]". With no changes it closes at once, as today.
   - *Effort:* S.

2. **Errors next to the field.**
   - *Code:* `details/DetailsEditor.tsx:177`. The server's refusal is one line under the whole form.
   - *Practice:* put the message by the field it concerns, mark the field, and keep what was typed ([GOV.UK, Error message](https://design-system.service.gov.uk/components/error-message/)).
   - *Change:* when the refusal names a field (IP address, name taken), show it under that field with `aria-invalid` and `aria-describedby`, and keep the general line for the rest. Parse the IP address in the browser too (D23: it must parse) so the error appears before saving.
   - *Effort:* S.

3. **Show what changed before saving.** Mark changed fields (a small "changed" dot), and make the button say "Save 2 changes". This is the same idea as Inventory's "What changes" (D38). *Effort:* S.

4. **One history timeline.** *Code:* `details/HistoryTab.tsx:41, 64` lists direct fixes and recorded plans in two separate lists. *Practice:* a change log is read as one time-ordered list, the way NetBox's changelog is. *Change:* merge them by date with a small type chip (Fix / Plan). *Effort:* S.

5. **Status and IP on the card.** The card shows place, ports, way up and model. The two facts most often looked up in DCIM tools, status (when not active) and IP address, need the equipment page. *Change:* one line "Status: maintenance" only when not active, and the IP when set, with a copy button. *Effort:* S. **⚑ touches D49** (the short card's contents).

---

## 7. Inventory (`features/inventory`)

**Works well.** It covers all four table tasks NN/g names: finding, comparing, viewing or editing one record, and acting on many ([NN/g, Data tables](https://www.nngroup.com/articles/data-tables/)). It has a sticky header (`inventory.css:261-266`), `aria-sort` on headers, a live "Showing A to B of N" line, a "No records match … reset them" empty state, saved views, windowed rows, and Problems with a count in the list menu.

**Improvements**

1. **Select all that match, not only this page.**
   - *Code:* `inventory/InventoryTable.tsx:136`, "Select all on this page", with 50 a page (`query.ts:10`).
   - *Practice:* offer "Select page" *and* "Select all", and count across pages ([PatternFly, Bulk selection](https://www.patternfly.org/patterns/bulk-selection/)). NN/g: a "Select All" helps when the same action applies to the whole set ([NN/g](https://www.nngroup.com/articles/data-tables/)).
   - *Change:* after the header box is ticked, show a line "50 on this page selected. **Select all 312 that match**" (Gmail-style), and the selected count keeps the full number. Bulk Edit details, Delete N… and Disconnect N… already take a list, so only the selection grows.
   - *Effort:* S–M.

2. **Freeze the first column.** *Code:* only the ⋯ column is sticky on the right (`inventory.css:485-494`). *Practice:* "Freeze header rows and header columns (if the table is larger than the screen)" ([NN/g](https://www.nngroup.com/articles/data-tables/)). *Change:* make the checkbox and name columns sticky on the left. *Effort:* S.

3. **Why a command is off, in words.**
   - *Code:* `InventoryPage.tsx:461-463, 500-503, 515-517` disable buttons and put the reason in `title`. A disabled button cannot take focus, so keyboard users never see the reason.
   - *Practice:* tooltips must be reachable by keyboard and must not carry vital information ([NN/g, Tooltips](https://www.nngroup.com/articles/tooltip-guidelines/)).
   - *Change:* use `aria-disabled="true"` (still focusable) with the reason in visible text in the meta line when focused or hovered, for example "Delete needs a plan: switch to Plan". Or simply hide row commands that cannot apply in Installed.
   - *Effort:* S.

4. **A command bar that follows the selection.** *Code:* `InventoryPage.tsx:456-523`. Refresh, CSV, Columns and every row command sit in one long bar, disabled or not. *Practice:* Carbon shows a **batch action bar** only while rows are selected, with a count and Cancel, and keeps the general toolbar to five actions or fewer ([Carbon, Data table](https://carbondesignsystem.com/components/data-table/usage/)). *Change:* while one or more rows are selected, the bar becomes "3 selected · Edit details… · Delete 3… · Disconnect 3… · Print labels… · ✕ Clear". With nothing selected it shows only Add, CSV, Columns and Refresh. *Effort:* M.

5. **Page size.** Paging at 50 is redundant now that only visible rows are drawn. Offer 50 / 200 / All, kept per list in the session. *Effort:* S.

---

## 8. Planning and Changes (`features/planning`)

**Works well.** It follows the separation of D17–D20 well. Every change is undoable on its own line. The empty state tells you what to do ("Add equipment from the library, or use Add site …"). Recording is a separate review step that checks first, with "Only record what is physically done." A stale draft is never drawn. Deletes preview what they cut (D18). Confirm buttons are named by outcome ("Close without connecting"), as NN/g recommends ([NN/g, Confirmation dialogs](https://www.nngroup.com/articles/confirmation-dialog/)).

**Improvements**

1. **Undo right after the change.** Today Undo is per line in the Changes tab (`planning/ChangesDrawer.tsx:96-104`). After an edit made anywhere else, the toast says what happened but offers no Undo. *Practice:* offer undo where possible; it beats confirmation ([NN/g](https://www.nngroup.com/articles/confirmation-dialog/)). *Change:* "Added EDGE-33 · **Undo**" in the toast, calling `remove_change` for that change key. *Effort:* M.

2. **Every change gets a line.** The roadmap backlog notes that `update_details` made in a plan has no Changes line. ui-spec §1 says a summary says what it counts, so the count and the list should agree. *Change:* add the line ("Details: EDGE-33 · Serial number"). *Effort:* S–M. (Already in the backlog; listed here because it affects trust in the review step.)

3. **Name the draft in the review heading and in the Record button.** "Record 'Building C, floor 2' as installed…" keeps the right draft in mind when several exist (the draft picker shows several). *Effort:* S.

*Left alone:* the add forms (D51 replaces them now) and recording only some of a draft's changes, which would reopen **D20**.

---

## 9. Patching (`features/patching`)

**Works well.** From and To side by side, the far end as one button, "Next: Gi1/0/5 → PANEL-A 5" so Enter makes the next cable, Undo last, and Done asks before losing previewed pairs. This matches what DCIM tools do (Device42 shows connected panels side by side and guards against overwrites, [Device42](https://docs.device42.com/infrastructure-management/connectivity/patch-panels/)).

**Improvements**

1. **Label cables as you make them.**
   - *Code:* `add_cable` accepts `details.label` (`shared/types.ts:60-64, 227-229`), but the patching screen never sets it.
   - *Practice:* the label is the cable's name in the field. NetBox stores it as the cable's identifier ([NetBox, Cables](https://netboxlabs.com/docs/netbox/en/stable/models/dcim/cable/)).
   - *Change:* an optional **Label** box on the bottom bar. If the text ends in a number it counts up after each cable (C-0101 → C-0102), keeping the padding, the same way "next free jack" moves on. In Range mode the labels are listed next to the pairs.
   - *Effort:* M.

2. **The hint is in a tooltip.** *Code:* `patching/PatchingScreen.tsx:703` keeps "After each cable both sides move … Enter makes the next one." in `title`. *Change:* show "Enter connects" as a small key hint beside the Connect button. *Effort:* S.

3. **Range by keyboard.** "Shift-click the last jack on the left" (`PatchingScreen.tsx:735`) is the only gesture shown. The Count box already works without a mouse, so say so: "Type a count, or Shift-click the last jack". *Effort:* S.

---

## 10. Networks (`features/networks`)

**Works well.** Renaming happens in place, Enter saves and Escape cancels, and a note explains why colours never change on rename (D27).

**Improvements**

1. **A header row** for the table (`networks/NetworksDrawer.tsx:35`): Colour · Name · Active devices, so screen readers can read the numbers. *Effort:* S.
2. **The count opens the list.** Make "12 active devices" a link that opens Inventory filtered to that network (the Network pill, D37). *Effort:* S.
3. **Colours repeat after six.** `map/networkColors.ts:4-20` cycles six colours, so network 7 looks like network 1. D27 keeps creation order, which is fine. Say it in the drawer when there are more than six ("Networks 1 and 7 share a colour"), and check the palette against colour-blindness. Names are always written, so this is a hint, not a fault. *Effort:* S.

---

## 11. Look and theme (`shared/theme.css`, `shared/ui`)

**Works well.** One token file (D33), IBM Plex with Hebrew, tabular numbers for U and port numbers, `bdi` isolation for every name, a reduced-motion rule, and a visible 2px focus outline. Body and secondary text pass AA everywhere measured (`--ink-soft` 6.2:1 on paper, `--proposed` 5.1:1 on its tint, `--danger` 6.0:1).

**Improvements**

1. **Input and select borders reach 3:1.** *Code:* `shared/theme.css:153-163`; inputs use `--rule` `#d3dae1`, which is 1.41:1 on white. *Practice:* the border that tells you "this is a field" needs 3:1 ([WCAG, Non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)). GOV.UK uses a dark border for the same reason. *Change:* a `--rule-field: #7b8794` (3.7:1) for inputs, selects and checkboxes only; cards keep the soft `--rule`. *Effort:* S.
2. **Keep 11px for jack numbers.** `--t-min` is also used for map heads and badges, trace tags (`trace/trace.css:21`), path labels and patching marks. Move those to `--t-xs`. The 12px toast becomes 13px. *Effort:* S.
3. **The network palette into the theme.** `map/networkColors.ts:4-11` holds six hex colours outside `theme.css`, against D33's "one file holds every colour". Move them to `--net-1…--net-6` and read them in TS. `theme.test.ts` can then guard them too. *Effort:* S.
4. **`.chip.muted` (opacity 0.45)** gives 2.7:1 text. Use `--ink-soft` text with a lighter border instead. *Effort:* S.

---

## 12. Accessibility and keyboard across the app

**Works well.** Escape and focus return for every inline form and confirm (`planning/useInlineDialog.ts`), a real menu and jack-grid keyboard model, `aria-pressed` on segmented controls, `aria-sort`, and `role="alert"` for errors.

**Improvements**

1. **A shortcuts sheet on `?`.** List the keys that exist (Esc, Enter in patching, arrows on faces and menus) plus the new Ctrl+K. Single-letter keys must work only when focus is not in a field, or be possible to turn off ([WCAG 2.1.4](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html)). Jira does the same with a "?" dialog ([Atlassian](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-command-palette)). *Effort:* S.
2. **A "Skip to content" link** before the header and rail, so a keyboard user reaches the page in one Tab. *Effort:* S.
3. **Focus goes where the work is.** When the rail opens a dock tab, focus moves to its heading. When Physical changes level, focus moves to the new `<h2>`. A screen reader then hears where it landed. *Effort:* S.
4. **Tabs, live region, nested controls and dragging**: see Frame 4 and 5, Physical 1 and 4.
5. **One automated check.** Add `@axe-core/playwright` to one smoke spec per view (Conceptual, Physical equipment page, Inventory, Patching) to catch contrast and nested-control regressions. It runs in the existing lanes. *Effort:* S–M.

---

## 13. Sources

- NN/g, 10 Usability Heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- NN/g, Icon Usability: https://www.nngroup.com/articles/icon-usability/
- NN/g, Tooltip Guidelines: https://www.nngroup.com/articles/tooltip-guidelines/
- NN/g, Data Tables: Four Major User Tasks: https://www.nngroup.com/articles/data-tables/
- NN/g, Confirmation Dialogs: https://www.nngroup.com/articles/confirmation-dialog/
- NN/g, Breadcrumbs: https://www.nngroup.com/articles/breadcrumbs/
- NN/g, Modes in User Interfaces: https://www.nngroup.com/articles/modes/
- NN/g, Indicators, Validations and Notifications: https://www.nngroup.com/articles/indicators-validations-notifications/
- GOV.UK Design System, Error message: https://design-system.service.gov.uk/components/error-message/
- Carbon Design System, Data table usage: https://carbondesignsystem.com/components/data-table/usage/
- PatternFly, Bulk selection: https://www.patternfly.org/patterns/bulk-selection/
- W3C WAI-ARIA APG, Tabs pattern: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
- WCAG 2.2, Non-text Contrast (1.4.11): https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- WCAG 2.2, Target Size Minimum (2.5.8): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- WCAG 2.2, Character Key Shortcuts (2.1.4): https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html
- WCAG 2.2, Status Messages (4.1.3): https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- MDN, ARIA live regions: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions
- web.dev, Each page has a URL: https://web.dev/pwa-each-page-has-url
- Baymard, Back button expectations: https://baymard.com/blog/back-button-expectations
- Dynatrace developer docs, URL sharing: https://developer.dynatrace.com/develop/navigation/url-sharing/
- Atlassian, Jira command palette and shortcuts: https://support.atlassian.com/jira-software-cloud/docs/what-is-the-command-palette
- NetBox, Cables (label, trace): https://netboxlabs.com/docs/netbox/en/stable/models/dcim/cable/
- NetBox, Racks: https://netboxlabs.com/docs/netbox/en/stable/models/dcim/rack/
- NetBox, Devices and cabling (device types copied at creation): https://netboxlabs.com/docs/netbox/features/devices-cabling/
- Device42, Patch panels (hover shows far end, side-by-side panels): https://docs.device42.com/infrastructure-management/connectivity/patch-panels/
- Hyperview, Connectivity: https://hyperviewhq.com/connectivity/

Contrast ratios were computed with the WCAG relative-luminance formula from the hex values in `frontend/src/shared/theme.css`.
