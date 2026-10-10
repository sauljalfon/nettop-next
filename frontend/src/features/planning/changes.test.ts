import { expect, it } from 'vitest'
import type { Plan } from '../../shared/types'
import {
  conflictsTitle,
  draftsOf,
  isAlreadyRecorded,
  isStale,
  lastRecordedBy,
  planOption,
  recordedLine,
  recordedMessage,
  recordedOf,
  rememberRecordedBy,
  reviewState,
  withoutKeys,
} from './changes'
import { createRebaseSession } from './rebaseSession'

const plan = (over: Partial<Plan>): Plan => ({
  id: 'p',
  name: 'Expansion',
  baseRevision: 'r1',
  revision: '3',
  status: 'draft',
  equipment: [],
  subpanels: [],
  endpoints: [],
  links: [],
  ...over,
})

it('RB-03 a draft is stale when its base is not the installed revision; recorded plans never are', () => {
  expect(isStale(plan({}), 'r1')).toBe(false)
  expect(isStale(plan({}), 'r2')).toBe(true)
  expect(isStale(plan({ status: 'recorded' }), 'r2')).toBe(false)
})

it('the plan selector never offers recorded plans and marks stale drafts', () => {
  const plans = [
    plan({ id: 'a' }),
    plan({ id: 'b', status: 'recorded', recordedAt: '2026-10-09T10:00:00Z' }),
    plan({ id: 'c', baseRevision: 'old' }),
  ]
  expect(draftsOf(plans).map((p) => p.id)).toEqual(['a', 'c'])
  expect(planOption(plans[0], 'r1')).toBe('Expansion · revision 3')
  expect(planOption(plans[2], 'r1')).toBe(
    'Expansion · revision 3 · behind Installed',
  )
})

it('recorded plans are listed newest first with who, when and why', () => {
  const older = plan({
    id: 'o',
    status: 'recorded',
    recordedAt: '2026-10-08T09:00:00Z',
    recordedBy: 'Eli',
    recordNote: 'First',
  })
  const newer = plan({
    id: 'n',
    status: 'recorded',
    recordedAt: '2026-10-09T14:25:00Z',
    recordedBy: 'Dana Cohen',
    recordNote: 'Installed EDGE-18',
  })
  expect(recordedOf([older, newer]).map((p) => p.id)).toEqual(['n', 'o'])
  const line = recordedLine(newer, 'en-GB')
  expect(line).toMatch(
    /^Recorded on .*2026.* by Dana Cohen · Installed EDGE-18$/,
  )
})

it('RC-05 the review step enables Record only with a note, a name, no problems, and no request running', () => {
  const ok = {
    note: 'Done',
    recordedBy: 'Dana',
    problems: 0,
    checking: false,
    pending: false,
  }
  expect(reviewState(ok).canRecord).toBe(true)
  expect(reviewState({ ...ok, note: '  ' })).toMatchObject({
    canRecord: false,
    noteError: 'Add a note: what was done.',
  })
  expect(reviewState({ ...ok, note: 'x'.repeat(501) }).noteError).toBe(
    'Keep the note under 500 characters.',
  )
  expect(reviewState({ ...ok, note: 'x'.repeat(500) }).canRecord).toBe(true)
  expect(reviewState({ ...ok, recordedBy: '' })).toMatchObject({
    canRecord: false,
    byError: 'Add who recorded this.',
  })
  expect(reviewState({ ...ok, recordedBy: 'n'.repeat(101) }).byError).toBe(
    'Keep the name under 100 characters.',
  )
  expect(reviewState({ ...ok, problems: 1 }).canRecord).toBe(false)
  expect(reviewState({ ...ok, checking: true }).canRecord).toBe(false)
  expect(reviewState({ ...ok, pending: true }).canRecord).toBe(false)
})

it('RC-09 an "already recorded" 409 is recognized; other conflicts are not', () => {
  expect(
    isAlreadyRecorded(
      409,
      'revision conflict: this plan is recorded and read-only',
    ),
  ).toBe(true)
  expect(
    isAlreadyRecorded(
      409,
      'Installed changed since this draft; update the draft first',
    ),
  ).toBe(false)
  expect(isAlreadyRecorded(422, 'recorded and read-only')).toBe(false)
})

it('the toasts count changes and the other drafts that now need Update draft', () => {
  expect(recordedMessage('Expansion', 3, 2)).toBe(
    'Recorded 3 changes from “Expansion”. Installed is updated; 2 other drafts now need Update draft.',
  )
  expect(recordedMessage('X', 1, 1)).toBe(
    'Recorded 1 change from “X”. Installed is updated; 1 other draft now needs Update draft.',
  )
  expect(recordedMessage('X', 1, 0)).toBe(
    'Recorded 1 change from “X”. Installed is updated.',
  )
  expect(conflictsTitle(1)).toBe(
    '1 change no longer fits the current Installed:',
  )
  expect(conflictsTitle(2)).toBe(
    '2 changes no longer fit the current Installed:',
  )
})

it('RB-04 dropping a change removes it and its dependents from the conflict list', () => {
  const list = [
    { change: 'add_cable:c1', reason: 'taken' },
    { change: 'place_equipment:e1', reason: 'gone' },
  ]
  expect(withoutKeys(list, ['place_equipment:e1', 'x'])).toEqual([list[0]])
})

it('Recorded by is remembered per browser, and storage that throws is ignored', () => {
  const data = new Map<string, string>()
  const store = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  }
  expect(lastRecordedBy(store)).toBe('')
  rememberRecordedBy('  Dana Cohen ', store)
  expect(lastRecordedBy(store)).toBe('Dana Cohen')
  const broken = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  }
  expect(lastRecordedBy(broken)).toBe('')
  expect(() => rememberRecordedBy('x', broken)).not.toThrow()
  expect(lastRecordedBy(undefined)).toBe('')
})

it('RB-03 the rebase session keeps conflicts per draft and tells listeners', () => {
  const s = createRebaseSession()
  let calls = 0
  const off = s.subscribe(() => calls++)
  s.set('p', [{ change: 'add_cable:c', reason: 'taken' }])
  expect(s.conflicts('p')).toHaveLength(1)
  expect(s.conflicts('q')).toBeUndefined()
  s.clear('p')
  s.clear('p')
  expect(s.conflicts('p')).toBeUndefined()
  expect(calls).toBe(2)
  off()
  s.set('p', [])
  expect(calls).toBe(2)
})
