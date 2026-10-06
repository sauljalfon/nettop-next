interface Props {
  message: string
  onRefresh: () => void
  onDismiss: () => void
}

/**
 * A failed trace, shown over the map when no drawer shows it (the Trace and
 * inspector drawers show it themselves). It sits where the results overlay does.
 */
export default function MapTraceError({
  message,
  onRefresh,
  onDismiss,
}: Props) {
  return (
    <section className="map-results map-trace-error" role="alert">
      <span className="inline-error">{message}</span>
      <button className="text-button" onClick={onRefresh}>
        Refresh topology
      </button>
      <button
        className="text-button"
        aria-label="Dismiss trace error"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </section>
  )
}
