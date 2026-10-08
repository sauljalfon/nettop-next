import { Check, Pencil, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { createNetwork, renameNetwork } from '../../shared/api'
import type { Network, Snapshot } from '../../shared/types'
import { colorOf, networkColors } from '../map/networkColors'
import { activeDeviceCounts, validateNetworkName } from './model'
import '../inspector/inspector.css'
import './networks.css'

/** Message for a failed save: the server's own text for 409/422, else a generic one. */
function failure(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'Could not save. Check the API logs.'
}

/**
 * A compact table of networks in snapshot order with the map's colors and
 * active-device counts, renamed in place, with a quiet last row to add one.
 * `onChanged` refetches the topology and plans; this component never edits a
 * snapshot itself.
 */
export default function NetworksDrawer({
  snapshot,
  onChanged,
}: {
  snapshot: Snapshot
  onChanged: (message: string) => Promise<void>
}) {
  const colors = networkColors(snapshot.networks)
  const counts = activeDeviceCounts(snapshot)
  return (
    <div className="networks-drawer">
      <table className="port-table network-table" aria-label="Networks">
        <tbody>
          {snapshot.networks.map((n) => (
            <NetworkRow
              key={n.id}
              network={n}
              networks={snapshot.networks}
              color={colorOf(colors, n.id)}
              count={counts.get(n.id) ?? 0}
              onChanged={onChanged}
            />
          ))}
          <AddRow
            networks={snapshot.networks}
            nextColor={colorOf(
              networkColors([...snapshot.networks, { id: '' }]),
              '',
            )}
            onChanged={onChanged}
          />
        </tbody>
      </table>
      <p className="network-note">
        Colors follow the order networks were added, so renaming never changes
        one.
      </p>
    </div>
  )
}

/** The text field with ✓ (save) and ✕ (cancel); Enter saves and Esc cancels. */
function InlineField({
  label,
  value,
  busy,
  invalid,
  cancelLabel,
  onChange,
  onSave,
  onCancel,
}: {
  label: string
  value: string
  busy: boolean
  invalid: boolean
  cancelLabel: string
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <>
      <input
        autoFocus
        className="network-input"
        aria-label={label}
        aria-invalid={invalid}
        value={value}
        disabled={busy}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave()
          if (e.key === 'Escape') onCancel()
        }}
      />
      <span className="network-edit-actions">
        <button
          className="row-action"
          aria-label="Save name"
          title="Save name"
          disabled={busy}
          onClick={onSave}
        >
          <Check size={14} />
        </button>
        <button
          className="row-action"
          aria-label={cancelLabel}
          title={cancelLabel}
          disabled={busy}
          onClick={onCancel}
        >
          <X size={14} />
        </button>
      </span>
    </>
  )
}

/** One line under a row, in the error color. */
const ErrorLine = ({ message }: { message: string }) => (
  <tr className="network-error">
    <td colSpan={4}>
      <span className="field-error" role="alert">
        {message}
      </span>
    </td>
  </tr>
)

function NetworkRow({
  network,
  networks,
  color,
  count,
  onChanged,
}: {
  network: Network
  networks: readonly Network[]
  color: string
  count: number
  onChanged: (message: string) => Promise<void>
}) {
  const [draft, setDraft] = useState<string>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const stop = () => {
    setDraft(undefined)
    setError('')
  }
  const save = async () => {
    if (draft === undefined || busy) return
    const problem = validateNetworkName(draft, networks, network.id)
    if (problem) return setError(problem)
    setBusy(true)
    try {
      await renameNetwork(network.id, draft)
      await onChanged(`Renamed ${network.name} to ${draft.trim()}`)
      stop()
    } catch (e) {
      setError(failure(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <tr
        className="network-row"
        data-testid="network-row"
        data-network-id={network.id}
      >
        <td className="col-dot">
          <span
            className="network-swatch"
            data-testid="network-swatch"
            style={{ background: color }}
            aria-hidden
          />
        </td>
        {draft !== undefined ? (
          <td colSpan={3} className="network-editing">
            <InlineField
              label="Network name"
              value={draft}
              busy={busy}
              invalid={!!error}
              cancelLabel="Cancel rename"
              onChange={(v) => {
                setDraft(v)
                setError('')
              }}
              onSave={() => void save()}
              onCancel={stop}
            />
          </td>
        ) : (
          <>
            <td className="col-label network-name">{network.name}</td>
            <td className="network-count">
              {count} {count === 1 ? 'device' : 'devices'}
            </td>
            <td className="col-actions">
              <button
                className="row-action"
                aria-label={`Rename ${network.name}`}
                title={`Rename ${network.name}`}
                onClick={() => setDraft(network.name)}
              >
                <Pencil size={13} />
              </button>
            </td>
          </>
        )}
      </tr>
      {error && <ErrorLine message={error} />}
    </>
  )
}

function AddRow({
  networks,
  nextColor,
  onChanged,
}: {
  networks: readonly Network[]
  /** The color the new network will take: the next one in the palette. */
  nextColor: string
  onChanged: (message: string) => Promise<void>
}) {
  const [name, setName] = useState<string>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const stop = () => {
    setName(undefined)
    setError('')
  }
  const add = async () => {
    if (name === undefined || busy) return
    const problem = validateNetworkName(name, networks)
    if (problem) return setError(problem)
    setBusy(true)
    try {
      const created = await createNetwork(name)
      await onChanged(`Added ${created.name}`)
      stop()
    } catch (e) {
      setError(failure(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <tr className="network-add-row" data-testid="network-add-row">
        {name === undefined ? (
          <td colSpan={4}>
            <button className="network-add" onClick={() => setName('')}>
              <Plus size={13} /> Add network
            </button>
          </td>
        ) : (
          <>
            <td className="col-dot">
              <span
                className="network-swatch"
                data-testid="network-swatch"
                style={{ background: nextColor }}
                aria-hidden
              />
            </td>
            <td colSpan={3} className="network-editing">
              <InlineField
                label="New network name"
                value={name}
                busy={busy}
                invalid={!!error}
                cancelLabel="Cancel add"
                onChange={(v) => {
                  setName(v)
                  setError('')
                }}
                onSave={() => void add()}
                onCancel={stop}
              />
            </td>
          </>
        )}
      </tr>
      {error && <ErrorLine message={error} />}
    </>
  )
}
