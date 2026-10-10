import type { CopyLine } from './duplicate'

/**
 * The numbered preview of a Duplicate or Copy rack layout: one line per new
 * piece of equipment with ✓, or ⚠ and why it cannot be made (in names).
 */
export default function CopyPreview({
  lines,
  describe,
}: {
  lines: CopyLine[]
  describe: (line: CopyLine) => string
}) {
  if (lines.length === 0) return null
  return (
    <ol className="range-pairs copy-preview" data-testid="copy-preview">
      {lines.map((l) => (
        <li
          key={l.n}
          className={l.problem ? 'blocked' : 'ok'}
          data-blocked={!!l.problem}
        >
          <span aria-hidden="true">{l.problem ? '⚠' : '✓'}</span> {l.n}{' '}
          {describe(l)}
          {l.problem && <em>{l.problem}</em>}
        </li>
      ))}
    </ol>
  )
}
