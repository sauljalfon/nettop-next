/**
 * Whether Esc should clear the map highlight: not while the user is typing in an
 * input, select or textarea (or any editable element), where Esc belongs to that
 * control.
 */
export function shouldClearOnEscape(
  target: { tagName?: string; isContentEditable?: boolean } | null,
): boolean {
  if (!target) return true
  if (target.isContentEditable) return false
  return !['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName ?? '')
}
