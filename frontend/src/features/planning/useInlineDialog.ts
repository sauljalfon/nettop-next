import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'

/** The attribute that marks the button that opens an inline confirm or form. */
export const OPENER = 'data-opener'

/**
 * Keyboard and focus for one inline confirm or form (answer 19). Mount the
 * dialog only while it is open and spread the result on its container:
 * - it takes focus when it opens (its first field, else the container itself);
 * - Escape closes it, unless something inside (an open list) already used the key;
 * - when it closes, focus returns to the element marked `data-opener={openerKey}`
 *   (the button that opened it, even when the dialog replaced that button).
 */
export function useInlineDialog<T extends HTMLElement>(
  onClose: () => void,
  openerKey: string,
): {
  ref: RefObject<T | null>
  tabIndex: -1
  onKeyDown: (event: KeyboardEvent) => void
} {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const first = el.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    )
    ;(first ?? el).focus()
    return () => {
      // After the commit that removed the dialog, the opener is in the document.
      // (StrictMode's rehearsal unmount leaves the dialog in place: then nothing closed.)
      queueMicrotask(() => {
        if (el.isConnected) return
        document
          .querySelector<HTMLElement>(`[${OPENER}="${CSS.escape(openerKey)}"]`)
          ?.focus()
      })
    }
  }, [openerKey])
  return {
    ref,
    tabIndex: -1,
    onKeyDown: (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    },
  }
}
