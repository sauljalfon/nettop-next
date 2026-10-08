/** "1 rack", "3 racks". */
export const plural = (n: number, word: string) =>
  `${n} ${word}${n === 1 ? '' : 's'}`
