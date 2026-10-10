import { expect, it } from 'vitest'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'
import { locationFor } from './goTo'

const index = indexSnapshot(acceptanceSnapshot())

it('RC-04 a line opens the equipment, the endpoint on its page, or the container level it names', () => {
  expect(
    locationFor(index, { kind: 'equipment', equipmentId: 'PANEL-A' }),
  ).toMatchObject({ level: 'equipment', equipmentId: 'PANEL-A' })
  expect(
    locationFor(index, { kind: 'endpoint', endpointId: 'AGG-03:p1' }),
  ).toMatchObject({
    level: 'equipment',
    equipmentId: 'AGG-03',
    endpointId: 'AGG-03:p1',
  })
  expect(
    locationFor(index, {
      kind: 'container',
      siteId: 'site-main',
      nodeId: 'node-a',
      rackId: 'rack-a03',
    }),
  ).toMatchObject({ level: 'rack', rackId: 'rack-a03' })
  expect(
    locationFor(index, {
      kind: 'container',
      siteId: 'site-main',
      nodeId: 'node-a',
    }),
  ).toMatchObject({ level: 'node', nodeId: 'node-a' })
  expect(
    locationFor(index, { kind: 'container', siteId: 'site-dr' }),
  ).toMatchObject({ level: 'site', siteId: 'site-dr' })
})
