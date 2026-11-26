/**
 * A user-given name as page text: isolated, so Hebrew never reorders beside
 * digits or English. `dir="auto"` is on the element itself, so when it is the
 * one that cuts the name with an ellipsis (display: block) a Hebrew name loses
 * its end, not its beginning.
 */
export default function Name({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <bdi dir="auto" title={text} className={className}>
      {text}
    </bdi>
  )
}
