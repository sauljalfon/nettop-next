/** Band counts a tall plate may try: 1, plus each of 2, 3, 4, 6, 8 that is at most half the rows. */
export function bandCounts(rows: number): number[] {
  return [1, 2, 3, 4, 6, 8].filter((b) => b === 1 || b <= rows / 2)
}

/**
 * The row numbers, highest first, split into runs of ceil(rows / bands). Band 1
 * holds the highest rows; the last may be shorter. Never an empty band: when
 * the runs run out first, fewer bands come back.
 */
export function bandRows(rows: number, bands: number): number[][] {
  const per = Math.ceil(rows / Math.max(1, bands))
  const out: number[][] = []
  for (let top = rows; top >= 1; top -= per) {
    const run: number[] = []
    for (let r = top; r > Math.max(0, top - per); r--) run.push(r)
    out.push(run)
  }
  return out
}

/** A plate measured with a 20px and a 40px jack (its size is linear in the jack). */
export interface FitTrial {
  bands: number
  w20: number
  h20: number
  w40: number
  h40: number
}

/** The biggest jack for one dimension; Infinity when the plate did not grow (degenerate measure). */
function jackFor(room: number, at20: number, at40: number): number {
  const slope = (at40 - at20) / 20
  if (!(slope > 0)) return Infinity
  return (room - (at20 - 20 * slope)) / slope
}

/**
 * Pick the band count and jack size. Per trial the jack is
 * min(jw, max, max(min(jh, jw), readable)): never wider than the room, never
 * above max, and when the height would make the jacks tiny keep them readable
 * (page scrolls instead) but still never past the width. Trials are taken in
 * order (fewest bands first); a later one wins only when its jack is bigger by
 * more than 0.5px. When the winner is held at the readable floor (the height
 * would give less), the trials that reach the same jack compete on the plate's
 * height instead, so the page scrolls as little as it can. A dimension whose
 * plate did not grow is unconstrained. No trials: 1 band at max. The jack is
 * floored.
 */
export function chooseFit(
  trials: FitTrial[],
  room: { w: number; h: number },
  max: number,
  readable = 18,
): { bands: number; jack: number } {
  const sized = trials.map((t) => {
    const jw = jackFor(room.w, t.w20, t.w40)
    const jh = jackFor(room.h, t.h20, t.h40)
    const jack = Math.min(jw, max, Math.max(Math.min(jh, jw), readable))
    // The plate's height at this jack (it is linear in the jack).
    const height = t.h20 + ((jack - 20) * (t.h40 - t.h20)) / 20
    return { bands: t.bands, jack, floored: jh < jack, height }
  })
  let best: (typeof sized)[number] | undefined
  for (const s of sized) if (!best || s.jack > best.jack + 0.5) best = s
  if (!best) return { bands: 1, jack: Math.floor(max) }
  if (best.floored) {
    for (const s of sized)
      if (s.floored && s.jack >= best.jack - 0.5 && s.height < best.height)
        best = s
  }
  return { bands: best.bands, jack: Math.floor(best.jack) }
}

/**
 * The band counts worth measuring for an HDF of `rows` rows: `bandCounts`
 * without the ones that draw the same bands as an earlier one (9 rows asked in
 * 4 bands give 3, the same as asking for 3).
 */
export function trialBands(rows: number): number[] {
  const seen = new Set<number>()
  return bandCounts(rows).filter((b) => {
    const drawn = bandRows(rows, b).length
    if (seen.has(drawn)) return false
    seen.add(drawn)
    return true
  })
}

/** The right side of an HDF's plate head: the side, and when banded where the rows run. */
export function hdfHead(side: string, rows: number, bands: number): string {
  return bands > 1 ? `${side} · rows ${rows}–1, left to right` : side
}
