/** A user-given name as page text: isolated, so Hebrew never reorders beside digits or English. */
export default function Name({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <bdi title={text} className={className}>
      {text}
    </bdi>
  )
}
