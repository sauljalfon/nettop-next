import type { Snapshot } from '../../shared/types'
import { colorOf, networkColors } from '../map/networkColors'
import type { Inventory, RouteMarks } from './inventory'
import { mixOf, sortedByName } from './explorerModel'
import { plural } from './text'

/** The Sites level: one card per site, in a grid. No positions, no lines between sites. */
export default function SitesGrid({
  snapshot,
  inv,
  marks,
  networkId,
  onOpen,
}: {
  snapshot: Snapshot
  inv: Inventory
  marks: RouteMarks
  networkId?: string
  onOpen: (siteId: string) => void
}) {
  const colors = networkColors(snapshot.networks)
  return (
    <div className="site-grid">
      {sortedByName(snapshot.sites).map((site) => {
        const c = inv.sites.get(site.id)!
        const onRoute = marks.equipmentBySite.get(site.id) ?? 0
        return (
          <button
            key={site.id}
            type="button"
            className={`site-card ${onRoute ? 'on-route' : ''}`}
            data-testid="site-card"
            data-site-id={site.id}
            data-on-route={onRoute > 0}
            aria-label={`Open ${site.name}`}
            onClick={() => onOpen(site.id)}
          >
            <span className="phys-label">SITE</span>
            <strong className="site-name">{site.name}</strong>
            <span className="phys-counts">
              {plural(c.nodes, 'node')} · {plural(c.racks, 'rack')} ·{' '}
              {c.equipment} equipment
            </span>
            <span className="phys-badges">
              {mixOf(c.active, snapshot.networks).map((m) => (
                <NetworkChip
                  key={m.networkId}
                  text={`${m.name} · ${m.count} active`}
                  color={colorOf(colors, m.networkId)}
                  muted={!!networkId && networkId !== m.networkId}
                />
              ))}
            </span>
            {onRoute > 0 && (
              <span className="route-pill">on route · {onRoute} equipment</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** An outlined network badge in the map's color; quieter when another network is selected. */
export function NetworkChip({
  text,
  color,
  muted,
}: {
  text: string
  color: string
  muted?: boolean
}) {
  return (
    <span
      className={`phys-badge ${muted ? 'muted' : ''}`}
      style={{ color, borderColor: color }}
    >
      {text}
    </span>
  )
}
