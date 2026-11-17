import { useState, useEffect } from 'react'
import { API_BASE } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export function useUnreadMessages() {
  const { token, expireSession } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!token) {
      setUnreadCount(0)
      return
    }

    const controller = new AbortController()
    const fetchUnreadCount = async () => {
      try {
        const res = await fetch(`${API_BASE}/messages/unread-count`, {
          credentials: 'include',
          headers: { 'X-Helpr-Expected-Role': 'user' },
          signal: controller.signal,
        })
        const data = await res.json().catch(() => ({}))
        if (controller.signal.aborted) return
        if (res.status === 401) {
          expireSession()
          return
        }
        if (res.ok) {
          setUnreadCount(data.count || 0)
        }
      } catch (err) {
        if (err.name === 'AbortError') return
        console.error('Failed to fetch unread count:', err)
      }
    }

    fetchUnreadCount()
    
    // Poll every 30 seconds for new messages
    const interval = setInterval(fetchUnreadCount, 30000)
    
    return () => {
      clearInterval(interval)
      controller.abort()
    }
  }, [token, expireSession])

  return unreadCount
}
