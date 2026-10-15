import { Fragment } from 'react'
import Name from './Name'

/** The separator between the names of a location; hidden from assistive technology. */
export function PlaceSep({ className }: { className?: string }) {
  return (
    <span
      className={`place-sep${className ? ` ${className}` : ''}`}
      aria-hidden="true"
    >
      {' › '}
    </span>
  )
}

/** A location as separate names joined by ›; never one joined string. */
export default function PlacePath({
  parts,
  className,
}: {
  parts: readonly string[]
  className?: string
}) {
  const shown = parts.filter(Boolean)
  if (shown.length === 0) return null
  return (
    <span className={`place-path${className ? ` ${className}` : ''}`}>
      {shown.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && <PlaceSep />}
          <Name text={part} />
        </Fragment>
      ))}
    </span>
  )
}
