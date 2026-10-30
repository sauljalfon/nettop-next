import { Fragment, useMemo, useState, type ReactNode } from 'react'
import Chip from '../../shared/ui/Chip'
import Name from '../../shared/ui/Name'
import PlacePath from '../../shared/ui/PlacePath'
import Pieces from '../../shared/ui/Pieces'
import { useInlineDialog } from '../planning/useInlineDialog'
import type { HierarchyNodeCard, NetworkHierarchy } from './hierarchy'
import {
  cables,
  cardByKey,
  MARK_TEXT,
  nodeRows,
  passiveSentence,
  switchWalks,
  wayUp,
  type SwitchRow,
  type WayStep,
} from './hierarchyDetails'
import { dependents, type Selection } from './hierarchySelection'
import type { WalkStep } from './walks'
import type { SnapshotIndex } from './snapshotIndex'

export interface DrawerActions {
  onClose: () => void
  onInspect: (equipmentId: string) => void
  onFind: (equipmentId: string) => void
  onShowEquipment: (equipmentId: string) => void
  onShowNode: (nodeId: string) => void
  /** A device chip: select that device on the tree. */
  onSelectEquipment: (equipmentId: string) => void
  /** A passive chip: the route view on that jack. */
  onTraceJack: (endpointId: string) => void
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

function Via({ index, via }: { index: SnapshotIndex; via: WalkStep[] }) {
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
  proposed,
  children,
  onClose,
}: {
  dot: string
  title: ReactNode
  chip: string
  /** The plan adds it. */
  proposed?: boolean
  children: ReactNode
  onClose: () => void
}) {
  return (
    <header className="hd-head">
      <div className="hd-top">
        <i className="dot" style={{ background: dot }} aria-hidden="true" />
        <h2>{title}</h2>
        <Chip kind="role">{chip}</Chip>
        {proposed && <Chip kind="proposed">Proposed</Chip>}
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

const ROLE_CHIP: Record<string, string> = {
  access: 'Switch',
  aggregation: 'AGG',
  backbone: 'BB',
}
const KIND_CHIP: Record<string, string> = {
  panel: 'Panel',
  hdf: 'HDF',
  server: 'Server',
}

/** The one sentence under the name: what the equipment is to its network. */
function Sentence({
  hierarchies,
  h,
  index,
  id,
  networkName,
}: {
  hierarchies: ReadonlyMap<string, NetworkHierarchy>
  h?: NetworkHierarchy
  index: SnapshotIndex
  id: string
  networkName: (id: string) => string
}) {
  const e = index.equipment.get(id)
  const s = h?.switches.get(id)
  if (!h || !e) {
    // A passive that lights something says what runs through it.
    const carried = passiveSentence(hierarchies, index, id)
    return carried ? (
      <Pieces pieces={carried} />
    ) : (
      <>Not on any network’s tree.</>
    )
  }
  if (h.topIds.includes(id))
    return (
      <>
        Top of <Name text={networkName(h.networkId)} />.
      </>
    )
  if (h.aggIds.includes(id))
    return h.noTop.has(id) ? (
      <>
        <b>No BB uplink</b>: nothing below it reaches the BB.
      </>
    ) : (
      <>
        Up to{' '}
        <Names
          index={index}
          ids={[...new Set((h.ups.get(id) ?? []).map((c) => c.farId))]}
          sep=" + "
        />
        .
      </>
    )
  if (s) {
    if (s.mark === 'no-uplink')
      return (
        <>
          <b>No uplink</b>: no cable reaches an AGG or BB.
        </>
      )
    if (s.mark === 'chained')
      return (
        <>
          <b>Chained only</b>: its way up is through{' '}
          <Names index={index} ids={s.parents} sep=", " />.
        </>
      )
    if (s.mark === 'other-network')
      return (
        <>
          <b>Only another network</b>:{' '}
          {s.otherNetwork.map((c, i) => (
            <Fragment key={c.farId}>
              {i > 0 && ', '}
              <Name
                text={index.equipment.get(c.farId)?.name ?? c.farId}
              /> on{' '}
              <Name
                text={networkName(
                  index.equipment.get(c.farId)?.networkId ?? '',
                )}
              />
            </Fragment>
          ))}
          .
        </>
      )
    const to = [...new Set(s.uplinks.map((c) => c.farId))]
    return (
      <>
        {s.twoUplinks ? 'Two or more ways up' : 'One uplink'}:{' '}
        <Names index={index} ids={to} sep=" + " />.
      </>
    )
  }
  return <>Not on any network’s tree.</>
}

function Step({
  step,
  index,
  actions,
}: {
  step: WayStep
  index: SnapshotIndex
  actions: DrawerActions
}) {
  const name = (id: string) => index.equipment.get(id)?.name ?? id
  switch (step.kind) {
    case 'port':
      return <span className="mono">{portLabel(index, step.endpointId)}</span>
    case 'passive':
      return (
        <button
          type="button"
          className="hd-chip"
          data-way-passive={step.equipmentId}
          title="Trace this jack end to end"
          onClick={() => actions.onTraceJack(step.endpointId)}
        >
          <Name text={name(step.equipmentId)} />{' '}
          <span className="mono">{step.place}</span>
        </button>
      )
    case 'device':
      return (
        <>
          <button
            type="button"
            className="hd-chip"
            data-way-device={step.equipmentId}
            onClick={() => actions.onSelectEquipment(step.equipmentId)}
          >
            <Name text={name(step.equipmentId)} />
          </button>
          {step.fault && (
            <span className="hd-warn">
              {step.fault === 'chained only' ? 'chained only' : 'other network'}
            </span>
          )}
        </>
      )
    case 'tops':
      return (
        <>
          {step.ids.map((id, i) => (
            <Fragment key={id}>
              {i > 0 && ' + '}
              <button
                type="button"
                className="hd-chip"
                data-way-device={id}
                onClick={() => actions.onSelectEquipment(id)}
              >
                <Name text={name(id)} />
              </button>
            </Fragment>
          ))}
        </>
      )
    case 'gap':
      return (
        <span className="hd-warn">
          <Pieces pieces={step.text} />
        </span>
      )
  }
}

const MORE_DEPENDENTS = 40
const MORE_CABLES = 30

/**
 * A selected device: what it is, its way up (a chip per port, jack and device),
 * what depends on it, and its cables. Pure reads of the hierarchy; nothing here
 * feeds a trace except a jack chip, which asks for one.
 */
function EquipmentBody({
  hierarchies,
  index,
  id,
  colorOf,
  networkName,
  isProposed,
  actions,
}: {
  hierarchies: ReadonlyMap<string, NetworkHierarchy>
  index: SnapshotIndex
  id: string
  isProposed: (id: string) => boolean
  colorOf: (networkId: string) => string
  networkName: (id: string) => string
  actions: DrawerActions
}) {
  const e = index.equipment.get(id)
  const place = index.places.get(id)
  const h = [...hierarchies.values()].find(
    (x) => x.switches.has(id) || x.aggIds.includes(id) || x.topIds.includes(id),
  )
  const rows = useMemo(
    () => wayUp(hierarchies, index, id),
    [hierarchies, index, id],
  )
  const deps = useMemo(
    () => dependents(hierarchies, index, id),
    [hierarchies, index, id],
  )
  const wires = useMemo(() => cables(index, id), [index, id])
  const cut = deps.filter((d) => d.cutOff).length
  const rack = index.racks.get(index.equipment.get(id)?.rackId ?? '')
  const isAccess = !!h?.switches.has(id)
  const active = !!h
  return (
    <>
      <Head
        dot={colorOf(h?.networkId ?? e?.networkId ?? '')}
        title={<Name text={e?.name ?? id} />}
        chip={
          (e?.role && ROLE_CHIP[e.role]) ||
          KIND_CHIP[e?.kind ?? ''] ||
          e?.kind ||
          'Equipment'
        }
        proposed={isProposed(id)}
        onClose={actions.onClose}
      >
        <PlacePath
          parts={[
            index.sites.get(place?.siteId ?? '')?.name ?? '',
            index.nodes.get(place?.nodeId ?? '')?.name ?? '',
            rack?.name ?? '',
          ]}
        />
      </Head>
      <div className="hd-body">
        <p className="hd-say" data-testid="hd-say">
          <Sentence
            hierarchies={hierarchies}
            h={h}
            index={index}
            id={id}
            networkName={networkName}
          />
        </p>
        {rows.length > 0 && (
          <section data-testid="hd-way">
            <h3>Way up</h3>
            {rows.map((row, i) => (
              <div key={i} className="hd-way" data-way-row>
                {row.map((step, j) => (
                  <Fragment key={j}>
                    {j > 0 && <span className="hd-sep"> › </span>}
                    <Step step={step} index={index} actions={actions} />
                  </Fragment>
                ))}
              </div>
            ))}
          </section>
        )}
        <section data-testid="hd-depends">
          <h3>Depends on it · {deps.length}</h3>
          {deps.length === 0 ? (
            <p className="hd-note">Nothing.</p>
          ) : (
            <>
              <p className={cut > 0 ? 'hd-say-warn' : undefined}>
                {cut > 0 ? (
                  <b>{cut} would be cut off</b>
                ) : (
                  'None would be cut off'
                )}
                {cut > 0 ? ' if it fails' : ''}
                {deps.length > cut &&
                  `; ${deps.length - cut} ${deps.length - cut === 1 ? 'has' : 'have'} another way up`}
              </p>
              <div className="hd-list">
                {deps.slice(0, MORE_DEPENDENTS).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    data-depends={d.id}
                    onClick={() => actions.onSelectEquipment(d.id)}
                  >
                    <Name text={index.equipment.get(d.id)?.name ?? d.id} />
                    <span className={d.cutOff ? 'hd-warn' : 'hd-note'}>
                      {d.cutOff ? 'cut off' : 'another way up'}
                    </span>
                  </button>
                ))}
                {deps.length > MORE_DEPENDENTS && (
                  <div className="hd-note">
                    +{deps.length - MORE_DEPENDENTS} more
                  </div>
                )}
              </div>
            </>
          )}
        </section>
        <section data-testid="hd-cables">
          <h3>Cables ({wires.length})</h3>
          <div className="hd-list">
            {wires.slice(0, MORE_CABLES).map((c) => (
              <div key={c.endpointId} data-cable={c.endpointId}>
                <span className="mono">{portLabel(index, c.endpointId)}</span>
                <span>
                  <Name
                    text={index.equipment.get(c.farEquipmentId)?.name ?? ''}
                  />{' '}
                  <span className="mono">
                    {portLabel(index, c.farEndpointId)}
                  </span>
                </span>
              </div>
            ))}
            {wires.length > MORE_CABLES && (
              <div className="hd-note">+{wires.length - MORE_CABLES} more</div>
            )}
          </div>
        </section>
      </div>
      <div className="hd-actions">
        {active && (
          <button
            type="button"
            className="btn"
            onClick={() => actions.onInspect(id)}
          >
            Inspector
          </button>
        )}
        {isAccess && (
          <button
            type="button"
            className="btn"
            onClick={() => actions.onFind(id)}
          >
            Find AGG / BB
          </button>
        )}
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
 * The drawer over the hierarchy (D34, D40): a selected node card's switches with
 * their uplinks, or a selected device's way up, dependents and cables. It reads
 * the selection by its key on every render, so a refetch shows the new names and
 * the canvas clears the selection only when the key is gone. ✕ and Escape clear
 * it, and focus returns to the card.
 */
export default function HierarchyDrawer({
  hierarchies,
  index,
  selection,
  colorOf,
  networkName,
  isProposed,
  actions,
}: {
  hierarchies: ReadonlyMap<string, NetworkHierarchy>
  index: SnapshotIndex
  selection: Selection
  isProposed: (id: string) => boolean
  colorOf: (networkId: string) => string
  networkName: (id: string) => string
  actions: DrawerActions
}) {
  const key = selection.kind === 'card' ? selection.key : selection.id
  const dialog = useInlineDialog<HTMLElement>(actions.onClose, key)
  const [open, setOpen] = useState<{ card: string; id: string }>()
  const openSwitch = open?.card === key ? open.id : undefined
  const h =
    selection.kind === 'card' ? hierarchies.get(selection.networkId) : undefined
  const card = h && selection.kind === 'card' ? cardByKey(h, key) : undefined
  return (
    <aside
      {...dialog}
      className="drawer hierarchy-drawer"
      data-testid="hierarchy-drawer"
      aria-label="Hierarchy details"
    >
      {selection.kind === 'card' ? (
        h &&
        card?.kind === 'node' && (
          <NodeBody
            h={h}
            index={index}
            card={card.card}
            color={colorOf(h.networkId)}
            networkName={networkName}
            openSwitch={openSwitch}
            onToggleSwitch={(id) =>
              setOpen(openSwitch === id ? undefined : { card: key, id })
            }
            actions={actions}
            siteName={index.sites.get(card.card.siteId ?? '')?.name ?? ''}
            nodeName={index.nodes.get(card.card.nodeId ?? '')?.name ?? ''}
          />
        )
      ) : (
        <EquipmentBody
          hierarchies={hierarchies}
          index={index}
          id={selection.id}
          isProposed={isProposed}
          colorOf={colorOf}
          networkName={networkName}
          actions={actions}
        />
      )}
    </aside>
  )
}
