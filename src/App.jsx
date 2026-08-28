import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from './context/AuthContext'
import Launch from './pages/Launch'
import { hasLaunched } from './lib/launch'
// import { useCart } from './context/CartContext'
import MainLayout from './layouts/MainLayout'
import Home from './pages/Home'
import Services from './pages/Services'
import ServiceDetail from './pages/ServiceDetail'
import Cities from './pages/Cities'
import CityDetail from './pages/CityDetail'
import FAQ from './pages/FAQ'
import Support from './pages/Support'
import DeleteAccount from './pages/DeleteAccount'
import { TnC, PrivacyPolicy, CancellationPolicy, Credits } from './pages/Legal'
// import Cart from './pages/Cart'
// import Checkout from './pages/Checkout'
import BookingConfirmed from './pages/BookingConfirmed'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Account from './pages/Account'
import Bookings from './pages/Bookings'
import BookingDetail from './pages/BookingDetail'
import SubcategoryDetail from './pages/SubcategoryDetail'

// Cart feature removed — AuthCartSync no longer required
// function AuthCartSync() { ... }

// Before launch every route renders the landing page. When the countdown hits
// zero the app unlocks and the visitor is dropped on the home page.
function LaunchGate({ children }) {
  const navigate = useNavigate()
  const [launched, setLaunched] = useState(() => hasLaunched())

  useEffect(() => {
    if (launched) return
    const id = setInterval(() => {
      if (!hasLaunched()) return
      clearInterval(id)
      setLaunched(true)
      navigate('/', { replace: true })
    }, 500)
    return () => clearInterval(id)
  }, [launched, navigate])

  return launched ? children : <Launch />
}

export default function App() {
  return (
    <LaunchGate>
      {/* <AuthCartSync /> */}
      <Routes>
        {/* Auth pages without header */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Main app with header */}
        <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/services/:slug" element={<ServiceDetail />} />
        <Route path="/cities" element={<Cities />} />
        <Route path="/cities/:slug" element={<CityDetail />} />
        <Route path="/frequently-asked-questions" element={<FAQ />} />
        <Route path="/support" element={<Support />} />
        <Route path="/delete-account" element={<DeleteAccount />} />
        {/* <Route path="/cart" element={<Cart />} /> */}
        {/* <Route path="/checkout" element={<Checkout />} /> */}
        <Route path="/booking/confirmed" element={<BookingConfirmed />} />
        <Route path="/account" element={<Account />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/bookings/:id" element={<BookingDetail />} />
        <Route path="/help/:slug" element={<SubcategoryDetail />} />
        <Route path="/tnc" element={<TnC />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/cancellation-policy" element={<CancellationPolicy />} />
        <Route path="/credits" element={<Credits />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      </Routes>
    </LaunchGate>
  )
}
