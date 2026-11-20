import { useCallback, useEffect, useRef, useState } from 'react'

export default function useBookingMessages({
  apiBase,
  bookingId,
  isOpen,
  role,
  request = fetch,
  onUnauthorized,
}) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const requestControllerRef = useRef(null)
  const unauthorizedRef = useRef(false)

  const fetchMessages = useCallback(async (signal) => {
    try {
      const response = await request(`${apiBase}/messages/${bookingId}`, {
        credentials: 'include',
        headers: { 'X-Helpr-Expected-Role': role },
        signal,
      })
      const data = await response.json().catch(() => ({}))
      if (signal.aborted) return
      if (response.status === 401) {
        unauthorizedRef.current = true
        onUnauthorized?.()
        setError(data.error || 'Please sign in again to view messages.')
        return false
      }
      if (!response.ok) throw new Error(data.error || 'Failed to load messages')
      setMessages(data.data || [])
      setError('')
      return true
    } catch (err) {
      if (err.name === 'AbortError' || signal.aborted) return
      console.error('Failed to fetch messages:', err)
      setError(err.message || 'Failed to load messages')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [apiBase, bookingId, onUnauthorized, request, role])

  useEffect(() => {
    if (!isOpen || !bookingId) return undefined

    const controller = new AbortController()
    requestControllerRef.current = controller
    unauthorizedRef.current = false
    let timer
    setMessages([])
    setLoading(true)
    setSending(false)
    setError('')

    const poll = async () => {
      if (controller.signal.aborted || unauthorizedRef.current) return
      const canContinue = await fetchMessages(controller.signal)
      if (!controller.signal.aborted && canContinue !== false && !unauthorizedRef.current) {
        timer = setTimeout(poll, 10000)
      }
    }
    poll()

    return () => {
      clearTimeout(timer)
      controller.abort()
      if (requestControllerRef.current === controller) requestControllerRef.current = null
    }
  }, [isOpen, bookingId, fetchMessages])

  const sendMessage = useCallback(async (content) => {
    const message = content.trim()
    const signal = requestControllerRef.current?.signal
    if (!message || sending || !signal || signal.aborted) return

    setSending(true)
    setError('')
    try {
      const response = await request(`${apiBase}/messages/${bookingId}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Helpr-Expected-Role': role,
        },
        body: JSON.stringify({ content: message }),
        signal,
      })
      const data = await response.json().catch(() => ({}))
      if (signal.aborted) return
      if (response.status === 401) {
        unauthorizedRef.current = true
        onUnauthorized?.()
        setError(data.error || 'Please sign in again to send messages.')
        return false
      }
      if (!response.ok) throw new Error(data.error || 'Failed to send message')
      setMessages((current) => [...current, data.data])
      setError('')
      return true
    } catch (err) {
      if (err.name === 'AbortError' || signal.aborted) return
      console.error('Failed to send message:', err)
      setError(err.message || 'Failed to send message')
      return false
    } finally {
      if (!signal.aborted) setSending(false)
    }
  }, [apiBase, bookingId, onUnauthorized, request, role, sending])

  return { messages, loading, sending, error, sendMessage }
}
