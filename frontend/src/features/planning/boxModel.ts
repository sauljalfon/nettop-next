import {
  defaultRackItemHeight,
  suggestedRackItemName,
} from '../../shared/rackItems'
import type {
  BatchCommand,
  Equipment,
  Rack,
  RackItemType,
  SwitchModel,
} from '../../shared/types'
import {
  addSwitchCommands,
  seriesNames,
  stackUnits,
  suggestName,
} from '../models/model'
import { HDF_MAX_ROWS, parseHdfForm } from './containers'

/** What a library entry adds (D51): a switch of a model, a patch panel, an HDF or a rack item. */
export type NewItem =
  | { type: 'model'; modelId: string }
  | { type: 'panel' }
  | { type: 'hdf' }
  | { type: 'rack_item'; itemType: RackItemType }

export type SwitchRole = 'access' | 'aggregation' | 'backbone'

export const MAX_HOW_MANY = 12
export const PANEL_POSITIONS = [3, 6, 12, 24] as const
export const PANEL_MAX_POSITIONS = 48
/** The HDF the box starts with when none was added this session. */
export const DEFAULT_HDF = { rows: 12, height: 4 } as const

/** The units an equipment of this rack takes. */
export function occupiedUnits(
  equipment: readonly Equipment[],
  rackId: string,
): Set<number> {
  const taken = new Set<number>()
  for (const e of equipment)
    if (e.rackId === rackId)
      for (let i = 0; i < e.height; i++) taken.add(e.unit + i)
  return taken
}

/**
 * The top unit of the lowest run of `height` free units (the box stacks down
 * from it), or undefined when no run is free.
 */
export function firstFit(
  occupied: ReadonlySet<number>,
  rackUnits: number,
  height: number,
): number | undefined {
  for (let low = 1; low + height - 1 <= rackUnits; low++) {
    const top = low + height - 1
    if (stackUnits(occupied, rackUnits, top, height, 1)) return top
  }
  return undefined
}

/** `U10`, or `U10 down to U8` for a stack: where the devices will go. */
export function whereText(
  tops: readonly number[],
  height: number,
): string | undefined {
  if (!tops.length) return undefined
  const first = tops[0] + height - 1
  const last = tops[tops.length - 1]
  return tops.length === 1 && height === 1
    ? `U${first}`
    : `U${first} down to U${last}`
}

/** The units the new equipment will take, from each device's lowest unit. */
export const takenUnits = (lowest: readonly number[], height: number) =>
  lowest.flatMap((low) => Array.from({ length: height }, (_, i) => low + i))

export type Fit = { lowest: number[] } | { error: string }

/**
 * Where `count` devices of `height` units go, stacked down from `top`; the
 * refusal in words otherwise. `many` is false for an HDF or a rack item, which
 * have no How many: the refusal then says nothing about a count.
 */
export function boxFit(
  occupied: ReadonlySet<number>,
  rack: Pick<Rack, 'units'>,
  top: number,
  height: number,
  count: number,
  many = true,
): Fit {
  if (!Number.isInteger(count) || count < 1)
    return { error: 'How many: 1 or more.' }
  const lowest = stackUnits(occupied, rack.units, top, height, count)
  if (lowest) return { lowest }
  const room = `Not enough free units below U${top}`
  if (!many)
    return {
      error: `${room} for ${height}U. Choose a lower height or a higher unit.`,
    }
  if (count === 1)
    return { error: `${room} for ${height}U. Choose a higher unit.` }
  return {
    error: `${room} for ${count} × ${height}U. Choose fewer or a higher unit.`,
  }
}

/** The height an HDF box opens with at `top`: the wanted one, or the largest below it that fits (1 at least). */
export function startHeight(
  occupied: ReadonlySet<number>,
  rack: Pick<Rack, 'units'>,
  top: number,
  wanted: number,
): number {
  for (let h = wanted; h > 1; h--)
    if (stackUnits(occupied, rack.units, top, h, 1)) return h
  return 1
}

/** The names of the node's equipment of one kind (and role), for the next suggested name. */
export function nodeNames(
  equipment: readonly Equipment[],
  racks: readonly Rack[],
  rackId: string,
  match: (e: Equipment) => boolean,
): string[] {
  const nodeId = racks.find((r) => r.id === rackId)?.nodeId
  const inNode = new Set(
    racks.filter((r) => r.nodeId === nodeId).map((r) => r.id),
  )
  return equipment
    .filter((e) => inNode.has(e.rackId) && match(e))
    .map((e) => e.name)
}

/** The name the box starts with ('' when there is nothing to continue from). */
export function startName(
  item: NewItem,
  ctx: {
    equipment: readonly Equipment[]
    racks: readonly Rack[]
    rackId: string
    role?: SwitchRole
    nodeName?: string
    rackName?: string
    /** The lowest unit of a rack item, for its name. */
    unit?: number
    itemType?: RackItemType
    itemText?: string
  },
): string {
  const names = (match: (e: Equipment) => boolean) =>
    nodeNames(ctx.equipment, ctx.racks, ctx.rackId, match)
  if (item.type === 'model')
    return suggestName(
      names((e) => e.kind === 'switch' && e.role === (ctx.role ?? 'access')),
    )
  if (item.type === 'panel')
    return suggestName(names((e) => e.kind === 'panel'))
  if (item.type === 'hdf') return suggestName(names((e) => e.kind === 'hdf'))
  const taken = new Set(ctx.equipment.map((e) => e.name.toLowerCase()))
  return suggestedRackItemName(
    {
      type: ctx.itemType ?? item.itemType,
      text: ctx.itemText,
      nodeName: ctx.nodeName ?? '',
      rackName: ctx.rackName ?? '',
      unit: ctx.unit ?? 1,
    },
    (n) => taken.has(n.toLowerCase()),
  )
}

export { defaultRackItemHeight }

export interface BoxValues {
  name: string
  count: string
  role: SwitchRole
  networkId: string
  positions: string
  rows: string
  height: string
  /** An Other rack item: what it is. */
  itemText: string
}

const whole = (t: string) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : NaN)

/** The devices' height: a model's, 1 for a panel, what is typed for an HDF or a rack item. */
export function boxHeight(
  item: NewItem,
  model: SwitchModel | undefined,
  v: Pick<BoxValues, 'height'>,
): number {
  if (item.type === 'model') return model?.height ?? 1
  if (item.type === 'panel') return 1
  const h = whole(v.height)
  return h >= 1 ? h : 1
}

/** The number of devices: only a switch and a panel have How many. */
export const howMany = (item: NewItem, count: string): number =>
  item.type === 'model' || item.type === 'panel' ? whole(count) : 1

export interface BoxBuild {
  commands: BatchCommand[]
  names: string[]
}

/**
 * Checks what can be checked before sending (the server judges the rest in
 * its own words) and builds the commands: one add_equipment per device, or one
 * add_hdf. `top` is the highest unit of the first device.
 */
export function buildBox(input: {
  item: NewItem
  model?: SwitchModel
  rack: Pick<Rack, 'id' | 'units'>
  top: number
  occupied: ReadonlySet<number>
  /** Every equipment name, lower-cased. */
  taken: ReadonlySet<string>
  values: BoxValues
}): BoxBuild | { error: string } {
  const { item, model, rack, top, occupied, values: v } = input
  const name = v.name.trim()
  if (item.type === 'model' && !model) return { error: 'This model is gone.' }
  if (!name) return { error: 'Give it a name.' }
  if ([...name].length > 100)
    return { error: 'The name can be 100 characters at most.' }
  if (item.type === 'model' && !v.networkId)
    return { error: 'Choose its network.' }
  const count = howMany(item, v.count)
  if (item.type === 'model' || item.type === 'panel')
    if (!(count >= 1 && count <= MAX_HOW_MANY))
      return { error: `How many: 1 to ${MAX_HOW_MANY}.` }
  const positions = whole(v.positions)
  if (
    item.type === 'panel' &&
    !(positions >= 1 && positions <= PANEL_MAX_POSITIONS)
  )
    return { error: `Positions must be between 1 and ${PANEL_MAX_POSITIONS}.` }
  const height = boxHeight(item, model, v)
  if (item.type === 'hdf' || item.type === 'rack_item')
    if (!(whole(v.height) >= 1 && whole(v.height) <= 100))
      return { error: 'Height must be a whole number of units, 1 to 100.' }
  const fit = boxFit(
    occupied,
    rack,
    top,
    height,
    count,
    item.type === 'model' || item.type === 'panel',
  )
  if ('error' in fit) return fit
  const names = seriesNames(name, count)
  const clash = names.find((n) => input.taken.has(n.toLowerCase()))
  if (clash) return { error: `${clash} is already taken.` }

  if (item.type === 'model')
    return {
      names,
      commands: addSwitchCommands(
        model!,
        { rackId: rack.id, units: fit.lowest },
        names,
        v.role,
        v.networkId,
      ) as BatchCommand[],
    }
  if (item.type === 'panel')
    return {
      names,
      commands: names.map((n, i) => ({
        type: 'add_equipment' as const,
        equipment: {
          name: n,
          kind: 'panel' as const,
          role: 'passive' as const,
          rackId: rack.id,
          unit: fit.lowest[i],
          height: 1,
          portCount: positions,
        },
      })),
    }
  if (item.type === 'hdf') {
    const parsed = parseHdfForm({
      name,
      rows: v.rows,
      height: String(height),
      rackId: rack.id,
      unit: String(fit.lowest[0]),
    })
    if ('error' in parsed) return parsed
    return {
      names,
      commands: [{ type: 'add_hdf' as const, hdf: parsed.hdf }],
    }
  }
  const text = v.itemText.trim()
  if (
    item.itemType === 'other' &&
    ([...text].length < 1 || [...text].length > 100)
  )
    return { error: 'Say what it is: an Other needs a short text.' }
  return {
    names,
    commands: [
      {
        type: 'add_equipment' as const,
        equipment: {
          name,
          kind: 'rack_item' as const,
          role: 'none' as const,
          rackId: rack.id,
          unit: fit.lowest[0],
          height,
          details: {
            itemType: item.itemType,
            ...(item.itemType === 'other' && { itemText: text }),
          },
        },
      },
    ],
  }
}

export { HDF_MAX_ROWS }
