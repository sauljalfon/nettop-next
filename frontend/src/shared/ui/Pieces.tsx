import type { TextPiece } from '../textPieces'
import Name from './Name'

/** Text pieces with every name isolated in <bdi>, so digits beside it keep their order. */
export default function Pieces({ pieces }: { pieces: readonly TextPiece[] }) {
  return (
    <>
      {pieces.map((p, i) =>
        'name' in p ? <Name key={i} text={p.name} /> : p.text,
      )}
    </>
  )
}
