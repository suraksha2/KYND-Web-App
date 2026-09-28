import { useState, useEffect } from 'react'
import { API_BASE } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export function useUnreadMessages() {
  const { token } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!token) return

    const fetchUnreadCount = async () => {
      try {
        const res = await fetch(`${API_BASE}/messages/unread-count`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        })
        const data = await res.json()
        if (res.ok) {
          setUnreadCount(data.count || 0)
        }
      } catch (err) {
        console.error('Failed to fetch unread count:', err)
      }
    }

    fetchUnreadCount()
    
    // Poll every 30 seconds for new messages
    const interval = setInterval(fetchUnreadCount, 30000)
    
    return () => clearInterval(interval)
  }, [token])

  return unreadCount
}
