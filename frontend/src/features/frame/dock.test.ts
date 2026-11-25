import { describe, expect, it } from 'vitest'
import {
  close,
  detailsAvailable,
  detailsGone,
  detailsShown,
  dockSession,
  forContext,
  initialDock,
  openHistory,
  openTab,
  railClick,
  tabLabel,
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
    const once = railClick(initialDock, 'explore')
    expect(railClick(once, 'explore').open).toBe(false)
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
    const s = openTab(detailsShown(initialDock, 'Node'), 'explore')
    expect(detailsGone(s)).toMatchObject({ open: true, tab: 'explore' })
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
      'explore',
      'changes',
    ])
    expect(tabsFor(initialDock, true)).toEqual([
      'inspector',
      'explore',
      'add',
      'changes',
    ])
    expect(tabsFor(detailsShown(open('networks'), 'Node'), true)).toEqual([
      'details',
      'inspector',
      'explore',
      'add',
      'changes',
    ])
    expect(tabsFor(open('networks'), false).at(-1)).toBe('networks')
  })
})

describe('no Trace tab (D49)', () => {
  it('tabs never include trace', () => {
    for (const planned of [false, true])
      for (const state of [
        initialDock,
        open('explore'),
        detailsShown(initialDock, 'Node'),
        open('networks'),
      ])
        expect(tabsFor(state, planned)).not.toContain('trace')
  })
})

describe('the History tab (D49)', () => {
  it('opens for one equipment and is a tab only while it is the open one', () => {
    const s = openHistory(open('inspector'), 'edge-17')
    expect(s).toMatchObject({
      open: true,
      tab: 'history',
      historyFor: 'edge-17',
    })
    expect(tabsFor(s, false).at(-1)).toBe('history')
    expect(tabLabel(s, 'history')).toBe('History')
    expect(tabsFor(openTab(s, 'inspector'), false)).not.toContain('history')
    expect(tabsFor(initialDock, true)).not.toContain('history')
  })
  it('is never the tab that closing the details returns to', () => {
    const s = detailsShown(openHistory(initialDock, 'edge-17'), 'Port')
    expect(detailsGone(s).open).toBe(false)
  })
})

describe('detailsAvailable', () => {
  it('opens a closed dock on the details, and keeps another open tab', () => {
    expect(detailsAvailable(initialDock, 'Node')).toMatchObject({
      open: true,
      tab: 'details',
      details: 'Node',
    })
    // One view's details giving way to another's returns to the tab before them.
    const port = detailsShown(openTab(initialDock, 'inspector'), 'Port')
    expect(detailsAvailable(port, 'Node')).toMatchObject({
      open: true,
      tab: 'inspector',
      details: 'Node',
    })
    const explore = openTab(initialDock, 'explore')
    expect(detailsAvailable(explore, 'Port')).toMatchObject({
      open: true,
      tab: 'explore',
      details: 'Port',
    })
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

  it('closeDetails calls the feature’s close; with none, the tab just goes', () => {
    dockSession.reset()
    dockSession.rail('explore')
    dockSession.showDetails('Node')
    dockSession.closeDetails()
    expect(dockSession.get()).toMatchObject({ open: true, tab: 'explore' })
    expect(dockSession.get().details).toBeUndefined()
    let closed = 0
    dockSession.showDetails('Port')
    dockSession.setDetailsCloser(() => {
      closed++
      dockSession.hideDetails()
    })
    dockSession.closeDetails()
    expect(closed).toBe(1)
    expect(dockSession.get().tab).toBe('explore')
    dockSession.reset()
  })
})
