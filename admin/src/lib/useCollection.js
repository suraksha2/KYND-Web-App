import { useCallback, useEffect, useState } from 'react'
import { useAuthFetch } from './authFetch'

/**
 * Fetches `${API_BASE}${path}` with the admin token and unwraps `{ data }`.
 * Returns the same shape for every page so the loading/error UI stays uniform.
 */
export function useCollection(path, initial = []) {
  const authFetch = useAuthFetch()
  const [data, setData] = useState(initial)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      setError(null)
      try {
        const response = await authFetch(path, { cache: 'no-store' })
        const json = await response.json()
        if (response.ok) setData(json.data ?? initial)
        else setError(json.error || 'Failed to load data')
      } catch {
        setError('Failed to connect to server')
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [authFetch, path]
  )

  useEffect(() => {
    reload()
  }, [reload])

  return { data, setData, loading, error, reload }
}
