import { Download } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Endpoint, Plan } from '../../shared/types'
import Name from '../../shared/ui/Name'
import Pieces from '../../shared/ui/Pieces'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { plural } from '../physical/text'
import { fileDay } from './csv'
import { exportLabelSheets } from './exportLabels'
import {
  LABELS_PER_PAGE,
  buildLabels,
  labelIds,
  labelTextLines,
  labelsFileName,
  labelsHeader,
  newCableIds,
  pages,
  type CableLabel,
  type LabelSource,
} from './labels'
import { Pane } from './Panes'
import type { EndpointPieces, InventoryRow } from './rows'

const SOURCE_TEXT: Record<LabelSource, string> = {
  selected: 'Selected',
  listed: 'Listed',
  new: 'New in this plan',
}

/** Both ends of a label, equipment and port apart: the pieces of "EDGE-18 Port 1". */
const End = ({ end }: { end: EndpointPieces }) => (
  <>
    <Name text={end.equipmentName} /> <Name text={end.label} />
  </>
)

function Card({ label }: { label: CableLabel }) {
  return (
    <div className="inv-label">
      <b>{label.cableId}</b>
      <div>
        {label.label === 'No label' ? (
          <span className="inv-dim">No label</span>
        ) : (
          <Name text={label.label} />
        )}
      </div>
      <div>
        A <End end={label.a} />
      </div>
      <div>
        B <End end={label.b} />
      </div>
    </div>
  )
}

/**
 * Print labels…: one label per cable (the ID, its label, both ends), 16 to an
 * A4 page, from the selected rows, the listed rows, or the cables a plan adds.
 * The preview is the first page; Download PDF draws every page as a sheet.
 */
export default function LabelsPane({
  list,
  selected,
  listed,
  plan,
  index,
  endpoints,
  onClose,
}: {
  list: string
  selected: readonly InventoryRow[]
  listed: readonly InventoryRow[]
  /** The open plan; its cables are the New source. */
  plan?: Plan
  index: SnapshotIndex
  endpoints: readonly Endpoint[]
  onClose: () => void
}) {
  const byId = useMemo(
    () => new Map(endpoints.map((p) => [p.id, p])),
    [endpoints],
  )
  const sources = useMemo(() => {
    const from = {
      selected,
      listed,
      planCableIds: plan ? newCableIds(plan) : [],
    }
    const make = (source: LabelSource) =>
      buildLabels(labelIds(source, from), index, (id) => byId.get(id))
    return [
      ...(selected.length > 0
        ? [{ source: 'selected' as const, labels: make('selected') }]
        : []),
      { source: 'listed' as const, labels: make('listed') },
      ...(plan ? [{ source: 'new' as const, labels: make('new') }] : []),
    ]
  }, [selected, listed, plan, index, byId])
  const [chosen, setChosen] = useState<LabelSource>(
    selected.length > 0
      ? 'selected'
      : plan && list === 'work'
        ? 'new'
        : 'listed',
  )
  const current = sources.find((s) => s.source === chosen) ?? sources[0]
  const sheets = useMemo(() => pages(current.labels), [current])
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState('')
  const nodes = useRef<(HTMLElement | null)[]>([])
  const planName = plan?.name

  // The sheets are drawn offscreen only while the PDF is made.
  useEffect(() => {
    if (!printing) return
    const now = new Date()
    void exportLabelSheets({
      nodes: nodes.current.filter((n): n is HTMLElement => n !== null),
      header: labelsHeader(
        current.labels.length,
        sheets.length,
        planName,
        fileDay(now),
      ),
      lines: sheets.map(labelTextLines),
      fileName: labelsFileName(planName, now),
    })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : 'The PDF could not be made.'),
      )
      .finally(() => setPrinting(false))
  }, [printing]) // eslint-disable-line react-hooks/exhaustive-deps

  const count = current.labels.length
  return (
    <Pane
      title="Print cable labels"
      openerKey="many:labels"
      onClose={onClose}
      mark={{ pane: 'labels', labels: count, pages: sheets.length }}
      footer={
        <>
          <button
            className="btn primary"
            disabled={count === 0 || printing}
            onClick={() => {
              setError('')
              setPrinting(true)
            }}
          >
            <Download size={16} aria-hidden="true" />
            Download PDF
          </button>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="seg small" role="group" aria-label="Which cables">
        {sources.map((s) => (
          <button
            key={s.source}
            aria-pressed={s.source === current.source}
            className={s.source === current.source ? 'active' : undefined}
            onClick={() => setChosen(s.source)}
          >
            {SOURCE_TEXT[s.source]} ({s.labels.length})
          </button>
        ))}
      </div>
      {count === 0 ? (
        <p className="inv-dim">
          No cables here: a label is made for each cable of a row.
        </p>
      ) : (
        <>
          <p>
            One label per cable, for both ends: the cable ID, its label and
            where each end goes. A4, 2 × {LABELS_PER_PAGE / 2} labels a page:{' '}
            <b>{plural(sheets.length, 'page')}</b>.
          </p>
          <div className="inv-labels">
            {sheets[0].map((l) => (
              <Card key={l.cableId} label={l} />
            ))}
          </div>
          {sheets.length > 1 && (
            <p className="inv-dim">The preview is page 1 of {sheets.length}.</p>
          )}
        </>
      )}
      {error && (
        <p className="inv-save-error" role="alert">
          {error}
        </p>
      )}
      {printing && (
        <div className="inv-sheets" aria-hidden="true">
          {sheets.map((page, i) => (
            <div
              className="inv-sheet"
              key={i}
              ref={(el) => {
                nodes.current[i] = el
              }}
            >
              <div className="inv-sheet-h">
                Cable labels ·{' '}
                {planName === undefined ? (
                  'Installed'
                ) : (
                  <>
                    Plan: <Name text={planName} />
                  </>
                )}{' '}
                · page {i + 1} of {sheets.length}
              </div>
              <div className="inv-sheet-grid">
                {page.map((l) => (
                  <Card key={l.cableId} label={l} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Pane>
  )
}
