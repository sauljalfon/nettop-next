import { describe, expect, it } from 'vitest'
import {
  close,
  detailsGone,
  detailsShown,
  dockSession,
  forContext,
  initialDock,
  openTab,
  railClick,
  tabsFor,
  type DockState,
} from './dock'

const open = (tab: DockState['tab']): DockState => ({
  open: true,
  tab,
  last: tab,
})

describe('dock transitions', () => {
  it('a rail click opens that tab', () => {
    expect(railClick(initialDock, 'explore')).toMatchObject({
      open: true,
      tab: 'explore',
    })
  })
  it('the same rail icon twice closes, another switches', () => {
    const once = railClick(initialDock, 'trace')
    expect(railClick(once, 'trace').open).toBe(false)
    expect(railClick(once, 'inspector')).toMatchObject({
      open: true,
      tab: 'inspector',
    })
  })
  it('openTab opens and close closes', () => {
    const s = openTab(initialDock, 'changes')
    expect(s).toMatchObject({ open: true, tab: 'changes' })
    expect(close(s).open).toBe(false)
  })
  it('details open the dock on the details tab', () => {
    const s = detailsShown(initialDock, 'Node')
    expect(s).toMatchObject({ open: true, tab: 'details', details: 'Node' })
    expect(tabsFor(s, false)[0]).toBe('details')
  })
  it('details gone returns to the last other tab', () => {
    const s = detailsShown(openTab(initialDock, 'explore'), 'Port')
    const gone = detailsGone(s)
    expect(gone).toMatchObject({ open: true, tab: 'explore' })
    expect(gone.details).toBeUndefined()
  })
  it('details gone with no other tab closes the dock', () => {
    const gone = detailsGone(detailsShown(initialDock, 'Node'))
    expect(gone.open).toBe(false)
    expect(gone.details).toBeUndefined()
  })
  it('details gone while on another tab only removes the tab', () => {
    const s = openTab(detailsShown(initialDock, 'Node'), 'trace')
    expect(detailsGone(s)).toMatchObject({ open: true, tab: 'trace' })
    expect(tabsFor(detailsGone(s), false)).not.toContain('details')
  })
  it('Installed turns Add into Changes', () => {
    expect(forContext(open('add'), false)).toMatchObject({
      open: true,
      tab: 'changes',
    })
    expect(forContext(open('add'), true).tab).toBe('add')
  })
  it('tabs come in order, Add only in a plan, Networks only while open', () => {
    expect(tabsFor(initialDock, false)).toEqual([
      'inspector',
      'trace',
      'explore',
      'changes',
    ])
    expect(tabsFor(initialDock, true)).toEqual([
      'inspector',
      'trace',
      'explore',
      'add',
      'changes',
    ])
    expect(tabsFor(detailsShown(open('networks'), 'Node'), true)).toEqual([
      'details',
      'inspector',
      'trace',
      'explore',
      'add',
      'changes',
    ])
    expect(tabsFor(open('networks'), false).at(-1)).toBe('networks')
  })
})

describe('dockSession', () => {
  it('notifies, and sends Add to Changes outside a plan', () => {
    dockSession.reset()
    let calls = 0
    const off = dockSession.subscribe(() => calls++)
    dockSession.rail('add')
    expect(dockSession.get()).toMatchObject({ open: true, tab: 'changes' })
    dockSession.setPlanned(true)
    dockSession.open('add')
    expect(dockSession.get().tab).toBe('add')
    dockSession.setPlanned(false)
    expect(dockSession.get().tab).toBe('changes')
    dockSession.close()
    expect(dockSession.get().open).toBe(false)
    expect(calls).toBeGreaterThan(3)
    off()
  })
})
