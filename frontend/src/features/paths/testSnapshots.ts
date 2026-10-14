// Test-only helpers: small edits of the acceptance snapshot for the walk tests.
import type { Link, Snapshot } from '../../shared/types'
import { acceptanceSnapshot } from '../map/acceptanceFixture'
import { indexSnapshot } from '../map/snapshotIndex'

export function indexOf(edit?: (s: Snapshot) => Snapshot) {
  const s = acceptanceSnapshot()
  return indexSnapshot(edit ? edit(s) : s)
}

export const withoutLink = (id: string) => (s: Snapshot) => ({
  ...s,
  links: s.links.filter((l) => l.id !== id),
})

export const withLinks =
  (...extra: Link[]) =>
  (s: Snapshot) => ({ ...s, links: [...s.links, ...extra] })
