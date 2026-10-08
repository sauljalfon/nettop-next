import type { Face } from './equipmentModel'

export interface NavCell {
  id: string
  row: number
  col: number
}

/**
 * Every endpoint of a face with its place in the visual layout: a switch's two
 * rows (ports 1,3,5… above 2,4,6…), a panel's rows of 12, and an HDF as one grid
 * three positions wide per block and two high, so arrows cross blocks. Cells
 * with no endpoint are left out.
 */
export function navCells(face: Face): NavCell[] {
  if (face.kind === 'switch')
    return face.rows
      .flat()
      .flatMap((cell, n) =>
        cell.endpointId
          ? [{ id: cell.endpointId, row: n % 2, col: Math.floor(n / 2) }]
          : [],
      )
  if (face.kind === 'panel')
    return face.face.positions.flatMap((cell) =>
      cell.endpointId
        ? [
            {
              id: cell.endpointId,
              row: Math.floor((cell.position - 1) / 12),
              col: (cell.position - 1) % 12,
            },
          ]
        : [],
    )
  const column = { A: 0, B: 1, C: 2, D: 3 } as const
  return face.face.blocks.flatMap((block) =>
    block.positions.flatMap((cell) =>
      cell.endpointId
        ? [
            {
              id: cell.endpointId,
              row: (block.row - 1) * 2 + Math.floor((cell.position - 1) / 3),
              col: column[block.column] * 3 + ((cell.position - 1) % 3),
            },
          ]
        : [],
    ),
  )
}

const reading = (a: NavCell, b: NavCell) => a.row - b.row || a.col - b.col

/**
 * Where an arrow key, Home or End moves focus from `currentId`, or undefined
 * when it goes nowhere (the edges do not wrap). Up and Down take the nearest
 * column of the next row that has an endpoint.
 */
export function moveFocus(
  cells: readonly NavCell[],
  currentId: string,
  key: string,
): string | undefined {
  const ordered = [...cells].sort(reading)
  if (key === 'Home') return ordered[0]?.id
  if (key === 'End') return ordered[ordered.length - 1]?.id
  const cur = cells.find((c) => c.id === currentId)
  if (!cur) return undefined
  if (key === 'ArrowRight')
    return cells
      .filter((c) => c.row === cur.row && c.col > cur.col)
      .sort((a, b) => a.col - b.col)[0]?.id
  if (key === 'ArrowLeft')
    return cells
      .filter((c) => c.row === cur.row && c.col < cur.col)
      .sort((a, b) => b.col - a.col)[0]?.id
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return undefined
  const step = key === 'ArrowDown' ? 1 : -1
  const rows = [...new Set(cells.map((c) => c.row))]
    .filter((r) => (r - cur.row) * step > 0)
    .sort((a, b) => (a - b) * step)
  if (rows.length === 0) return undefined
  return cells
    .filter((c) => c.row === rows[0])
    .sort(
      (a, b) =>
        Math.abs(a.col - cur.col) - Math.abs(b.col - cur.col) || a.col - b.col,
    )[0]?.id
}
