import { useId } from 'react'
import { CONNECTORS, SPEEDS } from '../details/model'
import type { GroupDetails } from './duplicate'

/**
 * A port group's Type select and Connector and Speed inputs, as three siblings
 * for a flex row (the Add form's group rows and Duplicate's). Connector and
 * Speed suggest the usual values and take any text; '' is not set.
 */
export default function PortDetailFields({
  value,
  onChange,
}: {
  value: GroupDetails
  onChange: (patch: Partial<GroupDetails>) => void
}) {
  const id = useId()
  return (
    <>
      <select
        aria-label="Type"
        value={value.portType}
        onChange={(e) =>
          onChange({ portType: e.target.value as GroupDetails['portType'] })
        }
      >
        <option value="">Type</option>
        <option value="copper">copper</option>
        <option value="fiber">fiber</option>
      </select>
      <input
        type="text"
        aria-label="Connector"
        placeholder="Connector"
        list={`${id}-connectors`}
        value={value.connector}
        onChange={(e) => onChange({ connector: e.target.value })}
      />
      <input
        type="text"
        aria-label="Speed"
        placeholder="Speed"
        list={`${id}-speeds`}
        value={value.speed}
        onChange={(e) => onChange({ speed: e.target.value })}
      />
      <datalist id={`${id}-connectors`}>
        {CONNECTORS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id={`${id}-speeds`}>
        {SPEEDS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  )
}
