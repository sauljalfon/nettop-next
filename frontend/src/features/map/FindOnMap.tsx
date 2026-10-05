import { X } from 'lucide-react'
import { useId, useMemo, useState, useSyncExternalStore } from 'react'
import type { Equipment } from '../../shared/types'
import type { MapSession } from './mapSession'
import { moveActive, searchEquipment } from './search'

const MAX_MATCHES = 8

/**
 * Find equipment on the map by name. Choosing a match selects the card, centers
 * the view on it and sets the found state; typing a new search, the × button
 * and Esc clear that state. It never touches the trace.
 */
export default function FindOnMap({
  equipment,
  session,
  onChoose,
}: {
  equipment: readonly Equipment[]
  session: MapSession
  /** Selects the chosen card in the app. */
  onChoose: (equipmentId: string) => void
}) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const foundId = useSyncExternalStore(session.subscribe, session.foundId)
  const matches = useMemo(
    () => searchEquipment(equipment, query, MAX_MATCHES),
    [equipment, query],
  )
  const choose = (e: Equipment) => {
    session.setFound(e.id)
    session.requestCenter(e.id)
    onChoose(e.id)
    setQuery(e.name)
    setOpen(false)
  }
  const clear = () => {
    session.setFound(undefined)
    setQuery('')
    setActive(0)
    setOpen(false)
  }
  const showList = open && matches.length > 0
  return (
    <div className="map-find" role="search">
      <input
        role="combobox"
        aria-label="Find on map"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        placeholder="Find equipment…"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
          setOpen(true)
          if (foundId) session.setFound(undefined) // a new search clears the find
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
            setActive(
              moveActive(
                active,
                event.key === 'ArrowDown' ? 1 : -1,
                matches.length,
              ),
            )
          } else if (event.key === 'Enter' && showList) {
            event.preventDefault()
            choose(matches[active])
          } else if (event.key === 'Escape') {
            clear()
          }
        }}
      />
      {(foundId || query) && (
        <button
          className="map-find-clear"
          aria-label="Clear find"
          onClick={clear}
        >
          <X size={14} />
        </button>
      )}
      {showList && (
        <ul id={listId} role="listbox" aria-label="Matching equipment">
          {matches.map((e, i) => (
            <li
              key={e.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              // mousedown, so the choice lands before the input loses focus
              onMouseDown={(event) => {
                event.preventDefault()
                choose(e)
              }}
            >
              {e.name}
              <small>{e.role}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
