import { Navigate, useNavigate } from 'react-router-dom'
import { Image, MapPin, CreditCard, Bell, Globe, Shield, Gift, HelpCircle, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useBookings } from '../context/BookingsContext'

function Row({ icon: Icon, label, value, last }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-4 ${last ? '' : 'border-b border-lightstone'}`}>
      <Icon className="w-4 h-4 text-warmgrey shrink-0" />
      <span className="flex-1 text-sm font-medium text-charcoal">{label}</span>
      {value && <span className="text-sm text-warmgrey mr-2">{value}</span>}
      <ChevronRight className="w-4 h-4 text-warmgrey/70" />
    </div>
  )
}

export default function Account() {
  const { user, isAuthenticated, logout } = useAuth()
  const { bookings } = useBookings()
  const navigate = useNavigate()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: '/account' }} />
  }

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
    : '—'

  const memberYear = user?.createdAt
    ? new Date(user.createdAt).getFullYear()
    : '—'

  const handleLogout = () => {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <section className="pt-28 md:pt-32 pb-24">
      <div className="max-w-md mx-auto px-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-lightstone bg-white grid place-items-center text-warmgrey">
            <div className="flex flex-col items-center">
              <Image className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Photo</span>
            </div>
          </div>
          <div>
            <h1 className="font-heading text-2xl font-extrabold text-charcoal">{user?.name}</h1>
            <p className="text-sm text-warmgrey">Member since {memberSince}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl ring-1 ring-lightstone p-4">
            <div className="text-xs text-warmgrey">Bookings</div>
            <div className="mt-1 text-2xl font-extrabold text-charcoal">{bookings.length}</div>
          </div>
          <div className="bg-white rounded-2xl ring-1 ring-lightstone p-4">
            <div className="text-xs text-warmgrey">Since</div>
            <div className="mt-1 text-2xl font-extrabold text-charcoal">{memberYear}</div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-xs font-bold text-warmgrey uppercase tracking-wide">Saved details</h2>
          <div className="mt-3 bg-white rounded-2xl ring-1 ring-lightstone overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-4">
              <MapPin className="w-4 h-4 text-warmgrey shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-charcoal truncate">{user?.address || 'No home address saved'}</div>
                <div className="text-xs text-warmgrey">Home address</div>
              </div>
              <ChevronRight className="w-4 h-4 text-warmgrey/70" />
            </div>
            <div className="mx-4 border-t border-lightstone" />
            <div className="flex items-center gap-3 px-4 py-4">
              <CreditCard className="w-4 h-4 text-warmgrey shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-charcoal truncate">{user?.paymentMethod || 'No payment method saved'}</div>
                <div className="text-xs text-warmgrey">Default payment</div>
              </div>
              <ChevronRight className="w-4 h-4 text-warmgrey/70" />
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-xs font-bold text-warmgrey uppercase tracking-wide">Account</h2>
          <div className="mt-3 bg-white rounded-2xl ring-1 ring-lightstone overflow-hidden">
            <Row icon={Bell} label="Notifications" />
            <Row icon={Globe} label="Language" value="English" />
            <Row icon={Shield} label="Trust & Safety" />
            <Row icon={Gift} label="Refer a friend" />
            <Row icon={HelpCircle} label="Help & support" last />
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="mt-8 w-full text-center text-sm font-semibold text-terracotta hover:text-charcoal transition"
        >
          Log out
        </button>
      </div>
    </section>
  )
}
