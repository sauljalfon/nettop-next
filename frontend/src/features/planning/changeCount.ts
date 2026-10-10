import type { Plan } from '../../shared/types'

/**
 * How many changes a draft holds, for the Changes badge: container additions,
 * equipment additions, placements (and the legacy `updates` of old plans),
 * removals of every kind, and cable additions. Bridges and endpoints belong to
 * their equipment and are not counted.
 */
export function changeCount(plan: Plan | undefined): number {
  if (!plan) return 0
  const r = plan.removals
  return (
    (plan.sites?.length ?? 0) +
    (plan.nodes?.length ?? 0) +
    (plan.racks?.length ?? 0) +
    plan.equipment.length +
    (plan.placements?.length ?? 0) +
    (plan.updates?.length ?? 0) +
    (r
      ? (r.equipment?.length ?? 0) +
        (r.links?.length ?? 0) +
        (r.racks?.length ?? 0) +
        (r.nodes?.length ?? 0) +
        (r.sites?.length ?? 0)
      : 0) +
    plan.links.filter((l) => l.kind === 'cable').length
  )
}
