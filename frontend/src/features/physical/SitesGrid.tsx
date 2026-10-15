import type { Snapshot } from '../../shared/types'
import AddContainer from '../planning/AddContainer'
import ContainerFoot from '../planning/ContainerFoot'
import { installedHint } from '../planning/containers'
import type { PlanEdit } from '../planning/editing'
import '../planning/editing.css'
import { colorOf, networkColors } from '../map/networkColors'
import type { Inventory, RouteMarks } from './inventory'
import { mixOf, sortedByName } from './explorerModel'
import { plural } from './text'
import Name from '../../shared/ui/Name'
import Chip from '../../shared/ui/Chip'

/** The Sites level: one card per site, in a grid. No positions, no lines between sites. */
export default function SitesGrid({
  snapshot,
  inv,
  marks,
  networkId,
  edit,
  proposedIds,
  childCounts,
  onOpen,
}: {
  snapshot: Snapshot
  inv: Inventory
  marks: RouteMarks
  networkId?: string
  /** Set in a current plan: Add site, and Delete on empty sites. */
  edit?: PlanEdit
  /** Sites (and the rest) that are only in this plan. */
  proposedIds: ReadonlySet<string>
  childCounts: ReadonlyMap<string, number>
  onOpen: (siteId: string) => void
}) {
  const colors = networkColors(snapshot.networks)
  return (
    <div className="site-grid">
      {sortedByName(snapshot.sites).map((site) => {
        const c = inv.sites.get(site.id)!
        const onRoute = marks.equipmentBySite.get(site.id) ?? 0
        const proposed = proposedIds.has(site.id)
        return (
          <div key={site.id} className="site-item">
            <button
              type="button"
              className={`site-card ${onRoute ? 'on-route' : ''} ${proposed ? 'proposed-container' : ''}`}
              data-testid="site-card"
              data-site-id={site.id}
              data-on-route={onRoute > 0}
              data-proposed={proposed}
              aria-label={`Open ${site.name}`}
              onClick={() => onOpen(site.id)}
            >
              <span className="phys-label">
                Site{' '}
                {proposed && (
                  <Chip kind="proposed" className="proposed-tag">
                    Proposed
                  </Chip>
                )}
              </span>
              <strong className="site-name">
                <Name text={site.name} />
              </strong>
              <span className="phys-counts">
                {plural(c.nodes, 'node')} · {plural(c.racks, 'rack')} ·{' '}
                {c.equipment} equipment
              </span>
              <span className="phys-badges">
                {mixOf(c.active, snapshot.networks).map((m) => (
                  <NetworkChip
                    key={m.networkId}
                    name={m.name}
                    suffix={` · ${m.count} active`}
                    color={colorOf(colors, m.networkId)}
                    muted={!!networkId && networkId !== m.networkId}
                  />
                ))}
              </span>
              {onRoute > 0 && (
                <Chip kind="route" className="route-pill">
                  on route · {onRoute} equipment
                </Chip>
              )}
            </button>
            {edit && (
              <ContainerFoot
                kind="site"
                id={site.id}
                name={site.name}
                empty={(childCounts.get(site.id) ?? 0) === 0}
                proposed={proposed}
                edit={edit}
              />
            )}
          </div>
        )
      })}
      {edit && <AddContainer kind="site" edit={edit} />}
      {snapshot.context === 'installed' && (
        <p className="installed-hint" data-testid="installed-hint">
          {installedHint('add a site, node or rack')}
        </p>
      )}
    </div>
  )
}

/** A network chip with its dot in the map's color; quieter when another network is selected. */
export function NetworkChip({
  name,
  suffix,
  color,
  muted,
}: {
  name: string
  suffix?: string
  color: string
  muted?: boolean
}) {
  return (
    <Chip kind="network" color={color} className={muted ? 'muted' : ''}>
      <Name text={name} />
      {suffix}
    </Chip>
  )
}
