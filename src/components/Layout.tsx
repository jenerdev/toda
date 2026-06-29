import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'
import { SubscriptionBadge } from './SubscriptionBadge'
import { InstallBanner } from './InstallBanner'

/** App chrome: top bar with name, subscription status, admin link, sign-out. */
export function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-brand-dark">MotoQueue</span>
          {profile?.role && (
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs uppercase tracking-wide text-gray-500">
              {profile.role}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {profile && (
            <Link
              to="/history"
              className="text-sm font-medium text-gray-500 underline-offset-2 hover:underline"
            >
              Activity
            </Link>
          )}
          {profile?.is_admin && (
            <Link
              to="/admin"
              className="text-sm font-medium text-brand-dark underline-offset-2 hover:underline"
            >
              Admin
            </Link>
          )}
          {profile && <SubscriptionBadge profile={profile} />}
          {profile && (
            <button
              onClick={signOut}
              className="text-sm text-gray-500 underline-offset-2 hover:underline"
            >
              Sign out
            </button>
          )}
        </div>
      </header>
      <InstallBanner />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
