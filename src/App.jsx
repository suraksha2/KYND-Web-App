import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from './context/AuthContext'
import { useCart } from './context/CartContext'
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
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import BookingConfirmed from './pages/BookingConfirmed'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Account from './pages/Account'
import Bookings from './pages/Bookings'
import BookingDetail from './pages/BookingDetail'
import SubcategoryDetail from './pages/SubcategoryDetail'

// Sync user ID from AuthContext to CartContext for per-user cart persistence
function AuthCartSync() {
  const { user } = useAuth()
  const { setUserIdFromAuth } = useCart()
  useEffect(() => {
    setUserIdFromAuth(user?.id || null)
  }, [user?.id, setUserIdFromAuth])
  return null
}

export default function App() {
  return (
    <>
      <AuthCartSync />
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
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/booking/confirmed" element={<BookingConfirmed />} />
        <Route path="/account" element={<Account />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/bookings/:id" element={<BookingDetail />} />
        <Route path="/help/:id" element={<SubcategoryDetail />} />
        <Route path="/tnc" element={<TnC />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/cancellation-policy" element={<CancellationPolicy />} />
        <Route path="/credits" element={<Credits />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      </Routes>
    </>
  )
}
