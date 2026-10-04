import { X } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import type { Network, Snapshot } from '../../shared/types'
import { mapSession, type MapSession } from './mapSession'

export type MapView = 'conceptual' | 'physical'

export function ViewSwitch({
  view,
  onChange,
}: {
  view: MapView
  onChange: (view: MapView) => void
}) {
  return (
    <div className="view-switch" role="group" aria-label="View">
      {(['conceptual', 'physical'] as const).map((v) => (
        <button
          key={v}
          aria-pressed={view === v}
          className={view === v ? 'active' : ''}
          onClick={() => onChange(v)}
        >
          {v === 'conceptual' ? 'Conceptual' : 'Physical'}
        </button>
      ))}
    </div>
  )
}

/** Presentation filter only; never changes what a trace finds. */
export function NetworkSelect({
  networks,
  value,
  onChange,
}: {
  networks: readonly Network[]
  value: string | undefined
  onChange: (networkId: string | undefined) => void
}) {
  return (
    <label className="network-select">
      <span>Network</span>
      <select
        aria-label="Show network"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">All networks</option>
        {networks.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Shows the active location focus with a way to clear it; renders nothing without one. */
export function FocusChip({
  snapshot,
  session = mapSession,
}: {
  snapshot: Pick<Snapshot, 'sites' | 'nodes'>
  session?: MapSession
}) {
  const focus = useSyncExternalStore(session.subscribe, session.focus)
  const name = focus
    ? (focus.kind === 'node' ? snapshot.nodes : snapshot.sites).find(
        (x) => x.id === focus.id,
      )?.name
    : undefined
  if (!focus || !name) return null
  return (
    <span className="focus-chip" role="status">
      <small>{focus.kind === 'node' ? 'Node' : 'Site'} focus</small>
      <strong>{name}</strong>
      <button
        aria-label="Clear focus"
        onClick={() => session.setFocus(undefined)}
      >
        <X size={14} />
      </button>
    </span>
  )
}
