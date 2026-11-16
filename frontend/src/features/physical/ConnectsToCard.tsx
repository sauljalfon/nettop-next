import { colorOf } from '../map/networkColors'
import Name from '../../shared/ui/Name'
import PlacePath from '../../shared/ui/PlacePath'
import type { FarEquipment } from './connectsTo'

/**
 * Connects to: one line per equipment at the other end of this equipment's
 * cables. Choosing a line lights its jacks on the face (the page keeps the
 * choice); the line again or Show all clears it.
 */
export default function ConnectsTo({
  far,
  chosen,
  onChoose,
  colors,
  networkNames,
  hint,
  under,
  fixedHeight,
}: {
  far: readonly FarEquipment[]
  /** The chosen far equipment's ID. */
  chosen?: string
  /** Choosing the chosen line again, or Show all, passes undefined. */
  onChoose: (equipmentId?: string) => void
  colors: ReadonlyMap<string, string>
  networkNames: ReadonlyMap<string, string>
  /** Said under the head: where the chosen jacks are when not on this side. */
  hint?: string
  /** Placed under the face (the card is then limited to a shorter height). */
  under?: boolean
  /** Its height is the page's `--links-h` (the face leaves room for it). */
  fixedHeight?: boolean
}) {
  const total = far.reduce((n, f) => n + f.cables, 0)
  const max = far[0]?.cables ?? 1
  return (
    <section
      className={`connects-to${under ? ' under' : ''}${fixedHeight ? ' fixed-height' : ''}`}
      aria-label="Connects to"
      data-testid="connects-to"
    >
      <div className="connects-head" data-testid="connects-head">
        <b>Connects to</b>
        <span>
          {far.length} {far.length === 1 ? 'place' : 'places'} · {total}{' '}
          {total === 1 ? 'cable' : 'cables'}
        </span>
        {chosen && (
          <button type="button" onClick={() => onChoose(undefined)}>
            Show all
          </button>
        )}
      </div>
      {hint && (
        <p className="connects-hint" data-testid="connects-hint">
          {hint}
        </p>
      )}
      <div className="connects-body" data-testid="connects-body">
        {far.length === 0 && <p className="connects-empty">No cables yet.</p>}
        {far.map((f) => {
          const rack = f.place[f.place.length - 1]
          return (
            <button
              key={f.equipmentId}
              type="button"
              className="connects-line"
              data-testid="connects-line"
              data-far={f.equipmentId}
              aria-pressed={chosen === f.equipmentId}
              title={[
                f.name,
                f.place.join(' › '),
                f.networkIds.map((n) => networkNames.get(n) ?? n).join(', '),
                `${f.cables} ${f.cables === 1 ? 'cable' : 'cables'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
              onClick={() =>
                onChoose(chosen === f.equipmentId ? undefined : f.equipmentId)
              }
            >
              <span className="connects-dots" aria-hidden="true">
                {f.networkIds.map((n) => (
                  <i key={n} style={{ background: colorOf(colors, n) }} />
                ))}
              </span>
              <Name text={f.name} className="connects-name" />
              {rack && (
                <span className="connects-rack">
                  <PlacePath parts={[rack]} />
                </span>
              )}
              <span className="connects-count" data-testid="connects-count">
                {f.cables}
              </span>
              <span
                className="connects-meter"
                aria-hidden="true"
                style={{ width: `${Math.round((f.cables / max) * 100)}%` }}
              />
            </button>
          )
        })}
      </div>
    </section>
  )
}
