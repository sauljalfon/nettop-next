import { Search } from 'lucide-react'
import type { ReactNode } from 'react'
import AddContainer from '../planning/AddContainer'
import ContainerFoot from '../planning/ContainerFoot'
import { installedHint } from '../planning/containers'
import type { PlanEdit } from '../planning/editing'
import '../planning/editing.css'
import { colorOf } from '../map/networkColors'
import { DRAG_TYPE, dropInto, type DropHandlers } from './drops'
import { previewUnitPx } from './cabinet'
import type { RackPreview } from './explorerModel'
import { plural } from './text'

/** The Node level: only the node's own racks, each a scaled elevation. */
export default function NodeLevel({
  canEdit,
  onMoveEquipment,
  onCreateEquipment,
  nodeName,
  total,
  previews,
  colors,
  search,
  onSearch,
  onOpen,
  onOpenEquipment,
  nodeId,
  edit,
  proposedIds,
  childCounts,
  installed,
  renderCopyLayout,
}: DropHandlers & {
  nodeId: string
  /** Set in a current plan: Add rack, and Delete on empty racks. */
  edit?: PlanEdit
  /** Racks that are only in this plan. */
  proposedIds: ReadonlySet<string>
  childCounts: ReadonlyMap<string, number>
  /** In a plan: "Copy rack layout…" for an empty rack, shown next to its Delete. */
  renderCopyLayout?: (rackId: string) => ReactNode
  /** Installed context: shows the read-only hint. */
  installed: boolean
  /** In a plan, a preview accepts the drops a free unit accepts, so equipment moves between racks of this node. */
  canEdit: boolean
  nodeName: string
  /** Racks the node has, before the search. */
  total: number
  previews: RackPreview[]
  colors: ReadonlyMap<string, string>
  search: string
  onSearch: (text: string) => void
  onOpen: (rackId: string) => void
  /** A click on an equipment block opens its page rather than the rack. */
  onOpenEquipment: (equipmentId: string) => void
}) {
  return (
    <div className="node-level">
      <header className="node-level-head">
        <h2>{nodeName}</h2>
        <span className="phys-counts">{plural(total, 'rack')}</span>
        {total > 12 && (
          <label className="rack-search">
            <Search size={13} />
            <input
              aria-label="Search racks"
              placeholder="Search racks and equipment…"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
            />
          </label>
        )}
      </header>
      <div className="rack-grid">
        {previews.map((rack) => (
          <article
            key={rack.rackId}
            className={`rack-preview ${rack.onRoute ? 'on-route' : ''} ${proposedIds.has(rack.rackId) ? 'proposed-container' : ''}`}
            data-testid="rack-preview"
            data-rack-id={rack.rackId}
            data-proposed-rack={proposedIds.has(rack.rackId)}
            data-on-route={rack.onRoute}
            data-drop-target={canEdit}
            onDragOver={(event) => {
              if (!canEdit) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }}
            onDrop={(event) => {
              if (!canEdit) return
              if (
                dropInto(
                  event.dataTransfer.getData(DRAG_TYPE),
                  rack.rackId,
                  undefined,
                  { onMoveEquipment, onCreateEquipment },
                )
              )
                event.preventDefault()
            }}
          >
            <header>
              <strong>{rack.name}</strong>
              {proposedIds.has(rack.rackId) && (
                <em className="proposed-tag">PROPOSED</em>
              )}
              {rack.onRoute && <span className="route-pill">on route</span>}
              <small>
                {rack.equipmentCount} equipment · {rack.usedUnits} of{' '}
                {rack.units}U used
                {rack.proposedCount > 0 && ` · ${rack.proposedCount} proposed`}
              </small>
            </header>
            {/* A div, not a button: its equipment blocks can be dragged in a plan. */}
            <div
              role="button"
              tabIndex={0}
              className="mini-rack"
              aria-label={`Open ${rack.name}`}
              style={{ height: rack.units * previewUnitPx(rack.units) + 8 }}
              onClick={() => onOpen(rack.rackId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpen(rack.rackId)
                }
              }}
            >
              {rack.blocks.map((b) => (
                <span
                  key={b.equipmentId}
                  className={`mini-block ${b.onRoute ? 'on-route' : ''} ${b.muted ? 'muted' : ''} ${b.proposed ? 'proposed' : ''}`}
                  data-equipment-id={b.equipmentId}
                  data-kind={b.kind}
                  data-height={b.height}
                  data-muted={b.muted}
                  data-on-route={b.onRoute}
                  data-proposed={b.proposed}
                  draggable={canEdit}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(
                      DRAG_TYPE,
                      `equipment:${b.equipmentId}`,
                    )
                    event.dataTransfer.effectAllowed = 'copyMove'
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenEquipment(b.equipmentId)
                  }}
                  title={`${b.name} · ${b.height}U · U${b.unit}${b.proposed ? ' · PROPOSED' : ''}`}
                  style={{
                    bottom: 4 + (b.unit - 1) * previewUnitPx(rack.units),
                    height: b.height * previewUnitPx(rack.units) - 1,
                    // Too small to read: the tooltip has the name.
                    fontSize: previewUnitPx(rack.units) < 9 ? 0 : undefined,
                    borderLeftColor: b.networkId
                      ? colorOf(colors, b.networkId)
                      : '#7d8aa0',
                  }}
                >
                  {b.name}
                </span>
              ))}
            </div>
            {edit && (
              <ContainerFoot
                kind="rack"
                id={rack.rackId}
                name={rack.name}
                empty={(childCounts.get(rack.rackId) ?? 0) === 0}
                proposed={proposedIds.has(rack.rackId)}
                edit={edit}
              >
                {renderCopyLayout?.(rack.rackId)}
              </ContainerFoot>
            )}
          </article>
        ))}
        {edit && <AddContainer kind="rack" parentId={nodeId} edit={edit} />}
        {previews.length === 0 && <p className="muted">No racks match.</p>}
      </div>
      {installed && (
        <p className="installed-hint" data-testid="installed-hint">
          {installedHint('add a rack')}
        </p>
      )}
    </div>
  )
}
