import type { Equipment, RackItemType } from './types'
import type { TextPiece } from './textPieces'

export const RACK_ITEM_TYPES: readonly RackItemType[] = [
  'ups',
  'pdu',
  'shelf',
  'cable-manager',
  'other',
]

const LABEL: Record<RackItemType, string> = {
  ups: 'UPS',
  pdu: 'PDU',
  shelf: 'Shelf',
  'cable-manager': 'Cable manager',
  other: 'Other',
}

export const rackItemTypeLabel = (t: RackItemType): string => LABEL[t]

/** A UPS is 2U; the rest are 1U. Only the form's starting height: the server takes any 1–100. */
export const defaultRackItemHeight = (t: RackItemType): number =>
  t === 'ups' ? 2 : 1

/**
 * The type as pieces: "UPS", or for an Other "Other · " and its text as a name
 * piece (user text, possibly Hebrew, never joined into a string).
 */
export function rackItemPieces(
  e: Pick<Equipment, 'itemType' | 'itemText'>,
): TextPiece[] {
  if (!e.itemType) return []
  if (e.itemType === 'other' && e.itemText)
    return [{ text: 'Other · ' }, { name: e.itemText }]
  return [{ text: LABEL[e.itemType] }]
}

const MAX_NAME = 100

/**
 * The form's starting name: "<type> <node> <rack> U<unit>" ("Cable manager
 * Building A Rack A03 U10"); an Other uses its text instead of "Other". Over
 * 100 characters the node is left out; a taken name gets " 2", " 3"… `taken`
 * decides what is taken (the caller compares ignoring case).
 */
export function suggestedRackItemName(
  input: {
    type: RackItemType
    text?: string
    nodeName: string
    rackName: string
    unit: number
  },
  taken: (name: string) => boolean,
): string {
  const what =
    (input.type === 'other' && input.text?.trim()) || LABEL[input.type]
  const full = `${what} ${input.nodeName} ${input.rackName} U${input.unit}`
  const base =
    [...full].length > MAX_NAME
      ? `${what} ${input.rackName} U${input.unit}`
      : full
  if (!taken(base)) return base
  for (let n = 2; ; n++) if (!taken(`${base} ${n}`)) return `${base} ${n}`
}
