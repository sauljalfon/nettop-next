import { useState } from 'react'
import Pieces from '../../shared/ui/Pieces'
import { errorMessage } from './editing'
import { groupLines, type ChangeLine, type GoTarget } from './summary'
import './changes.css'

/**
 * The grouped summary of a plan: each line says what changed in names, opens
 * its object when it has one, and (when `onUndo` is given) can be undone.
 */
export default function ChangeList({
  lines,
  onGo,
  onUndo,
  empty,
}: {
  lines: readonly ChangeLine[]
  onGo?: (target: GoTarget) => void
  /** Undo one change by its key; rejects with the server's error. */
  onUndo?: (line: ChangeLine) => Promise<void>
  empty?: string
}) {
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState('')
  if (lines.length === 0)
    return empty ? <span className="hint">{empty}</span> : null
  return (
    <div data-testid="change-summary">
      {groupLines(lines).map(({ group, lines: items }) => (
        <div
          key={group}
          className="change-group"
          data-testid="change-group"
          data-group={group}
        >
          <h3>
            {group}
            <span className="count"> · {items.length}</span>
          </h3>
          {items.map((line) => (
            <div
              key={line.key}
              className="chg-row"
              data-testid="change-line"
              data-key={line.key}
            >
              <span className="what">
                {line.go && onGo ? (
                  <button className="link" onClick={() => onGo(line.go!)}>
                    <Pieces pieces={line.pieces} />
                  </button>
                ) : (
                  <Pieces pieces={line.pieces} />
                )}
              </span>
              {onUndo && (
                <button
                  className="btn quiet"
                  aria-label={`Undo: ${line.text}`}
                  disabled={busy !== undefined}
                  onClick={() => {
                    setBusy(line.key)
                    setError('')
                    onUndo(line)
                      .catch((e) => setError(errorMessage(e)))
                      .finally(() => setBusy(undefined))
                  }}
                >
                  Undo
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
