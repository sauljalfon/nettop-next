import type { Route, Snapshot } from '../../shared/types'
import HierarchyCanvas from './HierarchyCanvas'
import type { MapSession } from './mapSession'
import type { SnapshotIndex } from './snapshotIndex'

interface Props {
  snapshot: Snapshot
  installedIDs: ReadonlySet<string>
  /** Of the installed topology; what the plan adds is proposed. */
  installedLinkIDs: ReadonlySet<string>
  route?: Route
  /** The network the map shows. */
  networkId?: string
  /** Opens the inspector on this equipment. */
  onSelect: (id: string) => void
  /** Find AGG / BB from this device (the drawer's button). */
  onFindDevice: (equipmentId: string) => void
  /** A passive chip in the drawer: the Trace page on that jack. */
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
