import { useSyncExternalStore } from 'react'
import type { Route, Snapshot } from '../../shared/types'
import type { Sheet } from '../paths/sheet'
import FocusCanvas from './FocusCanvas'
import OverviewCanvas from './OverviewCanvas'
import { mapSession, type MapSession } from './mapSession'
import type { SnapshotIndex } from './snapshotIndex'

interface Props {
  snapshot: Snapshot
  installedIDs: ReadonlySet<string>
  selected: string
  route?: Route
  /** The selected route as a walk sheet (shared with the results); the route view draws it. */
  routeSheet?: Sheet
  /** A step of the route view was clicked: open its endpoint in Physical. */
  onRouteStep?: (endpointId: string) => void
  /** Presentation filter; undefined is All networks. */
  networkId?: string
  onSelect: (id: string) => void
  /** Find AGG / BB from one exact port or position endpoint. */
  onPort: (id: string) => void
  /** Snapshot-only results; computed here when absent. */
  index?: SnapshotIndex
  /** Defaults to the app-wide session store. */
  session?: MapSession
  /** Containers of the installed topology: an overview node outside it is proposed. */
  installedContainerIds?: ReadonlySet<string>
}

/** The conceptual map: Focus on one device, or the overview of nodes. */
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
    <OverviewCanvas
      snapshot={props.snapshot}
      index={props.index}
      installedContainerIds={props.installedContainerIds}
      selected={props.selected}
      networkId={props.networkId}
      onSelect={props.onSelect}
      route={props.route}
      routeSheet={props.routeSheet}
      onRouteStep={props.onRouteStep}
      session={session}
    />
  )
}
