import { describe, expect, it } from 'vitest'
import {
  buildRackItemCommand,
  checkRackItemForm,
  initialRackItemValues,
  nameFor,
  placeOf,
  takenNames,
  withEdit,
  type RackItemValues,
} from './rackItemForm'

const place = { nodeName: 'Building A', rackName: 'Rack A03' }
const none = () => false
const start = (): RackItemValues =>
  initialRackItemValues({ rackId: 'rack-a03', unit: 3 })

describe('RI-08 the form follows until edited', () => {
  it('starts as a Shelf of 1U in the rack and unit given', () => {
    expect(start()).toMatchObject({
      type: 'shelf',
      rackId: 'rack-a03',
      unit: '3',
      height: '1',
      itemText: '',
      heightEdited: false,
      nameEdited: false,
    })
  })

  it('makes the default height follow the type until the height is edited', () => {
    let v = withEdit(start(), { type: 'ups' }, place, none)
    expect(v.height).toBe('2')
    v = withEdit(v, { height: '4' }, place, none)
    v = withEdit(v, { type: 'pdu' }, place, none)
    expect(v.height).toBe('4')
  })

  it('makes the name follow type, text, rack and unit until the name is edited', () => {
    let v = withEdit(start(), {}, place, none)
    expect(v.name).toBe('Shelf Building A Rack A03 U3')
    v = withEdit(v, { type: 'other', itemText: 'KVM switch' }, place, none)
    expect(v.name).toBe('KVM switch Building A Rack A03 U3')
    v = withEdit(v, { unit: '7' }, place, none)
    expect(v.name).toBe('KVM switch Building A Rack A03 U7')
    v = withEdit(v, { name: 'My KVM' }, place, none)
    v = withEdit(v, { unit: '8', itemText: 'x' }, place, none)
    expect(v.name).toBe('My KVM')
  })

  it('suggests a free name when the first is taken', () => {
    const taken = (n: string) => n === 'shelf building a rack a03 u3'
    expect(nameFor(start(), place, (n) => taken(n.toLowerCase()))).toBe(
      'Shelf Building A Rack A03 U3 2',
    )
  })
})

describe('RI-08 the checks, with their exact texts', () => {
  const ok = (): RackItemValues => ({ ...start(), name: 'Shelf 1' })

  it('accepts a complete form', () => {
    expect(checkRackItemForm(ok())).toEqual({
      name: 'Shelf 1',
      unit: 3,
      height: 1,
      itemText: undefined,
    })
  })

  it('refuses each missing piece', () => {
    expect(checkRackItemForm({ ...ok(), rackId: '' })).toEqual({
      error: 'Choose a rack.',
    })
    expect(checkRackItemForm({ ...ok(), unit: '0' })).toEqual({
      error: 'Unit must be 1 or more.',
    })
    expect(checkRackItemForm({ ...ok(), name: '  ' })).toEqual({
      error: 'A name is required.',
    })
  })

  it('leaves a high unit to the server and says the height range', () => {
    expect(checkRackItemForm({ ...ok(), unit: '150' })).toMatchObject({
      unit: 150,
    })
    expect(checkRackItemForm({ ...ok(), height: '0' })).toEqual({
      error: 'Height must be 1 to 100.',
    })
    expect(checkRackItemForm({ ...ok(), height: '101' })).toEqual({
      error: 'Height must be 1 to 100.',
    })
  })

  it('needs a text for an Other, trimmed, at most 100 characters', () => {
    const other = { ...ok(), type: 'other' as const }
    const say = { error: 'Say what it is: an Other needs a short text.' }
    expect(checkRackItemForm(other)).toEqual(say)
    expect(checkRackItemForm({ ...other, itemText: '   ' })).toEqual(say)
    expect(checkRackItemForm({ ...other, itemText: 'x'.repeat(101) })).toEqual(
      say,
    )
    expect(checkRackItemForm({ ...other, itemText: ' KVM ' })).toMatchObject({
      itemText: 'KVM',
    })
  })

  it('drops a text typed before the type was changed back from Other', () => {
    expect(
      checkRackItemForm({ ...ok(), type: 'ups', itemText: 'stale' }),
    ).toMatchObject({ itemText: undefined })
  })
})

describe('RI-08 the command', () => {
  it('is exactly one add_equipment without portCount or networkId', () => {
    const v = { ...start(), type: 'ups' as const, height: '2', name: 'UPS 1' }
    const checked = checkRackItemForm(v)
    if ('error' in checked) throw new Error(checked.error)
    expect(buildRackItemCommand(v, checked)).toEqual({
      type: 'add_equipment',
      equipment: {
        kind: 'rack_item',
        role: 'none',
        name: 'UPS 1',
        rackId: 'rack-a03',
        unit: 3,
        height: 2,
        details: { itemType: 'ups' },
      },
    })
  })

  it('carries an Other’s text in the details', () => {
    const v = {
      ...start(),
      type: 'other' as const,
      itemText: ' KVM switch ',
      name: 'KVM 1',
    }
    const checked = checkRackItemForm(v)
    if ('error' in checked) throw new Error(checked.error)
    const command = buildRackItemCommand(v, checked)
    expect(command.equipment).not.toHaveProperty('portCount')
    expect(command.equipment).not.toHaveProperty('networkId')
    expect(command.equipment.details).toEqual({
      itemType: 'other',
      itemText: 'KVM switch',
    })
  })
})

describe('RI-08 the place and the taken names come from the location tree', () => {
  const tree = [
    {
      id: 's',
      name: 'Campus',
      nodes: [
        {
          id: 'n',
          name: 'Building A',
          racks: [
            {
              id: 'rack-a03',
              name: 'Rack A03',
              units: 12,
              equipment: [
                { id: 'e', name: 'EDGE-17', kind: 'switch' as const },
              ],
            },
          ],
        },
      ],
    },
  ]

  it('finds the node and rack names of a rack, and nothing for an unknown one', () => {
    expect(placeOf(tree, 'rack-a03')).toEqual({
      nodeName: 'Building A',
      rackName: 'Rack A03',
    })
    expect(placeOf(tree, 'gone')).toEqual({ nodeName: '', rackName: '' })
  })

  it('lists every equipment name lower-cased', () => {
    expect(takenNames(tree)).toEqual(new Set(['edge-17']))
  })
})
