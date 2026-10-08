import { createPortal } from 'react-dom'
import { useEffect, useRef } from 'react'
import type { Snapshot } from '../../shared/types'
import type { SnapshotIndex } from '../map/snapshotIndex'
import { exportSheet } from './exportSheet'
import { rackElevation } from './elevation'
import EquipmentFaceStatic from './EquipmentFaceStatic'
import type { Inventory } from './inventory'
import RackElevation from './RackElevation'
import {
  equipmentSheetRows,
  rackSheetRows,
  sheetFileName,
  sheetHeader,
} from './sheets'

/**
 * Renders one sheet offscreen (the header band, the drawing and the table),
 * captures it into a one-page PDF, and calls `onDone`. It never changes the
 * location, the selection or any data.
 */
export default function PrintSheet({
  kind,
  snapshot,
  index,
  inv,
  rackId,
  equipmentId,
  colors,
  installedIds,
  planName,
  onDone,
  onError,
}: {
  kind: 'rack' | 'equipment'
  snapshot: Snapshot
  index: SnapshotIndex
  inv: Inventory
  rackId: string
  equipmentId?: string
  colors: ReadonlyMap<string, string>
  installedIds: ReadonlySet<string>
  /** The plan's name when printing in a plan. */
  planName?: string
  onDone: () => void
  onError: (message: string) => void
}) {
  const node = useRef<HTMLDivElement>(null)
  const rack = snapshot.racks.find((r) => r.id === rackId)
  const equipment = equipmentId ? index.equipment.get(equipmentId) : undefined
  const title = kind === 'rack' ? (rack?.name ?? '') : (equipment?.name ?? '')
  const location =
    kind === 'rack'
      ? [
          index.sites.get(index.nodes.get(rack?.nodeId ?? '')?.siteId ?? '')
            ?.name,
          index.nodes.get(rack?.nodeId ?? '')?.name,
        ]
          .filter(Boolean)
          .join(' / ')
      : (index.locations.get(equipmentId ?? '') ?? '')
  const header = sheetHeader({
    title,
    location,
    plan: planName,
    date: new Date().toLocaleDateString('en-CA'),
  })
  const columns =
    kind === 'rack'
      ? ['Unit', 'Name', 'Kind', 'Role', 'Network']
      : ['Position', 'Side', 'Cable', 'Far end', 'Far location']
  const rows =
    kind === 'rack'
      ? rackSheetRows(inv, rackId, snapshot.networks).map((r) => [
          r.unit,
          r.name,
          r.kind,
          r.role,
          r.network,
        ])
      : equipmentSheetRows(index, equipmentId ?? '').map((r) => [
          r.label,
          r.side,
          r.cableId,
          r.farEnd,
          r.farLocation,
        ])

  useEffect(() => {
    let cancelled = false
    // Two frames: the sheet is laid out before it is captured.
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (cancelled || !node.current) return
        exportSheet({
          node: node.current,
          header,
          columns,
          rows,
          fileName: sheetFileName(kind, title),
        })
          .catch((e) =>
            onError(
              e instanceof Error
                ? e.message
                : 'The sheet could not be created.',
            ),
          )
          .finally(() => !cancelled && onDone())
      }),
    )
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
    // One capture per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div className="print-offscreen" aria-hidden>
      <div className="print-sheet" ref={node}>
        <header className="sheet-band">
          <h1>{header.title}</h1>
          {header.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </header>
        <div className="sheet-body">
          {kind === 'rack' && rack && (
            <RackElevation
              snapshot={snapshot}
              rackId={rackId}
              rows={rackElevation(inv, rackId, { installedIds })}
              colors={colors}
              canEdit={false}
              onSelect={() => undefined}
              fixedUnitPx={22}
              printing
            />
          )}
          {kind === 'equipment' && equipment && (
            <EquipmentFaceStatic
              snapshot={snapshot}
              index={index}
              equipment={equipment}
              colors={colors}
            />
          )}
        </div>
        <table className="sheet-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>,
    document.body,
  )
}
