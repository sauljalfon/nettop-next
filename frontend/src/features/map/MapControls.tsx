import { useState } from 'react'
import type { Network } from '../../shared/types'
import { MANAGE_NETWORKS } from '../networks/model'

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
  onManage,
}: {
  networks: readonly Network[]
  value: string | undefined
  onChange: (networkId: string | undefined) => void
  /** The last entry opens the networks drawer; the choice above is left as it is. */
  onManage?: () => void
}) {
  return (
    <label className="network-select">
      <span>Network</span>
      <select
        aria-label="Show network"
        value={value ?? ''}
        onChange={(e) => {
          if (e.target.value === MANAGE_NETWORKS) onManage?.()
          else onChange(e.target.value || undefined)
        }}
      >
        <option value="">All networks</option>
        {networks.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
        {onManage && <option value={MANAGE_NETWORKS}>Manage networks…</option>}
      </select>
    </label>
  )
}

/** Reset layout with an inline confirm; it only drops card positions and refits. */
export function ResetLayout({ onReset }: { onReset: () => void }) {
  const [confirming, setConfirming] = useState(false)
  if (!confirming)
    return (
      <button
        className="map-tool"
        aria-label="Reset layout"
        onClick={() => setConfirming(true)}
      >
        Reset layout
      </button>
    )
  return (
    <span className="map-tool confirm" role="group" aria-label="Confirm reset">
      <span>Reset layout?</span>
      <button
        aria-label="Reset"
        onClick={() => {
          setConfirming(false)
          onReset()
        }}
      >
        Reset
      </button>
      <button aria-label="Cancel reset" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </span>
  )
}

/** Shown only while a location is highlighted; clears it, never the trace. */
export function ClearHighlight({ onClear }: { onClear: () => void }) {
  return (
    <button className="map-tool" aria-label="Clear highlight" onClick={onClear}>
      Clear highlight
    </button>
  )
}
