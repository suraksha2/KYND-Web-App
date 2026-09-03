import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Image, MapPin, CreditCard, Bell, Globe, Shield, Gift, HelpCircle, ChevronRight, X, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useBookings } from '../context/BookingsContext'
import { useLanguage } from '../context/LanguageContext'

function Row({ icon: Icon, label, value, last, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-4 bg-transparent ${last ? '' : 'border-b border-lightstone'} ${onClick ? 'cursor-pointer hover:bg-accent-50/50 transition text-left' : ''}`}
    >
      <Icon className="w-4 h-4 text-warmgrey shrink-0" />
      <span className="flex-1 text-sm font-medium text-charcoal">{label}</span>
      {value && <span className="text-sm text-warmgrey mr-2">{value}</span>}
      <ChevronRight className="w-4 h-4 text-warmgrey/70" />
    </Tag>
  )
}

export default function Account() {
  const { user, isAuthenticated, logout } = useAuth()
  const { bookings } = useBookings()
  const navigate = useNavigate()
  const { language, setLanguage, options, label } = useLanguage()
  const [showLanguage, setShowLanguage] = useState(false)

  const savedAddress = useMemo(() => {
    const latest = bookings[0]?.contact?.address
    if (latest) return latest
    try {
      const lastOrder = JSON.parse(localStorage.getItem('kynd.lastOrder') || 'null')
      return lastOrder?.contact?.address || null
    } catch { return null }
  }, [bookings])

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
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/account')}
          className="flex items-center gap-4 cursor-pointer"
        >
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
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate('/bookings')}
            className="bg-white rounded-2xl ring-1 ring-lightstone p-4 cursor-pointer hover:bg-accent-50/50 transition"
          >
            <div className="text-xs text-warmgrey">Bookings</div>
            <div className="mt-1 text-2xl font-extrabold text-charcoal">{bookings.length}</div>
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => navigate('/account')}
            className="bg-white rounded-2xl ring-1 ring-lightstone p-4 cursor-pointer hover:bg-accent-50/50 transition"
          >
            <div className="text-xs text-warmgrey">Since</div>
            <div className="mt-1 text-2xl font-extrabold text-charcoal">{memberYear}</div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-xs font-bold text-warmgrey uppercase tracking-wide">Saved details</h2>
          <div className="mt-3 bg-white rounded-2xl ring-1 ring-lightstone overflow-hidden">
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate('/account')}
              className="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-accent-50/50 transition"
            >
              <MapPin className="w-4 h-4 text-warmgrey shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-charcoal truncate">{savedAddress || 'No home address saved'}</div>
                <div className="text-xs text-warmgrey">Home address</div>
              </div>
              <ChevronRight className="w-4 h-4 text-warmgrey/70" />
            </div>
            <div className="mx-4 border-t border-lightstone" />
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate('/account')}
              className="flex items-center gap-3 px-4 py-4 cursor-pointer hover:bg-accent-50/50 transition"
            >
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
            {/* <Row icon={Bell} label="Notifications" onClick={() => navigate('/account')} /> */}
            <Row icon={Globe} label="Language" value={label} onClick={() => setShowLanguage(true)} />
            <Row icon={Shield} label="Trust & Safety" onClick={() => navigate('/tnc')} />
            {/* <Row icon={Gift} label="Refer a friend" onClick={() => navigate('/account')} /> */}
            <Row icon={HelpCircle} label="Help & support" onClick={() => navigate('/support')} last />
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="mt-8 w-full text-center text-sm font-semibold text-terracotta hover:text-charcoal transition"
        >
          Log out
        </button>
      </div>

      {showLanguage && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={() => setShowLanguage(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-charcoal">Language</h3>
                <p className="text-xs text-warmgrey mt-0.5">Choose your preferred language.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowLanguage(false)}
                className="text-warmgrey/70 hover:text-charcoal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {options.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => {
                    setLanguage(option.code)
                    setShowLanguage(false)
                  }}
                  className={`w-full flex items-center justify-between rounded-2xl border px-4 py-3 transition ${
                    language === option.code
                      ? 'bg-accent-50 border-terracotta'
                      : 'bg-white border-lightstone hover:border-terracotta/50'
                  }`}
                >
                  <span className="text-sm font-semibold text-charcoal">{option.label}</span>
                  {language === option.code && <Check className="w-4 h-4 text-terracotta" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
