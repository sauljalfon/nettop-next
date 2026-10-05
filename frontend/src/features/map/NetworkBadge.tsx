/** A network's name in its color, the same on map cards and in the inspector. */
export default function NetworkBadge({
  name,
  color,
}: {
  name: string
  color: string
}) {
  return (
    <span
      className="badge network-badge"
      style={{ color, background: `${color}1f` }}
    >
      {name}
    </span>
  )
}
