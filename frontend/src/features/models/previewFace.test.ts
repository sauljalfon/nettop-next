import { describe, expect, it } from 'vitest'
import { layoutPlate } from '../physical/faces'
import type { GroupRow } from '../planning/portGroups'
import { modelFace } from './previewFace'

const row = (over: Partial<GroupRow>): GroupRow => ({
  count: '48',
  names: 'Gi1/0/{n}',
  start: '1',
  portType: 'copper',
  connector: 'RJ45',
  speed: '1G',
  ...over,
})
const two = [
  row({}),
  row({
    count: '4',
    names: 'Te1/1/{n}',
    portType: 'fiber',
    connector: 'SFP+',
    speed: '10G',
  }),
]

describe('modelFace', () => {
  it('draws every port of the rows as a free jack, in rows of 12, in one bank per group', () => {
    const face = modelFace(two)
    expect(face.kind).toBe('switch')
    if (face.kind !== 'switch') return
    expect(face.rows.map((r) => r.length)).toEqual([12, 12, 12, 12, 4])
    expect(face.banks.map((b) => b.cells.length)).toEqual([48, 4])
    expect(face.banks.map((b) => b.group)).toEqual([1, 2])
    expect(face.banks[0].cells[0]).toMatchObject({
      label: 'Gi1/0/1',
      state: 'free',
      cabled: false,
    })
    expect(face.banks[1].cells[3].label).toBe('Te1/1/4')
  })

  it('captions each bank as the real faceplate does: first–last name, type, speed', () => {
    const face = modelFace(two)
    if (face.kind !== 'switch') throw new Error('not a switch')
    expect(face.banks.map((b) => b.caption)).toEqual([
      'Gi1/0/1–Gi1/0/48 · copper · 1G',
      'Te1/1/1–Te1/1/4 · fiber · 10G',
    ])
    expect(layoutPlate(face.banks).flat()).toHaveLength(3) // 48 = two blocks of 24, plus the uplinks
  })

  it('numbers names from From, and a one-port bank is captioned by its name', () => {
    const face = modelFace([row({ count: '1', names: 'Mgmt{n}', start: '0' })])
    if (face.kind !== 'switch') throw new Error('not a switch')
    expect(face.banks[0].cells[0].label).toBe('Mgmt0')
    expect(face.banks[0].caption).toBe('Mgmt0 · copper · 1G')
  })

  it('leaves out rows that are not valid yet and gives every jack its own id', () => {
    const face = modelFace([
      row({ count: '' }),
      row({ names: 'Port' }),
      row({ count: '2', names: 'P{n}' }),
    ])
    if (face.kind !== 'switch') throw new Error('not a switch')
    expect(face.banks).toHaveLength(1)
    expect(face.banks[0].group).toBe(1)
    expect(new Set(face.rows.flat().map((c) => c.endpointId)).size).toBe(2)
  })

  it('is empty with nothing typed, and stops at 96 ports', () => {
    const none = modelFace([])
    if (none.kind !== 'switch') throw new Error('not a switch')
    expect(none.banks).toEqual([])
    const big = modelFace([row({ count: '500' })])
    if (big.kind !== 'switch') throw new Error('not a switch')
    expect(big.rows.flat()).toHaveLength(96)
  })
})
