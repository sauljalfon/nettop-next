import { useState } from 'react'
import {
  defaultFilter,
  filterGroups,
  unitCount,
  type EndpointFilter,
  type InspectorGroup,
  type InspectorUnit,
} from './model'

interface Props {
  equipmentName: string
  groups: InspectorGroup[]
  /** Display name of a network ID. */
  networkName: (id: string) => string
  /** Facet keys pinned on the map. */
  pinned: ReadonlySet<string>
  onFindFromHere: (endpointId: string) => void
  onPin: (key: string) => void
  onShowOnMap: () => void
}

const FILTERS: { mode: EndpointFilter; label: string }[] = [
  { mode: 'cabled', label: 'Cabled' },
  { mode: 'free', label: 'Free' },
  { mode: 'all', label: 'All' },
]

/** Grouped, filterable endpoints with each side's far end, cable and network. */
export default function EndpointList({
  equipmentName,
  groups,
  networkName,
  pinned,
  onFindFromHere,
  onPin,
  onShowOnMap,
}: Props) {
  const total = unitCount(groups)
  const [mode, setMode] = useState<EndpointFilter>(() => defaultFilter(total))
  const [query, setQuery] = useState('')
  const shown = filterGroups(groups, { mode, query })
  const collapsible = groups.some((g) => /^\d/.test(g.id)) // HDF subpanels
  return (
    <div className="inspector-endpoints">
      <div className="endpoint-controls">
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
      <p className="muted endpoint-count">
        {shown.reduce((n, g) => n + g.units.length, 0)} of {total}{' '}
        {groups[0]?.id === 'ports' ? 'ports' : 'positions'}
      </p>
      {shown.map((group) =>
        collapsible ? (
          <details key={group.id} className="endpoint-group" open>
            <summary>
              {group.title} <small>{group.units.length}</small>
            </summary>
            {group.units.map((unit) => (
              <Unit
                key={unit.key}
                unit={unit}
                equipmentName={equipmentName}
                networkName={networkName}
                pinned={pinned.has(unit.key)}
                onFindFromHere={onFindFromHere}
                onPin={onPin}
                onShowOnMap={onShowOnMap}
              />
            ))}
          </details>
        ) : (
          <section key={group.id} className="endpoint-group">
            {group.units.map((unit) => (
              <Unit
                key={unit.key}
                unit={unit}
                equipmentName={equipmentName}
                networkName={networkName}
                pinned={pinned.has(unit.key)}
                onFindFromHere={onFindFromHere}
                onPin={onPin}
                onShowOnMap={onShowOnMap}
              />
            ))}
          </section>
        ),
      )}
      {!shown.length && <p className="muted">Nothing matches.</p>}
    </div>
  )
}

function Unit({
  unit,
  equipmentName,
  networkName,
  pinned,
  onFindFromHere,
  onPin,
  onShowOnMap,
}: {
  unit: InspectorUnit
  equipmentName: string
  networkName: (id: string) => string
  pinned: boolean
  onFindFromHere: (endpointId: string) => void
  onPin: (key: string) => void
  onShowOnMap: () => void
}) {
  const name = `${equipmentName} ${unit.label}`
  return (
    <div
      className={`endpoint-unit ${unit.cabled ? 'cabled' : 'free'}`}
      data-testid="inspector-unit"
      data-unit={unit.key}
    >
      <div className="unit-head">
        <strong>{unit.label}</strong>
        <span className="unit-state">{unit.cabled ? 'Cabled' : 'Free'}</span>
      </div>
      {unit.sides.map((side) => (
        <p className="unit-side" key={side.endpointId} data-side={side.side}>
          {side.side !== 'port' && (
            <span className="side-name">{side.side}</span>
          )}
          {side.cable ? (
            <>
              <span className="far-end">→ {side.cable.farLabel}</span>
              <em className="cable-id">{side.cable.linkId}</em>
              {side.cable.networkId && (
                <small className="badge" data-network={side.cable.networkId}>
                  {networkName(side.cable.networkId)}
                </small>
              )}
            </>
          ) : (
            <span className="free-side">free</span>
          )}
        </p>
      ))}
      <div className="unit-actions">
        <button
          aria-label={`Find AGG / BB from here: ${name}`}
          onClick={() => onFindFromHere(unit.startEndpointId)}
        >
          Find AGG / BB from here
        </button>
        <button
          aria-label={`${pinned ? 'Unpin' : 'Pin'} on map: ${name}`}
          aria-pressed={pinned}
          className={pinned ? 'active' : ''}
          onClick={() => onPin(unit.key)}
        >
          {pinned ? 'Pinned' : 'Pin on map'}
        </button>
        <button aria-label={`Show on map: ${name}`} onClick={onShowOnMap}>
          Show on map
        </button>
      </div>
    </div>
  )
}
