// "How it will look" (D51): a switch face drawn from the editor's rows, with no snapshot.
import type { FaceEndpoint, SwitchBankGroup } from '../physical/faces'
import type { Face } from '../physical/equipmentModel'
import { MAX_SWITCH_PORTS, type GroupRow } from '../planning/portGroups'

const PORTS_PER_ROW = 12
const whole = (text: string) =>
  /^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN

/**
 * The face of the rows as typed: one bank per valid row (a row that is not
 * valid yet is left out), free jacks named from the row's Names and From,
 * captioned like the real faceplate. At most 96 ports are drawn.
 */
export function modelFace(rows: readonly GroupRow[]): Face {
  const banks: SwitchBankGroup[] = []
  let total = 0
  rows.forEach((r) => {
    const count = whole(r.count)
    if (!(count >= 1) || r.names.split('{n}').length !== 2) return
    const from = whole((r.start ?? '').trim() || '1')
    const start = Number.isNaN(from) ? 1 : from
    const shown = Math.min(count, MAX_SWITCH_PORTS - total)
    if (shown < 1) return
    const cells: FaceEndpoint[] = Array.from({ length: shown }, (_, i) => ({
      endpointId: `preview-${total + i + 1}`,
      label: r.names.trim().replace('{n}', String(start + i)),
      cabled: false,
      onRoute: false,
      selected: false,
      state: 'free',
    }))
    total += shown
    const first = cells[0].label
    const range =
      cells.length === 1 ? first : `${first}–${cells[cells.length - 1].label}`
    banks.push({
      group: banks.length + 1,
      caption: [range, r.portType, r.speed.trim()].filter(Boolean).join(' · '),
      cells,
    })
  })
  const all = banks.flatMap((b) => b.cells)
  const out: FaceEndpoint[][] = []
  for (let i = 0; i < all.length; i += PORTS_PER_ROW)
    out.push(all.slice(i, i + PORTS_PER_ROW))
  return { kind: 'switch', rows: out, banks }
}
