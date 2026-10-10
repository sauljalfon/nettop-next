import type { CSSProperties, ReactNode } from 'react'
import { useInlineDialog } from './useInlineDialog'
import './editing.css'

/**
 * The frame of an inline confirm (answer 19): focus moves into it when it
 * opens, Escape cancels, and focus returns to the opener when it goes.
 */
export function ConfirmShell({
  label,
  openerKey,
  onClose,
  children,
  className = '',
  style,
}: {
  label: string
  openerKey: string
  onClose: () => void
  children: ReactNode
  className?: string
  style?: CSSProperties
}) {
  const dialog = useInlineDialog<HTMLDivElement>(onClose, openerKey)
  return (
    <div
      {...dialog}
      className={`inline-confirm ${className}`}
      style={style}
      role="group"
      aria-label={label}
      data-testid="inline-confirm"
    >
      {children}
    </div>
  )
}

/** The server's refusal, in its own words, under the controls that asked. */
export const EditError = ({ message }: { message: string }) =>
  message ? (
    <span className="edit-error" role="alert" data-testid="edit-error">
      {message}
    </span>
  ) : null
