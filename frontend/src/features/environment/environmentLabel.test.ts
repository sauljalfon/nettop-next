import { expect, it } from 'vitest'
import { environmentLabel } from './environmentLabel'

// PR-05: DEV and TEST are labeled, each in its own color; prod and the time
// before the answer arrives show nothing.
it('PR-05 labels dev and test, and nothing for prod, while loading or an unknown value', () => {
  expect(environmentLabel('dev')).toEqual({ text: 'DEV', tone: 'dev' })
  expect(environmentLabel('test')).toEqual({ text: 'TEST', tone: 'test' })
  expect(environmentLabel('prod')).toBeUndefined()
  expect(environmentLabel(undefined)).toBeUndefined()
  expect(environmentLabel('staging')).toBeUndefined()
})
