import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Lock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import BookingMessaging from '../components/BookingMessaging'

export default function Chat() {
  const { bookingId } = useParams()
  const navigate = useNavigate()
  const { user, sessionReady } = useAuth()

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-warmlinen/30">
        <Loader2 className="w-8 h-8 animate-spin text-terracotta" />
      </div>
    )
  }

  if (user?.role !== 'user') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-warmlinen/30 px-6 text-center">
        <Lock className="mb-4 h-10 w-10 text-terracotta" />
        <h1 className="mb-2 text-lg font-semibold text-charcoal">Sign in to view this conversation</h1>
        <p className="mb-6 text-sm text-warmgrey">Customer conversations are only available to the signed-in customer.</p>
        <Link to="/login" state={{ from: `/chat/${bookingId}` }} className="rounded-full bg-terracotta px-6 py-3 text-sm font-semibold text-white">
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-warmlinen/30">
      {/* Header */}
      <div className="bg-white border-b border-lightstone sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/messages')}
            className="p-2 -ml-2 rounded-lg text-warmgrey hover:text-charcoal hover:bg-warmlinen transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-semibold text-charcoal">Chat</h1>
            <p className="text-xs text-warmgrey">
              Conversation with your service partner
            </p>
          </div>
        </div>
      </div>

      {/* Chat Content */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        {bookingId ? (
          <BookingMessaging
            bookingDbId={bookingId}
            isOpen={true}
            onClose={() => navigate('/messages')}
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
