import { useEffect, useState } from 'react'
import { RACK_ITEM_TYPES, rackItemTypeLabel } from '../../shared/rackItems'
import type { SwitchModel } from '../../shared/types'
import Name from '../../shared/ui/Name'
import { modelPortCount } from '../models/model'
import { useSwitchModels } from '../models/useSwitchModels'
import { DRAG_TYPE, dragPayload } from '../physical/drops'
import LocationPicker from '../patching/LocationPicker'
import type { Near, SiteBranch } from '../patching/patching'
import { defaultRackItemHeight, type NewItem } from './boxModel'
import { addSession, sameItem, useAddSession } from './addSession'
import './editing.css'
import './planning.css'
import './addbox.css'

function Icon({
  kind,
  bays = 8,
}: {
  kind: 'switch' | 'panel' | 'item'
  bays?: number
}) {
  return (
    <span className={`face-icon ${kind}`} aria-hidden>
      {kind === 'item'
        ? null
        : Array.from({ length: bays }, (_, i) => <i key={i} />)}
    </span>
  )
}

/** The model's groups as a short line: "1U · 48 + 4 ports". */
const modelLine = (m: SwitchModel) =>
  `${m.height}U · ${m.portGroups.map((g) => g.count ?? 0).join(' + ')} ports (${modelPortCount(m)})`

/**
 * The equipment library (D51), the dock's Add tab: switches by model, the
 * passive items, the rack items. Drag an entry onto a free unit, or click it
 * and then a unit (with no rack shown the note asks for one: Site › Node ›
 * Rack); either opens the small box at the unit. Esc lets a pick go.
 */
export default function LibraryItems({
  canEdit,
  tree,
  near,
  rackShown,
  onOpenRack,
  onOpenModels,
}: {
  canEdit: boolean
  tree: readonly SiteBranch[]
  /** Where the user is in Physical, for the rack picker's start. */
  near?: Near
  /** The rack the Physical view shows now (a pick needs none to ask for). */
  rackShown?: string
  /** Shows that rack in Physical. */
  onOpenRack: (rackId: string) => void
  /** Opens the Switch models page (D51); true starts on a new model. */
  onOpenModels: (startNew?: boolean) => void
}) {
  const { models, loading, error } = useSwitchModels()
  const { picked } = useAddSession()
  const [rackChoice, setRackChoice] = useState('')
  // Esc lets a pick go, before the dock closes (and never while the box is open: it has its own).
  useEffect(() => {
    if (!picked) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (addSession.get().box) return
      event.preventDefault()
      addSession.pick(undefined)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [picked])

  const entry = (
    item: NewItem,
    name: React.ReactNode,
    sub: string,
    icon: React.ReactNode,
  ) => {
    const on = sameItem(picked, item)
    return (
      <button
        type="button"
        key={dragPayload(item)}
        className={`library-item${on ? ' picked' : ''}`}
        data-testid="library-item"
        data-item={dragPayload(item)}
        draggable={canEdit}
        aria-pressed={on}
        aria-disabled={!canEdit}
        onClick={() => canEdit && addSession.pick(on ? undefined : item)}
        onDragStart={(e) => {
          if (!canEdit) return e.preventDefault()
          e.dataTransfer.setData(DRAG_TYPE, dragPayload(item))
          e.dataTransfer.effectAllowed = 'copy'
        }}
      >
        {icon}
        <div>
          <strong>{name}</strong>
          <small>{sub}</small>
        </div>
      </button>
    )
  }
  const pickedName = !picked ? null : picked.type === 'model' ? (
    <Name
      text={models?.find((m) => m.id === picked.modelId)?.name ?? 'switch'}
    />
  ) : picked.type === 'panel' ? (
    'Patch panel'
  ) : picked.type === 'hdf' ? (
    'HDF'
  ) : (
    rackItemTypeLabel(picked.itemType)
  )

  return (
    <>
      <div className="notice">
        <strong>
          {canEdit ? 'Build your planned network' : 'Installed view'}
        </strong>
        <p>
          {canEdit
            ? 'Drag onto a free unit, or click one here and then a unit.'
            : 'Switch to a plan in the top bar to add or move equipment.'}
        </p>
      </div>
      {canEdit && picked && (
        <div className="pick-note" data-testid="pick-note">
          <span>
            <strong>{pickedName}</strong> picked:{' '}
            {rackShown
              ? 'click a free unit in the rack.'
              : 'choose a rack, then click a free unit.'}{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => addSession.pick(undefined)}
            >
              Cancel
            </button>
          </span>
          {!rackShown && (
            <>
              <LocationPicker
                level="rack"
                label="Rack"
                tree={tree}
                near={near}
                rackId={rackChoice}
                onChange={setRackChoice}
              />
              <button
                type="button"
                className="btn"
                disabled={!rackChoice}
                onClick={() => onOpenRack(rackChoice)}
              >
                Show rack
              </button>
            </>
          )}
        </div>
      )}
      <div className="lib-list">
        <section className="lib-group" aria-label="Switches">
          <div className="lib-group-head">
            <h3>Switches</h3>
            <span className="faint">by model</span>
            <button
              type="button"
              className="link-button"
              onClick={() => onOpenModels()}
            >
              Manage models…
            </button>
          </div>
          {error && <p className="muted">{error}</p>}
          {models?.map((m) =>
            entry(
              { type: 'model', modelId: m.id },
              <Name text={m.name} />,
              modelLine(m),
              <Icon kind="switch" />,
            ),
          )}
          {models && models.length === 0 && !loading && (
            <div className="lib-empty">
              No switch models yet.{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => onOpenModels(true)}
              >
                New model…
              </button>
            </div>
          )}
          {!!models?.length && (
            <button
              type="button"
              className="link-button"
              onClick={() => onOpenModels(true)}
            >
              + New model…
            </button>
          )}
        </section>
        <section className="lib-group" aria-label="Passive">
          <div className="lib-group-head">
            <h3>Passive</h3>
          </div>
          {entry(
            { type: 'panel' },
            'Patch panel',
            '1U · 3, 6, 12, 24 or any count',
            <Icon kind="panel" bays={6} />,
          )}
          {entry(
            { type: 'hdf' },
            'HDF',
            'rows × A–D, its own height',
            <Icon kind="panel" bays={4} />,
          )}
        </section>
        <section className="lib-group" aria-label="Rack items">
          <div className="lib-group-head">
            <h3>Rack items</h3>
            <span className="faint">no ports</span>
          </div>
          {RACK_ITEM_TYPES.map((t) =>
            entry(
              { type: 'rack_item', itemType: t },
              rackItemTypeLabel(t),
              t === 'other'
                ? 'you say what it is'
                : `${defaultRackItemHeight(t)}U`,
              <Icon kind="item" />,
            ),
          )}
        </section>
      </div>
      <p className="muted">
        Add sites, nodes and racks in Physical, on the level where they belong.
      </p>
    </>
  )
}
