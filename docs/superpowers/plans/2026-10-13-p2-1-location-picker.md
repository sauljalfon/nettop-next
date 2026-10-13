# P2 item 1: Site › Node › Rack picker in every form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every form that chooses a rack (Add switch / Aggregation / Patch panel, Add HDF, the inspector's placement, Duplicate, Copy rack layout) chooses it as Site › Node › Rack with the patching screen's `LocationPicker`, starting at the current location.

**Architecture:** `LocationPicker` gets a rack-only mode (`level="rack"`). Its place logic (where it starts, what a Site or Node change selects, how it follows a value set from outside) moves out of the component into pure, unit-tested functions in `features/patching/patching.ts`. The forms receive the `locationTree` (built once per snapshot) instead of a flat `Rack[]`; the flat `<select>`s and the `rackItems` combobox list are removed.

**Tech Stack:** React 19 + TypeScript, Vitest, Playwright. Frontend only; no API, type or backend change.

**Spec:** the design approved in chat on 2026-10-13 (below, "Approved design"), item 1 of "P2 scope" in `docs/implementation-plan.md`.

## Approved design

- `LocationPicker` gains `level: 'equipment' | 'rack'` (default `'equipment'`, the patching screen unchanged) and a `label` for its group (default `'Far end'`). Rack mode shows Site, Node, Rack and reports a rack ID.
- Rack mode: changing Site or Node selects the first rack under it, whether or not it holds equipment. A node with no racks shows "No racks here" and reports `''`. Rack options read `Rack A03 · 12U`.
- Start: Add forms and HDF form at the dropped rack, else the rack open in Physical (`currentRackId`); Move at the equipment's rack; Duplicate at the source's rack; Copy rack layout with nothing chosen.
- **No current location (owner's answer 1):** start at the first site and its first node, with Rack on a disabled "Choose…" entry, so "Choose a rack." still applies.
- **Copy rack layout (owner's answer 2):** switches too; it excludes its own target rack; `rackItems` is deleted.

## Global Constraints

- AGENTS.md: **no commits** — every task ends with the change left in the working tree for the owner's review. Do not run `git commit`.
- Test-first: each task's failing test is written and seen failing before the code.
- New UI stays in `src/features/`; `App.tsx` only gets the one `useMemo` and prop changes.
- Group accessible names (Playwright relies on them): Add equipment, HDF and Duplicate forms `"Place"`; inspector placement `"Placement"`; Copy rack layout `"Copy the layout of"`; patching screen `"Far end"` (unchanged).
- Every `<select>` in the picker carries `aria-label` equal to its visible label (`Site`, `Node`, `Rack`, `Equipment`), so `getByLabel('Rack', { exact: true })` finds exactly the rack select.
- Copy and messages: `Choose…`, `No racks here`, `No nodes here`, `No sites yet`, the form error stays `Choose a rack.`.
- Before handoff: `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`, `npm run test:e2e`, and `go test -race ./...` from `backend/` (unchanged, but the handoff rule asks for it).

## Review Focus

1. **A node with no racks in rack mode** — Rack select disabled with "No racks here", the form's rack becomes `''`, submit says "Choose a rack." (pure test in Task 1, `chooseNode`).
2. **A start rack that no longer exists** (the open rack was deleted in the plan, or a refetch removed it) — falls back to the first site/node with "Choose…", never to a rack nobody chose (pure test in Task 1, `startPlace`).
3. **A refetch or the form's own `onChange('')` while the form is open** — the picker keeps the user's place instead of jumping back to the first site (pure test in Task 1, `follow`).
4. **An empty database** (no sites) — every select disabled with its "No … " entry, nothing throws (pure test in Task 1).
5. **Copy rack layout into the only rack of a node** — the target rack is never offered; that node shows "No racks here" (pure test in Task 1, `exclude`).

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `frontend/src/features/patching/patching.ts` | modify | `RackBranch.units`; pure place logic: `Place`, `PickRules`, `racksOf`, `eligibleIn`, `findRack`, `startPlace`, `chooseSite`, `chooseNode`, `follow` |
| `frontend/src/features/patching/patching.test.ts` | modify | tests for the place logic |
| `frontend/src/features/patching/LocationPicker.tsx` | modify | thin component over the pure logic; rack mode, `label`, `disabled` |
| `frontend/src/features/patching/location-picker.css` | create | the picker's styles, moved from `patching.css`, plus rack mode |
| `frontend/src/features/patching/patching.css` | modify | `.location-picker` rules removed |
| `frontend/src/features/planning/AddEquipmentForm.tsx` | modify | `tree` instead of `racks`; picker |
| `frontend/src/features/planning/HdfForm.tsx` | modify | `tree` instead of `racks`; picker; no `racks[0]` default |
| `frontend/src/features/planning/LibraryItems.tsx` | modify | passes `tree` |
| `frontend/src/features/planning/PlacementEditor.tsx` | modify | picker; unit max from the chosen rack |
| `frontend/src/features/planning/DuplicateEquipment.tsx` | modify | picker instead of `TracePicker` |
| `frontend/src/features/planning/CopyRackLayout.tsx` | modify | picker instead of `TracePicker` |
| `frontend/src/features/planning/duplicate.ts` | modify | `rackItems` deleted |
| `frontend/src/app/App.tsx` | modify | `tree` memo in `Workspace`; props |
| `frontend/e2e/patching-helpers.ts` | modify | `chooseRack` helper |
| `frontend/e2e/*.spec.ts` | modify | rack choices through the picker; one new check |
| `docs/current-status.md`, `docs/implementation-plan.md` | modify | item 1 done |

---

### Task 1: Pure place logic

**Files:**
- Modify: `frontend/src/features/patching/patching.ts` (types at lines 15–29, `locationTree` at 38–65)
- Test: `frontend/src/features/patching/patching.test.ts`

**Interfaces:**
- Produces (exported from `patching.ts`, used by Task 2):
  ```ts
  export interface Place { siteId: string; nodeId: string; rackId: string }
  export type PickLevel = 'equipment' | 'rack'
  export interface PickRules { level: PickLevel; exclude?: string }
  export function racksOf(node: NodeBranch | undefined, rules: PickRules): RackBranch[]
  export function eligibleIn(rack: RackBranch | undefined, rules: PickRules): RackBranch['equipment']
  export function findRack(tree: readonly SiteBranch[], place: Place): RackBranch | undefined
  export function startPlace(tree: readonly SiteBranch[], value: string | undefined, rules: PickRules): Place
  export function chooseSite(tree: readonly SiteBranch[], siteId: string, rules: PickRules): Place
  export function chooseNode(tree: readonly SiteBranch[], siteId: string, nodeId: string, rules: PickRules): Place
  export function follow(tree: readonly SiteBranch[], place: Place, value: string | undefined, rules: PickRules): Place
  ```
  and `RackBranch` gains `units: number`.

- [ ] **Step 1: Write the failing tests**

Add to the import list at the top of `patching.test.ts`: `chooseNode, chooseSite, eligibleIn, findRack, follow, startPlace, type SiteBranch`. Append:

```ts
const RACK = { level: 'rack' } as const
const EQUIPMENT = { level: 'equipment' } as const
const tree = locationTree(s)

describe('P2-1 the rack picker: where it starts and how it moves', () => {
  it('carries each rack’s height for the "Rack A03 · 12U" option', () => {
    expect(tree[1].nodes[0].racks[0]).toMatchObject({
      id: 'rack-a03',
      units: 12,
    })
  })

  it('starts at the rack it is given', () => {
    expect(startPlace(tree, 'rack-core-02', RACK)).toEqual({
      siteId: 'site-main',
      nodeId: 'node-core',
      rackId: 'rack-core-02',
    })
  })

  it('with no rack, or one that no longer exists, starts at the first site and node with no rack chosen', () => {
    const first = { siteId: 'site-dr', nodeId: 'node-dr1', rackId: '' }
    expect(startPlace(tree, undefined, RACK)).toEqual(first)
    expect(startPlace(tree, 'rack-gone', RACK)).toEqual(first)
  })

  it('a site change selects its first node and that node’s first rack, empty or not', () => {
    expect(chooseSite(tree, 'site-main', RACK)).toEqual({
      siteId: 'site-main',
      nodeId: 'node-a',
      rackId: 'rack-a03',
    })
  })

  it('a node change selects its first rack', () => {
    expect(
      chooseNode(tree, 'site-main', 'node-core', RACK),
    ).toEqual({
      siteId: 'site-main',
      nodeId: 'node-core',
      rackId: 'rack-core-01',
    })
  })

  it('a node with no racks leaves the rack empty', () => {
    const bare: SiteBranch[] = [
      {
        id: 's',
        name: 'Site',
        nodes: [
          { id: 'n1', name: 'Hall 1', racks: [] },
          {
            id: 'n2',
            name: 'Hall 2',
            racks: [{ id: 'r', name: 'R1', units: 42, equipment: [] }],
          },
        ],
      },
    ]
    expect(chooseNode(bare, 's', 'n1', RACK)).toEqual({
      siteId: 's',
      nodeId: 'n1',
      rackId: '',
    })
    // A site change prefers a node that has a rack.
    expect(chooseSite(bare, 's', RACK)).toEqual({
      siteId: 's',
      nodeId: 'n2',
      rackId: 'r',
    })
  })

  it('never offers the excluded rack (Copy rack layout’s own target)', () => {
    const own = { level: 'rack', exclude: 'rack-a03' } as const
    expect(chooseNode(tree, 'site-main', 'node-a', own)).toEqual({
      siteId: 'site-main',
      nodeId: 'node-a',
      rackId: '',
    })
    expect(chooseSite(tree, 'site-main', own).rackId).not.toBe('rack-a03')
  })

  it('an empty database gives an empty place and does not throw', () => {
    expect(startPlace([], undefined, RACK)).toEqual({
      siteId: '',
      nodeId: '',
      rackId: '',
    })
    expect(chooseSite([], 'x', RACK)).toEqual({
      siteId: '',
      nodeId: '',
      rackId: '',
    })
  })

  it('keeps the shown place when the value it reports comes back (a refetch, its own "")', () => {
    const chosen = chooseNode(tree, 'site-main', 'node-core', RACK)
    expect(follow(tree, chosen, 'rack-core-01', RACK)).toBe(chosen)
    const bare = { ...chosen, rackId: '' }
    expect(follow(tree, bare, '', RACK)).toBe(bare)
  })

  it('moves to a value set from elsewhere', () => {
    const chosen = startPlace(tree, 'rack-a03', RACK)
    expect(follow(tree, chosen, 'rack-dr02', RACK)).toEqual({
      siteId: 'site-dr',
      nodeId: 'node-dr2',
      rackId: 'rack-dr02',
    })
  })
})

describe('P2-1 the far-end picker keeps its behaviour', () => {
  it('starts at the equipment’s rack, else the first site, node and rack', () => {
    expect(startPlace(tree, 'PANEL-A', EQUIPMENT)).toEqual({
      siteId: 'site-main',
      nodeId: 'node-a',
      rackId: 'rack-a03',
    })
    expect(startPlace(tree, undefined, EQUIPMENT)).toEqual({
      siteId: tree[0].id,
      nodeId: tree[0].nodes[0].id,
      rackId: tree[0].nodes[0].racks[0].id,
    })
  })

  it('never offers the excluded near end', () => {
    const near = { level: 'equipment', exclude: 'BB-01' } as const
    const core03 = findRack(tree, {
      siteId: 'site-main',
      nodeId: 'node-core',
      rackId: 'rack-core-03',
    })
    expect(core03?.equipment.map((e) => e.id)).toEqual(['BB-01'])
    expect(eligibleIn(core03, near)).toEqual([])
    // A node change skips the rack that offers nothing.
    expect(chooseNode(tree, 'site-main', 'node-core', near).rackId).toBe(
      'rack-core-01',
    )
  })
})
```

IDs are the TS fixture's (`src/features/map/acceptanceFixture.ts`): sites `site-main`, `site-dr`; nodes `node-a`, `node-sm`, `node-core`, `node-dr1`, `node-dr2`; equipment IDs are their names (`PANEL-A`, `BB-01`). Sorted by name, the first site is DR Site and its first node DR Access.

- [ ] **Step 2: Run them to see them fail**

Run (from `frontend/`): `npx vitest run src/features/patching/patching.test.ts`
Expected: FAIL — `startPlace`, `chooseSite`, `chooseNode`, `follow` are not exported; `units` missing.

- [ ] **Step 3: Implement**

In `patching.ts`, add `units` to `RackBranch`:

```ts
export interface RackBranch {
  id: string
  name: string
  units: number
  equipment: Pick<Equipment, 'id' | 'name' | 'kind'>[]
}
```

and in `locationTree`'s rack map add `units: rack.units,` after `name: rack.name,`.

After `locationTree`, add:

```ts
/** A place in the tree; '' where a level has nothing chosen. */
export interface Place {
  siteId: string
  nodeId: string
  rackId: string
}

/** What a LocationPicker ends on: an equipment (the patching far end) or a rack (the forms). */
export type PickLevel = 'equipment' | 'rack'

/** `exclude` is a rack in rack mode (Copy rack layout's target) and an equipment in equipment mode (the near end). */
export interface PickRules {
  level: PickLevel
  exclude?: string
}

/** The racks a node offers. */
export function racksOf(node: NodeBranch | undefined, rules: PickRules) {
  const racks = node?.racks ?? []
  return rules.level === 'rack'
    ? racks.filter((r) => r.id !== rules.exclude)
    : racks
}

/** The equipment a rack offers as a far end. */
export function eligibleIn(rack: RackBranch | undefined, rules: PickRules) {
  const all = rack?.equipment ?? []
  return rules.level === 'equipment'
    ? all.filter((e) => e.id !== rules.exclude)
    : all
}

export function findRack(tree: readonly SiteBranch[], place: Place) {
  return tree
    .find((s) => s.id === place.siteId)
    ?.nodes.find((n) => n.id === place.nodeId)
    ?.racks.find((r) => r.id === place.rackId)
}

/** A rack worth landing on: any rack in rack mode, one with equipment to offer otherwise. */
const offers = (rack: RackBranch, rules: PickRules) =>
  rules.level === 'rack' || eligibleIn(rack, rules).length > 0

function firstRack(node: NodeBranch | undefined, rules: PickRules) {
  const racks = racksOf(node, rules)
  return racks.find((r) => offers(r, rules)) ?? racks[0]
}

function firstNode(site: SiteBranch | undefined, rules: PickRules) {
  return (
    site?.nodes.find((n) => racksOf(n, rules).some((r) => offers(r, rules))) ??
    site?.nodes[0]
  )
}

/**
 * Where the picker starts for `value` (a rack ID in rack mode, an equipment ID
 * otherwise). When it is not in the tree: the first site and its first node,
 * and in rack mode no rack, so a form never adds to a rack nobody chose; in
 * equipment mode that node's first rack, as the patching screen always did.
 */
export function startPlace(
  tree: readonly SiteBranch[],
  value: string | undefined,
  rules: PickRules,
): Place {
  for (const site of tree)
    for (const node of site.nodes)
      for (const rack of node.racks)
        if (
          rules.level === 'rack'
            ? rack.id === value
            : rack.equipment.some((e) => e.id === value)
        )
          return { siteId: site.id, nodeId: node.id, rackId: rack.id }
  const site = tree[0]
  const node = site?.nodes[0]
  return {
    siteId: site?.id ?? '',
    nodeId: node?.id ?? '',
    rackId: rules.level === 'rack' ? '' : (node?.racks[0]?.id ?? ''),
  }
}

/** After the user picks a site: its first node with something to offer, and that node's first such rack. */
export function chooseSite(
  tree: readonly SiteBranch[],
  siteId: string,
  rules: PickRules,
): Place {
  const site = tree.find((s) => s.id === siteId)
  const node = firstNode(site, rules)
  return {
    siteId: site?.id ?? '',
    nodeId: node?.id ?? '',
    rackId: firstRack(node, rules)?.id ?? '',
  }
}

/** After the user picks a node: its first rack with something to offer; '' when it has no rack. */
export function chooseNode(
  tree: readonly SiteBranch[],
  siteId: string,
  nodeId: string,
  rules: PickRules,
): Place {
  const node = tree
    .find((s) => s.id === siteId)
    ?.nodes.find((n) => n.id === nodeId)
  return { siteId, nodeId, rackId: firstRack(node, rules)?.id ?? '' }
}

/**
 * The place for a value set from outside (a recent target, Undo, a refetch, the
 * form echoing what the picker reported): the same place when it already shows
 * that value, so the user's Site and Node stay put; else where the value starts.
 */
export function follow(
  tree: readonly SiteBranch[],
  place: Place,
  value: string | undefined,
  rules: PickRules,
): Place {
  const shown =
    rules.level === 'rack'
      ? place.rackId === (value ?? '')
      : eligibleIn(findRack(tree, place), rules).some((e) => e.id === value)
  return shown ? place : startPlace(tree, value, rules)
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/features/patching/patching.test.ts`
Expected: PASS, including the existing PT-01…tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS (adding `units` to `RackBranch` breaks no caller: only `locationTree` builds it). Leave uncommitted.

---

### Task 2: `LocationPicker` rack mode

**Files:**
- Modify: `frontend/src/features/patching/LocationPicker.tsx` (whole file)
- Create: `frontend/src/features/patching/location-picker.css`
- Modify: `frontend/src/features/patching/patching.css` (remove lines 144–176, the four `.location-picker` rules)

**Interfaces:**
- Consumes: Task 1's `Place`, `PickRules`, `racksOf`, `eligibleIn`, `findRack`, `startPlace`, `chooseSite`, `chooseNode`, `follow`.
- Produces (used by Tasks 3–5):
  ```ts
  <LocationPicker level="rack" label="Place" tree={tree} rackId={id} exclude?={rackId} disabled?={bool} onChange={(rackId: string) => …} />
  <LocationPicker tree={tree} equipmentId={id} exclude={id} freeOf={fn} onChange={(equipmentId: string) => …} />   // unchanged call in PatchingScreen
  ```

The behaviour is covered by Task 1's pure tests and by the existing patching e2e (`e2e/patching*.spec.ts`, which drive `chooseFar`), which must stay green; rack mode's e2e comes with its first form in Task 3.

- [ ] **Step 1: Rewrite the component**

```tsx
import { useId, useState } from 'react'
import {
  chooseNode,
  chooseSite,
  eligibleIn,
  findRack,
  follow,
  racksOf,
  startPlace,
  type Place,
  type PickRules,
  type SiteBranch,
} from './patching'
import './location-picker.css'

type Props = {
  tree: readonly SiteBranch[]
  /** The group's accessible name. */
  label?: string
  /** A rack in rack mode, an equipment otherwise; never offered. */
  exclude?: string
  disabled?: boolean
} & (
  | {
      level?: 'equipment'
      equipmentId?: string
      freeOf: (equipmentId: string) => number
      onChange: (equipmentId: string) => void
    }
  | {
      level: 'rack'
      rackId?: string
      onChange: (rackId: string) => void
    }
)

/**
 * A place chosen as Site › Node › Rack (rack mode, the forms) or Site › Node ›
 * Rack › Equipment (the patching far end), so a large network never becomes
 * one long list. Where it starts and what a Site or Node change selects are
 * the pure `startPlace`, `chooseSite` and `chooseNode` in patching.ts.
 */
export default function LocationPicker(props: Props) {
  const { tree, disabled } = props
  const rules: PickRules = {
    level: props.level ?? 'equipment',
    exclude: props.exclude,
  }
  const value = props.level === 'rack' ? props.rackId : props.equipmentId
  const id = useId()
  const [choice, setChoice] = useState(() => startPlace(tree, value, rules))
  // Follow a value set elsewhere (a recent target, Undo, a new drop).
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setChoice(follow(tree, choice, value, rules))
  }
  const site = tree.find((s) => s.id === choice.siteId) ?? tree[0]
  const node =
    site?.nodes.find((n) => n.id === choice.nodeId) ?? site?.nodes[0]
  const racks = racksOf(node, rules)
  const rack =
    racks.find((r) => r.id === choice.rackId) ??
    (rules.level === 'rack' ? undefined : racks[0])
  const inRack = eligibleIn(rack, rules)

  /** Moves to `next` and reports it: the rack, or its first equipment when it has one. */
  const go = (next: Place) => {
    setChoice(next)
    if (props.level === 'rack') return props.onChange(next.rackId)
    const first = eligibleIn(findRack(tree, next), rules)[0]
    if (first) props.onChange(first.id)
  }

  return (
    <div
      className="location-picker"
      role="group"
      aria-label={props.label ?? 'Far end'}
      data-level={rules.level}
    >
      <label htmlFor={`${id}-site`}>
        Site
        <select
          id={`${id}-site`}
          aria-label="Site"
          value={site?.id ?? ''}
          disabled={disabled || tree.length === 0}
          onChange={(e) => go(chooseSite(tree, e.target.value, rules))}
        >
          {tree.length === 0 && <option value="">No sites yet</option>}
          {tree.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-node`}>
        Node
        <select
          id={`${id}-node`}
          aria-label="Node"
          value={node?.id ?? ''}
          disabled={disabled || !site?.nodes.length}
          onChange={(e) =>
            go(chooseNode(tree, site?.id ?? '', e.target.value, rules))
          }
        >
          {!site?.nodes.length && <option value="">No nodes here</option>}
          {site?.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-rack`}>
        Rack
        <select
          id={`${id}-rack`}
          aria-label="Rack"
          value={rack?.id ?? ''}
          disabled={disabled || racks.length === 0}
          onChange={(e) =>
            go({
              siteId: site?.id ?? '',
              nodeId: node?.id ?? '',
              rackId: e.target.value,
            })
          }
        >
          {racks.length === 0 && <option value="">No racks here</option>}
          {racks.length > 0 && !rack && (
            <option value="" disabled>
              Choose…
            </option>
          )}
          {racks.map((r) => (
            <option key={r.id} value={r.id}>
              {rules.level === 'rack'
                ? `${r.name} · ${r.units}U`
                : `${r.name} (${eligibleIn(r, rules).length})`}
            </option>
          ))}
        </select>
      </label>
      {props.level !== 'rack' && (
        <label htmlFor={`${id}-equipment`}>
          Equipment
          <select
            id={`${id}-equipment`}
            aria-label="Equipment"
            value={inRack.some((e) => e.id === value) ? value : ''}
            disabled={disabled || inRack.length === 0}
            onChange={(e) => props.onChange(e.target.value)}
          >
            {inRack.length === 0 && <option value="">No equipment here</option>}
            {inRack.length > 0 && !inRack.some((e) => e.id === value) && (
              <option value="" disabled>
                Choose…
              </option>
            )}
            {inRack.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {props.freeOf(e.id)} free
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
```

Note: the previous Site handler reset only with `go`, identical in effect to `chooseSite`; the previous Node handler is `chooseNode`. The one visible change in equipment mode is the new "No racks here" / "No nodes here" / "No sites yet" entries on empty levels.

- [ ] **Step 2: Move the styles**

Create `location-picker.css` with the four rules cut from `patching.css` (lines 144–176, `.location-picker`, its `@media (max-width: 600px)` block, `.location-picker label`, `.location-picker select`) unchanged, then append rack mode, which is used only in narrow hosts (the library drawer, the inspector, the 360px popovers), so one level per row, label beside its select:

```css
.location-picker[data-level='rack'] {
  grid-template-columns: minmax(0, 1fr);
}
.location-picker[data-level='rack'] label {
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
```

`PatchingScreen.tsx` keeps `import './patching.css'`; the picker now imports its own file.

- [ ] **Step 3: Verify**

Run (from `frontend/`): `npm run typecheck && npx vitest run src/features/patching && npx playwright test e2e/patching.spec.ts`
(`ls e2e | grep -i patch` first; run every patching spec there.)
Expected: all PASS; the far-end picker behaves as before. Leave uncommitted.

---

### Task 3: Add equipment and Add HDF forms

**Files:**
- Modify: `frontend/src/features/planning/AddEquipmentForm.tsx` (imports, props at 59–72, Rack/Unit block at 166–190)
- Modify: `frontend/src/features/planning/HdfForm.tsx` (imports, props of both components, initial values at 76–82, Rack/Lowest-unit block at 143–165)
- Modify: `frontend/src/features/planning/LibraryItems.tsx` (import, `racks` prop → `tree`, both call sites)
- Modify: `frontend/src/app/App.tsx` (`Workspace`, near `const index = useMemo(...)` at line 631; `LibraryItems` at 993)
- Modify: `frontend/e2e/patching-helpers.ts` (`chooseRack`)
- Modify e2e: `map.spec.ts:137`, `editing.spec.ts:347-351` and `:524`, `planning.spec.ts:41` and `:91`, `portgroups.spec.ts:69`, `placement.spec.ts:133`
- Test: new test in `frontend/e2e/placement.spec.ts`

**Interfaces:**
- Consumes: Task 2's `LocationPicker` rack mode; Task 1's `locationTree`, `SiteBranch`.
- Produces: `AddEquipmentForm`, `HdfForm`, `LibraryItems` take `tree: readonly SiteBranch[]` instead of `racks: readonly Rack[]`; `Workspace` has `const tree = useMemo(() => locationTree(snapshot), [snapshot])` (Task 4 uses it); `chooseRack(scope: Locator | Page, group: string, where: { site: string; node: string; rack: string })` in `e2e/patching-helpers.ts` (Tasks 4–5 use it).

- [ ] **Step 1: Add the e2e helper**

In `e2e/patching-helpers.ts`, after `choose`:

```ts
/** A rack by Site › Node › Rack in the picker group named `group`, as a user picks it. */
export async function chooseRack(
  scope: Locator | Page,
  group: string,
  where: { site: string; node: string; rack: string },
) {
  const picker = scope.getByRole('group', { name: group, exact: true })
  await choose(picker.getByLabel('Site', { exact: true }), where.site)
  await choose(picker.getByLabel('Node', { exact: true }), where.node)
  await choose(picker.getByLabel('Rack', { exact: true }), `${where.rack} ·`)
}
```

- [ ] **Step 2: Write the failing e2e test**

In `e2e/placement.spec.ts` add `import { chooseRack } from './patching-helpers'` and `import { getPlan } from './plan-api'`, then append:

```ts
test('P2-1 the Add form picks its rack as Site › Node › Rack, starting at the open rack', async ({
  page,
  request,
}) => {
  const id = await newPlan(request, 'Picker check')
  await page.goto(`/?plan=${id}`)
  await openRackInPhysical(page, 'Main Campus', 'Building A', 'Rack A03')
  await page.getByRole('button', { name: 'Add equipment library' }).click()
  await page.getByRole('button', { name: 'Add Access switch…' }).click()
  const form = page.getByTestId('equipment-form')
  const place = form.getByRole('group', { name: 'Place', exact: true })
  const level = (name: string) => place.getByLabel(name, { exact: true })
  await expect(level('Site')).toHaveValue('site-main-campus')
  await expect(level('Node')).toHaveValue('node-building-a')
  await expect(level('Rack')).toHaveValue('rack-a03')
  await expect(level('Rack').locator('option:checked')).toHaveText(
    'Rack A03 · 12U',
  )
  // A site change moves Node and Rack to that site's first.
  await level('Site').selectOption('site-dr')
  await expect(level('Node')).toHaveValue('node-dr-access')
  await expect(level('Rack')).toHaveValue('rack-dr01')
  await chooseRack(form, 'Place', {
    site: 'Main Campus',
    node: 'Main Distribution',
    rack: 'Rack Core 03',
  })
  await page.screenshot({ path: 'test-results/p2-1-add-form.png' })
  await form.getByLabel('Name').fill('PICK-EDGE')
  await form.getByLabel('Network').selectOption('net-a')
  await form.getByLabel('Ports').fill('2')
  await form.getByRole('button', { name: 'Add to plan' }).click()
  await expect(form).toHaveCount(0)
  const plan = await getPlan(request, id)
  expect(
    plan.equipment.find((e: { name: string }) => e.name === 'PICK-EDGE'),
  ).toMatchObject({ rackId: 'rack-core-03', unit: 1 })
})
```

(The file's local `newPlan` stays; import only `getPlan`. Rack Core 03 holds only BB-01 at U8, so U1 is free.)

- [ ] **Step 3: Run it to see it fail**

Run: `npx playwright test e2e/placement.spec.ts -g "P2-1"`
Expected: FAIL — no group named "Place".

- [ ] **Step 4: Wire the tree in App and LibraryItems**

`App.tsx`: add `import { locationTree } from '../features/patching/patching'`; in `Workspace`, right after `const index = useMemo(() => indexSnapshot(snapshot), [snapshot])`:

```ts
  const tree = useMemo(() => locationTree(snapshot), [snapshot])
```

and in `<LibraryItems …>` replace `racks={snapshot.racks}` with `tree={tree}`.

`LibraryItems.tsx`: change the type import to `import type { Network, Plan } from '../../shared/types'`, add `import type { SiteBranch } from '../patching/patching'`, rename the prop `racks` → `tree` (type `readonly SiteBranch[]`) in the destructuring and the props type, and pass `tree={tree}` to `<AddEquipmentForm>` and `<HdfForm>` instead of `racks={racks}`.

- [ ] **Step 5: AddEquipmentForm**

Imports: `import type { Network, Plan } from '../../shared/types'`, `import LocationPicker from '../patching/LocationPicker'`, `import type { SiteBranch } from '../patching/patching'`. Props: `racks: readonly Rack[]` → `tree: readonly SiteBranch[]` (destructuring too). Replace the whole `<div className="two">` holding Rack and Unit with:

```tsx
      <LocationPicker
        level="rack"
        label="Place"
        tree={tree}
        rackId={values.rackId}
        onChange={set('rackId')}
      />
      <label>
        Unit
        <input
          type="number"
          min={1}
          value={values.unit}
          onChange={(e) => set('unit')(e.target.value)}
        />
      </label>
```

`checkEquipmentForm` already says "Choose a rack." for `''`.

- [ ] **Step 6: HdfForm**

Same imports (drop `Rack`). In both `HdfForm` and `Form`, `racks: readonly Rack[]` → `tree: readonly SiteBranch[]`, and `HdfForm` passes `tree={tree}`. Initial value: `rackId: defaultRackId ?? '',` (no `racks[0]` fallback). Replace the `<div className="two">` holding Rack and Lowest unit with:

```tsx
      <LocationPicker
        level="rack"
        label="Place"
        tree={tree}
        rackId={values.rackId}
        onChange={set('rackId')}
      />
      <label>
        Lowest unit
        <input
          type="number"
          min={1}
          value={values.unit}
          onChange={(e) => set('unit')(e.target.value)}
        />
      </label>
```

Update the component comment's field list: "(name, rows 1–32, height in rack units, Site › Node › Rack, lowest unit)".

- [ ] **Step 7: Move the existing e2e rack choices to the picker**

Each `form.getByLabel('Rack', { exact: true }).selectOption('<id>')` becomes `await chooseRack(<same form locator>, 'Place', where)` with, from the acceptance fixture:
- `rack-a03` → `{ site: 'Main Campus', node: 'Building A', rack: 'Rack A03' }` — `map.spec.ts:137`, `planning.spec.ts:41`, `planning.spec.ts:91` (locator `stale`), `portgroups.spec.ts:69`, `placement.spec.ts:133` (locator `next`)
- `rack-sm01` → `{ site: 'Main Campus', node: 'North Sub-main', rack: 'Rack SM01' }` — `editing.spec.ts:524`
- `editing.spec.ts:351`: `await form.locator('select').selectOption({ label: 'Rack SM01' })` → `await chooseRack(form, 'Place', { site: 'Main Campus', node: 'North Sub-main', rack: 'Rack SM01' })`

Add `import { chooseRack } from './patching-helpers'` where missing. The `toHaveValue` checks (`placement.spec.ts:30`, `:112`, `rack.spec.ts:168`) stay: the picker's rack select is labelled "Rack" and still holds the rack ID (`''` for the unplaced preview, which now shows "Choose…").

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npx playwright test e2e/placement.spec.ts e2e/map.spec.ts e2e/editing.spec.ts e2e/planning.spec.ts e2e/portgroups.spec.ts e2e/rack.spec.ts`
Expected: all PASS, including P2-1. Open `test-results/p2-1-add-form.png` and check the picker sits in the drawer without horizontal overflow. Leave uncommitted.

---

### Task 4: The inspector's placement (Move) form

**Files:**
- Modify: `frontend/src/features/planning/PlacementEditor.tsx` (whole file)
- Modify: `frontend/src/app/App.tsx` (`<PlacementEditor>` at ~925)
- Modify: `frontend/e2e/placement.spec.ts:41-58` (`moveWithForm`)

**Interfaces:**
- Consumes: Task 3's `tree` in `Workspace` and `chooseRack`.
- Produces: `PlacementEditor` props `{ equipment, tree: readonly SiteBranch[], racks: readonly Rack[], pending, onMove }` (`racks` only for the unit's maximum).

- [ ] **Step 1: Change the e2e to the picker (it fails first)**

In `placement.spec.ts`, replace `moveWithForm`'s signature and its select line:

```ts
  const moveWithForm = async (
    from: string,
    where: { site: string; node: string; rack: string },
    unit: string,
  ) => {
    await page.getByTestId(from).locator('.rack-block').click() // opens its page
    if ((await page.locator('aside.studio-drawer').count()) === 0)
      await page.getByRole('button', { name: 'Open inspector' }).click()
    await chooseRack(page, 'Placement', where)
    await page.getByLabel('Placement unit', { exact: true }).fill(unit)
```

and the two calls:

```ts
  await moveWithForm(
    'rack-slot-rack-a03-4',
    { site: 'DR Site', node: 'DR Distribution', rack: 'Rack DR02' },
    '3',
  )
  …
  await moveWithForm(
    'rack-slot-rack-a03-8',
    { site: 'Main Campus', node: 'Main Distribution', rack: 'Rack Core 02' },
    '4',
  )
```

Run: `npx playwright test e2e/placement.spec.ts -g "rack drops"`
Expected: FAIL — no group named "Placement".

- [ ] **Step 2: Implement**

```tsx
import { useState } from 'react'
import type { Equipment, Rack } from '../../shared/types'
import LocationPicker from '../patching/LocationPicker'
import type { SiteBranch } from '../patching/patching'

export default function PlacementEditor({
  equipment,
  tree,
  racks,
  pending,
  onMove,
}: {
  equipment: Equipment
  tree: readonly SiteBranch[]
  /** For the chosen rack's height, the unit's maximum. */
  racks: readonly Rack[]
  pending: boolean
  onMove: (placement: {
    equipmentId: string
    rackId: string
    unit: number
  }) => void
}) {
  const [rackID, setRackID] = useState(equipment.rackId)
  const [unit, setUnit] = useState(equipment.unit)
  return (
    <form
      className="placement-editor"
      onSubmit={(event) => {
        event.preventDefault()
        if (rackID) onMove({ equipmentId: equipment.id, rackId: rackID, unit })
      }}
    >
      <p className="section-label">Planned placement</p>
      <LocationPicker
        level="rack"
        label="Placement"
        tree={tree}
        rackId={rackID}
        disabled={pending}
        onChange={setRackID}
      />
      <label>
        Placement unit
        <input
          type="number"
          min={1}
          max={racks.find((r) => r.id === rackID)?.units ?? 100}
          required
          value={unit}
          disabled={pending}
          onChange={(e) => setUnit(Number(e.target.value))}
        />
      </label>
      <button className="button" disabled={pending || !rackID}>
        {pending ? 'Saving placement…' : 'Save planned placement'}
      </button>
    </form>
  )
}
```

In `App.tsx`'s `<PlacementEditor>`, add `tree={tree}` (keep `racks={snapshot.racks}`). If `PlacementEditor` is rendered outside `Workspace` (check with `grep -n "PlacementEditor" src/app/App.tsx` and the enclosing function), build `tree` there with the same `useMemo`, or pass it down as a prop from `Workspace`; do not compute it per render.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npx playwright test e2e/placement.spec.ts`
Expected: PASS. Leave uncommitted.

---

### Task 5: Duplicate and Copy rack layout

**Files:**
- Modify: `frontend/src/features/planning/DuplicateEquipment.tsx` (imports at 1–11, `racks` memo at 73, `TracePicker` at 122–130)
- Modify: `frontend/src/features/planning/CopyRackLayout.tsx` (imports at 1–10, `racks` memo at 92–95, `TracePicker` at ~117–125)
- Modify: `frontend/src/features/planning/duplicate.ts:271-281` (delete `rackItems`)
- Modify: `frontend/e2e/duplicate.spec.ts:139-140` and `:159-160`
- Test: new assertion in `frontend/e2e/duplicate.spec.ts` BK-03

**Interfaces:**
- Consumes: Task 2's picker, Task 1's `locationTree`, Task 3's `chooseRack`.
- Produces: nothing new; `rackItems` no longer exists.

- [ ] **Step 1: Change the e2e to the picker (it fails first)**

In `duplicate.spec.ts` add `import { chooseRack } from './patching-helpers'`. In BK-03, after `await dup.getByLabel('Count').fill('3')`, add:

```ts
  // The rack is chosen as Site › Node › Rack and starts at the original's.
  const place = dup.getByRole('group', { name: 'Place', exact: true })
  await expect(place.getByLabel('Rack', { exact: true })).toHaveValue(
    'rack-a03',
  )
```

Replace both Copy rack layout choices:

```ts
  await tiny.getByRole('combobox').fill('rack a03')
  await page.getByRole('option', { name: 'Rack A03 · Building A' }).click()
```
→
```ts
  await chooseRack(tiny, 'Copy the layout of', {
    site: 'Main Campus',
    node: 'Building A',
    rack: 'Rack A03',
  })
```
(and the same with `copy` for the second one).

Run: `npx playwright test e2e/duplicate.spec.ts`
Expected: FAIL — no group named "Place" / "Copy the layout of".

- [ ] **Step 2: Duplicate**

Imports: remove `TracePicker`; `import { MAX_COPIES, duplicateLines } from './duplicate'`; add `import LocationPicker from '../patching/LocationPicker'` and `import { locationTree } from '../patching/patching'`. Replace `const racks = useMemo(() => rackItems(snapshot), [snapshot])` with `const tree = useMemo(() => locationTree(snapshot), [snapshot])`. Replace the `<TracePicker label="Rack" … />` with:

```tsx
      <LocationPicker
        level="rack"
        label="Place"
        tree={tree}
        rackId={rackId}
        onChange={(v) => {
          setRackId(v)
          action.clear()
        }}
      />
```

`lines` is already `[]` while `rackId` is `''`, so the button stays disabled on a node with no racks.

- [ ] **Step 3: Copy rack layout**

Imports: remove `TracePicker`; `import { copyLayout } from './duplicate'`; add `LocationPicker` and `locationTree` as above. Replace the `racks` memo with `const tree = useMemo(() => locationTree(snapshot), [snapshot])` and the `<TracePicker label="Copy the layout of" … />` with:

```tsx
      <LocationPicker
        level="rack"
        label="Copy the layout of"
        tree={tree}
        rackId={from}
        exclude={rackId}
        onChange={(v) => {
          setFrom(v)
          action.clear()
        }}
      />
```

- [ ] **Step 4: Delete `rackItems`**

Delete the `rackItems` function (and its doc comment, if any) from `duplicate.ts`. Then `grep -rn "rackItems" frontend/src frontend/e2e` must print nothing.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npx vitest run src/features/planning && npx playwright test e2e/duplicate.spec.ts e2e/portgroups.spec.ts`
Expected: PASS. The `copy-blocked`/`copy-valid` screenshots still show the popover ≥ 300px wide inside the viewport (the existing bounding-box assertions check it). Leave uncommitted.

---

### Task 6: Docs and the full handoff run

**Files:**
- Modify: `docs/current-status.md`
- Modify: `docs/implementation-plan.md` (P2 scope, item 1)

- [ ] **Step 1: Status**

In `docs/current-status.md`, where the forms and the patching screen are described, say what now runs: the Add switch / Aggregation / Patch panel forms, the HDF form, the inspector's placement, Duplicate and Copy rack layout choose the rack as Site › Node › Rack (`LocationPicker` rack mode); they start at the dropped or open rack, the equipment's or the source's rack, and with no known location at the first site and node with no rack chosen; Copy rack layout never offers its own target rack. Find the right place with `grep -n "Duplicate\|LocationPicker\|Add…" docs/current-status.md`.

- [ ] **Step 2: Plan**

In `docs/implementation-plan.md`, P2 scope item 1, append: "*Done 2026-10-13* (rack mode of `LocationPicker`; also Copy rack layout, owner's answer; with no known location a form starts at the first site and node with no rack chosen)."

`api/openapi.yaml` and `shared/types.ts` are unchanged (no API change); say so in the handoff.

- [ ] **Step 3: Full verification**

From `frontend/`: `npm test && npm run typecheck && npm run build && npm run format:check && npm run test:e2e`
From `backend/`: `go test -race ./... && go vet ./...`
Expected: all green. If `format:check` fails, run `npm run format` and re-run it. Report the outputs, attach `test-results/p2-1-add-form.png`, and stop for the owner's review. No commit.
