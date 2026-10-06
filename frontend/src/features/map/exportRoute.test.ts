import { describe, expect, it } from 'vitest'
import {
  EXPORT,
  captureLayout,
  exportFileName,
  exportHeader,
  pdfText,
} from './exportRoute'

describe('POL-29 the header', () => {
  const base = {
    start: 'EDGE-17 · Port 1',
    end: 'AGG-03 · Port 1',
    mode: 'distribution' as const,
    networkName: 'Network A',
    date: '2026-10-06',
  }

  it('names start → end, the mode, the network, Installed and the date', () => {
    expect(exportHeader(base)).toEqual({
      title: 'EDGE-17 · Port 1 → AGG-03 · Port 1',
      lines: ['Find AGG / BB · Network A', 'Installed · 2026-10-06'],
    })
  })

  it('says Proposed with the plan name in a plan', () => {
    expect(exportHeader({ ...base, plan: 'Expansion' }).lines[1]).toBe(
      'Proposed: Expansion · 2026-10-06',
    )
  })

  it('names the exact port → port mode', () => {
    expect(exportHeader({ ...base, mode: 'point_to_point' }).lines[0]).toBe(
      'Exact port → port · Network A',
    )
  })

  it('says so when the network is unresolved', () => {
    expect(exportHeader({ ...base, networkName: undefined }).lines[0]).toBe(
      'Find AGG / BB · Network unresolved',
    )
  })

  it('has an ASCII-only text layer for the PDF', () => {
    expect(pdfText(exportHeader(base))).toEqual([
      'EDGE-17 - Port 1 -> AGG-03 - Port 1',
      'Find AGG / BB - Network A',
      'Installed - 2026-10-06',
    ])
  })
})

describe('POL-27 file names', () => {
  it('uses start and end with safe characters only', () => {
    expect(exportFileName('EDGE-17 · Port 1', 'AGG-03 · Port 1', 'png')).toBe(
      'route-EDGE-17-Port-1-AGG-03-Port-1.png',
    )
  })

  it('never leaves path separators, spaces or odd characters', () => {
    const name = exportFileName('a/b\\c', '  ../x:y*? ', 'pdf')
    expect(name).toMatch(/^route-[A-Za-z0-9-]+\.pdf$/)
    expect(name).not.toContain('..')
  })
})

describe('POL-27 capture size', () => {
  const cards = [
    { x: 0, y: 0, width: 240, height: 150 },
    { x: 1440, y: 0, width: 240, height: 190 },
  ]

  it('wraps the bounds with padding and adds the header band', () => {
    const l = captureLayout(cards)
    expect(l.width).toBe(1680 + 2 * EXPORT.padding)
    expect(l.routeHeight).toBe(190 + 2 * EXPORT.padding)
    expect(l.height).toBe(l.routeHeight + EXPORT.headerHeight)
    expect(l.headerHeight).toBe(EXPORT.headerHeight)
  })

  it('moves the route so its bounds start one padding in', () => {
    const l = captureLayout([{ x: 300, y: -52, width: 100, height: 100 }])
    expect(l.translate.y).toBe(EXPORT.padding + 52)
    // Narrow content is centered in the minimum width the header needs.
    expect(l.width).toBe(EXPORT.minWidth)
    expect(l.translate.x).toBe(
      EXPORT.padding - 300 + (EXPORT.minWidth - (100 + 2 * EXPORT.padding)) / 2,
    )
  })

  it('exports at pixel ratio 2, so the image has twice the size', () => {
    const l = captureLayout(cards)
    expect(l.ratio).toBe(2)
    expect(l.pixelWidth).toBe(l.width * 2)
    expect(l.pixelHeight).toBe(l.height * 2)
  })

  it('lowers the ratio so no side exceeds the safe maximum', () => {
    const huge = [{ x: 0, y: 0, width: 9000, height: 300 }]
    const l = captureLayout(huge)
    expect(l.ratio).toBeLessThan(2)
    expect(l.pixelWidth).toBeLessThanOrEqual(EXPORT.maxSide)
    expect(l.pixelHeight).toBeLessThanOrEqual(EXPORT.maxSide)
    // Still the same picture: the aspect ratio is kept.
    expect(l.pixelWidth / l.pixelHeight).toBeCloseTo(l.width / l.height, 1)
  })

  it('uses the outline boxes too when they are in the bounds', () => {
    const box = { x: -24, y: -52, width: 648, height: 251 }
    const withBox = captureLayout([...cards, box])
    const without = captureLayout(cards)
    expect(withBox.width).toBeGreaterThan(without.width)
    expect(withBox.routeHeight).toBeGreaterThan(without.routeHeight)
  })
})
