import { describe, expect, it } from 'vitest'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import {
  activeDeviceCounts,
  MANAGE_NETWORKS,
  validateNetworkName,
} from './model'

const networks = [
  { id: 'a', name: 'Network A' },
  { id: 'b', name: 'Network B' },
]

describe('NET-04 the drawer lists each network with its active-device count', () => {
  it('counts active devices per network, never passive equipment', () => {
    const counts = activeDeviceCounts(acceptanceSnapshot())
    expect(counts.get('A')).toBe(5) // EDGE-17, AGG-03, AGG-08, AGG-15, BB-01
    expect(counts.get('B')).toBe(2) // EDGE-22, AGG-12
    expect(counts.size).toBe(2)
  })

  it('a network with no devices has no entry (read it as 0)', () => {
    const s = acceptanceSnapshot()
    s.networks = [...s.networks, { id: 'C', name: 'Network C' }]
    expect(activeDeviceCounts(s).get('C') ?? 0).toBe(0)
  })

  it('the selector entry value cannot be a network ID', () => {
    expect(MANAGE_NETWORKS).toMatch(/^\W/)
  })
})

describe('NET-03 name validation mirrors the server rules', () => {
  it('accepts a new name and trims it', () => {
    expect(validateNetworkName('  Network C ', networks)).toBeUndefined()
  })

  it('rejects empty and blank names', () => {
    expect(validateNetworkName('', networks)).toBe('Enter a name.')
    expect(validateNetworkName('   ', networks)).toBe('Enter a name.')
  })

  it('counts characters, not bytes: 64 fit, 65 do not', () => {
    expect(validateNetworkName('é'.repeat(64), networks)).toBeUndefined()
    expect(validateNetworkName('é'.repeat(65), networks)).toBe(
      'Use 64 characters or fewer.',
    )
    expect(validateNetworkName('😀'.repeat(64), networks)).toBeUndefined()
  })

  it('rejects a name another network uses, ignoring case and spaces', () => {
    expect(validateNetworkName(' network a', networks)).toBe(
      '“network a” is already used by another network.',
    )
  })

  it('lets a network keep its own name or change only its case', () => {
    expect(validateNetworkName('Network A', networks, 'a')).toBeUndefined()
    expect(validateNetworkName('NETWORK A', networks, 'a')).toBeUndefined()
    expect(validateNetworkName('Network B', networks, 'a')).toBe(
      '“Network B” is already used by another network.',
    )
  })
})
