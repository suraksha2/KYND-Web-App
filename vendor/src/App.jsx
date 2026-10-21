import { Routes, Route, Navigate, useLocation, useOutletContext } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import AppShell from './components/AppShell'
import Login from './pages/Login'
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
            <AppShell />
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
