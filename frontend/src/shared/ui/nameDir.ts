const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/u
const LTR = /[A-Za-zÀ-ɏͰ-֏]/u

/**
 * The direction a name reads in, from its first letter (what `dir="auto"`
 * does), for text that cannot carry `dir="auto"` itself (a pseudo-element's
 * content): an element that cuts the name with an ellipsis must have the
 * name's own direction, or it loses its start instead of its end.
 */
export function nameDir(text: string): 'rtl' | 'ltr' {
  for (const ch of text) {
    if (RTL.test(ch)) return 'rtl'
    if (LTR.test(ch)) return 'ltr'
  }
  return 'ltr'
}
