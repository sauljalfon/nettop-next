/** Text with each name kept as its own piece, so the UI can isolate names in <bdi>. */
export type TextPiece = { text: string } | { name: string }

/** The pieces read as one plain string (titles, search, export). */
export const piecesText = (pieces: readonly TextPiece[]) =>
  pieces.map((p) => ('name' in p ? p.name : p.text)).join('')

/**
 * The pieces as one string for an <option>, which cannot hold a <bdi>: the text
 * after a name gets a left-to-right mark after its leading separator, so a
 * Hebrew name ending in a digit keeps its place ("ארון 03 · 12U", not "12 · 03 ארוןU").
 */
export const optionText = (pieces: readonly TextPiece[]) =>
  pieces
    .map((p, i) =>
      'name' in p
        ? p.name
        : i > 0 && 'name' in pieces[i - 1]
          ? p.text.replace(/^([\s·(]*)/, '$1‎')
          : p.text,
    )
    .join('')
