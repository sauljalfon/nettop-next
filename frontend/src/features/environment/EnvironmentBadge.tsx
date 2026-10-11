import { useQuery } from '@tanstack/react-query'
import { getHealth } from '../../shared/api'
import { environmentLabel } from './environmentLabel'

/**
 * DEV or TEST in the header, from GET /api/health (fetched once: the
 * environment cannot change while the page is open). Nothing in production or
 * until the answer arrives.
 */
export default function EnvironmentBadge() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => getHealth(signal),
    staleTime: Infinity,
    retry: false,
  })
  const label = environmentLabel(health.data?.environment)
  if (!label) return null
  return (
    <span
      className={`local-label env-${label.tone}`}
      data-testid="environment-badge"
      data-environment={label.tone}
      title={`This is the ${label.tone === 'dev' ? 'development' : 'test'} environment`}
    >
      {label.text}
    </span>
  )
}
