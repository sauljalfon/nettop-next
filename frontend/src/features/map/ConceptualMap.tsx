import type { Route, Snapshot } from '../../shared/types'
import type { Sheet } from '../paths/sheet'
import HierarchyCanvas from './HierarchyCanvas'
import type { MapSession } from './mapSession'
import type { SnapshotIndex } from './snapshotIndex'

interface Props {
  snapshot: Snapshot
  installedIDs: ReadonlySet<string>
  /** Of the installed topology; what the plan adds is proposed. */
  installedLinkIDs: ReadonlySet<string>
  route?: Route
  /** The selected route as a walk sheet (shared with the results); the route view draws it. */
  routeSheet?: Sheet
  /** A step of the route view was clicked: open its endpoint in Physical. */
  onRouteStep?: (endpointId: string) => void
  /** The network the map shows. */
  networkId?: string
  /** Opens the inspector on this equipment. */
  onSelect: (id: string) => void
  /** Find AGG / BB from this device (the drawer's button). */
  onFindDevice: (equipmentId: string) => void
  /** A passive chip in the drawer: the route view on that jack. */
  onTraceJack?: (endpointId: string) => void
  onShowInPhysical: (equipmentId: string) => void
  onShowPlace: (target: { nodeId?: string }) => void
  /** Snapshot-only results; computed here when absent. */
  index?: SnapshotIndex
  /** Defaults to the app-wide session store. */
  session?: MapSession
  /** Containers of the installed topology: a node outside it is proposed. */
  installedContainerIds?: ReadonlySet<string>
}

/** The conceptual map: the hierarchy of one network, with the selection and its drawer. */
export default function ConceptualMap(props: Props) {
  return <HierarchyCanvas {...props} />
}
