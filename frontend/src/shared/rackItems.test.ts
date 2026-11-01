import { describe, expect, it } from 'vitest'
import {
  RACK_ITEM_TYPES,
  defaultRackItemHeight,
  rackItemPieces,
  rackItemTypeLabel,
  suggestedRackItemName,
} from './rackItems'

const free = () => false
const base = {
  type: 'cable-manager' as const,
  nodeName: 'Building A',
  rackName: 'Rack A03',
  unit: 10,
}

describe('RI-07 the types', () => {
  it('lists the five types in order with their labels', () => {
    expect(RACK_ITEM_TYPES).toEqual([
      'ups',
      'pdu',
      'shelf',
      'cable-manager',
      'other',
    ])
    expect(RACK_ITEM_TYPES.map(rackItemTypeLabel)).toEqual([
      'UPS',
      'PDU',
      'Shelf',
      'Cable manager',
      'Other',
    ])
  })

  it('makes a UPS 2U and the rest 1U', () => {
    expect(defaultRackItemHeight('ups')).toBe(2)
    for (const t of ['pdu', 'shelf', 'cable-manager', 'other'] as const)
      expect(defaultRackItemHeight(t)).toBe(1)
  })

  it('reads the type as text, and an Other with its text as a name piece', () => {
    expect(rackItemPieces({ itemType: 'ups' })).toEqual([{ text: 'UPS' }])
    expect(
      rackItemPieces({ itemType: 'other', itemText: 'KVM switch' }),
    ).toEqual([{ text: 'Other · ' }, { name: 'KVM switch' }])
    expect(rackItemPieces({ itemType: 'other', itemText: 'מתג' })).toEqual([
      { text: 'Other · ' },
      { name: 'מתג' },
    ])
  })
})

describe('RI-07 the suggested name', () => {
  it('is the type, the node, the rack and the unit', () => {
    expect(suggestedRackItemName(base, free)).toBe(
      'Cable manager Building A Rack A03 U10',
    )
  })

  it("uses an Other's trimmed text instead of Other", () => {
    expect(
      suggestedRackItemName(
        { ...base, type: 'other', text: '  KVM switch ' },
        free,
      ),
    ).toBe('KVM switch Building A Rack A03 U10')
    expect(suggestedRackItemName({ ...base, type: 'other' }, free)).toBe(
      'Other Building A Rack A03 U10',
    )
  })

  it('adds 2, 3… while the name is taken, ignoring case', () => {
    const taken = new Set(
      [
        'Cable manager Building A Rack A03 U10',
        'cable manager building a rack a03 u10 2',
      ].map((n) => n.toLowerCase()),
    )
    const is = (n: string) => taken.has(n.toLowerCase())
    expect(suggestedRackItemName(base, is)).toBe(
      'Cable manager Building A Rack A03 U10 3',
    )
  })

  it('leaves the node out when the name is over 100 characters', () => {
    const long = { ...base, nodeName: 'N'.repeat(100) }
    expect(suggestedRackItemName(long, free)).toBe('Cable manager Rack A03 U10')
  })

  it('keeps a Hebrew node name as it is', () => {
    expect(suggestedRackItemName({ ...base, nodeName: 'בניין א' }, free)).toBe(
      'Cable manager בניין א Rack A03 U10',
    )
  })
})
