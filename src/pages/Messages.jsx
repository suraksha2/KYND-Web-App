import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Clock, ChevronRight, Loader2 } from 'lucide-react'
import { API_BASE, serviceImageUrl } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import PageHero from '../components/PageHero'

const SGT = { timeZone: 'Asia/Singapore' }
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', ...SGT })
const fmtDay = (d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...SGT }).toUpperCase()
const fmtShortDay = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...SGT }).toUpperCase()

export default function Messages() {
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  const handleConversationClick = (bookingDbId) => {
    navigate(`/chat/${bookingDbId}`)
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

  if (loading) {
    return (
      <div>
        <PageHero title="Messages" subtitle="Your conversations with service partners" />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <PageHero title="Messages" subtitle="Your conversations with service partners" />
        <div className="flex items-center justify-center py-20">
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div>
        <PageHero title="Messages" subtitle="Your conversations with service partners" />
        <div className="flex flex-col items-center justify-center py-20 px-6">
          <MessageCircle className="w-16 h-16 text-warmlinen mb-4" />
          <p className="text-charcoal font-medium mb-2">No messages yet</p>
          <p className="text-warmgrey text-sm text-center">
            Start a conversation with a service partner from your bookings
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHero title="Messages" subtitle="Your conversations with service partners" />
      
      <section className="py-6">
        <div className="max-w-2xl mx-auto px-4">
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
                          src={serviceImageUrl(partnerImage)}
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
        </div>
      </section>
    </div>
  )
}
