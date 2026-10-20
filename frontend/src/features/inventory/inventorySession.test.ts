import { describe, expect, it, vi } from 'vitest'
import { createInventorySession } from './inventorySession'

const key = (k: string) => ({ key: k })

describe('inventorySession', () => {
  it('starts on Equipment with the default query and hidden columns', () => {
    const s = createInventorySession()
    expect(s.getSnapshot().list).toBe('equipment')
    const q = s.getSnapshot().lists.equipment
    expect(q).toMatchObject({
      search: '',
      filters: {},
      sort: { key: 'name', dir: 1 },
      page: 1,
    })
    expect(q.group).toBeUndefined()
    expect(q.collapsed.size).toBe(0)
    expect(q.selected.size).toBe(0)
    expect([...s.getSnapshot().hidden.equipment]).toEqual([
      'manufacturer',
      'ip',
      'missing',
    ])
    expect([...s.getSnapshot().hidden.ports]).toEqual(['site', 'node'])
  })

  it('notifies subscribers with a new snapshot, and stops after unsubscribe', () => {
    const s = createInventorySession()
    const fn = vi.fn()
    const off = s.subscribe(fn)
    const before = s.getSnapshot()
    s.setSearch('agg')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(s.getSnapshot()).not.toBe(before)
    expect(s.getSnapshot().lists.equipment.search).toBe('agg')
    off()
    s.setSearch('x')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  describe('setList', () => {
    it('resets that list and keeps the hidden columns', () => {
      const s = createInventorySession()
      s.setSearch('x')
      s.setFilter('kind', ['Switch'])
      s.setList('ports')
      s.toggleColumn('ports', 'speed')
      s.setList('equipment')
      expect(s.getSnapshot().list).toBe('equipment')
      expect(s.getSnapshot().lists.equipment.search).toBe('')
      expect(s.getSnapshot().lists.equipment.filters).toEqual({})
      expect(s.getSnapshot().hidden.ports.has('speed')).toBe(true)
      s.setList('ports')
      expect(s.getSnapshot().hidden.ports.has('speed')).toBe(true)
    })

    it('resets the sort to the list default', () => {
      const s = createInventorySession()
      s.setList('ports')
      expect(s.getSnapshot().lists.ports.sort).toEqual({
        key: 'equipment',
        dir: 1,
      })
      s.setList('cables')
      expect(s.getSnapshot().lists.cables.sort).toEqual({ key: 'id', dir: 1 })
    })
  })

  // Step 3's Open in inventory also clears the header's network, so the two agree.
  it('openPorts shows the Ports list with only that equipment', () => {
    const s = createInventorySession()
    s.setSearch('x')
    s.setList('ports')
    s.setSearch('y')
    s.setHeaderNetwork('A')
    s.openPorts('AGG-03')
    const snap = s.getSnapshot()
    expect(snap.list).toBe('ports')
    expect(snap.lists.ports.filters).toEqual({ equipment: ['AGG-03'] })
    expect(snap.lists.ports.search).toBe('')
    expect(snap.lists.ports.page).toBe(1)
  })

  describe('the header network (D37)', () => {
    it('sets and clears the net filter of the current list', () => {
      const s = createInventorySession()
      expect(s.networkOfPill()).toBeUndefined()
      s.setHeaderNetwork('A')
      expect(s.getSnapshot().lists.equipment.filters.net).toEqual(['A'])
      expect(s.networkOfPill()).toBe('A')
      s.setHeaderNetwork(undefined)
      expect(s.getSnapshot().lists.equipment.filters.net).toBeUndefined()
      expect(s.networkOfPill()).toBeUndefined()
    })

    it('reads the pill: one network, none, or many', () => {
      const s = createInventorySession()
      s.setFilter('net', ['A'])
      expect(s.networkOfPill()).toBe('A')
      s.setFilter('net', ['A', 'B'])
      expect(s.networkOfPill()).toBe('many')
      s.setFilter('net', [])
      expect(s.networkOfPill()).toBeUndefined()
    })

    it('leaves the other filters and the page rule alone', () => {
      const s = createInventorySession()
      s.setFilter('kind', ['Switch'])
      s.setPage(3)
      s.setHeaderNetwork('B')
      expect(s.getSnapshot().lists.equipment.filters).toEqual({
        kind: ['Switch'],
        net: ['B'],
      })
      expect(s.getSnapshot().lists.equipment.page).toBe(1)
    })

    it('reads the current list only', () => {
      const s = createInventorySession()
      s.setFilter('net', ['A', 'B'])
      expect(s.networkOfPill()).toBe('many')
      s.setList('cables')
      expect(s.networkOfPill()).toBeUndefined()
    })

    it('a list, even the same one again, starts with the header network', () => {
      const s = createInventorySession()
      s.setHeaderNetwork('A')
      s.setFilter('kind', ['Switch'])
      s.setList('equipment')
      expect(s.getSnapshot().lists.equipment.filters).toEqual({ net: ['A'] })
      s.setList('cables')
      expect(s.getSnapshot().lists.cables.filters).toEqual({ net: ['A'] })
      s.setHeaderNetwork(undefined)
      s.setList('ports')
      expect(s.getSnapshot().lists.ports.filters).toEqual({})
    })
  })

  describe('resetFilters', () => {
    it('clears the search and every filter including the network', () => {
      const s = createInventorySession()
      s.setSearch('agg')
      s.setFilter('kind', ['Switch'])
      s.setHeaderNetwork('A')
      s.setPage(2)
      s.resetFilters()
      const q = s.getSnapshot().lists.equipment
      expect(q.search).toBe('')
      expect(q.filters).toEqual({})
      expect(q.page).toBe(1)
      expect(s.networkOfPill()).toBeUndefined()
    })

    it('keeps the sort, the group and the selection', () => {
      const s = createInventorySession()
      s.sortBy('role')
      s.setGroup('net')
      s.toggleSelected('AGG-03')
      s.resetFilters()
      const q = s.getSnapshot().lists.equipment
      expect(q.sort.key).toBe('role')
      expect(q.group).toBe('net')
      expect(q.selected.has('AGG-03')).toBe(true)
    })
  })

  describe('toggleColumn', () => {
    it('hides and shows a column', () => {
      const s = createInventorySession()
      s.toggleColumn('equipment', 'kind')
      expect(s.getSnapshot().hidden.equipment.has('kind')).toBe(true)
      s.toggleColumn('equipment', 'kind')
      expect(s.getSnapshot().hidden.equipment.has('kind')).toBe(false)
    })

    it('never hides the first column', () => {
      const s = createInventorySession()
      const before = s.getSnapshot()
      s.toggleColumn('equipment', 'name')
      expect(s.getSnapshot().hidden.equipment.has('name')).toBe(false)
      expect(s.getSnapshot()).toBe(before)
    })

    it('resets the sort when its column is hidden', () => {
      const s = createInventorySession()
      s.sortBy('role')
      s.sortBy('role')
      expect(s.getSnapshot().lists.equipment.sort).toEqual({
        key: 'role',
        dir: -1,
      })
      s.toggleColumn('equipment', 'role')
      expect(s.getSnapshot().lists.equipment.sort).toEqual({
        key: 'name',
        dir: 1,
      })
    })

    it('clears the group when its column is hidden', () => {
      const s = createInventorySession()
      s.setGroup('role')
      s.toggleColumn('equipment', 'kind')
      expect(s.getSnapshot().lists.equipment.group).toBe('role')
      s.toggleColumn('equipment', 'role')
      expect(s.getSnapshot().lists.equipment.group).toBeUndefined()
    })

    it('leaves another list alone when hiding there', () => {
      const s = createInventorySession()
      s.sortBy('role')
      s.toggleColumn('ports', 'role')
      expect(s.getSnapshot().lists.equipment.sort.key).toBe('role')
    })
  })

  describe('sort, group, page', () => {
    it('sorts ascending, flips on the same key, restarts on a new key', () => {
      const s = createInventorySession()
      s.sortBy('role')
      expect(s.getSnapshot().lists.equipment.sort).toEqual({
        key: 'role',
        dir: 1,
      })
      s.sortBy('role')
      expect(s.getSnapshot().lists.equipment.sort.dir).toBe(-1)
      s.sortBy('kind')
      expect(s.getSnapshot().lists.equipment.sort).toEqual({
        key: 'kind',
        dir: 1,
      })
    })

    it('goes back to page 1 when the search, a pill or the group changes', () => {
      const s = createInventorySession()
      s.setPage(4)
      s.setSearch('a')
      expect(s.getSnapshot().lists.equipment.page).toBe(1)
      s.setPage(4)
      s.setFilter('kind', ['Switch'])
      expect(s.getSnapshot().lists.equipment.page).toBe(1)
      s.setPage(4)
      s.setGroup('net')
      expect(s.getSnapshot().lists.equipment.page).toBe(1)
      s.setGroup(undefined)
      expect(s.getSnapshot().lists.equipment.group).toBeUndefined()
    })

    it('drops an empty pill and toggles collapsed groups', () => {
      const s = createInventorySession()
      s.setFilter('kind', ['Switch'])
      s.setFilter('kind', [])
      expect(s.getSnapshot().lists.equipment.filters).toEqual({})
      s.toggleCollapsed('A')
      expect(s.getSnapshot().lists.equipment.collapsed.has('A')).toBe(true)
      s.toggleCollapsed('A')
      expect(s.getSnapshot().lists.equipment.collapsed.has('A')).toBe(false)
    })
  })

  describe('selection', () => {
    it('toggles keys and selects several at once', () => {
      const s = createInventorySession()
      s.toggleSelected('a')
      s.toggleSelected('b')
      s.toggleSelected('a')
      expect([...s.getSnapshot().lists.equipment.selected]).toEqual(['b'])
      s.setSelected(['x', 'y'], true)
      expect(s.getSnapshot().lists.equipment.selected.size).toBe(3)
      s.setSelected(['x', 'b'], false)
      expect([...s.getSnapshot().lists.equipment.selected]).toEqual(['y'])
    })

    it('counts only selected keys that still exist', () => {
      const s = createInventorySession()
      s.setSelected(['a', 'b', 'gone'], true)
      expect(s.selectedIn([key('a'), key('b'), key('c')])).toBe(2)
      expect(s.selectedIn([key('c')])).toBe(0)
      // The set itself is kept: the key may come back after a refetch.
      expect(s.getSnapshot().lists.equipment.selected.has('gone')).toBe(true)
    })

    it('is kept per list', () => {
      const s = createInventorySession()
      s.toggleSelected('a')
      s.setList('ports')
      expect(s.selectedIn([key('a')])).toBe(0)
    })
  })

  describe('the new lists (INV-08 to INV-14)', () => {
    it('keeps a query and a selection per list, the new ones included', () => {
      const s = createInventorySession()
      for (const list of ['racks', 'problems', 'work'] as const) {
        s.setList(list)
        s.setSearch(list)
        s.toggleSelected(`${list}-1`)
      }
      const snap = s.getSnapshot()
      expect(snap.lists.racks.search).toBe('racks')
      expect(snap.lists.problems.search).toBe('problems')
      expect(snap.lists.work.search).toBe('work')
      expect([...snap.lists.racks.selected]).toEqual(['racks-1'])
      expect([...snap.lists.work.selected]).toEqual(['work-1'])
      expect(snap.lists.problems.sort).toEqual({ key: 'problem', dir: 1 })
      expect(snap.lists.work.sort).toEqual({ key: 'n', dir: 1 })
      expect([...snap.hidden.work]).toEqual(['node'])
      expect([...snap.hidden.racks]).toEqual(['fits'])
      expect(snap.lists.equipment.search).toBe('')
    })

    it('does not sort or group by a list-valued field', () => {
      const s = createInventorySession()
      s.sortBy('missing')
      s.setGroup('missing')
      expect(s.getSnapshot().lists.equipment.sort).toEqual({
        key: 'name',
        dir: 1,
      })
      expect(s.getSnapshot().lists.equipment.group).toBeUndefined()
      s.sortBy('used')
      expect(s.getSnapshot().lists.equipment.sort).toEqual({
        key: 'used',
        dir: 1,
      })
    })
  })

  describe('the Work list in Installed', () => {
    it('falls back to Equipment when the context becomes Installed', () => {
      const s = createInventorySession()
      s.setContext('planned')
      s.setList('work')
      s.setSearch('EDGE')
      s.setContext('installed')
      expect(s.getSnapshot().list).toBe('equipment')
      s.setContext('planned')
      expect(s.getSnapshot().list).toBe('equipment')
      s.setList('work')
      expect(s.getSnapshot().lists.work.search).toBe('')
    })

    it('leaves the other lists alone when the context changes', () => {
      const s = createInventorySession()
      s.setList('racks')
      s.setContext('installed')
      expect(s.getSnapshot().list).toBe('racks')
    })

    it('does not show the Work list in Installed', () => {
      const s = createInventorySession()
      s.setContext('installed')
      s.setList('work')
      expect(s.getSnapshot().list).toBe('equipment')
    })
  })

  describe('saved views', () => {
    it('makes a view of the current list, query and hidden columns', () => {
      const s = createInventorySession()
      s.setList('ports')
      s.setSearch('חדר')
      s.setFilter('state', ['faulty'])
      s.sortBy('port')
      s.sortBy('port')
      s.setGroup('equipment')
      s.toggleColumn('ports', 'speed')
      expect(s.viewOf('  Faulty  ')).toEqual({
        name: 'Faulty',
        list: 'ports',
        search: 'חדר',
        filters: { state: ['faulty'] },
        sort: { key: 'port', dir: -1 },
        group: 'equipment',
        hidden: ['site', 'node', 'speed'],
      })
    })

    const view = {
      name: 'Nets',
      list: 'ports' as const,
      search: 'x',
      filters: { net: ['A'], state: ['faulty'] },
      sort: { key: 'port', dir: -1 as const },
      group: 'equipment',
      hidden: ['cable'],
    }

    it('opens a view: list, query, hidden columns, and the header network from its Network pill', () => {
      const s = createInventorySession()
      s.setSearch('old')
      expect(s.openView(view)).toEqual({ ok: true })
      const snap = s.getSnapshot()
      expect(snap.list).toBe('ports')
      expect(snap.lists.ports).toMatchObject({
        search: 'x',
        filters: { net: ['A'], state: ['faulty'] },
        sort: { key: 'port', dir: -1 },
        group: 'equipment',
        page: 1,
      })
      expect(snap.lists.ports.selected.size).toBe(0)
      expect([...snap.hidden.ports]).toEqual(['cable'])
      expect(s.networkOfPill()).toBe('A')
      // The next list shown afresh starts with that network (D37).
      s.setList('cables')
      expect(s.getSnapshot().lists.cables.filters).toEqual({ net: ['A'] })
    })

    it('opens a view with no Network pill with no header network, several as "many"', () => {
      const s = createInventorySession()
      s.setHeaderNetwork('B')
      s.openView({ ...view, filters: {} })
      expect(s.networkOfPill()).toBeUndefined()
      s.setList('cables')
      expect(s.getSnapshot().lists.cables.filters).toEqual({})
      s.openView({ ...view, filters: { net: ['A', 'B'] } })
      expect(s.networkOfPill()).toBe('many')
    })

    it('says to switch to a plan for a view of the Work list in Installed', () => {
      const s = createInventorySession()
      s.setContext('installed')
      const work = {
        ...view,
        list: 'work' as const,
        filters: {},
        sort: { key: 'n', dir: 1 as const },
        group: undefined,
        hidden: [],
      }
      expect(s.openView(work)).toEqual({
        ok: false,
        reason: 'Switch to a plan to open the Work list',
      })
      expect(s.getSnapshot().list).toBe('equipment')
      s.setContext('planned')
      expect(s.openView(work)).toEqual({ ok: true })
      expect(s.getSnapshot().list).toBe('work')
    })
  })
})
