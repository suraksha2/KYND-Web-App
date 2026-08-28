import { Navigate, Route, Routes } from 'react-router-dom'
import AdminLayout from './components/AdminLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import Orders from './pages/Orders'
import Services from './pages/Services'
import Pro from './pages/Pro'
import Analytics from './pages/Analytics'
import CityServices from './pages/CityServices'
import ServiceSubcategories from './pages/ServiceSubcategories'
import Settings from './pages/Settings'
import Users from './pages/Users'

export default function App() {
  return (
    <Routes>
      {/* Login lives at /login under the /superadmin basename → /superadmin/login */}
      <Route path="/login" element={<Login />} />
      <Route path="/superadmin" element={<Navigate to="/login" replace />} />

      <Route element={<AdminLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/services" element={<Services />} />
        <Route path="/help-moments" element={<ServiceSubcategories />} />
        <Route path="/pro" element={<Pro />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/city-services" element={<CityServices />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/users" element={<Users />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
