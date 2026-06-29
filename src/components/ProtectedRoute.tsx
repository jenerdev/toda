import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthProvider'
import type { Role } from '../types/db'

/**
 * Gate a route on authentication and (optionally) a role.
 * Phase 1: the shell + redirect logic. Role pages fill in over later phases.
 */
export function ProtectedRoute({
  children,
  role,
  adminOnly,
}: {
  children: ReactNode
  role?: Role
  adminOnly?: boolean
}) {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        Loading…
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  // Admin-only routes: non-admins go to their own home.
  if (adminOnly && profile && !profile.is_admin) {
    return <Navigate to={profile.role === 'driver' ? '/driver' : '/'} replace />
  }

  // If we know the role and it doesn't match, send them to their own home.
  if (role && profile && profile.role !== role) {
    return <Navigate to={profile.role === 'driver' ? '/driver' : '/'} replace />
  }

  return <>{children}</>
}
