import React, { useState, useEffect, useRef } from 'react'
import { Send, MessageCircle, X, Loader2 } from 'lucide-react'
import { API_BASE } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import useBookingMessages from '../hooks/useBookingMessages'

export default function BookingMessaging({ bookingId, isProvider = false, bookingDbId, isOpen: externalIsOpen, onClose: externalOnClose, isFullPage = false }) {
  // Use bookingDbId if provided, otherwise use bookingId
  const dbId = bookingDbId || bookingId
  const { user, expireSession } = useAuth()
  const [newMessage, setNewMessage] = useState('')
  // Use external control if provided, otherwise use internal state
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen
  const setIsOpen = externalOnClose !== undefined ? externalOnClose : setInternalIsOpen
  const messagesEndRef = useRef(null)
  const { messages, loading, sending, error, sendMessage: submitMessage } = useBookingMessages({
    apiBase: API_BASE,
    bookingId: dbId,
    isOpen,
    role: isProvider ? 'provider' : 'user',
    onUnauthorized: expireSession,
  })

  useEffect(() => {
    // Scroll to bottom when messages change
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (e) => {
    e.preventDefault()
    if (await submitMessage(newMessage)) setNewMessage('')
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-terracotta hover:bg-accent-600 text-white font-semibold py-3 px-5 text-sm transition-colors"
      >
        <MessageCircle className="w-4 h-4" />
        Message your {isProvider ? 'customer' : 'partner'}
      </button>
    )
  }

  const chatContent = (
    <>
      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px]">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-terracotta" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageCircle className="w-12 h-12 text-warmlinen mb-3" />
            <p className="text-sm text-warmgrey">No messages yet</p>
            <p className="text-xs text-warmgrey mt-1">
              Start the conversation with your {isProvider ? 'customer' : 'partner'}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = isProvider 
              ? msg.sender_type === 'provider' && msg.sender_id === user?.id
              : msg.sender_type === 'customer' && msg.sender_id === user?.id
            
            return (
              <div
                key={msg.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    isOwn
                      ? 'bg-terracotta text-white'
                      : 'bg-warmlinen text-charcoal'
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
        <div ref={messagesEndRef} />
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-700 text-xs">
          {error}
        </div>
      )}

      {/* Input form */}
      {!error.includes('different account type') && (
        <form onSubmit={sendMessage} className="p-4 border-t border-lightstone">
          <div className="flex gap-2">
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
      )}
    </>
  )

  // Full page mode (WhatsApp-style)
  if (isFullPage) {
    return (
      <div className="bg-white rounded-2xl shadow-lg flex flex-col h-[calc(100vh-120px)]">
        {chatContent}
      </div>
    )
  }

  // Modal mode (existing behavior)
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-lightstone">
          <div>
            <h3 className="font-bold text-charcoal">Messages</h3>
            <p className="text-xs text-warmgrey">
              Chat with your {isProvider ? 'customer' : 'service partner'}
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-lg text-warmgrey hover:text-charcoal hover:bg-warmlinen transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {chatContent}
      </div>
    </div>
  )
}