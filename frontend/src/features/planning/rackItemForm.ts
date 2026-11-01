import {
  defaultRackItemHeight,
  suggestedRackItemName,
} from '../../shared/rackItems'
import type { RackItemType } from '../../shared/types'
import type { SiteBranch } from '../patching/patching'
import type { EditCommand } from './editing'

/** What the Rack item form holds; the numbers stay text until the form is checked. */
export interface RackItemValues {
  type: RackItemType
  itemText: string
  rackId: string
  unit: string
  height: string
  name: string
  /** Once the user types a height, the type no longer changes it. */
  heightEdited: boolean
  /** Once the user types a name, the suggestion no longer changes it. */
  nameEdited: boolean
}

/** The node and rack names of the chosen rack, for the suggested name. */
export interface RackItemPlace {
  nodeName: string
  rackName: string
}

/** The node and rack names of a rack in the location tree ('' when it is not there). */
export function placeOf(
  tree: readonly SiteBranch[],
  rackId: string,
): RackItemPlace {
  for (const site of tree)
    for (const node of site.nodes) {
      const rack = node.racks.find((r) => r.id === rackId)
      if (rack) return { nodeName: node.name, rackName: rack.name }
    }
  return { nodeName: '', rackName: '' }
}

/** Every equipment name in the tree, lower-cased: the names a new one may not take. */
export const takenNames = (tree: readonly SiteBranch[]): Set<string> =>
  new Set(
    tree.flatMap((s) =>
      s.nodes.flatMap((n) =>
        n.racks.flatMap((r) => r.equipment.map((e) => e.name.toLowerCase())),
      ),
    ),
  )

export const initialRackItemValues = (initial?: {
  rackId?: string
  unit?: number
}): RackItemValues => ({
  type: 'shelf',
  itemText: '',
  rackId: initial?.rackId ?? '',
  unit: String(initial?.unit ?? 1),
  height: String(defaultRackItemHeight('shelf')),
  name: '',
  heightEdited: false,
  nameEdited: false,
})

/** The suggested name for these values; `taken` compares ignoring case. */
export const nameFor = (
  v: RackItemValues,
  place: RackItemPlace,
  taken: (name: string) => boolean,
) =>
  suggestedRackItemName(
    {
      type: v.type,
      text: v.itemText,
      nodeName: place.nodeName,
      rackName: place.rackName,
      unit: Number(v.unit) || 0,
    },
    taken,
  )

/**
 * The values after the user changed some fields: the height follows the type,
 * and the name follows type, text, rack and unit, each until the user edits it.
 */
export function withEdit(
  v: RackItemValues,
  patch: Partial<
    Pick<
      RackItemValues,
      'type' | 'itemText' | 'rackId' | 'unit' | 'height' | 'name'
    >
  >,
  place: RackItemPlace,
  taken: (name: string) => boolean,
): RackItemValues {
  const next: RackItemValues = {
    ...v,
    ...patch,
    heightEdited: v.heightEdited || patch.height !== undefined,
    nameEdited: v.nameEdited || patch.name !== undefined,
  }
  if (!next.heightEdited) next.height = String(defaultRackItemHeight(next.type))
  if (!next.nameEdited) next.name = nameFor(next, place, taken)
  return next
}

export interface CheckedRackItem {
  name: string
  unit: number
  height: number
  /** Only an Other has one. */
  itemText: string | undefined
}

const whole = (t: string) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : NaN)

/** What the form checks before sending; the server judges the rest in its own words. */
export function checkRackItemForm(
  v: RackItemValues,
): CheckedRackItem | { error: string } {
  const unit = whole(v.unit)
  const height = whole(v.height)
  const text = v.itemText.trim()
  if (!v.rackId) return { error: 'Choose a rack.' }
  if (!(unit >= 1)) return { error: 'Unit must be 1 or more.' }
  if (!(height >= 1 && height <= 100))
    return { error: 'Height must be 1 to 100.' }
  if (v.type === 'other' && ([...text].length < 1 || [...text].length > 100))
    return { error: 'Say what it is: an Other needs a short text.' }
  if (!v.name.trim()) return { error: 'A name is required.' }
  return {
    name: v.name.trim(),
    unit,
    height,
    itemText: v.type === 'other' ? text : undefined,
  }
}

/** The one add_equipment of a rack item: no ports and no network. */
export function buildRackItemCommand(
  v: RackItemValues,
  checked: CheckedRackItem,
): Extract<EditCommand, { type: 'add_equipment' }> {
  return {
    type: 'add_equipment',
    equipment: {
      kind: 'rack_item',
      role: 'none',
      name: checked.name,
      rackId: v.rackId,
      unit: checked.unit,
      height: checked.height,
      details: {
        itemType: v.type,
        ...(checked.itemText !== undefined && { itemText: checked.itemText }),
      },
    },
  }
}
