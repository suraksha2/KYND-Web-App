import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, MessageCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import BookingMessaging from '../components/BookingMessaging'

export default function Chat() {
  const { bookingId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isProvider = user?.role === 'provider'

  return (
    <div className="min-h-screen bg-warmlinen/30">
      {/* Header */}
      <div className="bg-white border-b border-lightstone sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/support')}
            className="p-2 -ml-2 rounded-lg text-warmgrey hover:text-charcoal hover:bg-warmlinen transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-semibold text-charcoal">Chat</h1>
            <p className="text-xs text-warmgrey">
              Conversation with your {isProvider ? 'customer' : 'service partner'}
            </p>
          </div>
        </div>
      </div>

      {/* Chat Content */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        {bookingId ? (
          <BookingMessaging
            bookingDbId={bookingId}
            isProvider={isProvider}
            isOpen={true}
            onClose={() => navigate('/support')}
            isFullPage={true}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-terracotta mb-4" />
            <p className="text-warmgrey">Loading conversation...</p>
          </div>
        )}
      </div>
    </div>
  )
}
