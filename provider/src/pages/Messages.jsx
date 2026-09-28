import { useState, useEffect } from 'react'
import { MessageCircle, Clock, ChevronRight, Loader2, ArrowLeft, Send, X } from 'lucide-react'
import { useAuth, API_BASE } from '../context/AuthContext'

const SGT = { timeZone: 'Asia/Singapore' }
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', ...SGT })
const fmtDay = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...SGT }).toUpperCase()
const fmtShortDay = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...SGT }).toUpperCase()

export default function Messages() {
  const { token, user } = useAuth()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeChat, setActiveChat] = useState(null)
  const [chatMessages, setChatMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)

  useEffect(() => {
    fetchConversations()
  }, [token])

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_BASE}/messages`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load conversations')
      setConversations(data.data || [])
      setError('')
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
      setError(err.message || 'Failed to load conversations')
    } finally {
      setLoading(false)
    }
  }

  const fetchChatMessages = async (bookingId) => {
    setChatLoading(true)
    try {
      const res = await fetch(`${API_BASE}/messages/${bookingId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load messages')
      setChatMessages(data.data || [])
      setError('')
    } catch (err) {
      console.error('Failed to fetch messages:', err)
      setError(err.message || 'Failed to load messages')
    } finally {
      setChatLoading(false)
    }
  }

  const handleConversationClick = (bookingId) => {
    setActiveChat(bookingId)
    fetchChatMessages(bookingId)
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || sending || !activeChat) return

    setSending(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/messages/${activeChat}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: newMessage.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send message')
      
      setChatMessages(prev => [...prev, data.data])
      setNewMessage('')
      setError('')
    } catch (err) {
      console.error('Failed to send message:', err)
      setError(err.message || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const closeChat = () => {
    setActiveChat(null)
    setChatMessages([])
    setNewMessage('')
    fetchConversations()
  }

  const getServiceName = (items) => {
    if (!items) return 'Service'
    try {
      const parsedItems = typeof items === 'string' ? JSON.parse(items) : items
      if (Array.isArray(parsedItems) && parsedItems.length > 0) {
        return parsedItems.map((item) => item.name || item.serviceName || item.title || 'Service').join(', ')
      }
    } catch (_) {}
    return 'Service'
  }

  const getActiveConversation = () => {
    return conversations.find(conv => conv.booking_id === activeChat)
  }

  // Full screen chat view
  if (activeChat) {
    const activeConv = getActiveConversation()
    const partnerName = activeConv?.customer_name || 'Customer'

    return (
      <div className="fixed inset-0 z-50 bg-warmlinen/30 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-lightstone sticky top-0 z-40">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={closeChat}
              className="p-2 -ml-2 rounded-lg text-warmgrey hover:text-charcoal hover:bg-warmlinen transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="font-semibold text-charcoal">{partnerName}</h1>
              <p className="text-xs text-warmgrey">Conversation with customer</p>
            </div>
          </div>
        </div>

        {/* Messages list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {chatLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-terracotta" />
            </div>
          ) : chatMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageCircle className="w-12 h-12 text-warmlinen mb-3" />
              <p className="text-sm text-warmgrey">No messages yet</p>
              <p className="text-xs text-warmgrey mt-1">
                Start the conversation with your customer
              </p>
            </div>
          ) : (
            chatMessages.map((msg) => {
              const isOwn = msg.sender_type === 'provider' && msg.sender_id === user?.id
              
              return (
                <div
                  key={msg.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                      isOwn
                        ? 'bg-terracotta text-white'
                        : 'bg-white text-charcoal shadow-sm'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${isOwn ? 'text-white/70' : 'text-warmgrey'}`}>
                      {new Date(msg.created_at).toLocaleTimeString('en-SG', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {!msg.read_at && isOwn && ' · Unread'}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="px-4 py-2 bg-red-50 text-red-700 text-xs">
            {error}
          </div>
        )}

        {/* Input form */}
        <form onSubmit={sendMessage} className="bg-white border-t border-lightstone p-4">
          <div className="max-w-2xl mx-auto flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              maxLength={2000}
              disabled={sending}
              className="flex-1 rounded-lg border border-lightstone px-4 py-2.5 text-sm focus:outline-none focus:border-terracotta focus:ring-2 focus:ring-terracotta/25 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!newMessage.trim() || sending}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-terracotta hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 text-sm font-semibold transition-colors"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </form>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-red-600">{error}</p>
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6">
        <MessageCircle className="w-16 h-16 text-warmlinen mb-4" />
        <p className="text-charcoal font-medium mb-2">No messages yet</p>
        <p className="text-warmgrey text-sm text-center">
          Start a conversation with customers from your bookings
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {conversations.map((conv) => {
        const isCustomer = user?.role === 'user'
        const partnerName = isCustomer ? conv.provider_name : conv.customer_name
        const partnerImage = isCustomer ? conv.provider_image : null
        const lastMessageTime = conv.last_message_at 
          ? (new Date(conv.last_message_at).getTime() > Date.now() - 86400000 
            ? fmtTime(conv.last_message_at) 
            : fmtShortDay(conv.last_message_at))
          : null

        return (
          <button
            key={conv.booking_id}
            onClick={() => handleConversationClick(conv.booking_id)}
            className="w-full bg-white rounded-xl p-4 shadow-sm border border-lightstone hover:border-terracotta/30 transition-all text-left"
          >
            <div className="flex items-start gap-3">
              {/* Partner avatar */}
              <div className="w-12 h-12 rounded-full bg-warmlinen flex items-center justify-center flex-shrink-0 overflow-hidden">
                {partnerImage ? (
                  <img
                    src={partnerImage}
                    alt={partnerName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-terracotta font-semibold text-lg">
                    {partnerName?.charAt(0)?.toUpperCase() || '?'}
                  </span>
                )}
              </div>

              {/* Conversation info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-charcoal truncate">
                    {partnerName}
                  </h3>
                  {lastMessageTime && (
                    <span className="text-xs text-warmgrey flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {lastMessageTime}
                    </span>
                  )}
                </div>
                
                <p className="text-sm text-warmgrey truncate mb-2">
                  {getServiceName(conv.items)}
                </p>
                
                {conv.last_message && (
                  <p className="text-sm text-charcoal/70 truncate">
                    {conv.last_message}
                  </p>
                )}
              </div>

              {/* Unread badge and chevron */}
              <div className="flex flex-col items-end gap-2">
                {conv.unread_count > 0 && (
                  <span className="bg-terracotta text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                    {conv.unread_count}
                  </span>
                )}
                <ChevronRight className="w-5 h-5 text-warmgrey" />
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
