import { ArrowLeft } from 'lucide-react'
import { Fragment } from 'react'
import Chip from '../../shared/ui/Chip'
import Name from '../../shared/ui/Name'
import { PlaceSep } from '../../shared/ui/PlacePath'
import type { Breadcrumb } from './history'
import type { PhysicalLocation } from './location'
import MoreMenu, { type MenuItem } from './MoreMenu'
import NumberingSwitch from './NumberingSwitch'

/**
 * The equipment page's one-line bar: Back, the breadcrumb ending in
 * ‹ previous · this equipment · next ›, then Front/Rear, Pairs | Pigtails, Open
 * in inventory and the ⋯ menu. Long names truncate; the bar never wraps.
 */
export default function EquipmentBar({
  crumbs,
  canBack,
  onBack,
  onNavigate,
  previous,
  next,
  onOpen,
  proposed,
  side,
  onSide,
  numbering,
  onOpenInventory,
  menuItems,
  menuOpenerKey,
}: {
  /** Sites down to this equipment (the last one). */
  crumbs: readonly Breadcrumb[]
  canBack: boolean
  onBack: () => void
  onNavigate: (location: PhysicalLocation) => void
  previous?: { id: string; name: string }
  next?: { id: string; name: string }
  onOpen: (equipmentId: string) => void
  proposed: boolean
  /** Set for a panel or HDF: Front/Rear. */
  side?: 'front' | 'rear'
  onSide: (side: 'front' | 'rear') => void
  /** An HDF: Pairs | Pigtails. */
  numbering: boolean
  /** Absent for a rack item. */
  onOpenInventory?: () => void
  menuItems: readonly MenuItem[]
  menuOpenerKey: string
}) {
  const here = crumbs[crumbs.length - 1]
  const ancestors = crumbs.slice(0, -1)
  return (
    <div className="equipment-bar" data-testid="equipment-bar">
      <button className="btn phys-back" disabled={!canBack} onClick={onBack}>
        <ArrowLeft size={13} aria-hidden />
        Back
      </button>
      <nav aria-label="Breadcrumbs" className="crumbs">
        {ancestors.map((c, i) => (
          <Fragment key={`${c.location.level}:${c.label}`}>
            {i > 0 && <PlaceSep className="crumb-sep" />}
            <button
              className="crumb-link"
              onClick={() => onNavigate(c.location)}
            >
              {i === 0 ? c.label : <Name text={c.label} />}
            </button>
          </Fragment>
        ))}
        <PlaceSep className="crumb-sep" />
        {previous && (
          <button
            className="crumb-link neighbour"
            aria-label="Previous in this rack"
            title={`Previous in this rack: ${previous.name}`}
            onClick={() => onOpen(previous.id)}
          >
            ‹ <Name text={previous.name} />
          </button>
        )}
        <strong aria-current="page" className="crumb-here">
          <span className="crumb-here-name">
            <Name text={here.label} />
          </span>
          {proposed && (
            <Chip
              kind="proposed"
              className="proposed-tag"
              testId="proposed-tag"
            >
              Proposed
            </Chip>
          )}
        </strong>
        {next && (
          <button
            className="crumb-link neighbour"
            aria-label="Next in this rack"
            title={`Next in this rack: ${next.name}`}
            onClick={() => onOpen(next.id)}
          >
            <Name text={next.name} /> ›
          </button>
        )}
      </nav>
      <div className="equipment-bar-controls">
        {side && (
          <div className="seg side-switch" role="group" aria-label="Side">
            {(['front', 'rear'] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={side === s}
                className={side === s ? 'active' : ''}
                onClick={() => onSide(s)}
              >
                {s === 'front' ? 'Front' : 'Rear'}
              </button>
            ))}
          </div>
        )}
        {numbering && <NumberingSwitch />}
        {onOpenInventory && (
          <button type="button" className="btn" onClick={onOpenInventory}>
            Open in inventory
          </button>
        )}
        <MoreMenu items={menuItems} openerKey={menuOpenerKey} />
      </div>
    </div>
  )
}
