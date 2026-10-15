import Chip from '../../shared/ui/Chip'
import Name from '../../shared/ui/Name'

/** A network's name beside its colour dot, the same on map cards and in the inspector. */
export default function NetworkBadge({
  name,
  color,
}: {
  name: string
  color: string
}) {
  return (
    <Chip kind="network" color={color} className="network-badge">
      <Name text={name} />
    </Chip>
  )
}
