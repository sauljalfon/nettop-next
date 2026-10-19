import {
  ChevronDown,
  Cable,
  ChevronRight,
  GitFork,
  Server,
  Unlink,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import NetworkBadge from '../map/NetworkBadge'
import {
  defaultFilter,
  filterGroups,
  shortFarLabel,
  toggleCollapsed,
  unitCount,
  type EndpointFilter,
  type InspectorGroup,
  type InspectorUnit,
} from './model'
import Pieces from '../../shared/ui/Pieces'
import Name from '../../shared/ui/Name'

interface Props {
  equipmentName: string
  groups: InspectorGroup[]
  /** Display name and shared color of a network ID. */
  networkName: (id: string) => string
  networkColor: (id: string) => string
  onFindFromHere: (endpointId: string) => void
  onShowInPhysical: (endpointId: string) => void
  /**
   * In a current plan: the inline confirm for removing one cable. When given,
   * every cabled side gets a Disconnect action.
   */
  renderDisconnect?: (
    linkId: string,
    onClose: () => void,
    openerKey: string,
  ) => ReactNode
  /**
   * In a current plan: opens the patching screen from a free side (the opener's
   * key is where focus returns). When given, every free side gets a Connect… action.
   */
  onConnect?: (endpointId: string, openerKey: string) => void
  /** A search from Explore: fills the search with a label (and shows every endpoint) each time `serial` changes. */
  request?: { query: string; serial: number }
}

const FILTERS: { mode: EndpointFilter; label: string }[] = [
  { mode: 'cabled', label: 'Cabled' },
  { mode: 'free', label: 'Free' },
  { mode: 'all', label: 'All' },
]

const COLUMNS = 5

/**
 * The ports or positions of one equipment as a compact table: label, far end,
 * cable and network per row (a position shows front and rear as two lines in
 * its row), with the Cabled / Free / All filter and the search above it.
 */
export default function PortTable({
  equipmentName,
  groups,
  networkName,
  networkColor,
  onFindFromHere,
  onShowInPhysical,
  renderDisconnect,
  onConnect,
  request,
}: Props) {
  const total = unitCount(groups)
  const [mode, setMode] = useState<EndpointFilter>(() =>
    request ? 'all' : defaultFilter(total),
  )
  const [query, setQuery] = useState(request?.query ?? '')
  useEffect(() => {
    if (!request) return
    setQuery(request.query)
    setMode('all')
    // Only a new request changes the search.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.serial])
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [selected, setSelected] = useState<string>()
  const [disconnecting, setDisconnecting] = useState<string>()
  const shown = filterGroups(groups, { mode, query })
  const ports = groups[0]?.id === 'ports'
  return (
    <div className="port-list">
      <div className="port-controls">
        <div className="segmented" role="group" aria-label="Show endpoints">
          {FILTERS.map((f) => (
            <button
              key={f.mode}
              aria-pressed={mode === f.mode}
              className={mode === f.mode ? 'active' : ''}
              onClick={() => setMode(f.mode)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          aria-label="Search endpoints"
          placeholder="Search, e.g. 3C/5"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <p className="port-count">
        {shown.reduce((n, g) => n + g.units.length, 0)} of {total}{' '}
        {ports ? 'ports' : 'positions'}
      </p>
      {shown.length > 0 ? (
        <table className="port-table">
          <thead>
            <tr>
              <th scope="col">{ports ? 'Port' : 'Position'}</th>
              <th scope="col">Far end</th>
              <th scope="col">Cable</th>
              <th scope="col">Network</th>
              <th scope="col" aria-label="" />
            </tr>
          </thead>
          <tbody>
            {shown.map((group) => {
              const open = !group.collapsible || !collapsed.has(group.id)
              return (
                <GroupRows
                  key={group.id}
                  group={group}
                  grouped={group.collapsible}
                  open={open}
                  onToggle={() =>
                    setCollapsed((c) => toggleCollapsed(c, group.id))
                  }
                >
                  {group.units.map((unit) => (
                    <Row
                      key={unit.key}
                      unit={unit}
                      equipmentName={equipmentName}
                      networkName={networkName}
                      networkColor={networkColor}
                      selected={selected === unit.key}
                      onSelect={() => setSelected(unit.key)}
                      onFindFromHere={onFindFromHere}
                      onShowInPhysical={onShowInPhysical}
                      canDisconnect={!!renderDisconnect}
                      disconnecting={disconnecting}
                      onDisconnect={setDisconnecting}
                      renderDisconnect={renderDisconnect}
                      onConnect={onConnect}
                    />
                  ))}
                </GroupRows>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="muted">Nothing matches.</p>
      )}
    </div>
  )
}

function GroupRows({
  group,
  grouped,
  open,
  onToggle,
  children,
}: {
  group: InspectorGroup
  grouped: boolean
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <>
      {grouped && (
        <tr className="port-group" data-group={group.id}>
          <td colSpan={COLUMNS}>
            <button aria-expanded={open} onClick={onToggle}>
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {group.title} <small>{group.units.length}</small>
            </button>
          </td>
        </tr>
      )}
      {open && children}
    </>
  )
}

function Row({
  unit,
  equipmentName,
  networkName,
  networkColor,
  selected,
  onSelect,
  onFindFromHere,
  onShowInPhysical,
  canDisconnect,
  disconnecting,
  onDisconnect,
  renderDisconnect,
  onConnect,
}: {
  onConnect?: Props['onConnect']
  canDisconnect: boolean
  /** The cable whose confirm is open, if any. */
  disconnecting?: string
  onDisconnect: (linkId?: string) => void
  renderDisconnect?: Props['renderDisconnect']
  unit: InspectorUnit
  equipmentName: string
  networkName: (id: string) => string
  networkColor: (id: string) => string
  selected: boolean
  onSelect: () => void
  onFindFromHere: (endpointId: string) => void
  onShowInPhysical: (endpointId: string) => void
}) {
  const name = `${equipmentName} ${unit.label}`
  const open = unit.sides.find(
    (side) => side.cable && side.cable.linkId === disconnecting,
  )
  return (
    <>
      <tr
        className={`port-row ${unit.cabled ? 'cabled' : 'free'} ${selected ? 'selected' : ''}`}
        data-testid="inspector-unit"
        data-unit={unit.key}
        data-selected={selected}
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && event.key === 'Enter')
            onSelect()
        }}
      >
        <th scope="row" className="col-label">
          <Name text={unit.label} />
        </th>
        <td className="col-far">
          {unit.sides.map((side) => (
            <div
              key={side.endpointId}
              data-side={side.side}
              title={
                side.cable ? `${side.side} → ${side.cable.farLabel}` : undefined
              }
            >
              {side.side !== 'port' && (
                <abbr className="side-name" title={side.side}>
                  {side.side === 'front' ? 'F' : 'R'}
                </abbr>
              )}
              {side.cable ? (
                <>
                  →{' '}
                  <Pieces
                    pieces={
                      side.side === 'port'
                        ? side.cable.farPieces
                        : side.cable.farShortPieces
                    }
                  />
                </>
              ) : (
                <span className="free-side">free</span>
              )}
            </div>
          ))}
        </td>
        <td className="col-cable">
          {unit.sides.map((side) => (
            <div key={side.endpointId} data-side={side.side}>
              {side.cable?.linkId}
            </div>
          ))}
        </td>
        <td className="col-network">
          {unit.sides.map((side) => (
            <div key={side.endpointId} data-side={side.side}>
              {side.cable?.networkId && (
                <NetworkBadge
                  name={networkName(side.cable.networkId)}
                  color={networkColor(side.cable.networkId)}
                />
              )}
            </div>
          ))}
        </td>
        <td className="col-actions">
          <button
            className="row-action"
            title="Find AGG / BB from here"
            aria-label={`Find AGG / BB from here: ${name}`}
            onClick={(event) => {
              event.stopPropagation()
              onFindFromHere(unit.startEndpointId)
            }}
          >
            <GitFork size={14} />
          </button>
          <button
            className="row-action"
            title="Show in Physical"
            aria-label={`Show in Physical: ${name}`}
            onClick={(event) => {
              event.stopPropagation()
              onShowInPhysical(unit.physicalEndpointId)
            }}
          >
            <Server size={14} />
          </button>
          {onConnect &&
            unit.sides.map(
              (side) =>
                !side.cable && (
                  <button
                    key={side.endpointId}
                    className="row-action"
                    title="Connect…"
                    aria-label={`Connect: ${name}${side.side === 'port' ? '' : ` ${side.side}`}`}
                    data-opener={`port:connect:${side.endpointId}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onConnect(
                        side.endpointId,
                        `port:connect:${side.endpointId}`,
                      )
                    }}
                  >
                    <Cable size={14} />
                  </button>
                ),
            )}
          {canDisconnect &&
            unit.sides.map(
              (side) =>
                side.cable && (
                  <button
                    key={side.endpointId}
                    className="row-action danger"
                    title={`Disconnect ${side.cable.linkId}`}
                    aria-label={`Disconnect ${side.cable.linkId}: ${name}${side.side === 'port' ? '' : ` ${side.side}`}`}
                    data-opener={`port:disconnect:${side.cable.linkId}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onDisconnect(side.cable!.linkId)
                    }}
                  >
                    <Unlink size={14} />
                  </button>
                ),
            )}
        </td>
      </tr>
      {open?.cable && renderDisconnect && (
        <tr className="port-confirm-row">
          <td colSpan={COLUMNS}>
            {renderDisconnect(
              open.cable.linkId,
              () => onDisconnect(undefined),
              `port:disconnect:${open.cable.linkId}`,
            )}
          </td>
        </tr>
      )}
    </>
  )
}
