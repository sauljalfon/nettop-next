import type { ReactNode } from 'react'
import { networkCounts, type InspectorGroup } from './model'

interface Props {
  role: string
  /** Placement, e.g. "Rack A03 · U11"; undefined when unplaced. */
  placement?: string
  groups: InspectorGroup[]
  /** Display name of a network ID. */
  networkName: (id: string) => string
  /** The plan placement form, when a plan is open. */
  children?: ReactNode
}

/** Placement, the cabled circuits per network, and (in a plan) the placement form. */
export default function Overview({
  role,
  placement,
  groups,
  networkName,
  children,
}: Props) {
  const counts = networkCounts(groups)
  return (
    <div className="inspector-overview">
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
      <h3 className="inspector-section">Cabled by network</h3>
      {counts.length ? (
        <ul className="network-counts">
          {counts.map((c) => (
            <li key={c.networkId} data-testid="network-count">
              <span className="badge">
                {c.networkId ? networkName(c.networkId) : 'Unresolved'}
              </span>
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
