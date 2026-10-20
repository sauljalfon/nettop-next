import {
  Columns3,
  Download,
  GitBranch,
  Plus,
  RefreshCw,
  Pencil,
  Search,
  Star,
  Tag,
  Trash2,
  Unlink,
  type LucideIcon,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { useDebounced } from '../../shared/lazy'
import type { Plan, Snapshot } from '../../shared/types'
import Chip from '../../shared/ui/Chip'
import Name from '../../shared/ui/Name'
import { networkColors } from '../map/networkColors'
import { indexSnapshot, type SnapshotIndex } from '../map/snapshotIndex'
import { patchingSession } from '../patching/patchingSession'
import type { PlanEdit } from '../planning/editing'
import { OPENER, useInlineDialog } from '../planning/useInlineDialog'
import BulkEditPane from './BulkEditPane'
import { GROUPS, PILLS, visibleColumns, type InventoryList } from './columns'
import LabelsPane from './LabelsPane'
import { DeletePane, DisconnectPane } from './ManyPanes'
import { csvFileName, toCsv } from './csv'
import InventoryTable from './InventoryTable'
import { TypeIcon } from './icons'
import { inventorySession } from './inventorySession'
import {
  barCommands,
  manyCommands,
  menuCommands,
  metaText,
  networkChange,
  pillText,
  showsAdd,
  tableItems,
  type CommandContext,
  type ManyCommandId,
  type RowCommandId,
} from './model'
import { ColumnsPane, CsvPane, LIST_TITLES } from './Panes'
import { applyQuery, valueOptions } from './query'
import { buildRows, type InventoryRow } from './rows'
import { resolveView, savedViews, type SavedView } from './savedViews'
import { buildWorkList } from './workList'
import { CommandIcon } from './RowMenu'
import RowMenu from './RowMenu'
import ValuePicker from './ValuePicker'
import './inventory.css'

/** The lists of the left menu; the Work list is added first in a plan. */
const MENU_LISTS = [
  'equipment',
  'ports',
  'cables',
  'racks',
  'problems',
] as const

const LIST_ICON = {
  equipment: 'switch',
  ports: 'port',
  cables: 'cable',
  racks: 'rack',
  problems: 'problem',
  work: 'clipboard',
} as const

interface Props {
  snapshot: Snapshot
  index: SnapshotIndex
  /** The installed topology: the Work list reads removals and disconnects from it. */
  installed: Snapshot
  installedIDs: ReadonlySet<string>
  installedLinkIDs: ReadonlySet<string>
  /** The open plan's name; absent when Installed is shown. */
  planName?: string
  /** The open plan (the Work list is made from it). */
  plan?: Plan
  /** A current draft is open: equipment can be added. */
  canEdit: boolean
  /** The header's network (already checked against this snapshot). */
  networkId?: string
  /** One network (or none) chosen in the Network pill: the header follows. */
  onNetworkChange: (id: string | undefined) => void
  onOpenAdd: () => void
  onRefresh: () => Promise<void>
  /** Select the equipment and open the inspector, on the port when there is one. */
  onOpenEquipment: (equipmentId: string, endpointId?: string) => void
  /** Select the equipment and open Focus on it. */
  onShowOnMap: (equipmentId: string) => void
  /** The equipment page, at the endpoint when given. */
  onShowInPhysical: (equipmentId: string, endpointId?: string) => void
  /** The inspector on this equipment with its delete confirm open. */
  onAskDelete: (equipmentId: string) => void
  /** The inspector on the port's equipment, the port found, that cable's disconnect confirm open. */
  onAskDisconnect: (
    equipmentId: string,
    endpointId: string | undefined,
    linkId: string,
  ) => void
  /** The Ports list with only this equipment; the header's network is cleared. */
  onViewPorts: (equipmentName: string) => void
  /** A rack, node or site in Physical. */
  onShowPlace: (place: {
    siteId?: string
    nodeId?: string
    rackId?: string
  }) => void
  /** One command to the open draft; absent unless the draft is current. */
  edit?: PlanEdit
  /** After a direct fix: refetch and toast. */
  onFixed: (message: string) => Promise<void>
}

const MANY_ICON: Record<ManyCommandId, LucideIcon> = {
  edit: Pencil,
  deleteMany: Trash2,
  disconnectMany: Unlink,
  labels: Tag,
}

/** A container (Racks, an added site, node or rack) opens its place. */
const spotOf = (row: InventoryRow) =>
  row.place ?? (row.rackId ? { rackId: row.rackId } : undefined)

export default function InventoryPage({
  snapshot,
  index,
  installed,
  installedIDs,
  installedLinkIDs,
  planName,
  plan,
  canEdit,
  networkId,
  onNetworkChange,
  onOpenAdd,
  onRefresh,
  onOpenEquipment,
  onShowOnMap,
  onShowInPhysical,
  onAskDelete,
  onAskDisconnect,
  onViewPorts,
  onShowPlace,
  edit,
  onFixed,
}: Props) {
  const state = useSyncExternalStore(
    inventorySession.subscribe,
    inventorySession.getSnapshot,
  )
  const { list } = state
  const q = state.lists[list]
  const hidden = state.hidden[list]

  const allRows = useMemo(
    () => buildRows(snapshot, index, installedIDs, installedLinkIDs),
    [snapshot, index, installedIDs, installedLinkIDs],
  )
  // The Work list needs the plan and the installed index; both only when a plan
  // is open, and the list is built again only when one of them changes.
  const inPlan = planName !== undefined
  useEffect(
    () => inventorySession.setContext(inPlan ? 'planned' : 'installed'),
    [inPlan],
  )
  const installedIndex = useMemo(
    () => (inPlan ? indexSnapshot(installed) : undefined),
    [inPlan, installed],
  )
  const workRows = useMemo(
    () =>
      plan && installedIndex
        ? buildWorkList(plan, installed, installedIndex, snapshot, index)
        : [],
    [plan, installed, installedIndex, snapshot, index],
  )
  const rowsOf = (l: InventoryList) => (l === 'work' ? workRows : allRows[l])
  const rows = rowsOf(list)
  const colors = useMemo(() => networkColors(snapshot.networks), [snapshot])
  const columns = visibleColumns(list, hidden)
  const result = useMemo(
    () => applyQuery(rows, list, q),
    [rows, list, q.search, q.filters, q.sort, q.group, q.page], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const items = useMemo(
    () => tableItems(result, q.group, q.collapsed, list),
    [result, q.group, q.collapsed, list],
  )

  // The header's network and the Network pill are one choice (D37); a list
  // shown afresh takes it from the session.
  useEffect(() => inventorySession.setHeaderNetwork(networkId), [networkId])

  // The search box: typing is local, the query gets it after 150 ms.
  const [text, setText] = useState(q.search)
  const settled = useDebounced(text, 150)
  useEffect(() => {
    if (settled !== inventorySession.getSnapshot().lists[list].search)
      inventorySession.setSearch(settled)
  }, [settled]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setText(q.search), [q.search, list])

  const [pane, setPane] = useState<'csv' | 'columns' | ManyCommandId | null>(
    null,
  )
  // The saved view in use, and what opening one left out or why it did not open.
  const [activeView, setActiveView] = useState<string>()
  const [note, setNote] = useState<string>()
  const savedList = useSyncExternalStore(savedViews.subscribe, savedViews.list)
  const [pill, setPill] = useState<string | null>(null)
  const [shown, setShown] = useState(0)
  // The list changed: nothing from the other list stays open.
  useEffect(() => setPill(null), [list])
  // A click outside the open picker cancels it.
  useEffect(() => {
    if (!pill) return
    const away = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.inv-pill-wrap')) setPill(null)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [pill])

  const filtered = Object.entries(q.filters).filter(([, v]) => v.length > 0)
  const anyFilter = filtered.length > 0 || q.search !== ''
  const grouped = !!q.group
  // The commands act on the one selected row that is still listed.
  const chosen = useMemo(
    () => result.all.filter((r) => q.selected.has(r.key)),
    [result, q.selected],
  )
  const selectedCount = chosen.length
  const one = chosen.length === 1 ? chosen[0] : undefined
  const context: CommandContext = {
    list,
    installed: planName === undefined,
    canEdit,
  }
  // Delete N… and Disconnect N… are for two or more rows; one keeps its confirm.
  const many = manyCommands(context, chosen).filter(
    (c) =>
      (c.id !== 'deleteMany' && c.id !== 'disconnectMany') ||
      selectedCount >= 2,
  )
  const [menu, setMenu] = useState<{ row: InventoryRow; anchor: DOMRect }>()
  const closeMenu = useCallback(() => setMenu(undefined), [])
  // Another list, another result or a new pill: the row may be gone.
  useEffect(() => setMenu(undefined), [list, result])
  const pageKeys = (grouped ? result.all : result.rows).map((r) => r.key)
  const allSelected =
    pageKeys.length > 0 && pageKeys.every((k) => q.selected.has(k))

  const applyPill = (key: string, values: string[]) => {
    inventorySession.setFilter(key, values)
    setPill(null)
    if (key !== 'net') return
    const change = networkChange(values)
    if (change.call) onNetworkChange(change.id)
  }
  const reset = () => {
    inventorySession.resetFilters()
    setText('')
    onNetworkChange(undefined)
  }
  const open = useCallback(
    (row: InventoryRow) => {
      if (row.gone) return
      const spot = spotOf(row)
      if (!row.equipmentId) {
        if (spot) onShowPlace(spot)
        return
      }
      onOpenEquipment(row.equipmentId, row.endpointId)
    },
    [onOpenEquipment, onShowPlace],
  )
  // Every command calls a function App already has. A cable acts on its A end.
  const run = (id: RowCommandId, row: InventoryRow) => {
    setMenu(undefined)
    const owner = row.equipmentId
    const spot = spotOf(row)
    if (!owner && spot && (id === 'open' || id === 'phys'))
      return onShowPlace(spot)
    switch (id) {
      case 'open':
        return onOpenEquipment(owner, row.endpointId)
      case 'connect':
        if (row.endpointId)
          patchingSession.open({
            nearEndpointId: row.endpointId,
            mode: 'one',
            count: 1,
            returnTo: `[${OPENER}="row-menu:${CSS.escape(row.key)}"]`,
          })
        return
      case 'focus':
        return onShowOnMap(owner)
      case 'phys':
      case 'editport':
        return onShowInPhysical(owner, row.endpointId)
      case 'ports':
        return onViewPorts(row.values.name ?? '')
      case 'delete':
        return onAskDelete(owner)
      case 'disconnect':
        if (row.cableId) onAskDisconnect(owner, row.endpointId, row.cableId)
    }
  }
  const download = () => {
    const blob = new Blob([toCsv(result.all, columns)], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = csvFileName(list, planName, new Date())
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const counts = {
    equipment: allRows.equipment.length,
    ports: allRows.ports.length,
    cables: allRows.cables.length,
    racks: allRows.racks.length,
    problems: allRows.problems.length,
    work: workRows.length,
  }
  const menuLists: readonly InventoryList[] = inPlan
    ? ['work', ...MENU_LISTS]
    : MENU_LISTS

  const openView = (view: SavedView) => {
    const valuesOf = (key: string) =>
      valueOptions(rowsOf(view.list), view.list, key).map((o) => o.value)
    const { view: resolved, dropped } = resolveView(view, valuesOf)
    const result = inventorySession.openView(resolved)
    if (!result.ok) {
      setNote(result.reason)
      return
    }
    setActiveView(view.name)
    setNote(
      dropped.length
        ? `Left out because they no longer exist: ${dropped.join(', ')}.`
        : undefined,
    )
    // The Network pill and the header are one choice (D37).
    const net = inventorySession.networkOfPill()
    if (net !== 'many') onNetworkChange(net)
  }
  const sorted = `${q.sort.key}:${q.sort.dir === 1 ? 'asc' : 'desc'}`

  return (
    <section
      className="inventory-page"
      data-inventory-list={list}
      data-inventory-total={result.total}
      data-inventory-shown={shown}
      data-inventory-page={result.page}
      data-inventory-group={q.group ?? ''}
      data-inventory-sort={sorted}
      data-inventory-filters={JSON.stringify(Object.fromEntries(filtered))}
    >
      <div className="inv-crumb">
        <span>net-top</span>
        <span aria-hidden="true">›</span>
        <span>Inventory</span>
      </div>
      <div className="inv-title">
        <h1>Inventory</h1>
        <span className="inv-sub">
          {planName === undefined ? (
            'Installed'
          ) : (
            <>
              <GitBranch size={14} aria-hidden="true" />
              Plan: <Name text={planName} /> · proposed items are marked{' '}
              <Chip kind="proposed">Proposed</Chip>
            </>
          )}
        </span>
      </div>
      <div className="inv-wrap">
        <div className="inv-side">
          <nav className="inv-menu" aria-label="Inventory lists">
            <h3>Lists</h3>
            {menuLists.map((l) => (
              <button
                key={l}
                aria-current={l === list && !activeView ? 'page' : undefined}
                onClick={() => {
                  setActiveView(undefined)
                  setNote(undefined)
                  inventorySession.setList(l)
                }}
              >
                <TypeIcon kind={LIST_ICON[l]} />
                <span>{LIST_TITLES[l]}</span>
                <span
                  className={`count${l === 'problems' && counts.problems > 0 ? ' warn' : ''}`}
                >
                  {counts[l].toLocaleString('en')}
                </span>
              </button>
            ))}
          </nav>
          <nav className="inv-menu" aria-label="Saved views">
            <h3>Saved views</h3>
            {savedList.length === 0 && (
              <p className="inv-small-note">None yet.</p>
            )}
            {savedList.map((v) => (
              <div className="inv-view-row" key={v.name}>
                <button
                  aria-current={activeView === v.name ? 'page' : undefined}
                  onClick={() => openView(v)}
                >
                  <Star size={14} aria-hidden="true" />
                  <span>
                    <Name text={v.name} />
                  </span>
                </button>
                <button
                  className="inv-x"
                  aria-label={`Delete the view ${v.name}`}
                  onClick={() => {
                    savedViews.remove(v.name)
                    if (activeView === v.name) setActiveView(undefined)
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <p className="inv-small-note">Kept in this browser only.</p>
          </nav>
        </div>
        <section className="inv-main" aria-label={LIST_TITLES[list]}>
          <div className="inv-cmdbar" role="toolbar" aria-label="Commands">
            {showsAdd(list) && (
              <button
                className="btn quiet"
                disabled={!canEdit}
                title={
                  canEdit ? undefined : 'Switch to a plan to add equipment'
                }
                onClick={onOpenAdd}
              >
                <Plus size={16} aria-hidden="true" />
                Add in a plan
              </button>
            )}
            <button className="btn quiet" onClick={() => void onRefresh()}>
              <RefreshCw size={16} aria-hidden="true" />
              Refresh
            </button>
            <button
              className="btn quiet"
              {...{ [OPENER]: 'csv' }}
              onClick={() => setPane('csv')}
            >
              <Download size={16} aria-hidden="true" />
              Export to CSV
            </button>
            <button
              className="btn quiet"
              {...{ [OPENER]: 'columns' }}
              onClick={() => setPane('columns')}
            >
              <Columns3 size={16} aria-hidden="true" />
              Edit columns
            </button>
            <span className="inv-sep" aria-hidden="true" />
            {barCommands(context, one)
              // Two or more rows: Delete N… and Disconnect N… take over.
              .filter(
                (c) =>
                  selectedCount < 2 ||
                  (c.id !== 'delete' && c.id !== 'disconnect'),
              )
              .map((c) => (
                <button
                  key={c.id}
                  className={`btn quiet${c.danger ? ' danger-outline' : ''}`}
                  disabled={c.disabled !== undefined}
                  title={c.disabled}
                  onClick={() => one && run(c.id, one)}
                >
                  <CommandIcon id={c.id} />
                  {c.label}
                </button>
              ))}
            {many.length > 0 && <span className="inv-sep" aria-hidden="true" />}
            {many.map((c) => {
              const Icon = MANY_ICON[c.id]
              return (
                <button
                  key={c.id}
                  className={`btn quiet${c.danger ? ' danger-outline' : ''}`}
                  disabled={c.disabled !== undefined}
                  title={c.disabled}
                  {...{ [OPENER]: `many:${c.id}` }}
                  onClick={() => setPane(c.id)}
                >
                  <Icon size={16} aria-hidden="true" />
                  {c.label}
                </button>
              )
            })}
          </div>
          <div className="inv-filters">
            <label className="inv-search">
              <Search size={14} aria-hidden="true" />
              <span className="sr-only">Filter for any field</span>
              <input
                type="search"
                aria-label="Filter for any field"
                placeholder="Filter for any field..."
                autoComplete="off"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            {PILLS[list].map(([key, label]) => (
              <Pill
                key={`${list}:${key}`}
                rows={rows}
                list={list}
                keyName={key}
                label={label}
                values={q.filters[key] ?? []}
                isOpen={pill === key}
                colors={colors}
                onToggle={() => setPill(pill === key ? null : key)}
                onApply={(values) => applyPill(key, values)}
                onCancel={() => setPill(null)}
              />
            ))}
            {anyFilter && (
              <button className="btn quiet" onClick={reset}>
                Reset filters
              </button>
            )}
          </div>
          {note && (
            <p className="inv-note" role="status">
              <span>{note}</span>
              <button className="btn quiet" onClick={() => setNote(undefined)}>
                Dismiss
              </button>
            </p>
          )}
          <div className="inv-meta">
            <span aria-live="polite">
              {metaText(result)}
              {selectedCount > 0 && <b> {selectedCount} selected.</b>}
            </span>
            <span className="inv-grow" />
            <SaveView
              onSave={(name) => {
                const error = savedViews.save(inventorySession.viewOf(name))
                if (!error) {
                  setActiveView(name.trim())
                  setNote(undefined)
                }
                return error
              }}
            />
            <label htmlFor="inv-group">Group by</label>
            <select
              id="inv-group"
              value={q.group ?? ''}
              onChange={(e) =>
                inventorySession.setGroup(e.target.value || undefined)
              }
            >
              <option value="">No grouping</option>
              {GROUPS[list].map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <InventoryTable
            list={list}
            columns={columns}
            items={items}
            sort={q.sort}
            selected={q.selected}
            allSelected={allSelected}
            groupIsNetwork={q.group === 'net'}
            colors={colors}
            emptyMessage={
              anyFilter ? (
                <>
                  No records match. Change the filters or{' '}
                  <button className="inv-link" onClick={reset}>
                    reset them
                  </button>
                  .
                </>
              ) : (
                'No records.'
              )
            }
            onSort={inventorySession.sortBy}
            onToggleRow={inventorySession.toggleSelected}
            onToggleAll={() =>
              inventorySession.setSelected(pageKeys, !allSelected)
            }
            onToggleGroup={inventorySession.toggleCollapsed}
            onOpen={open}
            menuKey={menu?.row.key}
            onMenu={(row, button) => {
              setMenu(
                menu?.row.key === row.key
                  ? undefined
                  : { row, anchor: button.getBoundingClientRect() },
              )
            }}
            onScrolled={closeMenu}
            onShown={setShown}
          />
          <div className="inv-pager">
            {grouped ? (
              <span>
                Grouped: every record is listed (the table draws only the rows
                on screen).
              </span>
            ) : (
              <>
                <button
                  className="btn"
                  disabled={result.page <= 1}
                  onClick={() => inventorySession.setPage(result.page - 1)}
                >
                  ‹ Previous
                </button>
                <span>
                  Page {result.page} of {result.pages}
                </span>
                <button
                  className="btn"
                  disabled={result.page >= result.pages}
                  onClick={() => inventorySession.setPage(result.page + 1)}
                >
                  Next ›
                </button>
              </>
            )}
          </div>
        </section>
      </div>
      {menu && (
        <RowMenu
          items={menuCommands(context, menu.row)}
          anchor={menu.anchor}
          openerKey={`row-menu:${menu.row.key}`}
          onPick={(id) => run(id, menu.row)}
          onClose={closeMenu}
        />
      )}
      {pane === 'csv' && (
        <CsvPane
          rows={result.all}
          columns={columns}
          fileName={csvFileName(list, planName, new Date())}
          onDownload={download}
          onClose={() => setPane(null)}
        />
      )}
      {pane === 'edit' && (list === 'equipment' || list === 'ports') && (
        <BulkEditPane
          list={list}
          rows={chosen}
          equipment={index.equipment}
          endpoints={snapshot.endpoints}
          installed={!inPlan}
          planName={planName}
          edit={edit}
          onFixed={onFixed}
          onClose={() => setPane(null)}
        />
      )}
      {pane === 'deleteMany' && edit && planName !== undefined && (
        <DeletePane
          snapshot={snapshot}
          index={index}
          rows={chosen}
          planName={planName}
          edit={edit}
          onDone={() =>
            inventorySession.setSelected(
              chosen.map((r) => r.key),
              false,
            )
          }
          onClose={() => setPane(null)}
        />
      )}
      {pane === 'disconnectMany' && edit && planName !== undefined && (
        <DisconnectPane
          snapshot={snapshot}
          index={index}
          rows={chosen}
          planName={planName}
          edit={edit}
          onDone={() =>
            inventorySession.setSelected(
              chosen.map((r) => r.key),
              false,
            )
          }
          onClose={() => setPane(null)}
        />
      )}
      {pane === 'labels' && (
        <LabelsPane
          list={list}
          selected={chosen}
          listed={result.all}
          plan={plan}
          index={index}
          endpoints={snapshot.endpoints}
          onClose={() => setPane(null)}
        />
      )}
      {pane === 'columns' && (
        <ColumnsPane
          list={list}
          hidden={hidden}
          onToggle={(key) => inventorySession.toggleColumn(list, key)}
          onClose={() => setPane(null)}
        />
      )}
    </section>
  )
}

function Pill({
  rows,
  list,
  keyName,
  label,
  values,
  isOpen,
  colors,
  onToggle,
  onApply,
  onCancel,
}: {
  rows: readonly InventoryRow[]
  list: InventoryList
  keyName: string
  label: string
  values: readonly string[]
  isOpen: boolean
  colors: ReadonlyMap<string, string>
  onToggle: () => void
  onApply: (values: string[]) => void
  onCancel: () => void
}) {
  // Needed to word one chosen value, and by the open picker.
  const options = useMemo(
    () =>
      isOpen || values.length === 1 ? valueOptions(rows, list, keyName) : [],
    [rows, list, keyName, isOpen, values.length],
  )
  return (
    <div className="inv-pill-wrap">
      <button
        className={`inv-pill${values.length ? ' on' : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        {...{ [OPENER]: `pill:${keyName}` }}
        onClick={onToggle}
      >
        {label} <b>==</b>{' '}
        <span className="v">
          <Name text={pillText(values, options)} />
        </span>
      </button>
      {isOpen && (
        <ValuePicker
          label={label}
          options={options}
          current={values}
          colors={colors}
          isNetwork={keyName === 'net'}
          openerKey={`pill:${keyName}`}
          onApply={onApply}
          onCancel={onCancel}
        />
      )}
    </div>
  )
}

/** Save view…: a name field in a popover under the button, in the meta line. */
function SaveView({
  onSave,
}: {
  onSave: (name: string) => string | undefined
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="inv-pill-wrap">
      <button
        className="btn quiet"
        aria-expanded={open}
        aria-haspopup="dialog"
        {...{ [OPENER]: 'save-view' }}
        onClick={() => setOpen(!open)}
      >
        <Star size={16} aria-hidden="true" />
        Save view…
      </button>
      {open && (
        <SaveViewForm
          onSave={(name) => {
            const error = onSave(name)
            if (!error) setOpen(false)
            return error
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </div>
  )
}

function SaveViewForm({
  onSave,
  onCancel,
}: {
  onSave: (name: string) => string | undefined
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const dialog = useInlineDialog<HTMLDivElement>(onCancel, 'save-view')
  const submit = () => setError(onSave(name))
  return (
    <div
      className="inv-pop right"
      role="dialog"
      aria-label="Save view"
      {...dialog}
    >
      <b>Save this view</b>
      <span className="inv-pop-label">
        The list, its filters, sort, grouping and columns. Kept in this browser
        only.
      </span>
      <input
        className="inv-save-name"
        type="text"
        aria-label="View name"
        placeholder="Name, e.g. Free ports on floor 2"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) submit()
        }}
      />
      {error && <p className="inv-save-error">{error}</p>}
      <div className="inv-pop-actions">
        <button
          className="btn primary"
          disabled={!name.trim()}
          onClick={submit}
        >
          Save
        </button>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
