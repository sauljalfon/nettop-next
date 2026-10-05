/** Distance between the midpoints of neighbouring split lines: more than a cable-ID label is tall. */
export const SPLIT_GAP = 24

/**
 * Path of one of `count` split lines between two handles. Every line starts and
 * ends exactly on the handles; only its middle is pushed away from the straight
 * line, so the lines fan out and meet again. The midpoints are `gap` apart and
 * symmetric around the straight line. Returns the path and its midpoint (the
 * label position).
 */
export function splitPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  index: number,
  count: number,
  gap: number = SPLIT_GAP,
): [path: string, labelX: number, labelY: number] {
  const push = (index - (count - 1) / 2) * gap
  // A cubic's midpoint sits 3/4 of its control points' offset from the chord.
  const control = push / 0.75
  const dx = (targetX - sourceX) / 3
  const path =
    `M${sourceX},${sourceY} ` +
    `C${sourceX + dx},${sourceY + control} ` +
    `${targetX - dx},${targetY + control} ${targetX},${targetY}`
  return [path, (sourceX + targetX) / 2, (sourceY + targetY) / 2 + push]
}
