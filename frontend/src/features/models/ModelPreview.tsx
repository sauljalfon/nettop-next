import { useMemo } from 'react'
import type { Equipment } from '../../shared/types'
import FaceView from '../physical/FaceView'
import type { GroupRow } from '../planning/portGroups'
import { modelFace } from './previewFace'

const NO_COLORS: ReadonlyMap<string, string> = new Map()
const nothing = () => undefined

/** "How it will look": the real faceplate drawn from the rows as they are typed. Look only: nothing on it can be chosen. */
export default function ModelPreview({
  name,
  rows,
}: {
  name: string
  rows: readonly GroupRow[]
}) {
  const face = useMemo(() => modelFace(rows), [rows])
  const equipment: Equipment = {
    id: 'model-preview',
    name: name.trim() || 'MODEL',
    kind: 'switch',
    role: 'access',
    rackId: '',
    unit: 1,
    height: 1,
  }
  return (
    <div
      className="model-preview"
      data-testid="model-preview"
      // The jacks are drawn, not used.
      inert
    >
      <FaceView
        equipment={equipment}
        face={face}
        meta=""
        networks={[]}
        colors={NO_COLORS}
        tooltip={(cell) => cell.label}
        onSelect={nothing}
        onSide={nothing}
        headless
        legend={false}
      />
    </div>
  )
}
