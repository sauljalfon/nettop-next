import { Fragment, useState, type ReactNode } from 'react'
import Chip from '../../shared/ui/Chip'
import Name from '../../shared/ui/Name'
import PlacePath from '../../shared/ui/PlacePath'
import { useInlineDialog } from '../planning/useInlineDialog'
import type { HierarchyNodeCard, NetworkHierarchy } from './hierarchy'
import {
  MARK_TEXT,
  nodeRows,
  switchWalks,
  tierLinks,
  tierUnder,
  type CardRef,
  type SwitchRow,
} from './hierarchyDetails'
import type { FocusStep } from './focus'
import type { SnapshotIndex } from './snapshotIndex'

export interface DrawerActions {
  onClose: () => void
  onFocus: (equipmentId: string) => void
  onInspect: (equipmentId: string) => void
  onFind: (equipmentId: string) => void
  onShowEquipment: (equipmentId: string) => void
  onShowNode: (nodeId: string) => void
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

/** Names kept apart, joined by a separator the page draws. */
function Names({
  index,
  ids,
  sep,
}: {
  index: SnapshotIndex
  ids: readonly string[]
  sep: string
}) {
  return (
    <>
      {ids.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && sep}
          <Name text={index.equipment.get(id)?.name ?? id} />
        </Fragment>
      ))}
    </>
  )
}

const portLabel = (index: SnapshotIndex, id: string) =>
  index.lookup.endpoints.get(id)?.label ?? id

function Via({ index, via }: { index: SnapshotIndex; via: FocusStep[] }) {
  if (via.length === 0) return <>direct</>
  return (
    <>
      via{' '}
      {via.map((step, i) => (
        <Fragment key={i}>
          {i > 0 && ' › '}
          <span className="hd-step">
            <Name text={index.equipment.get(step.equipmentId)?.name ?? ''} />{' '}
            <span className="mono">{step.place}</span>
          </span>
        </Fragment>
      ))}
    </>
  )
}

function SwitchDetail({
  index,
  switchId,
  actions,
}: {
  index: SnapshotIndex
  switchId: string
  actions: DrawerActions
}) {
  const walks = switchWalks(index, switchId)
  return (
    <div className="hierarchy-switch-detail">
      {walks.length === 0 && (
        <p className="hd-note">
          No cable from this switch reaches another active device.
        </p>
      )}
      {walks.map((w) => (
        <div key={w.start} className="hd-uplink" data-uplink-to={w.farId}>
          <div className="hd-ends">
            <span className="mono">{portLabel(index, w.start)}</span> →{' '}
            <Name text={index.equipment.get(w.farId)?.name ?? w.farId} />{' '}
            <span className="mono">{portLabel(index, w.end)}</span>
          </div>
          <div className="hd-via">
            <Via index={index} via={w.via} />
          </div>
        </div>
      ))}
      <div className="hd-buttons">
        <button
          type="button"
          className="btn"
          onClick={() => actions.onFocus(switchId)}
        >
          Focus
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => actions.onInspect(switchId)}
        >
          Inspector
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => actions.onFind(switchId)}
        >
          Find AGG / BB
        </button>
      </div>
    </div>
  )
}

function SwitchRows({
  rows,
  index,
  networkName,
  open,
  onToggle,
  actions,
}: {
  rows: SwitchRow[]
  index: SnapshotIndex
  networkName: (id: string) => string
  open: string | undefined
  onToggle: (id: string) => void
  actions: DrawerActions
}) {
  return (
    <>
      {rows.map((r) => (
        <div
          key={r.id}
          className={`hd-switch${r.depth ? ' chained' : ''}${open === r.id ? ' selected' : ''}`}
        >
          <button
            type="button"
            data-switch-id={r.id}
            aria-expanded={open === r.id}
            style={
              r.depth > 1
                ? { paddingInlineStart: 12 + r.depth * 12 }
                : undefined
            }
            onClick={() => onToggle(r.id)}
          >
            <span className="hd-name">
              <Name text={index.equipment.get(r.id)?.name ?? r.id} />
            </span>
            <span className="hd-to">
              →{' '}
              {r.toIds.length > 0 ? (
                <Names index={index} ids={r.toIds} sep=" + " />
              ) : r.other ? (
                r.other.map((o, i) => (
                  <Fragment key={o.farId}>
                    {i > 0 && ', '}
                    <Name
                      text={index.equipment.get(o.farId)?.name ?? o.farId}
                    />{' '}
                    (<Name text={networkName(o.networkId)} />)
                  </Fragment>
                ))
              ) : (
                'no uplink'
              )}
            </span>
            {r.mark && <span className="hd-mark">{MARK_TEXT[r.mark]}</span>}
          </button>
          {open === r.id && (
            <SwitchDetail index={index} switchId={r.id} actions={actions} />
          )}
        </div>
      ))}
    </>
  )
}

function Head({
  dot,
  title,
  chip,
  children,
  onClose,
}: {
  dot: string
  title: ReactNode
  chip: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <header className="hd-head">
      <div className="hd-top">
        <i className="dot" style={{ background: dot }} aria-hidden="true" />
        <h2>{title}</h2>
        <Chip kind="role">{chip}</Chip>
        <button
          type="button"
          className="btn quiet hd-close"
          aria-label="Close details"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <p className="hd-place">{children}</p>
    </header>
  )
}

function NodeBody({
  h,
  index,
  card,
  color,
  networkName,
  openSwitch,
  onToggleSwitch,
  actions,
  siteName,
  nodeName,
}: {
  h: NetworkHierarchy
  index: SnapshotIndex
  card: HierarchyNodeCard
  color: string
  networkName: (id: string) => string
  openSwitch: string | undefined
  onToggleSwitch: (id: string) => void
  actions: DrawerActions
  siteName: string
  nodeName: string
}) {
  const rows = nodeRows(h, index, card)
  return (
    <>
      <Head
        dot={color}
        title={nodeName ? <Name text={nodeName} /> : 'Not in a node'}
        chip="Node"
        onClose={actions.onClose}
      >
        {siteName && (
          <>
            <Name text={siteName} />
            {' · '}
          </>
        )}
        <Name text={networkName(h.networkId)} />
        {' · '}
        {plural(card.switchIds.length, 'switch', 'switches')}
      </Head>
      <div className="hd-body">
        <section>
          <h3>Switches and their uplinks</h3>
          <SwitchRows
            rows={rows}
            index={index}
            networkName={networkName}
            open={openSwitch}
            onToggle={onToggleSwitch}
            actions={actions}
          />
        </section>
        <p className="hd-note">
          Uplinks are the first active device each switch reaches over real
          cables, through any panels and HDFs. Click a switch for its ports and
          the way.
        </p>
      </div>
      <div className="hd-actions">
        {card.nodeId && (
          <button
            type="button"
            className="btn primary"
            onClick={() => actions.onShowNode(card.nodeId!)}
          >
            Show in Physical
          </button>
        )}
      </div>
    </>
  )
}

function TierBody({
  h,
  index,
  id,
  color,
  actions,
}: {
  h: NetworkHierarchy
  index: SnapshotIndex
  id: string
  color: string
  actions: DrawerActions
}) {
  const e = index.equipment.get(id)
  const place = index.places.get(id)
  const links = tierLinks(h, index, id)
  const under = tierUnder(h, id)
  return (
    <>
      <Head
        dot={color}
        title={<Name text={e?.name ?? id} />}
        chip={e?.role === 'backbone' ? 'BB' : 'AGG'}
        onClose={actions.onClose}
      >
        <PlacePath
          parts={[
            index.sites.get(place?.siteId ?? '')?.name ?? '',
            index.nodes.get(place?.nodeId ?? '')?.name ?? '',
          ]}
        />
      </Head>
      <div className="hd-body">
        <section>
          <h3>
            Links to {h.topKind === 'backbone' ? 'BB and AGG' : 'other AGGs'}
          </h3>
          {links.length === 0 && (
            <p className="hd-note">No cable to another AGG or BB.</p>
          )}
          <div className="hd-links">
            {links.map((l, i) => (
              <div key={i} className="hd-link">
                <Chip kind="state">{l.kind}</Chip>
                <Name
                  text={index.equipment.get(l.otherId)?.name ?? l.otherId}
                />{' '}
                <span className="mono hd-note">
                  {portLabel(index, l.mine)} → {portLabel(index, l.theirs)}
                </span>
              </div>
            ))}
          </div>
        </section>
        {under && (
          <section>
            <h3>Under it</h3>
            <p>
              {plural(under.nodes, 'node')},{' '}
              {plural(under.switches, 'switch', 'switches')}
              {under.sharedWith.length > 0 && (
                <>
                  , shared with{' '}
                  <Names index={index} ids={under.sharedWith} sep=", " />
                </>
              )}
            </p>
          </section>
        )}
      </div>
      <div className="hd-actions">
        <button
          type="button"
          className="btn primary"
          onClick={() => actions.onFocus(id)}
        >
          Focus
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => actions.onInspect(id)}
        >
          Inspector
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => actions.onShowEquipment(id)}
        >
          Show in Physical
        </button>
      </div>
    </>
  )
}

/**
 * The drawer over the hierarchy (D34): a node card's switches with their
 * uplinks, or a tier card's links. It reads the card by its key on every
 * render, so a refetch shows the new names and the canvas closes it only when
 * the key is gone. ✕ and Escape close it, and focus returns to the card.
 */
export default function HierarchyDrawer({
  h,
  index,
  card,
  cardKey,
  color,
  networkName,
  actions,
}: {
  h: NetworkHierarchy
  index: SnapshotIndex
  card: CardRef
  cardKey: string
  color: string
  networkName: (id: string) => string
  actions: DrawerActions
}) {
  const dialog = useInlineDialog<HTMLElement>(actions.onClose, cardKey)
  const [open, setOpen] = useState<{ card: string; id: string }>()
  const openSwitch = open?.card === cardKey ? open.id : undefined
  return (
    <aside
      {...dialog}
      className="drawer hierarchy-drawer"
      data-testid="hierarchy-drawer"
      aria-label="Hierarchy details"
    >
      {card.kind === 'node' ? (
        <NodeBody
          h={h}
          index={index}
          card={card.card}
          color={color}
          networkName={networkName}
          openSwitch={openSwitch}
          onToggleSwitch={(id) =>
            setOpen(openSwitch === id ? undefined : { card: cardKey, id })
          }
          actions={actions}
          siteName={index.sites.get(card.card.siteId ?? '')?.name ?? ''}
          nodeName={index.nodes.get(card.card.nodeId ?? '')?.name ?? ''}
        />
      ) : (
        <TierBody
          h={h}
          index={index}
          id={card.id}
          color={color}
          actions={actions}
        />
      )}
    </aside>
  )
}
