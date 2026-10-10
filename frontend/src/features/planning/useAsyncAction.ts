import { useCallback, useState } from 'react'
import { errorMessage } from './editing'

/**
 * Pending and error state for one inline form or confirm. `run` resolves to the
 * task's result, or undefined after showing the failure (the server's words).
 */
export function useAsyncAction() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const run = useCallback(async <T>(task: () => Promise<T>) => {
    setPending(true)
    setError('')
    try {
      return await task()
    } catch (e) {
      setError(errorMessage(e))
      return undefined
    } finally {
      setPending(false)
    }
  }, [])
  return {
    pending,
    error,
    run,
    /** Show a refusal found before sending. */
    fail: setError,
    clear: () => setError(''),
  }
}
