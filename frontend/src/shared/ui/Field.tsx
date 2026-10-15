import { useId, type ReactNode } from 'react'

/**
 * One form field (D33): the label above, the control under it, then a hint or
 * an error. The control is made by `children`, which gets the id to put on it.
 */
export default function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  className?: string
  children: (id: string) => ReactNode
}) {
  const id = useId()
  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <span className="hint">{hint}</span>}
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
