import { Routes, Route, Navigate, useLocation, useOutletContext } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './context/AuthContext'
import { vendorFetch } from './lib/api'
import AppShell from './components/AppShell'
import Login from './pages/Login'
import Onboarding, { OnboardingReady } from './pages/onboarding/Onboarding'
import Home from './pages/Home'
// Offer inbox is deferred until the multi-vendor stage.
// import Offers from './pages/Offers'
import Jobs from './pages/Jobs'
import JobDetail from './pages/JobDetail'
import Schedule from './pages/Schedule'
import Team from './pages/Team'
import TeamMemberDetail from './pages/TeamMemberDetail'
import Services from './pages/Services'
import Overview from './pages/Overview'
import Forecast from './pages/Forecast'
import Expenses from './pages/Expenses'
import Invoices from './pages/Invoices'
import Payouts from './pages/Payouts'
import ComingSoon from './pages/ComingSoon'

function RequireVendor({ children }) {
  const { isVendor } = useAuth()
  const location = useLocation()
  if (!isVendor) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  return children
}

// The one-time setup gate is driven by the vendor row, not local storage, so
// old vendors (NULL status) retain dashboard access and approvals take effect
// on the next status check without requiring a new login.
function VendorGate({ children }) {
  const { token, logout } = useAuth()
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const data = await vendorFetch('/vendor/onboarding', token)
      setStatus(data.status || 'approved')
    } catch (err) {
      if (err.status === 401) logout()
      else setError(err.message || 'Could not load your account.')
    }
  }, [token, logout])

  useEffect(() => { load() }, [load])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-warmlinen px-4">
        <div className="max-w-md text-center">
          <p className="text-sm text-danger">{error}</p>
          <button type="button" onClick={load} className="mt-4 rounded-xl bg-terracotta px-4 py-2 text-sm font-semibold text-white">Try again</button>
        </div>
      </div>
    )
  }
  if (!status) {
    return <div className="flex min-h-screen items-center justify-center bg-warmlinen"><span className="h-8 w-8 animate-spin rounded-full border-2 border-lightstone border-t-terracotta" /></div>
  }
  if (status === 'pending') {
    return <Onboarding onSubmitted={() => setStatus('submitted')} />
  }
  if (status === 'submitted') {
    return <OnboardingReady onApproved={(next) => setStatus(next || 'approved')} />
  }
  return children
}

// Owner-only pages render inside AppShell's <Outlet>, so they read the same
// `canSeeMoney` flag AppShell already fetched instead of making their own call.
function RequireOwner({ children }) {
  const ctx = useOutletContext()
  if (ctx?.profile && !ctx.profile.canSeeMoney) {
    return <Navigate to="/" replace />
  }
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireVendor>
            <VendorGate>
              <AppShell />
            </VendorGate>
          </RequireVendor>
        }
      >
        <Route index element={<Home />} />
        {/* Offer inbox retained for a later stage:
        <Route path="offers" element={<Offers />} />
        */}
        <Route path="offers" element={<Navigate to="/jobs" replace />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="team" element={<Team />} />
        <Route path="team/:id" element={<TeamMemberDetail />} />
        <Route path="overview" element={<RequireOwner><Overview /></RequireOwner>} />
        <Route path="forecast" element={<RequireOwner><Forecast /></RequireOwner>} />
        <Route path="expenses" element={<RequireOwner><Expenses /></RequireOwner>} />
        <Route path="invoices" element={<RequireOwner><Invoices /></RequireOwner>} />
        <Route path="payouts" element={<RequireOwner><Payouts /></RequireOwner>} />
        <Route path="services" element={<RequireOwner><Services /></RequireOwner>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
