import {
  setHdfNumbering,
  useHdfNumbering,
  type HdfNumbering,
} from './hdfNumbering'

const CHOICES: readonly [HdfNumbering, string][] = [
  ['pairs', 'Pairs'],
  ['pigtails', 'Pigtails'],
]

/** Pairs | Pigtails: how an HDF jack is numbered, one choice for the whole app. */
export default function NumberingSwitch() {
  const numbering = useHdfNumbering()
  return (
    <div className="seg numbering-switch" role="group" aria-label="Numbers">
      {CHOICES.map(([n, label]) => (
        <button
          key={n}
          type="button"
          aria-pressed={numbering === n}
          className={numbering === n ? 'active' : ''}
          onClick={() => setHdfNumbering(n)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
