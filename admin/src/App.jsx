import { Routes, Route, Navigate } from 'react-router-dom'
import AdminLayout from './components/AdminLayout'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import Services from './pages/Services'
import Clients from './pages/Clients'
import Providers from './pages/Providers'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/secret-signup" element={<Signup />} />

      <Route element={<AdminLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/services" element={<Services />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/providers" element={<Providers />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
