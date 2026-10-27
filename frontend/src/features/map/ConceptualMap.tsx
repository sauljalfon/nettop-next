import { useSyncExternalStore } from 'react'
import type { Route, Snapshot } from '../../shared/types'
import type { Sheet } from '../paths/sheet'
import FocusCanvas from './FocusCanvas'
import HierarchyCanvas from './HierarchyCanvas'
import { mapSession, type MapSession } from './mapSession'
import type { SnapshotIndex } from './snapshotIndex'

interface Props {
  snapshot: Snapshot
  installedIDs: ReadonlySet<string>
  /** Of the installed topology; what the plan adds is proposed. */
  installedLinkIDs: ReadonlySet<string>
  selected: string
  route?: Route
  /** The selected route as a walk sheet (shared with the results); the route view draws it. */
  routeSheet?: Sheet
  /** A step of the route view was clicked: open its endpoint in Physical. */
  onRouteStep?: (endpointId: string) => void
  /** The network the map shows (the hierarchy's, and what Focus dims by). */
  networkId?: string
  /** Opens the inspector on this equipment. */
  onSelect: (id: string) => void
  /** Find AGG / BB from one exact port or position endpoint. */
  onPort: (id: string) => void
  /** Find AGG / BB from this device (the inspector's button). */
  onFindDevice: (equipmentId: string) => void
  onShowInPhysical: (equipmentId: string) => void
  onShowPlace: (target: { nodeId?: string }) => void
  /** Opens Focus on this equipment. */
  onFocus: (equipmentId: string) => void
  /** Snapshot-only results; computed here when absent. */
  index?: SnapshotIndex
  /** Defaults to the app-wide session store. */
  session?: MapSession
  /** Containers of the installed topology: a node outside it is proposed. */
  installedContainerIds?: ReadonlySet<string>
}

/** The conceptual map: Focus on one device, or the hierarchy of one network. */
export default function ConceptualMap(props: Props) {
  const session = props.session ?? mapSession
  const view = useSyncExternalStore(session.subscribe, session.view)
  if (view === 'focus')
    return (
      <FocusCanvas
        snapshot={props.snapshot}
        index={props.index}
        installedIds={props.installedIDs}
        selected={props.selected}
        networkId={props.networkId}
        onSelect={props.onSelect}
        onPort={props.onPort}
        route={props.route}
        routeSheet={props.routeSheet}
        onRouteStep={props.onRouteStep}
        session={session}
      />
    )
  return (
    <HierarchyCanvas
      snapshot={props.snapshot}
      index={props.index}
      installedIDs={props.installedIDs}
      installedLinkIDs={props.installedLinkIDs}
      installedContainerIds={props.installedContainerIds}
      networkId={props.networkId}
      onSelect={props.onSelect}
      onFindDevice={props.onFindDevice}
      onFocus={props.onFocus}
      onShowInPhysical={props.onShowInPhysical}
      onShowPlace={props.onShowPlace}
      route={props.route}
      routeSheet={props.routeSheet}
      onRouteStep={props.onRouteStep}
      session={session}
    />
  )
}
