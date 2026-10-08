import { describe, expect, it } from 'vitest'
import { indexSnapshot } from '../map/snapshotIndex'
import { physicalSnapshot, withFullHdf } from './testFixture'
import { hdfFace, panelFace, switchBank } from './faces'
import { moveFocus, navCells } from './faceNav'

const s = withFullHdf(physicalSnapshot(), 'HDF-01', 4)
const index = indexSnapshot(s)

describe('PB-03 arrow keys follow the visual layout', () => {
  describe('a switch: ports 1,3,5… on top and 2,4,6… below', () => {
    const cells = navCells({
      kind: 'switch',
      rows: switchBank(index, 'EDGE-17').rows,
    })
    const from = (id: string, key: string) =>
      moveFocus(cells, `EDGE-17:p${id}`, key)

    it('places odd ports on the top row and even below, one column per pair', () => {
      const at = (n: number) => cells.find((c) => c.id === `EDGE-17:p${n}`)!
      expect(at(1)).toMatchObject({ row: 0, col: 0 })
      expect(at(2)).toMatchObject({ row: 1, col: 0 })
      expect(at(3)).toMatchObject({ row: 0, col: 1 })
      expect(at(24)).toMatchObject({ row: 1, col: 11 })
    })

    it('Right and Left move along a row; Down and Up between the two', () => {
      expect(from('1', 'ArrowRight')).toBe('EDGE-17:p3')
      expect(from('2', 'ArrowRight')).toBe('EDGE-17:p4')
      expect(from('3', 'ArrowLeft')).toBe('EDGE-17:p1')
      expect(from('3', 'ArrowDown')).toBe('EDGE-17:p4')
      expect(from('4', 'ArrowUp')).toBe('EDGE-17:p3')
    })

    it('stops at the edges instead of wrapping', () => {
      expect(from('1', 'ArrowLeft')).toBeUndefined()
      expect(from('1', 'ArrowUp')).toBeUndefined()
      expect(from('2', 'ArrowDown')).toBeUndefined()
      expect(from('23', 'ArrowRight')).toBeUndefined()
    })

    it('Home is the first port, End the last', () => {
      expect(from('9', 'Home')).toBe('EDGE-17:p1')
      expect(from('9', 'End')).toBe('EDGE-17:p24')
    })
  })

  describe('a panel: rows of 12', () => {
    const cells = navCells({
      kind: 'panel',
      face: panelFace(index, 'PANEL-A', 'front'),
    })
    it('Down from position 3 is position 15', () => {
      expect(moveFocus(cells, 'PANEL-A:3:f', 'ArrowDown')).toBe('PANEL-A:15:f')
      expect(moveFocus(cells, 'PANEL-A:12:f', 'ArrowRight')).toBeUndefined()
      expect(moveFocus(cells, 'PANEL-A:13:f', 'Home')).toBe('PANEL-A:1:f')
      expect(moveFocus(cells, 'PANEL-A:1:f', 'End')).toBe('PANEL-A:24:f')
    })
  })

  describe('an HDF: across blocks, three positions wide and two high', () => {
    const cells = navCells({
      kind: 'hdf',
      face: hdfFace(index, 'HDF-01', 'front'),
    })
    const id = (block: string, n: number) => `HDF-01:${block}/${n}:f`
    const move = (block: string, n: number, key: string) =>
      moveFocus(cells, id(block, n), key)

    it('Right from a block’s third position enters the next block', () => {
      expect(move('1A', 3, 'ArrowRight')).toBe(id('1B', 1))
      expect(move('1A', 6, 'ArrowRight')).toBe(id('1B', 4))
      expect(move('1D', 3, 'ArrowRight')).toBeUndefined()
      expect(move('1B', 1, 'ArrowLeft')).toBe(id('1A', 3))
    })

    it('Down goes from the first row of positions to the second, then to the next block row', () => {
      expect(move('1A', 3, 'ArrowDown')).toBe(id('1A', 6))
      expect(move('1A', 6, 'ArrowDown')).toBe(id('2A', 3))
      expect(move('2A', 3, 'ArrowUp')).toBe(id('1A', 6))
      expect(move('4D', 6, 'ArrowDown')).toBeUndefined()
    })

    it('Home and End are the first and the last position of the grid', () => {
      expect(move('3C', 5, 'Home')).toBe(id('1A', 1))
      expect(move('3C', 5, 'End')).toBe(id('4D', 6))
    })

    it('skips positions that have no endpoint', () => {
      const bare = navCells({
        kind: 'hdf',
        face: hdfFace(indexSnapshot(physicalSnapshot()), 'HDF-02', 'front'),
      })
      // HDF-02 in the acceptance snapshot has only some blocks: the cells exist only where there are endpoints.
      expect(bare.every((c) => c.id)).toBe(true)
      expect(bare.length).toBeLessThan(72)
    })
  })

  it('an unknown current endpoint moves nowhere, except Home and End', () => {
    const cells = navCells({
      kind: 'switch',
      rows: switchBank(index, 'EDGE-17').rows,
    })
    expect(moveFocus(cells, 'nope', 'ArrowRight')).toBeUndefined()
    expect(moveFocus(cells, 'nope', 'Home')).toBe('EDGE-17:p1')
    expect(moveFocus(cells, 'nope', 'x')).toBeUndefined()
  })
})
