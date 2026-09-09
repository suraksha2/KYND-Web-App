import { useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Sidebar from './Sidebar'
import Header from './Header'

export default function AdminLayout() {
  const { isAdmin } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!isAdmin) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-warmlinen">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
