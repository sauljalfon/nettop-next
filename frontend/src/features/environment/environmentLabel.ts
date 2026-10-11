export interface EnvironmentLabel {
  text: 'DEV' | 'TEST'
  tone: 'dev' | 'test'
}

/**
 * The header badge for the API's environment: DEV and TEST are labeled, each
 * in its own color; production shows nothing, and so does the time before the
 * answer arrives (or a value this version does not know).
 */
export function environmentLabel(
  environment: string | undefined,
): EnvironmentLabel | undefined {
  if (environment === 'dev') return { text: 'DEV', tone: 'dev' }
  if (environment === 'test') return { text: 'TEST', tone: 'test' }
  return undefined
}
