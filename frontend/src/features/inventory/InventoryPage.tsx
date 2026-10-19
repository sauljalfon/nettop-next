import {
  Columns3,
  Download,
  GitBranch,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { useDebounced } from '../../shared/lazy'
import type { Snapshot } from '../../shared/types'
import Chip from '../../shared/ui/Chip'
import Name from '../../shared/ui/Name'
import { networkColors } from '../map/networkColors'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { OPENER } from '../planning/useInlineDialog'
import { GROUPS, PILLS, visibleColumns, type InventoryList } from './columns'
import { csvFileName, toCsv } from './csv'
import InventoryTable from './InventoryTable'
import { TypeIcon } from './icons'
import { inventorySession } from './inventorySession'
import {
  barCommands,
  menuCommands,
  metaText,
  networkChange,
  pillText,
  tableItems,
  type CommandContext,
  type RowCommandId,
} from './model'
import { ColumnsPane, CsvPane, LIST_TITLES } from './Panes'
import { applyQuery, valueOptions } from './query'
import { buildRows, type InventoryRow } from './rows'
import { CommandIcon } from './RowMenu'
import RowMenu from './RowMenu'
import ValuePicker from './ValuePicker'
import './inventory.css'

const LIST_ICON = {
  equipment: 'switch',
  ports: 'port',
  cables: 'cable',
} as const

interface Props {
  snapshot: Snapshot
  index: SnapshotIndex
  installedIDs: ReadonlySet<string>
  installedLinkIDs: ReadonlySet<string>
  /** The open plan's name; absent when Installed is shown. */
  planName?: string
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
}

export default function InventoryPage({
  snapshot,
  index,
  installedIDs,
  installedLinkIDs,
  planName,
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
  const rows = allRows[list]
  const colors = useMemo(() => networkColors(snapshot.networks), [snapshot])
  const columns = visibleColumns(list, hidden)
  const result = useMemo(
    () => applyQuery(rows, list, q),
    [rows, list, q.search, q.filters, q.sort, q.group, q.page], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const items = useMemo(
    () => tableItems(result, q.group, q.collapsed),
    [result, q.group, q.collapsed],
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

  const [pane, setPane] = useState<'csv' | 'columns' | null>(null)
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
    (row: InventoryRow) => onOpenEquipment(row.equipmentId, row.endpointId),
    [onOpenEquipment],
  )
  // Every command calls a function App already has. A cable acts on its A end.
  const run = (id: RowCommandId, row: InventoryRow) => {
    setMenu(undefined)
    const owner = row.equipmentId
    switch (id) {
      case 'open':
        return onOpenEquipment(owner, row.endpointId)
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
        <nav className="inv-menu" aria-label="Inventory lists">
          <h3>Lists</h3>
          {(Object.keys(LIST_TITLES) as InventoryList[]).map((l) => (
            <button
              key={l}
              aria-current={l === list ? 'page' : undefined}
              onClick={() => inventorySession.setList(l)}
            >
              <TypeIcon kind={LIST_ICON[l]} />
              <span>{LIST_TITLES[l]}</span>
              <span className="count">{counts[l].toLocaleString('en')}</span>
            </button>
          ))}
        </nav>
        <section className="inv-main" aria-label={LIST_TITLES[list]}>
          <div className="inv-cmdbar" role="toolbar" aria-label="Commands">
            <button
              className="btn quiet"
              disabled={!canEdit}
              title={canEdit ? undefined : 'Switch to a plan to add equipment'}
              onClick={onOpenAdd}
            >
              <Plus size={16} aria-hidden="true" />
              Add in a plan
            </button>
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
            {barCommands(context, one).map((c) => (
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
          <div className="inv-meta">
            <span aria-live="polite">
              {metaText(result)}
              {selectedCount > 0 && <b> {selectedCount} selected.</b>}
            </span>
            <span className="inv-grow" />
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
