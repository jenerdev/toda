import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthProvider'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { ReloadPrompt } from './components/ReloadPrompt'
import { ReconnectBanner } from './components/ReconnectBanner'
import { Snackbar } from './components/Snackbar'
import Login from './pages/Login'
import Signup from './pages/Signup'
import CommuterHome from './pages/CommuterHome'
import DriverHome from './pages/DriverHome'
import Admin from './pages/Admin'
import Activity from './pages/Activity'

/** Sends an authed user to the right home based on their role. */
function RoleHome() {
  const { profile } = useAuth()
  if (profile?.role === 'driver') return <Navigate to="/driver" replace />
  return (
    <Layout>
      <CommuterHome />
    </Layout>
  )
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <ReconnectBanner />
      <ReloadPrompt />
      <Snackbar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <RoleHome />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver"
          element={
            <ProtectedRoute role="driver">
              <Layout>
                <DriverHome />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute adminOnly>
              <Layout>
                <Admin />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <Layout>
                <Activity />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
