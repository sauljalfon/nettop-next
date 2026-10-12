import { describe, expect, it } from 'vitest'
import {
  checkGroups,
  emptyRow,
  groupSummary,
  rowsFromCount,
  type GroupRow,
} from './portGroups'

const row = (p: Partial<GroupRow>): GroupRow => ({ ...emptyRow(), ...p })
const gi = row({
  count: '24',
  names: 'Gi1/0/{n}',
  portType: 'copper',
  connector: 'RJ45',
  speed: '1G',
})
const te = row({
  count: '4',
  names: 'Te1/1/{n}',
  portType: 'fiber',
  connector: 'SFP+',
  speed: '10G',
})

describe('PG-06 the Add form: port group rows', () => {
  it('builds the groups the server takes, with details only where given', () => {
    expect(checkGroups([gi, te])).toEqual({
      groups: [
        {
          count: 24,
          names: 'Gi1/0/{n}',
          details: { portType: 'copper', connector: 'RJ45', speed: '1G' },
        },
        {
          count: 4,
          names: 'Te1/1/{n}',
          details: { portType: 'fiber', connector: 'SFP+', speed: '10G' },
        },
      ],
    })
    expect(checkGroups([row({ count: '2', names: ' Eth{n} ' })])).toEqual({
      groups: [{ count: 2, names: 'Eth{n}' }],
    })
  })

  it('says in one line what the ports will be called', () => {
    expect(groupSummary([gi, te])).toBe(
      '28 ports: Gi1/0/1 … Gi1/0/24, Te1/1/1 … Te1/1/4',
    )
    expect(groupSummary([row({ count: '1', names: 'Mgmt{n}' })])).toBe(
      '1 port: Mgmt1',
    )
    expect(groupSummary([row({ count: '2', names: 'Eth{n}' }), te])).toBe(
      '6 ports: Eth1, Eth2, Te1/1/1 … Te1/1/4',
    )
  })

  it('leaves a row that is not valid yet out of the summary', () => {
    expect(groupSummary([gi, row({ count: '4', names: 'no number' })])).toBe(
      '24 ports: Gi1/0/1 … Gi1/0/24',
    )
    expect(groupSummary([row({ count: '', names: '' })])).toBe('')
  })

  it('refuses what the server would, before sending, in words', () => {
    const error = (rows: GroupRow[]) =>
      (checkGroups(rows) as { error: string }).error
    expect(error([])).toBe('Add at least one port group.')
    expect(error([row({ count: '0', names: 'A{n}' })])).toBe(
      'Port group 1: Count must be at least 1.',
    )
    expect(error([gi, row({ count: '4', names: 'Te1/1/' })])).toBe(
      'Port group 2: Names must contain {n} once.',
    )
    expect(error([row({ count: '2', names: '{n}/{n}' })])).toBe(
      'Port group 1: Names must contain {n} once.',
    )
    expect(
      error([
        row({ count: '90', names: 'A{n}' }),
        row({ count: '7', names: 'B{n}' }),
      ]),
    ).toBe('A switch has 1–96 ports, not 97.')
    expect(
      error(
        Array.from({ length: 9 }, (_, i) =>
          row({ count: '1', names: `G${i}-{n}` }),
        ),
      ),
    ).toBe('A switch has 1–8 port groups, not 9.')
    expect(
      error([
        row({ count: '2', names: 'Gi{n}' }),
        row({ count: '1', names: 'GI{n}' }),
      ]),
    ).toBe('Port name "GI1" is used twice.')
    expect(error([row({ count: '1', names: 'x'.repeat(64) + '{n}' })])).toMatch(
      /is longer than 64 characters/,
    )
  })

  it('starts group mode from the plain Ports count: the same ports as one group, plus an empty one', () => {
    expect(rowsFromCount('24')).toEqual([
      row({ count: '24', names: 'Port {n}' }),
      emptyRow(),
    ])
    expect(groupSummary(rowsFromCount('24'))).toBe('24 ports: Port 1 … Port 24')
  })
})
