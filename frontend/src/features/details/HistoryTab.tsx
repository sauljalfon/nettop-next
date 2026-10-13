import { useQuery } from '@tanstack/react-query'
import { getChangeLog, recordedPlansFor } from '../../shared/api'
import './details.css'
import { fixLine, recordedLine } from './model'

const when = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : ''

/**
 * An equipment's history: its direct fixes (newest first) and the recorded
 * plans that added, moved or removed it. Its ports' fixes are not listed here.
 */
export default function HistoryTab({ equipmentId }: { equipmentId: string }) {
  const history = useQuery({
    queryKey: ['history', equipmentId],
    queryFn: async ({ signal }) => {
      const [fixes, plans] = await Promise.all([
        getChangeLog('equipment', equipmentId, signal),
        recordedPlansFor(equipmentId, signal),
      ])
      return { fixes: fixes.map(fixLine), plans: plans.map(recordedLine) }
    },
  })
  if (history.isPending) return <p className="muted">Loading the history…</p>
  if (history.isError)
    return (
      <p className="muted" role="alert">
        Could not load the history: {history.error.message}
      </p>
    )
  const { fixes, plans } = history.data
  return (
    <div className="inspector-history" data-testid="history">
      <h3 className="inspector-section">Direct fixes</h3>
      {fixes.length ? (
        <ul className="history-list" data-testid="history-fixes">
          {fixes.map((f) => (
            <li key={f.id}>
              <time dateTime={f.at}>{when(f.at)}</time>
              <span>
                <b>{f.field}</b>: <del>{f.from}</del> → <ins>{f.to}</ins>
              </span>
              {f.note && <span className="who">“{f.note}”</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No direct fixes yet.</p>
      )}
      <h3 className="inspector-section">Recorded plans</h3>
      {plans.length ? (
        <ul className="history-list" data-testid="history-plans">
          {plans.map((p) => (
            <li key={p.id}>
              <time dateTime={p.at}>{when(p.at)}</time>
              <span>
                <b>{p.name}</b>
                <span className="tag-recorded">RECORDED</span>
              </span>
              <span className="who">
                {p.by} · “{p.note}”
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No recorded plan has changed it.</p>
      )}
    </div>
  )
}
