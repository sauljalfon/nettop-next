import { describe, expect, it } from 'vitest'
import {
  VIEWS_KEY,
  createSavedViews,
  resolveView,
  type SavedView,
} from './savedViews'

/** INV-14: saved views. */
class MemoryStorage {
  data = new Map<string, string>()
  getItem = (k: string) => this.data.get(k) ?? null
  setItem = (k: string, v: string) => void this.data.set(k, v)
}
const view = (name: string, over: Partial<SavedView> = {}): SavedView => ({
  name,
  list: 'ports',
  search: '',
  filters: {},
  sort: { key: 'equipment', dir: 1 },
  hidden: [],
  ...over,
})
const store = (storage: unknown = new MemoryStorage()) =>
  createSavedViews(() => storage as Storage)

describe('saving and listing', () => {
  it('keeps a view under one key in the storage and reads it back', () => {
    const storage = new MemoryStorage()
    const views = store(storage)
    expect(views.list()).toEqual([])
    const v = view('Faulty ports', {
      search: 'חדר',
      filters: { state: ['faulty'], net: ['A'] },
      sort: { key: 'port', dir: -1 },
      group: 'equipment',
      hidden: ['speed'],
    })
    expect(views.save(v)).toBeUndefined()
    expect([...storage.data.keys()]).toEqual([VIEWS_KEY])
    expect(store(storage).list()).toEqual([v])
  })

  it('replaces a view saved under the same name, keeping its place', () => {
    const views = store()
    views.save(view('One'))
    views.save(view('Two'))
    views.save(view('One', { search: 'new' }))
    expect(views.list().map((v) => [v.name, v.search])).toEqual([
      ['One', 'new'],
      ['Two', ''],
    ])
  })

  it('trims the name and refuses an empty one', () => {
    const views = store()
    expect(views.save(view('   '))).toBe('Name the view')
    views.save(view('  Padded  '))
    expect(views.list()[0].name).toBe('Padded')
    views.save(view('Padded'))
    expect(views.list()).toHaveLength(1)
  })

  it('deletes a view', () => {
    const views = store()
    views.save(view('One'))
    views.save(view('Two'))
    views.remove('One')
    expect(views.list().map((v) => v.name)).toEqual(['Two'])
  })

  it('tells its subscribers, and the list is stable between changes', () => {
    const views = store()
    let calls = 0
    views.subscribe(() => calls++)
    const first = views.list()
    expect(views.list()).toBe(first)
    views.save(view('One'))
    views.remove('One')
    expect(calls).toBe(2)
    expect(views.list()).not.toBe(first)
  })

  it('seeds no examples', () => {
    expect(store().list()).toEqual([])
  })
})

describe('storage that fails', () => {
  const throwing = (where: 'get' | 'set' | 'access') => {
    const storage = new MemoryStorage()
    return {
      get getItem() {
        if (where === 'get') throw new Error('blocked')
        return storage.getItem
      },
      get setItem() {
        if (where === 'set') throw new Error('quota')
        return storage.setItem
      },
    }
  }

  it.each(['get', 'set'] as const)(
    'keeps the views for the session when %s throws',
    (where) => {
      const views = store(throwing(where))
      expect(views.save(view('One'))).toBeUndefined()
      expect(views.list().map((v) => v.name)).toEqual(['One'])
      views.remove('One')
      expect(views.list()).toEqual([])
    },
  )

  it('keeps the views for the session when the storage cannot be reached at all', () => {
    const views = createSavedViews(() => {
      throw new Error('SecurityError')
    })
    views.save(view('One'))
    expect(views.list().map((v) => v.name)).toEqual(['One'])
  })

  it('starts empty from damaged data and drops entries of the wrong shape', () => {
    const storage = new MemoryStorage()
    storage.setItem(VIEWS_KEY, '{not json')
    expect(store(storage).list()).toEqual([])
    storage.setItem(
      VIEWS_KEY,
      JSON.stringify([
        view('Good'),
        { name: 'No list' },
        { ...view('Bad list'), list: 'planets' },
        42,
        { ...view('Bad filters'), filters: { net: 'A' } },
      ]),
    )
    expect(
      store(storage)
        .list()
        .map((v) => v.name),
    ).toEqual(['Good'])
  })
})

describe('opening a view', () => {
  const values: Record<string, string[]> = {
    state: ['available', 'faulty'],
    net: ['A', 'B'],
  }
  const valuesOf = (key: string) => values[key]

  it('keeps everything that still exists', () => {
    const v = view('V', {
      search: 'x',
      filters: { state: ['faulty'], net: ['A', 'B'] },
      sort: { key: 'port', dir: -1 },
      group: 'equipment',
      hidden: ['speed', 'cable'],
    })
    expect(resolveView(v, valuesOf)).toEqual({ view: v, dropped: [] })
  })

  it('drops columns, pill values, pills, a sort and a group that no longer exist', () => {
    const v = view('Old', {
      filters: { state: ['faulty', 'retired'], net: ['Z'], colour: ['red'] },
      sort: { key: 'gone', dir: -1 },
      group: 'gone',
      hidden: ['speed', 'gone'],
    })
    const { view: r, dropped } = resolveView(v, valuesOf)
    expect(r.filters).toEqual({ state: ['faulty'] })
    expect(r.sort).toEqual({ key: 'equipment', dir: 1 })
    expect(r.group).toBeUndefined()
    expect(r.hidden).toEqual(['speed'])
    expect(dropped.length).toBeGreaterThanOrEqual(5)
  })

  it('does not hide the first column, sort or group by a list-valued field', () => {
    const v = view('Odd', {
      list: 'equipment',
      sort: { key: 'missing', dir: 1 },
      group: 'missing',
      hidden: ['name'],
    })
    const { view: r } = resolveView(v, valuesOf)
    expect(r.hidden).toEqual([])
    expect(r.sort).toEqual({ key: 'name', dir: 1 })
    expect(r.group).toBeUndefined()
  })

  it('keeps the empty value of a pill when the list still has it', () => {
    const r = resolveView(view('E', { filters: { net: [''] } }), (k) =>
      k === 'net' ? ['A', ''] : undefined,
    )
    expect(r.view.filters).toEqual({ net: [''] })
  })
})
