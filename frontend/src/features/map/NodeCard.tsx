import Chip from '../../shared/ui/Chip'
import Name from '../../shared/ui/Name'
import type { OverviewCardData } from './overviewFlow'
import { OVERVIEW_CARD_HEIGHT } from './overviewLayout'

const TAGS: [keyof OverviewCardData['tags'], string][] = [
  ['access', 'Access'],
  ['aggregation', 'AGG'],
  ['backbone', 'BB'],
  ['passiveOnly', 'Passive only'],
]

/**
 * A node on the overview: its name, how much equipment it holds and the roles
 * in it. The whole closed card is one button; Enter or Space opens it, and an
 * open card lists its equipment by rack. Names stay separate elements (D33).
 */
export default function NodeCard({
  data,
  onToggle,
  onSelect,
}: {
  data: OverviewCardData
  onToggle: (nodeId: string) => void
  onSelect: (equipmentId: string) => void
}) {
  const listId = `overview-list-${data.id}`
  return (
    <article
      className={`overview-card${data.open ? ' open' : ''}${data.proposed ? ' proposed' : ''}${data.dimmed ? ' dimmed' : ''}`}
      data-node-id={data.id}
      data-proposed={data.proposed}
      style={data.open ? undefined : { height: OVERVIEW_CARD_HEIGHT }}
    >
      <button
        type="button"
        className="overview-card-head"
        aria-expanded={data.open}
        aria-controls={data.open ? listId : undefined}
        onClick={() => onToggle(data.id)}
      >
        <strong className="overview-card-name">
          <Name text={data.name} />
        </strong>
        <span className="overview-card-count">
          {data.equipmentCount} equipment
        </span>
        <span className="overview-card-tags">
          {data.proposed && <Chip kind="proposed">Proposed</Chip>}
          {data.equipmentCount > 0 &&
            TAGS.filter(([key]) => data.tags[key]).map(([key, label]) => (
              <Chip key={key} kind="role">
                {label}
              </Chip>
            ))}
        </span>
      </button>
      {data.open && (
        <div className="overview-card-list nodrag nopan nowheel" id={listId}>
          {data.racks.length === 0 && (
            <p className="overview-card-none">No equipment here.</p>
          )}
          {data.racks.map((rack) => (
            <section key={rack.id} className="overview-rack">
              <h4 className="section-title">
                <Name text={rack.name} />
              </h4>
              <ul>
                {rack.equipment.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={`overview-row${data.selectedId === e.id ? ' selected' : ''}`}
                      aria-current={
                        data.selectedId === e.id ? 'true' : undefined
                      }
                      onClick={() => onSelect(e.id)}
                    >
                      <Name text={e.name} />
                      <span className="num">U{e.unit}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </article>
  )
}
