const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, '')

/** True when the label contains the query, ignoring case and all spacing ("3C/5" finds "3C / 5"). */
export const labelMatches = (label: string, query: string) =>
  normalize(label).includes(normalize(query))
