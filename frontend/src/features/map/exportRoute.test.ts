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
  const wide = { width: 1680, height: 190 }

  it('wraps the diagram with padding and adds the header band', () => {
    const l = captureLayout(wide)
    expect(l.width).toBe(1680 + 2 * EXPORT.padding)
    expect(l.routeHeight).toBe(190 + 2 * EXPORT.padding)
    expect(l.height).toBe(l.routeHeight + EXPORT.headerHeight)
    expect(l.headerHeight).toBe(EXPORT.headerHeight)
  })

  it('puts the diagram one padding in from the top-left of the route area', () => {
    const l = captureLayout(wide)
    expect(l.offset).toEqual({ x: EXPORT.padding, y: EXPORT.padding })
  })

  it('centers narrow content in the minimum width the header needs', () => {
    const l = captureLayout({ width: 100, height: 100 })
    expect(l.width).toBe(EXPORT.minWidth)
    expect(l.offset.x).toBe(
      EXPORT.padding + (EXPORT.minWidth - (100 + 2 * EXPORT.padding)) / 2,
    )
  })

  it('is at least as wide as the diagram, even when the page shows only part of it', () => {
    expect(captureLayout({ width: 3000, height: 300 }).width).toBeGreaterThan(
      3000,
    )
  })

  it('exports at pixel ratio 2, so the image has twice the size', () => {
    const l = captureLayout(wide)
    expect(l.ratio).toBe(2)
    expect(l.pixelWidth).toBe(l.width * 2)
    expect(l.pixelHeight).toBe(l.height * 2)
  })

  it('lowers the ratio so no side exceeds the safe maximum', () => {
    const l = captureLayout({ width: 9000, height: 300 })
    expect(l.ratio).toBeLessThan(2)
    expect(l.pixelWidth).toBeLessThanOrEqual(EXPORT.maxSide)
    expect(l.pixelHeight).toBeLessThanOrEqual(EXPORT.maxSide)
    // Still the same picture: the aspect ratio is kept.
    expect(l.pixelWidth / l.pixelHeight).toBeCloseTo(l.width / l.height, 1)
  })
})
