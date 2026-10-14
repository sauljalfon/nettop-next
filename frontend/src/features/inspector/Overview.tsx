import type { ReactNode } from 'react'
import NetworkBadge from '../map/NetworkBadge'
import { networkCounts, type InspectorGroup } from './model'

interface Props {
  role: string
  /** Placement, e.g. "Rack A03 · U11"; undefined when unplaced. */
  placement?: string
  groups: InspectorGroup[]
  /** Display name and shared color of a network ID. */
  networkName: (id: string) => string
  networkColor: (id: string) => string
  /** The uplinks summary, at the top (switches only). */
  uplinks?: ReactNode
  /** The Details block (fields, Edit details). */
  details?: ReactNode
  /** The plan placement form, when a plan is open. */
  children?: ReactNode
}

/** Placement, the cabled circuits per network, and (in a plan) the placement form. */
export default function Overview({
  role,
  placement,
  groups,
  networkName,
  networkColor,
  details,
  uplinks,
  children,
}: Props) {
  const counts = networkCounts(groups)
  return (
    <div className="inspector-overview">
      {uplinks}
      <dl className="detail-list">
        <div>
          <dt>Role</dt>
          <dd>{role}</dd>
        </div>
        {placement && (
          <div>
            <dt>Placement</dt>
            <dd>{placement}</dd>
          </div>
        )}
      </dl>
      {details}
      <h3 className="inspector-section">Cabled by network</h3>
      {counts.length ? (
        <ul className="network-counts">
          {counts.map((c) => (
            <li key={c.networkId} data-testid="network-count">
              <NetworkBadge
                name={c.networkId ? networkName(c.networkId) : 'Unresolved'}
                color={networkColor(c.networkId)}
              />
              <span>{c.cabled} cabled</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Nothing is cabled yet.</p>
      )}
      {children}
    </div>
  )
}
