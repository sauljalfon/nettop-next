import type { ReactNode } from 'react'

/** The one chip: a network (dot and name), a role, the route, a proposed object, or a state. */
export default function Chip({
  kind,
  color,
  className,
  title,
  testId,
  children,
}: {
  kind: 'network' | 'role' | 'route' | 'proposed' | 'state'
  /** A network's colour; shown only as the dot. */
  color?: string
  className?: string
  title?: string
  testId?: string
  children: ReactNode
}) {
  return (
    <span
      className={`chip ${kind}${className ? ` ${className}` : ''}`}
      title={title}
      data-testid={testId}
    >
      {kind === 'network' && (
        <i className="dot" style={{ background: color }} aria-hidden="true" />
      )}
      {children}
    </span>
  )
}
